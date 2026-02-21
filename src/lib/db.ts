import DBWorker from './db.worker?worker';
import type { DbRow } from '../types';

let worker: Worker | null = null;
let workerReadyPromise: Promise<Worker> | null = null;
let msgId = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pending = new Map<number, { resolve: (val: any) => void, reject: (err: any) => void }>();

const channel = new BroadcastChannel('litebistudio_db_v1');
const conflictListeners = new Set<(hasConflict: boolean, isReadOnly: boolean) => void>();

let hasConflict = false;
let isMaster = false;
let isReadOnlyMode = false;

const instanceId = sessionStorage.getItem('litebistudio_instance_id') || crypto.randomUUID();
sessionStorage.setItem('litebistudio_instance_id', instanceId);

channel.onmessage = async (event) => {
    if (event.data && event.data.type === 'PING') {
        if (isMaster && event.data.instanceId !== instanceId) {
            channel.postMessage({ type: 'MASTER_PONG', instanceId: event.data.instanceId });
        }
    } else if (event.data && event.data.type === 'MASTER_PONG') {
        if (event.data.instanceId === instanceId) {
            processTabConflict();
        }
    } else if (event.data && event.data.type === 'RPC_REQ' && isMaster) {
        const { id, sql, bind } = event.data;
        if (!sql.toUpperCase().trimStart().startsWith('SELECT') && !sql.toUpperCase().trimStart().startsWith('PRAGMA')) {
            channel.postMessage({ type: 'RPC_RES', id, error: 'Only SELECT and PRAGMA are allowed in read-only mode.' });
            return;
        }
        try {
            const rows = await runQuery(sql, bind);
            channel.postMessage({ type: 'RPC_RES', id, result: rows });
        } catch (e: any) {
            channel.postMessage({ type: 'RPC_RES', id, error: e.message });
        }
    } else if (event.data && event.data.type === 'RPC_RES' && !isMaster) {
        const { id, result, error } = event.data;
        if (pending.has(id)) {
            const { resolve, reject } = pending.get(id)!;
            pending.delete(id);
            if (error) reject(new Error(error));
            else resolve(result);
        }
    }
};

let readOnlyResolve: (() => void) | null = null;
const readOnlyPromise = new Promise<void>((resolve) => {
    readOnlyResolve = resolve;
});

const lockAbortController = new AbortController();

export function setReadOnlyMode(skipRedirect = false) {
    isReadOnlyMode = true;
    sessionStorage.setItem('litebistudio_accepted_readonly', 'true');
    conflictListeners.forEach(l => l(true, true));
    if (readOnlyResolve) readOnlyResolve();
    lockAbortController.abort(); // Cancel any pending lock requests for this tab
    // Force overview page on start of read-only mode to prevent blank screens, unless auto-reloaded
    if (!skipRedirect) {
        window.location.hash = '#/';
    }
}

function processTabConflict() {
    if (hasConflict) return;
    hasConflict = true;
    console.warn('[DB] Tab conflict detected! Access restricted to one tab.');

    if (sessionStorage.getItem('litebistudio_accepted_readonly') === 'true') {
        setReadOnlyMode(true);
    } else {
        conflictListeners.forEach(l => l(true, isReadOnlyMode));
    }
}

export function onTabConflict(callback: (hasConflict: boolean, isReadOnly: boolean) => void) {
    conflictListeners.add(callback);
    if (hasConflict) {
        callback(true, isReadOnlyMode);
    }
    return () => {
        conflictListeners.delete(callback);
    };
}

channel.postMessage({ type: 'PING', instanceId });

function getWorker(): Promise<Worker> {
    if (!workerReadyPromise) {
        workerReadyPromise = new Promise((resolveWorker, rejectWorker) => {
            navigator.locks.request('litebistudio_db_lifecycle', { signal: lockAbortController.signal }, async () => {
                if (isReadOnlyMode) {
                    // This tab entered read-only mode while waiting in the lock queue.
                    // Release the lock immediately so another tab can be master.
                    rejectWorker(new Error('Switched to Read-Only mode'));
                    return;
                }

                isMaster = true;
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
            }).catch(err => {
                if (err.name === 'AbortError') {
                    // Expected when user opts into read-only mode
                    rejectWorker(err);
                } else {
                    console.error('Failed to acquire DB lock:', err);
                    rejectWorker(err);
                }
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
    const handleReadOnly = () => {
        if (type === 'EXEC' && payload && 'sql' in payload) {
            return new Promise<T>((resolve, reject) => {
                const id = ++msgId;
                pending.set(id, { resolve, reject });
                channel.postMessage({ type: 'RPC_REQ', id, sql: payload.sql, bind: payload.bind });
            });
        }
        if (type === 'INIT') return Promise.resolve(true as any);
        if (type === 'GET_DIAGNOSTICS') {
            return Promise.resolve({ dbSize: 0, pageCount: 0, pageSize: 0, tableStats: {} } as any);
        }
        return Promise.reject(new Error(`Action ${type} not permitted in Read-Only mode.`));
    };

    if (!isMaster && isReadOnlyMode) {
        return handleReadOnly();
    }

    // Race getWorker and readOnlyPromise so querying tabs don't hang if they switch to read-only while waiting
    return Promise.race([
        getWorker(),
        readOnlyPromise.then(() => 'READ_ONLY_MODE_ACTIVATED' as const)
    ]).then(result => {
        if (result === 'READ_ONLY_MODE_ACTIVATED') {
            return handleReadOnly();
        }
        const w = result as Worker;
        return new Promise<T>((resolve, reject) => {
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

export async function importDatabase(buffer: ArrayBuffer): Promise<any> {
    return await send('IMPORT', buffer);
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
