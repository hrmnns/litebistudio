import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '../components/ui/PageLayout';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import {
    Play, Save, BarChart2, Table as TableIcon, TrendingUp, AlertCircle,
    Layout, Maximize2, Minimize2, Settings, History, Folder, Trash2,
    Edit3, X, Check, Download
} from 'lucide-react';
import { useReportExport } from '../../hooks/useReportExport';
import { DataTable } from '../../components/ui/DataTable';
import { Modal } from '../components/Modal';
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    ComposedChart, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ScatterChart, Scatter, LabelList
} from 'recharts';
import { formatValue } from '../utils/formatUtils';
import type { DbRow, TableColumn, WidgetConfig } from '../../types';
import { VisualQueryBuilder, type QueryConfig } from '../components/VisualQueryBuilder';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useDashboard } from '../../lib/context/DashboardContext';
import { RecordDetailModal } from '../components/RecordDetailModal';
import { useAsync } from '../../hooks/useAsync';
import { SqlAssistant } from '../components/SqlAssistant';
import { PivotTable } from '../components/PivotTable';
import type { SchemaDefinition } from '../components/SchemaDocumentation';

type VisualizationType = 'table' | 'bar' | 'line' | 'area' | 'pie' | 'kpi' | 'composed' | 'radar' | 'scatter' | 'pivot';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

interface SavedWidget {
    id: string;
    name: string;
    sql_query: string;
    visualization_config: string;
    visual_builder_config?: string | null;
}

export const QueryBuilderView: React.FC = () => {
    const { t } = useTranslation();
    const [sql, setSql] = useState('SELECT * FROM sqlite_master LIMIT 10');
    const [results, setResults] = useState<DbRow[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Mode State
    const [builderMode, setBuilderMode] = useState<'sql' | 'visual'>('visual');
    const [sidebarTab, setSidebarTab] = useState<'query' | 'vis' | 'archive'>('query');
    const [isMaximized, setIsMaximized] = useState(false);
    const [queryConfig, setQueryConfig] = useLocalStorage<QueryConfig | undefined>('query_builder_config', undefined);

    // Visualization State
    const [visType, setVisType] = useState<VisualizationType>('table');
    const [visConfig, setVisConfig] = useState<WidgetConfig>({ type: 'table', color: '#3b82f6' });

    // Active Widget State
    const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);

    // Save Widget State
    const [saveModalOpen, setSaveModalOpen] = useState(false);
    const [widgetName, setWidgetName] = useState('');

    // Detail View State
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [selectedItemIndex, setSelectedItemIndex] = useState(0);
    const [activeSchema, setActiveSchema] = useState<SchemaDefinition | null>(null);
    const { isExporting, exportToPdf } = useReportExport();
    const { togglePresentationMode, isReadOnly, isAdminMode } = useDashboard();

    // Fetch saved widgets
    const { data: savedWidgets, refresh: refreshWidgets } = useAsync<SavedWidget[]>(
        async () => await SystemRepository.getUserWidgets() as SavedWidget[],
        []
    );

    // Auto-Schema Generation
    useEffect(() => {
        const tableName = queryConfig?.table;
        if (!tableName) {
            setActiveSchema(null);
            return;
        }
        SystemRepository.getTableSchema(tableName).then(cols => {
            if (cols && cols.length > 0) {
                const dynamicSchema = {
                    title: `Tabelle: ${tableName}`,
                    description: `Automatisch generiertes Schema für die Tabelle "${tableName}".`,
                    type: 'object',
                    properties: cols.reduce((acc: Record<string, { type: string; description: string }>, col: TableColumn) => {
                        acc[col.name] = {
                            type: col.type.toLowerCase().includes('int') || col.type.toLowerCase().includes('real') ? 'number' : 'string',
                            description: `Feld: ${col.name} (Typ: ${col.type})`
                        };
                        return acc;
                    }, {})
                };
                setActiveSchema(dynamicSchema);
            }
        });
    }, [queryConfig?.table]);

    const handleRun = async (overrideSql?: string) => {
        setLoading(true);
        setError('');
        try {
            const sqlToExecute = overrideSql || sql;
            const data = await SystemRepository.executeRaw(sqlToExecute);
            setResults(data);
            if (data.length > 0) {
                const numericCols = Object.keys(data[0]).filter(k => typeof data[0][k] === 'number');
                const textCols = Object.keys(data[0]).filter(k => typeof data[0][k] === 'string');

                if (!visConfig.xAxis) {
                    setVisConfig(prev => ({
                        ...prev,
                        xAxis: textCols[0] || Object.keys(data[0])[0],
                        yAxes: prev.yAxes?.length ? prev.yAxes : (numericCols.length > 0 ? [numericCols[0]] : [])
                    }));
                }
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const loadWidget = (widget: SavedWidget) => {
        setActiveWidgetId(widget.id);
        setWidgetName(widget.name);
        setSql(widget.sql_query);

        try {
            const visualConfig = JSON.parse(widget.visualization_config);
            setVisType(visualConfig.type || 'table');
            setVisConfig(visualConfig);

            if (widget.visual_builder_config) {
                const qConfig = JSON.parse(widget.visual_builder_config);
                setQueryConfig(qConfig);
                setBuilderMode('visual');
            } else {
                setBuilderMode('sql');
            }
        } catch (e) {
            console.error('Error parsing widget config', e);
        }

        setSidebarTab('query');
        setTimeout(() => handleRun(widget.sql_query), 100);
    };

    const handleSaveWidget = async () => {
        if (!widgetName || isReadOnly) return;
        try {
            const widget = {
                id: activeWidgetId || crypto.randomUUID(),
                name: widgetName,
                description: '',
                sql_query: sql,
                visualization_config: { ...visConfig, type: visType },
                visual_builder_config: builderMode === 'visual' ? queryConfig : null
            };

            await SystemRepository.saveUserWidget(widget);

            setSaveModalOpen(false);
            if (!activeWidgetId) setWidgetName('');
            refreshWidgets();
            alert(activeWidgetId ? t('querybuilder.success_update') : t('querybuilder.success_save'));
            setActiveWidgetId(widget.id);
        } catch (err: unknown) {
            alert(t('querybuilder.error_save') + (err instanceof Error ? err.message : String(err)));
        }
    };

    const deleteWidget = async (id: string) => {
        if (isReadOnly) return;
        if (confirm(t('dashboard.confirm_delete_report'))) {
            await SystemRepository.deleteUserWidget(id);
            refreshWidgets();
            if (activeWidgetId === id) {
                setActiveWidgetId(null);
                setWidgetName('');
            }
        }
    };

    const columns = useMemo(() => {
        if (results.length === 0) return [];
        return Object.keys(results[0]).map(key => ({
            header: key,
            accessor: key,
            render: (item: DbRow) => formatValue(item[key], key)
        }));
    }, [results]);

    const resultColumns = results.length > 0 ? Object.keys(results[0]) : [];

    return (
        <PageLayout
            header={{
                title: t('sidebar.query_builder'),
                subtitle: t('querybuilder.subtitle'),
                actions: (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={togglePresentationMode}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                            title={t('dashboard.presentation_mode')}
                        >
                            <Maximize2 className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => exportToPdf('query-visualization', `report-${widgetName || 'query'}`)}
                            disabled={isExporting || results.length === 0}
                            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium text-sm disabled:opacity-50"
                        >
                            <Download className="w-4 h-4" />
                            {isExporting ? t('common.exporting') : t('common.export_pdf')}
                        </button>
                        {activeWidgetId && (
                            <button
                                onClick={() => setActiveWidgetId(null)}
                                className="px-4 py-2 text-slate-400 hover:text-slate-600 font-medium text-sm transition-colors"
                            >
                                {t('querybuilder.new_report')}
                            </button>
                        )}
                        <button
                            onClick={() => setSaveModalOpen(true)}
                            disabled={results.length === 0 || isReadOnly}
                            className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium text-sm disabled:opacity-50 ${isReadOnly ? 'cursor-not-allowed hidden' : ''}`}
                        >
                            <Save className="w-4 h-4" />
                            {activeWidgetId ? t('querybuilder.update_widget') : t('querybuilder.save_as_widget')}
                        </button>
                    </div>
                )
            }}
        >
            <div className="flex flex-col gap-6 h-[calc(100vh-140px)]">
                <div className="flex-1 flex gap-6 min-h-0 overflow-hidden relative">
                    {/* Sidebar */}
                    <div className={`${isMaximized ? 'hidden' : 'w-full lg:w-96'} flex flex-col gap-4 h-full overflow-hidden transition-all duration-300`}>
                        <div className="flex bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl">
                            <button onClick={() => setSidebarTab('archive')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-black uppercase transition-all ${sidebarTab === 'archive' ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                                <Folder className="w-4 h-4" /> {t('querybuilder.archive')}
                            </button>
                            <button onClick={() => setSidebarTab('query')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-black uppercase transition-all ${sidebarTab === 'query' ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                                <History className="w-4 h-4" /> {t('querybuilder.query')}
                            </button>
                            <button onClick={() => setSidebarTab('vis')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-black uppercase transition-all ${sidebarTab === 'vis' ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                                <Settings className="w-4 h-4" /> {t('querybuilder.graph')}
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
                            {sidebarTab === 'archive' ? (
                                <div className="space-y-2 animate-in fade-in duration-300">
                                    <h3 className="text-[10px] font-black uppercase text-slate-400 px-2 py-1 flex items-center justify-between">
                                        {t('querybuilder.saved_reports')}
                                        <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[9px]">{savedWidgets?.length || 0}</span>
                                    </h3>
                                    <div className="space-y-1">
                                        {savedWidgets?.map(w => (
                                            <div key={w.id} className={`group p-3 rounded-lg border flex flex-col gap-1 transition-all cursor-pointer ${activeWidgetId === w.id ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-100' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-200'}`} onClick={() => loadWidget(w)}>
                                                <div className="flex items-center justify-between">
                                                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm truncate">{w.name}</span>
                                                    {!isReadOnly && (
                                                        <button onClick={(e) => { e.stopPropagation(); deleteWidget(w.id); }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px]">
                                                    <span className="text-slate-400 truncate max-w-[150px] font-mono">{w.sql_query}</span>
                                                    <span className="ml-auto text-blue-400 flex items-center gap-1 font-bold italic">{JSON.parse(w.visualization_config).type.toUpperCase()}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : sidebarTab === 'query' ? (
                                <div className="space-y-4">
                                    {activeWidgetId && (
                                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 flex items-center justify-between">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <Edit3 className="w-4 h-4" />
                                                <span className="text-xs font-bold truncate">{t('querybuilder.editing', { name: widgetName })}</span>
                                            </div>
                                            <button onClick={() => setActiveWidgetId(null)} className="p-1 hover:bg-amber-100 rounded text-amber-500"><X className="w-3.5 h-3.5" /></button>
                                        </div>
                                    )}
                                    <div className="bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex">
                                        <button onClick={() => setBuilderMode('visual')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${builderMode === 'visual' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                                            <Layout className="w-3.5 h-3.5" /> {t('querybuilder.visual_builder')}
                                        </button>
                                        <button onClick={() => setBuilderMode('sql')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${builderMode === 'sql' ? 'bg-slate-900 dark:bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                                            <span className="font-mono text-[10px]">SQL</span> {t('querybuilder.direct_editor')}
                                        </button>
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                                        {builderMode === 'sql' ? (
                                            <>
                                                <div className="flex items-center justify-between">
                                                    <label className="text-[10px] font-black uppercase text-slate-400">{t('querybuilder.sql_query')}</label>
                                                    <SqlAssistant
                                                        tableName={queryConfig?.table}
                                                        columns={results.length > 0 ? Object.keys(results[0]).map(c => ({ name: c, type: typeof results[0][c] })) : []}
                                                        onSelectSnippet={snippet => setSql(prev => prev + '\n' + snippet)}
                                                    />
                                                </div>
                                                <textarea value={sql} onChange={e => setSql(e.target.value)} className="w-full h-64 font-mono text-xs p-3 bg-slate-900 text-slate-100 rounded-lg outline-none resize-none" placeholder="SELECT * FROM..." />
                                            </>
                                        ) : (
                                            <VisualQueryBuilder
                                                initialConfig={queryConfig}
                                                isAdminMode={isAdminMode}
                                                onChange={(newSql, newConfig) => { setSql(newSql); setQueryConfig(newConfig); }}
                                            />
                                        )}
                                        <div className="flex justify-between items-center pt-2 border-t border-slate-50 dark:border-slate-800">
                                            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('querybuilder.labels')}:</span>
                                                <button onClick={() => setVisConfig({ ...visConfig, showLabels: !visConfig.showLabels })} className={`px-2 py-0.5 rounded text-[10px] font-black uppercase transition-all ${visConfig.showLabels ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                                                    {visConfig.showLabels ? t('querybuilder.label_on') : t('querybuilder.label_off')}
                                                </button>
                                            </div>
                                            <button onClick={() => handleRun()} disabled={loading} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-xs shadow-md disabled:opacity-50">
                                                <Play className="w-3.5 h-3.5" /> {loading ? t('common.loading') : t('querybuilder.apply')}
                                            </button>
                                        </div>
                                    </div>
                                    {error && <div className="bg-red-50 text-red-600 text-[10px] p-3 rounded-lg border border-red-100 flex items-start gap-2 font-mono break-all"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{error}</div>}
                                </div>
                            ) : (
                                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 animate-in slide-in-from-right-4 duration-300">
                                    <h3 className="text-xs font-black uppercase text-slate-400 flex items-center gap-2"><Layout className="w-3.5 h-3.5 text-blue-500" />{t('querybuilder.graph_type')}</h3>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { id: 'table', icon: TableIcon, label: t('querybuilder.table') },
                                            { id: 'bar', icon: BarChart2, label: t('querybuilder.bar') },
                                            { id: 'line', icon: TrendingUp, label: t('querybuilder.line') },
                                            { id: 'area', icon: Layout, label: t('querybuilder.area') },
                                            { id: 'pie', icon: Layout, label: t('querybuilder.pie') },
                                            { id: 'kpi', icon: Layout, label: t('querybuilder.kpi') },
                                            { id: 'composed', icon: Layout, label: t('querybuilder.composed') },
                                            { id: 'radar', icon: Layout, label: t('querybuilder.radar') },
                                            { id: 'scatter', icon: Layout, label: t('querybuilder.scatter') },
                                            { id: 'pivot', icon: Layout, label: t('querybuilder.pivot') },
                                        ].map(type => (
                                            <button key={type.id} onClick={() => setVisType(type.id as VisualizationType)} className={`p-2 rounded-lg flex flex-col items-center justify-center gap-1 border transition-all ${visType === type.id ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 text-blue-600 shadow-sm' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300'}`}>
                                                <type.icon className="w-4 h-4" />
                                                <span className="text-[9px] uppercase font-black">{type.label}</span>
                                            </button>
                                        ))}
                                    </div>

                                    {(visType !== 'table' && visType !== 'pivot' && results.length > 0) && (
                                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2 duration-300">
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.x_axis')}</label>
                                                <select value={visConfig.xAxis || ''} onChange={e => setVisConfig({ ...visConfig, xAxis: e.target.value })} className="w-full p-2 border border-slate-200 rounded text-[11px] bg-white outline-none">
                                                    <option value="">{t('querybuilder.select_column')}</option>
                                                    {resultColumns.map(col => <option key={col} value={col}>{col}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.y_axes')}</label>
                                                <div className="flex flex-wrap gap-1 mb-2">
                                                    {(visConfig.yAxes || []).map(y => (
                                                        <span key={y} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold flex items-center gap-1">
                                                            {y}
                                                            <button onClick={() => setVisConfig({ ...visConfig, yAxes: (visConfig.yAxes || []).filter(axis => axis !== y) })}><X className="w-2.5 h-2.5" /></button>
                                                        </span>
                                                    ))}
                                                </div>
                                                <select onChange={e => { if (!e.target.value) return; setVisConfig({ ...visConfig, yAxes: [...(visConfig.yAxes || []), e.target.value] }); e.target.value = ''; }} className="w-full p-2 border border-slate-200 rounded text-[11px] bg-white outline-none">
                                                    <option value="">{t('querybuilder.add_y_axis')}</option>
                                                    {resultColumns.filter(c => !(visConfig.yAxes || []).includes(c)).map(col => <option key={col} value={col}>{col}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    {(visType === 'pivot' && results.length > 0) && (
                                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2 duration-300">
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.pivot_rows')}</label>
                                                <div className="flex flex-wrap gap-1 mb-2">
                                                    {(visConfig.pivotRows || []).map(r => (
                                                        <span key={r} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold flex items-center gap-1">
                                                            {r}
                                                            <button onClick={() => setVisConfig({ ...visConfig, pivotRows: (visConfig.pivotRows || []).filter(row => row !== r) })}><X className="w-2.5 h-2.5" /></button>
                                                        </span>
                                                    ))}
                                                </div>
                                                <select onChange={e => { if (!e.target.value) return; setVisConfig({ ...visConfig, pivotRows: [...(visConfig.pivotRows || []), e.target.value] }); e.target.value = ''; }} className="w-full p-2 border border-slate-200 rounded text-[11px] bg-white outline-none">
                                                    <option value="">{t('querybuilder.pivot_add_row')}</option>
                                                    {resultColumns.filter(c => !(visConfig.pivotRows || []).includes(c)).map(col => <option key={col} value={col}>{col}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.pivot_cols')}</label>
                                                <div className="flex flex-wrap gap-1 mb-2">
                                                    {(visConfig.pivotCols || []).map(c => (
                                                        <span key={c} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold flex items-center gap-1">
                                                            {c}
                                                            <button onClick={() => setVisConfig({ ...visConfig, pivotCols: (visConfig.pivotCols || []).filter(col => col !== c) })}><X className="w-2.5 h-2.5" /></button>
                                                        </span>
                                                    ))}
                                                </div>
                                                <select onChange={e => { if (!e.target.value) return; setVisConfig({ ...visConfig, pivotCols: [...(visConfig.pivotCols || []), e.target.value] }); e.target.value = ''; }} className="w-full p-2 border border-slate-200 rounded text-[11px] bg-white outline-none">
                                                    <option value="">{t('querybuilder.pivot_add_col')}</option>
                                                    {resultColumns.filter(c => !(visConfig.pivotCols || []).includes(c)).map(col => <option key={col} value={col}>{col}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-2">{t('querybuilder.pivot_measures')}</label>
                                                <div className="space-y-2">
                                                    {(visConfig.pivotMeasures || []).map((m, idx) => (
                                                        <div key={idx} className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/50 p-2 rounded border border-slate-100">
                                                            <span className="text-[10px] font-bold text-slate-600 truncate flex-1">{m.field}</span>
                                                            <select value={m.agg} onChange={e => { const next = [...(visConfig.pivotMeasures || [])]; const agg = e.target.value as NonNullable<WidgetConfig['pivotMeasures']>[number]['agg']; next[idx] = { ...m, agg }; setVisConfig({ ...visConfig, pivotMeasures: next }); }} className="bg-transparent text-[10px] font-bold text-blue-600 outline-none">
                                                                <option value="sum">{t('querybuilder.pivot_agg_sum')}</option>
                                                                <option value="count">{t('querybuilder.pivot_agg_count')}</option>
                                                                <option value="avg">{t('querybuilder.pivot_agg_avg')}</option>
                                                                <option value="min">{t('querybuilder.pivot_agg_min')}</option>
                                                                <option value="max">{t('querybuilder.pivot_agg_max')}</option>
                                                            </select>
                                                            <button onClick={() => setVisConfig({ ...visConfig, pivotMeasures: (visConfig.pivotMeasures || []).filter((_, i) => i !== idx) })} className="text-slate-300 hover:text-red-500"><X className="w-3" /></button>
                                                        </div>
                                                    ))}
                                                    <select onChange={e => { if (!e.target.value) return; setVisConfig({ ...visConfig, pivotMeasures: [...(visConfig.pivotMeasures || []), { field: e.target.value, agg: 'sum' }] }); e.target.value = ''; }} className="w-full p-2 border border-slate-200 rounded text-[11px] bg-white outline-none">
                                                        <option value="">{t('querybuilder.pivot_add_measure')}</option>
                                                        {resultColumns.map(col => <option key={col} value={col}>{col}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {(visType === 'kpi' && results.length > 0) && (
                                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2 duration-300">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[10px] font-black uppercase text-slate-400">{t('querybuilder.kpi_rules')}</h4>
                                                <button
                                                    onClick={() => setVisConfig({ ...visConfig, rules: [...(visConfig.rules || []), { operator: '>', value: 0, color: 'green' }] })}
                                                    className="p-1 px-2 bg-blue-50 text-blue-600 rounded text-[9px] font-bold hover:bg-blue-100 transition-colors"
                                                >
                                                    + {t('querybuilder.add_rule')}
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                {(visConfig.rules || []).map((rule, idx) => (
                                                    <div key={idx} className="flex items-center gap-1.5 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                                        <select
                                                            value={rule.operator}
                                                            onChange={e => {
                                                                const next = [...(visConfig.rules || [])];
                                                                const operator = e.target.value as NonNullable<WidgetConfig['rules']>[number]['operator'];
                                                                next[idx] = { ...rule, operator };
                                                                setVisConfig({ ...visConfig, rules: next });
                                                            }}
                                                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1 text-[10px] outline-none"
                                                        >
                                                            <option value=">">&gt;</option>
                                                            <option value="<">&lt;</option>
                                                            <option value=">=">&gt;=</option>
                                                            <option value="<=">&lt;=</option>
                                                            <option value="==">==</option>
                                                        </select>
                                                        <input
                                                            type="number"
                                                            value={rule.value}
                                                            onChange={e => {
                                                                const next = [...(visConfig.rules || [])];
                                                                next[idx] = { ...rule, value: Number(e.target.value) };
                                                                setVisConfig({ ...visConfig, rules: next });
                                                            }}
                                                            className="w-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1 text-[10px] outline-none"
                                                        />
                                                        <div className="flex gap-1">
                                                            {(['green', 'yellow', 'red', 'blue'] as const).map(c => (
                                                                <button
                                                                    key={c}
                                                                    onClick={() => {
                                                                        const next = [...(visConfig.rules || [])];
                                                                        next[idx] = { ...rule, color: c };
                                                                        setVisConfig({ ...visConfig, rules: next });
                                                                    }}
                                                                    className={`w-4 h-4 rounded-full border-2 ${rule.color === c ? 'border-slate-400 scale-110' : 'border-transparent opacity-40 hover:opacity-100'}`}
                                                                    style={{ backgroundColor: c === 'green' ? '#10b981' : c === 'red' ? '#f43f5e' : c === 'yellow' ? '#fbbf24' : '#3b82f6' }}
                                                                />
                                                            ))}
                                                        </div>
                                                        <button
                                                            onClick={() => setVisConfig({ ...visConfig, rules: (visConfig.rules || []).filter((_, i) => i !== idx) })}
                                                            className="ml-auto text-slate-300 hover:text-red-500"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Preview Area */}
                    <div id="query-visualization" className="flex-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full relative">
                        <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t('querybuilder.preview', { count: results.length })}</h3>
                            <button onClick={() => setIsMaximized(!isMaximized)} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-slate-400 transition-all flex items-center gap-1.5 shadow-sm bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                                {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                                <span className="text-[9px] font-black uppercase tracking-widest">{isMaximized ? t('querybuilder.centered') : t('querybuilder.focus')}</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-4 min-h-0 container-scrollbar">
                            {results.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                    <Play className="w-12 h-12 mb-4 opacity-10" />
                                    <p className="text-xs font-black uppercase tracking-widest text-center whitespace-pre-wrap">{t('querybuilder.no_data_prompt')}</p>
                                </div>
                            ) : (
                                <div className="h-full w-full flex flex-col">
                                    {visType === 'table' ? (
                                        <DataTable columns={columns} data={results} onRowClick={item => { setSelectedItemIndex(results.indexOf(item)); setDetailModalOpen(true); }} />
                                    ) : visType === 'pivot' ? (
                                        <PivotTable data={results} rows={visConfig.pivotRows || []} cols={visConfig.pivotCols || []} measures={visConfig.pivotMeasures || []} />
                                    ) : visType === 'kpi' ? (() => {
                                        const val = results[0][Object.keys(results[0])[0]];
                                        const numVal = Number(val);
                                        let displayColor = 'text-slate-900 dark:text-white';
                                        if (visConfig.rules && !isNaN(numVal)) {
                                            for (const rule of visConfig.rules) {
                                                let match = false;
                                                switch (rule.operator) {
                                                    case '>': match = numVal > rule.value; break;
                                                    case '<': match = numVal < rule.value; break;
                                                    case '>=': match = numVal >= rule.value; break;
                                                    case '<=': match = numVal <= rule.value; break;
                                                    case '==': match = numVal === rule.value; break;
                                                }
                                                if (match) {
                                                    if (rule.color === 'green') displayColor = 'text-emerald-500';
                                                    else if (rule.color === 'red') displayColor = 'text-rose-500';
                                                    else if (rule.color === 'yellow') displayColor = 'text-amber-500';
                                                    else if (rule.color === 'blue') displayColor = 'text-blue-500';
                                                    break;
                                                }
                                            }
                                        }
                                        return (
                                            <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in zoom-in-95 duration-500">
                                                <div className={`text-6xl lg:text-8xl font-black tracking-widest break-all transition-colors duration-300 ${displayColor}`}>{formatValue(val, Object.keys(results[0])[0])}</div>
                                                <div className="text-xs font-bold text-slate-400 mt-6 uppercase tracking-[0.4em] font-mono">{(visConfig.yAxes || [])[0] || Object.keys(results[0])[0]}</div>
                                            </div>
                                        );
                                    })() : (
                                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                            {visType === 'bar' ? (
                                                <BarChart data={results}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey={visConfig.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} tickFormatter={val => formatValue(val, (visConfig.yAxes || [])[0])} />
                                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} cursor={{ fill: '#f8fafc' }} formatter={(val, name) => [formatValue(val, name as string), name]} />
                                                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                    {(visConfig.yAxes || []).map((y, idx) => (
                                                        <Bar key={y} dataKey={y} fill={idx === 0 ? (visConfig.color || COLORS[0]) : COLORS[idx % COLORS.length]} radius={[4, 4, 0, 0]}>
                                                            {visConfig.showLabels && <LabelList dataKey={y} position="top" style={{ fontSize: '10px', fontWeight: 'bold', fill: '#64748b' }} formatter={val => formatValue(val, y)} />}
                                                        </Bar>
                                                    ))}
                                                </BarChart>
                                            ) : visType === 'line' ? (
                                                <LineChart data={results}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey={visConfig.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} tickFormatter={val => formatValue(val, (visConfig.yAxes || [])[0])} />
                                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} formatter={(val, name) => [formatValue(val, name as string), name]} />
                                                    <Legend verticalAlign="top" height={36} iconType="circle" />
                                                    {(visConfig.yAxes || []).map((y, idx) => (
                                                        <Line key={y} type="monotone" dataKey={y} stroke={idx === 0 ? (visConfig.color || COLORS[0]) : COLORS[idx % COLORS.length]} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }}>
                                                            {visConfig.showLabels && <LabelList dataKey={y} position="top" offset={10} style={{ fontSize: '10px', fontWeight: 'bold', fill: '#64748b' }} formatter={val => formatValue(val, y)} />}
                                                        </Line>
                                                    ))}
                                                </LineChart>
                                            ) : visType === 'area' ? (
                                                <AreaChart data={results}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey={visConfig.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} tickFormatter={val => formatValue(val, (visConfig.yAxes || [])[0])} />
                                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} formatter={(val, name) => [formatValue(val, name as string), name]} />
                                                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                    {(visConfig.yAxes || []).map((y, idx) => (
                                                        <Area key={y} type="monotone" dataKey={y} stroke={idx === 0 ? (visConfig.color || COLORS[0]) : COLORS[idx % COLORS.length]} fill={idx === 0 ? (visConfig.color || COLORS[0]) : COLORS[idx % COLORS.length]} fillOpacity={0.2} strokeWidth={2}>
                                                            {visConfig.showLabels && <LabelList dataKey={y} position="top" style={{ fontSize: '10px', fontWeight: 'bold', fill: '#64748b' }} formatter={val => formatValue(val, y)} />}
                                                        </Area>
                                                    ))}
                                                </AreaChart>
                                            ) : visType === 'pie' ? (
                                                <PieChart>
                                                    <Pie
                                                        data={results}
                                                        cx="50%" cy="50%"
                                                        labelLine={false}
                                                        label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                                                        outerRadius={120}
                                                        innerRadius={80}
                                                        paddingAngle={5}
                                                        dataKey={(visConfig.yAxes || [])[0] || ''}
                                                        nameKey={visConfig.xAxis!}
                                                    >
                                                        {results.map((_e, i) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}
                                                    </Pie>
                                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
                                                    <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                </PieChart>
                                            ) : visType === 'composed' ? (
                                                <ComposedChart data={results}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey={visConfig.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} tickFormatter={val => formatValue(val, (visConfig.yAxes || [])[0])} />
                                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} formatter={(val, name) => [formatValue(val, name as string), name]} />
                                                    <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                    {(visConfig.yAxes || []).map((y, idx) => (
                                                        idx === 0 ? (
                                                            <Bar key={y} dataKey={y} fill={COLORS[0]} radius={[4, 4, 0, 0]}>
                                                                {visConfig.showLabels && <LabelList dataKey={y} position="top" style={{ fontSize: '10px', fontWeight: 'bold', fill: '#64748b' }} formatter={val => formatValue(val, y)} />}
                                                            </Bar>
                                                        ) : (
                                                            <Line key={y} type="monotone" dataKey={y} stroke={COLORS[idx % COLORS.length]} strokeWidth={3}>
                                                                {visConfig.showLabels && <LabelList dataKey={y} position="top" style={{ fontSize: '10px', fontWeight: 'bold', fill: '#64748b' }} formatter={val => formatValue(val, y)} />}
                                                            </Line>
                                                        )
                                                    ))}
                                                </ComposedChart>
                                            ) : visType === 'radar' ? (
                                                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={results}>
                                                    <PolarGrid stroke="#e2e8f0" />
                                                    <PolarAngleAxis dataKey={visConfig.xAxis} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
                                                    <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                                    {(visConfig.yAxes || []).map((y, idx) => (
                                                        <Radar key={y} name={y} dataKey={y} stroke={COLORS[idx % COLORS.length]} fill={COLORS[idx % COLORS.length]} fillOpacity={0.6} />
                                                    ))}
                                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
                                                </RadarChart>
                                            ) : visType === 'scatter' ? (
                                                <ScatterChart>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis type="number" dataKey={visConfig.xAxis} name={visConfig.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
                                                    <YAxis type="number" dataKey={(visConfig.yAxes || [])[0]} name={(visConfig.yAxes || [])[0]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
                                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                    <Scatter name={widgetName || 'Scatter'} data={results} fill={visConfig.color || COLORS[0]} />
                                                </ScatterChart>
                                            ) : null}
                                        </ResponsiveContainer>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <Modal isOpen={saveModalOpen} onClose={() => setSaveModalOpen(false)} title={activeWidgetId ? t('querybuilder.update_title') : t('querybuilder.save_title')}>
                <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center gap-3">
                        <Folder className="w-8 h-8 text-blue-500" />
                        <div>
                            <p className="text-[10px] font-black uppercase text-blue-400">{t('querybuilder.archive_name')}</p>
                            <input autoFocus value={widgetName} onChange={e => setWidgetName(e.target.value)} placeholder={t('querybuilder.archive_placeholder')} className="w-full bg-transparent border-none outline-none font-bold text-blue-900 placeholder:text-blue-200" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        {activeWidgetId && (
                            <button onClick={() => { setActiveWidgetId(null); handleSaveWidget(); }} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg flex items-center gap-2">
                                {t('querybuilder.save_new')}
                            </button>
                        )}
                        <button onClick={handleSaveWidget} disabled={!widgetName} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-xs shadow-lg flex items-center gap-2">
                            <Check className="w-4 h-4" /> {t('common.save')}
                        </button>
                    </div>
                </div>
            </Modal>

            <RecordDetailModal
                isOpen={detailModalOpen}
                onClose={() => setDetailModalOpen(false)}
                items={results}
                initialIndex={selectedItemIndex}
                tableName={queryConfig?.table}
                schema={activeSchema}
            />
        </PageLayout>
    );
};
