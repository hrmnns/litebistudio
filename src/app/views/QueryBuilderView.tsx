import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '../components/ui/PageLayout';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import {
    Play, BarChart2, Table as TableIcon, TrendingUp, AlertCircle,
    Layout, Maximize2, Minimize2, Folder, Trash2,
    Edit3, X, Download, Check, Search
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
import type { DbRow, WidgetConfig } from '../../types';
import type { QueryConfig } from '../components/VisualQueryBuilder';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useDashboard } from '../../lib/context/DashboardContext';
import { RecordDetailModal } from '../components/RecordDetailModal';
import { useAsync } from '../../hooks/useAsync';
import { PivotTable } from '../components/PivotTable';
import type { SchemaDefinition } from '../components/SchemaDocumentation';
import { createLogger } from '../../lib/logger';
import { appDialog } from '../../lib/appDialog';
import type { SqlStatementRecord } from '../../lib/repositories/SystemRepository';

type VisualizationType = 'table' | 'bar' | 'line' | 'area' | 'pie' | 'kpi' | 'composed' | 'radar' | 'scatter' | 'pivot' | 'text';
type GuidedStep = 1 | 2 | 3 | 4;
const DEFAULT_SQL = '';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
const logger = createLogger('QueryBuilderView');

interface SavedWidget {
    id: string;
    name: string;
    sql_statement_id?: string | null;
    sql_query: string;
    visualization_config: string;
    visual_builder_config?: string | null;
}

const normalizeSqlText = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

export const QueryBuilderView: React.FC = () => {
    const { t } = useTranslation();
    const [sql, setSql] = useState(DEFAULT_SQL);
    const [results, setResults] = useState<DbRow[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [lastRunSql, setLastRunSql] = useState('');
    const [previewRenderVersion, setPreviewRenderVersion] = useState(0);
    const [savedSnapshot, setSavedSnapshot] = useState('');

    // Mode State
    const [builderMode, setBuilderMode] = useState<'sql' | 'visual'>('sql');
    const [sidebarTab, setSidebarTab] = useState<'query' | 'vis'>('query');
    const [entryMode, setEntryMode] = useState<'new' | 'existing'>('new');
    const [startAction, setStartAction] = useState<'new' | 'open'>('new');
    const [isMaximized, setIsMaximized] = useState(false);
    const [guidedStep, setGuidedStep] = useState<GuidedStep>(1);
    const [queryConfig, setQueryConfig] = useLocalStorage<QueryConfig | undefined>('query_builder_config', undefined);
    const [sqlEditorHeight] = useLocalStorage<number>('query_builder_sql_editor_height', 384);

    // Visualization State
    const [visType, setVisType] = useState<VisualizationType>('table');
    const [visConfig, setVisConfig] = useState<WidgetConfig>({ type: 'table', color: '#3b82f6' });

    // Active Widget State
    const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);

    // Save Widget State
    const [saveModalOpen, setSaveModalOpen] = useState(false);
    const [widgetName, setWidgetName] = useState('');
    const [widgetSearchTerm, setWidgetSearchTerm] = useState('');
    const [sqlStatementSearchTerm, setSqlStatementSearchTerm] = useState('');
    const [selectedSqlStatementId, setSelectedSqlStatementId] = useState<string>('');

    // Detail View State
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [selectedItemIndex, setSelectedItemIndex] = useState(0);
    const [activeSchema, setActiveSchema] = useState<SchemaDefinition | null>(null);
    const { isExporting, exportToPdf } = useReportExport();
    const { togglePresentationMode, isReadOnly } = useDashboard();

    // Fetch saved widgets
    const { data: savedWidgets, refresh: refreshWidgets } = useAsync<SavedWidget[]>(
        async () => await SystemRepository.getUserWidgets() as unknown as SavedWidget[],
        []
    );
    const { data: sqlStatements, refresh: refreshSqlStatements } = useAsync<SqlStatementRecord[]>(
        async () => await SystemRepository.listSqlStatements('global'),
        []
    );

    // Widget Studio no longer builds SQL visually; schema metadata is optional.
    useEffect(() => {
        setActiveSchema(null);
    }, []);

    const handleRun = useCallback(async (overrideSql?: string): Promise<boolean> => {
        setLoading(true);
        setError('');
        try {
            const sqlToExecute = overrideSql || sql;
            const data = await SystemRepository.executeRaw(sqlToExecute);
            setResults(data);
            setLastRunSql(sqlToExecute);
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
            return true;
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
            return false;
        } finally {
            setLoading(false);
        }
    }, [sql, visConfig.xAxis]);

    const loadWidget = (widget: SavedWidget) => {
        let parsedVisConfig: WidgetConfig = { type: 'table', color: '#3b82f6' };
        let parsedVisType: VisualizationType = 'table';
        let parsedBuilderMode: 'sql' | 'visual' = 'sql';
        let parsedQueryConfig: QueryConfig | undefined;
        const linkedStatement = widget.sql_statement_id
            ? (sqlStatements || []).find(stmt => stmt.id === widget.sql_statement_id)
            : undefined;
        const widgetSql = (linkedStatement?.sql_text || widget.sql_query || '').trim() || DEFAULT_SQL;

        setActiveWidgetId(widget.id);
        setWidgetName(widget.name);
        setSql(widgetSql);
        const matchedBySql = (sqlStatements || []).find(stmt => normalizeSqlText(stmt.sql_text) === normalizeSqlText(widgetSql));
        setSelectedSqlStatementId(linkedStatement?.id || matchedBySql?.id || '');
        setLastRunSql('');
        setResults([]);
        setError('');
        setQueryConfig(undefined);
        setBuilderMode('sql');
        setVisType('table');
        setVisConfig({ type: 'table', color: '#3b82f6' });

        try {
            const visualConfig = JSON.parse(widget.visualization_config) as WidgetConfig;
            parsedVisConfig = visualConfig;
            parsedVisType = (visualConfig.type || 'table') as VisualizationType;
            setVisType(parsedVisType);
            setVisConfig(parsedVisConfig);

            parsedBuilderMode = 'sql';
            if (widget.visual_builder_config) {
                parsedQueryConfig = JSON.parse(widget.visual_builder_config) as QueryConfig;
            } else {
                parsedQueryConfig = undefined;
            }
            setBuilderMode(parsedBuilderMode);
            setQueryConfig(undefined);
        } catch (e) {
            logger.error('Error parsing widget config', e);
        }

        setSidebarTab('query');
        setEntryMode('existing');
        setStartAction('open');
        if (parsedVisType === 'text') {
            setSql('');
            setLastRunSql('');
            setBuilderMode('sql');
            setQueryConfig(undefined);
            setGuidedStep(3);
        } else {
            setSql(widgetSql);
            setGuidedStep(2);
            setTimeout(() => handleRun(widgetSql), 100);
        }
        setSidebarTab('query');
        setSavedSnapshot(buildSnapshot({
            currentSql: parsedVisType === 'text' ? '' : widgetSql,
            currentBuilderMode: parsedBuilderMode,
            currentQueryConfig: parsedVisType === 'text' ? undefined : parsedQueryConfig,
            currentVisType: parsedVisType,
            currentVisConfig: parsedVisConfig,
            currentWidgetName: widget.name,
            currentActiveWidgetId: widget.id
        }));
    };

    const handleSaveWidget = async () => {
        if (!widgetName || isReadOnly) return;
        try {
            const linkedStatement = (sqlStatements || []).find(stmt => stmt.id === selectedSqlStatementId);
            const sqlText = sql.trim();
            const linkedStatementId =
                linkedStatement && normalizeSqlText(linkedStatement.sql_text) === normalizeSqlText(sqlText)
                    ? linkedStatement.id
                    : null;
            const widget = {
                id: activeWidgetId || crypto.randomUUID(),
                name: widgetName,
                description: '',
                sql_statement_id: linkedStatementId,
                sql_query: sqlText,
                visualization_config: { ...visConfig, type: visType },
                visual_builder_config: null
            };

            await SystemRepository.saveUserWidget(widget);

            setSaveModalOpen(false);
            if (!activeWidgetId) setWidgetName('');
            refreshWidgets();
            setActiveWidgetId(widget.id);
            setSavedSnapshot(buildSnapshot({
                currentSql: widget.sql_query,
                currentBuilderMode: builderMode,
                currentQueryConfig: undefined,
                currentVisType: visType,
                currentVisConfig: { ...visConfig, type: visType },
                currentWidgetName: widget.name,
                currentActiveWidgetId: widget.id
            }));
        } catch (err: unknown) {
            await appDialog.error(t('querybuilder.error_save') + (err instanceof Error ? err.message : String(err)));
            return;
        }
        await appDialog.info(activeWidgetId ? t('querybuilder.success_update') : t('querybuilder.success_save'));
    };

    const deleteWidget = async (id: string) => {
        if (isReadOnly) return;
        const shouldConfirm = localStorage.getItem('notifications_confirm_destructive') !== 'false';
        if (!shouldConfirm || (await appDialog.confirm(t('dashboard.confirm_delete_report')))) {
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
    const filteredSavedWidgets = useMemo(() => {
        const all = savedWidgets || [];
        const term = widgetSearchTerm.trim().toLowerCase();
        if (!term) return all;
        return all.filter((widget) =>
            widget.name.toLowerCase().includes(term) ||
            (widget.sql_query || '').toLowerCase().includes(term)
        );
    }, [savedWidgets, widgetSearchTerm]);
    const filteredSqlStatements = useMemo(() => {
        const all = sqlStatements || [];
        const term = sqlStatementSearchTerm.trim().toLowerCase();
        if (!term) return all;
        return all.filter((stmt) =>
            stmt.name.toLowerCase().includes(term) ||
            stmt.sql_text.toLowerCase().includes(term) ||
            (stmt.description || '').toLowerCase().includes(term)
        );
    }, [sqlStatements, sqlStatementSearchTerm]);

    const selectedSqlStatement = useMemo(
        () => (sqlStatements || []).find(stmt => stmt.id === selectedSqlStatementId),
        [sqlStatements, selectedSqlStatementId]
    );
    const sqlMatchesSelectedStatement = useMemo(
        () => Boolean(selectedSqlStatement && normalizeSqlText(selectedSqlStatement.sql_text) === normalizeSqlText(sql)),
        [selectedSqlStatement, sql]
    );
    const resultColumns = useMemo(
        () => (results.length > 0 ? Object.keys(results[0]) : []),
        [results]
    );
    const numericColumns = useMemo(() => {
        if (results.length === 0) return [] as string[];
        return resultColumns.filter((col) =>
            results.some((row) => row[col] !== null && row[col] !== undefined && typeof row[col] === 'number')
        );
    }, [results, resultColumns]);
    const isTextWidget = visType === 'text';
    const scatterXKey = visConfig.xAxis || '';
    const scatterYKey = (visConfig.yAxes || [])[0] || '';
    const scatterData = useMemo(() => {
        if (visType !== 'scatter' || !scatterXKey || !scatterYKey) return [] as DbRow[];
        return results
            .map((row) => {
                const x = Number(row[scatterXKey]);
                const y = Number(row[scatterYKey]);
                return { ...row, [scatterXKey]: x, [scatterYKey]: y };
            })
            .filter((row) => Number.isFinite(row[scatterXKey] as number) && Number.isFinite(row[scatterYKey] as number));
    }, [results, scatterXKey, scatterYKey, visType]);
    const previewVisType: VisualizationType = (guidedStep === 2 && !isTextWidget) ? 'table' : visType;
    const canPersistWidget = isTextWidget || results.length > 0;
    const exportDisabled = isExporting || (!isTextWidget && results.length === 0);
    const saveDisabled = !canPersistWidget || isReadOnly || (!isTextWidget && !sqlMatchesSelectedStatement);
    const exportDisabledReason = isExporting
        ? t('common.exporting')
        : (!isTextWidget && results.length === 0 ? t('querybuilder.hint_run_query_before_export') : '');
    const textSizeClass = {
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-lg',
        xl: 'text-xl',
        '2xl': 'text-2xl'
    } as const;

    const hasEntrySelection = entryMode === 'new' || (entryMode === 'existing' && Boolean(activeWidgetId));
    const hasSourceConfig = isTextWidget || sqlMatchesSelectedStatement;
    const hasRunOutput = isTextWidget || (results.length > 0 && !error && lastRunSql.trim() === sql.trim());
    const hasVisualizationConfig = useMemo(() => {
        if (visType === 'text') {
            return Boolean((visConfig.textContent || '').trim());
        }
        if (visType === 'table' || visType === 'pivot') {
            return true;
        }
        const hasXAxis = Boolean(visConfig.xAxis);
        const hasYAxis = Boolean(visConfig.yAxes && visConfig.yAxes.length > 0);
        if (!hasXAxis || !hasYAxis) {
            return false;
        }
        if (visType === 'scatter') {
            const xIsNumeric = numericColumns.includes(scatterXKey);
            const yIsNumeric = numericColumns.includes(scatterYKey);
            return xIsNumeric && yIsNumeric && scatterData.length > 0;
        }
        if (visType === 'kpi') {
            return results.length > 0;
        }
        const hasRenderableData = results.some((row) => {
            const xVal = row[visConfig.xAxis as string];
            if (xVal === null || xVal === undefined || xVal === '') return false;
            return (visConfig.yAxes || []).some((yAxis) => {
                const yVal = row[yAxis];
                return yVal !== null && yVal !== undefined && yVal !== '';
            });
        });
        return hasRenderableData;
    }, [visType, visConfig, numericColumns, scatterData.length, scatterXKey, scatterYKey, results]);
    const previewVisualizationInvalid = !isTextWidget
        && results.length > 0
        && previewVisType !== 'table'
        && previewVisType !== 'pivot'
        && !hasVisualizationConfig;
    const suggestedGuidedStep: GuidedStep = !hasEntrySelection
        ? 1
        : isTextWidget
            ? (!hasVisualizationConfig ? 3 : 4)
            : (!hasSourceConfig || !hasRunOutput
                ? 2
                : !hasVisualizationConfig
                    ? 3
                    : 4);
    const canGoToStep = (step: GuidedStep) => {
        if (isTextWidget && step === 2) return false;
        return step <= suggestedGuidedStep;
    };
    const guidedNextDisabled = loading || (
        guidedStep === 1
            ? !hasEntrySelection
            : guidedStep === 2
                ? (isTextWidget ? false : (!hasSourceConfig || !hasRunOutput))
                : guidedStep === 3
                    ? !hasVisualizationConfig
                    : saveDisabled
    );
    const guidedPrimaryLabel = guidedStep >= 4
        ? t('querybuilder.finish')
        : t('querybuilder.next');
    const guidedApplyVisible = guidedStep === 2 || guidedStep === 3;
    const guidedApplyDisabled = loading || (
        guidedStep === 2
            ? (isTextWidget || !hasSourceConfig)
            : guidedStep === 3
                ? false
                : true
    );
    const guidedApplyLabel = loading
        ? t('common.loading')
        : t('querybuilder.apply');
    const effectiveSidebarTab: 'query' | 'vis' = sidebarTab;
    const showGuidedFooter = true;
    const showFinalizePanel = guidedStep === 4 && effectiveSidebarTab === 'query';
    const buildSnapshot = useCallback((overrides?: {
        currentSql?: string;
        currentBuilderMode?: 'sql' | 'visual';
        currentQueryConfig?: QueryConfig | undefined;
        currentVisType?: VisualizationType;
        currentVisConfig?: WidgetConfig;
        currentWidgetName?: string;
        currentActiveWidgetId?: string | null;
    }) => JSON.stringify({
        sql: (overrides?.currentSql ?? sql).trim(),
        builderMode: overrides?.currentBuilderMode ?? builderMode,
        queryConfig: overrides?.currentQueryConfig ?? queryConfig ?? null,
        visType: overrides?.currentVisType ?? visType,
        visConfig: overrides?.currentVisConfig ?? visConfig,
        widgetName: (overrides?.currentWidgetName ?? widgetName).trim(),
        activeWidgetId: overrides?.currentActiveWidgetId ?? activeWidgetId
    }), [sql, builderMode, queryConfig, visType, visConfig, widgetName, activeWidgetId]);
    const currentSnapshot = useMemo(
        () => buildSnapshot(),
        [buildSnapshot]
    );
    const hasUnsavedChanges = savedSnapshot.length > 0 && currentSnapshot !== savedSnapshot;
    const stepLabels: Record<GuidedStep, string> = {
        1: t('querybuilder.step_start'),
        2: t('querybuilder.step_source_run'),
        3: t('querybuilder.step_visualize'),
        4: t('querybuilder.step_finalize')
    };
    const stepHelpText: Record<GuidedStep, string> = {
        1: t('querybuilder.step_help_start'),
        2: t('querybuilder.step_help_source_run'),
        3: t('querybuilder.step_help_visualize'),
        4: t('querybuilder.step_help_finalize')
    };
    const guidedSteps: GuidedStep[] = [1, 2, 3, 4];
    const modeInfoText =
        entryMode === 'new' && !activeWidgetId
            ? (isTextWidget ? t('querybuilder.mode_new_text_active') : t('querybuilder.mode_new_active'))
            : (!activeWidgetId
                ? t('querybuilder.mode_open_select', 'Waehle ein bestehendes Widget aus der Liste.')
                : t('querybuilder.mode_editing_active', { name: widgetName }));
    const applySqlStatementSource = useCallback((statement: SqlStatementRecord) => {
        setSelectedSqlStatementId(statement.id);
        setQueryConfig(undefined);
        setSql(statement.sql_text);
        setLastRunSql('');
        setResults([]);
        setError('');
    }, [setQueryConfig]);
    const previewTypeMeta = useMemo(() => {
        const iconClass = 'w-5 h-5';
        switch (previewVisType) {
            case 'table':
                return { icon: <TableIcon className={iconClass} />, label: t('querybuilder.table') };
            case 'bar':
                return { icon: <BarChart2 className={iconClass} />, label: t('querybuilder.bar') };
            case 'line':
                return { icon: <TrendingUp className={iconClass} />, label: t('querybuilder.line') };
            case 'text':
                return { icon: <Edit3 className={iconClass} />, label: t('querybuilder.text') };
            default:
                return { icon: <Layout className={iconClass} />, label: previewVisType.toUpperCase() };
        }
    }, [previewVisType, t]);

    const gotoStep = (step: GuidedStep) => {
        if (!canGoToStep(step)) return;
        setGuidedStep(step);
        if (step <= 2) setSidebarTab('query');
        if (step === 3) setSidebarTab('vis');
        if (step === 4) setSidebarTab('query');
    };

    const handleGuidedNext = async () => {
        if (guidedStep === 1) {
            if (!hasEntrySelection) return;
            gotoStep(isTextWidget ? 3 : 2);
            return;
        }
        if (guidedStep === 2) {
            if (isTextWidget) {
                gotoStep(3);
                return;
            }
            if (!hasSourceConfig || !hasRunOutput) return;
            gotoStep(3);
            return;
        }
        if (guidedStep === 3) {
            if (!hasVisualizationConfig) return;
            gotoStep(4);
            return;
        }
        if (guidedStep === 4 && !saveDisabled) {
            setSaveModalOpen(true);
        }
    };

    const handleGuidedApply = async () => {
        if (guidedStep === 2) {
            if (isTextWidget || !hasSourceConfig || loading) return;
            await handleRun();
            return;
        }
        if (guidedStep === 3) {
            setPreviewRenderVersion((prev) => prev + 1);
            if (!hasVisualizationConfig) return;
        }
    };

    useEffect(() => {
        if (!savedSnapshot) {
            setSavedSnapshot(currentSnapshot);
        }
    }, [savedSnapshot, currentSnapshot]);

    useEffect(() => {
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!hasUnsavedChanges) return;
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [hasUnsavedChanges]);

    useEffect(() => {
        setGuidedStep(prev => (prev > suggestedGuidedStep ? suggestedGuidedStep : prev));
    }, [suggestedGuidedStep]);

    useEffect(() => {
        if (visType !== 'scatter' || numericColumns.length === 0) return;
        const currentX = visConfig.xAxis || '';
        const currentY = (visConfig.yAxes || [])[0] || '';
        const xValid = numericColumns.includes(currentX);
        const yValid = numericColumns.includes(currentY);
        if (xValid && yValid) return;

        const nextX = xValid ? currentX : numericColumns[0];
        const fallbackY = numericColumns[1] || numericColumns[0];
        const nextY = yValid ? currentY : fallbackY;
        setVisConfig(prev => ({
            ...prev,
            xAxis: nextX,
            yAxes: nextY ? [nextY] : []
        }));
    }, [visType, numericColumns, visConfig.xAxis, visConfig.yAxes]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const isModifier = event.ctrlKey || event.metaKey;
            if (!isModifier) return;

            const key = event.key.toLowerCase();
            if (key === 'enter') {
                event.preventDefault();
                if (!loading) {
                    void handleRun();
                }
            }

            if (key === 's') {
                event.preventDefault();
                if (!saveDisabled) {
                    setSaveModalOpen(true);
                }
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [loading, saveDisabled, handleRun]);

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
                            disabled={exportDisabled}
                            title={exportDisabled ? exportDisabledReason : t('querybuilder.hint_export_shortcut')}
                            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium text-sm disabled:opacity-50"
                        >
                            <Download className="w-4 h-4" />
                            {isExporting ? t('common.exporting') : t('common.export_pdf')}
                        </button>
                    </div>
                )
            }}
        >
            <div className="flex flex-col gap-6 h-full min-h-0">
                <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-0 overflow-hidden relative">
                    {/* Builder Rail */}
                    <div className={`${isMaximized ? 'hidden' : 'w-full lg:w-96'} min-h-0 overflow-hidden transition-all duration-300`}>
                        <div className="flex flex-col h-full max-h-[46vh] lg:max-h-none bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                                <div className="p-3">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1">
                                        {t('querybuilder.guided_panel')}
                                    </h3>
                                </div>
                                <div className="border-t border-slate-100 dark:border-slate-800 px-3 pt-2 pb-2">
                                <div className="grid grid-cols-4 gap-1">
                                    {guidedSteps.map((step) => (
                                        <button
                                            key={step}
                                            onClick={() => gotoStep(step)}
                                            disabled={!canGoToStep(step)}
                                            className={`px-1 py-1.5 rounded border text-[9px] font-black uppercase tracking-wide transition-all ${
                                                isTextWidget && step === 2
                                                    ? 'bg-slate-100 text-slate-300 border-slate-200'
                                                    : guidedStep === step
                                                    ? 'bg-blue-50 text-blue-700 border-blue-200 ring-1 ring-blue-100'
                                                    : step <= suggestedGuidedStep
                                                        ? 'bg-white text-slate-600 border-slate-200'
                                                        : 'bg-slate-100 text-slate-400 border-slate-200'
                                            } disabled:opacity-50`}
                                        >
                                            {stepLabels[step]}
                                        </button>
                                    ))}
                                </div>
                                </div>
                                <div className="mt-1 mb-2 px-4 space-y-1">
                                    <p className="text-[10px] text-slate-500 leading-relaxed">
                                        {stepHelpText[guidedStep]}
                                    </p>
                                </div>
                            </div>
                            <div className="px-4 py-2 border-b border-amber-200 bg-amber-50">
                                <p className="text-[10px] text-amber-800">
                                    {modeInfoText}
                                </p>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
                            {effectiveSidebarTab === 'query' ? (
                                <div className="space-y-4">
                                    {guidedStep === 1 && (
                                        <div className="space-y-4">
                                            <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setStartAction('new');
                                                        setEntryMode('new');
                                                    }}
                                                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${startAction === 'new' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                                >
                                                    {t('querybuilder.start_new', 'Neu')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setStartAction('open');
                                                        setEntryMode('existing');
                                                    }}
                                                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${startAction === 'open' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                                >
                                                    {t('querybuilder.start_open', 'Oeffnen')}
                                                </button>
                                            </div>
                                            {startAction === 'new' ? (
                                                <div className="space-y-2 animate-in fade-in duration-300">
                                                    <button
                                                        onClick={() => {
                                                            setEntryMode('new');
                                                            setStartAction('new');
                                                            setActiveWidgetId(null);
                                                            setWidgetName('');
                                                            setSelectedSqlStatementId('');
                                                            setResults([]);
                                                            setError('');
                                                            setVisType('table');
                                                            gotoStep(2);
                                                        }}
                                                        className={`w-full p-3 rounded-lg border flex items-center gap-2 transition-all ${
                                                            !isTextWidget && entryMode === 'new' && !activeWidgetId
                                                                ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-100 text-blue-700'
                                                                : 'bg-white border-slate-200 text-slate-700 hover:border-blue-200'
                                                        }`}
                                                    >
                                                        <Edit3 className="w-4 h-4 flex-shrink-0" />
                                                        <div className="flex-1 min-w-0 text-left">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="text-sm font-bold truncate">{t('querybuilder.new_query_card_title')}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-[10px]">
                                                                <span className="text-slate-400 truncate max-w-[180px] font-mono">{t('querybuilder.new_query_card_subtitle')}</span>
                                                                <span className="ml-auto text-blue-400 flex items-center gap-1 font-bold italic">
                                                                    {t('querybuilder.new_query_card_type')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setEntryMode('new');
                                                            setStartAction('new');
                                                            setActiveWidgetId(null);
                                                            setWidgetName('');
                                                            setSelectedSqlStatementId('');
                                                            setResults([]);
                                                            setError('');
                                                            setVisType('text');
                                                            setVisConfig(prev => ({ ...prev, type: 'text', textContent: prev.textContent || '' }));
                                                            gotoStep(3);
                                                        }}
                                                        className={`w-full p-3 rounded-lg border flex items-center gap-2 transition-all ${
                                                            isTextWidget && entryMode === 'new' && !activeWidgetId
                                                                ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-100 text-blue-700'
                                                                : 'bg-white border-slate-200 text-slate-700 hover:border-blue-200'
                                                        }`}
                                                    >
                                                        <Edit3 className="w-4 h-4 flex-shrink-0" />
                                                        <div className="flex-1 min-w-0 text-left">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="text-sm font-bold truncate">{t('querybuilder.new_text_card_title')}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-[10px]">
                                                                <span className="text-slate-400 truncate max-w-[180px] font-mono">{t('querybuilder.new_text_card_subtitle')}</span>
                                                                <span className="ml-auto text-blue-400 flex items-center gap-1 font-bold italic">
                                                                    {t('querybuilder.new_text_card_type')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="space-y-2 animate-in fade-in duration-300">
                                                    <h3 className="text-[10px] font-black uppercase text-slate-400 px-2 py-1 flex items-center justify-between">
                                                        {t('querybuilder.saved_reports')}
                                                        <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[9px]">
                                                            {filteredSavedWidgets.length}/{savedWidgets?.length || 0}
                                                        </span>
                                                    </h3>
                                                    <div className="relative">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                                        <input
                                                            value={widgetSearchTerm}
                                                            onChange={(e) => setWidgetSearchTerm(e.target.value)}
                                                            placeholder={t('querybuilder.search_saved_reports', 'Search saved widgets...')}
                                                            className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                                        />
                                                    </div>
                                                    <div className="space-y-1 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                                                        {filteredSavedWidgets.map(w => (
                                                            <div key={w.id} className={`group p-2.5 rounded-lg border flex flex-col gap-1 transition-all cursor-pointer ${activeWidgetId === w.id ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-100' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-200'}`} onClick={() => loadWidget(w)}>
                                                                <div className="flex items-center justify-between">
                                                                    <span className="font-bold text-slate-700 dark:text-slate-200 text-xs truncate">{w.name}</span>
                                                                    {!isReadOnly && (
                                                                        <button onClick={(e) => { e.stopPropagation(); deleteWidget(w.id); }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2 text-[9px]">
                                                                    <span className="text-slate-400 truncate max-w-[150px] font-mono">{w.sql_query || '-'}</span>
                                                                    <span className="ml-auto text-blue-400 flex items-center gap-1 font-bold italic">
                                                                        {(() => {
                                                                            try {
                                                                                const parsed = JSON.parse(w.visualization_config) as { type?: string };
                                                                                return (parsed.type || 'table').toUpperCase();
                                                                            } catch {
                                                                                return 'TABLE';
                                                                            }
                                                                        })()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {filteredSavedWidgets.length === 0 && (
                                                            <div className="p-3 rounded-lg border border-dashed border-slate-200 text-[11px] text-slate-400 text-center">
                                                                {t('querybuilder.no_saved_reports_filtered', 'No matching widgets found.')}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {guidedStep === 1 ? null : showFinalizePanel ? (
                                        <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/60 space-y-3">
                                            <p className="text-[10px] font-black uppercase tracking-wide text-blue-500">
                                                {t('querybuilder.step_finalize')}
                                            </p>
                                            <p className="text-xs text-slate-700 font-semibold">
                                                {widgetName || t('querybuilder.new_report')}
                                            </p>
                                            <div className="space-y-2 text-[11px]">
                                                <div className="rounded-lg border border-blue-100 bg-white px-3 py-2">
                                                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{t('querybuilder.finalize_mode')}</div>
                                                    <div className="mt-1 text-slate-700">{modeInfoText}</div>
                                                </div>
                                                <div className="rounded-lg border border-blue-100 bg-white px-3 py-2">
                                                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{t('querybuilder.finalize_source')}</div>
                                                    <div className="mt-1 text-slate-700">
                                                        {isTextWidget
                                                            ? t('querybuilder.new_text_card_type')
                                                            : t('querybuilder.sql_manager_source', 'SQL Manager Source')}
                                                    </div>
                                                </div>
                                                <div className="rounded-lg border border-blue-100 bg-white px-3 py-2">
                                                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{t('querybuilder.finalize_chart')}</div>
                                                    <div className="mt-1 text-slate-700 font-semibold">{previewTypeMeta.label}</div>
                                                    {!isTextWidget && (
                                                        <div className="mt-1 text-[10px] text-slate-500">
                                                            {t('querybuilder.finalize_axes', {
                                                                x: visConfig.xAxis || '-',
                                                                count: (visConfig.yAxes || []).length
                                                            })}
                                                        </div>
                                                    )}
                                                    {isTextWidget && (
                                                        <div className="mt-1 text-[10px] text-slate-500">
                                                            {t('querybuilder.finalize_text_length', { count: (visConfig.textContent || '').trim().length })}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="rounded-lg border border-blue-100 bg-white px-3 py-2">
                                                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{t('querybuilder.preview', { count: results.length })}</div>
                                                    <div className={`mt-1 text-[11px] font-semibold ${previewVisualizationInvalid ? 'text-amber-700' : 'text-emerald-700'}`}>
                                                        {previewVisualizationInvalid ? t('querybuilder.preview_not_renderable_title') : t('querybuilder.finalize_ready')}
                                                    </div>
                                                </div>
                                            </div>
                                            {!isReadOnly && (
                                                <button
                                                    onClick={() => setSaveModalOpen(true)}
                                                    disabled={saveDisabled}
                                                    className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold shadow-sm disabled:opacity-50"
                                                >
                                                    {activeWidgetId ? t('querybuilder.update_widget') : t('querybuilder.save_as_widget')}
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-0">
                                            <div className="mb-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                                        {t('querybuilder.sql_manager_source', 'SQL Manager Source')}
                                                    </h4>
                                                    <button
                                                        type="button"
                                                        onClick={() => { void refreshSqlStatements(); }}
                                                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                                                    >
                                                        {t('common.refresh', 'Refresh')}
                                                    </button>
                                                </div>
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                                    <input
                                                        value={sqlStatementSearchTerm}
                                                        onChange={(e) => setSqlStatementSearchTerm(e.target.value)}
                                                        placeholder={t('querybuilder.search_sql_statements', 'Search SQL statements...')}
                                                        className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div className="max-h-36 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                                                    {filteredSqlStatements.map((stmt) => (
                                                        <button
                                                            key={stmt.id}
                                                            type="button"
                                                            onClick={() => applySqlStatementSource(stmt)}
                                                            className={`w-full text-left p-2 rounded-lg border transition-all ${
                                                                selectedSqlStatementId === stmt.id
                                                                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700'
                                                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-700'
                                                            }`}
                                                        >
                                                            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{stmt.name}</div>
                                                            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate">{stmt.sql_text}</div>
                                                        </button>
                                                    ))}
                                                    {filteredSqlStatements.length === 0 && (
                                                        <div className="p-2 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 text-[11px] text-slate-400 text-center">
                                                            {t('querybuilder.no_sql_statements', 'No SQL statements found.')}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="overflow-hidden rounded-t-xl border border-b-0 border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 flex">
                                                <div className="flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase bg-slate-900 dark:bg-slate-800 text-slate-100">
                                                    <span className="font-mono text-[10px]">SQL</span> {t('querybuilder.direct_editor')}
                                                </div>
                                            </div>
                                            <div className="p-4 rounded-b-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/30 space-y-2 -mt-px">
                                                <>
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-[10px] font-black uppercase text-slate-400">{t('querybuilder.sql_query')}</label>
                                                        {!isTextWidget && (
                                                            <span className="text-[10px] text-slate-500">
                                                                {t('querybuilder.widget_studio_sql_source_hint', 'SQL waehlen im SQL-Manager oben')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <textarea
                                                        value={sql}
                                                        readOnly
                                                        className="w-full font-mono text-xs p-3 bg-slate-900 text-slate-100 rounded-lg outline-none resize-none cursor-default"
                                                        style={{ height: `${Math.max(220, Math.min(700, sqlEditorHeight))}px` }}
                                                        placeholder="SELECT * FROM..."
                                                    />
                                                </>
                                            </div>
                                        </div>
                                    )}
                                    {error && <div className="bg-red-50 text-red-600 text-[10px] p-3 rounded-lg border border-red-100 flex items-start gap-2 font-mono break-all"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{error}</div>}
                                </div>
                            ) : (
                                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/30 space-y-4 animate-in slide-in-from-right-4 duration-300">
                                    <h3 className="text-xs font-black uppercase text-slate-400 flex items-center gap-2"><Layout className="w-3.5 h-3.5 text-blue-500" />{t('querybuilder.graph_type')}</h3>
                                    <div className="grid grid-cols-3 gap-2">
                                            {(isTextWidget
                                                ? [
                                                    { id: 'text', icon: Edit3, label: t('querybuilder.text') }
                                                ]
                                                : [
                                                    { id: 'table', icon: TableIcon, label: t('querybuilder.table') },
                                                    { id: 'bar', icon: BarChart2, label: t('querybuilder.bar') },
                                                    { id: 'line', icon: TrendingUp, label: t('querybuilder.line') },
                                                    { id: 'area', icon: Layout, label: t('querybuilder.area') },
                                                    { id: 'pie', icon: Layout, label: t('querybuilder.pie') },
                                                    { id: 'kpi', icon: Layout, label: t('querybuilder.kpi') },
                                                    { id: 'composed', icon: Layout, label: t('querybuilder.composed') },
                                                    { id: 'radar', icon: Layout, label: t('querybuilder.radar') },
                                                    { id: 'scatter', icon: Layout, label: t('querybuilder.scatter') },
                                                    { id: 'pivot', icon: Layout, label: t('querybuilder.pivot') }
                                                ]).map(type => (
                                            <button key={type.id} onClick={() => setVisType(type.id as VisualizationType)} className={`p-2 rounded-lg flex flex-col items-center justify-center gap-1 border transition-all ${visType === type.id ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 text-blue-600 shadow-sm' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300'}`}>
                                                <type.icon className="w-4 h-4" />
                                                <span className="text-[9px] uppercase font-black">{type.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                    {(visType !== 'table' && visType !== 'pivot' && visType !== 'text') && (
                                        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('querybuilder.labels')}:</span>
                                            <button onClick={() => setVisConfig({ ...visConfig, showLabels: !visConfig.showLabels })} className={`px-2 py-0.5 rounded text-[10px] font-black uppercase transition-all ${visConfig.showLabels ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                                                {visConfig.showLabels ? t('querybuilder.label_on') : t('querybuilder.label_off')}
                                            </button>
                                        </div>
                                    )}

                                    {(visType !== 'table' && visType !== 'pivot' && results.length > 0) && (
                                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2 duration-300">
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.x_axis')}</label>
                                                <select value={visConfig.xAxis || ''} onChange={e => setVisConfig({ ...visConfig, xAxis: e.target.value })} className="w-full p-2 border border-slate-200 rounded text-[11px] bg-white outline-none">
                                                    <option value="">{t('querybuilder.select_column')}</option>
                                                    {(visType === 'scatter' ? numericColumns : resultColumns).map(col => <option key={col} value={col}>{col}</option>)}
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
                                                    {(visType === 'scatter' ? numericColumns : resultColumns).filter(c => !(visConfig.yAxes || []).includes(c)).map(col => <option key={col} value={col}>{col}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    {visType === 'text' && (
                                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2 duration-300">
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.text_content')}</label>
                                                <textarea
                                                    value={visConfig.textContent || ''}
                                                    onChange={e => setVisConfig({ ...visConfig, textContent: e.target.value })}
                                                    className="w-full h-32 p-2 border border-slate-200 rounded text-[11px] bg-white outline-none resize-y"
                                                    placeholder={t('querybuilder.text_placeholder')}
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.text_size')}</label>
                                                    <select
                                                        value={visConfig.textSize || 'md'}
                                                        onChange={e => setVisConfig({ ...visConfig, textSize: e.target.value as NonNullable<WidgetConfig['textSize']> })}
                                                        className="w-full p-2 border border-slate-200 rounded text-[11px] bg-white outline-none"
                                                    >
                                                        <option value="sm">{t('querybuilder.text_size_sm')}</option>
                                                        <option value="md">{t('querybuilder.text_size_md')}</option>
                                                        <option value="lg">{t('querybuilder.text_size_lg')}</option>
                                                        <option value="xl">{t('querybuilder.text_size_xl')}</option>
                                                        <option value="2xl">{t('querybuilder.text_size_2xl')}</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.text_align')}</label>
                                                    <select
                                                        value={visConfig.textAlign || 'left'}
                                                        onChange={e => setVisConfig({ ...visConfig, textAlign: e.target.value as NonNullable<WidgetConfig['textAlign']> })}
                                                        className="w-full p-2 border border-slate-200 rounded text-[11px] bg-white outline-none"
                                                    >
                                                        <option value="left">{t('querybuilder.text_align_left')}</option>
                                                        <option value="center">{t('querybuilder.text_align_center')}</option>
                                                        <option value="right">{t('querybuilder.text_align_right')}</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.text_style')}</label>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setVisConfig({ ...visConfig, textBold: !visConfig.textBold })}
                                                        className={`px-2 py-1 rounded border text-[11px] font-bold ${visConfig.textBold ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}
                                                    >
                                                        {t('querybuilder.text_bold')}
                                                    </button>
                                                    <button
                                                        onClick={() => setVisConfig({ ...visConfig, textItalic: !visConfig.textItalic })}
                                                        className={`px-2 py-1 rounded border text-[11px] italic ${visConfig.textItalic ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}
                                                    >
                                                        {t('querybuilder.text_italic')}
                                                    </button>
                                                    <button
                                                        onClick={() => setVisConfig({ ...visConfig, textUnderline: !visConfig.textUnderline })}
                                                        className={`px-2 py-1 rounded border text-[11px] underline ${visConfig.textUnderline ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}
                                                    >
                                                        {t('querybuilder.text_underline')}
                                                    </button>
                                                </div>
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
                        {showGuidedFooter && (
                            <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-[0_-6px_18px_-14px_rgba(15,23,42,0.5)]">
                                <div className="flex items-center justify-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                const previousStep = (isTextWidget && guidedStep === 3)
                                                    ? 1
                                                    : Math.max(1, guidedStep - 1);
                                                gotoStep(previousStep as GuidedStep);
                                            }}
                                            disabled={guidedStep <= 1}
                                            className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-500 disabled:opacity-40"
                                        >
                                            {t('querybuilder.back')}
                                        </button>
                                        {guidedApplyVisible && (
                                            <button
                                                onClick={() => { void handleGuidedApply(); }}
                                                disabled={guidedApplyDisabled}
                                                className="px-4 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold disabled:opacity-40"
                                            >
                                                {guidedApplyLabel}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { void handleGuidedNext(); }}
                                            disabled={guidedNextDisabled}
                                            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold shadow-sm disabled:opacity-40"
                                        >
                                            {guidedPrimaryLabel}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    </div>

                    {/* Preview Area */}
                    <div id="query-visualization" className="flex-1 min-w-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full min-h-[320px] sm:min-h-[380px] lg:min-h-[460px] relative">
                        <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t('querybuilder.preview', { count: results.length })}</h3>
                            <button onClick={() => setIsMaximized(!isMaximized)} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-slate-400 transition-all flex items-center gap-1.5 shadow-sm bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                                {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                                <span className="text-[9px] font-black uppercase tracking-widest">{isMaximized ? t('querybuilder.centered') : t('querybuilder.focus')}</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-4 min-h-0 container-scrollbar">
                            {!isTextWidget && results.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                    <Play className="w-12 h-12 mb-4 opacity-10" />
                                    <p className="text-xs font-black uppercase tracking-widest text-center whitespace-pre-wrap">{t('querybuilder.no_data_prompt')}</p>
                                </div>
                            ) : (
                                <div key={`${previewVisType}-${previewRenderVersion}`} className="h-full min-h-[260px] w-full flex flex-col">
                                    {previewVisType === 'text' ? (
                                        <div
                                            className={`flex-1 p-6 whitespace-pre-wrap break-words text-slate-800 dark:text-slate-100 ${
                                                textSizeClass[visConfig.textSize || 'md']
                                            } ${visConfig.textBold ? 'font-bold' : 'font-normal'} ${visConfig.textItalic ? 'italic' : 'not-italic'} ${visConfig.textUnderline ? 'underline' : 'no-underline'} ${
                                                visConfig.textAlign === 'center' ? 'text-center' : visConfig.textAlign === 'right' ? 'text-right' : 'text-left'
                                            }`}
                                        >
                                            {(visConfig.textContent || '').trim() || t('querybuilder.text_placeholder')}
                                        </div>
                                    ) : previewVisType === 'table' ? (
                                        <DataTable columns={columns} data={results} onRowClick={item => { setSelectedItemIndex(results.indexOf(item)); setDetailModalOpen(true); }} />
                                    ) : previewVisType === 'pivot' ? (
                                        <PivotTable data={results} rows={visConfig.pivotRows || []} cols={visConfig.pivotCols || []} measures={visConfig.pivotMeasures || []} />
                                    ) : previewVisualizationInvalid ? (
                                        <div className="flex-1 flex items-center justify-center p-6">
                                            <div className="max-w-md w-full rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-4">
                                                <div className="flex items-start gap-3">
                                                    <div className="mt-0.5 text-amber-600">{previewTypeMeta.icon}</div>
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-black uppercase tracking-wide text-amber-700">
                                                            {previewTypeMeta.label}
                                                        </div>
                                                        <p className="text-sm font-bold mt-1">{t('querybuilder.preview_not_renderable_title')}</p>
                                                        <p className="text-xs text-amber-800/90 mt-1">{t('querybuilder.preview_not_renderable_hint')}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : previewVisType === 'kpi' ? (() => {
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
                                        <div className="flex-1 min-h-[280px] min-w-0">
                                        <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={280}>
                                            {previewVisType === 'bar' ? (
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
                                            ) : previewVisType === 'line' ? (
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
                                            ) : previewVisType === 'area' ? (
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
                                            ) : previewVisType === 'pie' ? (
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
                                            ) : previewVisType === 'composed' ? (
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
                                            ) : previewVisType === 'radar' ? (
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
                                            ) : previewVisType === 'scatter' ? (
                                                <ScatterChart>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis type="number" dataKey={visConfig.xAxis} name={visConfig.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
                                                    <YAxis type="number" dataKey={(visConfig.yAxes || [])[0]} name={(visConfig.yAxes || [])[0]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
                                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                    <Scatter name={widgetName || 'Scatter'} data={scatterData} fill={visConfig.color || COLORS[0]} />
                                                </ScatterChart>
                                            ) : null}
                                        </ResponsiveContainer>
                                        </div>
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
                tableName={undefined}
                schema={activeSchema || undefined}
            />
        </PageLayout>
    );
};


