type CacheEntry<T> = {
    data: T;
    timestamp: number;
    ttl: number; // Time to live in ms
};

type Listener = () => void;

class QueryCache {
    private cache = new Map<string, CacheEntry<unknown>>();
    private listeners = new Map<string, Set<Listener>>();

    set<T>(key: string, data: T, ttl: number = 60 * 1000) { // Default 1 minute TTL
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
        this.notify(key);
    }

    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    invalidate(key: string) {
        this.cache.delete(key);
        this.notify(key);
    }

    /**
     * Subscribe to changes for a specific key (or global if key is '*')
     */
    subscribe(key: string, listener: Listener): () => void {
        const set = this.listeners.get(key) || new Set();
        set.add(listener);
        this.listeners.set(key, set);

        return () => {
            const s = this.listeners.get(key);
            if (s) {
                s.delete(listener);
                if (s.size === 0) {
                    this.listeners.delete(key);
                }
            }
        };
    }

    private notify(key: string) {
        // Notify specific listeners
        this.listeners.get(key)?.forEach(l => l());
        // Notify global listeners (if we had any pattern matching, but for now simple)
    }

    // Debug helper
    getStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}

export const queryCache = new QueryCache();
