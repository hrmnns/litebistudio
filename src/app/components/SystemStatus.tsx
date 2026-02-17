import React, { useEffect, useState } from 'react';
import { Database, Activity, ChevronRight } from 'lucide-react';
import { useQuery } from '../../hooks/useQuery';

import { SystemHealthModal } from './SystemHealthModal';

interface SystemStatusProps {
    isCollapsed?: boolean;
}

export const SystemStatus: React.FC<SystemStatusProps> = ({ isCollapsed }) => {
    const { data: countData, loading, refresh } = useQuery<{ kpis: number, invoices: number, events: number }>(`
        SELECT 
            (SELECT count(*) FROM kpi_data) as kpis,
            (SELECT count(*) FROM invoice_items) as invoices,
            (SELECT count(*) FROM operations_events) as events
    `);

    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const version = __APP_VERSION__;

    // Refresh every 30s to keep stats updated
    useEffect(() => {
        const interval = setInterval(refresh, 30000);
        return () => clearInterval(interval);
    }, [refresh]);

    const stats = countData && countData.length > 0 ? countData[0] : { kpis: 0, invoices: 0, events: 0 };
    const totalRecords = (stats.kpis || 0) + (stats.invoices || 0) + (stats.events || 0);

    return (
        <>
            <button
                className={`w-full mt-2 text-left cursor-pointer bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 hover:border-blue-300 dark:hover:border-blue-800 p-2.5 rounded-xl transition-all group flex flex-col gap-1.5 ${isCollapsed ? 'md:items-center md:p-2' : ''}`}
                onClick={() => setIsDetailsOpen(true)}
                title={isCollapsed ? 'System Status' : ''}
            >
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform flex-shrink-0" />
                    <span className={`text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all duration-300 ${isCollapsed ? 'md:opacity-0 md:w-0 overflow-hidden' : 'opacity-100'}`}>System Status</span>
                    {!isCollapsed && (
                        <div className="ml-auto flex items-center gap-1.5 transition-all duration-300">
                            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full dark:bg-green-900/30 dark:text-green-400 font-medium">Online</span>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                    )}
                </div>

                {!isCollapsed && (
                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pl-6 transition-all duration-300">
                        <div className="flex items-center gap-1.5">
                            <Database className="w-3 h-3" />
                            <span>{loading ? '...' : `${(totalRecords / 1000).toFixed(1)}k Records`}</span>
                        </div>
                        <span className="font-mono opacity-60">v{version}</span>
                    </div>
                )}
            </button>

            <SystemHealthModal
                isOpen={isDetailsOpen}
                onClose={() => setIsDetailsOpen(false)}
            />
        </>
    );
};
