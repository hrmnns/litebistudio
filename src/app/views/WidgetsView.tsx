import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
    Layout, Folder, Gauge, Image as ImageIcon,
    Edit3, X, Download, Search, FileCode2, Save, SlidersHorizontal, Plus, Trash2, Copy, FolderOpen, Star, Database, FileText
} from 'lucide-react';
import { useReportExport } from '../../hooks/useReportExport';
import { DataTable } from '../../components/ui/DataTable';
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    ComposedChart, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ScatterChart, Scatter, LabelList, RadialBarChart, RadialBar
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
import { RightOverlayPanel } from '../components/ui/RightOverlayPanel';
import { SelectionListDialog } from '../components/ui/SelectionListDialog';
import { Button } from '../components/ui/Button';

type VisualizationType = 'table' | 'bar' | 'stacked_bar' | 'stacked_bar_100' | 'line' | 'area' | 'pie' | 'kpi' | 'gauge' | 'composed' | 'radar' | 'scatter' | 'pivot' | 'text' | 'markdown' | 'status' | 'section' | 'kpi_manual' | 'image';
type GuidedStep = 1 | 2 | 3 | 4;
const DEFAULT_SQL = '';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
const logger = createLogger('WidgetsView');
const WIDGET_QUERY_TIMEOUT_MS = 15_000;
const WIDGET_RUN_ERR_UNKNOWN = '__WIDGET_RUN_UNKNOWN__';
const HEADER_HYDRATION_MIN_MS = 120;
const CONTENT_VIS_TYPES = new Set<VisualizationType>(['text', 'markdown', 'status', 'section', 'kpi_manual', 'image']);
const QUERY_VIS_OPTIONS: Array<{ id: VisualizationType; icon: React.ComponentType<{ className?: string }>; labelKey: string; fallback: string }> = [
    { id: 'table', icon: TableIcon, labelKey: 'querybuilder.table', fallback: 'Table' },
    { id: 'bar', icon: BarChart2, labelKey: 'querybuilder.bar', fallback: 'Bar' },
    { id: 'stacked_bar', icon: BarChart2, labelKey: 'querybuilder.stacked_bar', fallback: 'Stacked Bar' },
    { id: 'stacked_bar_100', icon: BarChart2, labelKey: 'querybuilder.stacked_bar_100', fallback: '100% Stacked Bar' },
    { id: 'line', icon: TrendingUp, labelKey: 'querybuilder.line', fallback: 'Line' },
    { id: 'area', icon: Layout, labelKey: 'querybuilder.area', fallback: 'Area' },
    { id: 'pie', icon: Layout, labelKey: 'querybuilder.pie', fallback: 'Pie' },
    { id: 'kpi', icon: Layout, labelKey: 'querybuilder.kpi', fallback: 'KPI' },
    { id: 'gauge', icon: Gauge, labelKey: 'querybuilder.gauge', fallback: 'Gauge' },
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
    created_at?: string | null;
    updated_at?: string | null;
}

const normalizeSqlText = (value: string) => value
    .replace(/;+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const parseMaybeJson = (value: unknown): unknown => {
    if (typeof value !== 'string') return value ?? null;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
};
interface WidgetRunCacheEntry {
    widgetId: string;
    normalizedSql: string;
    rows: DbRow[];
    cachedAt: number;
}
const WIDGET_RUN_CACHE_MAX_ENTRIES = 12;
const widgetRunCache = new Map<string, WidgetRunCacheEntry>();

const getCachedWidgetRun = (widgetId: string, normalizedSql: string): WidgetRunCacheEntry | null => {
    const key = widgetId.trim();
    if (!key || !normalizedSql) return null;
    const entry = widgetRunCache.get(key);
    if (!entry || entry.normalizedSql !== normalizedSql) return null;
    // Touch entry for a simple LRU behavior.
    widgetRunCache.delete(key);
    widgetRunCache.set(key, entry);
    return entry;
};

const setCachedWidgetRun = (widgetId: string, normalizedSql: string, rows: DbRow[]): void => {
    const key = widgetId.trim();
    if (!key || !normalizedSql) return;
    widgetRunCache.set(key, {
        widgetId: key,
        normalizedSql,
        rows: Array.isArray(rows) ? [...rows] : [],
        cachedAt: Date.now()
    });
    while (widgetRunCache.size > WIDGET_RUN_CACHE_MAX_ENTRIES) {
        const oldestKey = widgetRunCache.keys().next().value as string | undefined;
        if (!oldestKey) break;
        widgetRunCache.delete(oldestKey);
    }
};

export const WidgetsView: React.FC = () => {
    const { t, i18n } = useTranslation();
    const [sql, setSql] = useState(DEFAULT_SQL);
    const [results, setResults] = useState<DbRow[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [lastRunSql, setLastRunSql] = useState('');
    const [previewRenderVersion, setPreviewRenderVersion] = useState(0);
    const [previewTab, setPreviewTab] = useLocalStorage<'graphic' | 'table' | 'sql'>('widgets_preview_tab', 'graphic');
    const [savedSnapshot, setSavedSnapshot] = useState('');
    const [pendingBaselineSync, setPendingBaselineSync] = useState(false);
    const [isHeaderHydrating, setIsHeaderHydrating] = useState(true);
    const [cachedHeaderName, setCachedHeaderName] = useLocalStorage<string>('widgets_header_name_cache_v1', '');
    const [, setCachedHeaderDirty] = useLocalStorage<boolean>('widgets_header_dirty_cache_v1', false);
    const [, setCachedHeaderWidgetId] = useLocalStorage<string>('widgets_header_widget_id_cache_v1', '');

    // Mode State
    const [builderMode, setBuilderMode] = useState<'sql' | 'visual'>('sql');
    const [workspaceTab, setWorkspaceTab] = useLocalStorage<'manage' | 'editor'>('widgets_workspace_tab', 'editor');
    const [manageSearch, setManageSearch] = useState('');
    const [manageSort, setManageSort] = useState<'name_asc' | 'name_desc' | 'updated_desc' | 'updated_asc' | 'usage_desc' | 'favorite_then_updated'>('updated_desc');
    const [, setSidebarTab] = useState<'source' | 'visual' | 'widget'>('visual');
    const [sourceSelectTab, setSourceSelectTab] = useState<'none' | 'query' | 'widget'>('none');
    const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false);
    const [guidedStep, setGuidedStep] = useState<GuidedStep>(1);
    const [queryConfig, setQueryConfig] = useLocalStorage<QueryConfig | undefined>('widgets_config', undefined);

    // Visualization State
    const [visType, setVisType] = useState<VisualizationType>('table');
    const [visConfig, setVisConfig] = useState<WidgetConfig>({ type: 'table', color: '#3b82f6' });

    // Active Widget State
    const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);
    const [lastOpenWidgetId, setLastOpenWidgetId] = useLocalStorage<string>('widgets_last_open_widget_id', '');

    // Save Widget State
    const [widgetName, setWidgetName] = useState('');
    const [selectedSqlStatementId, setSelectedSqlStatementId] = useLocalStorage<string>('widgets_selected_sql_statement_id', '');
    const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);
    const [loadDialogType, setLoadDialogType] = useState<'widget' | 'sql'>('widget');
    const [loadDialogSearch, setLoadDialogSearch] = useState('');
    const [loadDialogPinnedOnly, setLoadDialogPinnedOnly] = useLocalStorage<boolean>('widgets_load_dialog_pinned_only', false);
    const [loadDialogSort, setLoadDialogSort] = useLocalStorage<'updated_desc' | 'updated_asc' | 'name_asc' | 'name_desc' | 'pinned_first'>('widgets_load_dialog_sort', 'updated_desc');
    const [pinnedWidgetIds, setPinnedWidgetIds] = useLocalStorage<string[]>('widgets_pinned_widget_ids', []);
    const [selectedLoadWidgetId, setSelectedLoadWidgetId] = useState<string>('');
    const [selectedLoadSqlId, setSelectedLoadSqlId] = useState<string>('');
    const [imagePreviewFailed, setImagePreviewFailed] = useState(false);
    const [localWidgetSavedAtById, setLocalWidgetSavedAtById] = useState<Record<string, string>>({});
    const [widgetSqlDraftById, setWidgetSqlDraftById] = useLocalStorage<Record<string, string>>('widgets_sql_draft_by_id_v1', {});
    const [widgetSqlStatementDraftById, setWidgetSqlStatementDraftById] = useLocalStorage<Record<string, string>>('widgets_sql_statement_draft_by_id_v1', {});

    // Detail View State
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [selectedItemIndex, setSelectedItemIndex] = useState(0);
    const [activeSchema, setActiveSchema] = useState<SchemaDefinition | null>(null);
    const [isGlobalRefreshing, setIsGlobalRefreshing] = useState(false);
    const [sqlEditorSyntaxHighlight] = useLocalStorage<boolean>('sql_editor_syntax_highlighting', true);
    const [sqlEditorLineWrap] = useLocalStorage<boolean>('sql_editor_line_wrap', true);
    const [sqlEditorLineNumbers] = useLocalStorage<boolean>('sql_editor_line_numbers', false);
    const [sqlEditorHighlightActiveLine] = useLocalStorage<boolean>('sql_editor_highlight_active_line', true);
    const [sqlEditorFontSize] = useLocalStorage<number>('sql_editor_font_size', 14);
    const [sqlEditorTabSize] = useLocalStorage<number>('sql_editor_tab_size', 4);
    const [sqlEditorThemeIntensity] = useLocalStorage<'subtle' | 'normal' | 'high'>('sql_editor_theme_intensity', 'normal');
    const [isDarkSqlPreview, setIsDarkSqlPreview] = useState<boolean>(
        typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    );
    const { isExporting, exportToPdf } = useReportExport();
    const { togglePresentationMode, isReadOnly } = useDashboard();
    const hasRestoredLastWidgetRef = useRef(false);
    const bypassUnsavedGuardRef = useRef(false);
    const pendingBaselineSnapshotRef = useRef<string | null>(null);
    const headerHydrationStartedAtRef = useRef(Date.now());
    const headerHydrationTimerRef = useRef<number | null>(null);
    const finishHeaderHydration = useCallback(() => {
        if (!isHeaderHydrating) return;
        const elapsed = Date.now() - headerHydrationStartedAtRef.current;
        const remaining = HEADER_HYDRATION_MIN_MS - elapsed;
        if (remaining <= 0) {
            if (headerHydrationTimerRef.current !== null) {
                window.clearTimeout(headerHydrationTimerRef.current);
                headerHydrationTimerRef.current = null;
            }
            setIsHeaderHydrating(false);
            return;
        }
        if (headerHydrationTimerRef.current !== null) {
            window.clearTimeout(headerHydrationTimerRef.current);
        }
        headerHydrationTimerRef.current = window.setTimeout(() => {
            setIsHeaderHydrating(false);
            headerHydrationTimerRef.current = null;
        }, remaining);
    }, [isHeaderHydrating]);
    const openConfigPanel = useCallback(() => {
        setPreviewTab('graphic');
        setIsConfigPanelOpen(true);
    }, [setPreviewTab]);

    // Fetch saved widgets
    const { data: savedWidgets, refresh: refreshWidgets } = useAsync<SavedWidget[]>(
        async () => await SystemRepository.getUserWidgets() as unknown as SavedWidget[],
        []
    );
    const { data: sqlStatements, refresh: refreshSqlStatements } = useAsync<SqlStatementRecord[]>(
        async () => await SystemRepository.listSqlStatements('global'),
        []
    );
    const { data: dashboards } = useAsync<DbRow[]>(
        async () => await SystemRepository.getDashboards() as unknown as DbRow[],
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
            const selectionDark = sqlEditorThemeIntensity === 'subtle' ? 'rgba(96, 165, 250, 0.18)' : sqlEditorThemeIntensity === 'high' ? 'rgba(96, 165, 250, 0.34)' : 'rgba(96, 165, 250, 0.24)';
            const selectionLight = sqlEditorThemeIntensity === 'subtle' ? 'rgba(59, 130, 246, 0.18)' : sqlEditorThemeIntensity === 'high' ? 'rgba(59, 130, 246, 0.34)' : 'rgba(59, 130, 246, 0.25)';
            return EditorView.theme({
                '&': {
                    height: '100%',
                    fontSize: `${Math.max(12, Math.min(15, sqlEditorFontSize))}px`,
                    borderRadius: '0.5rem',
                    backgroundColor: isDarkSqlPreview ? '#0b1220' : '#f8fafc',
                    color: isDarkSqlPreview ? '#e2e8f0' : '#0f172a'
                },
                '.cm-editor': {
                    backgroundColor: `${isDarkSqlPreview ? '#0b1220' : '#f8fafc'} !important`,
                    color: isDarkSqlPreview ? '#e2e8f0' : '#0f172a'
                },
                '.cm-scroller': {
                    overflow: 'auto',
                    backgroundColor: `${isDarkSqlPreview ? '#0b1220' : '#f8fafc'} !important`,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                },
                '.cm-content': {
                    padding: '0.75rem',
                    backgroundColor: `${isDarkSqlPreview ? '#0b1220' : '#f8fafc'} !important`,
                    color: isDarkSqlPreview ? '#e2e8f0' : '#0f172a',
                    caretColor: isDarkSqlPreview ? '#60a5fa' : '#2563eb'
                },
                '.cm-activeLine': {
                    backgroundColor: sqlEditorHighlightActiveLine ? (isDarkSqlPreview ? activeLineDark : activeLineLight) : 'transparent'
                },
                '.cm-selectionLayer .cm-selectionBackground': {
                    backgroundColor: isDarkSqlPreview ? `${selectionDark} !important` : `${selectionLight} !important`
                },
                '.cm-content ::selection': {
                    backgroundColor: isDarkSqlPreview ? `${selectionDark} !important` : `${selectionLight} !important`
                },
                '.cm-line::selection, .cm-line > span::selection': {
                    backgroundColor: isDarkSqlPreview ? `${selectionDark} !important` : `${selectionLight} !important`
                },
                '.cm-focused': {
                    outline: 'none'
                },
                '.cm-gutters': {
                    backgroundColor: `${isDarkSqlPreview ? '#0b1220' : '#f8fafc'} !important`,
                    border: 'none',
                    color: isDarkSqlPreview ? '#94a3b8' : '#64748b'
                },
                '.cm-cursor, .cm-dropCursor': {
                    borderLeftColor: isDarkSqlPreview ? '#60a5fa' : '#2563eb'
                }
            }, { dark: isDarkSqlPreview });
        },
        [isDarkSqlPreview, sqlEditorFontSize, sqlEditorHighlightActiveLine, sqlEditorThemeIntensity]
    );

    const sqlPreviewExtensions = useMemo(() => {
        const exts = [sqlLang(), sqlPreviewTheme, EditorState.tabSize.of(Math.max(2, Math.min(4, sqlEditorTabSize)))];
        if (sqlEditorSyntaxHighlight) {
            exts.push(syntaxHighlighting(sqlPreviewHighlightStyle));
        }
        if (sqlEditorLineWrap) {
            exts.push(EditorView.lineWrapping);
        }
        return exts;
    }, [sqlEditorLineWrap, sqlEditorSyntaxHighlight, sqlEditorTabSize, sqlPreviewHighlightStyle, sqlPreviewTheme]);
    const savedWidgetsById = useMemo(() => {
        const map = new Map<string, SavedWidget>();
        for (const widget of savedWidgets || []) {
            map.set(widget.id, widget);
        }
        return map;
    }, [savedWidgets]);
    const sqlStatementsById = useMemo(() => {
        const map = new Map<string, SqlStatementRecord>();
        for (const statement of sqlStatements || []) {
            map.set(statement.id, statement);
        }
        return map;
    }, [sqlStatements]);
    const sqlStatementByNormalizedSql = useMemo(() => {
        const map = new Map<string, SqlStatementRecord>();
        for (const statement of sqlStatements || []) {
            const normalized = normalizeSqlText(statement.sql_text);
            if (!normalized || map.has(normalized)) continue;
            map.set(normalized, statement);
        }
        return map;
    }, [sqlStatements]);

    const buildSnapshot = useCallback((overrides?: {
        currentSql?: string;
        currentBuilderMode?: 'sql' | 'visual';
        currentQueryConfig?: QueryConfig | undefined;
        currentVisType?: VisualizationType;
        currentVisConfig?: WidgetConfig;
        currentWidgetName?: string;
        currentActiveWidgetId?: string | null;
    }) => JSON.stringify({
        sql: normalizeSqlText(overrides?.currentSql ?? sql),
        builderMode: overrides?.currentBuilderMode ?? builderMode,
        queryConfig: overrides?.currentQueryConfig ?? queryConfig ?? null,
        visType: overrides?.currentVisType ?? visType,
        visConfig: overrides?.currentVisConfig ?? visConfig,
        widgetName: (overrides?.currentWidgetName ?? widgetName).trim(),
        activeWidgetId: overrides?.currentActiveWidgetId ?? activeWidgetId
    }), [sql, builderMode, queryConfig, visType, visConfig, widgetName, activeWidgetId]);

    const handleRun = useCallback(async (
        overrideSql?: string,
        options?: {
            preserveVisualization?: boolean;
            onError?: (message: string) => void;
            cacheTarget?: { widgetId: string; normalizedSql?: string };
        }
    ): Promise<boolean> => {
        setLoading(true);
        setError('');
        try {
            const sqlToExecute = overrideSql || sql;
            let timeoutHandle: number | null = null;
            const timeoutPromise = new Promise<DbRow[]>((_, reject) => {
                timeoutHandle = window.setTimeout(() => {
                    void SystemRepository.abortActiveQueries();
                    reject(new Error(`SQL execution timed out after ${Math.floor(WIDGET_QUERY_TIMEOUT_MS / 1000)}s`));
                }, WIDGET_QUERY_TIMEOUT_MS);
            });
            let data: DbRow[] = [];
            try {
                data = await Promise.race([
                    SystemRepository.executeRaw(sqlToExecute),
                    timeoutPromise
                ]) as DbRow[];
            } finally {
                if (timeoutHandle !== null) {
                    window.clearTimeout(timeoutHandle);
                }
            }
            setResults(data);
            setLastRunSql(sqlToExecute);
            const normalizedSql = options?.cacheTarget?.normalizedSql || normalizeSqlText(sqlToExecute);
            const cacheWidgetId = options?.cacheTarget?.widgetId || activeWidgetId || '';
            if (cacheWidgetId && normalizedSql) {
                setCachedWidgetRun(cacheWidgetId, normalizedSql, data);
            }
            if (!options?.preserveVisualization && data.length > 0) {
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
            const rawMessage = err instanceof Error ? err.message : String(err);
            const message = rawMessage && rawMessage.trim().length > 0
                ? rawMessage
                : WIDGET_RUN_ERR_UNKNOWN;
            setError(message);
            options?.onError?.(message);
            return false;
        } finally {
            setLoading(false);
        }
    }, [sql, visConfig.xAxis, activeWidgetId]);

    const loadWidget = useCallback(async (widget: SavedWidget, navigate = true): Promise<void> => {
        setPendingBaselineSync(true);
        let parsedVisConfig: WidgetConfig = { type: 'table', color: '#3b82f6' };
        let parsedVisType: VisualizationType = 'table';
        let parsedBuilderMode: 'sql' | 'visual' = 'sql';
        const linkedStatement = widget.sql_statement_id ? sqlStatementsById.get(widget.sql_statement_id) : undefined;
        const widgetSql = (linkedStatement?.sql_text || widget.sql_query || '').trim() || DEFAULT_SQL;
        const hasDraftSql = Object.prototype.hasOwnProperty.call(widgetSqlDraftById, widget.id);
        const draftSql = hasDraftSql ? String(widgetSqlDraftById[widget.id] ?? '') : '';
        const restoredSql = hasDraftSql ? draftSql : widgetSql;
        const hasDraftStatementId = Object.prototype.hasOwnProperty.call(widgetSqlStatementDraftById, widget.id);
        const draftStatementId = hasDraftStatementId ? String(widgetSqlStatementDraftById[widget.id] ?? '') : '';

        setActiveWidgetId(widget.id);
        setWidgetName(widget.name);
        setSql(restoredSql);
        const matchedBySql = sqlStatementByNormalizedSql.get(normalizeSqlText(restoredSql));
        setSelectedSqlStatementId(
            hasDraftStatementId
                ? draftStatementId
                : (typeof widget.sql_statement_id === 'string' && widget.sql_statement_id.trim().length > 0
                    ? widget.sql_statement_id.trim()
                    : (linkedStatement?.id || matchedBySql?.id || ''))
        );
        setLastRunSql('');
        setResults([]);
        setError('');
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
            setSql(restoredSql);
            const normalizedWidgetSql = normalizeSqlText(restoredSql);
            const cachedRun = getCachedWidgetRun(widget.id, normalizedWidgetSql);
            if (cachedRun) {
                setResults(cachedRun.rows);
                setLastRunSql(restoredSql);
                setError('');
            }
            await handleRun(restoredSql, {
                preserveVisualization: true,
                cacheTarget: {
                    widgetId: widget.id,
                    normalizedSql: normalizedWidgetSql
                }
            });
            if (navigate) {
                setGuidedStep(3);
                setSidebarTab('visual');
            }
        }
        const persistedBaselineSnapshot = buildSnapshot({
            // Keep baseline on persisted DB state so restored local drafts remain dirty.
            currentSql: (parsedVisType === 'text' || parsedVisType === 'markdown' || parsedVisType === 'status' || parsedVisType === 'section' || parsedVisType === 'kpi_manual' || parsedVisType === 'image') ? '' : widgetSql,
            currentBuilderMode: parsedBuilderMode,
            currentQueryConfig: undefined,
            currentVisType: parsedVisType,
            currentVisConfig: parsedVisConfig,
            currentWidgetName: widget.name,
            currentActiveWidgetId: widget.id
        });
        pendingBaselineSnapshotRef.current = persistedBaselineSnapshot;
        setSavedSnapshot(persistedBaselineSnapshot);
    }, [buildSnapshot, handleRun, setQueryConfig, setSelectedSqlStatementId, sqlStatementByNormalizedSql, sqlStatementsById, widgetSqlDraftById, widgetSqlStatementDraftById]);

    const handleSaveWidget = useCallback(async (mode: 'update' | 'new' = 'update'): Promise<boolean> => {
        if (isReadOnly) return false;
        const saveAsContentWidget = CONTENT_VIS_TYPES.has(visType);
        const persistWidget = async (targetId: string, name: string, description: string): Promise<boolean> => {
            try {
                const sqlText = saveAsContentWidget ? '' : sql.trim();
                const selectedStatementId = (selectedSqlStatementId || '').trim();
                const linkedStatementId = !saveAsContentWidget
                    ? (selectedStatementId || null)
                    : null;
                const widget = {
                    id: targetId,
                    name,
                    description,
                    sql_statement_id: linkedStatementId,
                    sql_query: sqlText,
                    visualization_config: { ...visConfig, type: visType },
                    visual_builder_config: null
                };

                await SystemRepository.saveUserWidget(widget);
                refreshWidgets();
                setActiveWidgetId(widget.id);
                setWidgetName(widget.name);
                setLocalWidgetSavedAtById((prev) => ({
                    ...prev,
                    [widget.id]: new Date().toISOString()
                }));
                setSavedSnapshot(buildSnapshot({
                    currentSql: widget.sql_query,
                    currentBuilderMode: builderMode,
                    currentQueryConfig: builderMode === 'visual' ? queryConfig : undefined,
                    currentVisType: visType,
                    currentVisConfig: visConfig,
                    currentWidgetName: widget.name,
                    currentActiveWidgetId: widget.id
                }));
                setGuidedStep(1);
                setSidebarTab('source');
                setSourceSelectTab('widget');
                setPreviewTab('graphic');
                return true;
            } catch (err: unknown) {
                await appDialog.error(t('querybuilder.error_save') + (err instanceof Error ? err.message : String(err)));
                return false;
            }
        };

        // Standard Save: update current widget directly (no prompt), like SQL workspace save.
        if (mode === 'update' && activeWidgetId) {
            const current = savedWidgetsById.get(activeWidgetId);
            const name = (current?.name || widgetName).trim();
            if (!name) return false;
            const description = (current?.description || '').trim();
            const saved = await persistWidget(activeWidgetId, name, description);
            if (!saved) return false;
            await appDialog.info(
                t('querybuilder.success_update_detail', {
                    name,
                    defaultValue: `Das Widget "${name}" wurde erfolgreich gespeichert.`
                }),
                t('querybuilder.success_update_title', 'Widget erfolgreich gespeichert')
            );
            return true;
        }

        // Save as / new: prompt for name + description, overwrite by name with explicit confirm.
        let suggestedName = (widgetName || '').trim();
        let suggestedDescription = '';
        const current = activeWidgetId ? savedWidgetsById.get(activeWidgetId) : undefined;
        if (current) {
            suggestedName = current.name.trim();
            suggestedDescription = (current.description || '').trim();
        }
        while (true) {
            const prompted = await appDialog.prompt2(
                t('querybuilder.archive_name'),
                t('common.description', 'Description'),
                {
                    title: t('querybuilder.save_widget_as_title', 'Widget speichern unter'),
                    defaultValue: suggestedName,
                    secondDefaultValue: suggestedDescription,
                    placeholder: t('querybuilder.archive_placeholder'),
                    secondPlaceholder: t('querybuilder.widget_description_placeholder', 'Short context or note (optional)')
                }
            );
            if (!prompted) return false;
            const trimmedName = prompted.value.trim();
            if (!trimmedName) return false;
            const trimmedDescription = prompted.secondValue.trim();
            suggestedName = trimmedName;
            suggestedDescription = trimmedDescription;

            const existingByName = (savedWidgets || []).find((w) => w.name.trim().toLowerCase() === trimmedName.toLowerCase());
            if (existingByName) {
                const overwrite = await appDialog.confirm(
                    t('querybuilder.confirm_overwrite_widget_name', {
                        name: trimmedName,
                        defaultValue: `Ein Widget mit dem Namen "${trimmedName}" existiert bereits. Ueberschreiben?`
                    }),
                    {
                        confirmLabel: t('common.yes', 'Ja'),
                        cancelLabel: t('common.no', 'Nein')
                    }
                );
                if (!overwrite) continue;
                const saved = await persistWidget(existingByName.id, trimmedName, trimmedDescription);
                if (!saved) return false;
                await appDialog.info(
                    t('querybuilder.success_save_detail', {
                        name: trimmedName,
                        defaultValue: `Das Widget "${trimmedName}" wurde erfolgreich gespeichert.`
                    }),
                    t('querybuilder.success_save_title', 'Widget erfolgreich gespeichert')
                );
                return true;
            }

            const saved = await persistWidget(crypto.randomUUID(), trimmedName, trimmedDescription);
            if (!saved) return false;
            await appDialog.info(
                t('querybuilder.success_save_detail', {
                    name: trimmedName,
                    defaultValue: `Das Widget "${trimmedName}" wurde erfolgreich gespeichert.`
                }),
                t('querybuilder.success_save_title', 'Widget erfolgreich gespeichert')
            );
            return true;
        }
    }, [
        activeWidgetId,
        builderMode,
        buildSnapshot,
        isReadOnly,
        refreshWidgets,
        savedWidgets,
        savedWidgetsById,
        setPreviewTab,
        selectedSqlStatementId,
        sql,
        t,
        queryConfig,
        visConfig,
        visType,
        widgetName
    ]);
    const columns = useMemo(() => {
        if (results.length === 0) return [];
        return Object.keys(results[0]).map(key => ({
            header: key,
            accessor: key,
            render: (item: DbRow) => formatValue(item[key], key)
        }));
    }, [results]);
    const filteredLoadWidgets = useMemo(() => {
        const all = savedWidgets || [];
        const term = loadDialogSearch.trim().toLowerCase();
        if (!term) return all;
        return all.filter((widget) =>
            widget.name.toLowerCase().includes(term) ||
            (widget.description || '').toLowerCase().includes(term) ||
            (widget.sql_query || '').toLowerCase().includes(term)
        );
    }, [savedWidgets, loadDialogSearch]);
    const filteredLoadSqlStatements = useMemo(() => {
        const all = sqlStatements || [];
        const term = loadDialogSearch.trim().toLowerCase();
        if (!term) return all;
        return all.filter((stmt) =>
            stmt.name.toLowerCase().includes(term) ||
            stmt.sql_text.toLowerCase().includes(term) ||
            (stmt.description || '').toLowerCase().includes(term)
        );
    }, [sqlStatements, loadDialogSearch]);
    const isWidgetPinned = useCallback((id: string) => pinnedWidgetIds.includes(id), [pinnedWidgetIds]);
    const isSqlPinned = useCallback(
        (id: string) => Boolean((sqlStatements || []).find((stmt) => stmt.id === id && Number(stmt.is_favorite) === 1)),
        [sqlStatements]
    );
    const sortedFilteredLoadWidgets = useMemo(() => {
        const rows = [...filteredLoadWidgets];
        const toTs = (value?: string | null) => {
            const ts = value ? Date.parse(value) : NaN;
            return Number.isFinite(ts) ? ts : 0;
        };
        rows.sort((a, b) => {
            switch (loadDialogSort) {
                case 'name_asc':
                    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
                case 'name_desc':
                    return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
                case 'updated_asc':
                    return toTs(a.updated_at || a.created_at) - toTs(b.updated_at || b.created_at);
                case 'pinned_first':
                    return Number(isWidgetPinned(b.id)) - Number(isWidgetPinned(a.id));
                case 'updated_desc':
                default:
                    return toTs(b.updated_at || b.created_at) - toTs(a.updated_at || a.created_at);
            }
        });
        return loadDialogPinnedOnly ? rows.filter((row) => isWidgetPinned(row.id)) : rows;
    }, [filteredLoadWidgets, isWidgetPinned, loadDialogPinnedOnly, loadDialogSort]);
    const sortedFilteredLoadSqlStatements = useMemo(() => {
        const rows = [...filteredLoadSqlStatements];
        const toTs = (value?: string | null) => {
            const ts = value ? Date.parse(value) : NaN;
            return Number.isFinite(ts) ? ts : 0;
        };
        rows.sort((a, b) => {
            switch (loadDialogSort) {
                case 'name_asc':
                    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
                case 'name_desc':
                    return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
                case 'updated_asc':
                    return toTs(a.updated_at || a.created_at) - toTs(b.updated_at || b.created_at);
                case 'pinned_first':
                    return Number(Number(b.is_favorite) === 1) - Number(Number(a.is_favorite) === 1);
                case 'updated_desc':
                default:
                    return toTs(b.updated_at || b.created_at) - toTs(a.updated_at || a.created_at);
            }
        });
        return loadDialogPinnedOnly ? rows.filter((row) => Number(row.is_favorite) === 1) : rows;
    }, [filteredLoadSqlStatements, loadDialogPinnedOnly, loadDialogSort]);
    const filteredManageWidgets = useMemo(() => {
        const all = savedWidgets || [];
        const term = manageSearch.trim().toLowerCase();
        if (!term) return all;
        return all.filter((widget) =>
            widget.name.toLowerCase().includes(term) ||
            (widget.description || '').toLowerCase().includes(term) ||
            (widget.sql_query || '').toLowerCase().includes(term)
        );
    }, [savedWidgets, manageSearch]);
    const dashboardUsageByWidgetId = useMemo(() => {
        const existingWidgetIds = new Set((savedWidgets || []).map((widget) => widget.id));
        const usageMap = new Map<string, { count: number; dashboards: string[] }>();

        for (const dashboard of (dashboards || [])) {
            const dashboardName = typeof dashboard.name === 'string' && dashboard.name.trim().length > 0
                ? dashboard.name.trim()
                : t('dashboard.default_name', 'Mein Dashboard');
            const rawLayout = dashboard.layout;
            let layoutItems: unknown[] = [];

            if (Array.isArray(rawLayout)) {
                layoutItems = rawLayout;
            } else if (typeof rawLayout === 'string') {
                try {
                    const parsed = JSON.parse(rawLayout);
                    if (Array.isArray(parsed)) layoutItems = parsed;
                } catch {
                    layoutItems = [];
                }
            }

            const widgetIdsInDashboard = new Set<string>();
            for (const entry of layoutItems) {
                if (typeof entry === 'string') {
                    if (existingWidgetIds.has(entry)) widgetIdsInDashboard.add(entry);
                    continue;
                }
                if (!entry || typeof entry !== 'object') continue;
                const record = entry as { id?: unknown; widgetId?: unknown; type?: unknown };
                const candidateId =
                    typeof record.id === 'string'
                        ? record.id
                        : (typeof record.widgetId === 'string' ? record.widgetId : '');
                if (!candidateId) continue;
                if (record.type && record.type !== 'custom') continue;
                if (existingWidgetIds.has(candidateId)) widgetIdsInDashboard.add(candidateId);
            }
            for (const widgetId of widgetIdsInDashboard) {
                const current = usageMap.get(widgetId);
                if (!current) {
                    usageMap.set(widgetId, { count: 1, dashboards: [dashboardName] });
                    continue;
                }
                usageMap.set(widgetId, {
                    count: current.count + 1,
                    dashboards: current.dashboards.includes(dashboardName)
                        ? current.dashboards
                        : [...current.dashboards, dashboardName]
                });
            }
        }
        return usageMap;
    }, [dashboards, savedWidgets, t]);
    const dashboardUsedWidgetCount = useMemo(() => dashboardUsageByWidgetId.size, [dashboardUsageByWidgetId]);
    const sortedManageWidgets = useMemo(() => {
        const rows = [...filteredManageWidgets];
        const toTs = (value?: string | null) => {
            const ts = value ? Date.parse(value) : NaN;
            return Number.isFinite(ts) ? ts : 0;
        };
        rows.sort((a, b) => {
            switch (manageSort) {
                case 'name_asc':
                    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
                case 'name_desc':
                    return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
                case 'updated_asc':
                    return toTs(a.updated_at || a.created_at) - toTs(b.updated_at || b.created_at);
                case 'usage_desc':
                    return (dashboardUsageByWidgetId.get(b.id)?.count || 0) - (dashboardUsageByWidgetId.get(a.id)?.count || 0);
                case 'favorite_then_updated': {
                    const byFavorite = Number(isWidgetPinned(b.id)) - Number(isWidgetPinned(a.id));
                    if (byFavorite !== 0) return byFavorite;
                    return toTs(b.updated_at || b.created_at) - toTs(a.updated_at || a.created_at);
                }
                case 'updated_desc':
                default:
                    return toTs(b.updated_at || b.created_at) - toTs(a.updated_at || a.created_at);
            }
        });
        return rows;
    }, [filteredManageWidgets, manageSort, dashboardUsageByWidgetId, isWidgetPinned]);
    useEffect(() => {
        if (!activeWidgetId) return;
        if (lastOpenWidgetId === activeWidgetId) return;
        setLastOpenWidgetId(activeWidgetId);
    }, [activeWidgetId, lastOpenWidgetId, setLastOpenWidgetId]);
    useEffect(() => {
        if (!activeWidgetId) return;
        if (CONTENT_VIS_TYPES.has(visType)) {
            setWidgetSqlDraftById((prev) => {
                if (!Object.prototype.hasOwnProperty.call(prev, activeWidgetId)) return prev;
                const next = { ...prev };
                delete next[activeWidgetId];
                return next;
            });
            setWidgetSqlStatementDraftById((prev) => {
                if (!Object.prototype.hasOwnProperty.call(prev, activeWidgetId)) return prev;
                const next = { ...prev };
                delete next[activeWidgetId];
                return next;
            });
            return;
        }
        setWidgetSqlDraftById((prev) => (
            prev[activeWidgetId] === sql
                ? prev
                : { ...prev, [activeWidgetId]: sql }
        ));
        setWidgetSqlStatementDraftById((prev) => (
            prev[activeWidgetId] === selectedSqlStatementId
                ? prev
                : { ...prev, [activeWidgetId]: selectedSqlStatementId }
        ));
    }, [activeWidgetId, selectedSqlStatementId, sql, visType, setWidgetSqlDraftById, setWidgetSqlStatementDraftById]);

    useEffect(() => {
        if (hasRestoredLastWidgetRef.current) return;
        if (!savedWidgets || savedWidgets.length === 0) return;
        if (!lastOpenWidgetId) {
            hasRestoredLastWidgetRef.current = true;
            finishHeaderHydration();
            return;
        }
        if (activeWidgetId) {
            hasRestoredLastWidgetRef.current = true;
            finishHeaderHydration();
            return;
        }
        const saved = savedWidgetsById.get(lastOpenWidgetId);
        if (!saved) {
            setLastOpenWidgetId('');
            hasRestoredLastWidgetRef.current = true;
            finishHeaderHydration();
            return;
        }
        hasRestoredLastWidgetRef.current = true;
        setSourceSelectTab('widget');
        void loadWidget(saved, false).finally(() => {
            finishHeaderHydration();
        });
    }, [activeWidgetId, finishHeaderHydration, lastOpenWidgetId, loadWidget, savedWidgets, savedWidgetsById, setLastOpenWidgetId]);
    useEffect(() => {
        if (!isHeaderHydrating) return;
        if (!savedWidgets) return;
        if (savedWidgets.length === 0) {
            finishHeaderHydration();
        }
    }, [finishHeaderHydration, isHeaderHydrating, savedWidgets]);
    useEffect(() => {
        return () => {
            if (headerHydrationTimerRef.current !== null) {
                window.clearTimeout(headerHydrationTimerRef.current);
                headerHydrationTimerRef.current = null;
            }
        };
    }, []);

    const hasSelectedSqlStatement = Boolean((selectedSqlStatementId || '').trim());
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
    const stackedBar100Data = useMemo(() => {
        const yAxes = visConfig.yAxes || [];
        if (yAxes.length === 0) return [] as DbRow[];
        return results.map((row) => {
            let total = 0;
            for (const y of yAxes) {
                const num = Number(row[y]);
                if (Number.isFinite(num)) total += num;
            }
            if (!Number.isFinite(total) || total === 0) {
                const zeroRow: DbRow = { ...row };
                for (const y of yAxes) zeroRow[y] = 0;
                return zeroRow;
            }
            const normalized: DbRow = { ...row };
            for (const y of yAxes) {
                const num = Number(row[y]);
                normalized[y] = Number.isFinite(num) ? (num / total) * 100 : 0;
            }
            return normalized;
        });
    }, [results, visConfig.yAxes]);
    const previewVisType: VisualizationType = visType;
    const hasQueryPreviewTabs = !isContentWidget && sql.trim().length > 0;
    const isGraphicCapableType = previewVisType !== 'table' && previewVisType !== 'pivot' && previewVisType !== 'text' && previewVisType !== 'markdown' && previewVisType !== 'status' && previewVisType !== 'section' && previewVisType !== 'kpi_manual' && previewVisType !== 'image';
    const canPersistWidget = isContentWidget || results.length > 0;
    const exportDisabled = isExporting || (!isContentWidget && results.length === 0);
    const saveDisabled = !canPersistWidget || isReadOnly || (!isContentWidget && !hasSelectedSqlStatement);
    const saveBlockedHint = isReadOnly
        ? t('common.read_only')
        : (!canPersistWidget
            ? t('querybuilder.hint_run_query_before_save')
            : (!isContentWidget && !hasSelectedSqlStatement
                ? t('querybuilder.hint_select_sql_statement_before_save', 'Bitte ein SQL-Statement aus dem SQL-Manager auswaehlen.')
                : ''));
    const exportDisabledReason = isExporting
        ? t('common.exporting')
        : (!isContentWidget && results.length === 0 ? t('querybuilder.hint_run_query_before_export') : '');
    const hasEntrySelection = true;
    const canProceedFromStart = sourceSelectTab === 'none'
        ? true
        : (sourceSelectTab === 'query' ? hasSelectedSqlStatement : Boolean(activeWidgetId));
    const hasSourceConfig = isContentWidget || hasSelectedSqlStatement;
    const hasRunOutput = isContentWidget || (results.length > 0 && !error && lastRunSql.trim() === sql.trim());
    const hasVisualizationConfig = useMemo(() => {
        if (!hasSelectedSqlStatement) {
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
        const hasXAxis = visType === 'gauge' ? true : Boolean(visConfig.xAxis);
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
    }, [hasSelectedSqlStatement, isContentWidget, isImageWidget, isKpiManualWidget, isMarkdownWidget, isSectionWidget, isStatusWidget, isTextWidget, visType, visConfig, numericColumns, scatterData.length, scatterXKey, scatterYKey, results]);
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
            if (!hasSelectedSqlStatement) return 1;
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
            if (sourceSelectTab === 'query' && !hasSelectedSqlStatement) {
                return t('querybuilder.hint_select_sql_statement_for_widget', 'Bitte zuerst ein SQL-Statement im SQL-Manager auswaehlen.');
            }
            if (sourceSelectTab === 'widget' && !activeWidgetId) {
                return t('querybuilder.mode_open_select', 'Waehle ein bestehendes Widget aus der Liste.');
            }
            return '';
        }
        if (guidedStep === 2) {
            if (!hasSelectedSqlStatement) {
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
    const showGuidedFooter = false;
    const currentSnapshot = useMemo(
        () => buildSnapshot(),
        [buildSnapshot]
    );
    const hasUnsavedChanges = savedSnapshot.length > 0 && currentSnapshot !== savedSnapshot;
    const canSaveCurrentWidget = !isHeaderHydrating && !saveDisabled && hasUnsavedChanges;
    const applySqlStatementSource = useCallback((statement: SqlStatementRecord) => {
        setSelectedSqlStatementId(statement.id);
        setQueryConfig(undefined);
        setSql(statement.sql_text);
        setLastRunSql('');
        setResults([]);
        setError('');
        setPreviewTab('sql');
    }, [setPreviewTab, setQueryConfig, setSelectedSqlStatementId]);
    const confirmSaveOrDiscardBeforeContinue = useCallback(async () => {
        if (bypassUnsavedGuardRef.current) return true;
        if (!hasUnsavedChanges) return true;
        const choice = await appDialog.confirm3(
            t(
                'querybuilder.confirm_save_or_discard_before_new_widget',
                'Es gibt ungespeicherte Änderungen. Sollen diese vor dem Fortfahren gespeichert werden?'
            ),
            {
                title: t('common.warning', 'Warnung'),
                confirmLabel: t('common.yes', 'Ja'),
                secondaryLabel: t('common.no', 'Nein'),
                cancelLabel: t('common.cancel', 'Abbrechen')
            }
        );
        if (choice === 'cancel') return false;
        if (choice === 'confirm') {
            const saved = await handleSaveWidget(activeWidgetId ? 'update' : 'new');
            return saved;
        }
        return true;
    }, [activeWidgetId, handleSaveWidget, hasUnsavedChanges, t]);
    const resetToNewWidget = useCallback(async () => {
        const canContinue = await confirmSaveOrDiscardBeforeContinue();
        if (!canContinue) return;

        const defaultVisConfig: WidgetConfig = { type: 'table', color: '#3b82f6' };
        setActiveWidgetId(null);
        setLastOpenWidgetId('');
        setWidgetName('');
        setSelectedSqlStatementId('');
        setSourceSelectTab('none');
        setBuilderMode('sql');
        setQueryConfig(undefined);
        setSql(DEFAULT_SQL);
        setLastRunSql('');
        setResults([]);
        setError('');
        setPreviewTab('graphic');
        setVisType('table');
        setVisConfig(defaultVisConfig);
        setGuidedStep(1);
        setSidebarTab('visual');
        setSavedSnapshot('');
    }, [confirmSaveOrDiscardBeforeContinue, setLastOpenWidgetId, setPreviewTab, setQueryConfig, setSelectedSqlStatementId]);
    const openLoadDialog = useCallback((tab: 'widget' | 'sql') => {
        setLoadDialogType(tab);
        setLoadDialogSearch('');
        setSelectedLoadWidgetId(activeWidgetId || '');
        setSelectedLoadSqlId(selectedSqlStatementId || '');
        setIsLoadDialogOpen(true);
    }, [activeWidgetId, selectedSqlStatementId]);
    const openWidgetWithUnsavedGuard = useCallback(async (widget: SavedWidget, closeLoadDialog = false) => {
        const canContinue = await confirmSaveOrDiscardBeforeContinue();
        if (!canContinue) return false;
        setSourceSelectTab('widget');
        setWorkspaceTab('editor');
        await loadWidget(widget, true);
        if (closeLoadDialog) setIsLoadDialogOpen(false);
        return true;
    }, [confirmSaveOrDiscardBeforeContinue, loadWidget, setWorkspaceTab]);
    const applyLoadSelection = async () => {
        if (loadDialogType === 'widget') {
            if (!selectedLoadWidgetId) return;
            const nextWidget = savedWidgetsById.get(selectedLoadWidgetId);
            if (!nextWidget) return;
            await openWidgetWithUnsavedGuard(nextWidget, true);
            return;
        }
        if (!selectedLoadSqlId) return;
        const nextStatement = sqlStatementsById.get(selectedLoadSqlId);
        if (!nextStatement) return;
        // Switching SQL should not trigger the save/discard guard for the current widget.
        // Keep the source mode explicit as SQL/query for subsequent selections.
        bypassUnsavedGuardRef.current = true;
        try {
            setSourceSelectTab('query');
            applySqlStatementSource(nextStatement);
            let runError = '';
            const finalExecuted = await handleRun(nextStatement.sql_text, {
                onError: (message) => { runError = message; }
            });
            if (finalExecuted) {
                setPreviewTab('table');
            } else {
                const resolvedRunError = runError && runError.trim().length > 0 ? runError : WIDGET_RUN_ERR_UNKNOWN;
                setError(resolvedRunError);
                await appDialog.error(
                    `${t(
                        'querybuilder.sql_statement_execute_failed_after_select',
                        'Das ausgewaehlte SQL-Statement konnte nicht ausgefuehrt werden. Bitte pruefe Syntax und Datenquelle.'
                    )}\n\n${resolvedRunError}`
                );
                setPreviewTab('sql');
            }
            setIsLoadDialogOpen(false);
        } finally {
            bypassUnsavedGuardRef.current = false;
        }
    };
    const handleToggleLoadItemPin = useCallback(async (id: string) => {
        if (loadDialogType === 'widget') {
            setPinnedWidgetIds((current) => {
                if (current.includes(id)) return current.filter((entry) => entry !== id);
                return [...current, id];
            });
            return;
        }
        const current = sqlStatementsById.get(id);
        if (!current) return;
        await SystemRepository.setSqlStatementFavorite(id, Number(current.is_favorite) !== 1);
        refreshSqlStatements();
    }, [loadDialogType, refreshSqlStatements, setPinnedWidgetIds, sqlStatementsById]);
    const formatTimestamp = useCallback((raw?: string | null) => {
        if (!raw) return '-';
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US');
    }, [i18n.language]);
    const loadDialogItems = useMemo(() => {
        if (loadDialogType === 'widget') {
            return sortedFilteredLoadWidgets.map((w) => ({
                id: w.id,
                title: w.name,
                subtitle: (w.sql_query || '').trim() || '-',
                description: (w.description || '').trim() || '',
                meta: [
                    { label: t('querybuilder.widget_id', 'Widget-ID'), value: w.id },
                    {
                        label: t('datainspector.last_saved_at', 'Letzte Speicherung'),
                        value: formatTimestamp(localWidgetSavedAtById[w.id] || w.updated_at || w.created_at)
                    }
                ]
            }));
        }
        return sortedFilteredLoadSqlStatements.map((stmt) => ({
            id: stmt.id,
            title: stmt.name,
            subtitle: stmt.sql_text,
            description: (stmt.description || '').trim() || '',
            meta: [
                { label: t('querybuilder.sql_statement_id', 'SQL-Statement-ID'), value: stmt.id },
                { label: t('datainspector.last_saved_at', 'Letzte Speicherung'), value: formatTimestamp(stmt.updated_at || stmt.created_at) }
            ]
        }));
    }, [formatTimestamp, loadDialogType, localWidgetSavedAtById, sortedFilteredLoadSqlStatements, sortedFilteredLoadWidgets, t]);
    const selectedLoadId = loadDialogType === 'widget' ? selectedLoadWidgetId : selectedLoadSqlId;
    const loadDialogTitle = loadDialogType === 'widget'
        ? t('querybuilder.open_widget_title', 'Widget öffnen')
        : t('querybuilder.open_sql_statement_title', 'SQL-Statement öffnen');
    const loadDialogEmptyLabel = loadDialogType === 'widget'
        ? t('querybuilder.no_saved_reports_filtered', 'No matching widgets found.')
        : t('querybuilder.no_sql_statements', 'No SQL statements found.');
    const loadDialogSortOptions = useMemo(() => ([
        { value: 'updated_desc', label: t('querybuilder.manage_sort_updated_desc', 'Zuletzt geändert (neu zuerst)') },
        { value: 'updated_asc', label: t('querybuilder.manage_sort_updated_asc', 'Zuletzt geändert (alt zuerst)') },
        { value: 'name_asc', label: t('querybuilder.manage_sort_name_asc', 'Name (A-Z)') },
        { value: 'name_desc', label: t('querybuilder.manage_sort_name_desc', 'Name (Z-A)') },
        { value: 'pinned_first', label: t('querybuilder.load_sort_pinned_first', 'Angepinnt zuerst') }
    ]), [t]);
    const handleDeleteWidget = useCallback(async (widget: SavedWidget) => {
        const usageInfo = dashboardUsageByWidgetId.get(widget.id);
        const dependencyHint = usageInfo && usageInfo.count > 0
            ? t('querybuilder.delete_widget_with_dashboard_dependency', {
                count: usageInfo.count,
                defaultValue: 'Dieses Widget wird aktuell in {{count}} Dashboard(s) verwendet. Beim Löschen wird es aus diesen Dashboards entfernt.'
            })
            : t('querybuilder.delete_widget_without_dependency', 'Dieses Widget wird aktuell in keinem Dashboard verwendet.');

        const confirmDelete = await appDialog.confirm(
            `${t('querybuilder.confirm_delete_widget', {
                name: widget.name,
                defaultValue: `Widget "${widget.name}" löschen?`
            })}\n\n${dependencyHint}`,
            { title: t('common.confirm_title', 'Sind Sie sicher?') }
        );
        if (!confirmDelete) return;
        await SystemRepository.deleteUserWidget(widget.id);
        setWidgetSqlDraftById((prev) => {
            if (!Object.prototype.hasOwnProperty.call(prev, widget.id)) return prev;
            const next = { ...prev };
            delete next[widget.id];
            return next;
        });
        setWidgetSqlStatementDraftById((prev) => {
            if (!Object.prototype.hasOwnProperty.call(prev, widget.id)) return prev;
            const next = { ...prev };
            delete next[widget.id];
            return next;
        });
        refreshWidgets();
        if (activeWidgetId === widget.id) {
            setActiveWidgetId(null);
            setLastOpenWidgetId('');
            setWidgetName('');
            setSavedSnapshot('');
        }
    }, [activeWidgetId, dashboardUsageByWidgetId, refreshWidgets, setLastOpenWidgetId, setWidgetSqlDraftById, setWidgetSqlStatementDraftById, t]);
    const handleToggleWidgetFavorite = useCallback((widgetId: string) => {
        setPinnedWidgetIds((current) => {
            if (current.includes(widgetId)) return current.filter((entry) => entry !== widgetId);
            return [...current, widgetId];
        });
    }, [setPinnedWidgetIds]);
    const handleRenameWidget = useCallback(async (widget: SavedWidget) => {
        const prompted = await appDialog.prompt2(
            t('common.name', 'Name'),
            t('common.description', 'Beschreibung'),
            {
                title: t('querybuilder.manage_action_rename', 'Umbenennen'),
                defaultValue: widget.name,
                secondDefaultValue: (widget.description || '').trim(),
                placeholder: t('querybuilder.archive_placeholder', 'z.B. Meine SQL Vorlage')
            }
        );
        if (!prompted) return;
        const nextName = prompted.value.trim();
        if (!nextName) return;
        const nextDescription = prompted.secondValue.trim();
        await SystemRepository.saveUserWidget({
            id: widget.id,
            name: nextName,
            description: nextDescription,
            sql_statement_id: widget.sql_statement_id || null,
            sql_query: widget.sql_query || '',
            visualization_config: parseMaybeJson(widget.visualization_config),
            visual_builder_config: parseMaybeJson(widget.visual_builder_config)
        });
        refreshWidgets();
        await appDialog.info(
            t('querybuilder.manage_rename_success', {
                name: nextName,
                defaultValue: `Widget "${nextName}" wurde umbenannt.`
            })
        );
    }, [refreshWidgets, t]);
    const handleDuplicateWidget = useCallback(async (widget: SavedWidget) => {
        const defaultCopyName = `${widget.name} ${t('querybuilder.copy_suffix', '(Kopie)')}`.trim();
        const prompted = await appDialog.prompt2(
            t('common.name', 'Name'),
            t('common.description', 'Beschreibung'),
            {
                title: t('querybuilder.manage_action_duplicate', 'Duplizieren'),
                defaultValue: defaultCopyName,
                secondDefaultValue: (widget.description || '').trim(),
                placeholder: t('querybuilder.archive_placeholder', 'z.B. Meine SQL Vorlage')
            }
        );
        if (!prompted) return;
        const nextName = prompted.value.trim();
        if (!nextName) return;
        const nextDescription = prompted.secondValue.trim();
        await SystemRepository.saveUserWidget({
            id: crypto.randomUUID(),
            name: nextName,
            description: nextDescription,
            sql_statement_id: widget.sql_statement_id || null,
            sql_query: widget.sql_query || '',
            visualization_config: parseMaybeJson(widget.visualization_config),
            visual_builder_config: parseMaybeJson(widget.visual_builder_config)
        });
        refreshWidgets();
        await appDialog.info(
            t('querybuilder.manage_duplicate_success', {
                name: nextName,
                defaultValue: `Widget "${nextName}" wurde als Kopie erstellt.`
            })
        );
    }, [refreshWidgets, t]);
    const previewTypeMeta = useMemo(() => {
        const iconClass = 'w-5 h-5';
        switch (previewVisType) {
            case 'table':
                return { icon: <TableIcon className={iconClass} />, label: t('querybuilder.table') };
            case 'bar':
                return { icon: <BarChart2 className={iconClass} />, label: t('querybuilder.bar') };
            case 'stacked_bar':
                return { icon: <BarChart2 className={iconClass} />, label: t('querybuilder.stacked_bar', 'Stacked Bar') };
            case 'stacked_bar_100':
                return { icon: <BarChart2 className={iconClass} />, label: t('querybuilder.stacked_bar_100', '100% Stacked Bar') };
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
            case 'gauge':
                return { icon: <Gauge className={iconClass} />, label: t('querybuilder.gauge', 'Gauge') };
            case 'image':
                return { icon: <ImageIcon className={iconClass} />, label: t('querybuilder.image', 'Image') };
            default:
                return { icon: <Layout className={iconClass} />, label: previewVisType.toUpperCase() };
        }
    }, [previewVisType, t]);
    const liveWidgetLabel = (widgetName || '').trim();
    const activeWidgetLabel = liveWidgetLabel
        || (isHeaderHydrating ? (cachedHeaderName || '').trim() : '')
        || t('common.untitled', 'Unbenannt');
    const showHeaderDirty = !isHeaderHydrating && hasUnsavedChanges;
    const activeWidgetRecord = useMemo(
        () => (activeWidgetId ? (savedWidgetsById.get(activeWidgetId) || null) : null),
        [activeWidgetId, savedWidgetsById]
    );
    const activeWidgetDbId = activeWidgetId || '-';
    const activeSqlStatementDbId = selectedSqlStatementId || '-';
    const activeWidgetLastSaved = useMemo(() => {
        const raw = (activeWidgetId ? localWidgetSavedAtById[activeWidgetId] : undefined) || activeWidgetRecord?.updated_at || activeWidgetRecord?.created_at;
        if (!raw) return '-';
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US');
    }, [activeWidgetId, activeWidgetRecord?.created_at, activeWidgetRecord?.updated_at, i18n.language, localWidgetSavedAtById]);
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
                if (!hasSelectedSqlStatement) return;
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
        if (guidedStep === 4 && canSaveCurrentWidget) {
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
        if (isHeaderHydrating) return;
        const label = (widgetName || '').trim();
        if (label) {
            setCachedHeaderName(label);
        }
        setCachedHeaderWidgetId(activeWidgetId || '');
        setCachedHeaderDirty(hasUnsavedChanges);
    }, [activeWidgetId, hasUnsavedChanges, isHeaderHydrating, setCachedHeaderDirty, setCachedHeaderName, setCachedHeaderWidgetId, widgetName]);

    useEffect(() => {
        if (!pendingBaselineSync) return;
        if (loading) return;
        const timer = window.setTimeout(() => {
            const pendingBaseline = pendingBaselineSnapshotRef.current;
            setSavedSnapshot(pendingBaseline ?? currentSnapshot);
            pendingBaselineSnapshotRef.current = null;
            setPendingBaselineSync(false);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [pendingBaselineSync, loading, currentSnapshot]);

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
                if (canSaveCurrentWidget) {
                    void handleSaveWidget('update');
                }
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [loading, canSaveCurrentWidget, handleRun, handleSaveWidget]);

    const handleGlobalRefresh = useCallback(async () => {
        if (workspaceTab === 'editor') {
            if (loading || !hasSelectedSqlStatement || !sql.trim()) return;
            await handleRun();
            return;
        }
        if (isGlobalRefreshing) return;
        setIsGlobalRefreshing(true);
        try {
            await Promise.all([refreshWidgets(), refreshSqlStatements()]);
        } finally {
            setIsGlobalRefreshing(false);
        }
    }, [workspaceTab, loading, hasSelectedSqlStatement, sql, handleRun, isGlobalRefreshing, refreshWidgets, refreshSqlStatements]);

    return (
        <PageLayout
            header={{
                title: t('sidebar.query_builder'),
                subtitle: t('querybuilder.subtitle'),
                refresh: {
                    onClick: () => { void handleGlobalRefresh(); },
                    title: t('querybuilder.refresh_data', 'Aktualisieren'),
                    disabled: workspaceTab === 'editor'
                        ? (loading || !hasSelectedSqlStatement || !sql.trim())
                        : isGlobalRefreshing,
                    loading: loading || isGlobalRefreshing
                },
                presentation: {
                    onClick: togglePresentationMode,
                    title: t('dashboard.presentation_mode')
                },
                export: {
                    onPdfExport: () => exportToPdf('query-visualization', `report-${widgetName || 'query'}`),
                    disabled: exportDisabled,
                    loading: isExporting,
                    title: exportDisabled ? exportDisabledReason : t('querybuilder.hint_export_shortcut'),
                    pdfTitle: exportDisabled ? exportDisabledReason : t('querybuilder.hint_export_shortcut')
                }
            }}
            rightPanel={{
                title: t('querybuilder.config_panel_title', 'Widget-Konfiguration'),
                content: null,
                enabled: workspaceTab === 'editor',
                isOpen: isConfigPanelOpen,
                onOpenChange: (open) => {
                    if (open) {
                        openConfigPanel();
                        return;
                    }
                    setIsConfigPanelOpen(false);
                },
                triggerTitle: t('querybuilder.open_config_panel', 'Konfiguration öffnen')
            }}
            fillHeight
        >
            <div className="flex flex-col gap-4 h-full min-h-0">
                <div className="border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-6 px-1 overflow-x-auto whitespace-nowrap no-scrollbar">
                    <button
                        type="button"
                        onClick={() => {
                            setWorkspaceTab('manage');
                            setIsConfigPanelOpen(false);
                        }}
                        className={`relative py-3 text-sm font-bold transition-colors ${workspaceTab === 'manage'
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                        {t('querybuilder.workspace_tab_manage', 'Widgets verwalten')}
                        {workspaceTab === 'manage' && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-blue-600 dark:bg-blue-400" />}
                    </button>
                    <button
                        type="button"
                        onClick={() => setWorkspaceTab('editor')}
                        className={`relative py-3 text-sm font-bold transition-colors ${workspaceTab === 'editor'
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                        {t('querybuilder.workspace_tab_editor', 'Widget erstellen')}
                        {workspaceTab === 'editor' && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-blue-600 dark:bg-blue-400" />}
                    </button>
                    </div>
                </div>
                {workspaceTab === 'editor' ? (
                <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-0 overflow-hidden relative">
                    <RightOverlayPanel
                        isOpen={isConfigPanelOpen}
                        onClose={() => setIsConfigPanelOpen(false)}
                        title={t('querybuilder.config_panel_title', 'Widget-Konfiguration')}
                        width="md"
                        noScroll
                        backdropStyle="subtle"
                        contentClassName="p-2"
                    >
                        <div className="flex flex-col h-full min-h-0 overflow-hidden">
                            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-2">
                                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/30 space-y-3 animate-in slide-in-from-right-4 duration-300">
                                    <h3 className="text-xs font-black uppercase text-slate-400 flex items-center gap-2"><Layout className="w-3.5 h-3.5 text-blue-500" />{t('querybuilder.graph_type')}</h3>
                                    <div className="grid grid-cols-3 gap-2">
                                            {(hasSelectedSqlStatement ? QUERY_VIS_OPTIONS : CONTENT_VIS_OPTIONS).map(type => (
                                                <button key={type.id} onClick={() => setVisType(type.id)} className={`p-2 rounded-lg flex flex-col items-center justify-center gap-1 border transition-all ${visType === type.id ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 text-blue-600 shadow-sm' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300'}`}>
                                                    <type.icon className="w-4 h-4" />
                                                    <span className="text-[9px] uppercase font-black">{t(type.labelKey, type.fallback)}</span>
                                                </button>
                                            ))}
                                    </div>
                                    {!hasSelectedSqlStatement && (
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
                                            {visType !== 'gauge' && (
                                                <div>
                                                    <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{t('querybuilder.x_axis')}</label>
                                                    <select value={visConfig.xAxis || ''} onChange={e => setVisConfig({ ...visConfig, xAxis: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none">
                                                        <option value="">{t('querybuilder.select_column')}</option>
                                                        {(visType === 'scatter' ? numericColumns : resultColumns).map(col => <option key={col} value={col}>{col}</option>)}
                                                    </select>
                                                </div>
                                            )}
                                            <div>
                                                <label className="block text-left text-[10px] font-black uppercase text-slate-400 mb-1">{visType === 'gauge' ? t('querybuilder.value', 'Wert') : t('querybuilder.y_axes')}</label>
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
                                                <select onChange={e => { if (!e.target.value) return; setVisConfig({ ...visConfig, yAxes: visType === 'gauge' ? [e.target.value] : [...(visConfig.yAxes || []), e.target.value] }); e.target.value = ''; }} className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none">
                                                    <option value="">{visType === 'gauge' ? t('querybuilder.select_column') : t('querybuilder.add_y_axis')}</option>
                                                    {(visType === 'scatter' || visType === 'gauge' ? numericColumns : resultColumns).filter(c => (visType === 'gauge' ? true : !(visConfig.yAxes || []).includes(c))).map(col => <option key={col} value={col}>{col}</option>)}
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
                    </RightOverlayPanel>

                    {/* Preview Area */}
                    <div id="query-visualization" className="w-full min-w-0 flex-1 min-h-0 bg-white dark:bg-[#0b1220] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col relative">
                        <div className="border-b border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-gradient-to-r dark:from-slate-800/95 dark:to-slate-800/85">
                            <div className="p-3 flex items-center justify-between gap-2">
                                <h3 className="text-sm text-slate-800 dark:text-slate-100 truncate">
                                    <span className="font-bold">Widget</span>
                                    <span className="font-normal"> - {activeWidgetLabel}</span>
                                    {showHeaderDirty && <span className="font-normal"> *</span>}
                                </h3>
                                {previewWidgetDescription && (
                                    <p
                                        className="max-w-[55%] text-[11px] text-slate-500 dark:text-slate-400 truncate text-right"
                                        title={previewWidgetDescription}
                                    >
                                        {previewWidgetDescription}
                                    </p>
                                )}
                            </div>
                            <div className="px-3 pb-2 border-t border-slate-300 dark:border-slate-600/90">
                                <div className="pt-2 flex items-center justify-between gap-2">
                                    <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto whitespace-nowrap pr-1">
                                        <Button
                                            type="button"
                                            onClick={() => { void resetToNewWidget(); }}
                                            variant="ghost"
                                            size="sm"
                                            title={t('querybuilder.new_widget', 'Neues Widget')}
                                        >
                                            <Plus className="w-3 h-3" />
                                            <span className="hidden xl:inline">{t('common.new', 'Neu')}</span>
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={() => { void openLoadDialog('widget'); }}
                                            title={t('common.open', 'Öffnen')}
                                            variant="ghost"
                                            size="sm"
                                        >
                                            <Folder className="w-3 h-3" />
                                            <span className="hidden xl:inline">{t('common.open', 'Öffnen')}</span>
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={() => { void handleSaveWidget(activeWidgetId ? 'update' : 'new'); }}
                                            disabled={!canSaveCurrentWidget}
                                            title={t('common.save', 'Speichern')}
                                            variant="ghost"
                                            size="sm"
                                        >
                                            <Save className="w-3 h-3" />
                                            <span className="hidden xl:inline">{t('common.save', 'Speichern')}</span>
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={() => { void handleSaveWidget('new'); }}
                                            disabled={isReadOnly || !canPersistWidget}
                                            title={t('querybuilder.save_widget_as', 'Speichern unter')}
                                            variant="ghost"
                                            size="sm"
                                        >
                                            <Download className="w-3 h-3" />
                                            <span className="hidden xl:inline">{t('querybuilder.save_widget_as', 'Speichern unter')}</span>
                                        </Button>
                                        <div className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
                                        <Button
                                            type="button"
                                            onClick={() => { void openLoadDialog('sql'); }}
                                            title={t('querybuilder.sql_statement', 'SQL-Statement')}
                                            variant="ghost"
                                            size="sm"
                                        >
                                            <FileCode2 className="w-3 h-3" />
                                            <span className="hidden xl:inline">{t('querybuilder.sql_statement', 'SQL-Statement')}</span>
                                        </Button>
                                        <div className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
                                        <Button
                                            type="button"
                                            onClick={openConfigPanel}
                                            variant="toggle"
                                            size="sm"
                                            active={isConfigPanelOpen}
                                            title={t('querybuilder.open_config_panel', 'Konfiguration öffnen')}
                                        >
                                            <SlidersHorizontal className="w-3 h-3" />
                                            <span className="hidden xl:inline">{t('querybuilder.tab_config', 'Konfiguration')}</span>
                                        </Button>
                                    </div>
                                    <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto whitespace-nowrap pl-1">
                                        <Button
                                            type="button"
                                            onClick={() => setPreviewTab('graphic')}
                                            title={t('querybuilder.preview_tab_graphic', 'Grafisch')}
                                            variant="toggle"
                                            size="sm"
                                            active={previewTab === 'graphic'}
                                        >
                                            <BarChart2 className="w-3 h-3" />
                                            <span className="hidden xl:inline">{t('querybuilder.preview_tab_graphic', 'Grafisch')}</span>
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={() => { if (!isContentWidget) setPreviewTab('table'); }}
                                            disabled={isContentWidget}
                                            title={isContentWidget ? t('common.not_available', 'Not available') : t('querybuilder.preview_tab_table', 'Tabelle')}
                                            variant="toggle"
                                            size="sm"
                                            active={previewTab === 'table'}
                                        >
                                            <TableIcon className="w-3 h-3" />
                                            <span className="hidden xl:inline">{t('querybuilder.preview_tab_table', 'Tabelle')}</span>
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={() => { if (!isContentWidget) setPreviewTab('sql'); }}
                                            disabled={isContentWidget}
                                            title={isContentWidget ? t('common.not_available', 'Not available') : t('querybuilder.preview_tab_sql', 'SQL')}
                                            variant="toggle"
                                            size="sm"
                                            active={previewTab === 'sql'}
                                        >
                                            <FileCode2 className="w-3 h-3" />
                                            <span className="hidden xl:inline">{t('querybuilder.preview_tab_sql', 'SQL')}</span>
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div
                            className={
                                previewTab === 'sql'
                                    ? 'flex-1 min-h-0 flex flex-col overflow-hidden p-0'
                                    : previewTab === 'graphic'
                                        ? 'flex-1 min-h-0 flex flex-col overflow-auto p-4 container-scrollbar'
                                        : 'flex-1 min-h-0 flex flex-col overflow-auto p-4 container-scrollbar'
                            }
                        >
                            {previewTab === 'graphic' ? (
                                <div className="relative h-full flex flex-col">
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
                                                        <div className="h-[260px] w-full rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400">
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
                                ) : error ? (
                                    <div className="h-full min-h-[260px] flex items-center justify-center p-6">
                                        <div className="max-w-xl w-full rounded-xl border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 text-rose-900 dark:text-rose-100 px-4 py-4">
                                            <div className="text-xs font-black uppercase tracking-wide text-rose-700 dark:text-rose-300">{t('common.error', 'Fehler')}</div>
                                            <p className="text-sm font-semibold mt-1">{t('querybuilder.sql_execution_failed', 'SQL-Ausfuehrung fehlgeschlagen')}</p>
                                            <p className="text-xs mt-2 whitespace-pre-wrap break-words">{error}</p>
                                        </div>
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
                                    })() : previewVisType === 'gauge' ? (() => {
                                        const firstRow = results[0];
                                        const rowKeys = Object.keys(firstRow);
                                        const preferredMetricKey = (visConfig.yAxes || [])[0] || visConfig.yAxis || '';
                                        const metricKey = rowKeys.includes(preferredMetricKey)
                                            ? preferredMetricKey
                                            : (rowKeys.find((key) => {
                                                const raw = firstRow[key];
                                                if (typeof raw === 'number') return Number.isFinite(raw);
                                                if (typeof raw === 'string') {
                                                    const normalized = raw.replace(/\s+/g, '').replace(',', '.').replace(/[^0-9.+-]/g, '');
                                                    return Number.isFinite(Number(normalized));
                                                }
                                                return false;
                                            }) || rowKeys[0]);
                                        const parseNumericValue = (raw: unknown): number => {
                                            if (typeof raw === 'number') return raw;
                                            if (typeof raw === 'string') {
                                                const normalized = raw.replace(/\s+/g, '').replace(',', '.').replace(/[^0-9.+-]/g, '');
                                                return Number(normalized);
                                            }
                                            return Number.NaN;
                                        };
                                        const value = parseNumericValue(firstRow[metricKey]);
                                        const metricValues = results
                                            .map((row) => parseNumericValue(row[metricKey]))
                                            .filter((num) => Number.isFinite(num));
                                        const minValue = Math.min(0, ...(metricValues.length ? metricValues : [0]));
                                        const maxBase = Math.max(...(metricValues.length ? metricValues : [100]), 100);
                                        const maxValue = maxBase <= minValue ? minValue + 1 : maxBase;
                                        const clamped = Math.min(maxValue, Math.max(minValue, Number.isFinite(value) ? value : minValue));
                                        const percent = ((clamped - minValue) / (maxValue - minValue)) * 100;
                                        return (
                                            <div className="flex-1 flex flex-col items-center justify-center p-4">
                                                <div className="w-full h-full max-w-[420px] min-h-[280px]">
                                                    <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={260}>
                                                        <RadialBarChart
                                                            cx="50%"
                                                            cy="72%"
                                                            innerRadius="62%"
                                                            outerRadius="100%"
                                                            barSize={22}
                                                            data={[{ value: Number.isFinite(percent) ? percent : 0, fill: visConfig.color || COLORS[0] }]}
                                                            startAngle={180}
                                                            endAngle={0}
                                                        >
                                                            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                                                            <RadialBar dataKey="value" cornerRadius={12} background />
                                                        </RadialBarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                                <div className="mt-[-4.5rem] flex flex-col items-center">
                                                    <div className="text-3xl lg:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
                                                        {Number.isFinite(value) ? formatValue(value, metricKey) : '-'}
                                                    </div>
                                                    {(visConfig.kpiUnit || '').trim() && (
                                                        <div className="text-sm font-bold text-slate-500 dark:text-slate-400">{visConfig.kpiUnit}</div>
                                                    )}
                                                    <div className="mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">{metricKey}</div>
                                                    <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                                                        {formatValue(minValue, metricKey)} - {formatValue(maxValue, metricKey)}
                                                    </div>
                                                </div>
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
                                            ) : previewVisType === 'stacked_bar' ? (
                                                <BarChart data={results}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey={visConfig.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} tickFormatter={val => formatValue(val, (visConfig.yAxes || [])[0])} />
                                                    <Tooltip contentStyle={previewTooltipContentStyle} labelStyle={previewTooltipLabelStyle} itemStyle={previewTooltipItemStyle} cursor={previewTooltipCursor} formatter={(val, name) => [formatValue(val, name as string), name]} />
                                                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                    {(visConfig.yAxes || []).map((y, idx) => (
                                                        <Bar key={y} dataKey={y} stackId="stacked" fill={idx === 0 ? (visConfig.color || COLORS[0]) : COLORS[idx % COLORS.length]}>
                                                            {visConfig.showLabels && <LabelList dataKey={y} position="center" style={{ fontSize: '10px', fontWeight: 'bold', fill: '#e2e8f0' }} formatter={val => formatValue(val, y)} />}
                                                        </Bar>
                                                    ))}
                                                </BarChart>
                                            ) : previewVisType === 'stacked_bar_100' ? (
                                                <BarChart data={stackedBar100Data}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey={visConfig.xAxis} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} domain={[0, 100]} tickFormatter={(val) => `${Number(val).toFixed(0)}%`} />
                                                    <Tooltip
                                                        contentStyle={previewTooltipContentStyle}
                                                        labelStyle={previewTooltipLabelStyle}
                                                        itemStyle={previewTooltipItemStyle}
                                                        cursor={previewTooltipCursor}
                                                        formatter={(val, name) => [`${Number(val).toFixed(2)}%`, name]}
                                                    />
                                                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                    {(visConfig.yAxes || []).map((y, idx) => (
                                                        <Bar key={y} dataKey={y} stackId="stacked100" fill={idx === 0 ? (visConfig.color || COLORS[0]) : COLORS[idx % COLORS.length]}>
                                                            {visConfig.showLabels && <LabelList dataKey={y} position="center" style={{ fontSize: '10px', fontWeight: 'bold', fill: '#e2e8f0' }} formatter={(val: unknown) => `${Number(val).toFixed(0)}%`} />}
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
                                ) : error ? (
                                    <div className="h-full min-h-[260px] flex items-center justify-center p-6">
                                        <div className="max-w-xl w-full rounded-xl border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 text-rose-900 dark:text-rose-100 px-4 py-4">
                                            <div className="text-xs font-black uppercase tracking-wide text-rose-700 dark:text-rose-300">{t('common.error', 'Fehler')}</div>
                                            <p className="text-sm font-semibold mt-1">{t('querybuilder.sql_execution_failed', 'SQL-Ausfuehrung fehlgeschlagen')}</p>
                                            <p className="text-xs mt-2 whitespace-pre-wrap break-words">{error}</p>
                                        </div>
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
                                                    highlightActiveLine: sqlEditorHighlightActiveLine,
                                                    highlightActiveLineGutter: sqlEditorLineNumbers && sqlEditorHighlightActiveLine
                                                }}
                                                extensions={sqlPreviewExtensions}
                                            />
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                        <div className="px-3 py-2 border-t border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800/90">
                            <div className="flex items-end justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
                                    <span className="inline-flex items-center gap-1">
                                        <span className="font-semibold uppercase tracking-wide">{t('querybuilder.widget_id', 'Widget-ID')}:</span>
                                        <code className="font-mono text-[10px]" title={activeWidgetDbId}>{activeWidgetDbId}</code>
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <span className="font-semibold uppercase tracking-wide">{t('querybuilder.sql_statement_id', 'SQL-Statement-ID')}:</span>
                                        <code className="font-mono text-[10px]" title={activeSqlStatementDbId}>{activeSqlStatementDbId}</code>
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <span className="font-semibold uppercase tracking-wide">{t('querybuilder.widget_chart_type', 'Diagrammtyp')}:</span>
                                        <code className="font-mono text-[10px]" title={previewTypeMeta.label}>{previewTypeMeta.label}</code>
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <span className="font-semibold uppercase tracking-wide">{t('datainspector.last_saved_at', 'Letzte Speicherung')}:</span>
                                        <code className="font-mono text-[10px]" title={activeWidgetLastSaved}>{activeWidgetLastSaved}</code>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                ) : (
                    <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent shadow-sm">
                        <div className="h-full min-h-0 flex flex-col">
                            <div className="shrink-0 border-b border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-gradient-to-r dark:from-slate-800/95 dark:to-slate-800/85">
                                <div className="p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="relative w-full max-w-sm">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                            <input
                                                value={manageSearch}
                                                onChange={(e) => setManageSearch(e.target.value)}
                                                placeholder={t('common.search', 'Suchen...')}
                                                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div className="inline-flex items-center gap-2 shrink-0">
                                            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                {t('querybuilder.manage_sort_label', 'Sortierung')}
                                            </label>
                                            <select
                                                value={manageSort}
                                                onChange={(e) => setManageSort(e.target.value as 'name_asc' | 'name_desc' | 'updated_desc' | 'updated_asc' | 'usage_desc' | 'favorite_then_updated')}
                                                className="h-8 min-w-[180px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                                title={t('querybuilder.manage_sort_label', 'Sortierung')}
                                            >
                                                <option value="favorite_then_updated">{t('querybuilder.manage_sort_favorite_then_updated', 'Favoriten zuerst')}</option>
                                                <option value="updated_desc">{t('querybuilder.manage_sort_updated_desc', 'Zuletzt geändert (neu zuerst)')}</option>
                                                <option value="updated_asc">{t('querybuilder.manage_sort_updated_asc', 'Zuletzt geändert (alt zuerst)')}</option>
                                                <option value="name_asc">{t('querybuilder.manage_sort_name_asc', 'Name (A-Z)')}</option>
                                                <option value="name_desc">{t('querybuilder.manage_sort_name_desc', 'Name (Z-A)')}</option>
                                                <option value="usage_desc">{t('querybuilder.manage_sort_usage_desc', 'Nutzung (häufig zuerst)')}</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 container-scrollbar">
                                {sortedManageWidgets.length === 0 ? (
                                    <div className="h-full min-h-[240px] flex items-center justify-center text-xs text-slate-500">
                                        {t('querybuilder.manage_widgets_empty', 'Keine Widgets gefunden.')}
                                    </div>
                                ) : (
                                    sortedManageWidgets.map((widget) => {
                                        const isDataDriven = Boolean((widget.sql_statement_id || '').trim() || (widget.sql_query || '').trim());
                                        return (
                                        <div
                                            key={widget.id}
                                            className={`rounded-lg border px-3 py-2 flex items-start justify-between gap-3 ${
                                                dashboardUsageByWidgetId.has(widget.id)
                                                    ? 'border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20'
                                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                                            }`}
                                        >
                                             <button
                                                 type="button"
                                                 onClick={() => { void openWidgetWithUnsavedGuard(widget); }}
                                                 className="min-w-0 text-left"
                                             >
                                                 <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate flex items-center gap-2">
                                                      {widget.name}
                                                      {isWidgetPinned(widget.id) && <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />}
                                                      <span
                                                          className={`inline-flex items-center justify-center h-5 w-5 rounded-md border ${
                                                              isDataDriven
                                                                  ? 'border-cyan-200 dark:border-cyan-800 bg-cyan-100/70 dark:bg-cyan-900/35 text-cyan-700 dark:text-cyan-200'
                                                                  : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                                          }`}
                                                          title={isDataDriven
                                                              ? t('querybuilder.badge_data_driven_tooltip', 'Datengetrieben (mit SQL-Statement)')
                                                              : t('querybuilder.badge_not_data_driven_tooltip', 'Ohne Daten (kein SQL-Statement)')}
                                                          aria-label={isDataDriven
                                                              ? t('querybuilder.badge_data_driven_tooltip', 'Datengetrieben (mit SQL-Statement)')
                                                              : t('querybuilder.badge_not_data_driven_tooltip', 'Ohne Daten (kein SQL-Statement)')}
                                                      >
                                                          {isDataDriven ? <Database className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                                                      </span>
                                                      {dashboardUsageByWidgetId.has(widget.id) && (
                                                          <span
                                                              className="inline-flex items-center rounded-md border border-blue-200 dark:border-blue-800 bg-blue-100/70 dark:bg-blue-900/40 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-200"
                                                              title={dashboardUsageByWidgetId.get(widget.id)?.dashboards.join(', ')}
                                                          >
                                                            {(dashboardUsageByWidgetId.get(widget.id)?.count || 0) === 1
                                                                ? t('querybuilder.manage_widget_usage_single', 'In 1 Dashboard')
                                                                : t('querybuilder.manage_widget_usage_multi', {
                                                                    count: dashboardUsageByWidgetId.get(widget.id)?.count || 0,
                                                                    defaultValue: `In ${(dashboardUsageByWidgetId.get(widget.id)?.count || 0)} Dashboards`
                                                                })}
                                                        </span>
                                                     )}
                                                 </div>
                                                 <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                     {(widget.description || '').trim() || (widget.sql_query || '').trim() || '-'}
                                                 </div>
                                                 <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">
                                                     {(widget.sql_query || '').trim() || '-'}
                                                 </div>
                                                 <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400 dark:text-slate-500">
                                                     <span className="inline-flex items-center gap-1">
                                                         <span className="font-semibold uppercase tracking-wide">{t('querybuilder.widget_id', 'Widget-ID')}:</span>
                                                         <code className="font-mono text-[10px]" title={widget.id}>{widget.id}</code>
                                                     </span>
                                                     <span className="inline-flex items-center gap-1">
                                                         <span className="font-semibold uppercase tracking-wide">{t('querybuilder.sql_statement_id', 'SQL-Statement-ID')}:</span>
                                                         <code className="font-mono text-[10px]" title={widget.sql_statement_id || '-'}>{widget.sql_statement_id || '-'}</code>
                                                     </span>
                                                     <span className="inline-flex items-center gap-1">
                                                         <span className="font-semibold uppercase tracking-wide">{t('datainspector.last_saved_at', 'Letzte Speicherung')}:</span>
                                                         <code className="font-mono text-[10px]">{formatTimestamp(localWidgetSavedAtById[widget.id] || widget.updated_at || widget.created_at)}</code>
                                                     </span>
                                                 </div>
                                             </button>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => { void openWidgetWithUnsavedGuard(widget); }}
                                                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                    title={t('common.open', 'Öffnen')}
                                                    aria-label={t('common.open', 'Öffnen')}
                                                >
                                                    <FolderOpen className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { void handleDuplicateWidget(widget); }}
                                                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                                                    title={t('querybuilder.manage_action_duplicate', 'Duplizieren')}
                                                    aria-label={t('querybuilder.manage_action_duplicate', 'Duplizieren')}
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleWidgetFavorite(widget.id)}
                                                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                                    title={isWidgetPinned(widget.id) ? t('querybuilder.unpin_widget', 'Favorit entfernen') : t('querybuilder.pin_widget', 'Als Favorit markieren')}
                                                    aria-label={isWidgetPinned(widget.id) ? t('querybuilder.unpin_widget', 'Favorit entfernen') : t('querybuilder.pin_widget', 'Als Favorit markieren')}
                                                >
                                                    <Star className={`w-4 h-4 ${isWidgetPinned(widget.id) ? 'fill-current' : ''}`} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { void handleRenameWidget(widget); }}
                                                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                    title={t('querybuilder.manage_action_rename', 'Umbenennen')}
                                                >
                                                    <Edit3 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { void handleDeleteWidget(widget); }}
                                                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                                    title={t('common.delete', 'Löschen')}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                        );
                                    })
                                )}
                            </div>
                            <div className="shrink-0 px-3 py-2 border-t border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800/90">
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
                                    <span className="inline-flex items-center gap-1">
                                        <span className="font-semibold uppercase tracking-wide">{t('querybuilder.manage_widgets_total', 'Vorhandene Widgets')}:</span>
                                        <code className="font-mono text-[10px]">{(savedWidgets || []).length}</code>
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <span className="font-semibold uppercase tracking-wide">{t('querybuilder.manage_widgets_used_in_dashboards', 'In Dashboards eingesetzt')}:</span>
                                        <code className="font-mono text-[10px]">{dashboardUsedWidgetCount}</code>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <SelectionListDialog
                isOpen={isLoadDialogOpen}
                onClose={() => setIsLoadDialogOpen(false)}
                title={loadDialogTitle}
                searchValue={loadDialogSearch}
                onSearchChange={setLoadDialogSearch}
                searchPlaceholder={t('common.search', 'Suchen...')}
                items={loadDialogItems}
                selectedId={selectedLoadId}
                onSelect={(id) => {
                    if (loadDialogType === 'widget') {
                        setSelectedLoadWidgetId(id);
                        return;
                    }
                    setSelectedLoadSqlId(id);
                }}
                emptyLabel={loadDialogEmptyLabel}
                onApply={() => { void applyLoadSelection(); }}
                applyDisabled={!selectedLoadId}
                cancelLabel={t('common.cancel', 'Abbrechen')}
                applyLabel={t('common.apply', 'Übernehmen')}
                sortOptions={loadDialogSortOptions}
                sortValue={loadDialogSort}
                onSortChange={(value) => setLoadDialogSort(value as 'updated_desc' | 'updated_asc' | 'name_asc' | 'name_desc' | 'pinned_first')}
                sortLabel={t('common.sort', 'Sortieren')}
                showPinnedOnlyToggle
                pinnedOnly={loadDialogPinnedOnly}
                onPinnedOnlyToggle={setLoadDialogPinnedOnly}
                pinnedOnlyLabel={t('querybuilder.pinned_only', 'Nur angepinnt')}
                isItemPinned={(id) => (loadDialogType === 'widget' ? isWidgetPinned(id) : isSqlPinned(id))}
                onToggleItemPin={(id) => { void handleToggleLoadItemPin(id); }}
            />

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




