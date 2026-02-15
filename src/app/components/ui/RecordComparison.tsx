import React from 'react';
import { AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';

interface RecordComparisonProps {
    leftItem: any;
    rightItem: any;
    leftLabel?: string;
    rightLabel?: string;
    excludeKeys?: string[];
}

export const RecordComparison: React.FC<RecordComparisonProps> = ({
    leftItem,
    rightItem,
    leftLabel = 'Source',
    rightLabel = 'Target',
    excludeKeys = []
}) => {
    // Get all unique keys from both items
    const allKeys = Array.from(new Set([
        ...Object.keys(leftItem || {}),
        ...Object.keys(rightItem || {})
    ])).filter(key => !excludeKeys.includes(key));

    const formatValue = (val: any) => {
        if (val === null || val === undefined || val === '') return '-';
        if (typeof val === 'number') return val.toLocaleString();
        return String(val);
    };

    return (
        <div className="overflow-hidden border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 shadow-sm">
            <div className="grid grid-cols-[2fr,3fr,3fr] bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <div className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 tracking-wider">Field</div>
                <div className="px-4 py-3 text-[10px] font-black uppercase text-blue-600 tracking-wider border-l border-slate-100 dark:border-slate-700">{leftLabel}</div>
                <div className="px-4 py-3 text-[10px] font-black uppercase text-indigo-600 tracking-wider border-l border-slate-100 dark:border-slate-700">{rightLabel}</div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {allKeys.sort().map(key => {
                    const leftVal = leftItem?.[key];
                    const rightVal = rightItem?.[key];
                    const hasDiff = String(leftVal) !== String(rightVal);

                    return (
                        <div
                            key={key}
                            className={`grid grid-cols-[2fr,3fr,3fr] transition-colors ${hasDiff ? 'bg-amber-50/50 dark:bg-amber-900/10' : 'hover:bg-slate-50/30 dark:hover:bg-slate-800/30'}`}
                        >
                            <div className="px-4 py-3 text-xs font-bold text-slate-400 truncate flex items-center gap-2">
                                {key}
                                {hasDiff && <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />}
                                {!hasDiff && <CheckCircle2 className="w-3 h-3 text-emerald-500/30 shrink-0" />}
                            </div>

                            <div className={`px-4 py-3 text-sm font-medium border-l border-slate-100 dark:border-slate-800 break-all ${hasDiff ? 'text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-slate-400'}`}>
                                {formatValue(leftVal)}
                            </div>

                            <div className={`px-4 py-3 text-sm font-mono border-l border-slate-100 dark:border-slate-800 break-all flex items-center gap-2 ${hasDiff ? 'text-indigo-600 dark:text-indigo-400 font-black' : 'text-slate-600 dark:text-slate-400'}`}>
                                {hasDiff && <ArrowRight className="w-3 h-3 text-amber-500 shrink-0" />}
                                {formatValue(rightVal)}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
