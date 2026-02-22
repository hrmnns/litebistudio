import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAsync } from '../../hooks/useAsync';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { DataTable } from '../../components/ui/DataTable';
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    ComposedChart, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ScatterChart, Scatter, LabelList
} from 'recharts';
import { Loader2, AlertCircle, BarChart3 } from 'lucide-react';
import { RecordDetailModal } from './RecordDetailModal';
import { formatValue } from '../utils/formatUtils';
import { type WidgetConfig, type DbRow } from '../../types';
import { PivotTable } from './PivotTable';
import type { SchemaDefinition } from './SchemaDocumentation';

interface FilterDef {
    column: string;
    operator: string;
    value: string;
}

interface WidgetRendererProps {
    title: string;
    sql: string;
    config: WidgetConfig;
    globalFilters?: FilterDef[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export const WidgetRenderer: React.FC<WidgetRendererProps> = ({ title, sql, config, globalFilters }) => {
    const { t } = useTranslation();
    const { data: results, loading, error } = useAsync<DbRow[]>(
        async () => {
            if (!sql) return [];
            let effectiveSql = sql;

            // Inject Global Filters
            if (globalFilters && globalFilters.length > 0) {
                const activeFilters = globalFilters.filter(f => f.column && (f.operator === 'is null' || f.value));
                if (activeFilters.length > 0) {
                    const whereClause = activeFilters.map(f => {
                        const col = `"${f.column.replace(/"/g, '""')}"`;
                        const val = typeof f.value === 'string' ? `'${f.value.replace(/'/g, "''")}'` : f.value;
                        const op = f.operator === 'contains' ? 'LIKE' : (f.operator === 'is null' ? 'IS NULL' : f.operator);

                        if (f.operator === 'is null') return `${col} IS NULL`;

                        const finalVal = f.operator === 'contains' ? `'%${f.value}%'` : val;
                        return `${col} ${op} ${finalVal}`;
                    }).join(' AND ');

                    if (effectiveSql.toUpperCase().includes('WHERE')) {
                        effectiveSql = effectiveSql.replace(/WHERE/i, `WHERE (${whereClause}) AND `);
                    } else if (effectiveSql.toUpperCase().includes('GROUP BY')) {
                        effectiveSql = effectiveSql.replace(/GROUP BY/i, `WHERE ${whereClause} GROUP BY `);
                    } else if (effectiveSql.toUpperCase().includes('ORDER BY')) {
                        effectiveSql = effectiveSql.replace(/ORDER BY/i, `WHERE ${whereClause} ORDER BY `);
                    } else if (effectiveSql.toUpperCase().includes('LIMIT')) {
                        effectiveSql = effectiveSql.replace(/LIMIT/i, `WHERE ${whereClause} LIMIT `);
                    } else {
                        effectiveSql += ` WHERE ${whereClause}`;
                    }
                }
            }

            return await SystemRepository.executeRaw(effectiveSql);
        },
        [sql, globalFilters]
    );

    const [isDetailOpen, setIsDetailOpen] = React.useState(false);
    const [selectedItemIndex, setSelectedItemIndex] = React.useState(0);
    const [dynamicSchema, setDynamicSchema] = React.useState<SchemaDefinition | null>(null);

    React.useEffect(() => {
        if (results && results.length > 0) {
            // Try to extract table name from SQL using simple regex for 'FROM table_name'
            // This is best-effort.
            const match = sql.match(/FROM\s+([a-zA-Z0-9_]+)/i);
            const tableName = match ? match[1] : 'Dataset';

            const schema = {
                title: title,
                description: `${t('widgets.data_inspector.description')}: ${tableName}`,
                type: 'object',
                properties: Object.keys(results[0]).reduce((acc, key) => {
                    const val = results[0][key];
                    const type = typeof val === 'number' ? 'number' : 'string';
                    acc[key] = { type, description: key };
                    return acc;
                }, {} as Record<string, { type: string; description: string }>)
            };
            setDynamicSchema(schema);
        }
    }, [results, sql, title, t]);

    const columns = useMemo(() => {
        if (!results || results.length === 0) return [];
        return Object.keys(results[0]).map(key => ({
            header: key,
            accessor: key,
            render: (item: DbRow) => formatValue(item[key], key)
        }));
    }, [results]);

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full flex items-center justify-center text-red-400 p-4 text-center">
                <div className="flex flex-col items-center gap-2">
                    <AlertCircle className="w-6 h-6" />
                    <span className="text-xs">{error.message}</span>
                </div>
            </div>
        );
    }

    if (!results || results.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                {t('common.no_data')}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700/50 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-none transition-all duration-500 overflow-hidden">
            <div className="flex items-center justify-between pt-2.5 pb-2.5 px-5 bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-200 dark:border-slate-800/50">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="p-1.5 rounded-xl shrink-0 shadow-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400">
                        <BarChart3 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-xs font-bold text-slate-800 dark:text-white truncate tracking-tight">{title}</h3>
                        <div className="h-0.5 w-4 bg-slate-200 dark:bg-slate-700 rounded-full mt-0.5" />
                    </div>
                </div>
            </div>
            <div className="flex-1 min-h-0 p-2">
                {config.type === 'table' ? (
                    <div className="h-full overflow-auto">
                        <DataTable
                            columns={columns}
                            data={results}
                            onRowClick={(item) => {
                                const idx = results.indexOf(item);
                                setSelectedItemIndex(idx >= 0 ? idx : 0);
                                setIsDetailOpen(true);
                            }}
                        />
                    </div>
                ) : config.type === 'pivot' ? (
                    <PivotTable
                        data={results}
                        rows={config.pivotRows || []}
                        cols={config.pivotCols || []}
                        measures={config.pivotMeasures || []}
                    />
                ) : config.type === 'kpi' ? (
                    <div className="h-full flex flex-col items-center justify-center p-4">
                        {results && results.length > 0 ? (() => {
                            const val = results[0][Object.keys(results[0])[0]];
                            const numVal = Number(val);

                            // Evaluate rules
                            let displayColor = 'text-slate-900 dark:text-white';
                            if (config.rules && !isNaN(numVal)) {
                                for (const rule of config.rules) {
                                    let match = false;
                                    switch (rule.operator) {
                                        case '>': match = numVal > rule.value; break;
                                        case '<': match = numVal < rule.value; break;
                                        case '>=': match = numVal >= rule.value; break;
                                        case '<=': match = numVal <= rule.value; break;
                                        case '==': match = numVal === rule.value; break;
                                    }
                                    if (match) {
                                        // Simple mapping or hex handling
                                        if (rule.color === 'green') displayColor = 'text-emerald-500';
                                        else if (rule.color === 'red') displayColor = 'text-rose-500';
                                        else if (rule.color === 'yellow') displayColor = 'text-amber-500';
                                        else if (rule.color === 'blue') displayColor = 'text-blue-500';
                                        else displayColor = `text-[${rule.color}]`; // Fallback for HEX if supported by tailwind or via style
                                        break;
                                    }
                                }
                            }

                            return (
                                <div className="flex flex-col items-center text-center animate-in zoom-in-95 duration-500">
                                    <div className={`text-4xl md:text-5xl lg:text-6xl font-black tracking-widest break-all transition-colors duration-300 ${displayColor}`}>
                                        {formatValue(val, Object.keys(results[0])[0])}
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-3">{Object.keys(results[0])[0]}</div>
                                </div>
                            );
                        })() : (
                            <div className="text-slate-300 text-[10px] font-bold uppercase tracking-widest">{t('common.no_data')}</div>
                        )}
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        {config.type === 'bar' ? (
                            <BarChart data={results}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey={config.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(val) => formatValue(val, (config.yAxes || [])[0])} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    cursor={{ fill: '#f1f5f9' }}
                                    formatter={(val, name) => [formatValue(val, name as string), name]}
                                />
                                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
                                {(config.yAxes || (config.yAxis ? [config.yAxis] : [])).map((y, idx) => (
                                    <Bar key={y} dataKey={y} fill={idx === 0 ? (config.color || COLORS[0]) : COLORS[idx % COLORS.length]} radius={[4, 4, 0, 0]}>
                                        {config.showLabels && <LabelList dataKey={y} position="top" style={{ fontSize: '10px', fontWeight: 'bold', fill: '#64748b' }} formatter={(val: unknown) => formatValue(val, y)} />}
                                    </Bar>
                                ))}
                            </BarChart>
                        ) : config.type === 'line' ? (
                            <LineChart data={results}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey={config.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(val) => formatValue(val, (config.yAxes || [])[0])} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    formatter={(val, name) => [formatValue(val, name as string), name]}
                                />
                                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
                                {(config.yAxes || (config.yAxis ? [config.yAxis] : [])).map((y, idx) => (
                                    <Line key={y} type="monotone" dataKey={y} stroke={idx === 0 ? (config.color || COLORS[0]) : COLORS[idx % COLORS.length]} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }}>
                                        {config.showLabels && <LabelList dataKey={y} position="top" offset={10} style={{ fontSize: '10px', fontWeight: 'bold', fill: '#64748b' }} formatter={(val: unknown) => formatValue(val, y)} />}
                                    </Line>
                                ))}
                            </LineChart>
                        ) : config.type === 'area' ? (
                            <AreaChart data={results}>
                                <defs>
                                    {(config.yAxes || (config.yAxis ? [config.yAxis] : [])).map((y, idx) => (
                                        <linearGradient key={`grad-${y}`} id={`color-${y}-${title.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={idx === 0 ? (config.color || COLORS[0]) : COLORS[idx % COLORS.length]} stopOpacity={0.8} />
                                            <stop offset="95%" stopColor={idx === 0 ? (config.color || COLORS[0]) : COLORS[idx % COLORS.length]} stopOpacity={0} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <XAxis dataKey={config.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(val) => formatValue(val, (config.yAxes || [])[0])} />
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    formatter={(val, name) => [formatValue(val, name as string), name]}
                                />
                                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                {(config.yAxes || (config.yAxis ? [config.yAxis] : [])).map((y, idx) => (
                                    <Area key={y} type="monotone" dataKey={y} stroke={idx === 0 ? (config.color || COLORS[0]) : COLORS[idx % COLORS.length]} strokeWidth={3} fillOpacity={1} fill={`url(#color-${y}-${title.replace(/\s+/g, '')})`}>
                                        {config.showLabels && <LabelList dataKey={y} position="top" style={{ fontSize: '10px', fontWeight: 'bold', fill: '#64748b' }} formatter={(val: unknown) => formatValue(val, y)} />}
                                    </Area>
                                ))}
                            </AreaChart>
                        ) : config.type === 'pie' ? (
                            <PieChart>
                                <Pie
                                    data={results}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }: { name?: string | number; percent?: number }) => `${name ?? ''} ${(percent ? percent * 100 : 0).toFixed(0)}%`}
                                    outerRadius={80}
                                    innerRadius={50}
                                    paddingAngle={5}
                                    dataKey={(config.yAxes || (config.yAxis ? [config.yAxis] : []))[0] || ''}
                                    nameKey={config.xAxis!}
                                >
                                    {results.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="white" strokeWidth={2} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                <Legend verticalAlign="bottom" height={36} iconSize={8} wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                            </PieChart>
                        ) : config.type === 'composed' ? (
                            <ComposedChart data={results}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey={config.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(val) => formatValue(val, (config.yAxes || [])[0])} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none' }}
                                    formatter={(val, name) => [formatValue(val, name as string), name]}
                                />
                                <Legend verticalAlign="top" height={36} iconType="circle" />
                                {(config.yAxes || []).map((y, idx) => (
                                    config.lineSeries?.includes(y) ? (
                                        <Line key={y} type="monotone" dataKey={y} stroke={COLORS[idx % COLORS.length]} strokeWidth={3}>
                                            {config.showLabels && <LabelList dataKey={y} position="top" style={{ fontSize: '10px', fontWeight: 'bold', fill: '#64748b' }} formatter={(val: unknown) => formatValue(val, y)} />}
                                        </Line>
                                    ) : (
                                        <Bar key={y} dataKey={y} fill={COLORS[idx % COLORS.length]} radius={[4, 4, 0, 0]}>
                                            {config.showLabels && <LabelList dataKey={y} position="top" style={{ fontSize: '10px', fontWeight: 'bold', fill: '#64748b' }} formatter={(val: unknown) => formatValue(val, y)} />}
                                        </Bar>
                                    )
                                ))}
                            </ComposedChart>
                        ) : config.type === 'radar' ? (
                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={results}>
                                <PolarGrid stroke="#e2e8f0" />
                                <PolarAngleAxis dataKey={config.xAxis} tick={{ fontSize: 10, fill: '#64748b' }} />
                                <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={{ fontSize: 8 }} />
                                {(config.yAxes || []).map((y, idx) => (
                                    <Radar key={y} name={y} dataKey={y} stroke={COLORS[idx % COLORS.length]} fill={COLORS[idx % COLORS.length]} fillOpacity={0.6} />
                                ))}
                                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                                <Tooltip />
                            </RadarChart>
                        ) : config.type === 'scatter' ? (
                            <ScatterChart>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis type="number" dataKey={config.xAxis} name={config.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                                <YAxis type="number" dataKey={(config.yAxes || [])[0]} name={(config.yAxes || [])[0]} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                <Legend verticalAlign="top" height={36} />
                                <Scatter name={title} data={results} fill={config.color || COLORS[0]} />
                            </ScatterChart>
                        ) : config.type === 'pivot' ? (
                            <PivotTable
                                data={results}
                                rows={config.pivotRows || []}
                                cols={config.pivotCols || []}
                                measures={config.pivotMeasures || []}
                            />
                        ) : null}
                    </ResponsiveContainer>
                )}
            </div>

            {results && results.length > 0 && (
                <RecordDetailModal
                    isOpen={isDetailOpen}
                    onClose={() => setIsDetailOpen(false)}
                    items={results}
                    initialIndex={selectedItemIndex}
                    title={title}
                    schema={dynamicSchema || undefined}
                    tableName={sql.match(/FROM\s+([a-zA-Z0-9_]+)/i)?.[1]}
                />
            )}
        </div>
    );
};
