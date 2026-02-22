
import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import { X, GripVertical, type LucideIcon, Maximize2, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface DashboardTileProps {
    onRemove?: () => void;
    onClick?: () => void;
    targetView?: string;
    dragHandleProps?: Record<string, unknown>;
}

interface DashboardComponentProps {
    title: string;
    icon: LucideIcon;
    iconColor?: 'blue' | 'emerald' | 'rose' | 'amber' | 'indigo' | 'slate';
    children: React.ReactNode;
    onRemove?: () => void;
    onClick?: () => void;
    targetView?: string;
    dragHandleProps?: Record<string, unknown>;
    footerLeft?: React.ReactNode;
    footerRight?: React.ReactNode;
    className?: string;
    backgroundIcon?: LucideIcon;
}

const colorStyles = {
    blue: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400',
    emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400',
    rose: 'text-rose-600 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400',
    amber: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400',
    indigo: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400',
    slate: 'text-slate-600 bg-slate-50 dark:bg-slate-900/20 dark:text-slate-400',
};

export const DashboardComponent: React.FC<DashboardComponentProps> = ({
    title,
    icon: Icon,
    iconColor = 'blue',
    children,
    onRemove,
    onClick,
    targetView,
    dragHandleProps,
    footerLeft,
    footerRight,
    className,
    backgroundIcon: BackgroundIcon,
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    // Smart Footer Logic: If targetView is present and no footer is provided, show "Detailansicht"
    const hasFooter = footerLeft || footerRight || targetView;
    const effectiveFooterLeft = footerLeft || (targetView && !footerRight ? (
        <button
            onClick={(e) => { e.stopPropagation(); navigate(targetView); }}
            className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-blue-600 uppercase tracking-widest transition-colors group/footer"
        >
            {t('common.open_details')}
            <ChevronRight className="w-3 h-3 transition-transform group-hover/footer:translate-x-0.5" />
        </button>
    ) : null);

    return (
        <div className={cn(
            "group relative flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700/50 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-none transition-all duration-500 overflow-hidden h-full",
            onClick && "cursor-pointer active:scale-[0.98]",
            className
        )}>
            {/* Background Decorative Icon */}
            {BackgroundIcon && (
                <div className="absolute -right-8 -bottom-8 text-slate-50/50 dark:text-slate-900/20 group-hover:text-slate-100/50 dark:group-hover:text-slate-900/40 transition-colors duration-500">
                    <BackgroundIcon size={160} strokeWidth={1} />
                </div>
            )}

            {/* Header - Reduced padding (p-5 pb-4 -> pt-2.5 pb-2.5 px-5) */}
            <div className="relative flex items-center justify-between pt-2.5 pb-2.5 px-5 bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-200 dark:border-slate-800/50">
                <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("p-1.5 rounded-xl shrink-0 shadow-sm", colorStyles[iconColor])}>
                        <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-xs font-bold text-slate-800 dark:text-white truncate tracking-tight">{title}</h3>
                        <div className="h-0.5 w-4 bg-slate-200 dark:bg-slate-700 rounded-full mt-0.5 group-hover:w-8 transition-all duration-500" />
                    </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                    {onClick && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onClick(); }}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                            title={t('common.expand')}
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <div
                        {...dragHandleProps}
                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-grab active:cursor-grabbing transition-colors"
                    >
                        <GripVertical className="w-3.5 h-3.5" />
                    </div>
                    {onRemove && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onRemove(); }}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                            title={t('common.remove')}
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Content Area - Adjusted padding for stability */}
            <div
                className="relative flex-1 p-4 px-5 pt-2 min-h-0"
                onClick={onClick}
            >
                {children}
            </div>

            {/* Footer Area (Optional or Automatic via targetView) */}
            {hasFooter && (
                <div className="relative p-3 px-5 border-t border-slate-200 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between min-h-[40px]">
                    <div className="flex-1 min-w-0">{effectiveFooterLeft}</div>
                    <div className="shrink-0">{footerRight}</div>
                </div>
            )}

            {/* Subtle Hover Glow */}
            <div className="absolute inset-0 pointer-events-none border border-transparent group-hover:border-blue-500/10 dark:group-hover:border-blue-400/10 rounded-3xl transition-colors" />
        </div>
    );
};
