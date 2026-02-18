import { useDashboard } from '../lib/context/DashboardContext';

export const useBackupStatus = () => {
    const { lastBackup, changeCount, markBackupComplete } = useDashboard();

    return {
        lastBackup: lastBackup ? new Date(lastBackup) : null,
        changeCount,
        isBackupRecommended: changeCount > 0,
        markBackupComplete
    };
};
