import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatValue } from '../utils/formatUtils';
import type { DbRow } from '../../types';

interface PivotMeasure {
    field: string;
    agg: 'sum' | 'count' | 'avg' | 'min' | 'max';
}

interface PivotTableProps {
    data: DbRow[];
    rows: string[];
    cols: string[];
    measures: PivotMeasure[];
}

export const PivotTable: React.FC<PivotTableProps> = ({ data, rows, cols, measures }) => {
    const { t } = useTranslation();

    const pivotData = useMemo(() => {
        if (!data || data.length === 0 || measures.length === 0) return null;

        const rowKeys = new Set<string>();
        const colKeys = new Set<string>();
        const matrix: Record<string, Record<string, Record<string, number[]>>> = {};

        // 1. Group Data
        data.forEach(item => {
            const rowKey = rows.map(r => String(item[r] ?? '')).join(' | ');
            const colKey = cols.map(c => String(item[c] ?? '')).join(' | ');

            rowKeys.add(rowKey);
            colKeys.add(colKey);

            if (!matrix[rowKey]) matrix[rowKey] = {};
            if (!matrix[rowKey][colKey]) matrix[rowKey][colKey] = {};

            measures.forEach(m => {
                if (!matrix[rowKey][colKey][m.field]) matrix[rowKey][colKey][m.field] = [];
                const val = Number(item[m.field]);
                if (!isNaN(val)) matrix[rowKey][colKey][m.field].push(val);
                else if (m.agg === 'count') matrix[rowKey][colKey][m.field].push(1);
            });
        });

        const sortedRowKeys = Array.from(rowKeys).sort();
        const sortedColKeys = Array.from(colKeys).sort();

        // 2. Aggregate
        const aggregated: Record<string, Record<string, Record<string, number>>> = {};
        sortedRowKeys.forEach(r => {
            aggregated[r] = {};
            sortedColKeys.forEach(c => {
                aggregated[r][c] = {};
                measures.forEach(m => {
                    const vals = matrix[r]?.[c]?.[m.field] || [];
                    let result = 0;
                    if (vals.length > 0) {
                        switch (m.agg) {
                            case 'sum': result = vals.reduce((a, b) => a + b, 0); break;
                            case 'count': result = vals.length; break;
                            case 'avg': result = vals.reduce((a, b) => a + b, 0) / vals.length; break;
                            case 'min': result = Math.min(...vals); break;
                            case 'max': result = Math.max(...vals); break;
                        }
                    }
                    aggregated[r][c][m.field] = result;
                });
            });
        });

        return {
            rowLabels: sortedRowKeys,
            colLabels: sortedColKeys,
            values: aggregated
        };
    }, [data, rows, cols, measures]);

    if (!pivotData) {
        return <div className="p-8 text-center text-slate-400 italic">{t('common.no_data')}</div>;
    }

    return (
        <div className="w-full h-full overflow-auto bg-white dark:bg-slate-900 shadow-inner rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-xs border-collapse">
                <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700">
                    {/* Column Headers */}
                    <tr>
                        <th
                            colSpan={rows.length}
                            className="p-2 border border-slate-300 dark:border-slate-700 font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase tracking-wider"
                        >
                            {rows.join(' / ')}
                        </th>
                        {pivotData.colLabels.map(c => (
                            <th
                                key={c}
                                colSpan={measures.length}
                                className="p-2 border border-slate-300 dark:border-slate-700 font-bold text-center bg-blue-50/50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                            >
                                {c || '--'}
                            </th>
                        ))}
                    </tr>
                    {/* Measure Headers (if multiple measures) */}
                    {measures.length > 1 && (
                        <tr>
                            <th colSpan={rows.length} className="border border-slate-300 dark:border-slate-700"></th>
                            {pivotData.colLabels.map(c =>
                                measures.map(m => (
                                    <th key={`${c}-${m.field}`} className="p-1 border border-slate-300 dark:border-slate-700 text-[10px] text-slate-400 font-medium">
                                        {m.field} ({t(`querybuilder.pivot_agg_${m.agg}`)})
                                    </th>
                                ))
                            )}
                        </tr>
                    )}
                    {measures.length === 1 && (
                        <tr>
                            <th colSpan={rows.length} className="border border-slate-300 dark:border-slate-700"></th>
                            {pivotData.colLabels.map(c => (
                                <th key={`measure-${c}`} className="p-1 border border-slate-300 dark:border-slate-700 text-[10px] text-slate-400 font-medium italic">
                                    {t(`querybuilder.pivot_agg_${measures[0].agg}`)}
                                </th>
                            ))}
                        </tr>
                    )}
                </thead>
                <tbody>
                    {pivotData.rowLabels.map((r, rIdx) => (
                        <tr key={r} className={rIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/30 dark:bg-slate-800/20'}>
                            {r.split(' | ').map((part, pIdx) => (
                                <td key={pIdx} className="p-2 border border-slate-200 dark:border-slate-800 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                    {part}
                                </td>
                            ))}
                            {pivotData.colLabels.map(c =>
                                measures.map(m => {
                                    const val = pivotData.values[r][c][m.field];
                                    return (
                                        <td key={`${c}-${m.field}`} className="p-2 border border-slate-200 dark:border-slate-800 text-right font-mono tabular-nums">
                                            {formatValue(val, m.field)}
                                        </td>
                                    );
                                })
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
