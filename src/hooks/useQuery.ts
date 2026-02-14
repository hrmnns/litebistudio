import { useState, useEffect, useCallback } from 'react';
import { runQuery, initDB } from '../lib/db';

export function useQuery<T = any>(query: string, params: any[] = []) {
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [version, setVersion] = useState(0); // To force refresh

    const refresh = useCallback(() => {
        setVersion(v => v + 1);
    }, []);

    useEffect(() => {
        let mounted = true;

        const fetchData = async () => {
            // Skip execution if query is empty
            if (!query || query.trim() === '') {
                if (mounted) {
                    setData([]);
                    setLoading(false);
                }
                return;
            }

            try {
                setLoading(true);
                await initDB();

                const result = await runQuery(query, params);
                if (mounted) {
                    setData(result);
                    setError(null);
                }
            } catch (err: any) {
                if (mounted) {
                    console.error('Query error:', err);
                    setError(err);
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        fetchData();

        // Listen for global DB update events
        const handleDbUpdate = () => {
            fetchData();
        };
        window.addEventListener('db-updated', handleDbUpdate);

        return () => {
            mounted = false;
            window.removeEventListener('db-updated', handleDbUpdate);
        };
    }, [query, JSON.stringify(params), version]);

    return { data, loading, error, refresh };
}
