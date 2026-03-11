import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import CodeMirror from '@uiw/react-codemirror';
import { sql as sqlLang } from '@codemirror/lang-sql';
import { autocompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { indentWithTab } from '@codemirror/commands';
import { tags } from '@lezer/highlight';
import { useAsync } from '../../hooks/useAsync';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { DataTable, type Column, type DataTableSortConfig } from '../../components/ui/DataTable';
import { RecordDetailModal } from '../components/RecordDetailModal';
import { exportToExcel } from '../../lib/utils/exportUtils';
import { isValidIdentifier } from '../../lib/utils';
import { Download, RefreshCw, AlertCircle, Search, Database, Table as TableIcon, Code, Play, Star, Save, ListPlus, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Pencil, Trash2, FolderOpen, ChevronDown, ListChecks, Eraser, Table2, Filter, Plus, PanelsTopBottom, GripHorizontal } from 'lucide-react';
import { PageLayout } from '../components/ui/PageLayout';
import { useDashboard } from '../../lib/context/DashboardContext';
import type { DbRow } from '../../types';
import type { TableColumn } from '../../types';
import { Modal } from '../components/Modal';
import { CreateTableModal } from '../components/CreateTableModal';
import type { DataSourceEntry, SqlStatementRecord } from '../../lib/repositories/SystemRepository';
import { TABLES_LAST_SELECT_SQL_KEY, TABLES_PENDING_SQL_KEY, TABLES_PENDING_SQL_META_KEY, TABLES_RETURN_HASH_KEY } from '../../lib/tablesBridge';
import { appDialog } from '../../lib/appDialog';
import { useLocation, useNavigate } from 'react-router-dom';
import { SelectionListDialog } from '../components/ui/SelectionListDialog';
import { analyzeSqlStatements } from '../../lib/security/sqlAnalysis';

interface TablesViewProps {
    onBack: () => void;
    fixedMode?: 'table' | 'sql';
    titleKey?: string;
    breadcrumbKey?: string;
}

interface InspectorViewPreset {
    id: string;
    name: string;
    table: string;
    searchTerm: string;
    sortConfig: DataTableSortConfig<DbRow> | null;
    filters: Record<string, string>;
    showFilters: boolean;
}

interface ProfilingThresholds {
    nullRate: number;
    cardinalityRate: number;
}

interface IndexSuggestion {
    id: string;
    indexName: string;
    columns: string[];
    reason: string;
    sql: string;
    score: number;
}

interface AssistantFilter {
    id: string;
    connector: 'AND' | 'OR';
    column: string;
    operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'LIKE' | 'NOT LIKE' | 'IS NULL' | 'IS NOT NULL';
    value: string;
}

interface AssistantSort {
    id: string;
    column: string;
    direction: 'ASC' | 'DESC';
}

interface SqlResultCacheEntry {
    executionSql: string;
    rows: DbRow[];
    cachedAt: number;
}

const SQL_RESULT_CACHE_MAX_ENTRIES = 10;
const sqlResultCache = new Map<string, SqlResultCacheEntry>();
const SQL_HEADER_HYDRATION_MIN_MS = 120;

const getCachedSqlRows = (executionSql: string): DbRow[] | null => {
    const key = executionSql.trim();
    if (!key) return null;
    const entry = sqlResultCache.get(key);
    if (!entry) return null;
    // Touch for simple LRU behavior.
    sqlResultCache.delete(key);
    sqlResultCache.set(key, entry);
    return [...entry.rows];
};

const setCachedSqlRows = (executionSql: string, rows: DbRow[]): void => {
    const key = executionSql.trim();
    if (!key) return;
    sqlResultCache.set(key, {
        executionSql: key,
        rows: Array.isArray(rows) ? [...rows] : [],
        cachedAt: Date.now()
    });
    while (sqlResultCache.size > SQL_RESULT_CACHE_MAX_ENTRIES) {
        const oldestKey = sqlResultCache.keys().next().value as string | undefined;
        if (!oldestKey) break;
        sqlResultCache.delete(oldestKey);
    }
};

const SQL_KEYWORDS = [
    'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
    'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'ON',
    'AND', 'OR', 'NOT', 'IN', 'LIKE', 'IS NULL', 'IS NOT NULL',
    'COUNT(*)', 'SUM()', 'AVG()', 'MIN()', 'MAX()', 'DISTINCT'
];

export const TablesView: React.FC<TablesViewProps> = ({ onBack, fixedMode, titleKey, breadcrumbKey }) => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { isAdminMode } = useDashboard();
    const SQL_LIBRARY_SCOPE = 'global';
    const SQL_LIBRARY_MIGRATION_KEY = 'tables_sql_library_migrated_v1';
    const sqlEditorHeightStorageKey = fixedMode === 'sql'
        ? 'sql_workspace_sql_editor_height'
        : 'tables_sql_editor_height';
    const [mode, setMode] = useState<'table' | 'sql'>(fixedMode ?? 'table');
    const [inputSql, setInputSql] = useLocalStorage<string>('tables_sql_workspace_input_v1', ''); // Textarea content
    const [, setSqlHistory] = useLocalStorage<string[]>('tables_sql_history', []);
    const [explainMode] = useLocalStorage<boolean>('tables_explain_mode', false);
    const [showSqlAssist, setShowSqlAssist] = useLocalStorage<boolean>('tables_sql_assist_open', false);
    const [autocompleteEnabled] = useLocalStorage<boolean>('tables_autocomplete_enabled', true);
    const [sqlEditorSyntaxHighlight] = useLocalStorage<boolean>('sql_editor_syntax_highlighting', true);
    const [sqlEditorAutocompleteTyping] = useLocalStorage<boolean>('sql_editor_autocomplete_on_typing', true);
    const [sqlEditorLineWrap] = useLocalStorage<boolean>('sql_editor_line_wrap', true);
    const [sqlEditorLineNumbers] = useLocalStorage<boolean>('sql_editor_line_numbers', false);
    const [sqlEditorHighlightActiveLine] = useLocalStorage<boolean>('sql_editor_highlight_active_line', true);
    const [sqlEditorFontSize] = useLocalStorage<number>('sql_editor_font_size', 14);
    const [sqlEditorTabSize] = useLocalStorage<number>('sql_editor_tab_size', 4);
    const [sqlEditorIndentWithTab] = useLocalStorage<boolean>('sql_editor_indent_with_tab', true);
    const [sqlEditorThemeIntensity] = useLocalStorage<'subtle' | 'normal' | 'high'>('sql_editor_theme_intensity', 'normal');
    const [sqlEditorUppercaseKeywords] = useLocalStorage<boolean>('sql_editor_uppercase_keywords', false);
    const [sqlEditorSchemaHints] = useLocalStorage<boolean>('sql_editor_schema_hints', true);
    const [sqlEditorRememberHeight] = useLocalStorage<boolean>('sql_editor_remember_height', true);
    const [sqlRequireLimitConfirm, setSqlRequireLimitConfirm] = useLocalStorage<boolean>('tables_sql_require_limit_confirm', true);
    const [sqlMaxRows] = useLocalStorage<number>('tables_sql_max_rows', 5000);
    const [sqlStatements, setSqlStatements] = useState<SqlStatementRecord[]>([]);
    const [sqlStatementsLoaded, setSqlStatementsLoaded] = useState(false);
    const [activeSqlStatementId, setActiveSqlStatementId] = useState<string>('');
    const [lastOpenSqlStatementId, setLastOpenSqlStatementId] = useLocalStorage<string>('sql_workspace_last_open_statement_id', '');
    const [sqlSavedSnapshot, setSqlSavedSnapshot] = useState<{ id: string; normalizedSql: string }>({ id: '', normalizedSql: '' });
    const [sqlLibrarySearch, setSqlLibrarySearch] = useState('');
    const [sqlLibrarySort, setSqlLibrarySort] = useLocalStorage<
        'updated_desc' | 'name_asc' | 'name_desc' | 'last_used_desc' | 'favorite_then_updated'
    >('tables_sql_library_sort_v1', 'updated_desc');
    const [, setLastSavedSqlTemplateName] = useLocalStorage<string>('tables_last_saved_sql_template_name', '');
    const [, setLastSavedSqlTemplateDescription] = useLocalStorage<string>('tables_last_saved_sql_template_description', '');
    const [loadedSqlTemplateMeta, setLoadedSqlTemplateMeta] = useState<{ name: string; description: string }>({ name: '', description: '' });
    const [isSqlOpenDialogOpen, setIsSqlOpenDialogOpen] = useState(false);
    const [selectedOpenSqlId, setSelectedOpenSqlId] = useState('');
    const [sqlOpenPinnedOnly, setSqlOpenPinnedOnly] = useLocalStorage<boolean>('tables_sql_open_pinned_only', false);
    const [showTableTools, setShowTableTools] = useLocalStorage<boolean>('tables_table_tools_open', false);
    const [tableToolsTab, setTableToolsTab] = useLocalStorage<'tables' | 'columns' | 'filters'>(
        'tables_table_tools_tab_v1',
        'tables'
    );
    const [isCreateTableOpen, setIsCreateTableOpen] = useState(false);
    const [newTableName, setNewTableName] = useState('');
    const [createColumns, setCreateColumns] = useState<Array<{ name: string; type: string }>>([
        { name: 'id', type: 'INTEGER PRIMARY KEY' }
    ]);
    const [tableSelectedColumns, setTableSelectedColumns] = useState<string[]>([]);
    const [tableVisibleColumns, setTableVisibleColumns] = useState<string[]>([]);
    const [tableFilterColumn, setTableFilterColumn] = useState('');
    const [tableFilterValue, setTableFilterValue] = useState('');
    const [assistantPanels, setAssistantPanels] = useLocalStorage<{
        table: boolean;
        columns: boolean;
        aggregation: boolean;
        grouping: boolean;
        filter: boolean;
        sorting: boolean;
        preview: boolean;
    }>(
        'tables_sql_assistant_panels_v2',
        { table: true, columns: true, aggregation: false, grouping: true, filter: false, sorting: false, preview: true }
    );
    const [assistantTable, setAssistantTable] = useState('');
    const [assistantSelectedColumns, setAssistantSelectedColumns] = useState<string[]>([]);
    const [assistantWhereClause, setAssistantWhereClause] = useState('');
    const [assistantWhereConnector, setAssistantWhereConnector] = useState<'AND' | 'OR'>('AND');
    const [assistantColumnSearch, setAssistantColumnSearch] = useState('');
    const [assistantFilters, setAssistantFilters] = useState<AssistantFilter[]>([
        { id: 'f0', connector: 'AND', column: '', operator: '=', value: '' }
    ]);
    const [assistantSorts, setAssistantSorts] = useState<AssistantSort[]>([
        { id: 's0', column: '', direction: 'DESC' }
    ]);
    const [assistantLimit, setAssistantLimit] = useState(100);
    const [assistantAggregation, setAssistantAggregation] = useState<'none' | 'count' | 'sum' | 'avg' | 'min' | 'max'>('none');
    const [assistantAggregationColumn, setAssistantAggregationColumn] = useState('');
    const [assistantGroupByColumns, setAssistantGroupByColumns] = useState<string[]>([]);
    const [assistantMetricAlias, setAssistantMetricAlias] = useState('metric_value');
    const [explainRows, setExplainRows] = useState<DbRow[]>([]);
    const [explainError, setExplainError] = useState('');
    const [explainLoading, setExplainLoading] = useState(false);
    const [sqlOutputView, setSqlOutputView] = useState<'result' | 'explain'>(explainMode ? 'explain' : 'result');
    const [sqlWorkspaceView, setSqlWorkspaceView] = useLocalStorage<'sql' | 'result' | 'explain'>(
        'tables_sql_workspace_view_v1',
        'sql'
    );
    const [sqlWorkspaceSplitView, setSqlWorkspaceSplitView] = useLocalStorage<boolean>(
        'tables_sql_workspace_split_view_v1',
        false
    );
    const [sqlSplitTopHeight, setSqlSplitTopHeight] = useLocalStorage<number>(
        'tables_sql_workspace_split_top_height_v1',
        260
    );
    const [sqlWorkspaceTab, setSqlWorkspaceTab] = useLocalStorage<'manage' | 'editor'>(
        'tables_sql_workspace_tab_v1',
        'editor'
    );
    const [isSqlHeaderHydrating, setIsSqlHeaderHydrating] = useState(true);
    const [cachedSqlHeaderName, setCachedSqlHeaderName] = useLocalStorage<string>('tables_sql_header_name_cache_v1', '');
    const [, setCachedSqlHeaderDirty] = useLocalStorage<boolean>('tables_sql_header_dirty_cache_v1', false);
    const [, setCachedSqlHeaderStatementId] = useLocalStorage<string>('tables_sql_header_statement_id_cache_v1', '');
    const [sqlExecutionSql, setSqlExecutionSql] = useLocalStorage<string>('tables_sql_workspace_execution_sql_v1', '');
    const [lastSqlRunHasSelect, setLastSqlRunHasSelect] = useState<boolean | null>(null);
    const [sqlRunToken, setSqlRunToken] = useState(0);
    const [sqlLimitNotice, setSqlLimitNotice] = useState('');
    const [sqlLimitNoticeDismissed, setSqlLimitNoticeDismissed] = useLocalStorage<boolean>('tables_sql_limit_notice_dismissed', false);
    const [isCreateIndexOpen, setIsCreateIndexOpen] = useState(false);
    const [indexModalTab, setIndexModalTab] = useState<'manual' | 'suggestions'>('manual');
    const [indexName, setIndexName] = useState('');
    const [indexColumns, setIndexColumns] = useState<string[]>([]);
    const [indexUnique, setIndexUnique] = useState(false);
    const [indexWhere, setIndexWhere] = useState('');
    const [isCreatingIndex, setIsCreatingIndex] = useState(false);
    const [indexSuggestions, setIndexSuggestions] = useState<IndexSuggestion[]>([]);
    const [isGeneratingIndexSuggestions, setIsGeneratingIndexSuggestions] = useState(false);
    const [applyingIndexSuggestionId, setApplyingIndexSuggestionId] = useState('');
    const [storedSqlEditorHeight, setStoredSqlEditorHeight] = useLocalStorage<number>(sqlEditorHeightStorageKey, 160);
    const [sqlEditorHeight, setSqlEditorHeight] = useState(sqlEditorRememberHeight ? storedSqlEditorHeight : 160);
    const indexSuggestionCacheRef = useRef<Map<string, IndexSuggestion[]>>(new Map());
    const indexSuggestionRunRef = useRef(0);
    const hasAutoRestoredLastSelectRef = useRef(false);
    const sqlHeaderHydrationStartedAtRef = useRef(Date.now());
    const sqlHeaderHydrationTimerRef = useRef<number | null>(null);
    const finishSqlHeaderHydration = useCallback(() => {
        if (!isSqlHeaderHydrating) return;
        const elapsed = Date.now() - sqlHeaderHydrationStartedAtRef.current;
        const remaining = SQL_HEADER_HYDRATION_MIN_MS - elapsed;
        if (remaining <= 0) {
            if (sqlHeaderHydrationTimerRef.current !== null) {
                window.clearTimeout(sqlHeaderHydrationTimerRef.current);
                sqlHeaderHydrationTimerRef.current = null;
            }
            setIsSqlHeaderHydrating(false);
            return;
        }
        if (sqlHeaderHydrationTimerRef.current !== null) {
            window.clearTimeout(sqlHeaderHydrationTimerRef.current);
        }
        sqlHeaderHydrationTimerRef.current = window.setTimeout(() => {
            setIsSqlHeaderHydrating(false);
            sqlHeaderHydrationTimerRef.current = null;
        }, remaining);
    }, [isSqlHeaderHydrating]);

    // Table Mode State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTable, setSelectedTable] = useState('');
    const [selectedItem, setSelectedItem] = useState<DbRow | null>(null);
    const [pageSize, setPageSize] = useLocalStorage<number>('tables_page_size', 100);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageJumpInput, setPageJumpInput] = useState('');
    const offset = (currentPage - 1) * pageSize;

    const { data: userWidgets } = useAsync<DbRow[]>(
        async () => await SystemRepository.getUserWidgets(),
        []
    );
    const [tableSortConfig, setTableSortConfig] = useState<DataTableSortConfig<DbRow> | null>(null);
    const [tableFilters, setTableFilters] = useState<Record<string, string>>({});
    const [defaultShowFilters] = useLocalStorage<boolean>('data_table_default_show_filters', false);
    const [showTableFilters, setShowTableFilters] = useState(defaultShowFilters);
    const [columnWidthsBySource, setColumnWidthsBySource] = useLocalStorage<Record<string, Record<string, number>>>(
        'tables_column_widths_v1',
        {}
    );
    const [savedViews, setSavedViews] = useLocalStorage<InspectorViewPreset[]>('tables_saved_views', []);
    const [activeViewId, setActiveViewId] = useLocalStorage<string>('tables_active_view', '');
    const [defaultShowProfiling] = useLocalStorage<boolean>('tables_show_profiling', true);
    const [tableResultTab, setTableResultTab] = useState<'data' | 'profiling'>(defaultShowProfiling ? 'profiling' : 'data');
    const [profilingThresholds, setProfilingThresholds] = useLocalStorage<ProfilingThresholds>('tables_profiling_thresholds', {
        nullRate: 30,
        cardinalityRate: 95
    });
    const sqlEditorPaneRef = useRef<HTMLDivElement | null>(null);
    const sqlEditorViewRef = useRef<EditorView | null>(null);
    const sqlSplitContainerRef = useRef<HTMLDivElement | null>(null);
    const sqlSplitMouseMoveHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
    const sqlSplitMouseUpHandlerRef = useRef<(() => void) | null>(null);
    const [inspectorReturnHash, setInspectorReturnHash] = useState<string | null>(null);
    const modeLocked = Boolean(fixedMode);
    const pageTitle = t(titleKey || 'sidebar.data_inspector');
    const pageBreadcrumb = t(breadcrumbKey || titleKey || 'sidebar.data_inspector');
    const [isDarkEditor, setIsDarkEditor] = useState<boolean>(
        typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    );
    const hasRestoredLastOpenSqlRef = useRef(false);

    const forwardSqlToWorkspace = useCallback((sql: string) => {
        const trimmed = sql.trim();
        if (!trimmed) return;
        localStorage.setItem(TABLES_PENDING_SQL_KEY, trimmed);
        localStorage.setItem(TABLES_RETURN_HASH_KEY, `#${location.pathname}${location.search || ''}`);
        navigate('/sql-workspace');
    }, [location.pathname, location.search, navigate]);
    const resetSqlOutputState = useCallback(() => {
        setSqlExecutionSql('');
        setExplainRows([]);
        setExplainError('');
        setExplainLoading(false);
    }, []);

    useEffect(() => {
        setShowTableFilters(defaultShowFilters);
    }, [defaultShowFilters, selectedTable]);

    useEffect(() => {
        if (!fixedMode || mode === fixedMode) return;
        setMode(fixedMode);
    }, [fixedMode, mode]);

    useEffect(() => {
        const pendingSql = localStorage.getItem(TABLES_PENDING_SQL_KEY);
        const pendingSqlMetaRaw = localStorage.getItem(TABLES_PENDING_SQL_META_KEY);
        const pendingReturnHash = localStorage.getItem(TABLES_RETURN_HASH_KEY);
        if (pendingReturnHash) {
            const normalized = pendingReturnHash.startsWith('#/') ? pendingReturnHash : '#/';
            setInspectorReturnHash(normalized);
            localStorage.removeItem(TABLES_RETURN_HASH_KEY);
        }
        if (pendingSqlMetaRaw) {
            try {
                const parsed = JSON.parse(pendingSqlMetaRaw) as { name?: unknown; description?: unknown };
                const name = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
                const description = typeof parsed?.description === 'string' ? parsed.description.trim() : '';
                setLoadedSqlTemplateMeta({ name, description });
            } catch {
                setLoadedSqlTemplateMeta({ name: '', description: '' });
            } finally {
                localStorage.removeItem(TABLES_PENDING_SQL_META_KEY);
            }
        } else {
            setLoadedSqlTemplateMeta({ name: '', description: '' });
        }
        if (!pendingSql) return;
        localStorage.removeItem(TABLES_PENDING_SQL_KEY);
        if (fixedMode === 'table') {
            forwardSqlToWorkspace(pendingSql);
            return;
        }
        setMode('sql');
        resetSqlOutputState();
        setInputSql(pendingSql);
        setActiveSqlStatementId('');
        setSqlOutputView('result');
    }, [fixedMode, forwardSqlToWorkspace, resetSqlOutputState]);

    useEffect(() => {
        if (fixedMode !== 'sql') return;
        if (hasAutoRestoredLastSelectRef.current) return;
        if (inputSql.trim()) {
            hasAutoRestoredLastSelectRef.current = true;
            return;
        }
        hasAutoRestoredLastSelectRef.current = true;
        const lastSelectSql = localStorage.getItem(TABLES_LAST_SELECT_SQL_KEY);
        if (!lastSelectSql || !/^\s*SELECT\b/i.test(lastSelectSql)) return;
        resetSqlOutputState();
        setInputSql(lastSelectSql);
        setActiveSqlStatementId('');
        setSqlOutputView('result');
    }, [fixedMode, inputSql, resetSqlOutputState]);

    useEffect(() => {
        const root = document.documentElement;
        const syncTheme = () => setIsDarkEditor(root.classList.contains('dark'));
        syncTheme();

        const observer = new MutationObserver(syncTheme);
        observer.observe(root, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    const normalizeSql = useCallback((value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase(), []);

    const loadSqlStatements = useCallback(async () => {
        try {
            const rows = await SystemRepository.listSqlStatements(SQL_LIBRARY_SCOPE);
            setSqlStatements(rows);
        } finally {
            setSqlStatementsLoaded(true);
        }
    }, [SQL_LIBRARY_SCOPE]);

    useEffect(() => {
        void loadSqlStatements();
    }, [loadSqlStatements]);

    useEffect(() => {
        if (!activeSqlStatementId) return;
        if (lastOpenSqlStatementId === activeSqlStatementId) return;
        setLastOpenSqlStatementId(activeSqlStatementId);
    }, [activeSqlStatementId, lastOpenSqlStatementId, setLastOpenSqlStatementId]);

    useEffect(() => {
        if (mode === 'sql' && sqlWorkspaceTab === 'manage' && showSqlAssist) {
            setShowSqlAssist(false);
        }
    }, [mode, sqlWorkspaceTab, showSqlAssist, setShowSqlAssist]);

    useEffect(() => {
        const migrateSqlLibrary = async () => {
            const alreadyMigrated = localStorage.getItem(SQL_LIBRARY_MIGRATION_KEY);
            if (alreadyMigrated === 'true') return;
            try {
                const existing = await SystemRepository.listSqlStatements(SQL_LIBRARY_SCOPE);
                const existingSql = new Set(existing.map(stmt => normalizeSql(stmt.sql_text)));
                const legacyTemplatesRaw = localStorage.getItem('tables_custom_sql_templates');
                const legacyFavoritesRaw = localStorage.getItem('tables_favorite_queries');
                const legacyTemplates = legacyTemplatesRaw ? JSON.parse(legacyTemplatesRaw) as Array<{ name?: string; sql?: string }> : [];
                const legacyFavorites = legacyFavoritesRaw ? JSON.parse(legacyFavoritesRaw) as string[] : [];

                for (const tpl of legacyTemplates) {
                    const sql = (tpl.sql || '').trim();
                    if (!sql) continue;
                    const normalized = normalizeSql(sql);
                    if (existingSql.has(normalized)) continue;
                    await SystemRepository.saveSqlStatement({
                        id: crypto.randomUUID(),
                        name: (tpl.name || t('datainspector.save_template')).trim() || `Template ${existingSql.size + 1}`,
                        sql_text: sql,
                        scope: SQL_LIBRARY_SCOPE
                    });
                    existingSql.add(normalized);
                }

                for (const sql of legacyFavorites) {
                    const trimmed = sql.trim();
                    if (!trimmed) continue;
                    const normalized = normalizeSql(trimmed);
                    if (existingSql.has(normalized)) continue;
                    const singleLine = trimmed.split('\n').map(line => line.trim()).find(Boolean) || trimmed;
                    await SystemRepository.saveSqlStatement({
                        id: crypto.randomUUID(),
                        name: `${t('datainspector.favorite_queries')}: ${singleLine.slice(0, 36)}`,
                        sql_text: trimmed,
                        scope: SQL_LIBRARY_SCOPE,
                        is_favorite: true
                    });
                    existingSql.add(normalized);
                }

                localStorage.setItem(SQL_LIBRARY_MIGRATION_KEY, 'true');
                await loadSqlStatements();
            } catch {
                // Skip migration on malformed legacy payloads; user can re-save manually.
                localStorage.setItem(SQL_LIBRARY_MIGRATION_KEY, 'true');
            }
        };
        void migrateSqlLibrary();
    }, [SQL_LIBRARY_MIGRATION_KEY, SQL_LIBRARY_SCOPE, loadSqlStatements, normalizeSql, t]);

    // Fetch available data sources (tables + views)
    const { data: dataSources, refresh: refreshDataSources } = useAsync<DataSourceEntry[]>(
        async () => {
            const allSources = await SystemRepository.getDataSources();
            const filteredSources = isAdminMode ? allSources : allSources.filter(s => !s.name.startsWith('sys_'));

            if (filteredSources.length > 0 && (!selectedTable || (selectedTable.startsWith('sys_') && !isAdminMode))) {
                setSelectedTable(filteredSources[0].name);
            }
            return filteredSources;
        },
        [isAdminMode]
    );

    const tables = React.useMemo(() => (dataSources || []).map(s => s.name), [dataSources]);
    const physicalTables = React.useMemo(
        () => (dataSources || []).filter(source => source.type === 'table'),
        [dataSources]
    );
    const selectedSourceType = React.useMemo<'table' | 'view'>(
        () => (dataSources?.find(s => s.name === selectedTable)?.type ?? 'table'),
        [dataSources, selectedTable]
    );
    const activeColumnWidths = React.useMemo<Record<string, number>>(
        () => (selectedTable ? (columnWidthsBySource[selectedTable] || {}) : {}),
        [columnWidthsBySource, selectedTable]
    );
    const handleColumnWidthsChange = useCallback((nextWidths: Record<string, number>) => {
        if (!selectedTable) return;
        setColumnWidthsBySource(prev => ({
            ...prev,
            [selectedTable]: nextWidths
        }));
    }, [selectedTable, setColumnWidthsBySource]);

    // Main Data Fetching
    const { data: items, loading, error, refresh: execute } = useAsync<DbRow[]>(
        async () => {
            if (mode === 'table') {
                if (!selectedTable) return [];
                return await SystemRepository.inspectTable(selectedTable, pageSize, searchTerm, offset, selectedSourceType);
            } else {
                if (!sqlExecutionSql) return []; // Don't run empty SQL
                const cachedRows = getCachedSqlRows(sqlExecutionSql);
                if (cachedRows) return cachedRows;
                const rows = await SystemRepository.executeRaw(sqlExecutionSql);
                setCachedSqlRows(sqlExecutionSql, rows);
                return rows;
            }
        },
        [mode, selectedTable, selectedSourceType, pageSize, currentPage, sqlExecutionSql, sqlRunToken] // Auto-run when mode/source/page changes
    );

    const { data: tableTotalRows } = useAsync<number>(
        async () => {
            if (mode !== 'table' || !selectedTable) return 0;
            return await SystemRepository.countTableRows(selectedTable, searchTerm);
        },
        [mode, selectedTable, searchTerm]
    );
    const totalPages = Math.max(1, Math.ceil((tableTotalRows || 0) / pageSize));

    const { data: selectedTableSchema } = useAsync<TableColumn[]>(
        async () => {
            if (!selectedTable) return [];
            return await SystemRepository.getTableSchema(selectedTable);
        },
        [selectedTable]
    );
    const { data: assistantTableSchema } = useAsync<TableColumn[]>(
        async () => {
            if (!assistantTable) return [];
            return await SystemRepository.getTableSchema(assistantTable);
        },
        [assistantTable]
    );

    useEffect(() => {
        const schemaColumns = (selectedTableSchema || []).map(col => col.name);
        if (schemaColumns.length === 0) {
            setTableFilterColumn('');
            return;
        }
        if (!tableFilterColumn || !schemaColumns.includes(tableFilterColumn)) {
            setTableFilterColumn(schemaColumns[0]);
        }
    }, [selectedTableSchema, tableFilterColumn]);

    useEffect(() => {
        const schemaColumns = (selectedTableSchema || []).map(col => col.name);
        setTableSelectedColumns(prev => prev.filter(col => schemaColumns.includes(col)));
    }, [selectedTableSchema]);

    const displayedTableColumns = React.useMemo(() => {
        const rowKeys = items && items.length > 0
            ? Object.keys(items[0]).filter(k => k !== '_rowid')
            : [];
        return tableVisibleColumns.length > 0
            ? rowKeys.filter(key => tableVisibleColumns.includes(key))
            : rowKeys;
    }, [items, tableVisibleColumns]);

    useEffect(() => {
        if (mode !== 'table' || !showTableTools || tableToolsTab !== 'columns') return;
        if (displayedTableColumns.length === 0) return;
        setTableSelectedColumns(displayedTableColumns);
    }, [displayedTableColumns, mode, showTableTools, tableToolsTab]);

    useEffect(() => {
        setTableVisibleColumns([]);
    }, [selectedTable]);

    // Debounced search for table mode
    useEffect(() => {
        if (mode === 'table') {
            const timer = setTimeout(() => {
                execute();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [searchTerm, mode, execute]); // Re-run when searchTerm changes

    const executeSqlText = useCallback(async (sqlText: string) => {
        const trimmed = sqlText.trim();
        if (!trimmed) return;

        const statementAnalysis = analyzeSqlStatements(trimmed);
        const isPotentialWriteQuery = statementAnalysis.some((statement) => statement.kind === 'write');
        if (isPotentialWriteQuery && !(await appDialog.confirm(t('datainspector.write_confirm')))) return;

        const hasSelectWithoutLimit = statementAnalysis.some((statement) => statement.isSelectLike && !statement.hasLimit);
        if (hasSelectWithoutLimit && sqlRequireLimitConfirm) {
            const decision = await appDialog.confirmWithRemember(
                t('datainspector.limit_confirm_prompt', { limit: sqlMaxRows }),
                {
                    title: t('datainspector.limit_confirm_title', 'SELECT without LIMIT'),
                    confirmLabel: t('datainspector.run_sql', 'Run'),
                    cancelLabel: t('common.cancel', 'Cancel'),
                    rememberLabel: t('datainspector.limit_confirm_do_not_show_again', 'Do not show this confirmation again'),
                    rememberHint: t(
                        'datainspector.limit_confirm_settings_hint',
                        'You can enable this confirmation again in Settings > Apps > SQL Workspace.'
                    ),
                    rememberChecked: false
                }
            );
            if (!decision.confirmed) return;
            if (decision.rememberChoice) {
                setSqlRequireLimitConfirm(false);
            }
        }

        let executionSql = trimmed.replace(/;\s*$/, '');
        const hasSelectStatement = statementAnalysis.some((statement) => statement.isSelectLike);
        const canApplyGuardedLimit = statementAnalysis.length === 1 && statementAnalysis[0].isSelectLike;
        if (canApplyGuardedLimit) {
            const cappedLimit = Math.max(1, Math.floor(sqlMaxRows || 1));
            executionSql = `SELECT * FROM (${executionSql}) AS __litebi_guard LIMIT ${cappedLimit}`;
            setSqlLimitNotice(sqlLimitNoticeDismissed ? '' : t('datainspector.limit_applied_notice', { limit: cappedLimit }));
        } else {
            setSqlLimitNotice('');
        }

        setSqlOutputView('result');
        if (!sqlWorkspaceSplitView) {
            setSqlWorkspaceSplitView(true);
        }
        setSqlWorkspaceView('result');
        setSqlExecutionSql(executionSql);
        setLastSqlRunHasSelect(hasSelectStatement);
        setSqlRunToken((prev) => prev + 1);
        setSqlHistory((prev: string[]) => [trimmed, ...prev.filter((q: string) => q !== trimmed)].slice(0, 12));
        if (hasSelectStatement) {
            localStorage.setItem(TABLES_LAST_SELECT_SQL_KEY, trimmed);
        }
    }, [setSqlHistory, setSqlRequireLimitConfirm, setSqlWorkspaceSplitView, setSqlWorkspaceView, sqlLimitNoticeDismissed, sqlMaxRows, sqlRequireLimitConfirm, sqlWorkspaceSplitView, t]);

    const handleRunSql = async () => {
        if (!canRunSqlWorkspace) return;
        await executeSqlText(inputSql);
    };
    const handleClearSqlWorkspace = useCallback(() => {
        setInputSql('');
        resetSqlOutputState();
        setActiveSqlStatementId('');
        setSqlSavedSnapshot({ id: '', normalizedSql: '' });
        setSqlLimitNotice('');
        setLastSqlRunHasSelect(null);
        setSqlOutputView('result');
        setLoadedSqlTemplateMeta({ name: '', description: '' });
        localStorage.removeItem(TABLES_LAST_SELECT_SQL_KEY);
    }, [resetSqlOutputState]);

    const runExplainPlan = useCallback(async (sql: string) => {
        const trimmed = sql.trim();
        if (!trimmed) {
            setExplainRows([]);
            setExplainError('');
            return;
        }
        setExplainLoading(true);
        setExplainError('');
        try {
            const explainResult = await SystemRepository.executeRaw(`EXPLAIN QUERY PLAN ${trimmed}`);
            setExplainRows(explainResult);
        } catch (err) {
            setExplainRows([]);
            setExplainError(err instanceof Error ? err.message : String(err));
        } finally {
            setExplainLoading(false);
        }
    }, []);
    const showSqlSaveSuccess = useCallback(async (name: string) => {
        await appDialog.info(
            t('datainspector.sql_save_success_detail', {
                name,
                defaultValue: `Das SQL-Statement "${name}" wurde erfolgreich gespeichert.`
            }),
            t('datainspector.sql_save_success_title', 'SQL-Statement erfolgreich gespeichert')
        );
    }, [t]);

    const handleSaveCustomTemplate = useCallback(async () => {
        const trimmedSql = inputSql.trim();
        if (!trimmedSql) return false;
        const activeSqlStatement = activeSqlStatementId
            ? sqlStatements.find(stmt => stmt.id === activeSqlStatementId && stmt.scope === SQL_LIBRARY_SCOPE)
            : undefined;
        if (activeSqlStatement) {
            const nextDescription = (activeSqlStatement.description || '').trim();
            await SystemRepository.saveSqlStatement({
                id: activeSqlStatement.id,
                name: activeSqlStatement.name,
                sql_text: trimmedSql,
                description: nextDescription,
                scope: activeSqlStatement.scope,
                tags: activeSqlStatement.tags,
                is_favorite: Number(activeSqlStatement.is_favorite) === 1
            });
            setLastSavedSqlTemplateName(activeSqlStatement.name);
            setLastSavedSqlTemplateDescription(nextDescription);
            setLoadedSqlTemplateMeta({
                name: activeSqlStatement.name,
                description: nextDescription
            });
            setSqlSavedSnapshot({ id: activeSqlStatement.id, normalizedSql: normalizeSql(trimmedSql) });
            await loadSqlStatements();
            await showSqlSaveSuccess(activeSqlStatement.name);
            return true;
        }

        const normalized = normalizeSql(trimmedSql);
        const matchingStatement = sqlStatements.find(
            stmt => stmt.scope === SQL_LIBRARY_SCOPE && normalizeSql(stmt.sql_text) === normalized
        );
        const suggestedName = (loadedSqlTemplateMeta.name || '').trim();
        const suggestedDescription = (loadedSqlTemplateMeta.description || '').trim();
        const promptLabel = matchingStatement
            ? t('datainspector.custom_template_prompt_update', 'SQL statement name (updates existing):')
            : t('datainspector.custom_template_prompt');
        const descriptionPromptLabel = matchingStatement
            ? t('datainspector.custom_template_description_prompt_update', 'SQL statement description (updates existing):')
            : t('datainspector.custom_template_description_prompt', 'SQL statement description (optional):');
        const prompted = await appDialog.prompt2(promptLabel, descriptionPromptLabel, {
            title: matchingStatement
                ? t('datainspector.rename_template', 'Rename SQL Statement')
                : t('datainspector.save_sql_statement_title', 'Save SQL Statement'),
            defaultValue: suggestedName,
            secondDefaultValue: suggestedDescription
        });
        if (!prompted) return false;
        const name = prompted.value.trim();
        if (!name) return false;
        const description = prompted.secondValue.trim();

        const existingByName = sqlStatements.find(
            tpl => tpl.name.toLowerCase() === name.toLowerCase() && tpl.scope === SQL_LIBRARY_SCOPE
        );
        if (existingByName && matchingStatement && existingByName.id !== matchingStatement.id) {
            if (!(await appDialog.confirm(
                t('datainspector.custom_template_overwrite_confirm', { name }),
                {
                    confirmLabel: t('common.yes', 'Ja'),
                    cancelLabel: t('common.no', 'Nein')
                }
            ))) return false;
            await SystemRepository.deleteSqlStatement(existingByName.id);
        } else if (existingByName && !matchingStatement) {
            if (!(await appDialog.confirm(
                t('datainspector.custom_template_overwrite_confirm', { name }),
                {
                    confirmLabel: t('common.yes', 'Ja'),
                    cancelLabel: t('common.no', 'Nein')
                }
            ))) return false;
        }
        const targetId = matchingStatement?.id || existingByName?.id || crypto.randomUUID();
        const targetFavorite = matchingStatement
            ? Number(matchingStatement.is_favorite) === 1
            : (existingByName ? Number(existingByName.is_favorite) === 1 : false);
        await SystemRepository.saveSqlStatement({
            id: targetId,
            name,
            sql_text: trimmedSql,
            description,
            scope: SQL_LIBRARY_SCOPE,
            is_favorite: targetFavorite
        });
        setLastSavedSqlTemplateName(name);
        setLastSavedSqlTemplateDescription(description);
        setActiveSqlStatementId(targetId);
        setSqlSavedSnapshot({ id: targetId, normalizedSql: normalizeSql(trimmedSql) });
        await loadSqlStatements();
        await showSqlSaveSuccess(name);
        return true;
    }, [
        SQL_LIBRARY_SCOPE,
        activeSqlStatementId,
        inputSql,
        loadSqlStatements,
        loadedSqlTemplateMeta.description,
        loadedSqlTemplateMeta.name,
        normalizeSql,
        setLastSavedSqlTemplateDescription,
        setLastSavedSqlTemplateName,
        showSqlSaveSuccess,
        sqlStatements,
        t
    ]);
    const handleSaveSqlAs = useCallback(async () => {
        const trimmedSql = inputSql.trim();
        if (!trimmedSql) return false;

        const activeSqlStatement = activeSqlStatementId
            ? sqlStatements.find(stmt => stmt.id === activeSqlStatementId && stmt.scope === SQL_LIBRARY_SCOPE)
            : undefined;
        let suggestedName = (activeSqlStatement?.name || loadedSqlTemplateMeta.name || '').trim();
        let suggestedDescription = (activeSqlStatement?.description || loadedSqlTemplateMeta.description || '').trim();
        let existingByName: SqlStatementRecord | undefined;
        let name = '';
        let description = '';

        while (true) {
            const prompted = await appDialog.prompt2(
                t('datainspector.custom_template_prompt', 'SQL statement name:'),
                t('datainspector.custom_template_description_prompt', 'SQL statement description (optional):'),
                {
                    title: t('datainspector.save_sql_statement_as_title', 'Save SQL Statement As'),
                    defaultValue: suggestedName,
                    secondDefaultValue: suggestedDescription
                }
            );
            if (!prompted) return false;
            name = prompted.value.trim();
            if (!name) return false;
            description = prompted.secondValue.trim();
            suggestedName = name;
            suggestedDescription = description;

            existingByName = sqlStatements.find(
                stmt => stmt.scope === SQL_LIBRARY_SCOPE && stmt.name.toLowerCase() === name.toLowerCase()
            );
            if (!existingByName) break;

            const shouldOverwrite = await appDialog.confirm(
                t('datainspector.custom_template_overwrite_confirm', { name }),
                {
                    confirmLabel: t('common.yes', 'Ja'),
                    cancelLabel: t('common.no', 'Nein')
                }
            );
            if (shouldOverwrite) break;
        }

        const id = existingByName?.id || crypto.randomUUID();
        const isFavorite = existingByName ? Number(existingByName.is_favorite) === 1 : false;
        await SystemRepository.saveSqlStatement({
            id,
            name,
            sql_text: trimmedSql,
            description,
            scope: SQL_LIBRARY_SCOPE,
            tags: existingByName?.tags,
            is_favorite: isFavorite
        });
        setLastSavedSqlTemplateName(name);
        setLastSavedSqlTemplateDescription(description);
        setLoadedSqlTemplateMeta({ name, description });
        setActiveSqlStatementId(id);
        setSqlSavedSnapshot({ id, normalizedSql: normalizeSql(trimmedSql) });
        await loadSqlStatements();
        await showSqlSaveSuccess(name);
        return true;
    }, [
        inputSql,
        loadSqlStatements,
        activeSqlStatementId,
        loadedSqlTemplateMeta.description,
        loadedSqlTemplateMeta.name,
        sqlStatements,
        SQL_LIBRARY_SCOPE,
        setLastSavedSqlTemplateDescription,
        setLastSavedSqlTemplateName,
        normalizeSql,
        showSqlSaveSuccess,
        t
    ]);

    const applyViewPreset = (preset: InspectorViewPreset) => {
        setSelectedTable(preset.table);
        setSearchTerm(preset.searchTerm);
        setTableSortConfig(preset.sortConfig);
        setTableFilters(preset.filters || {});
        setShowTableFilters(Boolean(preset.showFilters));
        if (!modeLocked) setMode('table');
    };

    const handleSaveCurrentView = async () => {
        const suggested = savedViews.find(v => v.id === activeViewId)?.name || `${selectedTable} View`;
        const name = (await appDialog.prompt(t('datainspector.new_view_prompt'), { defaultValue: suggested }))?.trim();
        if (!name) return;

        const preset: InspectorViewPreset = {
            id: activeViewId || crypto.randomUUID(),
            name,
            table: selectedTable,
            searchTerm,
            sortConfig: tableSortConfig,
            filters: tableFilters,
            showFilters: showTableFilters
        };

        setSavedViews(prev => {
            const withoutCurrent = prev.filter(v => v.id !== preset.id);
            return [preset, ...withoutCurrent].slice(0, 20);
        });
        setActiveViewId(preset.id);
    };

    const handleDeleteCurrentView = async () => {
        if (!activeViewId) return;
        if (!(await appDialog.confirm(t('datainspector.delete_view_confirm')))) return;
        setSavedViews(prev => prev.filter(v => v.id !== activeViewId));
        setActiveViewId('');
    };

    const quoteIdentifier = useCallback((identifier: string) => `"${identifier.replace(/"/g, '""')}"`, []);
    const isSafeColumnType = useCallback((type: string): boolean => /^[A-Za-z0-9_ (),]+$/.test(type.trim()), []);

    const openCreateIndexModal = (targetTable?: string) => {
        const resolvedTable = targetTable || selectedTable;
        if (!resolvedTable) return;
        const resolvedType = dataSources?.find(source => source.name === resolvedTable)?.type;
        if (resolvedType !== 'table') return;
        if (targetTable && targetTable !== selectedTable) {
            setSelectedTable(targetTable);
        }
        setIndexName(`idx_${resolvedTable}_`);
        setIndexColumns([]);
        setIndexUnique(false);
        setIndexWhere('');
        setIndexModalTab('manual');
        setIsCreateIndexOpen(true);
    };

    const activateTableFromTools = useCallback((tableName: string) => {
        if (!tableName) return;
        setSelectedTable(tableName);
        setCurrentPage(1);
    }, []);

    const handleClearTableFromTools = useCallback(async (tableName: string) => {
        if (!tableName) return;
        const shouldConfirm = localStorage.getItem('notifications_confirm_destructive') !== 'false';
        if (shouldConfirm && !(await appDialog.confirm(t('datasource.clear_confirm', { name: tableName })))) return;
        try {
            await SystemRepository.executeRaw(`DELETE FROM ${quoteIdentifier(tableName)}`);
            setSelectedTable(tableName);
            setCurrentPage(1);
            await Promise.all([refreshDataSources(), execute()]);
            await appDialog.info(t('datasource.cleared_success'));
        } catch (err) {
            await appDialog.error(t('common.error') + ': ' + (err instanceof Error ? err.message : String(err)));
        }
    }, [execute, quoteIdentifier, refreshDataSources, t]);

    const handleDropTableFromTools = useCallback(async (tableName: string) => {
        if (!tableName) return;
        const shouldConfirm = localStorage.getItem('notifications_confirm_destructive') !== 'false';
        if (shouldConfirm && !(await appDialog.confirm(t('datasource.drop_confirm', { name: tableName })))) return;
        try {
            await SystemRepository.executeRaw(`DROP TABLE ${quoteIdentifier(tableName)}`);
            await refreshDataSources();
            const nextTable = (physicalTables.find(source => source.name !== tableName)?.name) || '';
            setSelectedTable(nextTable);
            setCurrentPage(1);
            await execute();
        } catch (err) {
            await appDialog.error(t('common.error') + ': ' + (err instanceof Error ? err.message : String(err)));
        }
    }, [execute, physicalTables, quoteIdentifier, refreshDataSources, t]);

    const openCreateTableModal = useCallback(() => {
        setNewTableName('');
        setCreateColumns([{ name: 'id', type: 'INTEGER PRIMARY KEY' }]);
        setIsCreateTableOpen(true);
    }, []);

    const handleCreateTableFromTools = useCallback(async () => {
        const normalizedTableName = newTableName.trim();
        if (!isValidIdentifier(normalizedTableName)) {
            await appDialog.warning(t('datasource.invalid_table_name', 'Invalid table name. Use letters, numbers and underscore only.'));
            return;
        }
        if (!createColumns.length) {
            await appDialog.warning(t('datasource.invalid_columns', 'Please provide at least one valid column.'));
            return;
        }
        for (const col of createColumns) {
            const colName = col.name.trim();
            const colType = col.type.trim();
            if (!isValidIdentifier(colName) || !colType || !isSafeColumnType(colType)) {
                await appDialog.warning(t('datasource.invalid_columns', 'Please provide at least one valid column.'));
                return;
            }
        }
        try {
            const cols = createColumns.map(c => `${quoteIdentifier(c.name.trim())} ${c.type.trim()}`).join(', ');
            const sql = `CREATE TABLE ${quoteIdentifier(normalizedTableName)} (${cols})`;
            await SystemRepository.executeRaw(sql);
            setIsCreateTableOpen(false);
            await refreshDataSources();
            setSelectedTable(normalizedTableName);
            setCurrentPage(1);
            await execute();
            await appDialog.info(t('datasource.table_created'));
        } catch (err) {
            await appDialog.error(t('common.error') + ': ' + (err instanceof Error ? err.message : String(err)));
        }
    }, [createColumns, execute, isSafeColumnType, newTableName, quoteIdentifier, refreshDataSources, t]);

    const toggleIndexColumn = (column: string) => {
        setIndexColumns(prev => (
            prev.includes(column)
                ? prev.filter(col => col !== column)
                : [...prev, column]
        ));
    };

    const moveIndexColumn = (column: string, direction: 'up' | 'down') => {
        setIndexColumns(prev => {
            const index = prev.indexOf(column);
            if (index === -1) return prev;
            const nextIndex = direction === 'up' ? index - 1 : index + 1;
            if (nextIndex < 0 || nextIndex >= prev.length) return prev;
            const next = [...prev];
            [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
            return next;
        });
    };

    const handleCreateIndex = async () => {
        const trimmedName = indexName.trim();
        if (!selectedTable || selectedSourceType !== 'table') return;
        if (!trimmedName) {
            await appDialog.warning(t('datasource.index_create_name_required', 'Please provide an index name.'));
            return;
        }
        if (indexColumns.length === 0) {
            await appDialog.warning(t('datasource.index_create_columns_required', 'Please select at least one column.'));
            return;
        }
        setIsCreatingIndex(true);
        try {
            const uniqueSql = indexUnique ? 'UNIQUE ' : '';
            const quotedCols = indexColumns.map(quoteIdentifier).join(', ');
            const whereSql = indexWhere.trim() ? ` WHERE ${indexWhere.trim()}` : '';
            const sql = `CREATE ${uniqueSql}INDEX ${quoteIdentifier(trimmedName)} ON ${quoteIdentifier(selectedTable)} (${quotedCols})${whereSql};`;
            await SystemRepository.executeRaw(sql);
            setIsCreateIndexOpen(false);
            execute();
            await appDialog.info(t('datasource.index_create_success', 'Index created.'));
        } catch (err) {
            await appDialog.error(t('common.error') + ': ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setIsCreatingIndex(false);
        }
    };

    const buildSuggestedIndexName = useCallback((table: string, columns: string[]) => {
        const raw = `idx_${table}_${columns.join('_')}`.toLowerCase();
        return raw.replace(/[^a-z0-9_]/g, '_').slice(0, 60);
    }, []);

    const getExistingIndexColumns = useCallback(async (table: string): Promise<string[][]> => {
        const tableQuoted = quoteIdentifier(table);
        const list = await SystemRepository.executeRaw(`PRAGMA index_list(${tableQuoted});`);
        const indexNames = list.map(row => String(row.name ?? '')).filter(Boolean);
        const allColumns: string[][] = [];
        for (const indexName of indexNames) {
            const info = await SystemRepository.executeRaw(`PRAGMA index_info(${quoteIdentifier(indexName)});`);
            const cols = info
                .map(row => String(row.name ?? ''))
                .filter(Boolean);
            if (cols.length > 0) allColumns.push(cols);
        }
        return allColumns;
    }, [quoteIdentifier]);

    const generateIndexSuggestions = useCallback(async () => {
        if (!selectedTable || selectedSourceType !== 'table') return;
        const cacheKey = JSON.stringify({
            table: selectedTable,
            filters: tableFilters,
            sortKey: tableSortConfig?.key ? String(tableSortConfig.key) : '',
            sortDir: tableSortConfig?.direction || '',
            schema: (selectedTableSchema || []).map((col) => col.name)
        });
        const cached = indexSuggestionCacheRef.current.get(cacheKey);
        if (cached) {
            setIndexSuggestions(cached);
            return;
        }
        const runId = ++indexSuggestionRunRef.current;
        setIsGeneratingIndexSuggestions(true);
        try {
            const schemaColumns = (selectedTableSchema || []).map(col => col.name);
            if (runId !== indexSuggestionRunRef.current) return;
            if (schemaColumns.length === 0) {
                setIndexSuggestions([]);
                return;
            }

            const existingIndexes = await getExistingIndexColumns(selectedTable);
            if (runId !== indexSuggestionRunRef.current) return;
            const totalRowResult = await SystemRepository.executeRaw(`SELECT COUNT(*) AS total_rows FROM ${quoteIdentifier(selectedTable)};`);
            if (runId !== indexSuggestionRunRef.current) return;
            const totalRows = Number(totalRowResult[0]?.total_rows ?? 0);
            const sampleColumns = schemaColumns.slice(0, 14);
            const sampleSize = Math.max(1, Math.min(totalRows || 1, 5000));

            const cardinalityStats = await Promise.all(sampleColumns.map(async (col) => {
                const stats = await SystemRepository.executeRaw(
                    `SELECT COUNT(DISTINCT ${quoteIdentifier(col)}) AS distinct_count
                     FROM (SELECT ${quoteIdentifier(col)} FROM ${quoteIdentifier(selectedTable)} LIMIT ${sampleSize});`
                );
                const distinctCount = Number(stats[0]?.distinct_count ?? 0);
                const ratioBase = sampleSize > 0 ? sampleSize : totalRows;
                const ratio = ratioBase > 0 ? distinctCount / ratioBase : 0;
                return { column: col, distinctCount, ratio };
            }));
            if (runId !== indexSuggestionRunRef.current) return;

            const candidates: Array<{ columns: string[]; reason: string; score: number }> = [];
            const seen = new Set<string>();
            const addCandidate = (columns: string[], reason: string, score: number) => {
                const cleaned = columns.filter(Boolean);
                if (cleaned.length === 0) return;
                const key = cleaned.join('|').toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                candidates.push({ columns: cleaned, reason, score });
            };

            const filteredColumns = Object.keys(tableFilters).filter(col => schemaColumns.includes(col));
            filteredColumns.forEach((col, idx) => {
                addCandidate([col], t('datainspector.index_suggestion_reason_filter', 'Used in active table filter'), 95 - idx);
            });

            if (tableSortConfig?.key && schemaColumns.includes(String(tableSortConfig.key))) {
                addCandidate([String(tableSortConfig.key)], t('datainspector.index_suggestion_reason_sort', 'Used as active sort column'), 92);
            }

            if (filteredColumns.length > 1) {
                addCandidate(
                    filteredColumns.slice(0, 2),
                    t('datainspector.index_suggestion_reason_composite', 'Composite index for combined filters'),
                    96
                );
            } else if (filteredColumns.length === 1 && tableSortConfig?.key && schemaColumns.includes(String(tableSortConfig.key))) {
                const sortCol = String(tableSortConfig.key);
                if (sortCol !== filteredColumns[0]) {
                    addCandidate(
                        [filteredColumns[0], sortCol],
                        t('datainspector.index_suggestion_reason_filter_sort', 'Composite index for filter + sort'),
                        97
                    );
                }
            }

            cardinalityStats
                .sort((a, b) => b.ratio - a.ratio)
                .slice(0, 3)
                .forEach((stat, idx) => {
                    if (stat.ratio < 0.08) return;
                    addCandidate(
                        [stat.column],
                        t('datainspector.index_suggestion_reason_cardinality', 'High cardinality column'),
                        86 - idx
                    );
                });

            const isCoveredByExisting = (candidateCols: string[]) => {
                return existingIndexes.some(existingCols =>
                    existingCols.length >= candidateCols.length
                    && candidateCols.every((col, idx) => existingCols[idx] === col)
                );
            };

            const suggestions = candidates
                .filter(candidate => !isCoveredByExisting(candidate.columns))
                .sort((a, b) => b.score - a.score)
                .slice(0, 5)
                .map(candidate => {
                    const indexName = buildSuggestedIndexName(selectedTable, candidate.columns);
                    const quotedColumns = candidate.columns.map(col => quoteIdentifier(col)).join(', ');
                    return {
                        id: `${selectedTable}:${candidate.columns.join('|')}`,
                        indexName,
                        columns: candidate.columns,
                        reason: candidate.reason,
                        score: candidate.score,
                        sql: `CREATE INDEX ${quoteIdentifier(indexName)} ON ${quoteIdentifier(selectedTable)} (${quotedColumns});`
                    } as IndexSuggestion;
                });

            setIndexSuggestions(suggestions);
            indexSuggestionCacheRef.current.set(cacheKey, suggestions);
        } catch (err) {
            if (runId !== indexSuggestionRunRef.current) return;
            await appDialog.error(t('common.error') + ': ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            if (runId === indexSuggestionRunRef.current) {
                setIsGeneratingIndexSuggestions(false);
            }
        }
    }, [buildSuggestedIndexName, getExistingIndexColumns, quoteIdentifier, selectedSourceType, selectedTable, selectedTableSchema, tableFilters, tableSortConfig, t]);

    useEffect(() => {
        indexSuggestionRunRef.current += 1;
    }, [selectedTable, tableFilters, tableSortConfig]);

    const applyIndexSuggestion = useCallback(async (suggestion: IndexSuggestion) => {
        setApplyingIndexSuggestionId(suggestion.id);
        try {
            await SystemRepository.executeRaw(suggestion.sql);
            await appDialog.info(t('datasource.index_create_success', 'Index created.'));
            setIndexSuggestions(prev => prev.filter(item => item.id !== suggestion.id));
            execute();
        } catch (err) {
            await appDialog.error(t('common.error') + ': ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setApplyingIndexSuggestionId('');
        }
    }, [execute, t]);

    const manualIndexPreviewSql = React.useMemo(() => {
        if (!selectedTable) return '--';
        const trimmedName = indexName.trim();
        const uniqueSql = indexUnique ? 'UNIQUE ' : '';
        const hasColumns = indexColumns.length > 0;
        const quotedColumns = hasColumns ? indexColumns.map(quoteIdentifier).join(', ') : '<select_columns>';
        const whereSql = indexWhere.trim() ? ` WHERE ${indexWhere.trim()}` : '';
        if (!trimmedName) {
            return `-- ${t('datasource.index_create_name_required', 'Please provide an index name.')}`;
        }
        return `CREATE ${uniqueSql}INDEX ${quoteIdentifier(trimmedName)} ON ${quoteIdentifier(selectedTable)} (${quotedColumns})${whereSql};`;
    }, [indexColumns, indexName, indexUnique, indexWhere, quoteIdentifier, selectedTable, t]);

    // Generate Columns dynamically
    const columns: Column<DbRow>[] = React.useMemo(() => {
        if (!items || items.length === 0) return [];

        const keys = Object.keys(items[0]).filter(k => k !== '_rowid');
        const effectiveKeys = tableVisibleColumns.length > 0
            ? keys.filter(k => tableVisibleColumns.includes(k))
            : keys;
        if (effectiveKeys.length === 0) return [];
        return effectiveKeys.map(key => {
            const isAmount = key.toLowerCase().includes('amount') || key.toLowerCase().includes('price');
            const isId = key.toLowerCase().includes('id');
            const sampleVal = items[0][key];
            const isNumeric = typeof sampleVal === 'number';

            return {
                header: key,
                accessor: key,
                align: isNumeric ? 'right' : 'left',
                className: isId ? 'font-mono text-[10px] text-slate-400' :
                    (key === 'Period' || key === 'PostingDate' ? 'font-mono' : ''),
                render: isAmount ? (item: DbRow) => (
                    <span className={Number(item[key] ?? 0) < 0 ? 'text-red-500' : 'text-slate-900 dark:text-slate-100'}>
                        {new Intl.NumberFormat('de-DE', {
                            style: 'currency',
                            currency: (item.Currency as string) || 'EUR'
                        }).format((item[key] as number) || 0)}
                    </span>
                ) : undefined
            };
        });
    }, [items, tableVisibleColumns]);

    const locale = i18n.language.startsWith('de') ? 'de-DE' : 'en-US';
    const now = new Date();
    const footerText = `${t('common.loading').replace('...', '')} ${now.toLocaleDateString(locale)}, ${now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;

    useEffect(() => {
        if (mode !== 'sql') {
            setExplainRows([]);
            setExplainError('');
            setExplainLoading(false);
        }
    }, [mode]);

    useEffect(() => {
        if (mode !== 'sql' || sqlOutputView !== 'explain') return;
        const timer = window.setTimeout(() => {
            void runExplainPlan(inputSql);
        }, 250);
        return () => window.clearTimeout(timer);
    }, [mode, sqlOutputView, inputSql, runExplainPlan]);

    const sqlTemplates = [
        { key: 'top10', sql: `SELECT * FROM ${selectedTable || 'table_name'} LIMIT 10` },
        { key: 'count', sql: `SELECT COUNT(*) AS total_rows FROM ${selectedTable || 'table_name'}` },
        { key: 'nullscan', sql: `SELECT * FROM ${selectedTable || 'table_name'} WHERE 1=1 LIMIT 50` },
        { key: 'duplicates', sql: `SELECT key_column, COUNT(*) AS cnt FROM ${selectedTable || 'table_name'} GROUP BY key_column HAVING COUNT(*) > 1 ORDER BY cnt DESC LIMIT 50` },
        { key: 'outliers', sql: `SELECT * FROM ${selectedTable || 'table_name'} WHERE value_column IS NOT NULL ORDER BY value_column DESC LIMIT 25` },
    ];
    useEffect(() => {
        if (!tables.length) return;
        if (!assistantTable || !tables.includes(assistantTable)) {
            setAssistantTable(selectedTable && tables.includes(selectedTable) ? selectedTable : tables[0]);
        }
    }, [assistantTable, selectedTable, tables]);

    const assistantColumns = React.useMemo(
        () => (assistantTableSchema || []).map(col => col.name),
        [assistantTableSchema]
    );
    const assistantNumericColumns = React.useMemo(
        () => (assistantTableSchema || [])
            .filter(col => /int|real|num|dec|float|double/i.test(col.type || ''))
            .map(col => col.name),
        [assistantTableSchema]
    );
    const filteredAssistantColumns = React.useMemo(() => {
        const query = assistantColumnSearch.trim().toLowerCase();
        if (!query) return assistantColumns;
        return assistantColumns.filter(col => col.toLowerCase().includes(query));
    }, [assistantColumnSearch, assistantColumns]);
    const isAggregationActive = assistantAggregation !== 'none';

    useEffect(() => {
        setAssistantSelectedColumns(prev => prev.filter(col => assistantColumns.includes(col)));
        if (assistantAggregation !== 'none' && assistantAggregation !== 'count' && assistantAggregationColumn && !assistantColumns.includes(assistantAggregationColumn)) {
            setAssistantAggregationColumn('');
        }
        setAssistantGroupByColumns(prev => prev.filter(col => assistantColumns.includes(col)));
        setAssistantFilters(prev => prev.map(filter => (
            filter.column && !assistantColumns.includes(filter.column)
                ? { ...filter, column: '' }
                : filter
        )));
        setAssistantSorts(prev => prev.map(sort => (
            sort.column && !assistantColumns.includes(sort.column) && sort.column !== assistantMetricAlias
                ? { ...sort, column: '' }
                : sort
        )));
    }, [assistantAggregation, assistantAggregationColumn, assistantColumns, assistantMetricAlias]);

    useEffect(() => {
        if (assistantAggregation === 'none' || assistantAggregation === 'count') return;
        if (assistantAggregationColumn) return;
        if (assistantNumericColumns.length > 0) {
            setAssistantAggregationColumn(assistantNumericColumns[0]);
        } else if (assistantColumns.length > 0) {
            setAssistantAggregationColumn(assistantColumns[0]);
        }
    }, [assistantAggregation, assistantAggregationColumn, assistantColumns, assistantNumericColumns]);

    const resetAssistantBuilder = useCallback(() => {
        setAssistantSelectedColumns([]);
        setAssistantColumnSearch('');
        setAssistantFilters([{ id: 'f0', connector: 'AND', column: '', operator: '=', value: '' }]);
        setAssistantWhereClause('');
        setAssistantWhereConnector('AND');
        setAssistantSorts([{ id: 's0', column: '', direction: 'DESC' }]);
        setAssistantLimit(100);
        setAssistantAggregation('none');
        setAssistantAggregationColumn('');
        setAssistantGroupByColumns([]);
        setAssistantMetricAlias('metric_value');
    }, []);

    const addAssistantFilter = useCallback(() => {
        const id = `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        setAssistantFilters(prev => [...prev, { id, connector: 'AND', column: '', operator: '=', value: '' }]);
    }, []);

    const updateAssistantFilter = useCallback((id: string, patch: Partial<AssistantFilter>) => {
        setAssistantFilters(prev => prev.map(filter => (filter.id === id ? { ...filter, ...patch } : filter)));
    }, []);

    const removeAssistantFilter = useCallback((id: string) => {
        setAssistantFilters(prev => {
            const next = prev.filter(filter => filter.id !== id);
            return next.length > 0 ? next : [{ id: 'f0', connector: 'AND', column: '', operator: '=', value: '' }];
        });
    }, []);
    const moveAssistantFilter = useCallback((id: string, direction: 'up' | 'down') => {
        setAssistantFilters(prev => {
            const index = prev.findIndex(filter => filter.id === id);
            if (index < 0) return prev;
            const target = direction === 'up' ? index - 1 : index + 1;
            if (target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            const [item] = next.splice(index, 1);
            next.splice(target, 0, item);
            return next;
        });
    }, []);

    const addAssistantSort = useCallback(() => {
        const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        setAssistantSorts(prev => [...prev, { id, column: '', direction: 'DESC' }]);
    }, []);

    const updateAssistantSort = useCallback((id: string, patch: Partial<AssistantSort>) => {
        setAssistantSorts(prev => prev.map(sort => (sort.id === id ? { ...sort, ...patch } : sort)));
    }, []);

    const removeAssistantSort = useCallback((id: string) => {
        setAssistantSorts(prev => {
            const next = prev.filter(sort => sort.id !== id);
            return next.length > 0 ? next : [{ id: 's0', column: '', direction: 'DESC' }];
        });
    }, []);
    const moveAssistantSort = useCallback((id: string, direction: 'up' | 'down') => {
        setAssistantSorts(prev => {
            const index = prev.findIndex(sort => sort.id === id);
            if (index < 0) return prev;
            const target = direction === 'up' ? index - 1 : index + 1;
            if (target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            const [item] = next.splice(index, 1);
            next.splice(target, 0, item);
            return next;
        });
    }, []);

    const buildAssistantSql = useCallback(() => {
        if (!assistantTable) return '';
        const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
        const toSqlValue = (raw: string) => {
            const value = raw.trim();
            if (!value) return '';
            if (/^'.*'$|^".*"$/.test(value)) return value;
            if (/^-?\d+(\.\d+)?$/.test(value)) return value;
            return `'${value.replace(/'/g, "''")}'`;
        };
        const from = `FROM ${quote(assistantTable)}`;
        const aggFn = assistantAggregation.toUpperCase();
        const metricExpr = assistantAggregation === 'count'
            ? `COUNT(*) AS ${quote(assistantMetricAlias || 'metric_value')}`
            : `${aggFn}(${quote(assistantAggregationColumn)}) AS ${quote(assistantMetricAlias || 'metric_value')}`;

        let selectClause = 'SELECT *';
        const groupByParts: string[] = [];
        if (assistantAggregation === 'none') {
            const cols = assistantSelectedColumns.length > 0 ? assistantSelectedColumns.map(quote).join(', ') : '*';
            selectClause = `SELECT ${cols}`;
        } else {
            const dims = assistantGroupByColumns.map(quote);
            groupByParts.push(...dims);
            const selectParts = [...dims, metricExpr];
            selectClause = `SELECT ${selectParts.join(', ')}`;
        }

        const filterExpr = (() => {
            const validFilters = assistantFilters
                .map(filter => {
                    if (!filter.column.trim() || !filter.operator.trim()) return null;
                    const col = quote(filter.column.trim());
                    if (filter.operator === 'IS NULL' || filter.operator === 'IS NOT NULL') {
                        return { connector: filter.connector, expr: `${col} ${filter.operator}` };
                    }
                    const value = toSqlValue(filter.value);
                    if (!value) return null;
                    return { connector: filter.connector, expr: `${col} ${filter.operator} ${value}` };
                })
                .filter((item): item is { connector: 'AND' | 'OR'; expr: string } => Boolean(item));

            return validFilters.reduce((sql, item, index) => {
                if (index === 0) return item.expr;
                return `${sql} ${item.connector} ${item.expr}`;
            }, '');
        })();
        const customWhere = assistantWhereClause.trim();
        const where = (() => {
            if (filterExpr && customWhere) {
                return `WHERE (${filterExpr}) ${assistantWhereConnector} (${customWhere})`;
            }
            if (filterExpr) return `WHERE ${filterExpr}`;
            if (customWhere) return `WHERE ${customWhere}`;
            return '';
        })();
        const groupBy = groupByParts.length > 0 ? `GROUP BY ${groupByParts.join(', ')}` : '';
        const sortParts = assistantSorts
            .filter(sort => sort.column.trim())
            .map(sort => {
                const target = sort.column === assistantMetricAlias
                    ? quote(assistantMetricAlias || 'metric_value')
                    : quote(sort.column);
                return `${target} ${sort.direction}`;
            });
        const fallbackSort = assistantAggregation !== 'none'
            ? [`${quote(assistantMetricAlias || 'metric_value')} DESC`]
            : [];
        const orderByParts = sortParts.length > 0 ? sortParts : fallbackSort;
        const orderBy = orderByParts.length > 0 ? `ORDER BY ${orderByParts.join(', ')}` : '';
        const limitValue = Math.max(1, Math.min(100000, Math.floor(Number(assistantLimit) || 100)));
        const limit = `LIMIT ${limitValue}`;

        return [selectClause, from, where, groupBy, orderBy, limit].filter(Boolean).join('\n');
    }, [
        assistantAggregation,
        assistantAggregationColumn,
        assistantFilters,
        assistantGroupByColumns,
        assistantLimit,
        assistantMetricAlias,
        assistantSorts,
        assistantSelectedColumns,
        assistantTable,
        assistantWhereConnector,
        assistantWhereClause
    ]);

    const assistantSqlPreview = buildAssistantSql();
    const hasExecutableSqlCommand = useCallback(
        (sqlText: string) => analyzeSqlStatements(sqlText).some((statement) => statement.kind !== 'unknown'),
        []
    );
    const canRunAssistantSql = React.useMemo(
        () => hasExecutableSqlCommand(assistantSqlPreview) && !loading,
        [assistantSqlPreview, hasExecutableSqlCommand, loading]
    );

    const applyAssistantSql = useCallback(async (mode: 'replace' | 'run') => {
        const sql = assistantSqlPreview.trim();
        if (!sql) return;
        if (fixedMode === 'table') {
            forwardSqlToWorkspace(sql);
            return;
        }
        setMode('sql');
        setInputSql(sql);
        setActiveSqlStatementId('');
        setSqlOutputView('result');
        setShowSqlAssist(false);
        if (mode === 'run') {
            await executeSqlText(sql);
        }
    }, [assistantSqlPreview, executeSqlText, fixedMode, forwardSqlToWorkspace, setShowSqlAssist]);

    const currentSqlNormalized = normalizeSql(inputSql);
    const activeSqlStatement = activeSqlStatementId
        ? (sqlStatements.find(stmt => stmt.id === activeSqlStatementId) || null)
        : null;
    const currentSqlStatement = activeSqlStatement || sqlStatements.find(stmt => normalizeSql(stmt.sql_text) === currentSqlNormalized);
    const formatSqlTimestamp = useCallback((raw?: string | null): string => {
        if (!raw) return '-';
        const isoRaw = raw.includes('T') ? raw : raw.replace(' ', 'T');
        const parsed = new Date(isoRaw.endsWith('Z') ? isoRaw : `${isoRaw}Z`);
        if (Number.isNaN(parsed.getTime())) {
            return raw;
        }
        return new Intl.DateTimeFormat(i18n.language || undefined, {
            dateStyle: 'short',
            timeStyle: 'short'
        }).format(parsed);
    }, [i18n.language]);
    const lastSqlSavedAtLabel = useMemo(() => {
        const raw = currentSqlStatement?.updated_at;
        return formatSqlTimestamp(raw);
    }, [currentSqlStatement?.updated_at, formatSqlTimestamp]);
    const hasUnsavedSqlChanges = useMemo(() => {
        const trimmed = inputSql.trim();
        if (!trimmed) return false;
        const normalizedCurrent = normalizeSql(trimmed);
        if (sqlSavedSnapshot.id && sqlSavedSnapshot.id === activeSqlStatementId && sqlSavedSnapshot.normalizedSql === normalizedCurrent) {
            return false;
        }
        if (!activeSqlStatement) return true;
        return normalizeSql(activeSqlStatement.sql_text) !== normalizedCurrent;
    }, [activeSqlStatement, activeSqlStatementId, inputSql, normalizeSql, sqlSavedSnapshot]);
    const canSaveCurrentSql = !isSqlHeaderHydrating && inputSql.trim().length > 0 && hasUnsavedSqlChanges;
    const canRunSqlWorkspace = React.useMemo(
        () => hasExecutableSqlCommand(inputSql) && !loading,
        [hasExecutableSqlCommand, inputSql, loading]
    );
    const filteredSqlStatements = React.useMemo(() => {
        const query = sqlLibrarySearch.trim().toLowerCase();
        const filtered = !query ? sqlStatements : sqlStatements.filter(stmt =>
            stmt.name.toLowerCase().includes(query) ||
            stmt.sql_text.toLowerCase().includes(query) ||
            (stmt.description || '').toLowerCase().includes(query)
        );
        const toEpoch = (value?: string | null) => {
            if (!value) return 0;
            const isoRaw = value.includes('T') ? value : value.replace(' ', 'T');
            const parsed = new Date(isoRaw.endsWith('Z') ? isoRaw : `${isoRaw}Z`);
            return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
        };
        const sorted = [...filtered];
        sorted.sort((a, b) => {
            if (sqlLibrarySort === 'name_asc') return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
            if (sqlLibrarySort === 'name_desc') return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
            if (sqlLibrarySort === 'last_used_desc') return toEpoch(b.last_used_at) - toEpoch(a.last_used_at);
            if (sqlLibrarySort === 'favorite_then_updated') {
                const favDiff = Number(b.is_favorite) - Number(a.is_favorite);
                if (favDiff !== 0) return favDiff;
                return toEpoch(b.updated_at) - toEpoch(a.updated_at);
            }
            return toEpoch(b.updated_at) - toEpoch(a.updated_at);
        });
        return sorted;
    }, [sqlLibrarySearch, sqlLibrarySort, sqlStatements]);
    const sqlStatementIdsUsedInWidgets = React.useMemo(() => new Set(
        (userWidgets || [])
            .map((widget) => (typeof widget.sql_statement_id === 'string' ? widget.sql_statement_id : ''))
            .filter((value) => value.length > 0)
    ), [userWidgets]);
    const sqlWidgetUsageByStatementId = React.useMemo(() => {
        const usage = new Map<string, number>();
        for (const widget of (userWidgets || [])) {
            const statementId = typeof widget.sql_statement_id === 'string' ? widget.sql_statement_id : '';
            if (!statementId) continue;
            usage.set(statementId, (usage.get(statementId) || 0) + 1);
        }
        return usage;
    }, [userWidgets]);
    const sqlStatementsUsedInWidgetsCount = React.useMemo(
        () => sqlStatements.filter((statement) => sqlStatementIdsUsedInWidgets.has(statement.id)).length,
        [sqlStatementIdsUsedInWidgets, sqlStatements]
    );
    const openSqlDialogStatements = React.useMemo(
        () => (sqlOpenPinnedOnly ? filteredSqlStatements.filter((stmt) => Number(stmt.is_favorite) === 1) : filteredSqlStatements),
        [filteredSqlStatements, sqlOpenPinnedOnly]
    );
    const sqlOpenDialogItems = React.useMemo(
        () => openSqlDialogStatements.map((stmt) => ({
            id: stmt.id,
            title: stmt.name,
            subtitle: stmt.sql_text || '-',
            description: (stmt.description || '').trim() || '',
            meta: [
                { label: t('datainspector.active_id', 'ID'), value: stmt.id },
                { label: t('datainspector.last_saved_at', 'Last Saved'), value: formatSqlTimestamp(stmt.updated_at || stmt.created_at || '') || '-' }
            ]
        })),
        [formatSqlTimestamp, openSqlDialogStatements, t]
    );
    const activeSqlTemplateMeta = React.useMemo(() => {
        if (currentSqlStatement) {
            return {
                name: currentSqlStatement.name,
                description: (currentSqlStatement.description || '').trim()
            };
        }
        return loadedSqlTemplateMeta;
    }, [currentSqlStatement, loadedSqlTemplateMeta]);
    const confirmSaveBeforeReplaceSql = useCallback(async () => {
        if (!hasUnsavedSqlChanges) return true;
        const choice = await appDialog.confirm3(
            t('datainspector.unsaved_changes_save_before_continue', 'Es gibt ungespeicherte Änderungen. Vor dem Fortfahren speichern?'),
            {
                title: t('common.warning', 'Warning'),
                confirmLabel: t('common.yes', 'Yes'),
                secondaryLabel: t('common.no', 'No'),
                cancelLabel: t('common.cancel', 'Cancel')
            }
        );
        if (choice === 'cancel') return false;
        if (choice === 'confirm') {
            const saved = await handleSaveCustomTemplate();
            if (!saved) return false;
        }
        return true;
    }, [handleSaveCustomTemplate, hasUnsavedSqlChanges, t]);
    const liveSqlWorkspaceStatementName = (activeSqlTemplateMeta.name || '').trim();
    const sqlWorkspaceStatementName = liveSqlWorkspaceStatementName
        || (isSqlHeaderHydrating ? (cachedSqlHeaderName || '').trim() : '')
        || t('datainspector.sql_statement_unnamed', 'Unbenannt');
    const showSqlHeaderDirty = !isSqlHeaderHydrating && hasUnsavedSqlChanges;
    const sqlWorkspaceHeaderTitle = `${t('datainspector.sql_statement_title_prefix', 'SQL-Statement')} (${sqlWorkspaceStatementName})${showSqlHeaderDirty ? ' *' : ''}`;
    useEffect(() => {
        if (isSqlHeaderHydrating) return;
        const label = (activeSqlTemplateMeta.name || '').trim();
        if (label) {
            setCachedSqlHeaderName(label);
        }
        setCachedSqlHeaderStatementId(activeSqlStatementId || '');
        setCachedSqlHeaderDirty(hasUnsavedSqlChanges);
    }, [activeSqlStatementId, activeSqlTemplateMeta.name, hasUnsavedSqlChanges, isSqlHeaderHydrating, setCachedSqlHeaderDirty, setCachedSqlHeaderName, setCachedSqlHeaderStatementId]);
    const canResetSqlWorkspace = Boolean(activeSqlStatementId) || hasUnsavedSqlChanges || Boolean((activeSqlTemplateMeta.name || '').trim());
    const showSqlEditorPane = sqlWorkspaceSplitView || sqlWorkspaceView === 'sql';
    const showSqlOutputPane = sqlWorkspaceSplitView || sqlWorkspaceView !== 'sql';
    const clampSqlSplitTopHeight = useCallback((height: number) => {
        const container = sqlSplitContainerRef.current;
        if (!container) return height;
        const minPaneHeight = 140;
        const dividerHeight = 10;
        const totalHeight = container.clientHeight;
        const maxTop = Math.max(minPaneHeight, totalHeight - minPaneHeight - dividerHeight);
        return Math.max(minPaneHeight, Math.min(maxTop, height));
    }, []);

    useEffect(() => {
        if (!sqlWorkspaceSplitView) return;
        let rafId = 0;
        const syncSplitHeight = () => {
            const next = clampSqlSplitTopHeight(sqlSplitTopHeight);
            if (Math.abs(next - sqlSplitTopHeight) > 1) {
                setSqlSplitTopHeight(next);
            }
        };
        const onResize = () => syncSplitHeight();
        rafId = window.requestAnimationFrame(syncSplitHeight);
        window.addEventListener('resize', onResize);
        return () => {
            if (rafId) window.cancelAnimationFrame(rafId);
            window.removeEventListener('resize', onResize);
        };
    }, [clampSqlSplitTopHeight, setSqlSplitTopHeight, sqlSplitTopHeight, sqlWorkspaceSplitView]);

    const startSqlSplitResize = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        if (!sqlWorkspaceSplitView || !sqlSplitContainerRef.current) return;
        event.preventDefault();
        const startY = event.clientY;
        const startHeight = sqlSplitTopHeight;
        if (sqlSplitMouseMoveHandlerRef.current) {
            window.removeEventListener('mousemove', sqlSplitMouseMoveHandlerRef.current);
            sqlSplitMouseMoveHandlerRef.current = null;
        }
        if (sqlSplitMouseUpHandlerRef.current) {
            window.removeEventListener('mouseup', sqlSplitMouseUpHandlerRef.current);
            sqlSplitMouseUpHandlerRef.current = null;
        }
        const handleMouseMove = (moveEvent: MouseEvent) => {
            const delta = moveEvent.clientY - startY;
            const next = clampSqlSplitTopHeight(startHeight + delta);
            setSqlSplitTopHeight(next);
        };
        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            sqlSplitMouseMoveHandlerRef.current = null;
            sqlSplitMouseUpHandlerRef.current = null;
        };
        sqlSplitMouseMoveHandlerRef.current = handleMouseMove;
        sqlSplitMouseUpHandlerRef.current = handleMouseUp;
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, [clampSqlSplitTopHeight, sqlSplitTopHeight, sqlWorkspaceSplitView, setSqlSplitTopHeight]);
    useEffect(() => {
        return () => {
            if (sqlSplitMouseMoveHandlerRef.current) {
                window.removeEventListener('mousemove', sqlSplitMouseMoveHandlerRef.current);
                sqlSplitMouseMoveHandlerRef.current = null;
            }
            if (sqlSplitMouseUpHandlerRef.current) {
                window.removeEventListener('mouseup', sqlSplitMouseUpHandlerRef.current);
                sqlSplitMouseUpHandlerRef.current = null;
            }
        };
    }, []);
    const applySqlStatement = useCallback(async (statement: SqlStatementRecord, runImmediately: boolean) => {
        if (fixedMode === 'table') {
            forwardSqlToWorkspace(statement.sql_text);
            return;
        }
        setMode('sql');
        resetSqlOutputState();
        setInputSql(statement.sql_text);
        setActiveSqlStatementId(statement.id);
        setLoadedSqlTemplateMeta({
            name: statement.name,
            description: (statement.description || '').trim()
        });
        setSqlSavedSnapshot({ id: statement.id, normalizedSql: normalizeSql(statement.sql_text) });
        setSqlOutputView('result');
        setShowSqlAssist(false);
        await SystemRepository.markSqlStatementUsed(statement.id);
        if (runImmediately) {
            await executeSqlText(statement.sql_text);
        }
        await loadSqlStatements();
    }, [executeSqlText, fixedMode, forwardSqlToWorkspace, loadSqlStatements, normalizeSql, resetSqlOutputState, setShowSqlAssist]);
    const handleOpenSqlStatement = useCallback(async (statement: SqlStatementRecord, runImmediately: boolean) => {
        const proceed = await confirmSaveBeforeReplaceSql();
        if (!proceed) return;
        await applySqlStatement(statement, runImmediately);
    }, [applySqlStatement, confirmSaveBeforeReplaceSql]);

    useEffect(() => {
        if (hasRestoredLastOpenSqlRef.current) return;
        if (mode !== 'sql' && fixedMode !== 'sql') return;
        if (!sqlStatements.length) {
            if (sqlStatementsLoaded) {
                hasRestoredLastOpenSqlRef.current = true;
                finishSqlHeaderHydration();
            }
            return;
        }
        hasRestoredLastOpenSqlRef.current = true;
        if (activeSqlStatementId) {
            finishSqlHeaderHydration();
            return;
        }
        if (!lastOpenSqlStatementId) {
            finishSqlHeaderHydration();
            return;
        }
        const statement = sqlStatements.find((stmt) => stmt.id === lastOpenSqlStatementId);
        if (!statement) {
            finishSqlHeaderHydration();
            return;
        }
        const statementSqlNormalized = normalizeSql(statement.sql_text);
        if (!inputSql.trim()) {
            void applySqlStatement(statement, false).finally(() => {
                finishSqlHeaderHydration();
            });
            return;
        }
        setActiveSqlStatementId(statement.id);
        setLoadedSqlTemplateMeta({
            name: statement.name,
            description: (statement.description || '').trim()
        });
        // Keep base snapshot tied to the restored statement. If SQL differs, dirty state remains true.
        setSqlSavedSnapshot({ id: statement.id, normalizedSql: statementSqlNormalized });
        finishSqlHeaderHydration();
    }, [
        activeSqlStatementId,
        applySqlStatement,
        finishSqlHeaderHydration,
        fixedMode,
        inputSql,
        normalizeSql,
        lastOpenSqlStatementId,
        mode,
        sqlStatementsLoaded,
        setLoadedSqlTemplateMeta,
        setSqlSavedSnapshot,
        sqlStatements
    ]);
    useEffect(() => {
        return () => {
            if (sqlHeaderHydrationTimerRef.current !== null) {
                window.clearTimeout(sqlHeaderHydrationTimerRef.current);
                sqlHeaderHydrationTimerRef.current = null;
            }
        };
    }, []);

    const toggleAssistantPanel = useCallback((panel: 'table' | 'columns' | 'aggregation' | 'grouping' | 'filter' | 'sorting' | 'preview') => {
        setAssistantPanels(prev => ({
            ...prev,
            [panel]: !prev[panel]
        }));
    }, [setAssistantPanels]);

    const handleDeleteSqlStatement = useCallback(async (statement: SqlStatementRecord) => {
        const linkedWidgets = (userWidgets || []).filter(
            (widget) => typeof widget.sql_statement_id === 'string' && widget.sql_statement_id === statement.id
        );
        const dependencyHint = linkedWidgets.length > 0
            ? t('datainspector.sql_delete_confirm_with_widget_dependency', {
                count: linkedWidgets.length,
                defaultValue: 'Dieses SQL-Statement wird aktuell in {{count}} Widget(s) verwendet. Diese Widgets würden dadurch fehlerhaft werden.'
            })
            : t('datainspector.sql_delete_confirm_without_dependency', 'Dieses SQL-Statement wird aktuell in keinem Widget verwendet.');

        const confirmMessage = `${t('datainspector.custom_template_delete_confirm')}\n\n${dependencyHint}`;
        if (!(await appDialog.confirm(confirmMessage, { title: t('common.confirm_title', 'Sind Sie sicher?') }))) return;
        await SystemRepository.deleteSqlStatement(statement.id);
        if (activeSqlStatementId === statement.id) {
            setActiveSqlStatementId('');
            setLoadedSqlTemplateMeta({ name: '', description: '' });
        }
        await loadSqlStatements();
    }, [activeSqlStatementId, loadSqlStatements, t, userWidgets]);

    const handleRenameSqlStatement = useCallback(async (statement: SqlStatementRecord) => {
        const prompted = await appDialog.prompt2(
            t('datainspector.rename_template_prompt'),
            t('common.description', 'Description'),
            {
                title: t('datainspector.rename_template'),
                defaultValue: statement.name,
                secondDefaultValue: statement.description || '',
                secondPlaceholder: t('datainspector.custom_template_description_prompt', 'SQL statement description (optional):')
            }
        );
        if (!prompted) return;
        const nextName = prompted.value.trim();
        const nextDescription = prompted.secondValue.trim();
        if (!nextName) return;
        if (nextName === statement.name && nextDescription === (statement.description || '').trim()) return;
        const conflicting = sqlStatements.find(
            stmt => stmt.id !== statement.id && stmt.name.toLowerCase() === nextName.toLowerCase() && stmt.scope === statement.scope
        );
        if (conflicting && !(await appDialog.confirm(t('datainspector.custom_template_overwrite_confirm', { name: nextName })))) return;
        if (conflicting) {
            await SystemRepository.deleteSqlStatement(conflicting.id);
        }
        await SystemRepository.saveSqlStatement({
            id: statement.id,
            name: nextName,
            sql_text: statement.sql_text,
            description: nextDescription,
            scope: statement.scope,
            tags: statement.tags,
            is_favorite: Number(statement.is_favorite) === 1
        });
        await loadSqlStatements();
    }, [loadSqlStatements, sqlStatements, t]);

    const handleExportCurrentRows = useCallback(() => {
        if (!items || items.length === 0) return;
        const timestamp = new Date().toISOString().slice(0, 10);
        const exportRows = items.map((row) => {
            const cleaned = { ...row };
            delete cleaned._rowid;
            return cleaned;
        });
        exportToExcel(exportRows, `export_${timestamp}`, 'Export');
    }, [items]);
    const canExportCurrentRows = React.useMemo(() => {
        if (loading || !items || items.length === 0) return false;
        if (mode === 'sql') return Boolean(sqlExecutionSql.trim());
        return true;
    }, [items, loading, mode, sqlExecutionSql]);

    const sqlWorkspaceEmptyMessage = React.useMemo(() => {
        if (!sqlExecutionSql.trim()) {
            return t('datainspector.sql_empty_before_run', 'Noch keine Abfrage ausgeführt. Bitte SQL ausführen, um Ergebnisse zu sehen.');
        }
        if (lastSqlRunHasSelect === false) {
            return t('datainspector.sql_empty_non_select', 'Abfrage erfolgreich ausgeführt. Für diesen Befehl gibt es kein tabellarisches Ergebnis.');
        }
        return t('datainspector.sql_empty_select_no_rows', 'Abfrage ausgeführt, aber keine Daten gefunden. Prüfe Filter, JOINs oder WHERE-Bedingungen.');
    }, [lastSqlRunHasSelect, sqlExecutionSql, t]);

    const applyTableSideFilter = useCallback(() => {
        const column = tableFilterColumn.trim();
        if (!column) return;
        setTableFilters(prev => ({
            ...prev,
            [column]: tableFilterValue
        }));
        setShowTableFilters(true);
    }, [setShowTableFilters, tableFilterColumn, tableFilterValue]);

    const clearTableSideFilter = useCallback((column: string) => {
        setTableFilters(prev => {
            const next = { ...prev };
            delete next[column];
            return next;
        });
    }, []);

    const clearAllTableSideFilters = useCallback(() => {
        setTableFilters({});
        setSearchTerm('');
        setShowTableFilters(false);
        setTableFilterValue('');
    }, [setShowTableFilters]);

    const openTableToolsTab = useCallback((tab: 'tables' | 'columns' | 'filters') => {
        setTableToolsTab(tab);
        setShowTableTools(true);
    }, [setShowTableTools, setTableToolsTab]);

    const buildFieldPickerSql = useCallback((columns: string[]) => {
        const safeTable = selectedTable.replace(/"/g, '""');
        const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;
        const selectList = columns.length > 0 ? columns.map(quoteIdentifier).join(', ') : '*';
        return `SELECT ${selectList}\nFROM "${safeTable}"\nLIMIT 100`;
    }, [selectedTable]);

    const applyFieldPickerSql = useCallback(async (runImmediately: boolean) => {
        if (tableSelectedColumns.length === 0) {
            await appDialog.info(t('datainspector.table_tools_pick_fields_required', 'Select at least one field.'));
            return;
        }
        const sql = buildFieldPickerSql(tableSelectedColumns);
        if (fixedMode === 'table') {
            forwardSqlToWorkspace(sql);
            return;
        }
        setMode('sql');
        setInputSql(sql);
        setSqlOutputView('result');
        setShowTableTools(false);
        if (runImmediately) {
            await executeSqlText(sql);
        }
    }, [buildFieldPickerSql, executeSqlText, fixedMode, forwardSqlToWorkspace, setShowTableTools, tableSelectedColumns, t]);

    const applyFieldPickerToTable = useCallback(async () => {
        if (tableSelectedColumns.length === 0) {
            await appDialog.info(t('datainspector.table_tools_pick_fields_required', 'Select at least one field.'));
            return;
        }
        setMode('table');
        setTableVisibleColumns(tableSelectedColumns);
        setShowTableTools(false);
    }, [setShowTableTools, tableSelectedColumns, t]);

    const sqlHighlightStyle = React.useMemo(() => {
        if (isDarkEditor) {
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
    }, [isDarkEditor]);

    const sqlEditorTheme = React.useMemo(
        () => {
            const activeLineDark = sqlEditorThemeIntensity === 'subtle' ? 'rgba(96, 165, 250, 0.08)' : sqlEditorThemeIntensity === 'high' ? 'rgba(96, 165, 250, 0.18)' : 'rgba(96, 165, 250, 0.12)';
            const activeLineLight = sqlEditorThemeIntensity === 'subtle' ? 'rgba(59, 130, 246, 0.05)' : sqlEditorThemeIntensity === 'high' ? 'rgba(59, 130, 246, 0.14)' : 'rgba(59, 130, 246, 0.08)';
            const selectionDark = sqlEditorThemeIntensity === 'subtle' ? 'rgba(96, 165, 250, 0.18)' : sqlEditorThemeIntensity === 'high' ? 'rgba(96, 165, 250, 0.34)' : 'rgba(96, 165, 250, 0.24)';
            const selectionLight = sqlEditorThemeIntensity === 'subtle' ? 'rgba(59, 130, 246, 0.18)' : sqlEditorThemeIntensity === 'high' ? 'rgba(59, 130, 246, 0.34)' : 'rgba(59, 130, 246, 0.25)';
            return EditorView.theme({
                '&': {
                    fontSize: `${Math.max(12, Math.min(15, sqlEditorFontSize))}px`,
                    borderRadius: '0.5rem',
                    backgroundColor: isDarkEditor ? '#0b1220' : '#f8fafc',
                    color: isDarkEditor ? '#e2e8f0' : '#0f172a'
                },
                '.cm-editor': {
                    backgroundColor: `${isDarkEditor ? '#0b1220' : '#f8fafc'} !important`,
                    color: isDarkEditor ? '#e2e8f0' : '#0f172a'
                },
                '.cm-scroller': {
                    overflowY: 'scroll',
                    overflowX: 'auto',
                    overscrollBehavior: 'contain',
                    scrollbarWidth: 'auto',
                    scrollbarColor: isDarkEditor ? '#38bdf8 #0f172a' : '#38bdf8 #1e293b',
                    scrollbarGutter: 'stable both-edges',
                    backgroundColor: `${isDarkEditor ? '#0b1220' : '#f8fafc'} !important`,
                    paddingRight: '2px',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                },
                '.cm-content': {
                    padding: '1rem',
                    backgroundColor: `${isDarkEditor ? '#0b1220' : '#f8fafc'} !important`,
                    color: isDarkEditor ? '#e2e8f0' : '#0f172a',
                    caretColor: isDarkEditor ? '#60a5fa' : '#2563eb'
                },
                '.cm-focused': {
                    outline: 'none'
                },
                '.cm-activeLine': {
                    backgroundColor: sqlEditorHighlightActiveLine ? (isDarkEditor ? activeLineDark : activeLineLight) : 'transparent'
                },
                '.cm-selectionLayer .cm-selectionBackground': {
                    backgroundColor: isDarkEditor ? `${selectionDark} !important` : `${selectionLight} !important`
                },
                '.cm-content ::selection': {
                    backgroundColor: isDarkEditor ? `${selectionDark} !important` : `${selectionLight} !important`
                },
                '.cm-line::selection, .cm-line > span::selection': {
                    backgroundColor: isDarkEditor ? `${selectionDark} !important` : `${selectionLight} !important`
                },
                '.cm-gutters': {
                    backgroundColor: `${isDarkEditor ? '#0b1220' : '#f8fafc'} !important`,
                    border: 'none',
                    color: isDarkEditor ? '#94a3b8' : '#64748b'
                },
                '.cm-cursor, .cm-dropCursor': {
                    borderLeftColor: isDarkEditor ? '#60a5fa' : '#2563eb'
                },
                '.cm-tooltip': {
                    borderRadius: '0.5rem',
                    border: `1px solid ${isDarkEditor ? '#334155' : '#cbd5e1'}`,
                    backgroundColor: isDarkEditor ? '#0f172a' : '#ffffff',
                    color: isDarkEditor ? '#e2e8f0' : '#0f172a',
                    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.25)'
                },
                '.cm-tooltip-autocomplete > ul > li': {
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    fontSize: '12px'
                },
                '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
                    backgroundColor: isDarkEditor ? 'rgba(37, 99, 235, 0.35)' : 'rgba(59, 130, 246, 0.16)',
                    color: isDarkEditor ? '#dbeafe' : '#1e3a8a'
                }
            }, { dark: isDarkEditor });
        },
        [isDarkEditor, sqlEditorFontSize, sqlEditorHighlightActiveLine, sqlEditorThemeIntensity]
    );

    const resetSqlEditorScroll = useCallback(() => {
        const view = sqlEditorViewRef.current;
        if (!view) return;
        view.scrollDOM.scrollTop = 0;
        view.scrollDOM.scrollLeft = 0;
    }, []);

    const clampSqlEditorHeight = useCallback((height: number) => {
        if (typeof window === 'undefined') return Math.max(120, height);
        const viewportMax = Math.max(180, Math.floor(window.innerHeight * 0.55));
        return Math.max(120, Math.min(viewportMax, height));
    }, []);

    useEffect(() => {
        const view = sqlEditorViewRef.current;
        if (!view) return;
        if (view.hasFocus) return;
        const rafId = window.requestAnimationFrame(() => {
            resetSqlEditorScroll();
            view.requestMeasure();
        });
        return () => window.cancelAnimationFrame(rafId);
    }, [activeSqlStatementId, inputSql, resetSqlEditorScroll]);

    const sqlCompletionSource = useCallback(
        (context: CompletionContext) => {
            if (mode !== 'sql' || !autocompleteEnabled) return null;

            const tokenMatch = context.matchBefore(/["A-Za-z_][A-Za-z0-9_."-]*/);
            if (!tokenMatch && !context.explicit) return null;

            const from = tokenMatch ? tokenMatch.from : context.pos;
            const typedRaw = tokenMatch ? tokenMatch.text : '';
            const prefix = typedRaw.replace(/"/g, '').toLowerCase();
            const beforeCursor = context.state.doc
                .sliceString(Math.max(0, context.pos - 120), context.pos)
                .toUpperCase();

            const tableContext = /\b(FROM|JOIN|INTO|UPDATE|TABLE)\s+["A-Z0-9_]*$/.test(beforeCursor);
            const columnContext =
                /\b(SELECT|WHERE|AND|OR|ON|HAVING|BY|ORDER BY|GROUP BY)\s+["A-Z0-9_.,\s]*$/.test(beforeCursor) ||
                /\.\s*["A-Z0-9_]*$/.test(beforeCursor);

            const schemaTables = sqlEditorSchemaHints ? tables : [];
            const schemaColumns = sqlEditorSchemaHints ? (selectedTableSchema || []).map(col => col.name) : [];
            const options: Completion[] = [];
            const seen = new Set<string>();
            const addOption = (label: string, type: Completion['type'], boost = 0, applyValue?: string) => {
                const key = `${type}:${label.toLowerCase()}`;
                if (seen.has(key)) return;
                seen.add(key);
                options.push({ label, type, boost, apply: applyValue || label });
            };

            if (tableContext) {
                for (const name of schemaTables) {
                    if (!prefix || name.toLowerCase().startsWith(prefix)) addOption(name, 'variable', 99);
                }
                for (const keyword of SQL_KEYWORDS) {
                    if (!prefix || keyword.toLowerCase().startsWith(prefix)) {
                        const apply = sqlEditorUppercaseKeywords ? keyword.toUpperCase() : keyword.toLowerCase();
                        addOption(keyword, 'keyword', 80, apply);
                    }
                }
            } else if (columnContext) {
                for (const col of schemaColumns) {
                    if (!prefix || col.toLowerCase().startsWith(prefix)) addOption(col, 'property', 99);
                }
                for (const keyword of SQL_KEYWORDS) {
                    if (!prefix || keyword.toLowerCase().startsWith(prefix)) {
                        const apply = sqlEditorUppercaseKeywords ? keyword.toUpperCase() : keyword.toLowerCase();
                        addOption(keyword, 'keyword', 80, apply);
                    }
                }
                for (const name of schemaTables) {
                    if (!prefix || name.toLowerCase().startsWith(prefix)) addOption(name, 'variable', 70);
                }
            } else {
                for (const keyword of SQL_KEYWORDS) {
                    if (!prefix || keyword.toLowerCase().startsWith(prefix)) {
                        const apply = sqlEditorUppercaseKeywords ? keyword.toUpperCase() : keyword.toLowerCase();
                        addOption(keyword, 'keyword', 90, apply);
                    }
                }
                for (const name of schemaTables) {
                    if (!prefix || name.toLowerCase().startsWith(prefix)) addOption(name, 'variable', 80);
                }
                for (const col of schemaColumns) {
                    if (!prefix || col.toLowerCase().startsWith(prefix)) addOption(col, 'property', 70);
                }
            }

            if (options.length === 0 && !context.explicit) return null;
            return {
                from,
                options: options.slice(0, 40),
                validFor: /^[A-Za-z0-9_."-]*$/
            };
        },
        [autocompleteEnabled, mode, selectedTableSchema, sqlEditorSchemaHints, sqlEditorUppercaseKeywords, tables]
    );

    const sqlEditorExtensions = React.useMemo(() => {
        const extensions = [sqlLang(), sqlEditorTheme, EditorState.tabSize.of(Math.max(2, Math.min(4, sqlEditorTabSize)))];
        if (sqlEditorSyntaxHighlight) {
            extensions.push(syntaxHighlighting(sqlHighlightStyle));
        }
        if (sqlEditorLineWrap) {
            extensions.push(EditorView.lineWrapping);
        }
        if (sqlEditorIndentWithTab) {
            extensions.push(keymap.of([indentWithTab]));
        }
        if (autocompleteEnabled) {
            extensions.push(
                autocompletion({
                    override: [sqlCompletionSource],
                    activateOnTyping: sqlEditorAutocompleteTyping,
                    maxRenderedOptions: 12
                })
            );
        }
        return extensions;
    }, [
        autocompleteEnabled,
        sqlCompletionSource,
        sqlEditorAutocompleteTyping,
        sqlEditorIndentWithTab,
        sqlEditorLineWrap,
        sqlEditorSyntaxHighlight,
        sqlEditorTabSize,
        sqlEditorTheme,
        sqlHighlightStyle
    ]);

    const sqlEditorBasicSetup = React.useMemo(() => ({
        lineNumbers: sqlEditorLineNumbers,
        foldGutter: false,
        highlightActiveLine: sqlEditorHighlightActiveLine,
        highlightActiveLineGutter: sqlEditorLineNumbers && sqlEditorHighlightActiveLine
    }), [sqlEditorHighlightActiveLine, sqlEditorLineNumbers]);

    const readonlySqlPreviewBasicSetup = React.useMemo(() => ({
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false
    }), []);

    const handleSqlEditorChange = useCallback((value: string) => {
        setInputSql(value);
        setSqlOutputView((prev) => (prev === 'explain' ? prev : 'explain'));
    }, [setInputSql]);

    useEffect(() => {
        const next = sqlEditorRememberHeight ? storedSqlEditorHeight : 160;
        setSqlEditorHeight(clampSqlEditorHeight(next));
    }, [clampSqlEditorHeight, sqlEditorRememberHeight, storedSqlEditorHeight]);

    useEffect(() => {
        const syncHeight = () => {
            setSqlEditorHeight((prev) => clampSqlEditorHeight(prev));
        };
        syncHeight();
        window.addEventListener('resize', syncHeight);
        return () => window.removeEventListener('resize', syncHeight);
    }, [clampSqlEditorHeight]);

    useEffect(() => {
        if (!sqlEditorRememberHeight) return;
        if (sqlEditorHeight === storedSqlEditorHeight) return;
        const persistTimer = window.setTimeout(() => {
            setStoredSqlEditorHeight(clampSqlEditorHeight(sqlEditorHeight));
        }, 180);
        return () => window.clearTimeout(persistTimer);
    }, [clampSqlEditorHeight, sqlEditorHeight, sqlEditorRememberHeight, storedSqlEditorHeight, setStoredSqlEditorHeight]);

    const profiling = React.useMemo(() => {
        if (mode !== 'table' || !items || items.length === 0) return [];
        const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/i;
        const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
        const dateLike = (value: string) => {
            const looksDate = /^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{2}[./-]\d{2}[./-]\d{2,4}$/.test(value);
            if (!looksDate) return false;
            const parsed = Date.parse(value.replace(/\./g, '-'));
            return !Number.isNaN(parsed);
        };

        const keys = Object.keys(items[0]).filter(k => k !== '_rowid');
        return keys.map((key) => {
            const values = items.map(r => r[key]);
            const nonNull = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
            const nullCount = values.length - nonNull.length;
            const nullRate = values.length > 0 ? (nullCount / values.length) * 100 : 0;

            const normalized = nonNull.map(v => String(v).trim());
            const distinctCount = new Set(normalized).size;

            const numericValues = nonNull
                .map(v => (typeof v === 'number' ? v : Number(v)))
                .filter(v => !Number.isNaN(v));
            const numberLikeCount = numericValues.length;

            const dateLikeCount = nonNull.filter(v => v instanceof Date || dateLike(String(v).trim())).length;

            let detectedType: 'number' | 'text' | 'date' | 'mixed' | 'unknown' = 'unknown';
            if (nonNull.length === 0) {
                detectedType = 'unknown';
            } else {
                const numberRatio = numberLikeCount / nonNull.length;
                const dateRatio = dateLikeCount / nonNull.length;
                if (numberRatio > 0.9) detectedType = 'number';
                else if (dateRatio > 0.9) detectedType = 'date';
                else if (numberRatio > 0.1 || dateRatio > 0.1) detectedType = 'mixed';
                else detectedType = 'text';
            }

            const min = numericValues.length > 0 ? Math.min(...numericValues) : null;
            const max = numericValues.length > 0 ? Math.max(...numericValues) : null;

            const patternCounts = {
                email: normalized.filter(v => EMAIL_RE.test(v)).length,
                uuid: normalized.filter(v => UUID_RE.test(v)).length,
                iban: normalized.filter(v => IBAN_RE.test(v)).length,
                url: normalized.filter(v => URL_RE.test(v)).length,
                date: normalized.filter(v => dateLike(v)).length
            };
            const patterns = Object.entries(patternCounts)
                .filter(([, count]) => count >= 2 && count / Math.max(1, normalized.length) >= 0.2)
                .sort((a, b) => b[1] - a[1])
                .map(([name]) => name);

            const dominantPattern = Object.entries(patternCounts).sort((a, b) => b[1] - a[1])[0];
            const dominantPatternShare = dominantPattern ? dominantPattern[1] / Math.max(1, normalized.length) : 0;
            let suspiciousCount = 0;
            if (detectedType === 'number') suspiciousCount = Math.max(0, nonNull.length - numberLikeCount);
            else if (detectedType === 'date') suspiciousCount = Math.max(0, nonNull.length - dateLikeCount);
            else if (dominantPattern && dominantPattern[1] >= 3 && dominantPatternShare >= 0.6) {
                suspiciousCount = Math.max(0, nonNull.length - dominantPattern[1]);
            }

            const topMap = new Map<string, number>();
            normalized.forEach(v => {
                topMap.set(v, (topMap.get(v) || 0) + 1);
            });
            const topValues = Array.from(topMap.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);

            const highCardinality = nonNull.length > 0 ? (distinctCount / nonNull.length) * 100 > profilingThresholds.cardinalityRate : false;
            const issues: string[] = [];
            if (nullRate >= profilingThresholds.nullRate) issues.push('high_null');
            if (detectedType === 'mixed') issues.push('mixed_types');
            if (highCardinality) issues.push('high_cardinality');
            if (suspiciousCount > 0) issues.push('suspicious_values');

            return { key, distinctCount, nullRate, min, max, topValues, detectedType, patterns, suspiciousCount, issues };
        });
    }, [mode, items, profilingThresholds]);

    const profilingIssueCount = React.useMemo(
        () => profiling.reduce((sum, p) => sum + p.issues.length, 0),
        [profiling]
    );

    return (
        <PageLayout
            header={{
                title: pageTitle,
                subtitle: t('datainspector.subtitle', {
                    count: mode === 'sql' && sqlOutputView === 'explain'
                        ? explainRows.length
                        : mode === 'table' && tableResultTab === 'profiling'
                            ? profiling.length
                            : (items?.length || 0),
                    mode: mode === 'table' ? selectedTable : t('datainspector.sql_mode')
                }),
                refresh: {
                    onClick: () => {
                        if (mode === 'sql') {
                            void handleRunSql();
                            return;
                        }
                        void execute();
                    },
                    title: t('datainspector.refresh_title'),
                    disabled: mode === 'sql' ? !canRunSqlWorkspace : false,
                    loading
                },
                export: {
                    onExcelExport: handleExportCurrentRows,
                    excelDisabled: !canExportCurrentRows,
                    excelTitle: canExportCurrentRows
                        ? t('common.export_excel', 'Export Excel')
                        : t('common.not_available', 'Not available')
                },
                onBack,
                actions: (
                    <>
                        {inspectorReturnHash && (
                            <button
                                onClick={() => { navigate(inspectorReturnHash.replace(/^#/, '')); }}
                                className="h-10 flex items-center gap-2 px-3 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                                title={t('datainspector.back_to_dashboard')}
                            >
                                <ArrowLeft className="w-4 h-4" />
                                <span className="hidden sm:inline">{t('datainspector.back_to_dashboard')}</span>
                            </button>
                        )}
                        {!modeLocked && (
                            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                                <button
                                    onClick={() => {
                                        setMode('table');
                                        execute();
                                    }}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === 'table' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                >
                                    <TableIcon className="w-4 h-4" />
                                    {t('datainspector.table_mode')}
                                </button>
                                <button
                                    onClick={() => {
                                        setMode('sql');
                                        setSqlOutputView(explainMode ? 'explain' : 'result');
                                        if (!inputSql) setInputSql(`SELECT * FROM ${selectedTable} LIMIT 10`);
                                    }}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === 'sql' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                >
                                    <Code className="w-4 h-4" />
                                    {t('datainspector.sql_mode')}
                                </button>
                            </div>
                        )}

                    </>
                ),
            }}
            rightPanel={{
                title: mode === 'table'
                    ? t('datainspector.table_tools', 'Table Tools')
                    : t('datainspector.assistant_tab', 'SQL Builder'),
                enabled: mode === 'table' || (mode === 'sql' && sqlWorkspaceTab === 'editor'),
                triggerTitle: mode === 'table'
                    ? t('datainspector.table_tools', 'Table Tools')
                    : t('datainspector.assistant_tab', 'SQL Builder'),
                width: 'sm',
                isOpen: mode === 'table' ? showTableTools : showSqlAssist,
                onOpenChange: mode === 'table' ? setShowTableTools : setShowSqlAssist,
                content: (
                    mode === 'table' ? (
                    <div className="h-full min-h-0 flex flex-col gap-4">
                        <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 flex-shrink-0">
                            <button
                                type="button"
                                onClick={() => setTableToolsTab('tables')}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${tableToolsTab === 'tables' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                            >
                                {t('datainspector.table_tools_tab_tables', 'Tables')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setTableToolsTab('columns')}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${tableToolsTab === 'columns' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                            >
                                {t('datainspector.table_tools_tab_columns', 'Columns')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setTableToolsTab('filters')}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${tableToolsTab === 'filters' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                            >
                                {t('datainspector.table_tools_tab_filters', 'Filters')}
                            </button>
                        </div>

                        {tableToolsTab === 'tables' && (
                            <div className="flex-1 min-h-0 flex flex-col gap-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {t('datainspector.table_tools_tables_hint', 'Activate and manage physical tables.')}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={openCreateTableModal}
                                        className="h-8 px-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/30 inline-flex items-center gap-1.5"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        {t('querybuilder.start_new', 'Neu')}
                                    </button>
                                </div>
                                <div className="flex-1 min-h-0 overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-700">
                                    {physicalTables.length === 0 ? (
                                        <div className="p-3 text-xs text-slate-400 dark:text-slate-500">{t('common.no_data')}</div>
                                    ) : (
                                        physicalTables.map((table) => {
                                            const isActive = selectedTable === table.name;
                                            return (
                                                <div key={table.name} className={`p-3 flex items-center justify-between gap-3 ${isActive ? 'bg-blue-50/40 dark:bg-blue-900/15' : ''}`}>
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{table.name}</div>
                                                        <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">{table.type}</div>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => activateTableFromTools(table.name)}
                                                            className={`h-7 w-7 inline-flex items-center justify-center rounded border ${isActive ? 'border-blue-300 dark:border-blue-700 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                                                            title={t('datainspector.table_tools_activate_table', 'Activate table')}
                                                            aria-label={t('datainspector.table_tools_activate_table', 'Activate table')}
                                                        >
                                                            <FolderOpen className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { void handleClearTableFromTools(table.name); }}
                                                            className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                                                            title={t('datainspector.table_tools_clear_table', 'Clear table')}
                                                            aria-label={t('datainspector.table_tools_clear_table', 'Clear table')}
                                                        >
                                                            <Eraser className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openCreateIndexModal(table.name)}
                                                            className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                                                            title={t('datasource.create_index_title', 'Create index')}
                                                            aria-label={t('datasource.create_index_title', 'Create index')}
                                                        >
                                                            <ListPlus className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { void handleDropTableFromTools(table.name); }}
                                                            className="h-7 w-7 inline-flex items-center justify-center rounded border border-rose-300/80 dark:border-rose-800/80 bg-rose-50/40 dark:bg-rose-900/20 hover:bg-rose-100/60 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-300"
                                                            title={t('datainspector.table_tools_delete_table', 'Delete table')}
                                                            aria-label={t('datainspector.table_tools_delete_table', 'Delete table')}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}

                        {tableToolsTab === 'columns' && (
                            <div className="flex-1 min-h-0 flex flex-col gap-2">
                                <p className="text-xs text-slate-500 dark:text-slate-400">{t('datainspector.table_tools_columns_hint', 'Inspect schema and set sorting per column.')}</p>
                                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-2 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
                                            {t('datainspector.table_tools_field_picker', 'Field Picker')}
                                        </span>
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                            {t('datainspector.table_tools_selected_count', { count: tableSelectedColumns.length, defaultValue: '{{count}} selected' })}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setTableSelectedColumns((selectedTableSchema || []).map(col => col.name))}
                                            className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                                            title={t('datainspector.table_tools_select_all_fields', 'Select all')}
                                            aria-label={t('datainspector.table_tools_select_all_fields', 'Select all')}
                                        >
                                            <ListChecks className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTableSelectedColumns([])}
                                            className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                                            title={t('datainspector.table_tools_clear_field_selection', 'Clear')}
                                            aria-label={t('datainspector.table_tools_clear_field_selection', 'Clear')}
                                        >
                                            <Eraser className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { void applyFieldPickerSql(false); }}
                                            className="h-7 px-2 inline-flex items-center gap-1 text-[11px] rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                                        >
                                            <ArrowRight className="w-3.5 h-3.5" />
                                            {t('datainspector.sql_assist', 'SQL Workspace')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { void applyFieldPickerToTable(); }}
                                            className="h-7 w-7 inline-flex items-center justify-center text-[11px] rounded border border-blue-200 bg-blue-600 hover:bg-blue-700 text-white"
                                            title={t('datainspector.table_tools_apply_to_table', 'Apply to Table')}
                                            aria-label={t('datainspector.table_tools_apply_to_table', 'Apply to Table')}
                                        >
                                            <Play className="w-3.5 h-3.5 fill-current" />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 min-h-0 overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-700">
                                    {(selectedTableSchema || []).length === 0 ? (
                                        <div className="p-3 text-xs text-slate-400 dark:text-slate-500">{t('common.no_data')}</div>
                                    ) : (
                                        (selectedTableSchema || []).map(col => {
                                            const isSortedColumn = tableSortConfig?.key === col.name;
                                            const sortDirection = isSortedColumn ? tableSortConfig?.direction : null;
                                            const isSelectedColumn = tableSelectedColumns.includes(col.name);
                                            return (
                                            <div
                                                key={col.name}
                                                className={`p-3 flex items-center justify-between gap-2 ${isSortedColumn ? 'bg-blue-50/40 dark:bg-blue-900/15' : ''}`}
                                            >
                                                <div className="min-w-0 flex items-center gap-2">
                                                    <label className="inline-flex items-center gap-2 min-w-0 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelectedColumn}
                                                            onChange={() => {
                                                                setTableSelectedColumns(prev => (
                                                                    prev.includes(col.name)
                                                                        ? prev.filter(name => name !== col.name)
                                                                        : [...prev, col.name]
                                                                ));
                                                            }}
                                                            className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                                                        />
                                                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{col.name}</span>
                                                    </label>
                                                    {isSortedColumn && (
                                                        <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                                                            {sortDirection === 'asc' ? 'ASC' : 'DESC'}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">{col.type || '-'}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setTableSortConfig({ key: col.name, direction: 'asc' })}
                                                        className={`h-7 px-2 text-[11px] rounded border ${isSortedColumn && sortDirection === 'asc' ? 'border-blue-300 dark:border-blue-800 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                                                        title={t('datainspector.table_tools_sort_asc', 'Sort ascending')}
                                                    >
                                                        ASC
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setTableSortConfig({ key: col.name, direction: 'desc' })}
                                                        className={`h-7 px-2 text-[11px] rounded border ${isSortedColumn && sortDirection === 'desc' ? 'border-blue-300 dark:border-blue-800 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                                                        title={t('datainspector.table_tools_sort_desc', 'Sort descending')}
                                                    >
                                                        DESC
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                        })
                                    )}
                                </div>
                            </div>
                        )}

                        {tableToolsTab === 'filters' && (
                            <div className="flex-1 min-h-0 flex flex-col gap-3">
                                <p className="text-xs text-slate-500 dark:text-slate-400">{t('datainspector.table_tools_filters_hint', 'Manage global search and column filters.')}</p>
                                <label className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{t('datainspector.table_tools_global_search', 'Global Search')}</label>
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder={t('datainspector.search_placeholder')}
                                    className="w-full h-9 px-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                                    <div className="space-y-1">
                                        <label className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{t('datainspector.table_tools_column', 'Column')}</label>
                                        <select
                                            value={tableFilterColumn}
                                            onChange={(e) => setTableFilterColumn(e.target.value)}
                                            className="w-full h-9 px-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none"
                                        >
                                            {(selectedTableSchema || []).map(col => (
                                                <option key={col.name} value={col.name}>{col.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{t('datainspector.table_tools_filter_value', 'Filter')}</label>
                                        <input
                                            type="text"
                                            value={tableFilterValue}
                                            onChange={(e) => setTableFilterValue(e.target.value)}
                                            className="w-full h-9 px-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={applyTableSideFilter}
                                        className="h-9 px-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/30"
                                    >
                                        {t('datainspector.table_tools_filter_apply', 'Apply')}
                                    </button>
                                </div>
                                <div className="flex items-center justify-between">
                                    <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                        <input
                                            type="checkbox"
                                            checked={showTableFilters}
                                            onChange={(e) => setShowTableFilters(e.target.checked)}
                                        />
                                        {t('datainspector.table_tools_toggle_filter_row', 'Show filter row in table')}
                                    </label>
                                    <button
                                        type="button"
                                        onClick={clearAllTableSideFilters}
                                        className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                    >
                                        {t('datainspector.table_tools_clear_all', 'Clear all')}
                                    </button>
                                </div>
                                <div className="flex-1 min-h-0 overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-700">
                                    {Object.keys(tableFilters).length === 0 ? (
                                        <div className="p-3 text-xs text-slate-400 dark:text-slate-500">{t('datainspector.table_tools_no_filters', 'No active column filters')}</div>
                                    ) : (
                                        Object.entries(tableFilters).map(([col, val]) => (
                                            <div key={col} className="p-3 flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{col}</div>
                                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{val || '-'}</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => clearTableSideFilter(col)}
                                                    className="h-7 px-2 text-[11px] rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                                                >
                                                    {t('common.remove', 'Remove')}
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                    </div>
                    ) : (
                    <div className="h-full min-h-0 flex flex-col gap-4">
                        <div className="h-full min-h-0 flex flex-col">
                            <div className="flex-1 min-h-0 overflow-auto pr-1 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-slate-500 dark:text-slate-400">{t('datainspector.assistant_hint', 'Build SQL by selecting table, columns and optional aggregation.')}</p>
                                <button
                                    type="button"
                                    onClick={resetAssistantBuilder}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] hover:bg-slate-50 dark:hover:bg-slate-700"
                                >
                                    <Eraser className="w-3 h-3" />
                                    {t('datainspector.assistant_reset', 'Reset')}
                                </button>
                            </div>
                                <div className="space-y-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/40 px-2 py-2">
                                    <button
                                        type="button"
                                        onClick={() => toggleAssistantPanel('table')}
                                        className="w-full flex items-center justify-between text-left rounded-md px-1 py-1 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                                    >
                                        <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{t('datainspector.assistant_table', 'Table')}</span>
                                        <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform ${assistantPanels.table ? 'rotate-180' : ''}`} />
                                    </button>
                                    {assistantPanels.table && (
                                    <select
                                        value={assistantTable}
                                        onChange={(e) => setAssistantTable(e.target.value)}
                                        className="w-full h-9 px-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        {tables.map(table => (
                                            <option key={table} value={table}>{table}</option>
                                        ))}
                                    </select>
                                    )}
                                </div>

                                <div className="space-y-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/40 px-2 py-2">
                                    <button
                                        type="button"
                                        onClick={() => toggleAssistantPanel('columns')}
                                        className="w-full flex items-center justify-between text-left rounded-md px-1 py-1 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                                    >
                                        <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{t('datainspector.assistant_columns', 'Columns')}</span>
                                        <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform ${assistantPanels.columns ? 'rotate-180' : ''}`} />
                                    </button>
                                    {assistantPanels.columns && (
                                    <>
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setAssistantSelectedColumns(assistantColumns)}
                                                className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                            >
                                                {t('datainspector.assistant_select_all', 'Select all')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setAssistantSelectedColumns([])}
                                                className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                            >
                                                {t('datainspector.assistant_clear_all', 'Clear')}
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            value={assistantColumnSearch}
                                            onChange={(e) => setAssistantColumnSearch(e.target.value)}
                                            placeholder={t('datainspector.assistant_column_search_placeholder', 'Search columns...')}
                                            className="w-full h-8 px-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 outline-none"
                                        />
                                        <div className="max-h-28 overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg p-2 space-y-1">
                                            {filteredAssistantColumns.map(col => (
                                                <label key={col} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                                    <input
                                                        type="checkbox"
                                                        checked={assistantSelectedColumns.includes(col)}
                                                        onChange={() => {
                                                            setAssistantSelectedColumns(prev => (
                                                                prev.includes(col) ? prev.filter(item => item !== col) : [...prev, col]
                                                            ));
                                                        }}
                                                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 accent-blue-600 dark:accent-blue-500 focus:ring-blue-500/50 [color-scheme:light] dark:[color-scheme:dark]"
                                                    />
                                                    <span className="font-mono">{col}</span>
                                                </label>
                                            ))}
                                            {filteredAssistantColumns.length === 0 && (
                                                <p className="text-[11px] text-slate-400 dark:text-slate-500 px-1 py-0.5">{t('datainspector.sql_manager_no_results', 'No matches')}</p>
                                            )}
                                        </div>
                                    </>
                                    )}
                                </div>

                                <div className="space-y-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/40 px-2 py-2">
                                    <button
                                        type="button"
                                        onClick={() => toggleAssistantPanel('aggregation')}
                                        className="w-full flex items-center justify-between text-left rounded-md px-1 py-1 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                                    >
                                        <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{t('datainspector.assistant_aggregation', 'Aggregation')}</span>
                                        <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform ${assistantPanels.aggregation ? 'rotate-180' : ''}`} />
                                    </button>
                                    {assistantPanels.aggregation && (
                                    <>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <label className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{t('datainspector.assistant_aggregation_function', 'Function')}</label>
                                                <select
                                                    value={assistantAggregation}
                                                    onChange={(e) => setAssistantAggregation(e.target.value as 'none' | 'count' | 'sum' | 'avg' | 'min' | 'max')}
                                                    className="w-full h-9 px-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none"
                                                >
                                                    <option value="none">{t('datainspector.assistant_none', 'None')}</option>
                                                    <option value="count">COUNT</option>
                                                    <option value="sum">SUM</option>
                                                    <option value="avg">AVG</option>
                                                    <option value="min">MIN</option>
                                                    <option value="max">MAX</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{t('datainspector.assistant_aggregation_field', 'Aggregation Field')}</label>
                                                <select
                                                    value={assistantAggregationColumn}
                                                    disabled={assistantAggregation === 'none' || assistantAggregation === 'count'}
                                                    onChange={(e) => setAssistantAggregationColumn(e.target.value)}
                                                    className="w-full h-9 px-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none disabled:opacity-40"
                                                >
                                                    <option value="">-</option>
                                                    {assistantColumns.map(col => (
                                                        <option key={col} value={col}>{col}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </>
                                    )}
                                </div>

                                <div className="space-y-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/40 px-2 py-2">
                                    <button
                                        type="button"
                                        onClick={() => toggleAssistantPanel('grouping')}
                                        disabled={!isAggregationActive}
                                        className="w-full flex items-center justify-between text-left rounded-md px-1 py-1 hover:bg-slate-100/70 dark:hover:bg-slate-800/70 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{t('datainspector.assistant_group_by', 'Group by')}</span>
                                        <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform ${assistantPanels.grouping ? 'rotate-180' : ''}`} />
                                    </button>
                                    {!isAggregationActive ? (
                                        <p className="text-[11px] text-slate-400 dark:text-slate-500 px-1 py-1">{t('datainspector.assistant_grouping_requires_aggregation', 'Enable aggregation to configure grouping.')}</p>
                                    ) : assistantPanels.grouping && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <label className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{t('datainspector.assistant_grouping_columns', 'Grouping Columns')}</label>
                                            <div className="max-h-20 overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg p-2 space-y-1">
                                                {assistantColumns.map(col => (
                                                    <label key={col} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                                        <input
                                                            type="checkbox"
                                                            checked={assistantGroupByColumns.includes(col)}
                                                            onChange={() => {
                                                                setAssistantGroupByColumns(prev => (
                                                                    prev.includes(col) ? prev.filter(item => item !== col) : [...prev, col]
                                                                ));
                                                            }}
                                                            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 accent-blue-600 dark:accent-blue-500 focus:ring-blue-500/50 [color-scheme:light] dark:[color-scheme:dark]"
                                                        />
                                                        <span className="font-mono">{col}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{t('datainspector.assistant_metric_alias', 'Metric Alias')}</label>
                                            <input
                                                type="text"
                                                value={assistantMetricAlias}
                                                onChange={(e) => setAssistantMetricAlias(e.target.value)}
                                                className="w-full h-9 px-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none [color-scheme:light] dark:[color-scheme:dark] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                        </div>
                                    </div>
                                    )}
                                </div>

                                <div className="space-y-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/40 px-2 py-2">
                                    <button
                                        type="button"
                                        onClick={() => toggleAssistantPanel('filter')}
                                        className="w-full flex items-center justify-between text-left rounded-md px-1 py-1 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                                    >
                                        <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{t('datainspector.assistant_filter', 'Filter')}</span>
                                        <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform ${assistantPanels.filter ? 'rotate-180' : ''}`} />
                                    </button>
                                    {assistantPanels.filter && (
                                    <>
                                        <div className="flex items-center justify-end">
                                            <button
                                                type="button"
                                                onClick={addAssistantFilter}
                                                className="h-7 px-2 inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] hover:bg-slate-50 dark:hover:bg-slate-700"
                                            >
                                                <Plus className="w-3 h-3" />
                                                {t('datainspector.assistant_add_filter', 'Add filter')}
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {assistantFilters.map((filter, index) => (
                                                <div key={filter.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-white/60 dark:bg-slate-900/40 space-y-2">
                                                    <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-2">
                                                        {index > 0 ? (
                                                            <select
                                                                value={filter.connector}
                                                                onChange={(e) => updateAssistantFilter(filter.id, { connector: e.target.value as 'AND' | 'OR' })}
                                                                className="h-9 px-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 outline-none"
                                                            >
                                                                <option value="AND">AND</option>
                                                                <option value="OR">OR</option>
                                                            </select>
                                                        ) : (
                                                            <div className="h-9 flex items-center text-[11px] font-semibold text-slate-400 dark:text-slate-500 px-1">WHERE</div>
                                                        )}
                                                        <select
                                                            value={filter.column}
                                                            onChange={(e) => updateAssistantFilter(filter.id, { column: e.target.value })}
                                                            className="h-9 px-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none"
                                                        >
                                                            <option value="">{t('datainspector.assistant_sort_field', 'Field')}</option>
                                                            {assistantColumns.map(col => (
                                                                <option key={col} value={col}>{col}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="grid grid-cols-[110px_minmax(0,1fr)_auto] gap-2">
                                                        <select
                                                            value={filter.operator}
                                                            onChange={(e) => updateAssistantFilter(filter.id, { operator: e.target.value as AssistantFilter['operator'] })}
                                                            className="h-9 px-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none"
                                                        >
                                                            <option value="=">=</option>
                                                            <option value="!=">!=</option>
                                                            <option value=">">&gt;</option>
                                                            <option value=">=">&gt;=</option>
                                                            <option value="<">&lt;</option>
                                                            <option value="<=">&lt;=</option>
                                                            <option value="LIKE">LIKE</option>
                                                            <option value="NOT LIKE">NOT LIKE</option>
                                                            <option value="IS NULL">IS NULL</option>
                                                            <option value="IS NOT NULL">IS NOT NULL</option>
                                                        </select>
                                                        <input
                                                            type="text"
                                                            value={filter.value}
                                                            onChange={(e) => updateAssistantFilter(filter.id, { value: e.target.value })}
                                                            placeholder={t('datainspector.assistant_filter_value', 'Value')}
                                                            disabled={filter.operator === 'IS NULL' || filter.operator === 'IS NOT NULL'}
                                                            className="h-9 px-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none disabled:opacity-40"
                                                        />
                                                        <div className="h-9 flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => moveAssistantFilter(filter.id, 'up')}
                                                                disabled={index === 0}
                                                                className="h-9 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40"
                                                                title={t('common.move_up', 'Move up')}
                                                            >
                                                                <ArrowUp className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => moveAssistantFilter(filter.id, 'down')}
                                                                disabled={index === assistantFilters.length - 1}
                                                                className="h-9 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40"
                                                                title={t('common.move_down', 'Move down')}
                                                            >
                                                                <ArrowDown className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeAssistantFilter(filter.id)}
                                                                className="h-9 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                                                                title={t('datainspector.assistant_clear_all', 'Clear')}
                                                            >
                                                                <Eraser className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <label className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{t('datainspector.assistant_where', 'WHERE')}</label>
                                                <select
                                                    value={assistantWhereConnector}
                                                    onChange={(e) => setAssistantWhereConnector(e.target.value as 'AND' | 'OR')}
                                                    className="h-7 px-2 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-[11px] text-slate-700 dark:text-slate-200 outline-none"
                                                    title={t('datainspector.assistant_where_connector', 'Join with filters')}
                                                >
                                                    <option value="AND">AND</option>
                                                    <option value="OR">OR</option>
                                                </select>
                                            </div>
                                            <input
                                                type="text"
                                                value={assistantWhereClause}
                                                onChange={(e) => setAssistantWhereClause(e.target.value)}
                                                placeholder={t('datainspector.assistant_where_placeholder', "status = 'active'")}
                                                className="w-full h-9 px-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none"
                                            />
                                        </div>
                                    </>
                                    )}
                                </div>

                                <div className="space-y-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/40 px-2 py-2">
                                    <button
                                        type="button"
                                        onClick={() => toggleAssistantPanel('sorting')}
                                        className="w-full flex items-center justify-between text-left rounded-md px-1 py-1 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                                    >
                                        <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{t('datainspector.assistant_order_by', 'Order by')}</span>
                                        <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform ${assistantPanels.sorting ? 'rotate-180' : ''}`} />
                                    </button>
                                    {assistantPanels.sorting && (
                                    <>
                                        <div className="flex items-center justify-end">
                                            <button
                                                type="button"
                                                onClick={addAssistantSort}
                                                className="h-7 px-2 inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] hover:bg-slate-50 dark:hover:bg-slate-700"
                                            >
                                                <Plus className="w-3 h-3" />
                                                {t('datainspector.assistant_add_sort', 'Add sort')}
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {assistantSorts.map((sort, index) => (
                                                <div key={sort.id} className="grid grid-cols-[minmax(0,1fr)_110px_auto] gap-2">
                                                    <select
                                                        value={sort.column}
                                                        onChange={(e) => updateAssistantSort(sort.id, { column: e.target.value })}
                                                        className="h-9 px-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none"
                                                    >
                                                        <option value="">{t('datainspector.assistant_auto', 'Auto')}</option>
                                                        {assistantAggregation !== 'none' && (
                                                            <option value={assistantMetricAlias || 'metric_value'}>{assistantMetricAlias || 'metric_value'}</option>
                                                        )}
                                                        {assistantColumns.map(col => (
                                                            <option key={col} value={col}>{col}</option>
                                                        ))}
                                                    </select>
                                                    <select
                                                        value={sort.direction}
                                                        onChange={(e) => updateAssistantSort(sort.id, { direction: e.target.value as 'ASC' | 'DESC' })}
                                                        className="h-9 px-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none"
                                                    >
                                                        <option value="DESC">DESC</option>
                                                        <option value="ASC">ASC</option>
                                                    </select>
                                                    <div className="h-9 flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => moveAssistantSort(sort.id, 'up')}
                                                            disabled={index === 0}
                                                            className="h-9 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40"
                                                            title={t('common.move_up', 'Move up')}
                                                        >
                                                            <ArrowUp className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => moveAssistantSort(sort.id, 'down')}
                                                            disabled={index === assistantSorts.length - 1}
                                                            className="h-9 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40"
                                                            title={t('common.move_down', 'Move down')}
                                                        >
                                                            <ArrowDown className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeAssistantSort(sort.id)}
                                                            className="h-9 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                                                            title={t('datainspector.assistant_clear_all', 'Clear')}
                                                        >
                                                            <Eraser className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{t('datainspector.assistant_limit', 'Limit')}</label>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={String(assistantLimit)}
                                                onChange={(e) => {
                                                    const digitsOnly = e.target.value.replace(/[^\d]/g, '');
                                                    setAssistantLimit(Number(digitsOnly || 1));
                                                }}
                                                className="w-full h-9 px-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none"
                                            />
                                        </div>
                                    </>
                                    )}
                                </div>

                                <div className="space-y-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/40 px-2 py-2">
                                    <button
                                        type="button"
                                        onClick={() => toggleAssistantPanel('preview')}
                                        className="w-full flex items-center justify-between text-left rounded-md px-1 py-1 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                                    >
                                        <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{t('datainspector.assistant_generated_sql', 'Generated SQL')}</span>
                                        <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform ${assistantPanels.preview ? 'rotate-180' : ''}`} />
                                    </button>
                                    {assistantPanels.preview && (
                                    <div className="h-32 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                                        <CodeMirror
                                            value={assistantSqlPreview}
                                            height="128px"
                                            editable={false}
                                            basicSetup={readonlySqlPreviewBasicSetup}
                                            extensions={sqlEditorExtensions}
                                        />
                                    </div>
                                    )}
                                </div>

                            </div>

                            <div className="mt-3 -mx-5 -mb-5 px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-blue-50/40 dark:bg-blue-950/20">
                            <div className="flex flex-wrap justify-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => { void applyAssistantSql('replace'); }}
                                    className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs hover:bg-slate-50 dark:hover:bg-slate-700"
                                >
                                    {t('datainspector.assistant_replace_editor', 'Replace Editor')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { void applyAssistantSql('run'); }}
                                    disabled={!canRunAssistantSql}
                                    className={`px-3 py-1.5 rounded-md border text-xs transition-colors ${canRunAssistantSql
                                        ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                                        : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                        }`}
                                >
                                    {t('datainspector.run_sql')}
                                </button>
                            </div>
                            </div>
                        </div>
                    </div>
                    )
                )
            }}
            footer={footerText}
            breadcrumbs={[
                { label: pageBreadcrumb }
            ]}
            fillHeight
        >
            {/* Loading Bar at Top */}
            <div className="fixed top-0 left-0 w-full h-[3px] bg-blue-100 dark:bg-blue-900/30 z-[100] overflow-hidden">
                {loading && (
                    <div className="h-full bg-blue-600 dark:bg-blue-400 animate-pulse" style={{ width: '40%' }} />
                )}
            </div>

            {mode === 'sql' && (
                <div className="border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-8 px-1">
                        <button
                            type="button"
                            onClick={() => setSqlWorkspaceTab('manage')}
                            className={`relative py-3 text-sm font-bold transition-colors ${sqlWorkspaceTab === 'manage'
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                        >
                            {t('datainspector.sql_workspace_tab_manage', 'SQL-Statements verwalten')}
                            {sqlWorkspaceTab === 'manage' && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-blue-600 dark:bg-blue-400" />}
                        </button>
                        <button
                            type="button"
                            onClick={() => setSqlWorkspaceTab('editor')}
                            className={`relative py-3 text-sm font-bold transition-colors ${sqlWorkspaceTab === 'editor'
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                        >
                            {t('datainspector.sql_workspace_tab_editor', 'SQL-Statements erstellen')}
                            {sqlWorkspaceTab === 'editor' && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-blue-600 dark:bg-blue-400" />}
                        </button>
                    </div>
                </div>
            )}

            {/* SQL Workspace main panels */}
            {mode === 'sql' && (sqlWorkspaceTab === 'editor' ? (
                <div className="-mt-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
                    <div className="border-b border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-gradient-to-r dark:from-slate-800/95 dark:to-slate-800/85">
                        <div className="p-3 flex items-center justify-between gap-2">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                                {sqlWorkspaceHeaderTitle}
                            </h3>
                            {activeSqlTemplateMeta.description && (
                                <p
                                    className="max-w-[55%] text-[11px] text-slate-500 dark:text-slate-400 truncate text-right"
                                    title={activeSqlTemplateMeta.description}
                                >
                                    {activeSqlTemplateMeta.description}
                                </p>
                            )}
                        </div>
                        <div className="px-3 pb-2 border-t border-slate-300 dark:border-slate-600/90">
                            <div className="pt-2 flex items-center justify-between gap-2">
                                <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto whitespace-nowrap pr-1">
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const proceed = await confirmSaveBeforeReplaceSql();
                                            if (!proceed) return;
                                            handleClearSqlWorkspace();
                                        }}
                                        disabled={!canResetSqlWorkspace}
                                        title={t('common.new', 'Neu')}
                                        className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${canResetSqlWorkspace
                                            ? 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-100'
                                            : 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 cursor-not-allowed'
                                            }`}
                                    >
                                        <Plus className="w-3 h-3" />
                                        <span className="hidden xl:inline">{t('common.new', 'Neu')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedOpenSqlId(activeSqlStatementId || '');
                                            setIsSqlOpenDialogOpen(true);
                                        }}
                                        title={t('common.open', 'Öffnen')}
                                        className="px-2 py-1.5 rounded text-[10px] font-bold border bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-100 transition-colors flex items-center justify-center gap-1"
                                    >
                                        <FolderOpen className="w-3 h-3" />
                                        <span className="hidden xl:inline">{t('common.open', 'Öffnen')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveCustomTemplate}
                                        disabled={!canSaveCurrentSql}
                                        title={t('common.save', 'Speichern')}
                                        className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${canSaveCurrentSql
                                            ? 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-100'
                                            : 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 cursor-not-allowed'
                                            }`}
                                    >
                                        <Save className="w-3 h-3" />
                                        <span className="hidden xl:inline">{t('common.save', 'Speichern')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { void handleSaveSqlAs(); }}
                                        title={t('datainspector.save_as', 'Speichern unter')}
                                        className="px-2 py-1.5 rounded text-[10px] font-bold border bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-100 transition-colors flex items-center justify-center gap-1"
                                    >
                                        <Download className="w-3 h-3" />
                                        <span className="hidden xl:inline">{t('datainspector.save_as', 'Speichern unter')}</span>
                                    </button>
                                    <div className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
                                    <button
                                        type="button"
                                        onClick={() => { void handleRunSql(); }}
                                        disabled={!canRunSqlWorkspace}
                                        title={canRunSqlWorkspace ? t('datainspector.run_sql', 'Ausführen') : t('common.not_available', 'Not available')}
                                        className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${canRunSqlWorkspace
                                            ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                                            : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                            }`}
                                    >
                                        {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
                                        <span className="hidden xl:inline">{t('datainspector.run_sql', 'Ausführen')}</span>
                                    </button>
                                    <div className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowSqlAssist(true);
                                        }}
                                        title={t('datainspector.assistant_tab', 'SQL Builder')}
                                        className="px-2 py-1.5 rounded text-[10px] font-bold border bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-100 transition-colors flex items-center justify-center gap-1"
                                    >
                                        <Code className="w-3 h-3" />
                                        <span className="hidden xl:inline">{t('datainspector.assistant_tab', 'SQL Builder')}</span>
                                    </button>
                                </div>
                                <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto whitespace-nowrap pl-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const next = !sqlWorkspaceSplitView;
                                            setSqlWorkspaceSplitView(next);
                                            if (next && sqlWorkspaceView === 'sql') {
                                                setSqlWorkspaceView(sqlOutputView === 'explain' ? 'explain' : 'result');
                                            }
                                        }}
                                        className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${sqlWorkspaceSplitView
                                            ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700'
                                            : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                            }`}
                                        title={t('datainspector.sql_split_view_toggle', 'Split-Ansicht')}
                                    >
                                        <PanelsTopBottom className="w-3 h-3" />
                                        <span className="hidden xl:inline">{t('datainspector.sql_split_view_short', 'Split')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (sqlWorkspaceSplitView) setSqlWorkspaceSplitView(false);
                                            setSqlWorkspaceView('sql');
                                        }}
                                        title={t('datainspector.sql_mode', 'SQL')}
                                        className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${!sqlWorkspaceSplitView && sqlWorkspaceView === 'sql'
                                            ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700'
                                            : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                            }`}
                                    >
                                        <Code className="w-3 h-3" />
                                        <span className="hidden xl:inline">{t('datainspector.sql_mode', 'SQL')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSqlOutputView('result');
                                            setSqlWorkspaceView('result');
                                        }}
                                        title={t('datainspector.output_results', 'Ergebnisse')}
                                        className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${sqlWorkspaceView === 'result'
                                            ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700'
                                            : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                            }`}
                                    >
                                        <TableIcon className="w-3 h-3" />
                                        <span className="hidden xl:inline">{t('datainspector.output_results', 'Ergebnisse')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSqlOutputView('explain');
                                            setSqlWorkspaceView('explain');
                                        }}
                                        title={t('datainspector.output_explain', 'Explain')}
                                        className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${sqlWorkspaceView === 'explain'
                                            ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700'
                                            : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                            }`}
                                    >
                                        <Search className="w-3 h-3" />
                                        <span className="hidden xl:inline">{t('datainspector.output_explain', 'Explain')}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div ref={sqlSplitContainerRef} className="flex-1 min-h-0 overflow-hidden flex flex-col">
                    {showSqlEditorPane && (
                        <div
                            ref={sqlEditorPaneRef}
                            className={`overflow-visible flex flex-col relative min-h-0 ${sqlWorkspaceSplitView ? 'shrink-0' : 'flex-1'}`}
                            style={sqlWorkspaceSplitView ? { height: `${sqlSplitTopHeight}px` } : undefined}
                        >
                            <div
                                className="w-full flex-1 bg-slate-50 dark:bg-[#0b1220] overflow-visible text-slate-800 dark:text-slate-200 min-h-0 pr-1"
                                style={
                                    sqlWorkspaceSplitView
                                        ? { height: '100%', minHeight: 0 }
                                        : { height: '100%', minHeight: `${Math.max(120, sqlEditorHeight)}px` }
                                }
                            >
                                <CodeMirror
                                    className="sql-editor-cm"
                                    value={inputSql}
                                    height={`${Math.max(120, sqlWorkspaceSplitView ? sqlSplitTopHeight : sqlEditorHeight)}px`}
                                    onCreateEditor={(view) => {
                                        sqlEditorViewRef.current = view;
                                        view.scrollDOM.classList.add('custom-scrollbar');
                                        view.scrollDOM.classList.add('container-scrollbar');
                                    }}
                                    basicSetup={sqlEditorBasicSetup}
                                    extensions={sqlEditorExtensions}
                                    placeholder={t('datainspector.sql_placeholder')}
                                    onChange={handleSqlEditorChange}
                                />
                            </div>
                        </div>
                    )}

                    {sqlWorkspaceSplitView && showSqlEditorPane && showSqlOutputPane && (
                        <button
                            type="button"
                            onMouseDown={startSqlSplitResize}
                            className="h-[10px] shrink-0 border-y border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 cursor-row-resize flex items-center justify-center text-slate-400 dark:text-slate-500"
                            title={t('datainspector.split_resize', 'Bereiche groesse aendern')}
                        >
                            <GripHorizontal className="w-3 h-3" />
                        </button>
                    )}

                    {sqlLimitNotice && (
                        <div className="mx-3 mt-3 px-3 py-2 text-xs rounded-md border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 flex items-start justify-between gap-3">
                            <span>{sqlLimitNotice}</span>
                            <button
                                type="button"
                                onClick={() => {
                                    setSqlLimitNotice('');
                                    setSqlLimitNoticeDismissed(true);
                                }}
                                className="shrink-0 text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 font-bold leading-none"
                                aria-label={t('common.close', 'Close')}
                                title={t('common.close', 'Close')}
                            >
                                x
                            </button>
                        </div>
                    )}

                    {showSqlOutputPane && (
                        <div className={`flex-1 overflow-hidden flex flex-col relative min-h-0 ${sqlWorkspaceSplitView ? 'border-t border-slate-200 dark:border-slate-700' : ''}`}>
                            {loading && items && items.length > 0 && sqlOutputView !== 'explain' && (
                                <div className="absolute inset-0 bg-white/40 dark:bg-slate-800/40 z-10 flex items-center justify-center backdrop-blur-[1px]">
                                    <div className="bg-white dark:bg-slate-900 p-4 rounded-full shadow-xl border border-slate-100 dark:border-slate-700">
                                        <RefreshCw className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 overflow-hidden flex flex-col relative min-h-0">
                                {sqlOutputView === 'explain' ? (
                                    explainLoading ? (
                                        <div className="flex-1 flex items-center justify-center p-6 text-xs text-slate-400 gap-2">
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                            {t('common.loading')}
                                        </div>
                                    ) : explainError ? (
                                        <div className="flex-1 p-4 text-xs text-rose-600">{explainError}</div>
                                    ) : explainRows.length === 0 ? (
                                        <div className="flex-1 p-4 text-xs text-slate-400">{t('datainspector.explain_empty')}</div>
                                    ) : (
                                        <div className="flex-1 overflow-auto custom-scrollbar">
                                            <table className="w-full text-xs min-w-[520px]">
                                                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-300 uppercase text-[10px] z-[1] border-b border-slate-200 dark:border-slate-700">
                                                    <tr>
                                                        {Object.keys(explainRows[0]).map(col => (
                                                            <th key={col} className="text-left px-2 py-1.5">{col}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {explainRows.map((row, idx) => (
                                                        <tr key={idx} className="border-t border-slate-100 dark:border-slate-700">
                                                            {Object.keys(explainRows[0]).map(col => (
                                                                <td key={col} className="px-2 py-1.5 text-slate-600 dark:text-slate-300">{String(row[col] ?? '')}</td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )
                                ) : (
                                    <DataTable
                                        data={items || []}
                                        columns={columns}
                                        searchTerm=""
                                        emptyMessage={sqlWorkspaceEmptyMessage}
                                        onRowClick={(item) => setSelectedItem(item)}
                                        rounded={false}
                                        bordered={false}
                                        headerContainerClassName="bg-slate-100 dark:bg-slate-700/90 border-b border-slate-300 dark:border-slate-600"
                                        headerTextClassName="text-slate-500 dark:text-slate-100"
                                        bodyContainerClassName="dark:bg-slate-900"
                                    />
                                )}
                            </div>
                        </div>
                    )}
                    </div>

                    <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/90">
                        <div className="flex items-center justify-between gap-3 flex-wrap text-[10px] text-slate-500 dark:text-slate-400">
                            <div className="min-w-0 inline-flex items-center gap-1 text-left">
                                <span className="font-semibold uppercase tracking-wide">{t('datainspector.active_sql_statement', 'SQL-Statement')}:</span>
                                {activeSqlTemplateMeta.name ? (
                                    <>
                                        <span className="font-medium text-slate-700 dark:text-slate-200">
                                            {activeSqlTemplateMeta.name}
                                        </span>
                                        <span
                                            className="truncate max-w-[22rem]"
                                            title={activeSqlTemplateMeta.description || t('datainspector.no_template_description', 'No description')}
                                        >
                                            {activeSqlTemplateMeta.description
                                                ? `(${activeSqlTemplateMeta.description})`
                                                : `(${t('datainspector.no_template_description', 'No description')})`}
                                        </span>
                                    </>
                                ) : (
                                    <span>-</span>
                                )}
                                <span className="mx-1 text-slate-300 dark:text-slate-600">|</span>
                                <span className="font-semibold uppercase tracking-wide">{t('datainspector.active_id', 'ID')}:</span>
                                <code className="font-mono text-[10px]" title={activeSqlStatementId || '-'}>
                                    {activeSqlStatementId || '-'}
                                </code>
                                <span className="mx-1 text-slate-300 dark:text-slate-600">|</span>
                                <span className="font-semibold uppercase tracking-wide">{t('datainspector.last_saved_at', 'Letzte Speicherung')}:</span>
                                <code className="font-mono text-[10px]" title={lastSqlSavedAtLabel}>
                                    {lastSqlSavedAtLabel}
                                </code>
                            </div>
                            <div className="inline-flex items-center gap-1 whitespace-nowrap ml-auto text-right">
                                <span>{t('datainspector.sql_assist', 'SQL Workspace')}:</span>
                                <span>{sqlStatements.length} {t('datainspector.sql_statements_label', 'SQL-Statements')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="-mt-2 flex-1 min-h-0 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                    <div className="h-full min-h-0 flex flex-col">
                        <div className="shrink-0 border-b border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-gradient-to-r dark:from-slate-800/95 dark:to-slate-800/85">
                            <div className="p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="relative w-full max-w-sm">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                        <input
                                            value={sqlLibrarySearch}
                                            onChange={(e) => setSqlLibrarySearch(e.target.value)}
                                            placeholder={t('datainspector.sql_manager_search_placeholder', 'Search patterns...')}
                                            className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div className="inline-flex items-center gap-2 shrink-0">
                                        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                            {t('datainspector.sql_manager_sort_label', 'Sort')}
                                        </label>
                                        <select
                                            value={sqlLibrarySort}
                                            onChange={(e) => setSqlLibrarySort(e.target.value as typeof sqlLibrarySort)}
                                            className="h-8 min-w-[180px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="updated_desc">{t('datainspector.sql_manager_sort_updated_desc', 'Last changed (newest first)')}</option>
                                            <option value="last_used_desc">{t('datainspector.sql_manager_sort_used_desc', 'Last used (newest first)')}</option>
                                            <option value="name_asc">{t('datainspector.sql_manager_sort_name_asc', 'Name (A-Z)')}</option>
                                            <option value="name_desc">{t('datainspector.sql_manager_sort_name_desc', 'Name (Z-A)')}</option>
                                            <option value="favorite_then_updated">{t('datainspector.sql_manager_sort_favorite', 'Favorites first')}</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 container-scrollbar">
                            {filteredSqlStatements.length === 0 ? (
                                <div className="h-full min-h-[240px] flex items-center justify-center text-xs text-slate-500">
                                    {t('datainspector.sql_manager_no_results', 'No matches')}
                                </div>
                            ) : (
                                filteredSqlStatements.map((statement) => (
                                    <div
                                        key={statement.id}
                                        className={`rounded-lg border px-3 py-2 flex items-start justify-between gap-3 ${
                                            sqlStatementIdsUsedInWidgets.has(statement.id)
                                                ? 'border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20'
                                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSqlWorkspaceTab('editor');
                                                void handleOpenSqlStatement(statement, false);
                                            }}
                                            className="min-w-0 text-left"
                                        >
                                            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate flex items-center gap-2">
                                                {statement.name}
                                                {Number(statement.is_favorite) === 1 && <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />}
                                                {sqlStatementIdsUsedInWidgets.has(statement.id) && (
                                                    <span
                                                        className="inline-flex items-center rounded-md border border-blue-200 dark:border-blue-800 bg-blue-100/70 dark:bg-blue-900/40 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-200"
                                                        title={t('datainspector.sql_statements_used_in_widgets', 'In Widgets verwendet')}
                                                    >
                                                        {(sqlWidgetUsageByStatementId.get(statement.id) || 0) === 1
                                                            ? t('datainspector.sql_statement_usage_single', 'In 1 Widget')
                                                            : t('datainspector.sql_statement_usage_multi', {
                                                                count: sqlWidgetUsageByStatementId.get(statement.id) || 0,
                                                                defaultValue: `In ${sqlWidgetUsageByStatementId.get(statement.id) || 0} Widgets`
                                                            })}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                {(statement.description || '').trim() || t('datainspector.no_template_description', 'No description')}
                                            </div>
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">
                                                {statement.sql_text || '-'}
                                            </div>
                                            <div className="text-[10px] text-slate-400 dark:text-slate-500">
                                                {t('datainspector.last_changed_at', 'Zuletzt geändert')}: {formatSqlTimestamp(statement.updated_at)}
                                            </div>
                                        </button>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSqlWorkspaceTab('editor');
                                                    void handleOpenSqlStatement(statement, false);
                                                }}
                                                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                title={t('common.open', 'Open')}
                                            >
                                                <FolderOpen className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSqlWorkspaceTab('editor');
                                                    void handleOpenSqlStatement(statement, true);
                                                }}
                                                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                                                title={t('datainspector.open_and_run', 'Open and run')}
                                            >
                                                <Play className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { void SystemRepository.setSqlStatementFavorite(statement.id, Number(statement.is_favorite) !== 1).then(loadSqlStatements); }}
                                                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                                title={Number(statement.is_favorite) === 1 ? t('datainspector.unpin') : t('datainspector.pin')}
                                                aria-label={Number(statement.is_favorite) === 1 ? t('datainspector.unpin') : t('datainspector.pin')}
                                            >
                                                <Star className={`w-4 h-4 ${Number(statement.is_favorite) === 1 ? 'fill-current' : ''}`} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { void handleRenameSqlStatement(statement); }}
                                                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                title={t('datainspector.rename_template')}
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { void handleDeleteSqlStatement(statement); }}
                                                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                                title={t('datainspector.delete_template')}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="shrink-0 px-3 py-2 border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/90">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
                                <span className="inline-flex items-center gap-1">
                                    <span className="font-semibold uppercase tracking-wide">{t('datainspector.sql_statements_label', 'SQL-Statements')}:</span>
                                    <code className="font-mono text-[10px]">{sqlTemplates.length}</code>
                                </span>
                                <span className="inline-flex items-center gap-1">
                                    <span className="font-semibold uppercase tracking-wide">{t('datainspector.sql_statements_used_in_widgets', 'In Widgets verwendet')}:</span>
                                    <code className="font-mono text-[10px]">{sqlStatementsUsedInWidgetsCount}</code>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            ))}

            {mode === 'table' && (
            <div
                className="flex-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col min-h-0 relative"
            >
                {/* Opaque loading overlay when refreshing results */}
                {loading && items && items.length > 0 && (
                    <div className="absolute inset-0 bg-white/40 dark:bg-slate-800/40 z-10 flex items-center justify-center backdrop-blur-[1px]">
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-full shadow-xl border border-slate-100 dark:border-slate-700">
                            <RefreshCw className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
                        </div>
                    </div>
                )}

                {mode === 'table' && (
                    <div className="px-4 py-2 border-b border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-gradient-to-r dark:from-slate-800/95 dark:to-slate-800/85 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="relative min-w-[220px] max-w-[320px] w-full">
                                <select
                                    value={selectedTable}
                                    onChange={(e) => {
                                        setSelectedTable(e.target.value);
                                        setSearchTerm('');
                                        setTableSortConfig(null);
                                        setTableFilters({});
                                        setShowTableFilters(false);
                                        setActiveViewId('');
                                        setCurrentPage(1);
                                    }}
                                    className="w-full h-8 appearance-none pl-9 pr-9 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer text-xs font-semibold"
                                >
                                    {dataSources?.map(source => (
                                        <option key={source.name} value={source.name}>
                                            {source.type === 'view' ? `${source.name} (view)` : source.name}
                                        </option>
                                    ))}
                                </select>
                                <Database className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 border-r-2 border-b-2 border-slate-400 rotate-45 pointer-events-none" />
                            </div>
                            <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1">
                            <button
                                onClick={() => setTableResultTab('data')}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${tableResultTab === 'data'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100'
                                    }`}
                            >
                                {t('datainspector.result_tab_data', 'Data')}
                            </button>
                            <button
                                onClick={() => setTableResultTab('profiling')}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${tableResultTab === 'profiling'
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100'
                                    }`}
                            >
                                {t('datainspector.result_tab_profile', 'Profiling')}
                            </button>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 min-w-0 ml-auto">
                            <span className="text-[11px] text-slate-400 whitespace-nowrap">
                                {tableResultTab === 'profiling'
                                    ? t('datainspector.profiling_issues', { count: profilingIssueCount })
                                    : t('datainspector.auto_limit', { limit: pageSize })}
                            </span>
                            <div className="relative min-w-[220px] max-w-[340px] w-full">
                                <input
                                    type="text"
                                    placeholder={t('datainspector.search_placeholder')}
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    className="w-full h-8 pl-9 pr-3 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                                />
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            </div>
                        </div>
                    </div>
                )}

                {mode === 'table' && tableResultTab === 'profiling' && (
                    <div className="px-4 py-2 border-b border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800/90 flex items-center justify-between gap-3 text-[11px]">
                        <div className="font-semibold uppercase tracking-wider text-slate-500">
                            {t('datainspector.profiling_settings', 'Profiling Settings')}
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                            <label className="flex items-center gap-1">
                                <span>{t('datainspector.null_threshold')}</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={profilingThresholds.nullRate}
                                    onChange={(e) => {
                                        const value = Number(e.target.value);
                                        if (Number.isNaN(value)) return;
                                        setProfilingThresholds({ ...profilingThresholds, nullRate: Math.max(0, Math.min(100, value)) });
                                    }}
                                    className="w-14 px-1.5 py-0.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 [color-scheme:light] dark:[color-scheme:dark]"
                                />
                                <span>%</span>
                            </label>
                            <label className="flex items-center gap-1">
                                <span>{t('datainspector.cardinality_threshold')}</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={profilingThresholds.cardinalityRate}
                                    onChange={(e) => {
                                        const value = Number(e.target.value);
                                        if (Number.isNaN(value)) return;
                                        setProfilingThresholds({ ...profilingThresholds, cardinalityRate: Math.max(0, Math.min(100, value)) });
                                    }}
                                    className="w-14 px-1.5 py-0.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 [color-scheme:light] dark:[color-scheme:dark]"
                                />
                                <span>%</span>
                            </label>
                            <button
                                onClick={() => setProfilingThresholds({ nullRate: 30, cardinalityRate: 95 })}
                                className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                            >
                                {t('datainspector.reset_thresholds')}
                            </button>
                        </div>
                    </div>
                )}

                {mode === 'table' && tableResultTab === 'data' && (
                    <div className="px-4 py-2 border-b border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800/90 flex items-center justify-between gap-3 text-[11px]">
                        <div className="inline-flex max-w-full items-center gap-2 overflow-x-auto whitespace-nowrap pr-1">
                            <button
                                onClick={() => openTableToolsTab('tables')}
                                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                                title={t('datainspector.table_tools_tab_tables', 'Tables')}
                                aria-label={t('datainspector.table_tools_tab_tables', 'Tables')}
                            >
                                <Database className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => openTableToolsTab('columns')}
                                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                                title={t('datainspector.table_tools_tab_columns', 'Columns')}
                                aria-label={t('datainspector.table_tools_tab_columns', 'Columns')}
                            >
                                <Table2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => openTableToolsTab('filters')}
                                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                                title={t('datainspector.table_tools_tab_filters', 'Filters')}
                                aria-label={t('datainspector.table_tools_tab_filters', 'Filters')}
                            >
                                <Filter className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => openCreateIndexModal()}
                                disabled={selectedSourceType !== 'table'}
                                className="h-8 px-3 text-[11px] font-bold rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1.5"
                                title={selectedSourceType !== 'table'
                                    ? t('datasource.view_type', 'VIEW')
                                    : t('datasource.create_index_title', 'Create index')}
                            >
                                <ListPlus className="w-3.5 h-3.5" />
                                <span className="hidden xl:inline">{t('datasource.create_index_btn', 'Create index')}</span>
                            </button>
                            <button
                                onClick={openCreateTableModal}
                                className="h-8 px-3 text-[11px] font-bold rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center gap-1.5"
                                title={t('datasource.create_table_title', 'Neue Tabelle')}
                            >
                                <Table2 className="w-3.5 h-3.5" />
                                <span className="hidden xl:inline">{t('datasource.create_table_title', 'Neue Tabelle')}</span>
                            </button>
                        </div>
                        <div className="inline-flex max-w-full items-center gap-2 justify-end overflow-x-auto whitespace-nowrap pl-1">
                            <div className="h-5 w-px bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
                            <span
                                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300"
                                title={t('datainspector.saved_views', 'Saved Views')}
                                aria-label={t('datainspector.saved_views', 'Saved Views')}
                            >
                                <ListChecks className="w-3.5 h-3.5" />
                            </span>
                            <select
                                value={activeViewId}
                                onChange={(e) => {
                                    const nextId = e.target.value;
                                    setActiveViewId(nextId);
                                    if (!nextId) return;
                                    const preset = savedViews.find(v => v.id === nextId);
                                    if (preset) applyViewPreset(preset);
                                }}
                                className="h-8 px-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-[11px] font-semibold outline-none min-w-[180px]"
                            >
                                <option value="">{t('datainspector.select_view')}</option>
                                {savedViews.map(view => (
                                    <option key={view.id} value={view.id}>{view.name}</option>
                                ))}
                            </select>
                            <button
                                onClick={handleSaveCurrentView}
                                title={activeViewId ? t('datainspector.update_view') : t('datainspector.save_view')}
                                className="h-8 px-3 text-[11px] font-bold rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center gap-1.5"
                            >
                                <Save className="w-3.5 h-3.5" />
                                <span className="hidden xl:inline">{activeViewId ? t('datainspector.update_view') : t('datainspector.save_view')}</span>
                            </button>
                            <button
                                onClick={handleDeleteCurrentView}
                                disabled={!activeViewId}
                                title={t('datainspector.delete_view')}
                                className="h-8 px-3 text-[11px] font-bold rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1.5"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span className="hidden xl:inline">{t('datainspector.delete_view')}</span>
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-hidden flex flex-col relative min-h-0">
                    {mode === 'table' && tableResultTab === 'profiling' ? (
                        profiling.length === 0 ? (
                            <div className="flex-1 p-4 text-xs text-slate-400">{t('datainspector.no_profile')}</div>
                        ) : (
                            <div className="flex-1 overflow-auto custom-scrollbar">
                                <table className="w-full text-xs min-w-[760px]">
                                    <thead className="text-slate-400 uppercase text-[10px] sticky top-0 bg-slate-50 dark:bg-slate-900 z-[1]">
                                        <tr>
                                            <th className="text-left py-1.5 px-2">{t('querybuilder.value')}</th>
                                            <th className="text-left py-1.5 px-2">{t('datainspector.type')}</th>
                                            <th className="text-left py-1.5 px-2">{t('datainspector.distinct_values')}</th>
                                            <th className="text-left py-1.5 px-2">{t('datainspector.null_rate')}</th>
                                            <th className="text-left py-1.5 px-2">{t('datainspector.min')}</th>
                                            <th className="text-left py-1.5 px-2">{t('datainspector.max')}</th>
                                            <th className="text-left py-1.5 px-2">{t('datainspector.top_values')}</th>
                                            <th className="text-left py-1.5 px-2">{t('datainspector.patterns')}</th>
                                            <th className="text-left py-1.5 px-2">{t('datainspector.suspicious_values')}</th>
                                            <th className="text-left py-1.5 px-2">{t('datainspector.issues')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {profiling.map(col => (
                                            <tr key={col.key} className="border-t border-slate-100 dark:border-slate-700">
                                                <td className="py-1.5 px-2 font-semibold text-slate-700 dark:text-slate-200">{col.key}</td>
                                                <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">{t(`datainspector.type_${col.detectedType}`)}</td>
                                                <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">{col.distinctCount}</td>
                                                <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">{col.nullRate.toFixed(1)}%</td>
                                                <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">{col.min ?? '-'}</td>
                                                <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">{col.max ?? '-'}</td>
                                                <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300 truncate max-w-[260px]" title={col.topValues.map(v => `${v[0]} (${v[1]})`).join(', ')}>
                                                    {col.topValues.length > 0 ? col.topValues.map(v => `${v[0]} (${v[1]})`).join(', ') : '-'}
                                                </td>
                                                <td className="py-1.5 px-2">
                                                    {col.patterns.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {col.patterns.map((pattern) => (
                                                                <span key={pattern} className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/25 dark:text-indigo-300 dark:border-indigo-700 text-[10px] font-semibold">
                                                                    {t(`datainspector.pattern_${pattern}`)}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400">-</span>
                                                    )}
                                                </td>
                                                <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">{col.suspiciousCount}</td>
                                                <td className="py-1.5 px-2">
                                                    {col.issues.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {col.issues.map(issue => (
                                                                <span key={issue} className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700 text-[10px] font-semibold">
                                                                    {t(`datainspector.issue_${issue}`)}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )
                    ) : loading && !items ? (
                        <div className="flex-1 flex items-center justify-center p-12 text-center text-slate-400 animate-pulse">
                            <div className="flex flex-col items-center gap-4">
                                <Search className="w-12 h-12 opacity-20" />
                                <p className="text-lg">{t('common.loading')}</p>
                            </div>
                        </div>
                    ) : (
                        <DataTable
                            data={items || []}
                            columns={columns}
                            searchTerm=""
                            emptyMessage={t('common.no_data')}
                            onRowClick={(item) => setSelectedItem(item)}
                            sortConfig={mode === 'table' ? tableSortConfig : undefined}
                            onSortConfigChange={mode === 'table' ? setTableSortConfig : undefined}
                            filters={mode === 'table' ? tableFilters : undefined}
                            onFiltersChange={mode === 'table' ? setTableFilters : undefined}
                            showFilters={mode === 'table' ? showTableFilters : undefined}
                            onShowFiltersChange={mode === 'table' ? setShowTableFilters : undefined}
                            columnWidths={mode === 'table' ? activeColumnWidths : undefined}
                            onColumnWidthsChange={mode === 'table' ? handleColumnWidthsChange : undefined}
                            rounded={false}
                            bordered={false}
                            headerContainerClassName="bg-slate-50 dark:bg-slate-800/90 border-b border-slate-300 dark:border-slate-600 dark:[&_th:first-child]:bg-slate-800/95"
                            headerTextClassName="text-slate-500 dark:text-slate-100"
                            bodyContainerClassName="bg-white dark:bg-[#0b1220] text-slate-700 dark:text-slate-100"
                        />
                    )}
                </div>
                <div className="px-4 py-2 border-t border-slate-300 dark:border-slate-600 text-[10px] flex justify-between items-center text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/90">
                    <div className="font-medium">
                        {mode === 'table' ? (
                            tableResultTab === 'profiling' ? (
                                t('datainspector.result_tab_profile', 'Profiling')
                            ) : (
                                <select
                                    value={String(pageSize)}
                                    onChange={(e) => {
                                        setPageSize(Number(e.target.value));
                                        setCurrentPage(1);
                                    }}
                                    className="h-7 px-2 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] outline-none"
                                    title={t('datainspector.page_size')}
                                >
                                    {[50, 100, 250, 500].map(size => (
                                        <option key={size} value={size}>{t('datainspector.page_size_value', { size })}</option>
                                    ))}
                                </select>
                            )
                        ) : t('datainspector.sql_mode')}
                    </div>
                    <div className="flex items-center gap-4">
                        {mode === 'table' && tableResultTab === 'data' && (
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage <= 1}
                                    className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 disabled:opacity-40"
                                >
                                    {t('datainspector.prev_page')}
                                </button>
                                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-300">
                                    {t('datainspector.page_info', {
                                        page: currentPage,
                                        pages: totalPages,
                                        total: tableTotalRows || 0
                                    })}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(p => p + 1)}
                                    disabled={currentPage >= totalPages}
                                    className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 disabled:opacity-40"
                                >
                                    {t('datainspector.next_page')}
                                </button>
                                <div className="flex items-center gap-1 ml-2">
                                    <input
                                        type="number"
                                        min={1}
                                        max={totalPages}
                                        value={pageJumpInput}
                                        onChange={(e) => setPageJumpInput(e.target.value)}
                                        placeholder={t('datainspector.page_number_placeholder')}
                                        className="w-16 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] outline-none [color-scheme:light] dark:[color-scheme:dark]"
                                    />
                                    <button
                                        onClick={() => {
                                            const parsed = Number(pageJumpInput);
                                            if (Number.isNaN(parsed)) return;
                                            const target = Math.max(1, Math.min(totalPages, Math.floor(parsed)));
                                            setCurrentPage(target);
                                            setPageJumpInput('');
                                        }}
                                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 text-[10px]"
                                    >
                                        {t('datainspector.go')}
                                    </button>
                                </div>
                            </div>
                        )}
                        <span className="flex items-center gap-1"><Database className="w-3 h-3" /> LiteBI Studio DB</span>
                        <span className="font-medium">
                            {t('common.results_count', {
                                count: mode === 'table' && tableResultTab === 'profiling'
                                        ? profiling.length
                                        : (items?.length || 0)
                            })}
                        </span>
                    </div>
                </div>
            </div>
            )}

            <SelectionListDialog
                isOpen={isSqlOpenDialogOpen}
                onClose={() => setIsSqlOpenDialogOpen(false)}
                title={t('datainspector.open_sql_statement_title', 'SQL-Statement öffnen')}
                searchValue={sqlLibrarySearch}
                onSearchChange={setSqlLibrarySearch}
                searchPlaceholder={t('datainspector.sql_manager_search_placeholder', 'Muster suchen...')}
                items={sqlOpenDialogItems}
                selectedId={selectedOpenSqlId}
                onSelect={setSelectedOpenSqlId}
                emptyLabel={t('datainspector.sql_manager_no_results', 'No matches')}
                onApply={() => {
                    const statement = sqlStatements.find((stmt) => stmt.id === selectedOpenSqlId);
                    if (!statement) return;
                    void handleOpenSqlStatement(statement, false);
                    setIsSqlOpenDialogOpen(false);
                }}
                applyDisabled={!selectedOpenSqlId}
                cancelLabel={t('common.cancel', 'Cancel')}
                applyLabel={t('common.apply', 'Apply')}
                sortOptions={[
                    { value: 'updated_desc', label: t('datainspector.sql_manager_sort_updated_desc', 'Last changed (newest first)') },
                    { value: 'last_used_desc', label: t('datainspector.sql_manager_sort_used_desc', 'Last used (newest first)') },
                    { value: 'name_asc', label: t('datainspector.sql_manager_sort_name_asc', 'Name (A-Z)') },
                    { value: 'name_desc', label: t('datainspector.sql_manager_sort_name_desc', 'Name (Z-A)') },
                    { value: 'favorite_then_updated', label: t('datainspector.sql_manager_sort_favorite', 'Favorites first') }
                ]}
                sortValue={sqlLibrarySort}
                onSortChange={(value) => setSqlLibrarySort(value as 'updated_desc' | 'name_asc' | 'name_desc' | 'last_used_desc' | 'favorite_then_updated')}
                sortLabel={t('datainspector.sql_manager_sort_label', 'Sort')}
                showPinnedOnlyToggle
                pinnedOnly={sqlOpenPinnedOnly}
                onPinnedOnlyToggle={setSqlOpenPinnedOnly}
                pinnedOnlyLabel={t('querybuilder.pinned_only', 'Pinned only')}
                isItemPinned={(id) => Number(sqlStatements.find((stmt) => stmt.id === id)?.is_favorite) === 1}
                onToggleItemPin={(id) => {
                    const statement = sqlStatements.find((stmt) => stmt.id === id);
                    if (!statement) return;
                    void SystemRepository
                        .setSqlStatementFavorite(id, Number(statement.is_favorite) !== 1)
                        .then(loadSqlStatements);
                }}
            />

            {/* Universal Record Detail Modal */}
            <RecordDetailModal
                isOpen={!!selectedItem}
                onClose={() => setSelectedItem(null)}
                items={items || []}
                initialIndex={items && selectedItem ? Math.max(0, items.indexOf(selectedItem)) : 0}
                title={t('common.details')}
                tableName={mode === 'table' ? selectedTable : undefined}
                schema={undefined}
            />

            <CreateTableModal
                isOpen={isCreateTableOpen}
                onClose={() => setIsCreateTableOpen(false)}
                tableName={newTableName}
                onTableNameChange={setNewTableName}
                columns={createColumns}
                onColumnsChange={setCreateColumns}
                onSubmit={() => { void handleCreateTableFromTools(); }}
            />

            <Modal
                isOpen={isCreateIndexOpen}
                onClose={() => {
                    if (isCreatingIndex) return;
                    setIsCreateIndexOpen(false);
                }}
                title={t('datasource.create_index_title_for_table', 'Create index for table {{name}}', { name: selectedTable })}
                headerActions={(
                    <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
                        <button
                            type="button"
                            onClick={() => setIndexModalTab('manual')}
                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${indexModalTab === 'manual' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        >
                            {t('datainspector.index_modal_tab_manual', 'Manual')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIndexModalTab('suggestions')}
                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${indexModalTab === 'suggestions' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        >
                            {t('datainspector.index_modal_tab_suggestions', 'Suggestions')}
                        </button>
                    </div>
                )}
            >
                <div className="h-[34rem] max-h-[calc(90vh-11rem)] flex flex-col gap-4">
                    <div className="flex-1 min-h-0 overflow-auto pr-1">
                        {indexModalTab === 'manual' && (
                            <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                                    {t('datasource.index_name', 'Index name')}
                                </label>
                                <input
                                    type="text"
                                    value={indexName}
                                    onChange={(e) => setIndexName(e.target.value)}
                                    className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                    placeholder={`idx_${selectedTable}_...`}
                                />
                            </div>

                            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                <input
                                    type="checkbox"
                                    checked={indexUnique}
                                    onChange={() => setIndexUnique(!indexUnique)}
                                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-blue-600 accent-blue-600 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]"
                                />
                                {t('datasource.index_unique', 'Unique index')}
                            </label>

                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
                                    {t('datasource.index_columns', 'Columns')}
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-auto border border-slate-200 dark:border-slate-700 rounded p-2 bg-slate-50 dark:bg-slate-900">
                                    {(selectedTableSchema || []).map((col) => (
                                        <label key={col.name} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                            <input
                                                type="checkbox"
                                                checked={indexColumns.includes(col.name)}
                                                onChange={() => toggleIndexColumn(col.name)}
                                                className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-blue-600 accent-blue-600 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]"
                                            />
                                            <span className="font-mono">{col.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {indexColumns.length > 0 && (
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
                                        {t('datasource.index_order', 'Column order')}
                                    </label>
                                    <div className="space-y-1 border border-slate-200 dark:border-slate-700 rounded p-2 bg-white dark:bg-slate-900">
                                        {indexColumns.map((col, idx) => (
                                            <div key={col} className="flex items-center justify-between text-sm">
                                                <span className="font-mono text-slate-700 dark:text-slate-200">{idx + 1}. {col}</span>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => moveIndexColumn(col, 'up')}
                                                        disabled={idx === 0}
                                                        className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40"
                                                    >
                                                        <ArrowUp className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => moveIndexColumn(col, 'down')}
                                                        disabled={idx === indexColumns.length - 1}
                                                        className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40"
                                                    >
                                                        <ArrowDown className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                                    {t('datasource.index_where_optional', 'WHERE (optional)')}
                                </label>
                                <input
                                    type="text"
                                    value={indexWhere}
                                    onChange={(e) => setIndexWhere(e.target.value)}
                                    className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                                    placeholder="status = 'open'"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
                                    {t('datainspector.index_preview_sql', 'SQL Preview')}
                                </label>
                                <div className="h-28 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                                    <CodeMirror
                                        value={manualIndexPreviewSql}
                                        height="112px"
                                        editable={false}
                                        basicSetup={readonlySqlPreviewBasicSetup}
                                        extensions={sqlEditorExtensions}
                                    />
                                </div>
                            </div>
                            </div>
                        )}

                        {indexModalTab === 'suggestions' && (
                            <div className="space-y-2 h-full min-h-0 flex flex-col">
                            <div className="flex items-center justify-between gap-2">
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
                                    {t('datainspector.index_suggestions_title', 'Index Suggestions')}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => { void generateIndexSuggestions(); }}
                                    disabled={isGeneratingIndexSuggestions}
                                    className="h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] disabled:opacity-40"
                                >
                                    {isGeneratingIndexSuggestions
                                        ? t('common.loading', 'Loading...')
                                        : t('datainspector.index_suggestions_generate', 'Generate')}
                                </button>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {t('datainspector.index_suggestions_hint', 'Based on active filters, sorting, cardinality and existing indexes.')}
                            </div>
                            <div className="flex-1 min-h-0 overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-700">
                                {indexSuggestions.length === 0 ? (
                                    <div className="p-3 text-xs text-slate-400 dark:text-slate-500">
                                        {t('datainspector.index_suggestions_empty', 'No suggestions yet. Generate to analyze this table.')}
                                    </div>
                                ) : (
                                    indexSuggestions.map((suggestion) => (
                                        <div key={suggestion.id} className="p-3 space-y-2">
                                            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{suggestion.indexName}</div>
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400">{suggestion.reason}</div>
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                                {t('datainspector.index_suggestions_columns', 'Columns')}: <span className="font-mono">{suggestion.columns.join(', ')}</span>
                                            </div>
                                            <div className="font-mono text-[10px] text-slate-400 dark:text-slate-500 break-all">{suggestion.sql}</div>
                                            <button
                                                type="button"
                                                onClick={() => { void applyIndexSuggestion(suggestion); }}
                                                disabled={applyingIndexSuggestionId === suggestion.id}
                                                className="h-7 px-2 rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[11px] disabled:opacity-40"
                                            >
                                                {applyingIndexSuggestionId === suggestion.id
                                                    ? t('common.saving', 'Saving...')
                                                    : t('datainspector.index_suggestions_apply', 'Create')}
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 shrink-0">
                        <button
                            onClick={() => setIsCreateIndexOpen(false)}
                            disabled={isCreatingIndex}
                            className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40"
                        >
                            {t('common.cancel', 'Cancel')}
                        </button>
                        <button
                            onClick={() => { void handleCreateIndex(); }}
                            disabled={isCreatingIndex || indexModalTab !== 'manual'}
                            className="px-4 py-1.5 rounded bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40"
                        >
                            {isCreatingIndex ? t('common.saving', 'Saving...') : t('datasource.create_index_btn', 'Create index')}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Error Toast / Floating Alert */}
            {
                error && (
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-red-100 dark:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-2 fade-in">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <div className="flex flex-col">
                            <p className="text-sm font-bold">{t('datainspector.sql_error')}</p>
                            <p className="text-xs opacity-90">{String(error)}</p>
                        </div>
                        <button onClick={execute} className="ml-auto p-1.5 hover:bg-red-200 dark:hover:bg-red-800 rounded-md transition-colors">
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>
                )
            }
        </PageLayout >
    );
};




