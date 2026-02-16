import React, { useState, useEffect, useCallback } from 'react';

export function useAsync<T>(
    asyncFunction: () => Promise<T>,
    deps: React.DependencyList = []
) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [version, setVersion] = useState(0);

    const refresh = useCallback(() => {
        setVersion(v => v + 1);
    }, []);

    useEffect(() => {
        let mounted = true;

        const execute = async () => {
            try {
                setLoading(true);
                const result = await asyncFunction();
                if (mounted) {
                    setData(result);
                    setError(null);
                }
            } catch (err) {
                if (mounted) {
                    setError(err instanceof Error ? err : new Error(String(err)));
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        execute();

        const handleDbUpdate = () => {
            execute();
        };
        window.addEventListener('db-updated', handleDbUpdate);

        return () => {
            mounted = false;
            window.removeEventListener('db-updated', handleDbUpdate);
        };
    }, [...deps, version]);

    return { data, loading, error, refresh };
}
