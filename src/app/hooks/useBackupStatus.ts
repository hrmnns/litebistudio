import { useEffect, useCallback } from 'react';
import { useLocalStorage } from '../../hooks/useLocalStorage';

export interface DatabaseChangeEvent extends CustomEvent {
    detail: {
        type: 'insert' | 'update' | 'delete' | 'clear' | 'restore';
        count: number;
    };
}

export const useBackupStatus = () => {
    const [lastBackup, setLastBackup] = useLocalStorage<string | null>('itdashboard_last_backup', null);
    const [changeCount, setChangeCount] = useLocalStorage<number>('itdashboard_changes_since_backup', 0);

    const handleDbChange = useCallback((e: Event) => {
        const detail = (e as DatabaseChangeEvent).detail;
        if (detail.type === 'restore') {
            setChangeCount(0);
            setLastBackup(new Date().toISOString());
        } else if (detail.type === 'clear') {
            setChangeCount((prev: number) => prev + 1);
        } else {
            setChangeCount((prev: number) => prev + (detail.count || 1));
        }
    }, [setChangeCount, setLastBackup]);

    useEffect(() => {
        window.addEventListener('db-changed', handleDbChange);
        return () => window.removeEventListener('db-changed', handleDbChange);
    }, [handleDbChange]);

    const markBackupComplete = useCallback(() => {
        setLastBackup(new Date().toISOString());
        setChangeCount(0);
    }, [setLastBackup, setChangeCount]);

    return {
        lastBackup: lastBackup ? new Date(lastBackup) : null,
        changeCount,
        isBackupRecommended: changeCount > 0,
        markBackupComplete
    };
};
