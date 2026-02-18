import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import schemaSql from '../datasets/schema.sql?raw';
import viewsSql from '../datasets/views.sql?raw';

let db: any = null;
let sqlite3: any = null;
let initPromise: Promise<void> | null = null;

const log = (...args: any[]) => console.log('[DB Worker]', ...args);
const error = (...args: any[]) => console.error('[DB Worker]', ...args);

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
                } catch (e) {
                    error('OPFS unavailable, falling back to memory', e);
                    db = new sqlite3.oo1.DB(':memory:');
                }
            } else {
                log('OPFS not supported, using memory');
                db = new sqlite3.oo1.DB(':memory:');
            }

            // Initialize infrastructure schema
            db.exec(schemaSql);

            // Migration: sys_user_widgets -> visual_builder_config
            try {
                const columns: any[] = [];
                db.exec({
                    sql: "PRAGMA table_info(sys_user_widgets)",
                    rowMode: 'object',
                    callback: (row: any) => columns.push(row.name)
                });
                if (columns.length > 0 && !columns.includes('visual_builder_config')) {
                    db.exec("ALTER TABLE sys_user_widgets ADD COLUMN visual_builder_config TEXT");
                    log('Migrated sys_user_widgets: Added visual_builder_config');
                }
            } catch (e) {
                error('Migration failed for sys_user_widgets', e);
            }

            // Migration: sys_worklist enhancements
            try {
                const columns: any[] = [];
                db.exec({
                    sql: "PRAGMA table_info(sys_worklist)",
                    rowMode: 'object',
                    callback: (row: any) => columns.push(row.name)
                });
                if (columns.length > 0) {
                    if (!columns.includes('comment')) {
                        db.exec("ALTER TABLE sys_worklist ADD COLUMN comment TEXT");
                        log('Migrated sys_worklist: Added comment');
                    }
                    if (!columns.includes('updated_at')) {
                        // SQLite doesn't allow CURRENT_TIMESTAMP as a default when adding a column via ALTER TABLE
                        db.exec("ALTER TABLE sys_worklist ADD COLUMN updated_at TIMESTAMP");
                        db.exec("UPDATE sys_worklist SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL");
                        log('Migrated sys_worklist: Added updated_at');
                    }
                }
            } catch (e) {
                error('Migration failed for sys_worklist', e);
            }

            // Views might depend on tables that don't exist yet, we should probably wrap this or make it on-demand
            try {
                db.exec(viewsSql);
            } catch (e) {
                log('Warning: views.sql execution partially or fully failed (expected if source tables are missing)');
            }

            log('Generic Schema initialized');
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
                await importDatabase(payload);
                result = true;
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
        tableStats
    };
}

async function importDatabase(buffer: ArrayBuffer) {
    if (db) {
        db.close();
        db = null;
    }

    if (sqlite3.oo1.OpfsDb) {
        try {
            const root = await navigator.storage.getDirectory();
            try {
                await root.removeEntry('litebistudio.sqlite3');
            } catch (e) { /* ignore */ }

            const fileHandle = await root.getFileHandle('litebistudio.sqlite3', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(buffer);
            await writable.close();
        } catch (e) {
            error('Import failed', e);
            throw e;
        }
    }
}

self.onmessage = handleMessage;
