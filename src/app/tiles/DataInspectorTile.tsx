import React, { useState, useEffect } from 'react';
import { Database, Search, Layers, Hash } from 'lucide-react';
import { SystemRepository } from '../../lib/repositories/SystemRepository';

export const DataInspectorTile: React.FC = () => {
    const [stats, setStats] = useState<{ tables: number; records: number }>({ tables: 0, records: 0 });
    const [loading, setLoading] = useState(true);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const stats = await SystemRepository.getDatabaseStats();
            setStats(stats);
        } catch (e) {
            console.error('Failed to fetch DB stats', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        window.addEventListener('db-updated', fetchStats);
        return () => window.removeEventListener('db-updated', fetchStats);
    }, []);

    return (
        <div className="flex flex-col h-full justify-between p-1">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                        Struktur & Daten
                    </p>
                    <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">Database Inspector</h3>
                </div>
                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                    <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 my-4">
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
                    <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
                        <Layers className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-tight">Tabellen</span>
                    </div>
                    <div className="text-2xl font-black text-slate-800 dark:text-white">
                        {loading ? '...' : stats.tables}
                    </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
                    <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
                        <Hash className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-tight">Datensätze</span>
                    </div>
                    <div className="text-2xl font-black text-slate-800 dark:text-white">
                        {loading ? '...' : stats.records.toLocaleString()}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                <span>Details ansehen</span>
                <Search className="w-3 h-3" />
            </div>

            <div className="absolute top-0 right-0 p-4 opacity-[0.03] dark:opacity-[0.07] pointer-events-none">
                <Search className="w-32 h-32 -rotate-12 translate-x-8 -translate-y-4" />
            </div>
        </div>
    );
};
