import DBWorker from './db.worker?worker';
import type { DbRow } from '../types';
import { getActiveLogLevel, createLogger } from './logger';

let worker: Worker | null = null;
let msgId = 0;
const logger = createLogger('DB');

type PendingRequest = {
    resolve: (val: unknown) => void;
    reject: (err: unknown) => void;
    actionType: string;
};

type ImportReport = {
    isValid?: boolean;
} & Record<string, unknown>;

const pending = new Map<number, PendingRequest>();

const channel = new BroadcastChannel('litebistudio_db_v1');
const conflictListeners = new Set<(hasConflict: boolean, isReadOnly: boolean) => void>();

let hasConflict = false;
let isMaster = false;
let isReadOnlyMode = false;

const instanceId = sessionStorage.getItem('litebistudio_instance_id') || crypto.randomUUID();
sessionStorage.setItem('litebistudio_instance_id', instanceId);

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

function isExecPayload(payload: unknown): payload is { sql: string } {
    return typeof payload === 'object'
        && payload !== null
        && 'sql' in payload
        && typeof (payload as { sql?: unknown }).sql === 'string';
}

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
        const { id, actionType, payload } = event.data;
        // Proxy the request as if it were called on the master tab
        try {
            const result = await send(actionType, payload);
            channel.postMessage({ type: 'RPC_RES', id, result: result });
        } catch (e: unknown) {
            channel.postMessage({ type: 'RPC_RES', id, error: getErrorMessage(e) });
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

const lockAbortController = new AbortController();

export function setReadOnlyMode(skipRedirect = false) {
    isReadOnlyMode = true;
    sessionStorage.setItem('litebistudio_accepted_readonly', 'true');
    conflictListeners.forEach(l => l(true, true));
    lockAbortController.abort(); // Cancel any pending lock requests for this tab
    // Force overview page on start of read-only mode to prevent blank screens, unless auto-reloaded
    if (!skipRedirect) {
        window.location.hash = '#/';
    }
}

function processTabConflict() {
    if (hasConflict) return;
    hasConflict = true;
    logger.warn('Tab conflict detected! Access restricted to one tab.');

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

let lifecycleInitPromise: Promise<void> | null = null;

function createAndConfigureWorker() {
    const w = new DBWorker();
    w.onmessage = (e) => {
        const { id, result, error } = e.data;
        if (pending.has(id)) {
            const request = pending.get(id)!;
            pending.delete(id);
            if (error) request.reject(new Error(error));
            else request.resolve(result);
        }
    };
    w.postMessage({ id: ++msgId, type: 'SET_LOG_LEVEL', payload: { level: getActiveLogLevel() } });
    return w;
}

function getWorker(): Promise<Worker | 'SLAVE'> {
    if (!lifecycleInitPromise) {
        lifecycleInitPromise = new Promise((resolveLifecycle) => {
            // Check if we can become master. 
            // Note: 'ifAvailable' and 'signal' cannot be used together.
            navigator.locks.request('litebistudio_db_lifecycle', { ifAvailable: true }, async (lock) => {
                if (!lock) {
                    // Lock is already held by another tab. We are a slave.
                    isMaster = false;
                    resolveLifecycle();

                    // Request the lock normally in the background (hidden queue)
                    // so we take over if the current master tab is closed.
                    // Here we CAN use the signal to cancel if this tab enters explicit Read-Only mode.
                    try {
                        await navigator.locks.request('litebistudio_db_lifecycle', { signal: lockAbortController.signal }, async () => {
                            logger.info('Previous master tab closed. Reloading to take over...');
                            window.location.reload();
                        });
                    } catch (e: unknown) {
                        if (!(e instanceof DOMException && e.name === 'AbortError')) {
                            logger.error('Background lock request failed:', e);
                        }
                    }
                    return;
                }

                if (isReadOnlyMode) {
                    // We got the lock but the tab already switched to read-only.
                    // Release it immediately so others can take it.
                    isMaster = false;
                    resolveLifecycle();
                    return;
                }

                // We acquired the lock. We are the master.
                isMaster = true;
                worker = createAndConfigureWorker();
                resolveLifecycle();

                // Hold the lock forever
                await new Promise(() => { });
            }).catch(err => {
                if (err.name !== 'AbortError') {
                    logger.error('Failed to acquire DB lock:', err);
                }
                isMaster = false;
                resolveLifecycle();
            });
        });
    }

    return lifecycleInitPromise.then(() => (isMaster && worker) ? worker : 'SLAVE');
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
    const start = performance.now();
    window.dispatchEvent(new CustomEvent('db-query-start'));

    const finish = () => {
        const duration = performance.now() - start;
        window.dispatchEvent(new CustomEvent('db-query-end', { detail: { duration } }));
    };

    const handleSlaveRpc = () => {
        // If we are in explicit Read-Only mode (user accepted the conflict),
        // we restrict destructive actions.
        if (isReadOnlyMode) {
            if (type === 'EXEC' && isExecPayload(payload)) {
                const sql = payload.sql.toUpperCase().trimStart();
                if (!sql.startsWith('SELECT') && !sql.startsWith('PRAGMA')) {
                    return Promise.reject(new Error(`Action ${type} (WRITE) not permitted in Read-Only mode.`));
                }
            } else if (
                type !== 'INIT'
                && type !== 'GET_DIAGNOSTICS'
                && type !== 'GET_DATABASE_HEALTH'
                && type !== 'GET_STORAGE_STATUS'
                && type !== 'EXPORT'
            ) {
                return Promise.reject(new Error(`Action ${type} not permitted in Read-Only mode.`));
            }
        }

        // Send request to master tab via BroadcastChannel
        return new Promise<T>((resolve, reject) => {
            const id = ++msgId;
            const timeout = setTimeout(() => {
                if (pending.has(id)) {
                    pending.delete(id);
                    logger.error(`RPC Timeout for action: ${type} (Master tab unresponsive)`);
                    reject(new Error(`Database Master unresponsive (Timeout after 5s). Please focus the first tab or refresh.`));
                }
            }, 5000);

            pending.set(id, {
                actionType: type,
                resolve: (val) => { clearTimeout(timeout); resolve(val as T); },
                reject: (err) => { clearTimeout(timeout); reject(err); }
            });
            channel.postMessage({ type: 'RPC_REQ', id, actionType: type, payload });
        });
    };

    let p: Promise<T>;

    if (!isMaster && isReadOnlyMode) {
        p = handleSlaveRpc();
    } else {
        p = getWorker().then(result => {
            if (result === 'SLAVE') {
                return handleSlaveRpc();
            }
            const w = result as Worker;
            return new Promise<T>((resolve, reject) => {
                const id = ++msgId;
                pending.set(id, { actionType: type, resolve: (val) => resolve(val as T), reject });
                w.postMessage({ id, type, payload });
            });
        });
    }

    return p.finally(finish);
}

export function notifyDbChange(count: number = 1, type: string = 'insert') {
    logger.debug(`Dispatched db-changed event: type=${type}, count=${count}`);
    window.dispatchEvent(new CustomEvent('db-changed', {
        detail: { type, count }
    }));
}

export async function abortActiveQueries(): Promise<boolean> {
    const hasPendingExec = Array.from(pending.values()).some((request) => request.actionType === 'EXEC');
    if (!hasPendingExec) return false;

    if (!isMaster || !worker) {
        logger.warn('Abort requested without local DB master. Query cancel is only available in the active master tab.');
        return false;
    }

    logger.warn('Aborting active SQL execution by restarting DB worker.');

    for (const [id, request] of Array.from(pending.entries())) {
        pending.delete(id);
        if (request.actionType === 'EXEC') {
            request.reject(new Error('Query cancelled by user.'));
        } else {
            request.reject(new Error('Operation interrupted by query cancellation.'));
        }
    }

    worker.terminate();
    worker = createAndConfigureWorker();
    return true;
}

if (typeof window !== 'undefined') {
    window.addEventListener('app-log-level-changed', () => {
        if (worker) {
            worker.postMessage({ id: ++msgId, type: 'SET_LOG_LEVEL', payload: { level: getActiveLogLevel() } });
        }
    });
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

export async function factoryResetDatabase() {
    await initDB();
    return send('FACTORY_RESET');
}

export async function clearTable(tableName: string) {
    await initDB();
    return send('CLEAR_TABLE', { tableName });
}

export async function exportDatabase(): Promise<Uint8Array> {
    await initDB();
    return send<Uint8Array>('EXPORT');
}

export async function importDatabase(buffer: ArrayBuffer): Promise<ImportReport> {
    const result = await send<ImportReport>('IMPORT', buffer);
    if (result && result.isValid) {
        notifyDbChange(0, 'restore');
    }
    return result;
}

export async function loadDemoData(data?: Record<string, unknown>) {
    await initDB();
    return send<number>('LOAD_DEMO', data);
}

export async function exportDemoData(): Promise<Record<string, unknown>> {
    await initDB();
    return send<Record<string, unknown>>('EXPORT_DEMO_DATA');
}

export async function initSchema() {
    await initDB();
    return send('INIT_SCHEMA');
}

export async function getDiagnostics(): Promise<Record<string, unknown>> {
    await initDB();
    return send<Record<string, unknown>>('GET_DIAGNOSTICS');
}

export async function getDatabaseHealth(): Promise<Record<string, unknown>> {
    await initDB();
    return send<Record<string, unknown>>('GET_DATABASE_HEALTH');
}

export async function getStorageStatus(): Promise<{ mode: 'opfs' | 'memory'; reason: string | null }> {
    await initDB();
    return send<{ mode: 'opfs' | 'memory'; reason: string | null }>('GET_STORAGE_STATUS');
}

export function genericBulkInsert(tableName: string, records: DbRow[]): Promise<number> {
    return send<number>('GENERIC_BULK_INSERT', { tableName, records });
}
