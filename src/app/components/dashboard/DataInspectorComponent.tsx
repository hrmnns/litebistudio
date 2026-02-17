import React from 'react';
import { Search } from 'lucide-react';
import { SystemRepository } from '../../../lib/repositories/SystemRepository';
import { DashboardComponent } from '../ui/DashboardComponent';
import { Skeleton } from '../ui/Skeleton';
import { useAsync } from '../../../hooks/useAsync';

export const DataInspectorComponent: React.FC<{ onRemove?: () => void; dragHandleProps?: any; onClick?: () => void; targetView?: string }> = ({ onRemove, dragHandleProps, onClick, targetView }) => {
    const { data: stats, loading, error } = useAsync<{ tables: number; records: number }>(
        () => SystemRepository.getDatabaseStats(),
        [],
        { cacheKey: 'db-stats-tile', ttl: 10 * 60 * 1000 }
    );

    if (error) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-red-200 dark:border-red-900/50 p-4 h-full flex items-center justify-center text-center">
                <p className="text-red-500 font-bold text-[10px] uppercase">Fehler</p>
            </div>
        );
    }

    return (
        <DashboardComponent
            title="Inspector"
            icon={Search}
            iconColor="indigo"
            onClick={onClick}
            onRemove={onRemove}
            targetView={targetView}
            dragHandleProps={dragHandleProps}
            backgroundIcon={Search}
        >
            <div className="flex flex-col h-full items-center justify-around py-0.5">
                {/* Primary Metric: Total Records */}
                <div className="text-center group-hover:scale-105 transition-transform duration-500">
                    <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Records Gesamt</div>
                    <div className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums leading-none">
                        {loading || !stats ? <Skeleton className="h-8 w-20 mx-auto" /> : stats.records.toLocaleString('de-DE')}
                    </div>
                </div>

                {/* Secondary Metrics - High Density Tables Pill */}
                <div className="w-full pt-3 border-t border-slate-100 dark:border-slate-800/50 flex justify-center">
                    <div className="flex flex-col items-center px-4 py-1 rounded-lg bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100/50 dark:border-indigo-800/30">
                        <span className="text-[6px] font-black text-indigo-600 dark:text-indigo-500 uppercase tracking-tighter mb-0.5">Tabellen</span>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200 tabular-nums leading-none">
                            {loading || !stats ? '...' : stats.tables}
                        </span>
                    </div>
                </div>
            </div>
        </DashboardComponent>
    );
};
