import React from 'react';
import { useAsync } from '../../hooks/useAsync';
import { DashboardRepository } from '../../lib/repositories/DashboardRepository';
import type { DbRow } from '../../types';
import { CheckCircle, AlertCircle, Clock } from 'lucide-react';

export const OperationsTile: React.FC = () => {
    const { data, loading, error } = useAsync<DbRow[]>(
        () => DashboardRepository.getRecentOperations(),
        []
    );

    if (loading) return <div className="p-4 text-center text-slate-500">Loading...</div>;
    if (error) return <div className="p-4 text-center text-red-500">Error: {error.message}</div>;
    if (!data || data.length === 0) return <div className="p-4 text-center text-slate-500">No events.</div>;

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-auto space-y-3">
                {data.map((row: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <div className="mt-0.5">
                            {row.status === 'Resolved' && <CheckCircle className="w-5 h-5 text-green-500" />}
                            {row.status === 'Scheduled' && <Clock className="w-5 h-5 text-blue-500" />}
                            {row.status === 'Incident' && <AlertCircle className="w-5 h-5 text-red-500" />}
                        </div>
                        <div>
                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{row.event_name}</div>
                            <div className="text-xs text-slate-500">{new Date(row.timestamp).toLocaleString()}</div>
                            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mt-1">{row.status}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
