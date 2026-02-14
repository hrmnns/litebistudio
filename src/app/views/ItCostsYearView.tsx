import React from 'react';
import { useQuery } from '../../hooks/useQuery';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Calendar, Filter } from 'lucide-react';

interface ItCostsYearViewProps {
    onBack: () => void;
    onDrillDown?: (period: string) => void;
}

export const ItCostsYearView: React.FC<ItCostsYearViewProps> = ({ onBack, onDrillDown }) => {
    // Fetch last 12 months of IT Costs
    const { data, loading, error } = useQuery(`
        SELECT 
            Period, 
            SUM(Amount) as total,
            MAX(FiscalYear) as year,
            MAX(PostingDate) as date
        FROM invoice_items
        GROUP BY Period
        ORDER BY date DESC
        LIMIT 12
    `);

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
    );

    if (error) return <div className="p-8 text-red-500">Error: {error.message}</div>;

    const chartData = [...(data || [])].reverse();
    const maxVal = Math.max(...chartData.map(d => d.total), 1);
    const avgVal = chartData.reduce((acc, d) => acc + d.total, 0) / (chartData.length || 1);

    return (
        <div className="p-6 md:p-8 space-y-8">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button
                    onClick={onBack}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">IT Costs Analysis</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Monthly breakdown for the last 12 reported periods</p>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="flex items-center gap-3 text-blue-600 dark:text-blue-400 mb-2">
                        <DollarSign className="w-5 h-5" />
                        <span className="text-sm font-bold uppercase tracking-wider">Average / Month</span>
                    </div>
                    <div className="text-3xl font-extrabold text-slate-900 dark:text-white text-right">
                        €{Math.round(avgVal).toLocaleString()}
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400 mb-2">
                        <TrendingDown className="w-5 h-5" />
                        <span className="text-sm font-bold uppercase tracking-wider">Lowest Month</span>
                    </div>
                    <div className="text-3xl font-extrabold text-slate-900 dark:text-white text-right">
                        €{Math.round(Math.min(...chartData.map(d => d.total))).toLocaleString()}
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-2">
                        <TrendingUp className="w-5 h-5" />
                        <span className="text-sm font-bold uppercase tracking-wider">Peak Month</span>
                    </div>
                    <div className="text-3xl font-extrabold text-slate-900 dark:text-white text-right">
                        €{Math.round(maxVal).toLocaleString()}
                    </div>
                </div>
            </div>

            {/* Bar Chart */}
            <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-indigo-500" />
                        Cost Development (12 Months)
                    </h3>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
                        <span className="text-xs text-slate-500 font-medium">Actuals</span>
                    </div>
                </div>

                <div className="h-[300px] flex items-end gap-2 md:gap-4 relative pt-6 group/chart">
                    {/* Y-Axis Guideline (Average) */}
                    <div
                        className="absolute left-0 right-0 border-t border-dashed border-slate-200 dark:border-slate-700 z-0 flex items-center"
                        style={{ bottom: `${(avgVal / maxVal) * 100}%` }}
                    >
                        <span className="bg-white dark:bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400 font-bold ml-2">AVG</span>
                    </div>

                    {chartData.map((d, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-3 group/bar z-10 relative">
                            {/* Bar */}
                            <div className="relative w-full flex flex-col items-center group">
                                <div
                                    className={`w-full max-w-[40px] rounded-t-lg transition-all duration-500 hover:brightness-110 shadow-lg ${d.total < 0
                                            ? 'bg-gradient-to-t from-emerald-600 to-emerald-400 dark:from-emerald-700 dark:to-emerald-500 shadow-emerald-500/10'
                                            : 'bg-gradient-to-t from-blue-600 to-blue-400 dark:from-blue-700 dark:to-blue-500 shadow-blue-500/10'
                                        }`}
                                    style={{ height: `${(Math.abs(d.total) / maxVal) * 250}px` }}
                                >
                                    {/* Tooltip */}
                                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 font-bold">
                                        {d.total < 0 ? '-' : ''}€{Math.round(Math.abs(d.total)).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                            {/* Label */}
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate w-full text-center">
                                {d.Period}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* List View for Deeper Analysis */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <h3 className="font-bold flex items-center gap-2">
                        <Filter className="w-5 h-5 text-slate-400" />
                        Monthly Details
                    </h3>
                </div>
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 dark:bg-slate-900/50">
                        <tr>
                            <th className="px-6 py-3">Month / Period</th>
                            <th className="px-6 py-3 text-right">Total Amount</th>
                            <th className="px-6 py-3 text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {chartData.map((d, i) => (
                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                <td className="px-6 py-4 font-medium">{d.Period}</td>
                                <td className={`px-6 py-4 text-right font-bold ${d.total < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                                    {d.total < 0 ? '-' : ''}€{Math.round(Math.abs(d.total)).toLocaleString()}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <button
                                        onClick={() => onDrillDown?.(d.Period)}
                                        className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400 hover:underline px-3 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-md transition-colors"
                                    >
                                        Analyze Month
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
