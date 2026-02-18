import DBWorker from './db.worker?worker';
import type { DbRow } from '../types';

let worker: Worker | null = null;
let workerReadyPromise: Promise<Worker> | null = null;
let msgId = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pending = new Map<number, { resolve: (val: any) => void, reject: (err: any) => void }>();

const channel = new BroadcastChannel('itdashboard_db_v2');
const conflictListeners = new Set<(hasConflict: boolean) => void>();

let hasConflict = false;

channel.onmessage = (event) => {
    if (event.data === 'PING') {
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
    if (hasConflict) {
        callback(true);
    }
    return () => {
        conflictListeners.delete(callback);
    };
}

channel.postMessage('PING');

function getWorker(): Promise<Worker> {
    if (!workerReadyPromise) {
        workerReadyPromise = new Promise((resolveWorker) => {
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
                await new Promise(() => { });
            });
        });
    }
    return workerReadyPromise;
}

window.addEventListener('beforeunload', () => {
    if (worker) {
        worker.postMessage({ type: 'CLOSE' });
    }
});

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

export function notifyDbChange(count: number = 1, type: string = 'insert') {
    window.dispatchEvent(new CustomEvent('db-changed', {
        detail: { type, count }
    }));
}

export function initDB() {
    return send<boolean>('INIT').then(() => { });
}

export async function runQuery(sql: string, bind?: (string | number | null | undefined)[]): Promise<DbRow[]> {
    await initDB();
    return send<DbRow[]>('EXEC', { sql, bind });
}

export async function clearDatabase() {
    await initDB();
    return send('CLEAR');
}

export async function clearTable(tableName: string) {
    await initDB();
    return send('CLEAR_TABLE', { tableName });
}

export async function exportDatabase(): Promise<Uint8Array> {
    await initDB();
    return send<Uint8Array>('EXPORT');
}

export async function importDatabase(buffer: ArrayBuffer) {
    await send('IMPORT', buffer);
}

export async function loadDemoData(data?: any) {
    await initDB();
    return send<number>('LOAD_DEMO', data);
}

export async function exportDemoData(): Promise<any> {
    await initDB();
    return send('EXPORT_DEMO_DATA');
}

export async function initSchema() {
    await initDB();
    return send('INIT_SCHEMA');
}

export async function getDiagnostics() {
    await initDB();
    return send('GET_DIAGNOSTICS');
}

export function genericBulkInsert(tableName: string, records: any[]): Promise<number> {
    return send<number>('GENERIC_BULK_INSERT', { tableName, records });
}
