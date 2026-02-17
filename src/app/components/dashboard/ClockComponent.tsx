import React, { useState, useEffect, useMemo } from 'react';
import { Clock, Calendar } from 'lucide-react';
import { DashboardComponent } from '../ui/DashboardComponent';

export const ClockComponent: React.FC<{ onRemove?: () => void; dragHandleProps?: any; onClick?: () => void; targetView?: string }> = ({ onRemove, dragHandleProps, onClick, targetView }) => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const dateStr = useMemo(() => {
        return new Intl.DateTimeFormat('de-DE', {
            weekday: 'long',
            day: '2-digit',
            month: 'long'
        }).format(time);
    }, [time]);

    // Prominent Time formatting with timezone
    const timeStr = time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const timeZone = 'CET'; // Central European Time

    return (
        <DashboardComponent
            title="Uhrzeit"
            icon={Clock}
            iconColor="indigo"
            onRemove={onRemove}
            dragHandleProps={dragHandleProps}
            onClick={onClick}
            targetView={targetView}
            backgroundIcon={Clock}
        >
            <div className="flex flex-col h-full items-center justify-center -mt-2">
                {/* Main Clock & Timezone */}
                <div className="text-center group-hover:scale-110 transition-transform duration-700">
                    <div className="flex items-baseline justify-center gap-1.5">
                        <span className="text-6xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums leading-none">
                            {timeStr}
                        </span>
                        <span className="text-xs font-black text-indigo-500/80 dark:text-indigo-400/80 uppercase tracking-widest tabular-nums">
                            {timeZone}
                        </span>
                    </div>

                    {/* Prominent Date below time */}
                    <div className="mt-4 flex flex-col items-center">
                        <div className="h-px w-8 bg-slate-100 dark:bg-slate-800 mb-4" />
                        <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-100 dark:border-slate-800/50">
                            <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 tracking-tight whitespace-nowrap">
                                {dateStr}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardComponent>
    );
};
