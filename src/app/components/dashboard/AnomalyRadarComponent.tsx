import React from 'react';
import { useAsync } from '../../../hooks/useAsync';
import { AnomalyRepository } from '../../../lib/repositories/AnomalyRepository';
import { Radar } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton';
import { DashboardComponent } from '../ui/DashboardComponent';

export const AnomalyRadarComponent: React.FC<{ onRemove?: () => void; dragHandleProps?: any; onClick?: () => void; targetView?: string }> = ({ onRemove, dragHandleProps, onClick, targetView }) => {
    const { data, loading, error } = useAsync<{
        metrics: { totalRisks: number; maxScore: number; criticalRisks: number };
    }>(
        async () => {
            const metrics = await AnomalyRepository.getAnomalyMetrics();
            return { metrics };
        },
        [],
        { cacheKey: 'tile-anomaly-radar-optimized', ttl: 5 * 60 * 1000 }
    );

    if (error) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-red-200 dark:border-red-900/50 p-4 h-full flex items-center justify-center text-center">
                <p className="text-red-500 font-bold text-sm">Fehler beim Laden</p>
            </div>
        );
    }

    if (loading || !data) {
        return (
            <div className="flex flex-col h-full gap-4 p-1">
                <div className="flex gap-4">
                    <Skeleton className="h-12 flex-1 rounded-xl" />
                    <Skeleton className="h-12 flex-1 rounded-xl" />
                </div>
                <div className="space-y-3">
                    <Skeleton className="h-10 rounded-lg" />
                    <Skeleton className="h-10 rounded-lg" />
                    <Skeleton className="h-10 rounded-lg" />
                </div>
            </div>
        );
    }

    const { metrics } = data;

    return (
        <DashboardComponent
            title="Anomaly Radar"
            icon={Radar}
            iconColor="rose"
            onClick={onClick}
            onRemove={onRemove}
            targetView={targetView}
            dragHandleProps={dragHandleProps}
            backgroundIcon={Radar}
        >
            <div className="flex flex-col h-full items-center justify-around py-2">
                {/* Primary Metric: Total Count */}
                <div className="text-center group-hover:scale-105 transition-transform duration-500">
                    <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Aktiv</div>
                    <div className="text-5xl font-black text-rose-600 dark:text-rose-500 tracking-tighter tabular-nums leading-none mb-1">
                        {metrics.totalRisks}
                    </div>
                </div>

                {/* Secondary Metrics: Max Score & Critical */}
                <div className="w-full grid grid-cols-2 gap-2 border-t border-slate-100 dark:border-slate-800/50 pt-4">
                    <div className="text-center">
                        <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">Max Score</div>
                        <div className="text-lg font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                            {metrics.maxScore}
                        </div>
                    </div>
                    <div className="text-center border-l border-slate-100 dark:border-slate-800/50">
                        <div className="text-[10px] font-black text-rose-500 dark:text-rose-400 uppercase tracking-widest leading-none">Kritisch</div>
                        <div className="text-lg font-black text-rose-600 dark:text-rose-500 mt-1 tabular-nums">
                            {metrics.criticalRisks}
                        </div>
                    </div>
                </div>
            </div>
        </DashboardComponent>
    );
};
