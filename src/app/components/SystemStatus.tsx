import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Database, Activity } from 'lucide-react';

import { SystemHealthModal } from './SystemHealthModal';
import { useAsync } from '../../hooks/useAsync';
import { SystemRepository } from '../../lib/repositories/SystemRepository';

interface SystemStatusProps {
    isCollapsed?: boolean;
}

export const SystemStatus: React.FC<SystemStatusProps> = ({ isCollapsed }) => {
    const { t } = useTranslation();
    const { data: dbStats, loading, refresh } = useAsync(
        () => SystemRepository.getDatabaseStats(),
        []
    );

    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const version = __APP_VERSION__;

    // Refresh every 30s to keep stats updated
    useEffect(() => {
        const interval = setInterval(refresh, 30000);
        return () => clearInterval(interval);
    }, [refresh]);

    const totalRecords = dbStats?.records || 0;
    const buildDate = __BUILD_DATE__;

    return (
        <>
            <button
                className={`w-full text-left cursor-pointer bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 hover:border-blue-300 dark:hover:border-blue-800 p-3 rounded-xl transition-all group flex flex-col gap-2 ${isCollapsed ? 'md:items-center' : ''}`}
                onClick={() => setIsDetailsOpen(true)}
                title={isCollapsed ? t('sidebar.system_status') : ''}
            >
                <div className={`flex items-center gap-2.5 ${isCollapsed ? 'md:justify-center' : ''}`}>
                    <Activity className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform flex-shrink-0" />
                    <span className={`text-xs font-bold text-slate-700 dark:text-slate-200 transition-all duration-300 ${isCollapsed ? 'md:opacity-0 md:w-0 overflow-hidden' : 'opacity-100'}`}>{t('sidebar.system_status')}</span>
                    {!isCollapsed && (
                        <ChevronRight className="ml-auto w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                    )}
                </div>

                {!isCollapsed && (
                    <div className="flex flex-col gap-1.5 pl-6.5 transition-all duration-300">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                            <Database className="w-3.5 h-3.5" />
                            <span>{loading ? '...' : t('sidebar.records_count', { count: Number((totalRecords / 1000).toFixed(1)) })}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px] font-mono text-slate-400 dark:text-slate-500">
                            <span className="bg-slate-100 dark:bg-slate-800 px-1 rounded">v{version}</span>
                            <span className="opacity-50">Build {buildDate}</span>
                        </div>
                    </div>
                )}
            </button>

            <SystemHealthModal
                isOpen={isDetailsOpen}
                onClose={() => setIsDetailsOpen(false)}
            />
        </>
    );
};
