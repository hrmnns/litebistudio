import React, { useState, useEffect, useCallback, useRef } from 'react';
import { queryCache } from '../lib/cache';

interface UseAsyncOptions {
    cacheKey?: string;
    ttl?: number; // Time to live in ms
    keepPreviousData?: boolean;
}

function serializeDependency(dep: unknown): string {
    if (dep === null) return 'null';
    if (dep === undefined) return 'undefined';
    if (typeof dep === 'string') return `str:${dep}`;
    if (typeof dep === 'number') return `num:${dep}`;
    if (typeof dep === 'boolean') return `bool:${dep}`;
    if (typeof dep === 'bigint') return `bigint:${dep.toString()}`;
    if (typeof dep === 'function') return `fn:${dep.name || 'anonymous'}`;
    try {
        return `json:${JSON.stringify(dep)}`;
    } catch {
        return `obj:${String(dep)}`;
    }
}

export function useAsync<T>(
    asyncFunction: () => Promise<T>,
    deps: React.DependencyList = [],
    options: UseAsyncOptions = {}
) {
    const { cacheKey, ttl } = options;

    // Initialize state from cache if available
    const [data, setData] = useState<T | null>(() => {
        if (cacheKey) {
            const cached = queryCache.get<T>(cacheKey);
            return cached || null;
        }
        return null;
    });

    // Loading is true only if we have no data and no error
    const [loading, setLoading] = useState(() => {
        if (cacheKey && queryCache.get(cacheKey)) return false;
        return true;
    });

    const [error, setError] = useState<Error | null>(null);
    const [version, setVersion] = useState(0);
    const lastFetchId = useRef(0);
    const depsKey = deps.map(serializeDependency).join('|');

    // Always keep the latest asyncFunction to prevent stale closures
    // when triggered by global events (like db-updated)
    const asyncFuncRef = useRef(asyncFunction);
    useEffect(() => {
        asyncFuncRef.current = asyncFunction;
    });

    const refresh = useCallback(() => {
        setVersion(v => v + 1);
    }, []);

    useEffect(() => {
        let mounted = true;
        const fetchId = ++lastFetchId.current;

        const execute = async () => {
            try {
                // If we have cached data, we don't need to set loading to true immediately
                // This creates the "stale-while-revalidate" effect
                const hasCachedData = cacheKey ? queryCache.get<T>(cacheKey) !== null : false;
                if (!hasCachedData) {
                    setLoading(true);
                }

                const result = await asyncFuncRef.current();

                if (mounted && fetchId === lastFetchId.current) {
                    setData(result);
                    setError(null);

                    // Update cache
                    if (cacheKey) {
                        queryCache.set(cacheKey, result, ttl);
                    }
                }
            } catch (err) {
                if (mounted && fetchId === lastFetchId.current) {
                    setError(err instanceof Error ? err : new Error(String(err)));
                }
            } finally {
                if (mounted && fetchId === lastFetchId.current) {
                    setLoading(false);
                }
            }
        };

        // If we have a cache key, check if we need to fetch at all or just revalidate
        // For now, simpler SWR: always fetch to revalidate
        execute();

        const handleDbUpdate = () => {
            // Invalidate cache on massive DB updates to force UI refresh
            if (cacheKey) {
                queryCache.invalidate(cacheKey);
            }
            execute();
        };
        window.addEventListener('db-updated', handleDbUpdate);

        return () => {
            mounted = false;
            window.removeEventListener('db-updated', handleDbUpdate);
        };
    }, [depsKey, version, cacheKey, ttl]);

    return { data, loading, error, refresh };
}

