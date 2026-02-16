import React from 'react';
import { useAsync } from '../../hooks/useAsync';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { useNavigate } from 'react-router-dom';
import type { SystemRecord } from '../../types';
import { CheckCircle2, XCircle, HelpCircle, Globe2, ShieldCheck, Cpu, Star } from 'lucide-react';


export const SystemsTile: React.FC = () => {
    const navigate = useNavigate();
    const { data: systems, loading, error } = useAsync<SystemRecord[]>(
        () => SystemRepository.getFavorites(),
        []
    );

    if (loading && !systems) return <div className="p-4 text-center text-slate-400 animate-pulse">Loading favorites...</div>;
    if (error) return <div className="p-4 text-center text-red-500 text-xs text-wrap">Error: {error.message}</div>;

    const getStatusIcon = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'online': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
            case 'offline': return <XCircle className="w-4 h-4 text-red-500" />;
            default: return <HelpCircle className="w-4 h-4 text-slate-400" />;
        }
    };

    const getCategoryIcon = (category: string) => {
        switch (category?.toLowerCase()) {
            case 'business': return <ShieldCheck className="w-3.5 h-3.5" />;
            case 'it': return <Cpu className="w-3.5 h-3.5" />;
            case 'sales': return <Globe2 className="w-3.5 h-3.5" />;
            default: return null;
        }
    };

    return (
        <div
            className="flex flex-col h-full overflow-hidden cursor-pointer group/tile relative"
            onClick={() => navigate('/systems')}
        >

            <div className="flex-1 space-y-2 pr-1 overflow-hidden pointer-events-none">
                {systems && systems.length > 0 ? (
                    systems.map((system: any) => (
                        <div
                            key={system.id}
                            className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-800/50"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                                    {getStatusIcon(system.status)}
                                </div>
                                <div>
                                    <div className="text-[13px] font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 line-clamp-1">
                                        {system.name}
                                        {system.category && (
                                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-slate-200/50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-tighter flex items-center gap-1">
                                                {getCategoryIcon(system.category)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                        <span className={`w-1.5 h-1.5 rounded-full ${system.status === 'online' ? 'bg-emerald-500' : system.status === 'offline' ? 'bg-red-500' : 'bg-slate-300'}`} />
                                        {(system.status || 'unknown').toUpperCase()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-2">
                        <Star className="w-8 h-8 text-slate-200" />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No Favorites Selected</p>
                    </div>
                )}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between pointer-events-none">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Infrastructure Status
                </div>
                <div className="flex -space-x-1">
                    {systems?.slice(0, 3).map((s: any) => (
                        <div key={s.id} className={`w-2 h-2 rounded-full border border-white dark:border-slate-950 ${s.status === 'online' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    ))}
                </div>
            </div>
        </div>
    );
};
