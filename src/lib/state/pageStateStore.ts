type PageStateScope = 'memory' | 'session';

interface PageStateEnvelope<T> {
    version: number;
    updatedAt: number;
    state: T;
}

interface PageStateOptions {
    scope?: PageStateScope;
    version?: number;
}

const MEMORY_PAGE_STATE = new Map<string, PageStateEnvelope<unknown>>();

const getStorageKey = (pageId: string) => `litebistudio_page_state_${pageId}`;

const readSessionEnvelope = <T>(pageId: string): PageStateEnvelope<T> | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.sessionStorage.getItem(getStorageKey(pageId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PageStateEnvelope<T>;
        if (!parsed || typeof parsed !== 'object' || !('state' in parsed)) return null;
        return parsed;
    } catch {
        return null;
    }
};

const writeSessionEnvelope = <T>(pageId: string, envelope: PageStateEnvelope<T>): void => {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.setItem(getStorageKey(pageId), JSON.stringify(envelope));
    } catch {
        // Ignore quota and serialization errors; memory store still works.
    }
};

export const getPageState = <T>(pageId: string, options?: PageStateOptions): T | null => {
    const scope = options?.scope || 'memory';
    const version = options?.version;

    const envelope = scope === 'session'
        ? readSessionEnvelope<T>(pageId)
        : (MEMORY_PAGE_STATE.get(pageId) as PageStateEnvelope<T> | undefined) || null;
    if (!envelope) return null;
    if (typeof version === 'number' && envelope.version !== version) return null;
    return envelope.state;
};

export const setPageState = <T>(pageId: string, state: T, options?: PageStateOptions): void => {
    const scope = options?.scope || 'memory';
    const version = options?.version ?? 1;
    const envelope: PageStateEnvelope<T> = {
        version,
        updatedAt: Date.now(),
        state
    };
    if (scope === 'session') {
        writeSessionEnvelope(pageId, envelope);
        return;
    }
    MEMORY_PAGE_STATE.set(pageId, envelope as PageStateEnvelope<unknown>);
};

export const clearPageState = (pageId: string, options?: PageStateOptions): void => {
    const scope = options?.scope || 'memory';
    if (scope === 'session') {
        if (typeof window === 'undefined') return;
        try {
            window.sessionStorage.removeItem(getStorageKey(pageId));
        } catch {
            // ignore
        }
        return;
    }
    MEMORY_PAGE_STATE.delete(pageId);
};

