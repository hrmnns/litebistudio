import React from 'react';
import { useAsync } from '../../../hooks/useAsync';
import { DashboardRepository } from '../../../lib/repositories/DashboardRepository';
import { Wallet, TrendingUp } from 'lucide-react';
import { DashboardComponent } from '../ui/DashboardComponent';

export const ItCostsComponent: React.FC<{ onRemove?: () => void; dragHandleProps?: any; onClick?: () => void; targetView?: string }> = ({ onRemove, dragHandleProps, onClick, targetView }) => {
    const { data, loading, error } = useAsync<{
        totalAmount: number;
        vendorCount: number;
        avgMonthlySpend: number;
        monthCount: number;
    }>(
        () => DashboardRepository.getItCostsMetrics(),
        [],
        { cacheKey: 'it-costs-tile-metrics', ttl: 30 * 60 * 1000 }
    );

    if (error) return <div className="p-4 text-center text-red-500 text-xs">Error: {error.message}</div>;

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

    return (
        <DashboardComponent
            title="IT Kosten"
            icon={Wallet}
            iconColor="emerald"
            onClick={onClick}
            onRemove={onRemove}
            targetView={targetView}
            dragHandleProps={dragHandleProps}
            backgroundIcon={Wallet}
        >
            <div className="flex flex-col h-full items-center justify-around py-1">
                {/* Main Metric */}
                <div className="text-center group-hover:scale-105 transition-transform duration-500">
                    <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Gesamtkosten</div>
                    <div className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums leading-none">
                        {loading || !data ? '...' : formatCurrency(data.totalAmount)}
                    </div>
                </div>

                {/* Growth/Comparison Section -> Averages Section */}
                <div className="w-full pt-4 border-t border-slate-100 dark:border-slate-800/50">
                    <div className="flex items-center justify-between px-1">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                                <TrendingUp className="w-2.5 h-2.5" />
                                Durchschnitt/Monat
                            </span>
                            <div className="text-sm font-black text-slate-700 dark:text-slate-300">
                                {loading || !data ? '...' : formatCurrency(data.avgMonthlySpend)}
                            </div>
                        </div>
                        <div className="h-8 w-px bg-slate-100 dark:bg-slate-800/50" />
                        <div className="flex flex-col items-end text-right">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Monate Gesamt</span>
                            <div className="text-sm font-black text-slate-700 dark:text-slate-300">
                                {loading || !data ? '...' : data.monthCount}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardComponent>
    );
};
