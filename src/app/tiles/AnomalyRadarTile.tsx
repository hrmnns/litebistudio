import React, { useMemo } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { AnomalyRepository } from '../../lib/repositories/AnomalyRepository';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, TrendingUp, Sparkles, ArrowRight } from 'lucide-react';


import type { Anomaly } from '../../types';


export const AnomalyRadarTile: React.FC = () => {
    const navigate = useNavigate();
    // Fetch top 3 critical anomalies from the latest period
    const { data: anomalies, loading } = useAsync<Anomaly[]>(
        () => AnomalyRepository.getTopRisks(3),
        []
    );

    const topRisks = useMemo(() => anomalies || [], [anomalies]);

    const getRiskColor = (score: number) => {
        if (score >= 80) return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800';
        if (score >= 50) return 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800';
        return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800';
    };

    if (loading) return <div className="p-4 text-center text-slate-500 animate-pulse">Scanning for anomalies...</div>;

    return (
        <div className="flex flex-col h-full relative overflow-hidden">
            {/* Radar Animation Background */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl -mr-10 -mt-10 animate-pulse pointer-events-none"></div>

            <div className="flex items-center justify-between mb-4 z-10">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <ShieldAlert className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                        </span>
                    </div>
                    <h3 className="font-bold text-slate-700 dark:text-white">Anomaly Radar</h3>
                </div>
                <button
                    onClick={() => navigate('/anomalies')}
                    className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                    View All <ArrowRight className="w-3 h-3" />
                </button>
            </div>

            <div className="flex-1 flex flex-col gap-2 z-10">
                {topRisks.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-center">
                        <Sparkles className="w-8 h-8 mb-2 opacity-50" />
                        <span className="text-xs">No critical anomalies detected.</span>
                        <span className="text-[10px] opacity-70">System is running stable.</span>
                    </div>
                ) : (
                    topRisks.map((risk, i) => (
                        <div
                            key={i}
                            onClick={() => navigate('/anomalies')}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer group transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700"
                        >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs border ${getRiskColor(risk.RiskScore)}`}>
                                {risk.RiskScore}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-center">
                                    <div className="text-[10px] font-black uppercase text-slate-500 tracking-wider truncate">
                                        {risk.VendorName}
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-400">
                                        {risk.Period}
                                    </div>
                                </div>
                                <div className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                    {risk.Description}
                                </div>
                                <div className="text-[9px] text-slate-400 font-mono truncate mb-0.5">
                                    #{risk.DocumentId}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 rounded">
                                        €{risk.Amount.toLocaleString()}
                                    </span>
                                    {risk.AnomalyType === 'Cost Drift' && (
                                        <span className="text-[10px] font-bold text-red-500 flex items-center gap-0.5">
                                            <TrendingUp className="w-3 h-3" />
                                            +€{(risk.Amount - (risk.PrevAmount || 0)).toLocaleString()}
                                        </span>
                                    )}
                                    <span className="text-[9px] text-slate-400 uppercase tracking-wide">
                                        {risk.AnomalyType}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
