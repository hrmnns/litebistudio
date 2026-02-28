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
import { Loader2, AlertCircle, BarChart3, ExternalLink, FileText, Layout, Gauge, Image as ImageIcon } from 'lucide-react';
import { RecordDetailModal } from './RecordDetailModal';
import { formatValue } from '../utils/formatUtils';
import { type WidgetConfig, type DbRow } from '../../types';
import { PivotTable } from './PivotTable';
import type { SchemaDefinition } from './SchemaDocumentation';
import { INSPECTOR_PENDING_SQL_KEY, INSPECTOR_RETURN_HASH_KEY } from '../../lib/inspectorBridge';
import { MarkdownContent } from './ui/MarkdownContent';
import { useLocation, useNavigate } from 'react-router-dom';

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
    showInspectorJump?: boolean;
    inspectorReturnHash?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const WidgetRenderer: React.FC<WidgetRendererProps> = ({ title, sql, config, globalFilters, showInspectorJump = false, inspectorReturnHash }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const effectiveSql = useMemo(() => {
        let nextSql = sql;
        if (!globalFilters || globalFilters.length === 0) {
            return nextSql;
        }
        const activeFilters = globalFilters.filter(f => f.column && (f.operator === 'is null' || f.value));
        if (activeFilters.length === 0) {
            return nextSql;
        }

        const whereClause = activeFilters.map(f => {
            const col = `"${f.column.replace(/"/g, '""')}"`;
            const val = typeof f.value === 'string' ? `'${f.value.replace(/'/g, "''")}'` : f.value;
            const op = f.operator === 'contains' ? 'LIKE' : (f.operator === 'is null' ? 'IS NULL' : f.operator);

            if (f.operator === 'is null') return `${col} IS NULL`;

            const finalVal = f.operator === 'contains' ? `'%${f.value}%'` : val;
            return `${col} ${op} ${finalVal}`;
        }).join(' AND ');

        if (nextSql.toUpperCase().includes('WHERE')) {
            nextSql = nextSql.replace(/WHERE/i, `WHERE (${whereClause}) AND `);
        } else if (nextSql.toUpperCase().includes('GROUP BY')) {
            nextSql = nextSql.replace(/GROUP BY/i, `WHERE ${whereClause} GROUP BY `);
        } else if (nextSql.toUpperCase().includes('ORDER BY')) {
            nextSql = nextSql.replace(/ORDER BY/i, `WHERE ${whereClause} ORDER BY `);
        } else if (nextSql.toUpperCase().includes('LIMIT')) {
            nextSql = nextSql.replace(/LIMIT/i, `WHERE ${whereClause} LIMIT `);
        } else {
            nextSql += ` WHERE ${whereClause}`;
        }
        return nextSql;
    }, [sql, globalFilters]);

    const canOpenInInspector = showInspectorJump && /^\s*SELECT\b/i.test(effectiveSql);
    const handleOpenInInspector = React.useCallback(() => {
        if (!canOpenInInspector) return;
        localStorage.setItem(INSPECTOR_PENDING_SQL_KEY, effectiveSql);
        const currentHash = `#${location.pathname}${location.search || ''}`;
        localStorage.setItem(INSPECTOR_RETURN_HASH_KEY, inspectorReturnHash || currentHash);
        navigate('/sql-workspace');
    }, [canOpenInInspector, effectiveSql, inspectorReturnHash, location.pathname, location.search, navigate]);

    const { data: results, loading, error } = useAsync<DbRow[]>(
        async () => {
            if (config.type === 'text' || config.type === 'markdown' || config.type === 'status' || config.type === 'section' || config.type === 'kpi_manual' || config.type === 'kpu_manual' || config.type === 'image') return [];
            if (!effectiveSql) return [];
            return await SystemRepository.executeRaw(effectiveSql);
        },
        [effectiveSql, config.type]
    );
    const imageUrlForError = (config.imageUrl || '').trim();
    const [imageLoadFailed, setImageLoadFailed] = React.useState(false);
    React.useEffect(() => {
        setImageLoadFailed(false);
    }, [imageUrlForError]);

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
    const widgetDescription = (config.widgetDescription || '').trim();
    const widgetDescriptionPosition: 'top' | 'bottom' = config.widgetDescriptionPosition === 'top' ? 'top' : 'bottom';
    const renderWidgetDescription = (position: 'top' | 'bottom') => {
        if (!widgetDescription || widgetDescriptionPosition !== position) return null;
        return (
            <div className="px-5 py-2.5 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800/60">
                {widgetDescription}
            </div>
        );
    };

    const textSizeClass = {
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-lg',
        xl: 'text-xl',
        '2xl': 'text-2xl'
    } as const;

    if (config.type === 'text') {
        return (
            <div className="flex flex-col h-full bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700/50 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-none transition-all duration-500 overflow-hidden">
                <div className="flex items-center justify-between pt-2.5 pb-2.5 px-5 bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-200 dark:border-slate-800/50">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-1.5 rounded-xl shrink-0 shadow-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400">
                            <BarChart3 className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-xs font-bold leading-snug text-slate-800 dark:text-white truncate tracking-tight">{title}</h3>
                            <div className="h-0.5 w-4 bg-slate-200 dark:bg-slate-700 rounded-full mt-0.5" />
                        </div>
                    </div>
                </div>
                {renderWidgetDescription('top')}
                <div
                    className={`flex-1 p-4 whitespace-pre-wrap break-words text-slate-800 dark:text-slate-100 ${
                        textSizeClass[config.textSize || 'md']
                    } ${config.textBold ? 'font-bold' : 'font-normal'} ${config.textItalic ? 'italic' : 'not-italic'} ${config.textUnderline ? 'underline' : 'no-underline'} ${
                        config.textAlign === 'center' ? 'text-center' : config.textAlign === 'right' ? 'text-right' : 'text-left'
                    }`}
                >
                    {(config.textContent || '').trim() || t('querybuilder.text_placeholder')}
                </div>
                {renderWidgetDescription('bottom')}
            </div>
        );
    }

    if (config.type === 'markdown') {
        return (
            <div className="flex flex-col h-full bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700/50 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-none transition-all duration-500 overflow-hidden">
                <div className="flex items-center justify-between pt-2.5 pb-2.5 px-5 bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-200 dark:border-slate-800/50">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-1.5 rounded-xl shrink-0 shadow-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400">
                            <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-xs font-bold leading-snug text-slate-800 dark:text-white truncate tracking-tight">{title}</h3>
                            <div className="h-0.5 w-4 bg-slate-200 dark:bg-slate-700 rounded-full mt-0.5" />
                        </div>
                    </div>
                </div>
                {renderWidgetDescription('top')}
                <div className="flex-1 p-4 overflow-auto text-slate-800 dark:text-slate-100">
                    <MarkdownContent
                        markdown={(config.markdownContent || '').trim()}
                        emptyText={t('querybuilder.markdown_placeholder', '# Titel\nText mit **Fett** und [Link](https://example.com)')}
                        className="text-sm leading-6"
                    />
                </div>
                {renderWidgetDescription('bottom')}
            </div>
        );
    }

    if (config.type === 'status') {
        const level = config.statusLevel || 'ok';
        const styleMap: Record<NonNullable<WidgetConfig['statusLevel']>, { ring: string; dot: string; title: string; text: string }> = {
            ok: { ring: 'ring-emerald-200 bg-emerald-50 dark:bg-emerald-900/20', dot: 'bg-emerald-500', title: 'text-emerald-800 dark:text-emerald-300', text: 'text-emerald-700/90 dark:text-emerald-200/90' },
            info: { ring: 'ring-blue-200 bg-blue-50 dark:bg-blue-900/20', dot: 'bg-blue-500', title: 'text-blue-800 dark:text-blue-300', text: 'text-blue-700/90 dark:text-blue-200/90' },
            warning: { ring: 'ring-amber-200 bg-amber-50 dark:bg-amber-900/20', dot: 'bg-amber-500', title: 'text-amber-800 dark:text-amber-300', text: 'text-amber-700/90 dark:text-amber-200/90' },
            critical: { ring: 'ring-rose-200 bg-rose-50 dark:bg-rose-900/20', dot: 'bg-rose-500', title: 'text-rose-800 dark:text-rose-300', text: 'text-rose-700/90 dark:text-rose-200/90' }
        };
        const styles = styleMap[level];
        return (
            <div className="flex flex-col h-full bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700/50 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-none transition-all duration-500 overflow-hidden">
                <div className="flex items-center justify-between pt-2.5 pb-2.5 px-5 bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-200 dark:border-slate-800/50">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-1.5 rounded-xl shrink-0 shadow-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400">
                            <AlertCircle className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-xs font-bold leading-snug text-slate-800 dark:text-white truncate tracking-tight">{title}</h3>
                            <div className="h-0.5 w-4 bg-slate-200 dark:bg-slate-700 rounded-full mt-0.5" />
                        </div>
                    </div>
                </div>
                {renderWidgetDescription('top')}
                <div className="flex-1 p-4 flex items-center justify-center">
                    <div className={`w-full rounded-xl ring-1 ${styles.ring} p-5`}>
                        <div className="flex items-center gap-3">
                            <span className={`relative inline-flex h-3.5 w-3.5 rounded-full ${styles.dot}`}>
                                {config.statusPulse && <span className={`absolute inline-flex h-full w-full rounded-full ${styles.dot} opacity-75 animate-ping`} />}
                            </span>
                            <span className={`text-[11px] font-black uppercase tracking-wider ${styles.title}`}>
                                {t(`querybuilder.status_level_${level}`, level)}
                            </span>
                        </div>
                        <div className={`mt-3 text-lg font-bold ${styles.title}`}>
                            {(config.statusTitle || '').trim() || t('querybuilder.status_placeholder_title', 'System status')}
                        </div>
                        <p className={`mt-2 text-sm ${styles.text}`}>
                            {(config.statusMessage || '').trim() || t('querybuilder.status_placeholder_message', 'All core systems are running stable.')}
                        </p>
                    </div>
                </div>
                {renderWidgetDescription('bottom')}
            </div>
        );
    }

    if (config.type === 'section') {
        const align = config.sectionAlign || 'left';
        const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
        const divider = config.sectionDividerStyle || 'line';
        return (
            <div className="flex flex-col h-full bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700/50 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-none transition-all duration-500 overflow-hidden">
                <div className="flex items-center justify-between pt-2.5 pb-2.5 px-5 bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-200 dark:border-slate-800/50">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-1.5 rounded-xl shrink-0 shadow-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400">
                            <Layout className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-xs font-bold leading-snug text-slate-800 dark:text-white truncate tracking-tight">{title}</h3>
                            <div className="h-0.5 w-4 bg-slate-200 dark:bg-slate-700 rounded-full mt-0.5" />
                        </div>
                    </div>
                </div>
                {renderWidgetDescription('top')}
                <div className="flex-1 p-5 flex flex-col justify-center">
                    <div className={`w-full ${alignClass}`}>
                        <h2 className="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-100">
                            {(config.sectionTitle || '').trim() || t('querybuilder.section_placeholder_title', 'Section title')}
                        </h2>
                        {(config.sectionSubtitle || '').trim() && (
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                {config.sectionSubtitle}
                            </p>
                        )}
                        {divider === 'line' && (
                            <div className={`mt-4 h-px bg-slate-300 dark:bg-slate-700 ${align === 'center' ? 'mx-auto w-2/3' : align === 'right' ? 'ml-auto w-2/3' : 'w-2/3'}`} />
                        )}
                        {divider === 'double' && (
                            <div className={`mt-4 space-y-1 ${align === 'center' ? 'mx-auto w-2/3' : align === 'right' ? 'ml-auto w-2/3' : 'w-2/3'}`}>
                                <div className="h-px bg-slate-300 dark:bg-slate-700" />
                                <div className="h-px bg-slate-300 dark:bg-slate-700" />
                            </div>
                        )}
                    </div>
                </div>
                {renderWidgetDescription('bottom')}
            </div>
        );
    }

    if (config.type === 'kpi_manual' || config.type === 'kpu_manual') {
        const trend = config.kpiTrend || config.kpuTrend || 'flat';
        const parseNumericInput = (raw?: string) => {
            if (!raw) return Number.NaN;
            const normalized = raw.replace(/\s+/g, '').replace(',', '.').replace(/[^0-9.+-]/g, '');
            return Number(normalized);
        };
        const valueNum = parseNumericInput(config.kpiValue || config.kpuValue);
        const targetNum = parseNumericInput(config.kpiTarget || config.kpuTarget);
        const align = config.kpiAlign || config.kpuAlign || 'left';
        const alignTextClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
        const chipsAlignClass = align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start';
        const hasGoalCheck = Number.isFinite(valueNum) && Number.isFinite(targetNum) && targetNum !== 0;
        const ratio = hasGoalCheck ? valueNum / targetNum : Number.NaN;
        const status: 'ok' | 'warn' | 'crit' | 'neutral' = !hasGoalCheck
            ? 'neutral'
            : ratio >= 1
                ? 'ok'
                : ratio >= 0.95
                    ? 'warn'
                    : 'crit';
        const trendStyle = trend === 'up'
            ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20'
            : (trend === 'down'
                ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20'
                : 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/40');
        const statusStyle = status === 'ok'
            ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
            : status === 'warn'
                ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                : status === 'crit'
                    ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800'
                    : 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/40 border-slate-200 dark:border-slate-700';
        const valueStyle = status === 'ok'
            ? 'text-emerald-700 dark:text-emerald-300'
            : status === 'warn'
                ? 'text-amber-700 dark:text-amber-300'
                : status === 'crit'
                    ? 'text-rose-700 dark:text-rose-300'
                    : 'text-slate-900 dark:text-slate-100';
        return (
            <div className="flex flex-col h-full bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700/50 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-none transition-all duration-500 overflow-hidden">
                <div className="flex items-center justify-between pt-2.5 pb-2.5 px-5 bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-200 dark:border-slate-800/50">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-1.5 rounded-xl shrink-0 shadow-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400">
                            <Gauge className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-xs font-bold leading-snug text-slate-800 dark:text-white truncate tracking-tight">{title}</h3>
                            <div className="h-0.5 w-4 bg-slate-200 dark:bg-slate-700 rounded-full mt-0.5" />
                        </div>
                    </div>
                </div>
                {renderWidgetDescription('top')}
                <div className="flex-1 p-5 flex items-center justify-center">
                    <div className={`w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 ${alignTextClass}`}>
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            {(config.kpiTitle || config.kpuTitle || '').trim() || t('querybuilder.kpi_placeholder_title', 'KPI')}
                        </div>
                        <div className={`mt-3 flex items-end gap-2 ${chipsAlignClass}`}>
                            <div className={`text-4xl font-black tracking-tight ${valueStyle}`}>
                                {(config.kpiValue || config.kpuValue || '').trim() || '--'}
                            </div>
                            {(config.kpiUnit || config.kpuUnit || '').trim() && (
                                <div className="pb-1 text-sm font-bold text-slate-500 dark:text-slate-400">{config.kpiUnit || config.kpuUnit}</div>
                            )}
                        </div>
                        <div className={`mt-3 flex flex-wrap items-center gap-2 ${chipsAlignClass}`}>
                            <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wide bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                                {t('querybuilder.kpi_target', 'Target')}: {(config.kpiTarget || config.kpuTarget || '').trim() || '-'}
                            </span>
                            <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${trendStyle}`}>
                                {t(`querybuilder.kpi_trend_${trend}`, trend)}
                            </span>
                            <span className={`px-2 py-1 rounded-full border text-[10px] font-black uppercase tracking-wide ${statusStyle}`}>
                                {status === 'ok'
                                    ? t('querybuilder.kpi_status_on_target', 'On target')
                                    : status === 'warn'
                                        ? t('querybuilder.kpi_status_near_target', 'Near target')
                                        : status === 'crit'
                                            ? t('querybuilder.kpi_status_below_target', 'Below target')
                                            : t('querybuilder.kpi_status_no_compare', 'No target comparison')}
                            </span>
                        </div>
                        {(config.kpiNote || config.kpuNote || '').trim() && (
                            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                                {config.kpiNote || config.kpuNote}
                            </p>
                        )}
                    </div>
                </div>
                {renderWidgetDescription('bottom')}
            </div>
        );
    }

    if (config.type === 'image') {
        const align = config.imageAlign || 'center';
        const alignClass = align === 'left' ? 'items-start' : align === 'right' ? 'items-end' : 'items-center';
        const imageUrl = imageUrlForError;
        return (
            <div className="flex flex-col h-full bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700/50 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-none transition-all duration-500 overflow-hidden">
                <div className="flex items-center justify-between pt-2.5 pb-2.5 px-5 bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-200 dark:border-slate-800/50">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-1.5 rounded-xl shrink-0 shadow-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400">
                            <ImageIcon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-xs font-bold leading-snug text-slate-800 dark:text-white truncate tracking-tight">{title}</h3>
                            <div className="h-0.5 w-4 bg-slate-200 dark:bg-slate-700 rounded-full mt-0.5" />
                        </div>
                    </div>
                </div>
                {renderWidgetDescription('top')}
                <div className="flex-1 p-5">
                    <div className={`h-full w-full flex flex-col ${alignClass} justify-center`}>
                        {imageUrl && !imageLoadFailed ? (
                            <>
                                <img
                                    src={imageUrl}
                                    alt={(config.imageAlt || '').trim() || 'Image widget'}
                                    referrerPolicy="no-referrer"
                                    crossOrigin="anonymous"
                                    onError={() => setImageLoadFailed(true)}
                                    className={`max-h-[320px] w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 ${config.imageFit === 'cover' ? 'object-cover' : 'object-contain'}`}
                                />
                                {(config.imageCaption || '').trim() && (
                                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{config.imageCaption}</p>
                                )}
                            </>
                        ) : imageUrl ? (
                            <div className="w-full rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3 text-amber-900 dark:text-amber-200">
                                <div className="flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold">{t('querybuilder.image_load_error_title', 'Image could not be loaded.')}</p>
                                        <p className="text-[11px] mt-1">{t('querybuilder.image_load_error_hint', 'Please check URL access and CORS/hotlink protection.')}</p>
                                        <p className="text-[10px] mt-1 font-mono break-all opacity-80">{imageUrl}</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="h-[220px] w-full rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400">
                                <ImageIcon className="w-8 h-8 mb-2 opacity-60" />
                                <p className="text-xs font-semibold text-center">{t('querybuilder.image_empty_hint', 'Please provide an image URL.')}</p>
                            </div>
                        )}
                    </div>
                </div>
                {renderWidgetDescription('bottom')}
            </div>
        );
    }

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
                        <h3 className="text-xs font-bold leading-snug text-slate-800 dark:text-white truncate tracking-tight">{title}</h3>
                        <div className="h-0.5 w-4 bg-slate-200 dark:bg-slate-700 rounded-full mt-0.5" />
                    </div>
                </div>
                {canOpenInInspector && (
                    <button
                        type="button"
                        onClick={handleOpenInInspector}
                        className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-blue-600 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                        title={t('common.open_in_inspector')}
                    >
                        <ExternalLink className="w-3 h-3" />
                        {t('common.open')}
                    </button>
                )}
            </div>
            {renderWidgetDescription('top')}
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
                            const firstRow = results[0];
                            const rowKeys = Object.keys(firstRow);
                            const preferredMetricKey = (config.yAxes || [])[0] || config.yAxis || '';
                            const metricKey = rowKeys.includes(preferredMetricKey)
                                ? preferredMetricKey
                                : (rowKeys.find((key) => {
                                    const raw = firstRow[key];
                                    if (typeof raw === 'number') return Number.isFinite(raw);
                                    if (typeof raw === 'string') {
                                        const normalized = raw.replace(/\s+/g, '').replace(',', '.');
                                        return Number.isFinite(Number(normalized));
                                    }
                                    return false;
                                }) || rowKeys[0]);
                            const val = firstRow[metricKey];
                            const parseNumericValue = (raw: unknown): number => {
                                if (typeof raw === 'number') return raw;
                                if (typeof raw === 'string') {
                                    const normalized = raw.replace(/\s+/g, '').replace(',', '.');
                                    return Number(normalized);
                                }
                                return Number.NaN;
                            };
                            const numVal = parseNumericValue(val);

                            // Evaluate rules
                            let displayColor = 'text-slate-900 dark:text-white';
                            let displayStyle: React.CSSProperties | undefined;
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
                                        else displayStyle = { color: rule.color };
                                        break;
                                    }
                                }
                            }

                            return (
                                <div className="flex flex-col items-center text-center animate-in zoom-in-95 duration-500">
                                    <div className="flex items-end gap-2">
                                        <div className={`text-4xl md:text-5xl lg:text-6xl font-black tracking-widest break-all transition-colors duration-300 ${displayColor}`} style={displayStyle}>
                                            {formatValue(val, metricKey)}
                                        </div>
                                        {(config.kpiUnit || '').trim() && (
                                            <div className="pb-1 text-base md:text-lg font-bold text-slate-500 dark:text-slate-400">{config.kpiUnit}</div>
                                        )}
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-3">{metricKey}</div>
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
            {renderWidgetDescription('bottom')}

            {results && results.length > 0 && (
                <RecordDetailModal
                    isOpen={isDetailOpen}
                    onClose={() => setIsDetailOpen(false)}
                    items={results}
                    initialIndex={selectedItemIndex}
                    title={title}
                    schema={dynamicSchema || undefined}
                    tableName={undefined}
                />
            )}
        </div>
    );
};


export { WidgetRenderer };
export default WidgetRenderer;


