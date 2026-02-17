import React, { useState, useEffect } from 'react';
import { ClipboardList, ListChecks } from 'lucide-react';
import { WorklistRepository } from '../../../lib/repositories/WorklistRepository';
import { DashboardComponent } from '../ui/DashboardComponent';
import type { WorklistStatus } from '../../../types';

interface WorklistComponentProps {
    onClick?: () => void;
    onRemove?: () => void;
    dragHandleProps?: any;
    targetView?: string;
}

export const WorklistComponent: React.FC<WorklistComponentProps> = ({ onClick, onRemove, dragHandleProps, targetView }) => {
    const [counts, setCounts] = useState<Record<WorklistStatus, number> | null>(null);

    const updateCounts = async () => {
        const c = await WorklistRepository.getStatusCounts();
        setCounts(c);
    };

    useEffect(() => {
        updateCounts();
        window.addEventListener('db-updated', updateCounts);
        return () => window.removeEventListener('db-updated', updateCounts);
    }, []);

    const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

    return (
        <DashboardComponent
            title="Arbeitsvorrat"
            icon={ClipboardList}
            iconColor="amber"
            onClick={onClick}
            onRemove={onRemove}
            targetView={targetView}
            dragHandleProps={dragHandleProps}
            backgroundIcon={ListChecks}
        >
            <div className="flex flex-col h-full items-center justify-around py-0.5">
                {/* Main Metric: Total - Slightly more compact */}
                <div className="text-center group-hover:scale-105 transition-transform duration-500">
                    <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Einträge Gesamt</div>
                    <div className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums leading-none">
                        {counts === null ? '...' : total}
                    </div>
                </div>

                {/* Status Breakdown Row - High Density Horizontal Design */}
                <div className="w-full pt-3 border-t border-slate-100 dark:border-slate-800/50">
                    <div className="grid grid-cols-4 gap-1">
                        {/* Offen */}
                        <div className="flex flex-col items-center p-1 rounded-lg bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100/50 dark:border-amber-800/30">
                            <span className="text-[6px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-tighter mb-0.5">Offen</span>
                            <span className="text-xs font-black text-slate-800 dark:text-slate-200 tabular-nums leading-none">
                                {counts?.open ?? 0}
                            </span>
                        </div>
                        {/* OK */}
                        <div className="flex flex-col items-center p-1 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100/50 dark:border-emerald-800/30">
                            <span className="text-[6px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-tighter mb-0.5">OK</span>
                            <span className="text-xs font-black text-slate-800 dark:text-slate-200 tabular-nums leading-none">
                                {counts?.ok ?? 0}
                            </span>
                        </div>
                        {/* Fehler */}
                        <div className="flex flex-col items-center p-1 rounded-lg bg-rose-50/50 dark:bg-rose-900/10 border border-rose-100/50 dark:border-rose-800/30">
                            <span className="text-[6px] font-black text-rose-600 dark:text-rose-500 uppercase tracking-tighter mb-0.5">Fehler</span>
                            <span className="text-xs font-black text-slate-800 dark:text-slate-200 tabular-nums leading-none">
                                {counts?.error ?? 0}
                            </span>
                        </div>
                        {/* Klärung */}
                        <div className="flex flex-col items-center p-1 rounded-lg bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100/50 dark:border-indigo-800/30">
                            <span className="text-[6px] font-black text-indigo-600 dark:text-indigo-500 uppercase tracking-tighter mb-0.5">Klärung</span>
                            <span className="text-xs font-black text-slate-800 dark:text-slate-200 tabular-nums leading-none">
                                {counts?.clarification ?? 0}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardComponent>
    );
};
