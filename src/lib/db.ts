import DBWorker from './db.worker?worker';
import type { DbRow } from '../types';

let worker: Worker | null = null;
let workerReadyPromise: Promise<Worker> | null = null;
let msgId = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pending = new Map<number, { resolve: (val: any) => void, reject: (err: any) => void }>();

// BroadcastChannel to warn about multiple tabs
// Using v2 name to avoid cache issues from old logic
const channel = new BroadcastChannel('itdashboard_db_v2');
const conflictListeners = new Set<(hasConflict: boolean) => void>();

let hasConflict = false;

channel.onmessage = (event) => {
    // console.log('[DB Sync] Received:', event.data);
    if (event.data === 'PING') {
        // console.log('[DB Sync] Responding with PONG');
        channel.postMessage('PONG');
    } else if (event.data === 'PONG') {
        processTabConflict();
    }
};

function processTabConflict() {
    if (hasConflict) return;
    hasConflict = true;
    console.warn('[DB] Tab conflict detected! Access restricted to one tab.');
    conflictListeners.forEach(l => l(true));
}

export function onTabConflict(callback: (hasConflict: boolean) => void) {
    conflictListeners.add(callback);
    // console.log('[DB Sync] Listener added. Current conflict state:', hasConflict);
    if (hasConflict) {
        callback(true);
    }
    return () => {
        conflictListeners.delete(callback);
    };
}

// Check for other tabs immediately
channel.postMessage('PING');

function getWorker(): Promise<Worker> {
    if (!workerReadyPromise) {
        workerReadyPromise = new Promise((resolveWorker) => {
            // Use navigator.locks to ensure only one tab/instance active at a time
            // 'itdashboard_db_lifecycle' lock is held as long as the page is open.
            // On reload, the browser releases the lock from the old page, allowing this new one to proceed.
            // If another tab is holding it, we wait here until they close it.
            navigator.locks.request('itdashboard_db_lifecycle', async () => {
                const w = new DBWorker();
                w.onmessage = (e) => {
                    const { id, result, error } = e.data;
                    if (pending.has(id)) {
                        const { resolve, reject } = pending.get(id)!;
                        pending.delete(id);
                        if (error) reject(new Error(error));
                        else resolve(result);
                    }
                };
                worker = w;
                resolveWorker(w);

                // Hold lock until unload
                await new Promise(() => { });
            });
        });
    }
    return workerReadyPromise;
}

// Handle graceful shutdown
window.addEventListener('beforeunload', () => {
    if (worker) {
        worker.postMessage({ type: 'CLOSE' });
    }
});

// Handle HMR
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        if (worker) {
            worker.postMessage({ type: 'CLOSE' });
        }
        channel.close();
    });
}

function send<T>(type: string, payload?: Record<string, unknown> | DbRow[] | ArrayBuffer): Promise<T> {
    return getWorker().then(w => {
        return new Promise((resolve, reject) => {
            const id = ++msgId;
            pending.set(id, { resolve, reject });
            w.postMessage({ id, type, payload });
        });
    });
}

export function initDB() {
    return send<boolean>('INIT').then(() => { });
}

export async function runQuery(sql: string, bind?: (string | number | null | undefined)[]): Promise<DbRow[]> {
    await initDB();
    return send<DbRow[]>('EXEC', { sql, bind });
}

export async function bulkInsertInvoiceItems(data: DbRow[]) {
    await initDB();
    return send('BULK_INSERT_INVOICE_ITEMS', data);
}

export async function bulkInsertKPIs(data: DbRow[]) {
    await initDB();
    return send('BULK_INSERT_KPIS', data);
}

export async function bulkInsertEvents(data: DbRow[]) {
    await initDB();
    return send('BULK_INSERT_EVENTS', data);
}

export async function bulkInsertSystems(data: DbRow[]) {
    await initDB();
    return send('BULK_INSERT_SYSTEMS', data);
}

export async function clearDatabase() {
    await initDB();
    return send('CLEAR');
}

export async function exportDatabase(): Promise<Uint8Array> {
    await initDB();
    return send<Uint8Array>('EXPORT');
}

export async function importDatabase(buffer: ArrayBuffer) {
    // No need to await initDB here as we might be overwriting a broken one
    await send('IMPORT', buffer);
}

export async function loadDemoData() {
    await initDB();
    return send('LOAD_DEMO');
}

export async function initSchema() {
    await initDB();
    return send('INIT_SCHEMA');
}

export async function getDiagnostics() {
    await initDB();
    return send('GET_DIAGNOSTICS');
}

export async function toggleWorklist(sourceTable: string, sourceId: number, label?: string, context?: string) {
    await initDB();
    const existing = await runQuery(
        'SELECT id FROM worklist WHERE source_table = ? AND source_id = ?',
        [sourceTable, sourceId]
    );

    if (existing.length > 0) {
        return runQuery(
            'DELETE FROM worklist WHERE source_table = ? AND source_id = ?',
            [sourceTable, sourceId]
        );
    } else {
        return runQuery(
            'INSERT INTO worklist (source_table, source_id, display_label, display_context) VALUES (?, ?, ?, ?)',
            [sourceTable, sourceId, label, context]
        );
    }
}

export async function isInWorklist(sourceTable: string, sourceId: number): Promise<boolean> {
    await initDB();
    const result = await runQuery(
        'SELECT id FROM worklist WHERE source_table = ? AND source_id = ?',
        [sourceTable, sourceId]
    );
    return result.length > 0;
}

export async function getWorklistCount(): Promise<number> {
    await initDB();
    const result = await runQuery("SELECT COUNT(*) as count FROM worklist WHERE status = 'open'");
    return (result[0]?.count as number) || 0;
}
