import React from 'react';
import { useQuery } from '../../../hooks/useQuery';
import { TrendingUp, Calculator, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton';
import { DashboardComponent } from '../ui/DashboardComponent';

export const ItForecastComponent: React.FC<{ onRemove?: () => void; dragHandleProps?: any; onClick?: () => void; targetView?: string }> = ({ onRemove, dragHandleProps, onClick, targetView }) => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;

    const { data: stats, loading, error } = useQuery<{
        latestYear: number;
        totalLatest: number;
        monthsLatest: number;
        totalCurrent: number;
        monthsCurrent: number;
    }>(`
        WITH LatestYear AS (SELECT MAX(FiscalYear) as yr FROM invoice_items)
        SELECT 
            (SELECT yr FROM LatestYear) as latestYear,
            (SELECT SUM(Amount) FROM invoice_items WHERE FiscalYear = (SELECT yr FROM LatestYear)) as totalLatest,
            (SELECT COUNT(DISTINCT Period) FROM invoice_items WHERE FiscalYear = (SELECT yr FROM LatestYear)) as monthsLatest,
            (SELECT SUM(Amount) FROM invoice_items WHERE FiscalYear = ${currentYear}) as totalCurrent,
            (SELECT COUNT(DISTINCT Period) FROM invoice_items WHERE FiscalYear = ${currentYear}) as monthsCurrent
    `, [], { cacheKey: 'tile-it-forecast-main', ttl: 15 * 60 * 1000 });

    if (loading && (!stats || (Array.isArray(stats) && stats.length === 0))) return (
        <div className="flex flex-col h-full gap-3 p-1">
            <Skeleton className="h-6 w-3/4 rounded-lg" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
        </div>
    );
    if (error) return <div className="p-4 text-center text-red-500 text-xs">Error: {error.message}</div>;

    const s = Array.isArray(stats) ? stats[0] : stats;
    const latestYearDetected = s?.latestYear || currentYear;
    const analysisYear = (s?.monthsCurrent > 0) ? currentYear : latestYearDetected;
    const actualSum = (analysisYear === currentYear) ? (s?.totalCurrent || 0) : (s?.totalLatest || 0);
    const monthsWithData = (analysisYear === currentYear) ? (s?.monthsCurrent || 0) : (s?.monthsLatest || 0);
    const isCurrentYear = analysisYear === currentYear;

    const monthlyAvg = monthsWithData > 0 ? actualSum / monthsWithData : 0;
    const forecastTotal = monthlyAvg * 12;
    const budgetProgress = forecastTotal > 0 ? (actualSum / forecastTotal) * 100 : 0;
    const yearProgress = isCurrentYear ? (currentMonth / 12) * 100 : 100;

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

    function cn(...inputs: any[]) {
        return inputs.filter(Boolean).join(' ');
    }

    return (
        <DashboardComponent
            title="Budget Forecast"
            icon={TrendingUp}
            iconColor="blue"
            onClick={onClick}
            onRemove={onRemove}
            targetView={targetView}
            dragHandleProps={dragHandleProps}
            footerLeft={
                <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest italic font-mono">
                    <Calculator className="w-3 h-3" />
                    Based on {monthsWithData} months data
                </div>
            }
        >
            <div className="space-y-3">
                <div className="flex items-end justify-between">
                    <div>
                        <div className="text-2xl font-black text-slate-900 dark:text-white leading-none">
                            {formatCurrency(forecastTotal)}
                        </div>
                    </div>
                    <div className={cn(
                        "p-1 rounded-lg",
                        isCurrentYear && budgetProgress > yearProgress
                            ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                            : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                    )}>
                        {(!isCurrentYear || budgetProgress <= yearProgress) ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>
                </div>

                <div className="space-y-1.5 px-0.5">
                    <div className="flex justify-between items-end">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Consumption</span>
                        <span className={cn(
                            "text-[10px] font-black",
                            isCurrentYear && budgetProgress > yearProgress ? "text-orange-500" : "text-emerald-500"
                        )}>
                            {budgetProgress.toFixed(1)}%
                        </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-900/50 rounded-full overflow-hidden">
                        <div
                            className={cn(
                                "h-full transition-all duration-1000",
                                isCurrentYear && budgetProgress > yearProgress ? "bg-orange-500" : "bg-blue-500"
                            )}
                            style={{ width: `${budgetProgress}%` }}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Actual YTD</div>
                        <div className="text-xl font-black text-slate-900 dark:text-white leading-none">{formatCurrency(actualSum)}</div>
                    </div>
                    <div className="flex flex-col">
                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Remaining</div>
                        <div className="text-xl font-black text-blue-600 dark:text-blue-400 leading-none">{formatCurrency(forecastTotal - actualSum)}</div>
                    </div>
                </div>
            </div>
        </DashboardComponent>
    );
};
