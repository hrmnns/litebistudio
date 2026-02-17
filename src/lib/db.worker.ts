import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import schemaSql from '../datasets/schema.sql?raw';
import viewsSql from '../datasets/views.sql?raw';
import demoDataSmall from '../datasets/demo-small.json';

let db: any = null;
let sqlite3: any = null;

const log = (...args: any[]) => console.log('[DB Worker]', ...args);
const error = (...args: any[]) => console.error('[DB Worker]', ...args);

async function initDB() {
    if (db) return;

    try {
        log('Initializing SQLite...');

        let isRetrying = false;
        const config = {
            print: log,
            printErr: (...args: any[]) => {
                const msg = args.join(' ');
                if (isRetrying && (msg.includes('OPFS asyncer') || msg.includes('GetSyncHandleError'))) {
                    // Suppress expected errors during retry
                    return;
                }
                error(...args);
            },
        };

        sqlite3 = await (sqlite3InitModule as any)(config);

        if (sqlite3.oo1.OpfsDb) {
            try {
                db = new sqlite3.oo1.OpfsDb('/itdashboard.sqlite3');
                log('Opened OPFS database');
            } catch (e) {
                error('OPFS unavailable, falling back to memory', e);
                db = new sqlite3.oo1.DB(':memory:');
            }
        } else {
            log('OPFS not supported, using memory');
            db = new sqlite3.oo1.DB(':memory:');
        }

        // Initialize schema
        db.exec(schemaSql);
        db.exec(viewsSql);

        // Migration: Add is_favorite to systems if it doesn't exist
        try {
            const columns: string[] = [];
            db.exec({
                sql: "PRAGMA table_info(systems)",
                rowMode: 'object',
                callback: (row: any) => columns.push(row.name)
            });

            if (columns.length > 0) {
                if (!columns.includes('is_favorite')) {
                    log('Migrating systems table: adding is_favorite column');
                    db.exec("ALTER TABLE systems ADD COLUMN is_favorite INTEGER DEFAULT 0");
                    db.exec("UPDATE systems SET is_favorite = 1 WHERE id IN (SELECT id FROM systems LIMIT 4)");
                }

                if (!columns.includes('sort_order')) {
                    log('Migrating systems table: adding sort_order column');
                    db.exec("ALTER TABLE systems ADD COLUMN sort_order INTEGER DEFAULT 0");
                    // Initialize sort_order with id to maintain current order
                    db.exec("UPDATE systems SET sort_order = id");
                }
            }

            // Create settings table if not exists (for existing DBs)
            db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
        } catch (e) {
            error('Migration failed', e);
        }

        log('Schema initialized');

        // Check for empty DB and load demo data
        const invoiceCount = db.selectValue('SELECT count(*) FROM invoice_items');

        if (invoiceCount === 0) {
            log('Database empty, loading demo data...');
            await loadDemoData();
        }

    } catch (e) {
        error('Initialization failed', e);
        throw e;
    }
}

async function loadDemoData() {
    // Systems
    if (demoDataSmall.systems) {
        const systemStmt = db.prepare('INSERT INTO systems (name, url, status, category, is_favorite, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
        try {
            db.exec('BEGIN TRANSACTION');
            let count = 0;
            for (const item of demoDataSmall.systems) {
                // Set first 4 as favorites by default
                const isFavorite = count < 4 ? 1 : 0;
                systemStmt.bind([item.name, item.url, item.status, item.category, isFavorite, count]);
                systemStmt.step();
                systemStmt.reset();
                count++;
            }
            db.exec('COMMIT');
        } finally {
            systemStmt.finalize();
        }
    }
    log('Demo data loaded');
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

            case 'BULK_INSERT_INVOICE_ITEMS':
                if (!db) await initDB();
                insertInvoiceItems(payload);
                result = true;
                break;

            case 'BULK_INSERT_SYSTEMS':
                if (!db) await initDB();
                insertSystems(payload);
                result = true;
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
                db.exec('DELETE FROM invoice_items;');
                result = true;
                break;

            case 'CLEAR_SYSTEMS':
                if (!db) await initDB();
                db.exec('DELETE FROM systems;');
                result = true;
                break;

            case 'CLEAR_INVOICE_DATA':
                if (!db) await initDB();
                db.exec('DELETE FROM invoice_items;');
                result = true;
                break;

            case 'CLEAR_TABLE':
                if (!db) await initDB();
                const tableName = payload.tableName;
                // Basic security: only Allow alphanumeric + underscores
                if (!/^[a-z0-9_]+$/i.test(tableName)) {
                    throw new Error(`Invalid table name: ${tableName}`);
                }
                db.exec(`DELETE FROM ${tableName};`);
                result = true;
                break;

            case 'LOAD_DEMO':
                if (!db) await initDB();
                await loadDemoData();
                result = true;
                break;

            case 'CLOSE':
                if (db) {
                    log('Closing database...');
                    db.close();
                    db = null;
                }
                result = true;
                self.close(); // Terminate the worker thread gracefully
                break;
        }

        self.postMessage({ id, result });
    } catch (error: any) {
        self.postMessage({ id, error: error.message });
    }
}

function insertInvoiceItems(data: any[]) {
    const sql = `
        INSERT INTO invoice_items (
            FiscalYear, Period, PostingDate, VendorName, VendorId, 
            DocumentId, LineId, CostCenter, GLAccount, Category, 
            SubCategory, Service, System, RunChangeInnovation, Amount, 
            Currency, Quantity, Unit, UnitPrice, ContractId, 
            POId, IsRecurring, Description, SourceTag
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const stmt = db.prepare(sql);
    try {
        db.exec('BEGIN TRANSACTION');
        for (const item of data) {
            stmt.bind([
                item.FiscalYear, item.Period, item.PostingDate, item.VendorName, item.VendorId,
                item.DocumentId, item.LineId, item.CostCenter, item.GLAccount, item.Category,
                item.SubCategory, item.Service, item.System, item.RunChangeInnovation, item.Amount,
                item.Currency, item.Quantity, item.Unit, item.UnitPrice, item.ContractId,
                item.POId, item.IsRecurring, item.Description, item.SourceTag
            ]);
            stmt.step();
            stmt.reset();
        }
        db.exec('COMMIT');
    } catch (e) {
        db.exec('ROLLBACK');
        throw e;
    } finally {
        stmt.finalize();
    }
}

function insertSystems(data: any[]) {
    const stmt = db.prepare('INSERT INTO systems (name, url, status, category, is_favorite, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    try {
        db.exec('BEGIN TRANSACTION');
        for (const item of data) {
            stmt.bind([item.name, item.url, item.status, item.category, item.is_favorite || 0, item.sort_order || 0]);
            stmt.step();
            stmt.reset();
        }
        db.exec('COMMIT');
    } catch (e) {
        db.exec('ROLLBACK');
        throw e;
    } finally {
        stmt.finalize();
    }
}

function getDiagnostics() {
    // 1. Size estimate
    const pageCount = db.selectValue('PRAGMA page_count') as number;
    const pageSize = db.selectValue('PRAGMA page_size') as number;
    const dbSize = pageCount * pageSize;

    // 2. Integrity check (lightweight)
    // Note: 'PRAGMA integrity_check' can be slow on large DBs, maybe make it optional or on-demand?
    // For now we'll return basic stats and let the UI request a full check via EXEC if needed.

    // 3. Table counts
    const tables = ['invoice_items', 'systems', 'worklist'];
    const tableStats: Record<string, number> = {};

    for (const t of tables) {
        try {
            tableStats[t] = db.selectValue(`SELECT count(*) FROM ${t}`) as number;
        } catch (e) {
            tableStats[t] = 0;
        }
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
                await root.removeEntry('itdashboard.sqlite3');
            } catch (e) { /* ignore */ }

            const fileHandle = await root.getFileHandle('itdashboard.sqlite3', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(buffer);
            await writable.close();
        } catch (e) {
            error('Import failed', e);
            throw e;
        }
    }

    // Re-init happens on next command or caller reloads page
}

self.onmessage = handleMessage;
