import React from 'react';
import { useAsync } from '../../../hooks/useAsync';
import { SystemRepository } from '../../../lib/repositories/SystemRepository';
import type { SystemRecord } from '../../../types';
import { Server } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton';
import { DashboardComponent } from '../ui/DashboardComponent';

export const SystemsComponent: React.FC<{ onRemove?: () => void; dragHandleProps?: any; onClick?: () => void; targetView?: string }> = ({ onRemove, dragHandleProps, onClick, targetView }) => {
    const { data, loading, error } = useAsync<{ favorites: SystemRecord[]; count: number }>(
        async () => {
            const [favorites, count] = await Promise.all([
                SystemRepository.getFavorites(3),
                SystemRepository.getCount()
            ]);
            return { favorites, count };
        },
        [],
        { cacheKey: 'systems-tile-square', ttl: 10 * 60 * 1000 }
    );

    if (error) return <div className="p-4 text-center text-red-500 text-[10px] font-bold uppercase">Fehler: Repository</div>;

    const getStatusColor = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'online': return 'bg-emerald-500';
            case 'offline': return 'bg-rose-500';
            default: return 'bg-slate-300';
        }
    };

    return (
        <DashboardComponent
            title="Systeme"
            icon={Server}
            iconColor="blue"
            onClick={onClick}
            onRemove={onRemove}
            targetView={targetView}
            dragHandleProps={dragHandleProps}
            backgroundIcon={Server}
        >
            <div className="flex flex-col h-full items-center justify-around py-0.5">
                {/* Primary Metric: Total Systems */}
                <div className="text-center group-hover:scale-105 transition-transform duration-500">
                    <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Systeme Gesamt</div>
                    <div className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums leading-none">
                        {loading || !data ? '...' : data.count}
                    </div>
                </div>

                {/* Favorites Section - High Density Vertical List */}
                <div className="w-full pt-3 border-t border-slate-100 dark:border-slate-800/50">
                    <div className="space-y-1.5">
                        {loading || !data ? (
                            Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-3 w-full rounded" />)
                        ) : data.favorites.length > 0 ? (
                            data.favorites.map((system) => (
                                <div key={system.id} className="flex items-center gap-2 min-w-0">
                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(system.status)}`} />
                                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate tracking-tight">
                                        {system.name}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest text-center py-1">
                                Keine Favoriten
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DashboardComponent>
    );
};
