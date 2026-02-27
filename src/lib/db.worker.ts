import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import schemaSql from '../datasets/schema.sql?raw';
import viewsSql from '../datasets/views.sql?raw';
import { DEFAULT_LOG_LEVEL, normalizeLogLevel, shouldLog, type AppLogLevel } from './logging';

type SqliteRow = Record<string, unknown>;

interface ExecOptions {
    sql: string;
    bind?: unknown[];
    rowMode?: 'object';
    callback?: (row: SqliteRow) => void;
}

interface PreparedStmt {
    bind(values: unknown[]): void;
    step(): void;
    reset(): void;
    finalize(): void;
}

interface DatabaseLike {
    exec(sqlOrOpts: string | ExecOptions): void;
    selectValue(sql: string, bind?: unknown[]): unknown;
    prepare(sql: string): PreparedStmt;
    close(): void;
    pointer: number;
}

interface SqliteApiLike {
    oo1: {
        OpfsDb?: new (path: string) => DatabaseLike;
        DB: new (arg: string | ArrayBuffer) => DatabaseLike;
    };
    capi: {
        sqlite3_js_db_export(pointer: number): Uint8Array;
    };
}

interface ImportReport {
    isValid: boolean;
    headerMatch: boolean;
    missingTables: string[];
    missingColumns: Record<string, string[]>;
    versionInfo: { current: number; backup: number };
    error?: string;
    isDowngrade?: boolean;
}

type HealthSeverity = 'error' | 'warning' | 'info';

interface HealthFinding {
    severity: HealthSeverity;
    code: string;
    title: string;
    details: string;
    recommendation?: string;
}

interface DatabaseHealthReport {
    status: 'ok' | 'warning' | 'error';
    score: number;
    checkedAt: string;
    checksRun: number;
    findings: HealthFinding[];
}

let db: DatabaseLike | null = null;
let sqlite3: SqliteApiLike | null = null;
let initPromise: Promise<boolean> | null = null;
let dbStorageMode: 'opfs' | 'memory' = 'memory';
let dbStorageReason: string | null = null;
let workerLogLevel: AppLogLevel = DEFAULT_LOG_LEVEL;

const log = (...args: unknown[]) => {
    if (shouldLog(workerLogLevel, 'info')) console.info('[DB Worker]', ...args);
};
const debug = (...args: unknown[]) => {
    if (shouldLog(workerLogLevel, 'debug')) console.debug('[DB Worker]', ...args);
};
const warn = (...args: unknown[]) => {
    if (shouldLog(workerLogLevel, 'warn')) console.warn('[DB Worker]', ...args);
};
const error = (...args: unknown[]) => {
    if (shouldLog(workerLogLevel, 'error')) console.error('[DB Worker]', ...args);
};

const CURRENT_SCHEMA_VERSION = 9;

function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function getRowString(row: SqliteRow, key: string): string {
    const val = row[key];
    return typeof val === 'string' ? val : '';
}

function escapeIdentifier(identifier: string): string {
    return identifier.replace(/"/g, '""');
}

function requireDb(): DatabaseLike {
    if (!db) {
        throw new Error('Database not initialized');
    }
    return db;
}

function requireSqlite(): SqliteApiLike {
    if (!sqlite3) {
        throw new Error('SQLite API not initialized');
    }
    return sqlite3;
}

// Reusable schema and migration logic
function applyMigrations(databaseInstance: DatabaseLike) {
    if (!databaseInstance) return;

    let userVersion = databaseInstance.selectValue('PRAGMA user_version') as number;
    log(`Current database schema version: ${userVersion} (Target: ${CURRENT_SCHEMA_VERSION})`);

    if (userVersion >= CURRENT_SCHEMA_VERSION) {
        log('Database is up to date.');
        return;
    }

    // Version 1: Initial core tables
    if (userVersion < 1) {
        log('Migration V1: Initializing infrastructure schema...');
        databaseInstance.exec(schemaSql);
        databaseInstance.exec('PRAGMA user_version = 1');
        userVersion = 1;
    }

    // Version 2: Migration: sys_user_widgets -> visual_builder_config
    if (userVersion < 2) {
        log('Migration V2: Adding visual_builder_config to sys_user_widgets...');
        try {
            const columns: string[] = [];
            databaseInstance.exec({
                sql: "PRAGMA table_info(sys_user_widgets)",
                rowMode: 'object',
                callback: (row: SqliteRow) => columns.push(getRowString(row, 'name'))
            });
            if (columns.length > 0 && !columns.includes('visual_builder_config')) {
                databaseInstance.exec("ALTER TABLE sys_user_widgets ADD COLUMN visual_builder_config TEXT");
            }
        } catch (e) {
            error('Migration failed for V2', e);
        }
        databaseInstance.exec('PRAGMA user_version = 2');
        userVersion = 2;
    }

    // Version 3: Migration: sys_worklist enhancements
    if (userVersion < 3) {
        log('Migration V3: Enhancing sys_worklist...');
        try {
            const columns: string[] = [];
            databaseInstance.exec({
                sql: "PRAGMA table_info(sys_worklist)",
                rowMode: 'object',
                callback: (row: SqliteRow) => columns.push(getRowString(row, 'name'))
            });
            if (columns.length > 0) {
                if (!columns.includes('comment')) {
                    databaseInstance.exec("ALTER TABLE sys_worklist ADD COLUMN comment TEXT");
                }
                if (!columns.includes('updated_at')) {
                    databaseInstance.exec("ALTER TABLE sys_worklist ADD COLUMN updated_at TIMESTAMP");
                    databaseInstance.exec("UPDATE sys_worklist SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL");
                }
            }
        } catch (e) {
            error('Migration failed for V3', e);
        }
        databaseInstance.exec('PRAGMA user_version = 3');
        userVersion = 3;
    }

    // Version 4: Migration: sys_report_packs and sys_dashboards
    if (userVersion < 4) {
        log('Migration V4: Adding sys_report_packs and sys_dashboards...');
        try {
            databaseInstance.exec(`
                CREATE TABLE IF NOT EXISTS sys_report_packs (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    config TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE TABLE IF NOT EXISTS sys_dashboards (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    layout TEXT,
                    is_default INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
        } catch (e) {
            error('Migration failed for V4', e);
        }
        databaseInstance.exec('PRAGMA user_version = 4');
        userVersion = 4;
    }

    // Version 5: Introduction of the versioning system itself
    if (userVersion < 5) {
        log('Migration V5: Finalizing versioning system...');
        try {
            // Apply views as they might depend on new tables
            databaseInstance.exec(viewsSql);
        } catch {
            log('Warning: views.sql execution partially or fully failed');
        }
        databaseInstance.exec('PRAGMA user_version = 5');
        userVersion = 5;
    }

    // Version 6: Migration: Unify sys_worklist statuses
    if (userVersion < 6) {
        log('Migration V6: Unifying sys_worklist statuses...');
        try {
            databaseInstance.exec("UPDATE sys_worklist SET status = 'open' WHERE status = 'pending'");
            databaseInstance.exec("UPDATE sys_worklist SET status = 'closed' WHERE status IN ('error', 'obsolete', 'clarification')");
            databaseInstance.exec("UPDATE sys_worklist SET status = 'done' WHERE status = 'ok'");
            // 'in_progress' and 'done' (if already set) remain unchanged
        } catch (e) {
            error('Migration failed for V6', e);
        }
        databaseInstance.exec('PRAGMA user_version = 6');
        userVersion = 6;
    }

    // Version 7: Migration: Add category to sys_report_packs
    if (userVersion < 7) {
        log('Migration V7: Adding category to sys_report_packs...');
        try {
            const columns: string[] = [];
            databaseInstance.exec({
                sql: "PRAGMA table_info(sys_report_packs)",
                rowMode: 'object',
                callback: (row: SqliteRow) => columns.push(getRowString(row, 'name'))
            });
            if (columns.length > 0 && !columns.includes('category')) {
                databaseInstance.exec("ALTER TABLE sys_report_packs ADD COLUMN category TEXT");
            }
            databaseInstance.exec("UPDATE sys_report_packs SET category = 'General' WHERE category IS NULL OR TRIM(category) = ''");
        } catch (e) {
            error('Migration failed for V7', e);
        }
        databaseInstance.exec('PRAGMA user_version = 7');
        userVersion = 7;
    }

    // Version 8: Migration: Add reusable SQL statements library
    if (userVersion < 8) {
        log('Migration V8: Adding sys_sql_statement...');
        try {
            databaseInstance.exec(`
                CREATE TABLE IF NOT EXISTS sys_sql_statement (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    sql_text TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    scope TEXT NOT NULL DEFAULT 'global',
                    tags TEXT DEFAULT '',
                    is_favorite INTEGER NOT NULL DEFAULT 0,
                    use_count INTEGER NOT NULL DEFAULT 0,
                    last_used_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(name, scope)
                );
                CREATE INDEX IF NOT EXISTS idx_sys_sql_scope_name ON sys_sql_statement(scope, name);
                CREATE INDEX IF NOT EXISTS idx_sys_sql_last_used ON sys_sql_statement(last_used_at DESC);
            `);
        } catch (e) {
            error('Migration failed for V8', e);
        }
        databaseInstance.exec('PRAGMA user_version = 8');
        userVersion = 8;
    }

    // Version 9: Migration: Link widgets to reusable SQL statements
    if (userVersion < 9) {
        log('Migration V9: Adding sql_statement_id to sys_user_widgets...');
        try {
            const columns: string[] = [];
            databaseInstance.exec({
                sql: "PRAGMA table_info(sys_user_widgets)",
                rowMode: 'object',
                callback: (row: SqliteRow) => columns.push(getRowString(row, 'name'))
            });
            if (columns.length > 0 && !columns.includes('sql_statement_id')) {
                databaseInstance.exec("ALTER TABLE sys_user_widgets ADD COLUMN sql_statement_id TEXT");
            }
            databaseInstance.exec("CREATE INDEX IF NOT EXISTS idx_sys_user_widgets_sql_statement ON sys_user_widgets(sql_statement_id)");

            // Best-effort backfill by matching exact SQL text.
            databaseInstance.exec(`
                UPDATE sys_user_widgets
                SET sql_statement_id = (
                    SELECT s.id
                    FROM sys_sql_statement s
                    WHERE TRIM(s.sql_text) = TRIM(sys_user_widgets.sql_query)
                    LIMIT 1
                )
                WHERE (sql_statement_id IS NULL OR TRIM(sql_statement_id) = '')
            `);
        } catch (e) {
            error('Migration failed for V9', e);
        }
        databaseInstance.exec('PRAGMA user_version = 9');
        userVersion = 9;
    }

    // Version 10: Migration: Worklist priority and due date
    if (userVersion < 10) {
        log('Migration V10: Adding priority and due_at to sys_worklist...');
        try {
            const columns: string[] = [];
            databaseInstance.exec({
                sql: "PRAGMA table_info(sys_worklist)",
                rowMode: 'object',
                callback: (row: SqliteRow) => columns.push(getRowString(row, 'name'))
            });
            if (columns.length > 0) {
                if (!columns.includes('priority')) {
                    databaseInstance.exec("ALTER TABLE sys_worklist ADD COLUMN priority TEXT DEFAULT 'normal'");
                }
                if (!columns.includes('due_at')) {
                    databaseInstance.exec("ALTER TABLE sys_worklist ADD COLUMN due_at TIMESTAMP");
                }
                databaseInstance.exec("UPDATE sys_worklist SET priority = 'normal' WHERE priority IS NULL OR TRIM(priority) = ''");
            }
        } catch (e) {
            error('Migration failed for V10', e);
        }
        databaseInstance.exec('PRAGMA user_version = 10');
        userVersion = 10;
    }

    log(`Database migrated to version ${userVersion}`);
}

async function initDB() {
    if (db) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            log('Initializing SQLite...');

            const isRetrying = false;
            const config = {
                print: log,
                printErr: (...args: unknown[]) => {
                    const msg = args.join(' ');
                    if (isRetrying && (msg.includes('OPFS asyncer') || msg.includes('GetSyncHandleError'))) {
                        return;
                    }
                    error(...args);
                },
            };

            sqlite3 = await (sqlite3InitModule as unknown as (cfg: unknown) => Promise<SqliteApiLike>)(config);

            if (sqlite3.oo1.OpfsDb) {
                try {
                    db = new sqlite3.oo1.OpfsDb('/litebistudio.sqlite3');
                    dbStorageMode = 'opfs';
                    dbStorageReason = null;
                    log('Opened OPFS database');
                } catch (e: unknown) {
                    error('OPFS unavailable OR corrupted, falling back to memory', e);
                    // Explicitly ignore "is not a database" errors to allow fallback
                    if (getErrorMessage(e).includes('is not a database')) {
                        log('Database file corrupted on disk. User should restore backup.');
                    }
                    db = new sqlite3.oo1.DB(':memory:');
                    dbStorageMode = 'memory';
                    dbStorageReason = getErrorMessage(e);
                }
            } else {
                log('OPFS not supported, using memory');
                db = new sqlite3.oo1.DB(':memory:');
                dbStorageMode = 'memory';
                dbStorageReason = 'OPFS not supported in this environment.';
            }

            // Apply schema and migrations
            applyMigrations(db);

            return true;
        } catch (e) {
            error('Initialization failed', e);
            initPromise = null;
            throw e;
        }
    })();

    return initPromise;
}

async function loadDemoData(demoContent?: Record<string, unknown>) {
    if (!demoContent) {
        log('No demo data provided for generic loader.');
        return 0;
    }

    try {
        const database = requireDb();
        database.exec('BEGIN TRANSACTION');

        let totalRecords = 0;
        for (const [tableName, records] of Object.entries(demoContent)) {
            if (Array.isArray(records) && records.length > 0) {
                // Determine if table exists
                const tableExists = database.selectValue("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?", [tableName]);
                if (tableExists) {
                    genericBulkInsert(tableName, records as SqliteRow[], false); // false = use existing transaction
                    totalRecords += records.length;
                }
            }
        }

        database.exec('COMMIT');
        log(`Demo data loaded successfully: ${totalRecords} records across multiple tables.`);
        return totalRecords;
    } catch (e) {
        requireDb().exec('ROLLBACK');
        error('Failed to load demo data', e);
        throw e;
    }
}

function genericBulkInsert(tableName: string, records: SqliteRow[], wrapInTransaction: boolean = true) {
    if (records.length === 0) return;
    if (!/^[a-z0-9_]+$/i.test(tableName)) {
        throw new Error(`Invalid table name: ${tableName}`);
    }

    const database = requireDb();
    const tableColumns: string[] = [];
    database.exec({
        sql: `PRAGMA table_info("${tableName}")`,
        rowMode: 'object',
        callback: (row: SqliteRow) => {
            const name = row.name;
            if (typeof name === 'string' && name.length > 0) {
                tableColumns.push(name);
            }
        }
    });

    const keys = Object.keys(records[0]).filter((key) => tableColumns.includes(key));
    if (keys.length === 0) {
        throw new Error(`No matching columns found for table "${tableName}" in import payload.`);
    }

    const placeholders = keys.map(() => '?').join(', ');
    const columns = keys.map(k => `"${k}"`).join(', ');
    const sql = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`;

    if (wrapInTransaction) database.exec('BEGIN TRANSACTION');
    try {
        const stmt = database.prepare(sql);
        try {
            for (const record of records) {
                const values = keys.map(k => {
                    const val = record[k];
                    return val === undefined ? null : val;
                });
                stmt.bind(values);
                stmt.step();
                stmt.reset();
            }
        } finally {
            stmt.finalize();
        }
        if (wrapInTransaction) database.exec('COMMIT');
    } catch (e) {
        if (wrapInTransaction) database.exec('ROLLBACK');
        throw e;
    }
}

async function handleMessage(e: MessageEvent) {
    const { id, type, payload } = e.data;

    try {
        let result;

        switch (type) {
            case 'INIT':
                await initDB();
                result = true;
                break;

            case 'EXEC': {
                if (!db) await initDB();
                const database = requireDb();
                const payloadObj = isRecord(payload) ? payload : {};
                const sql = typeof payloadObj.sql === 'string' ? payloadObj.sql : '';
                const bind = Array.isArray(payloadObj.bind) ? payloadObj.bind : undefined;
                const rows: SqliteRow[] = [];
                database.exec({
                    sql,
                    bind,
                    rowMode: 'object',
                    callback: (row: SqliteRow) => rows.push(row)
                });
                result = rows;
                break;
            }

            case 'SET_LOG_LEVEL': {
                const payloadObj = isRecord(payload) ? payload : {};
                const nextLevel = typeof payloadObj.level === 'string' ? payloadObj.level : null;
                workerLogLevel = normalizeLogLevel(nextLevel);
                debug('Log level updated:', workerLogLevel);
                result = true;
                break;
            }

            case 'GET_DIAGNOSTICS':
                if (!db) await initDB();
                result = getDiagnostics();
                break;

            case 'GET_DATABASE_HEALTH':
                if (!db) await initDB();
                result = getDatabaseHealth();
                break;

            case 'GET_STORAGE_STATUS':
                if (!db) await initDB();
                result = {
                    mode: dbStorageMode,
                    reason: dbStorageReason
                };
                break;

            case 'EXPORT':
                if (!db) await initDB();
                result = requireSqlite().capi.sqlite3_js_db_export(requireDb().pointer);
                break;

            case 'IMPORT': {
                if (!(payload instanceof ArrayBuffer)) {
                    throw new Error('IMPORT payload must be ArrayBuffer');
                }
                result = await importDatabase(payload);
                break;
            }

            case 'CLEAR': {
                if (!db) await initDB();
                const database = requireDb();
                try {
                    database.exec('BEGIN TRANSACTION');
                    // Get all user tables
                    const tables: string[] = [];
                    database.exec({
                        sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'sys_%'",
                        rowMode: 'object',
                        callback: (row: SqliteRow) => tables.push(getRowString(row, 'name'))
                    });
                    for (const t of tables) {
                        database.exec(`DELETE FROM ${t};`);
                    }
                    database.exec('COMMIT');
                    log('Database cleared (all user tables)');
                } catch (err) {
                    database.exec('ROLLBACK');
                    throw err;
                }
                result = true;
                break;
            }

            case 'FACTORY_RESET':
                if (db) {
                    log('Closing database for factory reset...');
                    db.close();
                    db = null;
                }
                if (sqlite3 && sqlite3.oo1.OpfsDb) {
                    try {
                        const root = await navigator.storage.getDirectory();
                        await root.removeEntry('litebistudio.sqlite3');
                        log('OPFS file deleted for factory reset.');
                    } catch (e) {
                        log('No OPFS file to delete or error:', e);
                    }
                }
                initPromise = null; // Reset init promise
                await initDB();
                result = true;
                break;

            case 'CLEAR_TABLE': {
                if (!db) await initDB();
                const database = requireDb();
                const payloadObj = isRecord(payload) ? payload : {};
                const cleanTableName = typeof payloadObj.tableName === 'string' ? payloadObj.tableName : '';
                if (!/^[a-z0-9_]+$/i.test(cleanTableName)) {
                    throw new Error(`Invalid table name: ${cleanTableName}`);
                }
                database.exec(`DELETE FROM ${cleanTableName};`);
                result = true;
                break;
            }

            case 'GENERIC_BULK_INSERT': {
                if (!db) await initDB();
                const payloadObj = isRecord(payload) ? payload : {};
                const tableName = typeof payloadObj.tableName === 'string' ? payloadObj.tableName : '';
                const records = Array.isArray(payloadObj.records) ? payloadObj.records as SqliteRow[] : [];
                genericBulkInsert(tableName, records);
                result = records.length;
                break;
            }

            case 'EXPORT_DEMO_DATA': {
                if (!db) await initDB();
                const database = requireDb();
                const exportData: Record<string, SqliteRow[]> = {};
                const tables: string[] = [];
                database.exec({
                    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
                    rowMode: 'object',
                    callback: (row: SqliteRow) => tables.push(getRowString(row, 'name'))
                });
                for (const t of tables) {
                    const rows: SqliteRow[] = [];
                    database.exec({
                        sql: `SELECT * FROM ${t}`,
                        rowMode: 'object',
                        callback: (row: SqliteRow) => rows.push(row)
                    });
                    exportData[t] = rows;
                }
                result = exportData;
                break;
            }

            case 'LOAD_DEMO': {
                if (!db) await initDB();
                result = await loadDemoData(isRecord(payload) ? payload : undefined);
                break;
            }

            case 'CLOSE':
                if (db) {
                    log('Closing database...');
                    db.close();
                    db = null;
                }
                result = true;
                self.close();
                break;
        }

        self.postMessage({ id, result });
    } catch (error: unknown) {
        self.postMessage({ id, error: getErrorMessage(error) });
    }
}

function getDiagnostics() {
    const database = requireDb();
    const pageCount = database.selectValue('PRAGMA page_count') as number;
    const pageSize = database.selectValue('PRAGMA page_size') as number;
    const dbSize = pageCount * pageSize;

    const tableStats: Record<string, number> = {};
    const tables: string[] = [];
    database.exec({
        sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        rowMode: 'object',
        callback: (row: SqliteRow) => tables.push(getRowString(row, 'name'))
    });

    for (const table of tables) {
        tableStats[table] = Number(database.selectValue(`SELECT count(*) FROM "${table}"`) || 0);
    }

    return {
        dbSize,
        pageCount,
        pageSize,
        tableStats,
        schemaVersion: database.selectValue('PRAGMA user_version') as number,
        storageMode: dbStorageMode,
        storageReason: dbStorageReason
    };
}

function getDatabaseHealth(): DatabaseHealthReport {
    const database = requireDb();
    const findings: HealthFinding[] = [];
    let checksRun = 0;

    const addFinding = (
        severity: HealthSeverity,
        code: string,
        title: string,
        details: string,
        recommendation?: string
    ) => {
        findings.push({ severity, code, title, details, recommendation });
    };

    checksRun += 1;
    try {
        const integrity = String(database.selectValue('PRAGMA integrity_check') ?? '');
        if (integrity.toLowerCase() !== 'ok') {
            addFinding(
                'error',
                'integrity_check_failed',
                'SQLite integrity check failed',
                integrity || 'Unknown integrity check result.',
                'Run backup/export, restore into a fresh database, and investigate file-system issues.'
            );
        } else {
            addFinding('info', 'integrity_check_ok', 'SQLite integrity check passed', 'PRAGMA integrity_check returned OK.');
        }
    } catch (err: unknown) {
        addFinding(
            'error',
            'integrity_check_error',
            'SQLite integrity check could not be executed',
            getErrorMessage(err),
            'Retry diagnostics and verify SQLite worker availability.'
        );
    }

    checksRun += 1;
    try {
        let fkViolations = 0;
        database.exec({
            sql: 'PRAGMA foreign_key_check',
            rowMode: 'object',
            callback: () => {
                fkViolations += 1;
            }
        });
        if (fkViolations > 0) {
            addFinding(
                'warning',
                'foreign_key_violations',
                'Foreign key inconsistencies detected',
                `${fkViolations} violation(s) reported by PRAGMA foreign_key_check.`,
                'Review orphaned child rows and repair or remove inconsistent records.'
            );
        } else {
            addFinding('info', 'foreign_key_ok', 'No foreign key inconsistencies found', 'PRAGMA foreign_key_check returned no rows.');
        }
    } catch (err: unknown) {
        addFinding(
            'warning',
            'foreign_key_check_error',
            'Foreign key check could not be executed',
            getErrorMessage(err),
            'Ensure schema and pragma execution are available in the current SQLite mode.'
        );
    }

    checksRun += 1;
    try {
        const expectedSystemTables = schemaSql
            .split(';')
            .map((stmt) => {
                const match = stmt.match(/CREATE TABLE (?:IF NOT EXISTS )?([a-z0-9_]+)/i);
                return match ? match[1] : null;
            })
            .filter((name): name is string => Boolean(name) && name!.startsWith('sys_'));
        const missingSystemTables = expectedSystemTables.filter((tableName) => {
            const exists = Number(
                database.selectValue(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name = ?",
                    [tableName]
                ) || 0
            );
            return exists === 0;
        });
        if (missingSystemTables.length > 0) {
            addFinding(
                'error',
                'missing_system_tables',
                'Required system tables are missing',
                missingSystemTables.join(', '),
                'Run migration/bootstrap and restore missing infrastructure tables.'
            );
        } else {
            addFinding('info', 'system_tables_ok', 'All required system tables are present', `Checked ${expectedSystemTables.length} table definitions.`);
        }
    } catch (err: unknown) {
        addFinding(
            'warning',
            'system_table_check_error',
            'System table consistency could not be fully checked',
            getErrorMessage(err)
        );
    }

    checksRun += 1;
    try {
        const views: string[] = [];
        database.exec({
            sql: "SELECT name FROM sqlite_master WHERE type='view' AND name NOT LIKE 'sqlite_%'",
            rowMode: 'object',
            callback: (row: SqliteRow) => views.push(getRowString(row, 'name'))
        });
        const invalidViews: string[] = [];
        for (const viewName of views) {
            try {
                database.exec(`SELECT * FROM "${viewName}" LIMIT 1`);
            } catch {
                invalidViews.push(viewName);
            }
        }
        if (invalidViews.length > 0) {
            addFinding(
                'warning',
                'invalid_views',
                'One or more views are invalid',
                invalidViews.join(', '),
                'Recreate or drop broken views and ensure referenced tables/columns exist.'
            );
        } else {
            addFinding('info', 'views_ok', 'All views are valid', `Checked ${views.length} view definition(s).`);
        }
    } catch (err: unknown) {
        addFinding(
            'warning',
            'view_check_error',
            'View validation could not be completed',
            getErrorMessage(err)
        );
    }

    checksRun += 1;
    try {
        const userTables: string[] = [];
        database.exec({
            sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'sys_%'",
            rowMode: 'object',
            callback: (row: SqliteRow) => userTables.push(getRowString(row, 'name'))
        });
        const largeUnindexedTables: string[] = [];
        for (const tableName of userTables) {
            const rowCount = Number(database.selectValue(`SELECT COUNT(*) FROM "${tableName}"`) || 0);
            if (rowCount < 50000) continue;
            const indexCount = Number(
                database.selectValue(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND LOWER(tbl_name) = LOWER(?) AND name NOT LIKE 'sqlite_%'",
                    [tableName]
                ) || 0
            );
            if (indexCount === 0) {
                largeUnindexedTables.push(`${tableName} (${rowCount} rows)`);
            }
        }
        if (largeUnindexedTables.length > 0) {
            addFinding(
                'warning',
                'large_unindexed_tables',
                'Large tables without custom indexes detected',
                largeUnindexedTables.join(', '),
                'Create indexes for frequently filtered/joined columns in these tables.'
            );
        } else {
            addFinding('info', 'index_coverage_ok', 'No large unindexed user tables detected', 'Threshold: 50,000 rows.');
        }
    } catch (err: unknown) {
        addFinding(
            'warning',
            'index_coverage_check_error',
            'Index coverage check could not be completed',
            getErrorMessage(err)
        );
    }

    checksRun += 1;
    try {
        const userTables: string[] = [];
        database.exec({
            sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'sys_%'",
            rowMode: 'object',
            callback: (row: SqliteRow) => userTables.push(getRowString(row, 'name'))
        });

        const nonNullViolations: string[] = [];
        const highNullRatioColumns: string[] = [];

        for (const tableName of userTables) {
            const safeTable = escapeIdentifier(tableName);
            const rowCount = Number(database.selectValue(`SELECT COUNT(*) FROM "${safeTable}"`) || 0);
            if (rowCount === 0) continue;

            const columns: Array<{ name: string; notnull: number; pk: number }> = [];
            database.exec({
                sql: `PRAGMA table_info("${safeTable}")`,
                rowMode: 'object',
                callback: (row: SqliteRow) => {
                    const name = getRowString(row, 'name');
                    if (!name) return;
                    columns.push({
                        name,
                        notnull: Number(row.notnull || 0),
                        pk: Number(row.pk || 0)
                    });
                }
            });

            for (const column of columns) {
                const safeColumn = escapeIdentifier(column.name);
                const nullCount = Number(
                    database.selectValue(`SELECT COUNT(*) FROM "${safeTable}" WHERE "${safeColumn}" IS NULL`) || 0
                );

                if (column.notnull === 1 && nullCount > 0) {
                    nonNullViolations.push(`${tableName}.${column.name}: ${nullCount}`);
                }

                if (column.pk === 0) {
                    const nullRatio = nullCount / rowCount;
                    if (nullRatio >= 0.7 && nullCount >= 100) {
                        highNullRatioColumns.push(`${tableName}.${column.name}: ${(nullRatio * 100).toFixed(1)}%`);
                    }
                }
            }
        }

        if (nonNullViolations.length > 0) {
            addFinding(
                'error',
                'not_null_violations',
                'NOT NULL violations detected',
                nonNullViolations.slice(0, 10).join(', ') + (nonNullViolations.length > 10 ? ' ...' : ''),
                'Repair imported rows or adjust mappings to ensure mandatory fields are always populated.'
            );
        } else {
            addFinding('info', 'not_null_ok', 'No NOT NULL violations detected', 'All checked user tables satisfy mandatory field constraints.');
        }

        if (highNullRatioColumns.length > 0) {
            addFinding(
                'warning',
                'high_null_ratio_columns',
                'Columns with high NULL ratio detected',
                highNullRatioColumns.slice(0, 10).join(', ') + (highNullRatioColumns.length > 10 ? ' ...' : ''),
                'Review data quality and import mappings for these columns.'
            );
        }
    } catch (err: unknown) {
        addFinding(
            'warning',
            'null_quality_check_error',
            'NULL quality checks could not be completed',
            getErrorMessage(err)
        );
    }

    checksRun += 1;
    try {
        const userTables: string[] = [];
        database.exec({
            sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'sys_%'",
            rowMode: 'object',
            callback: (row: SqliteRow) => userTables.push(getRowString(row, 'name'))
        });

        const duplicateCandidates: string[] = [];

        for (const tableName of userTables) {
            const safeTable = escapeIdentifier(tableName);
            const columns: Array<{ name: string; pk: number }> = [];
            database.exec({
                sql: `PRAGMA table_info("${safeTable}")`,
                rowMode: 'object',
                callback: (row: SqliteRow) => {
                    const name = getRowString(row, 'name');
                    if (!name) return;
                    columns.push({
                        name,
                        pk: Number(row.pk || 0)
                    });
                }
            });

            const keyCandidates = columns
                .filter((column) => {
                    const lower = column.name.toLowerCase();
                    return column.pk > 0 || lower === 'id' || lower.endsWith('_id') || lower.endsWith('_key');
                })
                .slice(0, 3);

            for (const candidate of keyCandidates) {
                const safeColumn = escapeIdentifier(candidate.name);
                const duplicateCount = Number(
                    database.selectValue(
                        `SELECT COUNT(*) FROM (
                            SELECT "${safeColumn}" AS v
                            FROM "${safeTable}"
                            WHERE "${safeColumn}" IS NOT NULL
                            GROUP BY "${safeColumn}"
                            HAVING COUNT(*) > 1
                        )`
                    ) || 0
                );
                if (duplicateCount > 0) {
                    duplicateCandidates.push(`${tableName}.${candidate.name}: ${duplicateCount}`);
                }
            }
        }

        if (duplicateCandidates.length > 0) {
            addFinding(
                'warning',
                'duplicate_key_candidates',
                'Possible duplicate keys detected',
                duplicateCandidates.slice(0, 10).join(', ') + (duplicateCandidates.length > 10 ? ' ...' : ''),
                'Verify key semantics and add UNIQUE indexes where duplicates are not allowed.'
            );
        } else {
            addFinding('info', 'duplicate_candidates_ok', 'No duplicate key candidates found', 'Checked common key-like columns in user tables.');
        }
    } catch (err: unknown) {
        addFinding(
            'warning',
            'duplicate_check_error',
            'Duplicate candidate checks could not be completed',
            getErrorMessage(err)
        );
    }

    checksRun += 1;
    try {
        const userTables: string[] = [];
        database.exec({
            sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'sys_%'",
            rowMode: 'object',
            callback: (row: SqliteRow) => userTables.push(getRowString(row, 'name'))
        });

        const fullScanRisks: string[] = [];
        for (const tableName of userTables) {
            const safeTable = escapeIdentifier(tableName);
            const rowCount = Number(database.selectValue(`SELECT COUNT(*) FROM "${safeTable}"`) || 0);
            if (rowCount < 50000) continue;

            const columns: Array<{ name: string; pk: number }> = [];
            database.exec({
                sql: `PRAGMA table_info("${safeTable}")`,
                rowMode: 'object',
                callback: (row: SqliteRow) => {
                    const name = getRowString(row, 'name');
                    if (!name) return;
                    columns.push({
                        name,
                        pk: Number(row.pk || 0)
                    });
                }
            });
            const candidate = columns.find((column) => column.pk > 0) || columns[0];
            if (!candidate) continue;
            const safeColumn = escapeIdentifier(candidate.name);

            const planDetails: string[] = [];
            database.exec({
                sql: `EXPLAIN QUERY PLAN SELECT * FROM "${safeTable}" WHERE "${safeColumn}" = ? LIMIT 1`,
                bind: [0],
                rowMode: 'object',
                callback: (row: SqliteRow) => {
                    planDetails.push(getRowString(row, 'detail').toUpperCase());
                }
            });

            if (planDetails.some((detail) => detail.includes('SCAN'))) {
                fullScanRisks.push(`${tableName} (column: ${candidate.name})`);
            }
        }

        if (fullScanRisks.length > 0) {
            addFinding(
                'warning',
                'query_plan_full_scan_risk',
                'EXPLAIN detected full-scan risks on large tables',
                fullScanRisks.join(', '),
                'Add indexes for frequently queried columns and validate plans in the inspector with EXPLAIN.'
            );
        } else {
            addFinding('info', 'query_plan_ok', 'No EXPLAIN full-scan risks detected for sampled key lookups', 'Checked large user tables with representative key filters.');
        }
    } catch (err: unknown) {
        addFinding(
            'warning',
            'query_plan_check_error',
            'EXPLAIN-based performance checks could not be completed',
            getErrorMessage(err)
        );
    }

    const errorCount = findings.filter((finding) => finding.severity === 'error').length;
    const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
    const infoCount = findings.filter((finding) => finding.severity === 'info').length;
    const score = Math.max(0, 100 - (errorCount * 25) - (warningCount * 10) - (infoCount * 1));

    return {
        status: errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'ok',
        score,
        checkedAt: new Date().toISOString(),
        checksRun,
        findings
    };
}

async function importDatabase(buffer: ArrayBuffer): Promise<ImportReport> {
    let tempDb: DatabaseLike | null = null;
    const report: ImportReport = {
        isValid: false,
        headerMatch: false,
        missingTables: [],
        missingColumns: {},
        versionInfo: { current: 1, backup: 0 }
    };

    try {
        if (!sqlite3) {
            await initDB();
        }
        const sqliteApi = requireSqlite();
        // 1. Basic SQLite Validation
        const header = new Uint8Array(buffer.slice(0, 16));
        const headerString = new TextDecoder().decode(header);
        if (headerString.startsWith('SQLite format 3')) {
            report.headerMatch = true;
        } else {
            throw new Error('Invalid SQLite header');
        }

        // 2. Schema Validation using temporary memory DB
        // We use a fresh module initialization if needed, but since we already have sqlite3, 
        // we can just open the buffer as a DB.
        try {
            tempDb = new sqliteApi.oo1.DB(buffer);
        } catch (e: unknown) {
            error('Temporary DB open failed', e);
            report.error = "Memory DB allocation failed or buffer malformed: " + getErrorMessage(e);
            return report;
        }

        // Read user_version from the backup
        const backupVersion = tempDb.selectValue('PRAGMA user_version') as number || 0;
        report.versionInfo = {
            current: CURRENT_SCHEMA_VERSION,
            backup: backupVersion
        };

        // Extract expected tables from schemaSql
        const expectedTables = schemaSql
            .split(';')
            .map(stmt => {
                const match = stmt.match(/CREATE TABLE (?:IF NOT EXISTS )?([a-z0_9_]+)/i);
                return match ? match[1] : null;
            })
            .filter(Boolean) as string[];

        for (const tableName of expectedTables) {
            const tableExists = tempDb.selectValue("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?", [tableName]);
            if (!tableExists) {
                report.missingTables.push(tableName);
                continue;
            }

            // Check columns
            const actualCols: string[] = [];
            tempDb.exec({
                sql: `PRAGMA table_info("${tableName}")`,
                rowMode: 'object',
                callback: (row: SqliteRow) => actualCols.push(getRowString(row, 'name'))
            });

            if (db) {
                const database = requireDb();
                const targetCols: string[] = [];
                database.exec({
                    sql: `PRAGMA table_info("${tableName}")`,
                    rowMode: 'object',
                    callback: (row: SqliteRow) => targetCols.push(getRowString(row, 'name'))
                });

                const missing = targetCols.filter(c => !actualCols.includes(c));
                if (missing.length > 0) {
                    report.missingColumns[tableName] = missing;
                }
            }
        }

        // Downgrade protection: Prevent importing newer backups into older apps
        if (backupVersion > CURRENT_SCHEMA_VERSION) {
            report.isValid = false;
            report.isDowngrade = true;
            report.error = `The backup (V${backupVersion}) is newer than this application (V${CURRENT_SCHEMA_VERSION}). Please update the application first.`;
        } else {
            // We allow missing tables because applyMigrations will create them for older backups
            // We just ensure it's a valid SQLite DB (which the header check passed).
            report.isValid = true;
        }

        // 3. Finalize Import (write to OPFS)
                if (sqliteApi.oo1.OpfsDb) {
            if (db) {
                db.close();
                db = null;
            }
            const root = await navigator.storage.getDirectory();
            try {
                await root.removeEntry('litebistudio.sqlite3');
            } catch {
                warn('No OPFS file to delete or unable to remove existing file before import.');
            }

            const fileHandle = await root.getFileHandle('litebistudio.sqlite3', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(buffer);
            await writable.close();

            // Re-open the main database instance for subsequent queries
            db = new sqliteApi.oo1.OpfsDb('/litebistudio.sqlite3');

            // Critical: Apply migrations to the newly restored database
            // This ensures older backups get new tables like sys_dashboards
            applyMigrations(db);

            log('Database imported and validated');
        }

        return report;
    } catch (e: unknown) {
        error('Import failed', e);
        report.error = getErrorMessage(e);
        return report;
    } finally {
        if (tempDb) tempDb.close();
    }
}

self.onmessage = handleMessage;
