import { useState, useEffect, useCallback, useRef } from 'react';
import { runQuery, initDB } from '../lib/db';
import { queryCache } from '../lib/cache';
import type { DbRow } from '../types';

export interface UseQueryOptions {
    cacheKey?: string;
    ttl?: number;
}

function serializeParam(param: string | number | null | undefined): string {
    if (param === null) return 'null';
    if (param === undefined) return 'undefined';
    if (typeof param === 'string') return `str:${param}`;
    return `num:${param}`;
}

export function useQuery<T = DbRow>(
    query: string,
    params: (string | number | null | undefined)[] = [],
    options: UseQueryOptions = {}
) {
    const { cacheKey, ttl } = options;

    // Initialize with cached data if available
    const [data, setData] = useState<T[]>(() => {
        if (cacheKey) {
            return queryCache.get<T[]>(cacheKey) || [];
        }
        return [];
    });

    const [loading, setLoading] = useState(!cacheKey || !queryCache.get(cacheKey));
    const [error, setError] = useState<Error | null>(null);
    const [version, setVersion] = useState(0);
    const paramsKey = params.map(serializeParam).join('|');
    const paramsRef = useRef(params);

    useEffect(() => {
        paramsRef.current = params;
    }, [paramsKey, params]);

    const refresh = useCallback(() => {
        setVersion(v => v + 1);
    }, []);

    useEffect(() => {
        let mounted = true;

        const fetchData = async () => {
            if (!query || query.trim() === '') {
                if (mounted) {
                    setData([]);
                    setLoading(false);
                }
                return;
            }

            try {
                // Only show loading if we don't have cached data
                if (!cacheKey || !queryCache.get(cacheKey)) {
                    setLoading(true);
                }

                await initDB();
                const result = await runQuery(query, paramsRef.current);

                if (mounted) {
                    setData(result as T[]);
                    setError(null);
                    if (cacheKey) {
                        queryCache.set(cacheKey, result, ttl);
                    }
                }
            } catch (err: unknown) {
                if (mounted) {
                    setError(err instanceof Error ? err : new Error(String(err)));
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        fetchData();

        // If caching is enabled, subscribe to cache updates
        let unsubscribe: (() => void) | undefined;
        if (cacheKey) {
            unsubscribe = queryCache.subscribe(cacheKey, () => {
                const cached = queryCache.get<T[]>(cacheKey);
                if (cached && mounted) {
                    setData(cached);
                }
            });
        }

        const handleDbUpdate = () => fetchData();
        window.addEventListener('db-updated', handleDbUpdate);

        return () => {
            mounted = false;
            window.removeEventListener('db-updated', handleDbUpdate);
            if (unsubscribe) unsubscribe();
        };
    }, [query, paramsKey, version, cacheKey, ttl]);

    return { data, loading, error, refresh };
}
