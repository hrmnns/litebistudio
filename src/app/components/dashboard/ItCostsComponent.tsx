import React from 'react';
import { useAsync } from '../../../hooks/useAsync';
import { DashboardRepository } from '../../../lib/repositories/DashboardRepository';
import { Wallet, TrendingUp, Calendar } from 'lucide-react';
import { DashboardComponent } from '../ui/DashboardComponent';
import type { KpiRecord } from '../../../types';

export const ItCostsComponent: React.FC<{ onRemove?: () => void; dragHandleProps?: any; onClick?: () => void; targetView?: string }> = ({ onRemove, dragHandleProps, onClick, targetView }) => {
    const { data, loading, error } = useAsync<{
        currentYearKpi: KpiRecord[];
        previousYearKpi: KpiRecord[];
    }>(
        async () => {
            const today = new Date();
            const currentYear = today.getFullYear();
            const [current, previous] = await Promise.all([
                DashboardRepository.getKpiByYear(currentYear),
                DashboardRepository.getKpiByYear(currentYear - 1)
            ]);
            return { currentYearKpi: current, previousYearKpi: previous };
        },
        [],
        { cacheKey: 'it-costs-tile-comparison', ttl: 30 * 60 * 1000 }
    );

    if (error) return <div className="p-4 text-center text-red-500 text-xs">Error: {error.message}</div>;

    const totalCurrent = data?.currentYearKpi?.reduce((sum, item) => sum + item.value, 0) || 0;
    const totalPrevious = data?.previousYearKpi?.reduce((sum, item) => sum + item.value, 0) || 0;
    const yearOverYear = totalPrevious > 0 ? ((totalCurrent - totalPrevious) / totalPrevious) * 100 : 0;

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

    return (
        <DashboardComponent
            title="IT Kosten"
            icon={Wallet}
            iconColor="amber"
            onClick={onClick}
            onRemove={onRemove}
            targetView={targetView}
            dragHandleProps={dragHandleProps}
            backgroundIcon={Wallet}
        >
            <div className="flex flex-col h-full items-center justify-around py-1">
                {/* Main Metric */}
                <div className="text-center group-hover:scale-105 transition-transform duration-500">
                    <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Total Costs YTD</div>
                    <div className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums leading-none">
                        {loading || !data ? '...' : formatCurrency(totalCurrent)}
                    </div>
                </div>

                {/* Growth/Comparison Section */}
                <div className="w-full pt-4 border-t border-slate-100 dark:border-slate-800/50">
                    <div className="flex items-center justify-between px-1">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                                <Calendar className="w-2.5 h-2.5" />
                                Growth (YoY)
                            </span>
                            <div className={`text-sm font-black flex items-center gap-1 ${yearOverYear >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                <TrendingUp className={`w-3.5 h-3.5 ${yearOverYear < 0 ? 'rotate-180' : ''}`} />
                                {yearOverYear >= 0 ? '+' : ''}{yearOverYear.toFixed(1)}%
                            </div>
                        </div>
                        <div className="h-8 w-px bg-slate-100 dark:bg-slate-800/50" />
                        <div className="flex flex-col items-end text-right">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Prior Year</span>
                            <div className="text-sm font-black text-slate-700 dark:text-slate-300">
                                {loading || !data ? '...' : formatCurrency(totalPrevious)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardComponent>
    );
};
