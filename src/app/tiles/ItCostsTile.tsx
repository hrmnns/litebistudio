import React from 'react';
import { useAsync } from '../../hooks/useAsync';
import { DashboardRepository } from '../../lib/repositories/DashboardRepository';
import { Wallet, Users, ArrowUpRight } from 'lucide-react';

import type { KpiRecord, ItCostsSummary } from '../../types';


export const ItCostsTile: React.FC = () => {
    // 1. Fetch aggregates
    const { data: summary, loading: summaryLoading, error: summaryError } = useAsync<ItCostsSummary | null>(
        () => DashboardRepository.getItCostsSummary(),
        []
    );

    // 2. Fetch history for trend (last 4 months)
    const { data: trendData, loading: trendLoading } = useAsync<KpiRecord[]>(
        () => DashboardRepository.getItCostsTrend(),
        []
    );

    if (summaryLoading || trendLoading) return <div className="p-4 text-center text-slate-500 animate-pulse">Loading costs...</div>;
    if (summaryError) return <div className="p-4 text-center text-red-500">Error: {summaryError.message}</div>;

    if (summaryLoading || trendLoading) return <div className="p-4 text-center text-slate-500 animate-pulse">Loading costs...</div>;
    // if (summaryError) return <div className="p-4 text-center text-red-500">Error: {summaryError.message}</div>;

    const displaySummary = summary || { total_amount: 0, active_vendors: 0, latest_date: 'N/A', latest_year: 0 };

    // Trend calculation: Comparison between latest month and previous month (MoM)
    let trendPercent = 0;
    let isTrendUp = false;
    if (trendData && trendData.length >= 2) {
        const latest = trendData[0].value;
        const previous = trendData[1].value;

        if (previous > 0) {
            trendPercent = ((latest - previous) / previous) * 100;
            isTrendUp = latest > previous;
        }
    }

    return (
        <div className="flex flex-col h-full gap-4">
            {/* Top Metrics Row */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50/50 dark:bg-blue-900/10 p-3 rounded-xl border border-blue-100/50 dark:border-blue-900/30">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                        <Wallet className="w-3.5 h-3.5" />
                        <span className="text-[9px] uppercase font-bold tracking-wider text-left">Total Spend ({displaySummary.latest_year})</span>
                    </div>
                    <div className="text-xl font-black text-slate-900 dark:text-white leading-none text-right">
                        €{displaySummary.total_amount?.toLocaleString()}
                    </div>
                </div>

                <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-3 rounded-xl border border-indigo-100/50 dark:border-indigo-900/30">
                    <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-2">
                        <Users className="w-3.5 h-3.5" />
                        <span className="text-[9px] uppercase font-bold tracking-wider text-left">Active Vendors</span>
                    </div>
                    <div className="text-xl font-black text-slate-900 dark:text-white leading-none text-right">
                        {displaySummary.active_vendors}
                    </div>
                </div>
            </div>

            {/* Trend Indicator Section */}
            <div className="flex-1 flex flex-col justify-center bg-white dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700 p-4 relative overflow-hidden">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">Cost Trend (vs. previous month)</div>

                <div className="flex items-center justify-between">
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

                    {/* Sparkline */}
                    {trendData && trendData.length >= 2 && (
                        <div className="w-24 h-12 flex items-end">
                            <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
                                {(() => {
                                    const points = [...trendData].reverse();
                                    const min = Math.min(...points.map(p => p.value));
                                    const max = Math.max(...points.map(p => p.value));
                                    const range = max - min || 1;

                                    // Calculate path
                                    const coords = points.map((p, i) => {
                                        const x = (i / (points.length - 1)) * 100;
                                        const y = 40 - ((p.value - min) / range) * 30 - 5; // 5px padding
                                        return `${x},${y}`;
                                    });

                                    return (
                                        <>
                                            <path
                                                d={`M ${coords.join(' L ')}`}
                                                fill="none"
                                                stroke={isTrendUp ? '#ef4444' : '#10b981'}
                                                strokeWidth="2.5"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                            <path
                                                d={`M ${coords.join(' L ')} L 100,40 L 0,40 Z`}
                                                fill={`url(#gradient-${isTrendUp ? 'red' : 'green'})`}
                                                opacity="0.2"
                                            />
                                            <defs>
                                                <linearGradient id="gradient-red" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#ef4444" />
                                                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                                                </linearGradient>
                                                <linearGradient id="gradient-green" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#10b981" />
                                                    <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                                                </linearGradient>
                                            </defs>
                                        </>
                                    );
                                })()}
                            </svg>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
