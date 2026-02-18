import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Zap, Cpu } from 'lucide-react';
import { DashboardComponent } from '../ui/DashboardComponent';
import { SystemHealthModal } from '../SystemHealthModal';

export const SystemStatusComponent: React.FC<{ onRemove?: () => void; dragHandleProps?: any; onClick?: () => void; targetView?: string }> = ({ onRemove, dragHandleProps, onClick, targetView }) => {
    const { t } = useTranslation();
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [memory, setMemory] = useState<{ used: number; total: number } | null>(null);
    const [loadTime, setLoadTime] = useState<number | null>(null);

    React.useEffect(() => {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (nav) setLoadTime(Math.round(nav.duration));

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

    const handleClick = () => {
        setIsModalOpen(true);
        if (onClick) onClick();
    };

    return (
        <>
            <DashboardComponent
                title={t('widgets.system_status.title')}
                icon={Activity}
                iconColor="emerald"
                onRemove={onRemove}
                dragHandleProps={dragHandleProps}
                onClick={handleClick}
                targetView={targetView}
                backgroundIcon={Activity}
                className="cursor-pointer"
                footerLeft={
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-blue-600 uppercase tracking-widest transition-colors group/footer"
                    >
                        {t('widgets.system_status.details')}
                        <Activity className="w-3 h-3 transition-transform group-hover/footer:scale-110" />
                    </button>
                }
            >
                <div className="flex flex-col h-full items-center justify-around py-2">
                    {/* Primary Metric: Memory */}
                    <div className="text-center group-hover:scale-105 transition-transform duration-500">
                        <div className="flex items-center justify-center gap-1.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">
                            <Cpu className="w-3 h-3" />
                            <span>{t('widgets.system_status.memory_usage')}</span>
                        </div>
                        <div className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums leading-none">
                            {memory ? `${memory.used} MB` : '---'}
                        </div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1">
                            {t('widgets.system_status.heap_from', { total: memory ? memory.total : '---' })}
                        </div>
                    </div>

                    {/* Secondary Metric: Load Time */}
                    <div className="w-full pt-4 border-t border-slate-200 dark:border-slate-800/50 text-center">
                        <div className="flex items-center justify-center gap-1.5 text-[10px] font-black text-blue-500 dark:text-blue-400 uppercase tracking-widest mb-1">
                            <Zap className="w-3 h-3" />
                            <span>{t('widgets.system_status.load_time')}</span>
                        </div>
                        <div className="text-2xl font-black text-slate-700 dark:text-slate-300 tabular-nums leading-none">
                            {loadTime ? `${loadTime} ms` : '---'}
                        </div>
                    </div>
                </div>
            </DashboardComponent>

            <SystemHealthModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
        </>
    );
};
