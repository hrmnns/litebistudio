import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAsync } from '../../hooks/useAsync';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { DataTable } from '../../components/ui/DataTable';
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Loader2, AlertCircle, BarChart3 } from 'lucide-react';
import { RecordDetailModal } from './RecordDetailModal';

interface WidgetConfig {
    type: 'table' | 'bar' | 'line' | 'area' | 'pie';
    xAxis?: string;
    yAxes?: string[]; // Multiple metrics
    yAxis?: string; // Legacy single metric
    color?: string;
}

interface WidgetRendererProps {
    title: string;
    sql: string;
    config: WidgetConfig;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export const WidgetRenderer: React.FC<WidgetRendererProps> = ({ title, sql, config }) => {
    const { t } = useTranslation();
    const { data: results, loading, error } = useAsync<any[]>(
        async () => {
            if (!sql) return [];
            return await SystemRepository.executeRaw(sql);
        },
        [sql]
    );

    const [isDetailOpen, setIsDetailOpen] = React.useState(false);
    const [selectedItemIndex, setSelectedItemIndex] = React.useState(0);
    const [dynamicSchema, setDynamicSchema] = React.useState<any>(null);

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
                }, {} as any)
            };
            setDynamicSchema(schema);
        }
    }, [results, sql, title]);

    const columns = useMemo(() => {
        if (!results || results.length === 0) return [];
        return Object.keys(results[0]).map(key => ({
            header: key,
            accessor: key,
            render: (item: any) => typeof item[key] === 'number' && (key.toLowerCase().includes('amount') || key.toLowerCase().includes('price'))
                ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(item[key])
                : item[key]
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
                ) : (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        {config.type === 'bar' ? (
                            <BarChart data={results}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey={config.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    cursor={{ fill: '#f1f5f9' }}
                                />
                                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
                                {(config.yAxes || (config.yAxis ? [config.yAxis] : [])).map((y, idx) => (
                                    <Bar key={y} dataKey={y} fill={idx === 0 ? (config.color || COLORS[0]) : COLORS[idx % COLORS.length]} radius={[4, 4, 0, 0]} />
                                ))}
                            </BarChart>
                        ) : config.type === 'line' ? (
                            <LineChart data={results}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey={config.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
                                {(config.yAxes || (config.yAxis ? [config.yAxis] : [])).map((y, idx) => (
                                    <Line key={y} type="monotone" dataKey={y} stroke={idx === 0 ? (config.color || COLORS[0]) : COLORS[idx % COLORS.length]} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
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
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                {(config.yAxes || (config.yAxis ? [config.yAxis] : [])).map((y, idx) => (
                                    <Area key={y} type="monotone" dataKey={y} stroke={idx === 0 ? (config.color || COLORS[0]) : COLORS[idx % COLORS.length]} strokeWidth={3} fillOpacity={1} fill={`url(#color-${y}-${title.replace(/\s+/g, '')})`} />
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
                    schema={dynamicSchema}
                    tableName={sql.match(/FROM\s+([a-zA-Z0-9_]+)/i)?.[1]}
                />
            )}
        </div>
    );
};
