import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import CodeMirror from '@uiw/react-codemirror';
import { sql as sqlLang } from '@codemirror/lang-sql';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { PageLayout } from '../components/ui/PageLayout';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import {
    Play, BarChart2, Table as TableIcon, TrendingUp, AlertCircle,
    Layout, Maximize2, Minimize2, Folder, Trash2, Gauge, Image as ImageIcon,
    Edit3, X, Download, Search, FileCode2
} from 'lucide-react';
import { useReportExport } from '../../hooks/useReportExport';
import { DataTable } from '../../components/ui/DataTable';
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
import { MarkdownContent } from '../components/ui/MarkdownContent';

type VisualizationType = 'table' | 'bar' | 'line' | 'area' | 'pie' | 'kpi' | 'composed' | 'radar' | 'scatter' | 'pivot' | 'text' | 'markdown' | 'status' | 'section' | 'kpi_manual' | 'image';
type GuidedStep = 1 | 2 | 3 | 4;
const DEFAULT_SQL = '';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
const logger = createLogger('QueryBuilderView');
const CONTENT_VIS_TYPES = new Set<VisualizationType>(['text', 'markdown', 'status', 'section', 'kpi_manual', 'image']);
const QUERY_VIS_OPTIONS: Array<{ id: VisualizationType; icon: React.ComponentType<{ className?: string }>; labelKey: string; fallback: string }> = [
    { id: 'table', icon: TableIcon, labelKey: 'querybuilder.table', fallback: 'Table' },
    { id: 'bar', icon: BarChart2, labelKey: 'querybuilder.bar', fallback: 'Bar' },
    { id: 'line', icon: TrendingUp, labelKey: 'querybuilder.line', fallback: 'Line' },
    { id: 'area', icon: Layout, labelKey: 'querybuilder.area', fallback: 'Area' },
    { id: 'pie', icon: Layout, labelKey: 'querybuilder.pie', fallback: 'Pie' },
    { id: 'kpi', icon: Layout, labelKey: 'querybuilder.kpi', fallback: 'KPI' },
    { id: 'composed', icon: Layout, labelKey: 'querybuilder.composed', fallback: 'Composed' },
    { id: 'radar', icon: Layout, labelKey: 'querybuilder.radar', fallback: 'Radar' },
    { id: 'scatter', icon: Layout, labelKey: 'querybuilder.scatter', fallback: 'Scatter' },
    { id: 'pivot', icon: Layout, labelKey: 'querybuilder.pivot', fallback: 'Pivot' }
];
const CONTENT_VIS_OPTIONS: Array<{ id: VisualizationType; icon: React.ComponentType<{ className?: string }>; labelKey: string; fallback: string }> = [
    { id: 'text', icon: Edit3, labelKey: 'querybuilder.text', fallback: 'Text' },
    { id: 'markdown', icon: FileCode2, labelKey: 'querybuilder.markdown', fallback: 'Markdown' },
    { id: 'status', icon: AlertCircle, labelKey: 'querybuilder.status', fallback: 'Status' },
    { id: 'section', icon: Layout, labelKey: 'querybuilder.section', fallback: 'Section' },
    { id: 'kpi_manual', icon: Gauge, labelKey: 'querybuilder.kpi_manual', fallback: 'KPI Manual' },
    { id: 'image', icon: ImageIcon, labelKey: 'querybuilder.image', fallback: 'Image' }
];

interface SavedWidget {
    id: string;
    name: string;
    description?: string | null;
    sql_statement_id?: string | null;
    sql_query: string;
    visualization_config: string;
    visual_builder_config?: string | null;
}

const normalizeSqlText = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
const SQL_PREVIEW_HEIGHT_PX = 384;

export const QueryBuilderView: React.FC = () => {
    const { t } = useTranslation();
    const [sql, setSql] = useState(DEFAULT_SQL);
    const [results, setResults] = useState<DbRow[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [lastRunSql, setLastRunSql] = useState('');
    const [previewRenderVersion, setPreviewRenderVersion] = useState(0);
    const [previewTab, setPreviewTab] = useState<'graphic' | 'table' | 'sql'>('graphic');
    const [savedSnapshot, setSavedSnapshot] = useState('');

    // Mode State
    const [builderMode, setBuilderMode] = useState<'sql' | 'visual'>('sql');
    const [sidebarTab, setSidebarTab] = useState<'source' | 'visual' | 'widget'>('source');
    const [sourceSelectTab, setSourceSelectTab] = useState<'none' | 'query' | 'widget'>('none');
    const [isMaximized, setIsMaximized] = useState(false);
    const [guidedStep, setGuidedStep] = useState<GuidedStep>(1);
    const [queryConfig, setQueryConfig] = useLocalStorage<QueryConfig | undefined>('query_builder_config', undefined);

    // Visualization State
    const [visType, setVisType] = useState<VisualizationType>('table');
    const [visConfig, setVisConfig] = useState<WidgetConfig>({ type: 'table', color: '#3b82f6' });

    // Active Widget State
    const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);

    // Save Widget State
    const [widgetName, setWidgetName] = useState('');
    const [widgetSearchTerm, setWidgetSearchTerm] = useState('');
    const [sqlStatementSearchTerm, setSqlStatementSearchTerm] = useState('');
    const [selectedSqlStatementId, setSelectedSqlStatementId] = useState<string>('');
    const [imagePreviewFailed, setImagePreviewFailed] = useState(false);

    // Detail View State
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [selectedItemIndex, setSelectedItemIndex] = useState(0);
    const [activeSchema, setActiveSchema] = useState<SchemaDefinition | null>(null);
    const [sqlEditorSyntaxHighlight] = useLocalStorage<boolean>('sql_editor_syntax_highlighting', true);
    const [sqlEditorLineWrap] = useLocalStorage<boolean>('sql_editor_line_wrap', true);
    const [sqlEditorLineNumbers] = useLocalStorage<boolean>('sql_editor_line_numbers', false);
    const [sqlEditorFontSize] = useLocalStorage<number>('sql_editor_font_size', 14);
    const [sqlEditorTabSize] = useLocalStorage<number>('sql_editor_tab_size', 4);
    const [sqlEditorThemeIntensity] = useLocalStorage<'subtle' | 'normal' | 'high'>('sql_editor_theme_intensity', 'normal');
    const [sqlEditorPreviewHighlight] = useLocalStorage<boolean>('sql_editor_preview_highlighting', true);
    const [isDarkSqlPreview, setIsDarkSqlPreview] = useState<boolean>(
        typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    );
    const { isExporting, exportToPdf } = useReportExport();
    const { togglePresentationMode, isReadOnly } = useDashboard();

    // Fetch saved widgets
    const { data: savedWidgets, refresh: refreshWidgets } = useAsync<SavedWidget[]>(
        async () => await SystemRepository.getUserWidgets() as unknown as SavedWidget[],
        []
    );
    const { data: sqlStatements } = useAsync<SqlStatementRecord[]>(
        async () => await SystemRepository.listSqlStatements('global'),
        []
    );

    // Widget Studio no longer builds SQL visually; schema metadata is optional.
    useEffect(() => {
        setActiveSchema(null);
    }, []);
    useEffect(() => {
        setImagePreviewFailed(false);
    }, [visConfig.imageUrl]);
    useEffect(() => {
        const root = document.documentElement;
        const syncTheme = () => setIsDarkSqlPreview(root.classList.contains('dark'));
        syncTheme();
        const observer = new MutationObserver(syncTheme);
        observer.observe(root, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    const sqlPreviewHighlightStyle = useMemo(() => {
        if (isDarkSqlPreview) {
            return HighlightStyle.define([
                { tag: tags.keyword, color: '#60a5fa', fontWeight: '700' },
                { tag: [tags.string, tags.special(tags.string)], color: '#fbbf24' },
                { tag: [tags.number, tags.float], color: '#34d399' },
                { tag: [tags.comment, tags.lineComment, tags.blockComment], color: '#94a3b8', fontStyle: 'italic' },
                { tag: [tags.propertyName, tags.attributeName], color: '#7dd3fc' },
                { tag: tags.operator, color: '#c084fc' }
            ]);
        }
        return HighlightStyle.define([
            { tag: tags.keyword, color: '#1d4ed8', fontWeight: '700' },
            { tag: [tags.string, tags.special(tags.string)], color: '#b45309' },
            { tag: [tags.number, tags.float], color: '#059669' },
            { tag: [tags.comment, tags.lineComment, tags.blockComment], color: '#64748b', fontStyle: 'italic' },
            { tag: [tags.propertyName, tags.attributeName], color: '#0284c7' },
            { tag: tags.operator, color: '#7c3aed' }
        ]);
    }, [isDarkSqlPreview]);

    const sqlPreviewTheme = useMemo(
        () => {
            const activeLineDark = sqlEditorThemeIntensity === 'subtle' ? 'rgba(96, 165, 250, 0.08)' : sqlEditorThemeIntensity === 'high' ? 'rgba(96, 165, 250, 0.18)' : 'rgba(96, 165, 250, 0.12)';
            const activeLineLight = sqlEditorThemeIntensity === 'subtle' ? 'rgba(59, 130, 246, 0.05)' : sqlEditorThemeIntensity === 'high' ? 'rgba(59, 130, 246, 0.14)' : 'rgba(59, 130, 246, 0.08)';
            return EditorView.theme({
                '&': {
                    height: '100%',
                    fontSize: `${Math.max(12, Math.min(15, sqlEditorFontSize))}px`,
                    borderRadius: '0.5rem'
                },
                '.cm-editor': {
                    backgroundColor: isDarkSqlPreview ? '#0b1220' : '#f8fafc',
                    color: isDarkSqlPreview ? '#e2e8f0' : '#0f172a'
                },
                '.cm-scroller': {
                    overflow: 'auto',
                    backgroundColor: isDarkSqlPreview ? '#0b1220' : '#f8fafc',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                },
                '.cm-content': {
                    padding: '0.75rem'
                },
                '.cm-activeLine': {
                    backgroundColor: isDarkSqlPreview ? activeLineDark : activeLineLight
                },
                '.cm-focused': {
                    outline: 'none'
                },
                '.cm-gutters': {
                    backgroundColor: 'transparent',
                    border: 'none'
                },
                '.cm-cursor, .cm-dropCursor': {
                    borderLeftColor: 'transparent'
                }
            }, { dark: isDarkSqlPreview });
        },
        [isDarkSqlPreview, sqlEditorFontSize, sqlEditorThemeIntensity]
    );

    const sqlPreviewExtensions = useMemo(() => {
        const exts = [sqlLang(), sqlPreviewTheme, EditorState.tabSize.of(Math.max(2, Math.min(4, sqlEditorTabSize)))];
        if (sqlEditorPreviewHighlight && sqlEditorSyntaxHighlight) {
            exts.push(syntaxHighlighting(sqlPreviewHighlightStyle));
        }
        if (sqlEditorLineWrap) {
            exts.push(EditorView.lineWrapping);
        }
        return exts;
    }, [sqlEditorLineWrap, sqlEditorPreviewHighlight, sqlEditorSyntaxHighlight, sqlEditorTabSize, sqlPreviewHighlightStyle, sqlPreviewTheme]);

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

    const loadWidget = (widget: SavedWidget, navigate = true) => {
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
        setPreviewTab('graphic');
        setQueryConfig(undefined);
        setBuilderMode('sql');
        setVisType('table');
        setVisConfig({ type: 'table', color: '#3b82f6' });

        try {
            const visualConfig = JSON.parse(widget.visualization_config) as WidgetConfig;
            const legacyType = visualConfig.type === 'kpu_manual' ? 'kpi_manual' : visualConfig.type;
            parsedVisConfig = {
                ...visualConfig,
                type: (legacyType || 'table') as WidgetConfig['type'],
                kpiTitle: visualConfig.kpiTitle ?? visualConfig.kpuTitle ?? '',
                kpiValue: visualConfig.kpiValue ?? visualConfig.kpuValue ?? '',
                kpiUnit: visualConfig.kpiUnit ?? visualConfig.kpuUnit ?? '',
                kpiTarget: visualConfig.kpiTarget ?? visualConfig.kpuTarget ?? '',
                kpiTrend: visualConfig.kpiTrend ?? visualConfig.kpuTrend ?? 'flat',
                kpiAlign: visualConfig.kpiAlign ?? visualConfig.kpuAlign ?? 'left',
                kpiNote: visualConfig.kpiNote ?? visualConfig.kpuNote ?? ''
            };
            parsedVisType = (legacyType || 'table') as VisualizationType;
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

        if (navigate) {
            setSidebarTab('source');
        }
            if (parsedVisType === 'text' || parsedVisType === 'markdown' || parsedVisType === 'status' || parsedVisType === 'section' || parsedVisType === 'kpi_manual' || parsedVisType === 'image') {
                setSql('');
                setLastRunSql('');
                setBuilderMode('sql');
            setQueryConfig(undefined);
            if (navigate) {
                setGuidedStep(3);
                setSidebarTab('visual');
            }
        } else {
            setSql(widgetSql);
            setTimeout(() => handleRun(widgetSql), 100);
            if (navigate) {
                setGuidedStep(3);
                setSidebarTab('visual');
            }
        }
        setSavedSnapshot(buildSnapshot({
            currentSql: (parsedVisType === 'text' || parsedVisType === 'markdown' || parsedVisType === 'status' || parsedVisType === 'section' || parsedVisType === 'kpi_manual' || parsedVisType === 'image') ? '' : widgetSql,
            currentBuilderMode: parsedBuilderMode,
            currentQueryConfig: (parsedVisType === 'text' || parsedVisType === 'markdown' || parsedVisType === 'status' || parsedVisType === 'section' || parsedVisType === 'kpi_manual' || parsedVisType === 'image') ? undefined : parsedQueryConfig,
            currentVisType: parsedVisType,
            currentVisConfig: parsedVisConfig,
            currentWidgetName: widget.name,
            currentActiveWidgetId: widget.id
        }));
    };

    const handleSaveWidget = useCallback(async (mode: 'update' | 'new' = 'update') => {
        if (isReadOnly) return;
        const saveAsContentWidget = CONTENT_VIS_TYPES.has(visType);
        const shouldCreateNew = mode === 'new';
        let targetId = shouldCreateNew ? crypto.randomUUID() : (activeWidgetId || crypto.randomUUID());
        const existingTarget = (savedWidgets || []).find((w) => w.id === targetId);
        const prompted = await appDialog.prompt2(
            t('querybuilder.archive_name'),
            t('common.description', 'Description'),
            {
                title: activeWidgetId ? t('querybuilder.update_title') : t('querybuilder.save_title'),
                defaultValue: (widgetName || existingTarget?.name || '').trim(),
                secondDefaultValue: (existingTarget?.description || '').trim(),
                placeholder: t('querybuilder.archive_placeholder'),
                secondPlaceholder: t('querybuilder.widget_description_placeholder', 'Short context or note (optional)')
            }
        );
        if (!prompted) return;
        const trimmedName = prompted.value.trim();
        if (!trimmedName) return;
        const trimmedDescription = prompted.secondValue.trim();
        const normalizedName = trimmedName.toLowerCase();
        const conflictingWidget = (savedWidgets || []).find((w) =>
            w.id !== targetId && w.name.trim().toLowerCase() === normalizedName
        );
        if (conflictingWidget) {
            const overwrite = await appDialog.confirm(t('querybuilder.confirm_overwrite_widget_name', {
                name: trimmedName,
                defaultValue: `Ein Widget mit dem Namen "${trimmedName}" existiert bereits. Ueberschreiben?`
            }));
            if (!overwrite) return;
            targetId = conflictingWidget.id;
        }
        try {
            const linkedStatement = (sqlStatements || []).find(stmt => stmt.id === selectedSqlStatementId);
            const sqlText = saveAsContentWidget ? '' : sql.trim();
            const linkedStatementId =
                !saveAsContentWidget && linkedStatement && normalizeSqlText(linkedStatement.sql_text) === normalizeSqlText(sqlText)
                    ? linkedStatement.id
                    : null;
            const widget = {
                id: targetId,
                name: trimmedName,
                description: trimmedDescription,
                sql_statement_id: linkedStatementId,
                sql_query: sqlText,
                visualization_config: { ...visConfig, type: visType },
                visual_builder_config: null
            };

            await SystemRepository.saveUserWidget(widget);

            refreshWidgets();
            setActiveWidgetId(widget.id);
            setWidgetName(widget.name);
            setSavedSnapshot(buildSnapshot({
                currentSql: widget.sql_query,
                currentBuilderMode: builderMode,
                currentQueryConfig: undefined,
                currentVisType: visType,
                currentVisConfig: { ...visConfig, type: visType },
                currentWidgetName: widget.name,
                currentActiveWidgetId: widget.id
            }));
            setGuidedStep(1);
            setSidebarTab('source');
            setSourceSelectTab('widget');
            setPreviewTab('graphic');
        } catch (err: unknown) {
            await appDialog.error(t('querybuilder.error_save') + (err instanceof Error ? err.message : String(err)));
            return;
        }
        await appDialog.info(shouldCreateNew ? t('querybuilder.success_save') : t('querybuilder.success_update'));
    }, [
        activeWidgetId,
        builderMode,
        buildSnapshot,
        isReadOnly,
        refreshWidgets,
        savedWidgets,
        selectedSqlStatementId,
        sql,
        sqlStatements,
        t,
        visConfig,
        visType,
        widgetName
    ]);

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
    const getSavedWidgetVisType = useCallback((widget: SavedWidget): VisualizationType => {
        try {
            const parsed = JSON.parse(widget.visualization_config) as { type?: string };
            const raw = (parsed.type || 'table') as VisualizationType | 'kpu_manual';
            return raw === 'kpu_manual' ? 'kpi_manual' : raw;
        } catch {
            return 'table';
        }
    }, []);
    const filteredSavedWidgetsByType = useMemo(() => {
        const all = savedWidgets || [];
        const term = widgetSearchTerm.trim().toLowerCase();
        const searched = !term ? all : all.filter((widget) =>
            widget.name.toLowerCase().includes(term) ||
            (widget.sql_query || '').toLowerCase().includes(term)
        );
        const queryBased = searched.filter((widget) => !CONTENT_VIS_TYPES.has(getSavedWidgetVisType(widget)));
        const nonData = searched.filter((widget) => CONTENT_VIS_TYPES.has(getSavedWidgetVisType(widget)));
        return { queryBased, nonData };
    }, [savedWidgets, widgetSearchTerm, getSavedWidgetVisType]);
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
    const isMarkdownWidget = visType === 'markdown';
    const isStatusWidget = visType === 'status';
    const isSectionWidget = visType === 'section';
    const isKpiManualWidget = visType === 'kpi_manual';
    const isImageWidget = visType === 'image';
    const isContentWidget = isTextWidget || isMarkdownWidget || isStatusWidget || isSectionWidget || isKpiManualWidget || isImageWidget;
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
    const previewVisType: VisualizationType = (guidedStep === 2 && !isContentWidget) ? 'table' : visType;
    const hasQueryPreviewTabs = !isContentWidget && sql.trim().length > 0;
    const isGraphicCapableType = previewVisType !== 'table' && previewVisType !== 'pivot' && previewVisType !== 'text' && previewVisType !== 'markdown' && previewVisType !== 'status' && previewVisType !== 'section' && previewVisType !== 'kpi_manual' && previewVisType !== 'image';
    const canPersistWidget = isContentWidget || results.length > 0;
    const exportDisabled = isExporting || (!isContentWidget && results.length === 0);
    const saveDisabled = !canPersistWidget || isReadOnly || (!isContentWidget && !sqlMatchesSelectedStatement);
    const saveBlockedHint = isReadOnly
        ? t('common.read_only')
        : (!canPersistWidget
            ? t('querybuilder.hint_run_query_before_save')
            : (!isContentWidget && !sqlMatchesSelectedStatement
                ? t('querybuilder.hint_select_sql_statement_before_save', 'Bitte ein SQL-Statement aus dem SQL-Manager auswaehlen.')
                : ''));
    const exportDisabledReason = isExporting
        ? t('common.exporting')
        : (!isContentWidget && results.length === 0 ? t('querybuilder.hint_run_query_before_export') : '');
    const hasEntrySelection = true;
    const canProceedFromStart = sourceSelectTab === 'none'
        ? true
        : (sourceSelectTab === 'query' ? sqlMatchesSelectedStatement : Boolean(activeWidgetId));
    const hasSourceConfig = isContentWidget || sqlMatchesSelectedStatement;
    const hasRunOutput = isContentWidget || (results.length > 0 && !error && lastRunSql.trim() === sql.trim());
    const hasVisualizationConfig = useMemo(() => {
        if (!sqlMatchesSelectedStatement) {
            if (!isContentWidget) return false;
            if (isMarkdownWidget) return Boolean((visConfig.markdownContent || '').trim());
            if (isStatusWidget) return Boolean((visConfig.statusTitle || '').trim() || (visConfig.statusMessage || '').trim());
            if (isSectionWidget) return Boolean((visConfig.sectionTitle || '').trim() || (visConfig.sectionSubtitle || '').trim());
            if (isKpiManualWidget) return Boolean((visConfig.kpiTitle || '').trim() || (visConfig.kpiValue || '').trim());
            if (isImageWidget) return Boolean((visConfig.imageUrl || '').trim());
            return Boolean((visConfig.textContent || '').trim());
        }
        if (isTextWidget) {
            return Boolean((visConfig.textContent || '').trim());
        }
        if (isMarkdownWidget) {
            return Boolean((visConfig.markdownContent || '').trim());
        }
        if (isStatusWidget) {
            return Boolean((visConfig.statusTitle || '').trim() || (visConfig.statusMessage || '').trim());
        }
        if (isSectionWidget) {
            return Boolean((visConfig.sectionTitle || '').trim() || (visConfig.sectionSubtitle || '').trim());
        }
        if (isKpiManualWidget) {
            return Boolean((visConfig.kpiTitle || '').trim() || (visConfig.kpiValue || '').trim());
        }
        if (isImageWidget) {
            return Boolean((visConfig.imageUrl || '').trim());
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
    }, [isContentWidget, isImageWidget, isKpiManualWidget, isMarkdownWidget, isSectionWidget, isStatusWidget, isTextWidget, visType, visConfig, numericColumns, scatterData.length, scatterXKey, scatterYKey, results, sqlMatchesSelectedStatement]);
    const previewVisualizationInvalid = !isContentWidget
        && results.length > 0
        && previewVisType !== 'table'
        && previewVisType !== 'pivot'
        && !hasVisualizationConfig;
    const suggestedGuidedStep: GuidedStep = (() => {
        if (!hasEntrySelection) return 1;
        if (sourceSelectTab === 'none') {
            return isContentWidget && hasVisualizationConfig ? 4 : 3;
        }
        if (sourceSelectTab === 'query') {
            if (!sqlMatchesSelectedStatement) return 1;
            if (!hasRunOutput) return 2;
            return hasVisualizationConfig ? 4 : 3;
        }
        if (!activeWidgetId) return 1;
        if (isContentWidget) return hasVisualizationConfig ? 4 : 3;
        if (!hasRunOutput) return 2;
        return hasVisualizationConfig ? 4 : 3;
    })();
    const canGoToStep = (step: GuidedStep) => {
        if (isContentWidget && step === 2) return false;
        return step <= suggestedGuidedStep;
    };
    const guidedNextDisabled = loading || (
        guidedStep === 1
            ? !canProceedFromStart
            : guidedStep === 2
                ? (isContentWidget ? false : (!hasSourceConfig || !hasRunOutput))
                : guidedStep === 3
                    ? !hasVisualizationConfig
                    : saveDisabled
    );
    const guidedPrimaryLabel = guidedStep >= 4
        ? t('querybuilder.finish')
        : t('querybuilder.next');
    const guidedApplyVisible = guidedStep === 2 && !isContentWidget;
    const guidedApplyDisabled = loading || (
        guidedStep === 2
            ? (isContentWidget || !hasSourceConfig)
            : guidedStep === 3
                ? false
                : true
    );
    const guidedApplyLabel = loading
        ? t('common.loading')
        : t('querybuilder.step_run');
    const guidedBlockedHint = (() => {
        if (guidedStep === 1) {
            if (sourceSelectTab === 'query' && !sqlMatchesSelectedStatement) {
                return t('querybuilder.hint_select_sql_statement_for_widget', 'Bitte zuerst ein SQL-Statement im SQL-Manager auswaehlen.');
            }
            if (sourceSelectTab === 'widget' && !activeWidgetId) {
                return t('querybuilder.mode_open_select', 'Waehle ein bestehendes Widget aus der Liste.');
            }
            return '';
        }
        if (guidedStep === 2) {
            if (!sqlMatchesSelectedStatement) {
                return t('querybuilder.hint_select_sql_statement_for_widget', 'Bitte zuerst ein SQL-Statement im SQL-Manager auswaehlen.');
            }
            if (!hasRunOutput) {
                return t('querybuilder.hint_run_query_before_continue', 'Bitte die Abfrage zuerst ausfuehren.');
            }
            return '';
        }
        if (guidedStep === 3 && !hasVisualizationConfig) {
            return t('querybuilder.hint_configure_visualization_before_continue', 'Bitte Visualisierung konfigurieren, um fortzufahren.');
        }
        if (guidedStep === 4 && saveDisabled) {
            return saveBlockedHint;
        }
        return '';
    })();
    const effectiveSidebarTab: 'source' | 'visual' | 'widget' = sidebarTab;
    const showGuidedFooter = true;
    const canOpenVisualTab = suggestedGuidedStep >= 3;
    const canOpenWidgetTab = suggestedGuidedStep >= 4;
    const currentSnapshot = useMemo(
        () => buildSnapshot(),
        [buildSnapshot]
    );
    const hasUnsavedChanges = savedSnapshot.length > 0 && currentSnapshot !== savedSnapshot;
    const modeInfoText =
        activeWidgetId
            ? t('querybuilder.mode_widget_edit', 'Widget aendern')
            : (sourceSelectTab === 'none'
                ? t('querybuilder.mode_new_text_without_data', 'Neues Widget erstellen (Text - Ohne Daten)')
                : t('querybuilder.mode_new_query_widget', 'Neues Widget erstellen (Abfrage)'));
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
            case 'markdown':
                return { icon: <FileCode2 className={iconClass} />, label: t('querybuilder.markdown', 'Markdown') };
            case 'status':
                return { icon: <AlertCircle className={iconClass} />, label: t('querybuilder.status', 'Status') };
            case 'section':
                return { icon: <Layout className={iconClass} />, label: t('querybuilder.section', 'Section') };
            case 'kpi_manual':
                return { icon: <Gauge className={iconClass} />, label: t('querybuilder.kpi_manual', 'KPI Manual') };
            case 'image':
                return { icon: <ImageIcon className={iconClass} />, label: t('querybuilder.image', 'Image') };
            default:
                return { icon: <Layout className={iconClass} />, label: previewVisType.toUpperCase() };
        }
    }, [previewVisType, t]);
    const previewHeaderTitle = activeWidgetId
        ? (widgetName.trim() || t('querybuilder.new_report'))
        : t('querybuilder.preview_new_widget_title', 'Neues Widget ...');
    const previewTooltipContentStyle: React.CSSProperties = {
        borderRadius: '12px',
        border: isDarkSqlPreview ? '1px solid #334155' : '1px solid #e2e8f0',
        backgroundColor: isDarkSqlPreview ? '#0f172a' : '#ffffff',
        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.18)'
    };
    const previewTooltipLabelStyle: React.CSSProperties = {
        color: isDarkSqlPreview ? '#e2e8f0' : '#0f172a',
        fontWeight: 700,
        fontSize: '12px'
    };
    const previewTooltipItemStyle: React.CSSProperties = {
        color: isDarkSqlPreview ? '#cbd5e1' : '#334155',
        fontWeight: 600,
        fontSize: '12px'
    };
    const previewTooltipCursor = { fill: isDarkSqlPreview ? 'rgba(148, 163, 184, 0.14)' : '#f8fafc' };
    const previewWidgetDescription = (visConfig.widgetDescription || '').trim();
    const previewWidgetDescriptionPosition: 'top' | 'bottom' = visConfig.widgetDescriptionPosition === 'top' ? 'top' : 'bottom';

    const gotoStep = (step: GuidedStep) => {
        if (!canGoToStep(step)) return;
        setGuidedStep(step);
        if (step <= 2) setSidebarTab('source');
        if (step === 3) setSidebarTab('visual');
        if (step === 4) setSidebarTab('widget');
    };

    const handleGuidedNext = async () => {
        if (guidedStep === 1) {
            if (sourceSelectTab === 'none') {
                setVisType('table');
                setSelectedSqlStatementId('');
                setSql('');
                setLastRunSql('');
                setResults([]);
                setError('');
                setGuidedStep(3);
                setSidebarTab('visual');
                return;
            }
            if (sourceSelectTab === 'query') {
                if (!sqlMatchesSelectedStatement) return;
                setVisType('table');
                const executed = await handleRun();
                if (!executed) return;
                setGuidedStep(3);
                setSidebarTab('visual');
                return;
            }
            if (!activeWidgetId) return;
            if (isContentWidget) {
                setGuidedStep(3);
                setSidebarTab('visual');
                return;
            }
            const executed = await handleRun();
            if (!executed) return;
            setGuidedStep(3);
            setSidebarTab('visual');
            return;
        }
        if (guidedStep === 2) {
            if (isContentWidget) {
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
            await handleSaveWidget('update');
        }
    };

    const handleGuidedApply = async () => {
        if (guidedStep === 2) {
            if (isContentWidget || !hasSourceConfig || loading) return;
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
                    void handleSaveWidget('update');
                }
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [loading, saveDisabled, handleRun, handleSaveWidget]);

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
                            className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm font-medium text-sm disabled:opacity-50"
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
                            </div>
                            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                                <div className="grid grid-cols-3 gap-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSidebarTab('source');
                                            setGuidedStep(1);
                                        }}
                                        className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${effectiveSidebarTab === 'source'
                                            ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700'
                                            : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                        }`}
                                    >
                                        <Search className="w-3 h-3" />
                                        {t('querybuilder.tab_source', 'Quelle')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => canOpenVisualTab && setSidebarTab('visual')}
                                        disabled={!canOpenVisualTab}
                                        className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${effectiveSidebarTab === 'visual'
                                            ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700'
                                            : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                        } disabled:opacity-40`}
                                    >
                                        <BarChart2 className="w-3 h-3" />
                                        {t('querybuilder.tab_visualization', 'Visualisierung')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => canOpenWidgetTab && setSidebarTab('widget')}
                                        disabled={!canOpenWidgetTab}
                                        className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${effectiveSidebarTab === 'widget'
                                            ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700'
                                            : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                        } disabled:opacity-40`}
                                    >
                                        <Folder className="w-3 h-3" />
                                        {t('querybuilder.tab_widget', 'Widget')}
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
                            {effectiveSidebarTab === 'source' ? (
                                <div className="space-y-4">
                                    {guidedStep === 1 && (
                                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/30 overflow-hidden">
                                            <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
                                                <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSourceSelectTab('none');
                                                            setActiveWidgetId(null);
                                                            setWidgetName('');
                                                            setSelectedSqlStatementId('');
                                                            setSql('');
                                                            setLastRunSql('');
                                                            setResults([]);
                                                            setError('');
                                                            setVisType('table');
                                                        }}
                                                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${sourceSelectTab === 'none' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                                    >
                                                        {t('querybuilder.source_tab_none', 'Kein')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSourceSelectTab('query');
                                                            setActiveWidgetId(null);
                                                            setWidgetName('');
                                                            setSelectedSqlStatementId('');
                                                            setSql('');
                                                            setLastRunSql('');
                                                            setResults([]);
                                                            setError('');
                                                            setVisType('table');
                                                        }}
                                                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${sourceSelectTab === 'query' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                                    >
                                                        {t('querybuilder.source_tab_query', 'Abfrage auswaehlen')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSourceSelectTab('widget');
                                                        }}
                                                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${sourceSelectTab === 'widget' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                                    >
                                                        {t('querybuilder.source_tab_widget', 'Widget auswaehlen')}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="p-3">
                                                {sourceSelectTab === 'none' ? (
                                                    <div className="p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-300">
                                                        {t('querybuilder.source_tab_none_hint', 'Ohne Datenabfrage oder Widget mit Weiter zum naechsten Schritt gehen.')}
                                                    </div>
                                                ) : sourceSelectTab === 'query' ? (
                                                    <div className="space-y-2 animate-in fade-in duration-300">
                                                    <h3 className="text-[10px] font-black uppercase text-slate-400 px-2 py-1 flex items-center justify-between">
                                                        {t('querybuilder.sql_manager_source', 'SQL Manager Source')}
                                                        <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[9px]">
                                                            {filteredSqlStatements.length}/{sqlStatements?.length || 0}
                                                        </span>
                                                    </h3>
                                                    <div className="relative">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                                        <input
                                                            value={sqlStatementSearchTerm}
                                                            onChange={(e) => setSqlStatementSearchTerm(e.target.value)}
                                                            placeholder={t('querybuilder.search_sql_statements', 'Search SQL statements...')}
                                                            className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                                        />
                                                    </div>
                                                    <div className="space-y-1 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                                                        {filteredSqlStatements.map((stmt) => (
                                                            <button
                                                                key={stmt.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    if (selectedSqlStatementId === stmt.id) {
                                                                        setSelectedSqlStatementId('');
                                                                        setSql('');
                                                                        setLastRunSql('');
                                                                        setResults([]);
                                                                        setError('');
                                                                        setVisType('table');
                                                                        return;
                                                                    }
                                                                    setSourceSelectTab('query');
                                                                    setActiveWidgetId(null);
                                                                    setWidgetName('');
                                                                    applySqlStatementSource(stmt);
                                                                    setVisType('table');
                                                                    void handleRun(stmt.sql_text);
                                                                }}
                                                                className={`w-full text-left p-2.5 rounded-lg border transition-all ${
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
                                                            <div className="p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 text-[11px] text-slate-400 text-center">
                                                                {t('querybuilder.no_sql_statements', 'No SQL statements found.')}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] text-slate-500 px-1">
                                                        {t('querybuilder.new_without_query_hint', 'Ohne Auswahl und mit Klick auf Weiter wird ein neues Text-Widget ohne Datenabfrage erstellt.')}
                                                    </p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2 animate-in fade-in duration-300">
                                                    <h3 className="text-[10px] font-black uppercase text-slate-400 px-2 py-1 flex items-center justify-between">
                                                        {t('querybuilder.saved_reports')}
                                                        <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[9px]">
                                                            {(filteredSavedWidgetsByType.queryBased.length + filteredSavedWidgetsByType.nonData.length)}/{savedWidgets?.length || 0}
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
                                                        {filteredSavedWidgetsByType.queryBased.length > 0 && (
                                                            <div className="px-1 pt-1 pb-0.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
                                                                {t('querybuilder.saved_reports_query_based', 'Abfragebasierte Widgets')}
                                                            </div>
                                                        )}
                                                        {filteredSavedWidgetsByType.queryBased.map(w => (
                                                            <div
                                                                key={w.id}
                                                                className={`group p-2.5 rounded-lg border flex flex-col gap-1 transition-all cursor-pointer ${activeWidgetId === w.id ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-100 dark:bg-blue-900/20 dark:border-blue-700 dark:ring-blue-800/60' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-700'}`}
                                                                onClick={() => {
                                                                    if (activeWidgetId === w.id) {
                                                                        setActiveWidgetId(null);
                                                                        setWidgetName('');
                                                                        setSelectedSqlStatementId('');
                                                                        setSql('');
                                                                        setLastRunSql('');
                                                                        setResults([]);
                                                                        setError('');
                                                                        setVisType('table');
                                                                        setSidebarTab('source');
                                                                        setGuidedStep(1);
                                                                        return;
                                                                    }
                                                                    loadWidget(w, false);
                                                                }}
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <span className="font-bold text-slate-700 dark:text-slate-200 text-xs truncate">{w.name}</span>
                                                                    {!isReadOnly && (
                                                                        <button onClick={(e) => { e.stopPropagation(); deleteWidget(w.id); }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2 text-[9px]">
                                                                    <span className="text-slate-400 truncate max-w-[150px] font-mono">{w.sql_query || '-'}</span>
                                                                    <span className="ml-auto text-blue-400 flex items-center gap-1 font-bold italic">
                                                                        {getSavedWidgetVisType(w).toUpperCase()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {filteredSavedWidgetsByType.nonData.length > 0 && (
                                                            <div className="px-1 pt-2 pb-0.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
                                                                {t('querybuilder.saved_reports_non_data', 'Nicht-datenbasierte Widgets')}
                                                            </div>
                                                        )}
                                                        {filteredSavedWidgetsByType.nonData.map(w => (
                                                            <div
                                                                key={w.id}
                                                                className={`group p-2.5 rounded-lg border flex flex-col gap-1 transition-all cursor-pointer ${activeWidgetId === w.id ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-100 dark:bg-blue-900/20 dark:border-blue-700 dark:ring-blue-800/60' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-700'}`}
                                                                onClick={() => {
                                                                    if (activeWidgetId === w.id) {
                                                                        setActiveWidgetId(null);
                                                                        setWidgetName('');
                                                                        setSelectedSqlStatementId('');
                                                                        setSql('');
                                                                        setLastRunSql('');
                                                                        setResults([]);
                                                                        setError('');
                                                                        setVisType('table');
                                                                        setSidebarTab('source');
                                                                        setGuidedStep(1);
                                                                        return;
                                                                    }
                                                                    loadWidget(w, false);
                                                                }}
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <span className="font-bold text-slate-700 dark:text-slate-200 text-xs truncate">{w.name}</span>
                                                                    {!isReadOnly && (
                                                                        <button onClick={(e) => { e.stopPropagation(); deleteWidget(w.id); }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2 text-[9px]">
                                                                    <span className="text-slate-400 truncate max-w-[150px] font-mono">{w.sql_query || '-'}</span>
                                                                    <span className="ml-auto text-blue-400 flex items-center gap-1 font-bold italic">
                                                                        {getSavedWidgetVisType(w).toUpperCase()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {filteredSavedWidgetsByType.queryBased.length === 0 && filteredSavedWidgetsByType.nonData.length === 0 && (
                                                            <div className="p-3 rounded-lg border border-dashed border-slate-200 text-[11px] text-slate-400 text-center">
                                                                {t('querybuilder.no_saved_reports_filtered', 'No matching widgets found.')}
                                                            </div>
                                                        )}
                                                    </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {guidedStep === 1 ? null : (
                                        <div className="space-y-0">
                                            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/30 overflow-hidden">
                                                <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between">
                                                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                                                        <span className="font-mono">SQL</span> {t('querybuilder.direct_editor')}
                                                    </div>
                                                    <span className="text-[10px] text-slate-500">{t('common.read_only')}</span>
                                                </div>
                                                <div className="p-3 space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-[10px] font-black uppercase text-slate-400">{t('querybuilder.sql_query')}</label>
                                                        {!isContentWidget && (
                                                            <span className="text-[10px] text-slate-500">
                                                                {t('querybuilder.widget_studio_sql_locked_hint', 'SQL-Auswahl erfolgt im Startschritt unter Neu.')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <textarea
                                                        value={sql}
                                                        readOnly
                                                        className="w-full font-mono text-xs p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-100 rounded-lg outline-none resize-none cursor-default"
                                                        style={{ height: `${SQL_PREVIEW_HEIGHT_PX}px` }}
                                                        placeholder="SELECT * FROM..."
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {error && <div className="bg-red-50 text-red-600 text-[10px] p-3 rounded-lg border border-red-100 flex items-start gap-2 font-mono break-all"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{error}</div>}
                                </div>
                            ) : effectiveSidebarTab === 'visual' ? (
                                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/30 space-y-4 animate-in slide-in-from-right-4 duration-300">
                                    <h3 className="text-xs font-black uppercase text-slate-400 flex items-center gap-2"><Layout className="w-3.5 h-3.5 text-blue-500" />{t('querybuilder.graph_type')}</h3>
                                    <div className="grid grid-cols-3 gap-2">
                                            {(sqlMatchesSelectedStatement ? QUERY_VIS_OPTIONS : CONTENT_VIS_OPTIONS).map(type => (
                                            <button key={type.id} onClick={() => setVisType(type.id)} className={`p-2 rounded-lg flex flex-col items-center justify-center gap-1 border transition-all ${visType === type.id ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 text-blue-600 shadow-sm' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300'}`}>
                                                <type.icon className="w-4 h-4" />
                                                <span className="text-[9px] uppercase font-black">{t(type.labelKey, type.fallback)}</span>
                                            </button>
                                        ))}
                                    </div>
                                    {!sqlMatchesSelectedStatement && (
                                        <p className="text-[10px] text-slate-500">
                                            {t('querybuilder.visual_text_only_hint', 'Ohne ausgewaehlte Abfrage sind nur Text-, Markdown-, Status-, Section-, KPI-Manual- oder Image-Widgets verfuegbar.')}
                                        </p>
                                    )}
                                    {(visType !== 'table' && visType !== 'pivot' && visType !== 'text' && visType !== 'markdown' && visType !== 'status' && visType !== 'section' && visType !== 'kpi_manual' && visType !== 'image') && (
                                        <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-3 py-2">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('querybuilder.labels')}:</span>
                                            <button onClick={() => setVisConfig({ ...visConfig, showLabels: !visConfig.showLabels })} className={`px-2 py-0.5 rounded text-[10px] font-black uppercase transition-all ${visConfig.showLabels ? "bg-blue-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-200"}`}>
                                                {visConfig.showLabels ? t('querybuilder.label_on') : t('querybuilder.label_off')}
                                            </button>
                                        </div>
                                    )}

                                    {(isGraphicCapableType && results.length > 0) && (
                                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2 duration-300">
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.x_axis')}</label>
                                                <select value={visConfig.xAxis || ''} onChange={e => setVisConfig({ ...visConfig, xAxis: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none">
                                                    <option value="">{t('querybuilder.select_column')}</option>
                                                    {(visType === 'scatter' ? numericColumns : resultColumns).map(col => <option key={col} value={col}>{col}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.y_axes')}</label>
                                                <div className="flex flex-wrap gap-1 mb-2">
                                                    {(visConfig.yAxes || []).map(y => (
                                                        <span key={y} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 rounded text-[10px] font-bold flex items-center gap-1 border border-blue-200 dark:border-blue-700/60">
                                                            {y}
                                                            <button
                                                                onClick={() => setVisConfig({ ...visConfig, yAxes: (visConfig.yAxes || []).filter(axis => axis !== y) })}
                                                                className="text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100"
                                                            >
                                                                <X className="w-2.5 h-2.5" />
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                                <select onChange={e => { if (!e.target.value) return; setVisConfig({ ...visConfig, yAxes: [...(visConfig.yAxes || []), e.target.value] }); e.target.value = ''; }} className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none">
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
                                                    className="w-full h-32 p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none resize-y"
                                                    placeholder={t('querybuilder.text_placeholder')}
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.text_size')}</label>
                                                    <select
                                                        value={visConfig.textSize || 'md'}
                                                        onChange={e => setVisConfig({ ...visConfig, textSize: e.target.value as NonNullable<WidgetConfig['textSize']> })}
                                                        className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
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
                                                        className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
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
                                                        className={`px-2 py-1 rounded border text-[11px] font-bold ${visConfig.textBold ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-200' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}
                                                    >
                                                        {t('querybuilder.text_bold')}
                                                    </button>
                                                    <button
                                                        onClick={() => setVisConfig({ ...visConfig, textItalic: !visConfig.textItalic })}
                                                        className={`px-2 py-1 rounded border text-[11px] italic ${visConfig.textItalic ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-200' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}
                                                    >
                                                        {t('querybuilder.text_italic')}
                                                    </button>
                                                    <button
                                                        onClick={() => setVisConfig({ ...visConfig, textUnderline: !visConfig.textUnderline })}
                                                        className={`px-2 py-1 rounded border text-[11px] underline ${visConfig.textUnderline ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-200' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}
                                                    >
                                                        {t('querybuilder.text_underline')}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {visType === 'markdown' && (
                                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2 duration-300">
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.markdown_content', 'Markdown Inhalt')}</label>
                                                <textarea
                                                    value={visConfig.markdownContent || ''}
                                                    onChange={e => setVisConfig({ ...visConfig, markdownContent: e.target.value })}
                                                    className="w-full h-36 p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none resize-y font-mono"
                                                    placeholder={t('querybuilder.markdown_placeholder', '# Titel\nText mit **Fett** und [Link](https://example.com)')}
                                                />
                                                <p className="mt-1 text-[10px] text-slate-500">{t('querybuilder.markdown_help', 'Unterstuetzt u. a. Ueberschriften, Listen, **Fett**, *Kursiv*, `Code` und Links.')}</p>
                                            </div>
                                        </div>
                                    )}

                                    {visType === 'status' && (
                                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2 duration-300">
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.status_level', 'Status-Level')}</label>
                                                <select
                                                    value={visConfig.statusLevel || 'ok'}
                                                    onChange={e => setVisConfig({ ...visConfig, statusLevel: e.target.value as NonNullable<WidgetConfig['statusLevel']> })}
                                                    className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                                >
                                                    <option value="ok">{t('querybuilder.status_level_ok', 'OK')}</option>
                                                    <option value="info">{t('querybuilder.status_level_info', 'Info')}</option>
                                                    <option value="warning">{t('querybuilder.status_level_warning', 'Warnung')}</option>
                                                    <option value="critical">{t('querybuilder.status_level_critical', 'Kritisch')}</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.status_title', 'Titel')}</label>
                                                <input
                                                    value={visConfig.statusTitle || ''}
                                                    onChange={e => setVisConfig({ ...visConfig, statusTitle: e.target.value })}
                                                    className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                                    placeholder={t('querybuilder.status_placeholder_title', 'Systemstatus')}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.status_message', 'Nachricht')}</label>
                                                <textarea
                                                    value={visConfig.statusMessage || ''}
                                                    onChange={e => setVisConfig({ ...visConfig, statusMessage: e.target.value })}
                                                    className="w-full h-24 p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none resize-y"
                                                    placeholder={t('querybuilder.status_placeholder_message', 'Alle Kernsysteme laufen stabil.')}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-3 py-2">
                                                <span className="text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">{t('querybuilder.status_pulse', 'Signal-Animation')}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setVisConfig({ ...visConfig, statusPulse: !visConfig.statusPulse })}
                                                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase transition-all ${visConfig.statusPulse ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-200'}`}
                                                >
                                                    {visConfig.statusPulse ? t('querybuilder.label_on') : t('querybuilder.label_off')}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {visType === 'section' && (
                                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2 duration-300">
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.section_title', 'Ueberschrift')}</label>
                                                <input
                                                    value={visConfig.sectionTitle || ''}
                                                    onChange={e => setVisConfig({ ...visConfig, sectionTitle: e.target.value })}
                                                    className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                                    placeholder={t('querybuilder.section_placeholder_title', 'Abschnittstitel')}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.section_subtitle', 'Untertitel')}</label>
                                                <input
                                                    value={visConfig.sectionSubtitle || ''}
                                                    onChange={e => setVisConfig({ ...visConfig, sectionSubtitle: e.target.value })}
                                                    className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                                    placeholder={t('querybuilder.section_placeholder_subtitle', 'Optionaler Hinweistext')}
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.section_align', 'Ausrichtung')}</label>
                                                    <select
                                                        value={visConfig.sectionAlign || 'left'}
                                                        onChange={e => setVisConfig({ ...visConfig, sectionAlign: e.target.value as NonNullable<WidgetConfig['sectionAlign']> })}
                                                        className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                                    >
                                                        <option value="left">{t('querybuilder.text_align_left')}</option>
                                                        <option value="center">{t('querybuilder.text_align_center')}</option>
                                                        <option value="right">{t('querybuilder.text_align_right')}</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.section_divider', 'Trennlinie')}</label>
                                                    <select
                                                        value={visConfig.sectionDividerStyle || 'line'}
                                                        onChange={e => setVisConfig({ ...visConfig, sectionDividerStyle: e.target.value as NonNullable<WidgetConfig['sectionDividerStyle']> })}
                                                        className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                                    >
                                                        <option value="line">{t('querybuilder.section_divider_line', 'Linie')}</option>
                                                        <option value="double">{t('querybuilder.section_divider_double', 'Doppelt')}</option>
                                                        <option value="none">{t('querybuilder.section_divider_none', 'Keine')}</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {visType === 'kpi_manual' && (
                                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2 duration-300">
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.kpi_title', 'Kennzahl-Titel')}</label>
                                                <input
                                                    value={visConfig.kpiTitle || ''}
                                                    onChange={e => setVisConfig({ ...visConfig, kpiTitle: e.target.value })}
                                                    className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                                    placeholder={t('querybuilder.kpi_placeholder_title', 'z. B. Verfuegbarkeit')}
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.kpi_value', 'Wert')}</label>
                                                    <input
                                                        value={visConfig.kpiValue || ''}
                                                        onChange={e => setVisConfig({ ...visConfig, kpiValue: e.target.value })}
                                                        className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                                        placeholder={t('querybuilder.kpi_placeholder_value', '99.9')}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.kpi_unit', 'Einheit')}</label>
                                                    <input
                                                        value={visConfig.kpiUnit || ''}
                                                        onChange={e => setVisConfig({ ...visConfig, kpiUnit: e.target.value })}
                                                        className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                                        placeholder={t('querybuilder.kpi_placeholder_unit', '%')}
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                <div>
                                                    <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.kpi_target', 'Ziel')}</label>
                                                    <input
                                                        value={visConfig.kpiTarget || ''}
                                                        onChange={e => setVisConfig({ ...visConfig, kpiTarget: e.target.value })}
                                                        className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                                        placeholder={t('querybuilder.kpi_placeholder_target', '99.5')}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.kpi_trend', 'Trend')}</label>
                                                    <select
                                                        value={visConfig.kpiTrend || 'flat'}
                                                        onChange={e => setVisConfig({ ...visConfig, kpiTrend: e.target.value as NonNullable<WidgetConfig['kpiTrend']> })}
                                                        className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                                    >
                                                        <option value="up">{t('querybuilder.kpi_trend_up', 'Steigend')}</option>
                                                        <option value="flat">{t('querybuilder.kpi_trend_flat', 'Stabil')}</option>
                                                        <option value="down">{t('querybuilder.kpi_trend_down', 'Fallend')}</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.text_align', 'Ausrichtung')}</label>
                                                    <select
                                                        value={visConfig.kpiAlign || 'left'}
                                                        onChange={e => setVisConfig({ ...visConfig, kpiAlign: e.target.value as NonNullable<WidgetConfig['kpiAlign']> })}
                                                        className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                                    >
                                                        <option value="left">{t('querybuilder.text_align_left', 'Links')}</option>
                                                        <option value="center">{t('querybuilder.text_align_center', 'Zentriert')}</option>
                                                        <option value="right">{t('querybuilder.text_align_right', 'Rechts')}</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.kpi_note', 'Hinweis')}</label>
                                                <textarea
                                                    value={visConfig.kpiNote || ''}
                                                    onChange={e => setVisConfig({ ...visConfig, kpiNote: e.target.value })}
                                                    className="w-full h-20 p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none resize-y"
                                                    placeholder={t('querybuilder.kpi_placeholder_note', 'Optionaler Kontext zur Kennzahl.')}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {visType === 'image' && (
                                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2 duration-300">
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.image_url', 'Bild-URL')}</label>
                                                <input
                                                    value={visConfig.imageUrl || ''}
                                                    onChange={e => setVisConfig({ ...visConfig, imageUrl: e.target.value })}
                                                    className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                                    placeholder={t('querybuilder.image_placeholder_url', 'https://...')}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.image_alt', 'Alternativtext')}</label>
                                                <input
                                                    value={visConfig.imageAlt || ''}
                                                    onChange={e => setVisConfig({ ...visConfig, imageAlt: e.target.value })}
                                                    className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                                    placeholder={t('querybuilder.image_placeholder_alt', 'Beschreibung fuer Screenreader')}
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.image_fit', 'Darstellung')}</label>
                                                    <select
                                                        value={visConfig.imageFit || 'contain'}
                                                        onChange={e => setVisConfig({ ...visConfig, imageFit: e.target.value as NonNullable<WidgetConfig['imageFit']> })}
                                                        className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                                    >
                                                        <option value="contain">{t('querybuilder.image_fit_contain', 'Einpassen')}</option>
                                                        <option value="cover">{t('querybuilder.image_fit_cover', 'Ausfuellen')}</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.text_align', 'Ausrichtung')}</label>
                                                    <select
                                                        value={visConfig.imageAlign || 'center'}
                                                        onChange={e => setVisConfig({ ...visConfig, imageAlign: e.target.value as NonNullable<WidgetConfig['imageAlign']> })}
                                                        className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                                    >
                                                        <option value="left">{t('querybuilder.text_align_left', 'Links')}</option>
                                                        <option value="center">{t('querybuilder.text_align_center', 'Zentriert')}</option>
                                                        <option value="right">{t('querybuilder.text_align_right', 'Rechts')}</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.image_caption', 'Bildunterschrift')}</label>
                                                <input
                                                    value={visConfig.imageCaption || ''}
                                                    onChange={e => setVisConfig({ ...visConfig, imageCaption: e.target.value })}
                                                    className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                                    placeholder={t('querybuilder.image_placeholder_caption', 'Optional')}
                                                />
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
                                                <select onChange={e => { if (!e.target.value) return; setVisConfig({ ...visConfig, pivotRows: [...(visConfig.pivotRows || []), e.target.value] }); e.target.value = ''; }} className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none">
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
                                                <select onChange={e => { if (!e.target.value) return; setVisConfig({ ...visConfig, pivotCols: [...(visConfig.pivotCols || []), e.target.value] }); e.target.value = ''; }} className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none">
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
                                                    <select onChange={e => { if (!e.target.value) return; setVisConfig({ ...visConfig, pivotMeasures: [...(visConfig.pivotMeasures || []), { field: e.target.value, agg: 'sum' }] }); e.target.value = ''; }} className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none">
                                                        <option value="">{t('querybuilder.pivot_add_measure')}</option>
                                                        {resultColumns.map(col => <option key={col} value={col}>{col}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {(visType === 'kpi' && results.length > 0) && (
                                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2 duration-300">
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.kpi_unit', 'Einheit')}</label>
                                                <input
                                                    value={visConfig.kpiUnit || ''}
                                                    onChange={e => setVisConfig({ ...visConfig, kpiUnit: e.target.value })}
                                                    className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                                    placeholder={t('querybuilder.kpi_placeholder_unit', '%')}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[10px] font-black uppercase text-slate-400">{t('querybuilder.kpi_rules')}</h4>
                                                <button
                                                    onClick={() => setVisConfig({ ...visConfig, rules: [...(visConfig.rules || []), { operator: '>', value: 0, color: 'green' }] })}
                                                    className="p-1 px-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-200 rounded text-[9px] font-bold hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-700/60 transition-colors"
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
                                    <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2 duration-300">
                                        <div>
                                            <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">
                                                {t('querybuilder.widget_description', 'Widget-Beschreibung')}
                                            </label>
                                            <textarea
                                                value={visConfig.widgetDescription || ''}
                                                onChange={e => setVisConfig({ ...visConfig, widgetDescription: e.target.value })}
                                                className="w-full h-20 p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none resize-y"
                                                placeholder={t('querybuilder.widget_description_placeholder', 'Kurze Einordnung oder Kontext (optional)')}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">
                                                {t('querybuilder.widget_description_position', 'Position')}
                                            </label>
                                            <select
                                                value={visConfig.widgetDescriptionPosition || 'bottom'}
                                                onChange={e => setVisConfig({ ...visConfig, widgetDescriptionPosition: e.target.value as NonNullable<WidgetConfig['widgetDescriptionPosition']> })}
                                                className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                                            >
                                                <option value="top">{t('querybuilder.widget_description_position_top', 'Oben')}</option>
                                                <option value="bottom">{t('querybuilder.widget_description_position_bottom', 'Unten')}</option>
                                            </select>
                                        </div>
                                        <p className="text-[10px] text-slate-500">
                                            {t('querybuilder.widget_description_hint', 'Die Beschreibung wird im Widget oberhalb oder unterhalb des Inhalts angezeigt.')}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 space-y-3 animate-in slide-in-from-right-4 duration-300">
                                    <p className="text-[10px] font-black uppercase tracking-wide text-blue-500">
                                        {t('querybuilder.step_finalize')}
                                    </p>
                                    <div className="rounded-lg border border-blue-100 dark:border-blue-900 bg-white dark:bg-slate-900 px-3 py-2">
                                        <label className="text-[10px] font-black uppercase tracking-wide text-slate-400">{t('querybuilder.archive_name')}</label>
                                        <input
                                            value={widgetName}
                                            onChange={e => setWidgetName(e.target.value)}
                                            placeholder={t('querybuilder.archive_placeholder')}
                                            className="mt-1 w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div className="space-y-2 text-[11px]">
                                        <div className="rounded-lg border border-blue-100 dark:border-blue-900 bg-white dark:bg-slate-900 px-3 py-2">
                                            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{t('querybuilder.finalize_mode')}</div>
                                            <div className="mt-1 text-slate-700 dark:text-slate-200">{modeInfoText}</div>
                                        </div>
                                        <div className="rounded-lg border border-blue-100 dark:border-blue-900 bg-white dark:bg-slate-900 px-3 py-2">
                                            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{t('querybuilder.finalize_source')}</div>
                                            <div className="mt-1 text-slate-700 dark:text-slate-200">
                                                {isContentWidget
                                                    ? (isMarkdownWidget
                                                        ? t('querybuilder.new_markdown_card_type', 'MARKDOWN')
                                                        : isStatusWidget
                                                            ? t('querybuilder.new_status_card_type', 'STATUS')
                                                            : isSectionWidget
                                                                ? t('querybuilder.new_section_card_type', 'SECTION')
                                                                : isKpiManualWidget
                                                                    ? t('querybuilder.new_kpi_manual_card_type', 'KPI MANUAL')
                                                                    : isImageWidget
                                                                        ? t('querybuilder.new_image_card_type', 'IMAGE')
                                                                    : t('querybuilder.new_text_card_type'))
                                                    : t('querybuilder.sql_manager_source', 'SQL Manager Source')}
                                            </div>
                                        </div>
                                        <div className="rounded-lg border border-blue-100 dark:border-blue-900 bg-white dark:bg-slate-900 px-3 py-2">
                                            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{t('querybuilder.finalize_chart')}</div>
                                            <div className="mt-1 text-slate-700 dark:text-slate-200 font-semibold">{previewTypeMeta.label}</div>
                                            {!isContentWidget && (
                                                <div className="mt-1 text-[10px] text-slate-500">
                                                    {t('querybuilder.finalize_axes', {
                                                        x: visConfig.xAxis || '-',
                                                        count: (visConfig.yAxes || []).length
                                                    })}
                                                </div>
                                            )}
                                            {isContentWidget && (
                                                <div className="mt-1 text-[10px] text-slate-500">
                                                    {isStatusWidget
                                                        ? t('querybuilder.finalize_status_level', { level: t(`querybuilder.status_level_${visConfig.statusLevel || 'ok'}`, visConfig.statusLevel || 'ok') })
                                                        : isSectionWidget
                                                            ? t('querybuilder.finalize_section_style', { style: t(`querybuilder.section_divider_${visConfig.sectionDividerStyle || 'line'}`, visConfig.sectionDividerStyle || 'line') })
                                                            : isKpiManualWidget
                                                                ? t('querybuilder.finalize_kpi_target', { target: visConfig.kpiTarget || '-' })
                                                                : isImageWidget
                                                                    ? t('querybuilder.finalize_image_url', { url: (visConfig.imageUrl || '').trim() ? 'OK' : '-' })
                                                        : t('querybuilder.finalize_text_length', {
                                                            count: isMarkdownWidget
                                                                ? (visConfig.markdownContent || '').trim().length
                                                                : (visConfig.textContent || '').trim().length
                                                        })}
                                                </div>
                                            )}
                                        </div>
                                        <div className="rounded-lg border border-blue-100 dark:border-blue-900 bg-white dark:bg-slate-900 px-3 py-2">
                                            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{t('querybuilder.preview', { count: results.length })}</div>
                                            <div className={`mt-1 text-[11px] font-semibold ${previewVisualizationInvalid ? 'text-amber-700' : 'text-emerald-700'}`}>
                                                {previewVisualizationInvalid ? t('querybuilder.preview_not_renderable_title') : t('querybuilder.finalize_ready')}
                                            </div>
                                        </div>
                                    </div>
                                    {saveDisabled && saveBlockedHint && (
                                        <p className="text-[10px] text-amber-700">{saveBlockedHint}</p>
                                    )}
                                </div>
                            )}
                        </div>
                        {showGuidedFooter && (
                            <div className="sticky bottom-0 z-20 border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 py-3 shadow-[0_-6px_18px_-14px_rgba(15,23,42,0.5)]">
                                <div className="flex items-center justify-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                const previousStep = (guidedStep === 3)
                                                    ? 1
                                                    : Math.max(1, guidedStep - 1);
                                                gotoStep(previousStep as GuidedStep);
                                            }}
                                            disabled={guidedStep <= 1}
                                            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-500 dark:text-slate-300 disabled:opacity-40"
                                        >
                                            {t('querybuilder.back')}
                                        </button>
                                        {guidedApplyVisible && (
                                            <button
                                                onClick={() => { void handleGuidedApply(); }}
                                                disabled={guidedApplyDisabled}
                                                className="px-4 py-2 rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 text-xs font-bold disabled:opacity-40"
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
                                {guidedNextDisabled && guidedBlockedHint && (
                                    <p className="mt-2 text-center text-[10px] text-amber-700">{guidedBlockedHint}</p>
                                )}
                            </div>
                        )}
                    </div>
                    </div>

                    {/* Preview Area */}
                    <div id="query-visualization" className="flex-1 min-w-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full min-h-[320px] sm:min-h-[380px] lg:min-h-[460px] relative">
                        <div className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                            <div className="p-3 flex items-center justify-between gap-2">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                    {t('querybuilder.preview_panel_title', 'Vorschau')}
                                </h3>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                    {previewHeaderTitle}
                                </p>
                            </div>
                            <div className="px-3 pb-2 border-t border-slate-100 dark:border-slate-800">
                                <div className="pt-2 flex items-center justify-between gap-2">
                                    <div className="inline-flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setPreviewTab('graphic')}
                                            className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${previewTab === 'graphic'
                                                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700'
                                                : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                            }`}
                                        >
                                            <BarChart2 className="w-3 h-3" />
                                            {t('querybuilder.preview_tab_graphic', 'Grafisch')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { if (!isContentWidget) setPreviewTab('table'); }}
                                            disabled={isContentWidget}
                                            className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${previewTab === 'table'
                                                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700'
                                                : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                                        >
                                            <TableIcon className="w-3 h-3" />
                                            {t('querybuilder.preview_tab_table', 'Tabelle')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { if (!isContentWidget) setPreviewTab('sql'); }}
                                            disabled={isContentWidget}
                                            className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${previewTab === 'sql'
                                                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700'
                                                : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                                        >
                                            <FileCode2 className="w-3 h-3" />
                                            {t('querybuilder.preview_tab_sql', 'SQL')}
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => setIsMaximized(!isMaximized)}
                                        className="px-2 py-1.5 rounded text-[10px] font-bold border bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-100 transition-colors flex items-center justify-center gap-1"
                                    >
                                        {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                                        <span>{isMaximized ? t('querybuilder.centered') : t('querybuilder.focus')}</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className={`flex-1 min-h-0 flex flex-col ${previewTab === 'sql' ? 'overflow-hidden p-0' : 'overflow-auto p-4 container-scrollbar'}`}>
                            {previewTab === 'graphic' ? (
                                <div className="h-full min-h-[260px] flex flex-col">
                                    {previewWidgetDescription && previewWidgetDescriptionPosition === 'top' && (
                                        <div className="px-4 py-2 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-md mb-3">
                                            {previewWidgetDescription}
                                        </div>
                                    )}
                                    <div className="flex-1 min-h-0">
                                {isTextWidget ? (
                                    <div
                                        className={`h-full min-h-[260px] p-6 whitespace-pre-wrap break-words text-slate-800 dark:text-slate-100 ${
                                            visConfig.textSize === 'sm' ? 'text-sm' :
                                            visConfig.textSize === 'lg' ? 'text-lg' :
                                            visConfig.textSize === 'xl' ? 'text-xl' :
                                            visConfig.textSize === '2xl' ? 'text-2xl' : 'text-base'
                                        } ${visConfig.textBold ? 'font-bold' : 'font-normal'} ${visConfig.textItalic ? 'italic' : 'not-italic'} ${visConfig.textUnderline ? 'underline' : 'no-underline'} ${
                                            visConfig.textAlign === 'center' ? 'text-center' : visConfig.textAlign === 'right' ? 'text-right' : 'text-left'
                                        }`}
                                    >
                                        {(visConfig.textContent || '').trim() || t('querybuilder.text_placeholder')}
                                    </div>
                                ) : isMarkdownWidget ? (
                                    <div className="h-full min-h-[260px] p-6 text-slate-800 dark:text-slate-100">
                                        <MarkdownContent
                                            markdown={(visConfig.markdownContent || '').trim()}
                                            emptyText={t('querybuilder.markdown_placeholder', '# Titel\nText mit **Fett** und [Link](https://example.com)')}
                                            className="text-sm leading-6"
                                        />
                                    </div>
                                ) : isStatusWidget ? (
                                    <div className="h-full min-h-[260px] p-6 flex items-center justify-center">
                                        {(() => {
                                            const level = visConfig.statusLevel || 'ok';
                                            const styleMap: Record<NonNullable<WidgetConfig['statusLevel']>, { ring: string; dot: string; title: string; text: string }> = {
                                                ok: { ring: 'ring-emerald-200 bg-emerald-50 dark:bg-emerald-900/20', dot: 'bg-emerald-500', title: 'text-emerald-800 dark:text-emerald-300', text: 'text-emerald-700/90 dark:text-emerald-200/90' },
                                                info: { ring: 'ring-blue-200 bg-blue-50 dark:bg-blue-900/20', dot: 'bg-blue-500', title: 'text-blue-800 dark:text-blue-300', text: 'text-blue-700/90 dark:text-blue-200/90' },
                                                warning: { ring: 'ring-amber-200 bg-amber-50 dark:bg-amber-900/20', dot: 'bg-amber-500', title: 'text-amber-800 dark:text-amber-300', text: 'text-amber-700/90 dark:text-amber-200/90' },
                                                critical: { ring: 'ring-rose-200 bg-rose-50 dark:bg-rose-900/20', dot: 'bg-rose-500', title: 'text-rose-800 dark:text-rose-300', text: 'text-rose-700/90 dark:text-rose-200/90' }
                                            };
                                            const styles = styleMap[level];
                                            return (
                                                <div className={`w-full max-w-xl rounded-xl ring-1 ${styles.ring} p-5`}>
                                                    <div className="flex items-center gap-3">
                                                        <span className={`relative inline-flex h-3.5 w-3.5 rounded-full ${styles.dot}`}>
                                                            {visConfig.statusPulse && <span className={`absolute inline-flex h-full w-full rounded-full ${styles.dot} opacity-75 animate-ping`} />}
                                                        </span>
                                                        <span className={`text-[11px] font-black uppercase tracking-wider ${styles.title}`}>
                                                            {t(`querybuilder.status_level_${level}`, level)}
                                                        </span>
                                                    </div>
                                                    <div className={`mt-3 text-lg font-bold ${styles.title}`}>
                                                        {(visConfig.statusTitle || '').trim() || t('querybuilder.status_placeholder_title', 'Systemstatus')}
                                                    </div>
                                                    <p className={`mt-2 text-sm ${styles.text}`}>
                                                        {(visConfig.statusMessage || '').trim() || t('querybuilder.status_placeholder_message', 'Alle Kernsysteme laufen stabil.')}
                                                    </p>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ) : isSectionWidget ? (
                                    <div className="h-full min-h-[260px] p-6 flex flex-col justify-center">
                                        {(() => {
                                            const align = visConfig.sectionAlign || 'left';
                                            const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
                                            const divider = visConfig.sectionDividerStyle || 'line';
                                            return (
                                                <div className={`w-full ${alignClass}`}>
                                                    <h2 className="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-100">
                                                        {(visConfig.sectionTitle || '').trim() || t('querybuilder.section_placeholder_title', 'Abschnittstitel')}
                                                    </h2>
                                                    {(visConfig.sectionSubtitle || '').trim() && (
                                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                                            {visConfig.sectionSubtitle}
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
                                            );
                                        })()}
                                    </div>
                                ) : isKpiManualWidget ? (
                                    <div className="h-full min-h-[260px] p-6 flex items-center justify-center">
                                        {(() => {
                                            const trend = visConfig.kpiTrend || 'flat';
                                            const parseNumericInput = (raw?: string) => {
                                                if (!raw) return Number.NaN;
                                                const normalized = raw.replace(/\s+/g, '').replace(',', '.').replace(/[^0-9.+-]/g, '');
                                                return Number(normalized);
                                            };
                                            const valueNum = parseNumericInput(visConfig.kpiValue);
                                            const targetNum = parseNumericInput(visConfig.kpiTarget);
                                            const align = visConfig.kpiAlign || 'left';
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
                                                <div className={`w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 ${alignTextClass}`}>
                                                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                                        {(visConfig.kpiTitle || '').trim() || t('querybuilder.kpi_placeholder_title', 'Kennzahl')}
                                                    </div>
                                                    <div className={`mt-3 flex items-end gap-2 ${chipsAlignClass}`}>
                                                        <div className={`text-4xl font-black tracking-tight ${valueStyle}`}>
                                                            {(visConfig.kpiValue || '').trim() || '--'}
                                                        </div>
                                                        {(visConfig.kpiUnit || '').trim() && (
                                                            <div className="pb-1 text-sm font-bold text-slate-500 dark:text-slate-400">{visConfig.kpiUnit}</div>
                                                        )}
                                                    </div>
                                                    <div className={`mt-3 flex flex-wrap items-center gap-2 ${chipsAlignClass}`}>
                                                        <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wide bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                                                            {t('querybuilder.kpi_target', 'Ziel')}: {(visConfig.kpiTarget || '').trim() || '-'}
                                                        </span>
                                                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${trendStyle}`}>
                                                            {t(`querybuilder.kpi_trend_${trend}`, trend)}
                                                        </span>
                                                        <span className={`px-2 py-1 rounded-full border text-[10px] font-black uppercase tracking-wide ${statusStyle}`}>
                                                            {status === 'ok'
                                                                ? t('querybuilder.kpi_status_on_target', 'Im Ziel')
                                                                : status === 'warn'
                                                                    ? t('querybuilder.kpi_status_near_target', 'Nahe am Ziel')
                                                                    : status === 'crit'
                                                                        ? t('querybuilder.kpi_status_below_target', 'Unter Ziel')
                                                                        : t('querybuilder.kpi_status_no_compare', 'Kein Zielvergleich')}
                                                        </span>
                                                    </div>
                                                    {(visConfig.kpiNote || '').trim() && (
                                                        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                                                            {visConfig.kpiNote}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ) : isImageWidget ? (
                                    <div className="h-full min-h-[260px] p-6 flex items-center justify-center">
                                        {(() => {
                                            const align = visConfig.imageAlign || 'center';
                                            const alignClass = align === 'left' ? 'items-start' : align === 'right' ? 'items-end' : 'items-center';
                                            return (
                                                <div className={`w-full h-full flex flex-col ${alignClass} justify-center`}>
                                                    {(visConfig.imageUrl || '').trim() && !imagePreviewFailed ? (
                                                        <>
                                                            <img
                                                                src={(visConfig.imageUrl || '').trim()}
                                                                alt={(visConfig.imageAlt || '').trim() || 'Preview image'}
                                                                referrerPolicy="no-referrer"
                                                                crossOrigin="anonymous"
                                                                onError={() => setImagePreviewFailed(true)}
                                                                className={`max-h-[320px] w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 ${visConfig.imageFit === 'cover' ? 'object-cover' : 'object-contain'}`}
                                                            />
                                                            {(visConfig.imageCaption || '').trim() && (
                                                                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{visConfig.imageCaption}</p>
                                                            )}
                                                        </>
                                                    ) : (visConfig.imageUrl || '').trim() ? (
                                                        <div className="w-full rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3 text-amber-900 dark:text-amber-200">
                                                            <div className="flex items-start gap-2">
                                                                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold">{t('querybuilder.image_load_error_title', 'Bild konnte nicht geladen werden.')}</p>
                                                                    <p className="text-[11px] mt-1">{t('querybuilder.image_load_error_hint', 'Bitte URL, Zugriff und CORS/Hotlink-Schutz pruefen.')}</p>
                                                                    <p className="text-[10px] mt-1 font-mono break-all opacity-80">{(visConfig.imageUrl || '').trim()}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="h-[220px] w-full rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400">
                                                            <ImageIcon className="w-8 h-8 mb-2 opacity-60" />
                                                            <p className="text-xs font-semibold text-center">{t('querybuilder.image_empty_hint', 'Bitte eine Bild-URL hinterlegen.')}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ) : !hasQueryPreviewTabs ? (
                                    <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-slate-400">
                                        <BarChart2 className="w-10 h-10 mb-3 opacity-40" />
                                        <p className="text-xs font-bold text-center">{t('querybuilder.preview_graphic_no_query_hint', 'Keine Abfrage vorhanden. Fuer Text/Markdown/Status/Section/KPI-Manual/Image-Widgets steht nur die Inhaltsvorschau zur Verfuegung.')}</p>
                                    </div>
                                ) : results.length === 0 ? (
                                    <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-slate-300">
                                        <Play className="w-12 h-12 mb-4 opacity-10" />
                                        <p className="text-xs font-black uppercase tracking-widest text-center whitespace-pre-wrap">{t('querybuilder.no_data_prompt')}</p>
                                    </div>
                                ) : previewVisType === 'table' ? (
                                    <DataTable columns={columns} data={results} onRowClick={item => { setSelectedItemIndex(results.indexOf(item)); setDetailModalOpen(true); }} />
                                ) : previewVisType === 'pivot' ? (
                                    <PivotTable data={results} rows={visConfig.pivotRows || []} cols={visConfig.pivotCols || []} measures={visConfig.pivotMeasures || []} />
                                ) : !isGraphicCapableType ? (
                                    <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-slate-400">
                                        <Layout className="w-10 h-10 mb-3 opacity-40" />
                                        <p className="text-xs font-bold text-center">{t('querybuilder.preview_graphic_not_selected_hint', 'Fuer die grafische Ansicht bitte einen Diagrammtyp auswaehlen.')}</p>
                                    </div>
                                ) : (
                                    <div key={`${previewVisType}-${previewRenderVersion}`} className="h-full min-h-[260px] w-full flex flex-col">
                                    {previewVisualizationInvalid ? (
                                        <div className="flex-1 flex items-center justify-center p-6">
                                            <div className="max-w-md w-full rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100 px-4 py-4">
                                                <div className="flex items-start gap-3">
                                                    <div className="mt-0.5 text-amber-600 dark:text-amber-300">{previewTypeMeta.icon}</div>
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">
                                                            {previewTypeMeta.label}
                                                        </div>
                                                        <p className="text-sm font-bold mt-1">{t('querybuilder.preview_not_renderable_title')}</p>
                                                        <p className="text-xs text-amber-800/90 dark:text-amber-200/90 mt-1">{t('querybuilder.preview_not_renderable_hint')}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : previewVisType === 'kpi' ? (() => {
                                        const firstRow = results[0];
                                        const rowKeys = Object.keys(firstRow);
                                        const preferredMetricKey = (visConfig.yAxes || [])[0] || visConfig.yAxis || '';
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
                                        let displayColor = 'text-slate-900 dark:text-white';
                                        let displayStyle: React.CSSProperties | undefined;
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
                                                    else displayStyle = { color: rule.color };
                                                    break;
                                                }
                                            }
                                        }
                                        return (
                                            <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in zoom-in-95 duration-500">
                                                <div className="flex items-end gap-2">
                                                    <div className={`text-6xl lg:text-8xl font-black tracking-widest break-all transition-colors duration-300 ${displayColor}`} style={displayStyle}>{formatValue(val, metricKey)}</div>
                                                    {(visConfig.kpiUnit || '').trim() && (
                                                        <div className="pb-1 text-xl lg:text-2xl font-bold text-slate-500 dark:text-slate-400">{visConfig.kpiUnit}</div>
                                                    )}
                                                </div>
                                                <div className="text-xs font-bold text-slate-400 mt-6 uppercase tracking-[0.4em] font-mono">{metricKey}</div>
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
                                                    <Tooltip contentStyle={previewTooltipContentStyle} labelStyle={previewTooltipLabelStyle} itemStyle={previewTooltipItemStyle} cursor={previewTooltipCursor} formatter={(val, name) => [formatValue(val, name as string), name]} />
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
                                                    <Tooltip contentStyle={previewTooltipContentStyle} labelStyle={previewTooltipLabelStyle} itemStyle={previewTooltipItemStyle} formatter={(val, name) => [formatValue(val, name as string), name]} />
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
                                                    <Tooltip contentStyle={previewTooltipContentStyle} labelStyle={previewTooltipLabelStyle} itemStyle={previewTooltipItemStyle} formatter={(val, name) => [formatValue(val, name as string), name]} />
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
                                                    <Tooltip contentStyle={previewTooltipContentStyle} labelStyle={previewTooltipLabelStyle} itemStyle={previewTooltipItemStyle} />
                                                    <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                </PieChart>
                                            ) : previewVisType === 'composed' ? (
                                                <ComposedChart data={results}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey={visConfig.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} tickFormatter={val => formatValue(val, (visConfig.yAxes || [])[0])} />
                                                    <Tooltip contentStyle={previewTooltipContentStyle} labelStyle={previewTooltipLabelStyle} itemStyle={previewTooltipItemStyle} formatter={(val, name) => [formatValue(val, name as string), name]} />
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
                                                    <Tooltip contentStyle={previewTooltipContentStyle} labelStyle={previewTooltipLabelStyle} itemStyle={previewTooltipItemStyle} />
                                                </RadarChart>
                                            ) : previewVisType === 'scatter' ? (
                                                <ScatterChart>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis type="number" dataKey={visConfig.xAxis} name={visConfig.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
                                                    <YAxis type="number" dataKey={(visConfig.yAxes || [])[0]} name={(visConfig.yAxes || [])[0]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
                                                    <Tooltip contentStyle={previewTooltipContentStyle} labelStyle={previewTooltipLabelStyle} itemStyle={previewTooltipItemStyle} cursor={{ strokeDasharray: '3 3' }} />
                                                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                    <Scatter name={widgetName || 'Scatter'} data={scatterData} fill={visConfig.color || COLORS[0]} />
                                                </ScatterChart>
                                            ) : null}
                                        </ResponsiveContainer>
                                        </div>
                                    )}
                                </div>
                                )
                                    }
                                    </div>
                                    {previewWidgetDescription && previewWidgetDescriptionPosition === 'bottom' && (
                                        <div className="px-4 py-2 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-md mt-3">
                                            {previewWidgetDescription}
                                        </div>
                                    )}
                                </div>
                            ) : previewTab === 'table' ? (
                                !hasQueryPreviewTabs ? (
                                    <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-slate-400">
                                        <TableIcon className="w-10 h-10 mb-3 opacity-40" />
                                        <p className="text-xs font-bold text-center">{t('querybuilder.preview_no_data_source', 'Keine Datenquelle ausgewaehlt.')}</p>
                                    </div>
                                ) : results.length === 0 ? (
                                    <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-slate-300">
                                        <Play className="w-12 h-12 mb-4 opacity-10" />
                                        <p className="text-xs font-black uppercase tracking-widest text-center whitespace-pre-wrap">{t('querybuilder.no_data_prompt')}</p>
                                    </div>
                                ) : (
                                    <DataTable columns={columns} data={results} onRowClick={item => { setSelectedItemIndex(results.indexOf(item)); setDetailModalOpen(true); }} />
                                )
                            ) : (
                                !hasQueryPreviewTabs ? (
                                    <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-slate-400">
                                        <FileCode2 className="w-10 h-10 mb-3 opacity-40" />
                                        <p className="text-xs font-bold text-center">{t('querybuilder.preview_no_data_source', 'Keine Datenquelle ausgewaehlt.')}</p>
                                    </div>
                                ) : (
                                    <div className="flex-1 min-h-0 flex flex-col">
                                        <div className="flex-1 min-h-0 w-full border-t border-slate-200 dark:border-slate-700 overflow-hidden">
                                            <CodeMirror
                                                value={sql}
                                                height="100%"
                                                readOnly
                                                editable={false}
                                                basicSetup={{
                                                    lineNumbers: sqlEditorLineNumbers,
                                                    foldGutter: false,
                                                    highlightActiveLine: sqlEditorPreviewHighlight,
                                                    highlightActiveLineGutter: sqlEditorLineNumbers && sqlEditorPreviewHighlight
                                                }}
                                                extensions={sqlPreviewExtensions}
                                            />
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                </div>
            </div>

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






