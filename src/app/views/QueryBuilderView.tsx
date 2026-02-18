
import React, { useState, useMemo } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { Play, Save, BarChart2, Table as TableIcon, TrendingUp, AlertCircle, Layout, Maximize2, Minimize2, Settings, History, Folder, Trash2, Edit3, X, Check, Download } from 'lucide-react';
import { useReportExport } from '../../hooks/useReportExport';
import { DataTable } from '../../components/ui/DataTable';
import { Modal } from '../components/Modal';
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { VisualQueryBuilder, type QueryConfig } from '../components/VisualQueryBuilder';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useDashboard } from '../../lib/context/DashboardContext';
import { RecordDetailModal } from '../components/RecordDetailModal';
import { useAsync } from '../../hooks/useAsync';
import invoiceItemsSchema from '../../schemas/invoice-items-schema.json';

type VisualizationType = 'table' | 'bar' | 'line' | 'area' | 'pie';

interface WidgetConfig {
    type: VisualizationType;
    xAxis?: string;
    yAxes?: string[];
    yAxis?: string;
    color?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export const QueryBuilderView: React.FC = () => {
    const [sql, setSql] = useState('SELECT * FROM invoice_items LIMIT 10');
    const [results, setResults] = useState<any[]>([]);
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
    const [activeSchema, setActiveSchema] = useState<any>(null);
    const { isExporting, exportToPdf } = useReportExport();
    const { togglePresentationMode } = useDashboard();

    // Fetch saved widgets
    const { data: savedWidgets, refresh: refreshWidgets } = useAsync<any[]>(
        async () => await SystemRepository.getUserWidgets(),
        []
    );

    // Auto-Schema Generation
    React.useEffect(() => {
        const tableName = queryConfig?.table || 'invoice_items';
        if (tableName === 'invoice_items') {
            setActiveSchema(invoiceItemsSchema);
            return;
        }
        SystemRepository.getTableSchema(tableName).then(cols => {
            if (cols && cols.length > 0) {
                const dynamicSchema = {
                    title: `Tabelle: ${tableName}`,
                    description: `Automatisch generiertes Schema für die Tabelle "${tableName}".`,
                    type: 'object',
                    properties: cols.reduce((acc, col) => {
                        acc[col.name] = {
                            type: col.type.toLowerCase().includes('int') || col.type.toLowerCase().includes('real') ? 'number' : 'string',
                            description: `Feld: ${col.name} (Typ: ${col.type})`
                        };
                        return acc;
                    }, {} as any)
                };
                setActiveSchema(dynamicSchema);
            }
        });
    }, [queryConfig?.table]);

    const handleRun = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await SystemRepository.executeRaw(sql);
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
        } catch (err: any) {
            setError(err.message);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const loadWidget = (widget: any) => {
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
        // Run query immediately to show results
        setTimeout(handleRun, 100);
    };

    const handleSaveWidget = async () => {
        if (!widgetName) return;
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
            alert(activeWidgetId ? 'Widget aktualisiert!' : 'Widget gespeichert!');
            setActiveWidgetId(widget.id);
        } catch (err: any) {
            alert('Fehler beim Speichern: ' + err.message);
        }
    };

    const deleteWidget = async (id: string) => {
        if (confirm('Diesen Bericht wirklich löschen?')) {
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
            render: (item: any) => typeof item[key] === 'number' && (key.toLowerCase().includes('amount') || key.toLowerCase().includes('price'))
                ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(item[key])
                : item[key]
        }));
    }, [results]);

    const resultColumns = results.length > 0 ? Object.keys(results[0]) : [];

    return (
        <PageLayout
            header={{
                title: 'Abfrage & Reporting Builder',
                subtitle: 'Erstellen Sie SQL-Abfragen und Visualisierungen.',
                actions: (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={togglePresentationMode}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                            title="Präsentationsmodus"
                        >
                            <Maximize2 className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => exportToPdf('query-visualization', `report-${widgetName || 'query'}`)}
                            disabled={isExporting || results.length === 0}
                            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium text-sm disabled:opacity-50"
                        >
                            <Download className="w-4 h-4" />
                            {isExporting ? 'Export...' : 'PDF'}
                        </button>
                        {activeWidgetId && (
                            <button
                                onClick={() => setActiveWidgetId(null)}
                                className="px-4 py-2 text-slate-400 hover:text-slate-600 font-medium text-sm transition-colors"
                            >
                                Neu erstellen
                            </button>
                        )}
                        <button
                            onClick={() => setSaveModalOpen(true)}
                            disabled={results.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium text-sm disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" />
                            {activeWidgetId ? 'Aktualisieren' : 'Als Widget speichern'}
                        </button>
                    </div>
                )
            }}
        >
            <>
                <div className="flex flex-col gap-6 h-[calc(100vh-140px)]">
                    <div className="flex-1 flex gap-6 min-h-0 overflow-hidden relative">
                        {/* Sidebar */}
                        <div className={`${isMaximized ? 'hidden' : 'w-full lg:w-96'} flex flex-col gap-4 h-full overflow-hidden transition-all duration-300`}>
                            {/* Sidebar Tabs */}
                            <div className="flex bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl">
                                <button
                                    onClick={() => setSidebarTab('archive')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-black uppercase transition-all ${sidebarTab === 'archive' ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    <Folder className="w-4 h-4" /> Archiv
                                </button>
                                <button
                                    onClick={() => setSidebarTab('query')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-black uppercase transition-all ${sidebarTab === 'query' ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    <History className="w-4 h-4" /> Abfrage
                                </button>
                                <button
                                    onClick={() => setSidebarTab('vis')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-black uppercase transition-all ${sidebarTab === 'vis' ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    <Settings className="w-4 h-4" /> Grafik
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
                                {sidebarTab === 'archive' ? (
                                    <div className="space-y-2 animate-in fade-in duration-300">
                                        <h3 className="text-[10px] font-black uppercase text-slate-400 px-2 py-1 flex items-center justify-between">
                                            Gespeicherte Berichte
                                            <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[9px]">{savedWidgets?.length || 0}</span>
                                        </h3>
                                        <div className="space-y-1">
                                            {savedWidgets?.map(w => (
                                                <div
                                                    key={w.id}
                                                    className={`group p-3 rounded-lg border flex flex-col gap-1 transition-all cursor-pointer ${activeWidgetId === w.id ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-100' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-200'}`}
                                                    onClick={() => loadWidget(w)}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-slate-700 dark:text-slate-200 text-sm truncate">{w.name}</span>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); deleteWidget(w.id); }}
                                                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition-all"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px]">
                                                        <span className="text-slate-400 truncate max-w-[150px] font-mono">{w.sql_query}</span>
                                                        <span className="ml-auto text-blue-400 flex items-center gap-1 font-bold italic">
                                                            {JSON.parse(w.visualization_config).type.toUpperCase()}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                            {(!savedWidgets || savedWidgets.length === 0) && (
                                                <div className="p-8 text-center border-2 border-dashed border-slate-100 rounded-xl text-slate-300">
                                                    <Folder className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                                    <p className="text-[10px] font-black uppercase">Noch keine Berichte</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : sidebarTab === 'query' ? (
                                    <>
                                        {activeWidgetId && (
                                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 flex items-center justify-between">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <Edit3 className="w-4 h-4 flex-shrink-0" />
                                                    <span className="text-xs font-bold truncate">Bearbeite: {widgetName}</span>
                                                </div>
                                                <button onClick={() => setActiveWidgetId(null)} className="p-1 hover:bg-amber-100 rounded text-amber-500"><X className="w-3.5 h-3.5" /></button>
                                            </div>
                                        )}
                                        {/* Builder Toggle */}
                                        <div className="bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex">
                                            <button
                                                onClick={() => setBuilderMode('visual')}
                                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${builderMode === 'visual' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                                            >
                                                <Layout className="w-3.5 h-3.5" /> Visual Builder
                                            </button>
                                            <button
                                                onClick={() => setBuilderMode('sql')}
                                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${builderMode === 'sql' ? 'bg-slate-900 dark:bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                                            >
                                                <span className="font-mono text-[10px]">SQL</span> Direct Editor
                                            </button>
                                        </div>

                                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-2">
                                            {builderMode === 'sql' ? (
                                                <>
                                                    <label className="text-[10px] font-black uppercase text-slate-400 text-left">SQL Abfrage</label>
                                                    <textarea
                                                        value={sql}
                                                        onChange={e => setSql(e.target.value)}
                                                        className="w-full h-64 font-mono text-xs p-3 bg-slate-900 text-slate-100 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                                                        placeholder="SELECT * FROM..."
                                                    />
                                                </>
                                            ) : (
                                                <VisualQueryBuilder
                                                    initialConfig={queryConfig}
                                                    onChange={(newSql, newConfig) => {
                                                        setSql(newSql);
                                                        setQueryConfig(newConfig);
                                                    }}
                                                />
                                            )}
                                            <div className="flex justify-end pt-2 border-t border-slate-50 dark:border-slate-800 mt-2">
                                                <button
                                                    onClick={handleRun}
                                                    disabled={loading}
                                                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-xs transition-all shadow-md shadow-blue-200 disabled:opacity-50"
                                                >
                                                    <Play className="w-3.5 h-3.5" />
                                                    {loading ? 'Laden...' : 'Anwenden'}
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    /* Vis Config */
                                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-4 animate-in slide-in-from-right-4 duration-300">
                                        <h3 className="text-xs font-black uppercase text-slate-400 flex items-center gap-2">
                                            <Layout className="w-3.5 h-3.5 text-blue-500" />
                                            Grafik-Typ
                                        </h3>

                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { id: 'table', icon: TableIcon, label: 'Tabelle' },
                                                { id: 'bar', icon: BarChart2, label: 'Balken' },
                                                { id: 'line', icon: TrendingUp, label: 'Linie' },
                                                { id: 'area', icon: Layout, label: 'Fläche' },
                                                { id: 'pie', icon: Layout, label: 'Kreis' },
                                            ].map(type => (
                                                <button
                                                    key={type.id}
                                                    onClick={() => setVisType(type.id as VisualizationType)}
                                                    className={`p-2 rounded-lg flex flex-col items-center justify-center gap-1 border transition-all ${visType === type.id ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 text-blue-600' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300'}`}
                                                >
                                                    <type.icon className="w-4 h-4" />
                                                    <span className="text-[9px] uppercase font-black">{type.label}</span>
                                                </button>
                                            ))}
                                        </div>

                                        {visType !== 'table' && results.length > 0 && (
                                            <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                                                <div>
                                                    <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">
                                                        {visType === 'pie' ? 'Beschriftung' : 'X-Achse'}
                                                    </label>
                                                    <select
                                                        value={visConfig.xAxis || ''}
                                                        onChange={e => setVisConfig({ ...visConfig, xAxis: e.target.value })}
                                                        className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-800 outline-none focus:ring-1 focus:ring-blue-500"
                                                    >
                                                        <option value="">Bitte wählen...</option>
                                                        {resultColumns.map(col => <option key={col} value={col}>{col}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-2">
                                                        {visType === 'pie' ? 'Wert' : 'Y-Achsen'}
                                                    </label>
                                                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                                                        {resultColumns.map(col => {
                                                            const isNumeric = results.length > 0 && typeof results[0][col] === 'number';
                                                            const isChecked = (visConfig.yAxes || []).includes(col);
                                                            return (
                                                                <label key={col} className={`flex items-center gap-2 p-1.5 rounded-md border transition-all cursor-pointer ${isChecked ? 'bg-blue-50 border-blue-200 text-blue-700' : 'hover:bg-slate-50 border-transparent text-slate-500'}`}>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3 h-3"
                                                                        checked={isChecked}
                                                                        onChange={e => {
                                                                            const current = visConfig.yAxes || [];
                                                                            const next = e.target.checked ? [...current, col] : current.filter(c => c !== col);
                                                                            setVisConfig({ ...visConfig, yAxes: next });
                                                                        }}
                                                                    />
                                                                    <span className="text-[10px] font-bold truncate">
                                                                        {col}
                                                                        {!isNumeric && visType !== 'pie' && <span className="ml-1 text-[8px] opacity-40 font-normal">(X)</span>}
                                                                    </span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {error && (
                                    <div className="bg-red-50 dark:bg-red-900/10 text-red-600 text-[10px] p-3 rounded-lg border border-red-100 dark:border-red-900/30 flex items-start gap-2 mt-2">
                                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                        <span className="font-mono break-all leading-relaxed">{error}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Preview */}
                        <div id="query-visualization" className="flex-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full relative">
                            <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Vorschau ({results.length})</h3>
                                <button
                                    onClick={() => setIsMaximized(!isMaximized)}
                                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-slate-400 transition-all flex items-center gap-1.5"
                                >
                                    {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                                    <span className="text-[9px] font-black uppercase">{isMaximized ? "Zentriert" : "Fokus"}</span>
                                </button>
                            </div>

                            <div className="flex-1 overflow-auto p-4 min-h-0 container-scrollbar">
                                {visType === 'table' ? (
                                    results.length > 0 ? (
                                        <DataTable
                                            columns={columns}
                                            data={results}
                                            onRowClick={(item) => {
                                                setSelectedItemIndex(results.indexOf(item));
                                                setDetailModalOpen(true);
                                            }}
                                        />
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                            <Play className="w-12 h-12 mb-4 opacity-10" />
                                            <p className="text-xs font-black uppercase tracking-widest text-center">Keine Daten<br />Abfrage ausführen</p>
                                        </div>
                                    )
                                ) : (
                                    <div className="h-full min-h-[400px]">
                                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                            {visType === 'bar' ? (
                                                <BarChart data={results}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                    <XAxis dataKey={visConfig.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} cursor={{ fill: '#f1f5f9' }} />
                                                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                    {(visConfig.yAxes || []).map((y, idx) => (
                                                        <Bar key={y} dataKey={y} fill={idx === 0 ? (visConfig.color || COLORS[0]) : COLORS[idx % COLORS.length]} radius={[4, 4, 0, 0]} />
                                                    ))}
                                                </BarChart>
                                            ) : visType === 'line' ? (
                                                <LineChart data={results}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                    <XAxis dataKey={visConfig.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                                    <Legend verticalAlign="top" height={36} iconType="circle" />
                                                    {(visConfig.yAxes || []).map((y, idx) => (
                                                        <Line key={y} type="monotone" dataKey={y} stroke={idx === 0 ? (visConfig.color || COLORS[0]) : COLORS[idx % COLORS.length]} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                                    ))}
                                                </LineChart>
                                            ) : visType === 'area' ? (
                                                <AreaChart data={results}>
                                                    <XAxis dataKey={visConfig.xAxis} />
                                                    <YAxis />
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                    <Tooltip />
                                                    <Legend verticalAlign="top" />
                                                    {(visConfig.yAxes || []).map((y, idx) => (
                                                        <Area key={y} type="monotone" dataKey={y} stroke={idx === 0 ? (visConfig.color || COLORS[0]) : COLORS[idx % COLORS.length]} fill={idx === 0 ? (visConfig.color || COLORS[0]) : COLORS[idx % COLORS.length]} fillOpacity={0.2} strokeWidth={2} />
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
                                                    <Tooltip />
                                                    <Legend />
                                                </PieChart>
                                            ) : null}
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Save/Update Modal */}
                <Modal isOpen={saveModalOpen} onClose={() => setSaveModalOpen(false)} title={activeWidgetId ? "Bericht aktualisieren" : "Bericht speichern"}>
                    <div className="space-y-4">
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center gap-3">
                            <Folder className="w-8 h-8 text-blue-500" />
                            <div>
                                <p className="text-[10px] font-black uppercase text-blue-400">Archivierungs-Name</p>
                                <input
                                    autoFocus
                                    value={widgetName}
                                    onChange={e => setWidgetName(e.target.value)}
                                    placeholder="z.B. Monatliche Hardware-Kosten"
                                    className="w-full bg-transparent border-none outline-none font-bold text-blue-900 placeholder:text-blue-200"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            {activeWidgetId && (
                                <button
                                    onClick={() => { setActiveWidgetId(null); handleSaveWidget(); }}
                                    className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg flex items-center gap-2"
                                >
                                    Neu speichern
                                </button>
                            )}
                            <button
                                onClick={handleSaveWidget}
                                disabled={!widgetName}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-xs shadow-lg shadow-blue-100 flex items-center gap-2"
                            >
                                <Check className="w-4 h-4" /> Speichern
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
            </>
        </PageLayout>
    );
};
