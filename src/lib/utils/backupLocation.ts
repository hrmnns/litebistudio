const DB_NAME = 'litebi-backup-location';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'backup-directory-handle';
const LABEL_STORAGE_KEY = 'backup_saved_folder_label';

type MaybeDirectoryHandle = {
    name?: string;
    queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
    getFileHandle?: (name: string, options?: { create?: boolean }) => Promise<{
        createWritable?: () => Promise<{ write: (data: BlobPart) => Promise<void>; close: () => Promise<void> }>;
    }>;
};

const isBrowser = typeof window !== 'undefined';

const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

const putHandle = async (handle: unknown): Promise<void> => {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
};

const getHandle = async (): Promise<MaybeDirectoryHandle | null> => {
    const db = await openDb();
    return await new Promise<MaybeDirectoryHandle | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
        request.onsuccess = () => resolve((request.result as MaybeDirectoryHandle | undefined) || null);
        request.onerror = () => reject(request.error);
    });
};

const clearHandle = async (): Promise<void> => {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
};

const requestPermission = async (handle: MaybeDirectoryHandle, mode: 'read' | 'readwrite'): Promise<boolean> => {
    if (!handle.queryPermission || !handle.requestPermission) return true;
    const current = await handle.queryPermission({ mode });
    if (current === 'granted') return true;
    const requested = await handle.requestPermission({ mode });
    return requested === 'granted';
};

export const isBackupDirectorySupported = (): boolean => {
    if (!isBrowser) return false;
    return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
};

export const getSavedBackupDirectoryLabel = (): string => {
    if (!isBrowser) return '';
    return localStorage.getItem(LABEL_STORAGE_KEY) || '';
};

export const pickAndSaveBackupDirectory = async (): Promise<string | null> => {
    if (!isBrowser || !isBackupDirectorySupported()) return null;
    const picker = (window as unknown as { showDirectoryPicker: () => Promise<MaybeDirectoryHandle> }).showDirectoryPicker;
    const handle = await picker();
    if (!handle) return null;
    await putHandle(handle);
    const label = handle.name || '';
    localStorage.setItem(LABEL_STORAGE_KEY, label);
    return label;
};

export const clearSavedBackupDirectory = async (): Promise<void> => {
    if (!isBrowser) return;
    await clearHandle();
    localStorage.removeItem(LABEL_STORAGE_KEY);
};

export const saveBackupToRememberedDirectory = async (buffer: ArrayBuffer, fileName: string): Promise<boolean> => {
    if (!isBrowser || !isBackupDirectorySupported()) return false;
    const handle = await getHandle();
    if (!handle || !handle.getFileHandle) return false;
    const hasPermission = await requestPermission(handle, 'readwrite');
    if (!hasPermission) return false;
    const fileHandle = await handle.getFileHandle(fileName, { create: true });
    if (!fileHandle?.createWritable) return false;
    const writable = await fileHandle.createWritable();
    await writable.write(buffer);
    await writable.close();
    return true;
};

export const pickBackupFileFromRememberedDirectory = async (): Promise<File | null> => {
    if (!isBrowser || !isBackupDirectorySupported()) return null;
    const picker = (window as unknown as {
        showOpenFilePicker?: (options?: Record<string, unknown>) => Promise<Array<{ getFile: () => Promise<File> }>>;
    }).showOpenFilePicker;
    if (!picker) return null;
    const startIn = await getHandle();
    try {
        const handles = await picker({
            multiple: false,
            startIn: startIn || undefined,
            types: [
                {
                    description: 'SQLite Backup',
                    accept: {
                        'application/x-sqlite3': ['.sqlite3', '.sqlite', '.db']
                    }
                }
            ]
        });
        if (!handles?.length) return null;
        return await handles[0].getFile();
    } catch {
        return null;
    }
};

export const pickBackupFileFromRememberedDirectoryWithStatus = async (): Promise<{ file: File | null; cancelled: boolean }> => {
    if (!isBrowser || !isBackupDirectorySupported()) return { file: null, cancelled: false };
    const picker = (window as unknown as {
        showOpenFilePicker?: (options?: Record<string, unknown>) => Promise<Array<{ getFile: () => Promise<File> }>>;
    }).showOpenFilePicker;
    if (!picker) return { file: null, cancelled: false };
    const startIn = await getHandle();
    try {
        const handles = await picker({
            multiple: false,
            startIn: startIn || undefined,
            types: [
                {
                    description: 'SQLite Backup',
                    accept: {
                        'application/x-sqlite3': ['.sqlite3', '.sqlite', '.db']
                    }
                }
            ]
        });
        if (!handles?.length) return { file: null, cancelled: false };
        return { file: await handles[0].getFile(), cancelled: false };
    } catch (error) {
        const name = error instanceof DOMException ? error.name : '';
        if (name === 'AbortError') return { file: null, cancelled: true };
        return { file: null, cancelled: false };
    }
};
