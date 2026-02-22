import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import schemaSql from '../datasets/schema.sql?raw';
import viewsSql from '../datasets/views.sql?raw';

let db: any = null;
let sqlite3: any = null;
let initPromise: Promise<any> | null = null;

const log = (...args: any[]) => console.log('[DB Worker]', ...args);
const error = (...args: any[]) => console.error('[DB Worker]', ...args);

const CURRENT_SCHEMA_VERSION = 6;

// Reusable schema and migration logic
function applyMigrations(databaseInstance: any) {
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
            const columns: any[] = [];
            databaseInstance.exec({
                sql: "PRAGMA table_info(sys_user_widgets)",
                rowMode: 'object',
                callback: (row: any) => columns.push(row.name)
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
            const columns: any[] = [];
            databaseInstance.exec({
                sql: "PRAGMA table_info(sys_worklist)",
                rowMode: 'object',
                callback: (row: any) => columns.push(row.name)
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
        } catch (e) {
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

    log(`Database migrated to version ${userVersion}`);
}

async function initDB() {
    if (db) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            log('Initializing SQLite...');

            let isRetrying = false;
            const config = {
                print: log,
                printErr: (...args: any[]) => {
                    const msg = args.join(' ');
                    if (isRetrying && (msg.includes('OPFS asyncer') || msg.includes('GetSyncHandleError'))) {
                        return;
                    }
                    error(...args);
                },
            };

            sqlite3 = await (sqlite3InitModule as any)(config);

            if (sqlite3.oo1.OpfsDb) {
                try {
                    db = new sqlite3.oo1.OpfsDb('/litebistudio.sqlite3');
                    log('Opened OPFS database');
                } catch (e: any) {
                    error('OPFS unavailable OR corrupted, falling back to memory', e);
                    // Explicitly ignore "is not a database" errors to allow fallback
                    if (e.message?.includes('is not a database')) {
                        log('Database file corrupted on disk. User should restore backup.');
                    }
                    db = new sqlite3.oo1.DB(':memory:');
                }
            } else {
                log('OPFS not supported, using memory');
                db = new sqlite3.oo1.DB(':memory:');
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

async function loadDemoData(demoContent?: any) {
    if (!demoContent) {
        log('No demo data provided for generic loader.');
        return 0;
    }

    try {
        db.exec('BEGIN TRANSACTION');

        let totalRecords = 0;
        for (const [tableName, records] of Object.entries(demoContent)) {
            if (Array.isArray(records) && records.length > 0) {
                // Determine if table exists
                const tableExists = db.selectValue("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?", [tableName]);
                if (tableExists) {
                    genericBulkInsert(tableName, records, false); // false = use existing transaction
                    totalRecords += records.length;
                }
            }
        }

        db.exec('COMMIT');
        log(`Demo data loaded successfully: ${totalRecords} records across multiple tables.`);
        return totalRecords;
    } catch (e) {
        db.exec('ROLLBACK');
        error('Failed to load demo data', e);
        throw e;
    }
}

function genericBulkInsert(tableName: string, records: any[], wrapInTransaction: boolean = true) {
    if (records.length === 0) return;
    if (!/^[a-z0-9_]+$/i.test(tableName)) {
        throw new Error(`Invalid table name: ${tableName}`);
    }

    const keys = Object.keys(records[0]);
    const placeholders = keys.map(() => '?').join(', ');
    const columns = keys.map(k => `"${k}"`).join(', ');
    const sql = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`;

    if (wrapInTransaction) db.exec('BEGIN TRANSACTION');
    try {
        const stmt = db.prepare(sql);
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
        if (wrapInTransaction) db.exec('COMMIT');
    } catch (e) {
        if (wrapInTransaction) db.exec('ROLLBACK');
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

            case 'EXEC':
                if (!db) await initDB();
                const rows: any[] = [];
                db.exec({
                    sql: payload.sql,
                    bind: payload.bind,
                    rowMode: 'object',
                    callback: (row: any) => rows.push(row)
                });
                result = rows;
                break;

            case 'GET_DIAGNOSTICS':
                if (!db) await initDB();
                result = getDiagnostics();
                break;

            case 'EXPORT':
                if (!db) await initDB();
                result = sqlite3.capi.sqlite3_js_db_export(db.pointer);
                break;

            case 'IMPORT':
                result = await importDatabase(payload);
                break;

            case 'CLEAR':
                if (!db) await initDB();
                try {
                    db.exec('BEGIN TRANSACTION');
                    // Get all user tables
                    const tables: any[] = [];
                    db.exec({
                        sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'sys_%'",
                        rowMode: 'object',
                        callback: (row: any) => tables.push(row.name)
                    });
                    for (const t of tables) {
                        db.exec(`DELETE FROM ${t};`);
                    }
                    db.exec('COMMIT');
                    log('Database cleared (all user tables)');
                } catch (err) {
                    db.exec('ROLLBACK');
                    throw err;
                }
                result = true;
                break;

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

            case 'CLEAR_TABLE':
                if (!db) await initDB();
                const cleanTableName = payload.tableName;
                if (!/^[a-z0-9_]+$/i.test(cleanTableName)) {
                    throw new Error(`Invalid table name: ${cleanTableName}`);
                }
                db.exec(`DELETE FROM ${cleanTableName};`);
                result = true;
                break;

            case 'GENERIC_BULK_INSERT':
                if (!db) await initDB();
                genericBulkInsert(payload.tableName, payload.records);
                result = payload.records.length;
                break;

            case 'EXPORT_DEMO_DATA':
                if (!db) await initDB();
                const exportData: any = {};
                const tables: any[] = [];
                db.exec({
                    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
                    rowMode: 'object',
                    callback: (row: any) => tables.push(row.name)
                });
                for (const t of tables) {
                    const rows: any[] = [];
                    db.exec({
                        sql: `SELECT * FROM ${t}`,
                        rowMode: 'object',
                        callback: (row: any) => rows.push(row)
                    });
                    exportData[t] = rows;
                }
                result = exportData;
                break;

            case 'LOAD_DEMO':
                if (!db) await initDB();
                result = await loadDemoData(payload);
                break;

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
    } catch (error: any) {
        self.postMessage({ id, error: error.message });
    }
}

function getDiagnostics() {
    const pageCount = db.selectValue('PRAGMA page_count') as number;
    const pageSize = db.selectValue('PRAGMA page_size') as number;
    const dbSize = pageCount * pageSize;

    const tableStats: Record<string, number> = {};
    const tables: any[] = [];
    db.exec({
        sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        rowMode: 'object',
        callback: (row: any) => tables.push(row.name)
    });

    for (const table of tables) {
        tableStats[table] = db.selectValue(`SELECT count(*) FROM "${table}"`);
    }

    return {
        dbSize,
        pageCount,
        pageSize,
        tableStats,
        schemaVersion: db.selectValue('PRAGMA user_version') as number
    };
}

async function importDatabase(buffer: ArrayBuffer) {
    let tempDb: any = null;
    const report: any = {
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
            tempDb = new sqlite3.oo1.DB(buffer);
        } catch (e: any) {
            error('Temporary DB open failed', e);
            report.error = "Memory DB allocation failed or buffer malformed: " + e.message;
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
                callback: (row: any) => actualCols.push(row.name)
            });

            if (db) {
                const targetCols: string[] = [];
                db.exec({
                    sql: `PRAGMA table_info("${tableName}")`,
                    rowMode: 'object',
                    callback: (row: any) => targetCols.push(row.name)
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
        if (sqlite3.oo1.OpfsDb) {
            if (db) {
                db.close();
                db = null;
            }
            const root = await navigator.storage.getDirectory();
            try {
                await root.removeEntry('litebistudio.sqlite3');
            } catch (e) { /* ignore */ }

            const fileHandle = await root.getFileHandle('litebistudio.sqlite3', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(buffer);
            await writable.close();

            // Re-open the main database instance for subsequent queries
            db = new sqlite3.oo1.OpfsDb('/litebistudio.sqlite3');

            // Critical: Apply migrations to the newly restored database
            // This ensures older backups get new tables like sys_dashboards
            applyMigrations(db);

            log('Database imported and validated');
        }

        return report;
    } catch (e: any) {
        error('Import failed', e);
        report.error = e.message;
        return report;
    } finally {
        if (tempDb) tempDb.close();
    }
}

self.onmessage = handleMessage;
