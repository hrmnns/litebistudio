import React from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Database, Table as TableIcon } from 'lucide-react';
import { SystemRepository } from '../../../lib/repositories/SystemRepository';
import { DashboardComponent, type DashboardTileProps } from '../ui/DashboardComponent';
import { Skeleton } from '../ui/Skeleton';
import { useAsync } from '../../../hooks/useAsync';
import { useNavigate } from 'react-router-dom';

export const DataInspectorComponent: React.FC<DashboardTileProps> = ({ onRemove, dragHandleProps, onClick, targetView }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: stats, loading, error } = useAsync<{ tables: number; records: number }>(
        () => SystemRepository.getDatabaseStats(),
        [],
        { cacheKey: 'db-stats-tile', ttl: 10 * 60 * 1000 }
    );

    if (error) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-red-200 dark:border-red-900/50 p-4 h-full flex items-center justify-center text-center">
                <p className="text-red-500 font-bold text-[10px] uppercase">{t('common.error')}</p>
            </div>
        );
    }

    const handleClick = () => {
        if (onClick) onClick();
        navigate('/inspector');
    };

    return (
        <DashboardComponent
            title={t('widgets.data_inspector.title')}
            icon={Search}
            iconColor="indigo"
            onClick={onClick || handleClick}
            onRemove={onRemove}
            targetView={targetView}
            dragHandleProps={dragHandleProps}
            backgroundIcon={Search}
            className="cursor-pointer"
            footerLeft={
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        navigate('/inspector');
                    }}
                    className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-indigo-600 uppercase tracking-widest transition-colors group/footer"
                >
                    {t('widgets.data_inspector.details')}
                    <Search className="w-3 h-3 transition-transform group-hover/footer:scale-110" />
                </button>
            }
        >
            <div className="flex flex-col h-full items-center justify-around py-2">
                {/* Primary Metric: Total Records */}
                <div className="text-center group-hover:scale-105 transition-transform duration-500">
                    <div className="flex items-center justify-center gap-1.5 text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1">
                        <TableIcon className="w-3 h-3" />
                        <span>{t('widgets.data_inspector.records_total')}</span>
                    </div>
                    <div className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums leading-none">
                        {loading || !stats ? <Skeleton className="h-8 w-20 mx-auto" /> : stats.records.toLocaleString()}
                    </div>
                </div>

                {/* Secondary Metric: Tables */}
                <div className="w-full pt-4 border-t border-slate-200 dark:border-slate-800/50 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mb-1">
                        <Database className="w-3 h-3" />
                        <span>{t('widgets.data_inspector.tables')}</span>
                    </div>
                    <div className="text-2xl font-black text-slate-700 dark:text-slate-300 tabular-nums leading-none">
                        {loading || !stats ? '...' : stats.tables}
                    </div>
                </div>
            </div>
        </DashboardComponent>
    );
};
