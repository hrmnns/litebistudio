import React from 'react';
import { Database } from 'lucide-react';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { DashboardTile } from '../components/ui/DashboardTile';
import { Skeleton } from '../components/ui/Skeleton';
import { useAsync } from '../../hooks/useAsync';

export const DataInspectorTile: React.FC<{ onRemove?: () => void; dragHandleProps?: any; onClick?: () => void }> = ({ onRemove, dragHandleProps, onClick }) => {
    const { data: stats, loading, error } = useAsync<{ tables: number; records: number }>(
        () => SystemRepository.getDatabaseStats(),
        [],
        { cacheKey: 'db-stats-tile', ttl: 10 * 60 * 1000 }
    );

    if (error) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-red-200 dark:border-red-900/50 p-4 h-full flex items-center justify-center text-center">
                <p className="text-red-500 font-bold text-sm">Fehler beim Laden</p>
            </div>
        );
    }

    return (
        <DashboardTile
            title="Inspector"
            icon={Database}
            iconColor="indigo"
            onClick={onClick}
            onRemove={onRemove}
            dragHandleProps={dragHandleProps}
            backgroundIcon={Database}
        >
            <div className="flex flex-col h-full items-center justify-around py-2">
                {/* Primary Metric: Total Records */}
                <div className="text-center group-hover:scale-105 transition-transform duration-500">
                    <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Records</div>
                    <div className="text-4xl font-black text-indigo-600 dark:text-indigo-500 tracking-tighter tabular-nums leading-none">
                        {loading || !stats ? <Skeleton className="h-9 w-24" /> : stats.records.toLocaleString('de-DE')}
                    </div>
                </div>

                {/* Secondary Metric: Tables */}
                <div className="w-full pt-4 border-t border-slate-100 dark:border-slate-800/50 text-center">
                    <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Tabellen</div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums leading-none">
                        {loading || !stats ? <Skeleton className="h-6 w-12 mx-auto" /> : stats.tables}
                    </div>
                </div>
            </div>
        </DashboardTile>
    );
};
