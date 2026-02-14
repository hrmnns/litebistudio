import React from 'react';
import { useQuery } from '../../hooks/useQuery';
import { Wallet, Users, ArrowUpRight } from 'lucide-react';

interface ItCostsTileProps {
    onNavigate?: (view: any) => void;
}

export const ItCostsTile: React.FC<ItCostsTileProps> = ({ onNavigate }) => {
    // 1. Fetch aggregates
    const { data: summaryData, loading: summaryLoading, error: summaryError } = useQuery("SELECT * FROM it_costs_summary");
    // 2. Fetch history for trend (last 4 months)
    const { data: trendData, loading: trendLoading } = useQuery("SELECT * FROM latest_kpis WHERE metric = 'IT Costs' ORDER BY date DESC LIMIT 4");

    if (summaryLoading || trendLoading) return <div className="p-4 text-center text-slate-500 animate-pulse">Loading costs...</div>;
    if (summaryError) return <div className="p-4 text-center text-red-500">Error: {summaryError.message}</div>;

    const summary = summaryData?.[0] || { total_amount: 0, active_vendors: 0, latest_date: 'N/A', latest_year: 'N/A' };

    // Trend calculation
    let trendPercent = 0;
    let isTrendUp = false;
    if (trendData && trendData.length >= 2) {
        const latest = trendData[0].value;
        const previousThree = trendData.slice(1);
        const avgPrevious = previousThree.reduce((acc: number, r: any) => acc + r.value, 0) / previousThree.length;

        if (avgPrevious > 0) {
            trendPercent = ((latest - avgPrevious) / avgPrevious) * 100;
            isTrendUp = latest > avgPrevious;
        }
    }

    return (
        <div className="flex flex-col h-full gap-4">
            {/* Top Metrics Row */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50/50 dark:bg-blue-900/10 p-3 rounded-xl border border-blue-100/50 dark:border-blue-900/30">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
                        <Wallet className="w-4 h-4" />
                        <span className="text-[10px] uppercase font-bold tracking-wider">Total Spend ({summary.latest_year})</span>
                    </div>
                    <div className="text-xl font-bold text-slate-900 dark:text-white leading-none text-right">
                        €{summary.total_amount?.toLocaleString()}
                    </div>
                </div>

                <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-3 rounded-xl border border-indigo-100/50 dark:border-indigo-900/30">
                    <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-1">
                        <Users className="w-4 h-4" />
                        <span className="text-[10px] uppercase font-bold tracking-wider">Active Vendors</span>
                    </div>
                    <div className="text-xl font-bold text-slate-900 dark:text-white leading-none text-right">
                        {summary.active_vendors}
                    </div>
                </div>
            </div>

            {/* Trend Indicator Section */}
            <div className="flex-1 flex flex-col justify-center items-center bg-white dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">Cost Trend (vs. last 3m avg)</div>
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${isTrendUp ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                        {isTrendUp ? <ArrowUpRight className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6 rotate-90" />}
                    </div>
                    <div>
                        <div className={`text-2xl font-bold ${isTrendUp ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {isTrendUp ? '+' : ''}{trendPercent.toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium">
                            Latest: €{trendData?.[0]?.value?.toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>

            <button
                onClick={() => onNavigate?.('it-costs-year')}
                className="w-full py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors border border-dashed border-slate-200 dark:border-slate-700 rounded-lg hover:border-blue-400"
            >
                View Detailed Cost Analysis
            </button>
        </div>
    );
};
