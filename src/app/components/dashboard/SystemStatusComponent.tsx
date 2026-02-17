import React, { useState, useEffect } from 'react';
import { Activity, Zap, Cpu } from 'lucide-react';
import { DashboardComponent } from '../ui/DashboardComponent';

export const SystemStatusComponent: React.FC<{ onRemove?: () => void; dragHandleProps?: any; onClick?: () => void; targetView?: string }> = ({ onRemove, dragHandleProps, onClick, targetView }) => {
    const [memory, setMemory] = useState<{ used: number; total: number } | null>(null);
    const [loadTime, setLoadTime] = useState<number | null>(null);

    useEffect(() => {
        // Get navigation timing for load time
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (nav) {
            setLoadTime(Math.round(nav.duration));
        }

        // Poll memory usage if available
        const updateMetrics = () => {
            if ((performance as any).memory) {
                const mem = (performance as any).memory;
                setMemory({
                    used: Math.round(mem.usedJSHeapSize / 1024 / 1024),
                    total: Math.round(mem.jsHeapSizeLimit / 1024 / 1024)
                });
            }
        };

        updateMetrics();
        const interval = setInterval(updateMetrics, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <DashboardComponent
            title="System Status"
            icon={Activity}
            iconColor="emerald"
            onRemove={onRemove}
            dragHandleProps={dragHandleProps}
            onClick={onClick}
            targetView={targetView}
            backgroundIcon={Activity}
        >
            <div className="flex flex-col h-full items-center justify-around py-2">
                {/* Primary Metric: Memory */}
                <div className="text-center group-hover:scale-105 transition-transform duration-500">
                    <div className="flex items-center justify-center gap-1.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">
                        <Cpu className="w-3 h-3" />
                        <span>Memory Usage</span>
                    </div>
                    <div className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums leading-none">
                        {memory ? `${memory.used} MB` : '---'}
                    </div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1">
                        von {memory ? memory.total : '---'} MB Heap
                    </div>
                </div>

                {/* Secondary Metric: Load Time */}
                <div className="w-full pt-4 border-t border-slate-100 dark:border-slate-800/50 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-[10px] font-black text-blue-500 dark:text-blue-400 uppercase tracking-widest mb-1">
                        <Zap className="w-3 h-3" />
                        <span>Load Time</span>
                    </div>
                    <div className="text-2xl font-black text-slate-700 dark:text-slate-300 tabular-nums leading-none">
                        {loadTime ? `${loadTime} ms` : '---'}
                    </div>
                </div>
            </div>
        </DashboardComponent>
    );
};
