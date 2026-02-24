import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAsync } from '../../hooks/useAsync';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { DataTable, type Column, type DataTableSortConfig } from '../../components/ui/DataTable';
import { RecordDetailModal } from '../components/RecordDetailModal';
import { exportToExcel } from '../../lib/utils/exportUtils';
import { Download, RefreshCw, AlertCircle, Search, Database, Table as TableIcon, Code, Play, Star, ChevronDown, Save, ListPlus, ArrowLeft } from 'lucide-react';
import { PageLayout } from '../components/ui/PageLayout';
import { useDashboard } from '../../lib/context/DashboardContext';
import type { DbRow } from '../../types';
import type { TableColumn } from '../../types';
import { Modal } from '../components/Modal';
import type { DataSourceEntry } from '../../lib/repositories/SystemRepository';
import { INSPECTOR_PENDING_SQL_KEY, INSPECTOR_RETURN_HASH_KEY } from '../../lib/inspectorBridge';
import { appDialog } from '../../lib/appDialog';

interface DataInspectorProps {
    onBack: () => void;
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

interface CustomSqlTemplate {
    id: string;
    name: string;
    sql: string;
}

interface ProfilingThresholds {
    nullRate: number;
    cardinalityRate: number;
}

const SQL_KEYWORDS = [
    'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
    'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'ON',
    'AND', 'OR', 'NOT', 'IN', 'LIKE', 'IS NULL', 'IS NOT NULL',
    'COUNT(*)', 'SUM()', 'AVG()', 'MIN()', 'MAX()', 'DISTINCT'
];

export const DataInspector: React.FC<DataInspectorProps> = ({ onBack }) => {
    const { t, i18n } = useTranslation();
    const { isAdminMode } = useDashboard();
    const [mode, setMode] = useState<'table' | 'sql'>('table');
    const [inputSql, setInputSql] = useState(''); // Textarea content
    const [sqlHistory, setSqlHistory] = useLocalStorage<string[]>('data_inspector_sql_history', []);
    const [favoriteQueries, setFavoriteQueries] = useLocalStorage<string[]>('data_inspector_favorite_queries', []);
    const [customSqlTemplates, setCustomSqlTemplates] = useLocalStorage<CustomSqlTemplate[]>('data_inspector_custom_sql_templates', []);
    const [selectedCustomTemplateId, setSelectedCustomTemplateId] = useLocalStorage<string>('data_inspector_selected_custom_template', '');
    const [explainMode] = useLocalStorage<boolean>('data_inspector_explain_mode', false);
    const [showSqlAssist, setShowSqlAssist] = useLocalStorage<boolean>('data_inspector_sql_assist_open', false);
    const [autocompleteEnabled, setAutocompleteEnabled] = useLocalStorage<boolean>('data_inspector_autocomplete_enabled', true);
    const [sqlRequireLimitConfirm] = useLocalStorage<boolean>('data_inspector_sql_require_limit_confirm', true);
    const [sqlMaxRows] = useLocalStorage<number>('data_inspector_sql_max_rows', 5000);
    const [explainRows, setExplainRows] = useState<DbRow[]>([]);
    const [explainError, setExplainError] = useState('');
    const [explainLoading, setExplainLoading] = useState(false);
    const [sqlOutputView, setSqlOutputView] = useState<'result' | 'explain'>(explainMode ? 'explain' : 'result');
    const [saveToBuilderOpen, setSaveToBuilderOpen] = useState(false);
    const [saveWidgetName, setSaveWidgetName] = useState('');
    const [saveWidgetDescription, setSaveWidgetDescription] = useState('');
    const [saveToBuilderError, setSaveToBuilderError] = useState('');
    const [isSavingToBuilder, setIsSavingToBuilder] = useState(false);
    const [sqlExecutionSql, setSqlExecutionSql] = useState('');
    const [sqlLimitNotice, setSqlLimitNotice] = useState('');
    const [isCreateIndexOpen, setIsCreateIndexOpen] = useState(false);
    const [indexName, setIndexName] = useState('');
    const [indexColumns, setIndexColumns] = useState<string[]>([]);
    const [indexUnique, setIndexUnique] = useState(false);
    const [indexWhere, setIndexWhere] = useState('');
    const [isCreatingIndex, setIsCreatingIndex] = useState(false);
    const [storedSqlEditorHeight, setStoredSqlEditorHeight] = useLocalStorage<number>('data_inspector_sql_editor_height', 160);
    const [sqlEditorHeight, setSqlEditorHeight] = useState(storedSqlEditorHeight);
    const sqlInputRef = useRef<HTMLTextAreaElement | null>(null);
    const [sqlCursor, setSqlCursor] = useState(0);
    const [autocompleteOpen, setAutocompleteOpen] = useState(false);
    const [autocompleteIndex, setAutocompleteIndex] = useState(0);
    const [autocompletePosition, setAutocompletePosition] = useState({ top: 12, left: 12, width: 320 });

    type SuggestionType = 'keyword' | 'table' | 'column';
    interface SqlSuggestion {
        label: string;
        insert: string;
        type: SuggestionType;
    }

    // Table Mode State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTable, setSelectedTable] = useState('');
    const [selectedItem, setSelectedItem] = useState<DbRow | null>(null);
    const [pageSize, setPageSize] = useLocalStorage<number>('data_inspector_page_size', 100);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageJumpInput, setPageJumpInput] = useState('');
    const offset = (currentPage - 1) * pageSize;
    const [tableSortConfig, setTableSortConfig] = useState<DataTableSortConfig<DbRow> | null>(null);
    const [tableFilters, setTableFilters] = useState<Record<string, string>>({});
    const [defaultShowFilters] = useLocalStorage<boolean>('data_table_default_show_filters', false);
    const [showTableFilters, setShowTableFilters] = useState(defaultShowFilters);
    const [columnWidthsBySource, setColumnWidthsBySource] = useLocalStorage<Record<string, Record<string, number>>>(
        'data_inspector_column_widths_v1',
        {}
    );
    const [savedViews, setSavedViews] = useLocalStorage<InspectorViewPreset[]>('data_inspector_saved_views', []);
    const [activeViewId, setActiveViewId] = useLocalStorage<string>('data_inspector_active_view', '');
    const [defaultShowProfiling] = useLocalStorage<boolean>('data_inspector_show_profiling', true);
    const [tableResultTab, setTableResultTab] = useState<'data' | 'profiling'>(defaultShowProfiling ? 'profiling' : 'data');
    const [profilingThresholds, setProfilingThresholds] = useLocalStorage<ProfilingThresholds>('data_inspector_profiling_thresholds', {
        nullRate: 30,
        cardinalityRate: 95
    });
    const [isResizingSqlPane, setIsResizingSqlPane] = useState(false);
    const sqlPaneResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
    const sqlPaneLiveHeightRef = useRef<number>(sqlEditorHeight);
    const [inspectorReturnHash, setInspectorReturnHash] = useState<string | null>(null);

    useEffect(() => {
        setShowTableFilters(defaultShowFilters);
    }, [defaultShowFilters, selectedTable]);

    useEffect(() => {
        const pendingSql = localStorage.getItem(INSPECTOR_PENDING_SQL_KEY);
        const pendingReturnHash = localStorage.getItem(INSPECTOR_RETURN_HASH_KEY);
        if (pendingReturnHash) {
            const normalized = pendingReturnHash.startsWith('#/') ? pendingReturnHash : '#/';
            setInspectorReturnHash(normalized);
            localStorage.removeItem(INSPECTOR_RETURN_HASH_KEY);
        }
        if (!pendingSql) return;
        localStorage.removeItem(INSPECTOR_PENDING_SQL_KEY);
        setMode('sql');
        setInputSql(pendingSql);
        setSqlOutputView('result');
    }, []);

    // Fetch available data sources (tables + views)
    const { data: dataSources } = useAsync<DataSourceEntry[]>(
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
                return await SystemRepository.executeRaw(sqlExecutionSql);
            }
        },
        [mode, selectedTable, selectedSourceType, pageSize, currentPage, sqlExecutionSql] // Auto-run when mode/source/page changes
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

    // Debounced search for table mode
    useEffect(() => {
        if (mode === 'table') {
            const timer = setTimeout(() => {
                execute();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [searchTerm, mode, execute]); // Re-run when searchTerm changes

    const handleRunSql = async () => {
        const trimmed = inputSql.trim();
        if (!trimmed) return;

        const upper = trimmed.toUpperCase();
        const isPotentialWriteQuery = /^(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|REPLACE|TRUNCATE|VACUUM|ATTACH|DETACH)\b/.test(upper);
        if (isPotentialWriteQuery && !(await appDialog.confirm(t('datainspector.write_confirm')))) return;

        const isSelect = /^\s*SELECT\b/i.test(trimmed);
        const hasLimitClause = /\bLIMIT\b/i.test(trimmed);
        if (isSelect && !hasLimitClause && sqlRequireLimitConfirm) {
            if (!(await appDialog.confirm(t('datainspector.limit_confirm_prompt', { limit: sqlMaxRows })))) return;
        }

        let executionSql = trimmed.replace(/;\s*$/, '');
        if (isSelect) {
            const cappedLimit = Math.max(1, Math.floor(sqlMaxRows || 1));
            executionSql = `SELECT * FROM (${executionSql}) AS __litebi_guard LIMIT ${cappedLimit}`;
            setSqlLimitNotice(t('datainspector.limit_applied_notice', { limit: cappedLimit }));
        } else {
            setSqlLimitNotice('');
        }

        setSqlOutputView('result');
        setSqlExecutionSql(executionSql);
        execute();
        setSqlHistory(prev => [trimmed, ...prev.filter(q => q !== trimmed)].slice(0, 12));
    };

    const handleCancelSql = async () => {
        const cancelled = await SystemRepository.abortActiveQueries();
        if (!cancelled) {
            await appDialog.info(t('datainspector.cancel_not_available', 'No cancellable SQL query is currently running in this tab.'));
        }
    };

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

    const toggleFavoriteQuery = (query: string) => {
        const trimmed = query.trim();
        if (!trimmed) return;
        setFavoriteQueries(prev => {
            if (prev.includes(trimmed)) {
                return prev.filter(q => q !== trimmed);
            }
            return [trimmed, ...prev].slice(0, 20);
        });
    };

    const handleSaveCustomTemplate = async () => {
        const trimmedSql = inputSql.trim();
        if (!trimmedSql) return;

        const suggestedName = `${selectedTable || 'Query'} Template`;
        const name = (await appDialog.prompt(t('datainspector.custom_template_prompt'), { defaultValue: suggestedName }))?.trim();
        if (!name) return;

        const existing = customSqlTemplates.find(tpl => tpl.name.toLowerCase() === name.toLowerCase());
        if (existing && !(await appDialog.confirm(t('datainspector.custom_template_overwrite_confirm', { name })))) return;

        const nextTemplate: CustomSqlTemplate = {
            id: existing?.id || crypto.randomUUID(),
            name,
            sql: trimmedSql
        };

        setCustomSqlTemplates(prev => {
            const withoutCurrent = prev.filter(tpl => tpl.id !== nextTemplate.id);
            return [nextTemplate, ...withoutCurrent].slice(0, 30);
        });
        setSelectedCustomTemplateId(nextTemplate.id);
    };

    const handleDeleteCustomTemplate = async () => {
        if (!selectedCustomTemplateId) return;
        if (!(await appDialog.confirm(t('datainspector.custom_template_delete_confirm')))) return;
        setCustomSqlTemplates(prev => prev.filter(tpl => tpl.id !== selectedCustomTemplateId));
        setSelectedCustomTemplateId('');
    };

    const handleRenameCustomTemplate = async () => {
        if (!selectedCustomTemplateId) return;
        const current = customSqlTemplates.find(tpl => tpl.id === selectedCustomTemplateId);
        if (!current) return;

        const nextName = (await appDialog.prompt(t('datainspector.rename_template_prompt'), { defaultValue: current.name }))?.trim();
        if (!nextName || nextName === current.name) return;

        const conflicting = customSqlTemplates.find(
            tpl => tpl.id !== selectedCustomTemplateId && tpl.name.toLowerCase() === nextName.toLowerCase()
        );
        if (conflicting && !(await appDialog.confirm(t('datainspector.custom_template_overwrite_confirm', { name: nextName })))) return;

        setCustomSqlTemplates(prev => {
            const withoutConflicting = prev.filter(tpl => tpl.id !== conflicting?.id);
            return withoutConflicting.map(tpl =>
                tpl.id === selectedCustomTemplateId ? { ...tpl, name: nextName } : tpl
            );
        });
    };

    const validateSqlForWidgetSave = useCallback(async (sql: string) => {
        const stripComments = (value: string) => value
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/--.*$/gm, '')
            .trim();

        const cleaned = stripComments(sql);
        if (!cleaned) return { valid: false, reason: t('datainspector.empty_sql') };

        const statements = cleaned
            .split(';')
            .map(s => s.trim())
            .filter(Boolean);

        if (statements.length !== 1) {
            return { valid: false, reason: t('datainspector.single_statement_only', 'Only a single SELECT statement can be saved.') };
        }

        const stmt = statements[0];
        const upper = stmt.toUpperCase();
        if (!(upper.startsWith('SELECT') || upper.startsWith('WITH'))) {
            return { valid: false, reason: t('datainspector.only_select_save', 'Only SELECT queries can be saved.') };
        }

        const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|ATTACH|DETACH|VACUUM|PRAGMA)\b/i;
        if (forbidden.test(stmt)) {
            return { valid: false, reason: t('datainspector.only_select_save', 'Only SELECT queries can be saved.') };
        }

        try {
            await SystemRepository.executeRaw(`EXPLAIN QUERY PLAN ${stmt}`);
            return { valid: true, reason: '' };
        } catch (err) {
            return { valid: false, reason: err instanceof Error ? err.message : String(err) };
        }
    }, [t]);

    const handleOpenSaveToBuilder = useCallback(() => {
        const trimmedSql = inputSql.trim();
        if (!trimmedSql) return;
        setSaveWidgetName(`${selectedTable || 'Query'} ${new Date().toISOString().slice(0, 10)}`);
        setSaveWidgetDescription('');
        setSaveToBuilderError('');
        setSaveToBuilderOpen(true);
    }, [inputSql, selectedTable]);

    const handleSaveToQueryBuilder = useCallback(async () => {
        const sql = inputSql.trim();
        const name = saveWidgetName.trim();
        if (!name) {
            setSaveToBuilderError(t('querybuilder.enter_name', 'Please provide a name.'));
            return;
        }

        setIsSavingToBuilder(true);
        setSaveToBuilderError('');
        try {
            const validation = await validateSqlForWidgetSave(sql);
            if (!validation.valid) {
                setSaveToBuilderError(validation.reason);
                return;
            }

            await SystemRepository.saveUserWidget({
                id: crypto.randomUUID(),
                name,
                description: saveWidgetDescription.trim(),
                sql_query: sql,
                visualization_config: { type: 'table' },
                visual_builder_config: null
            });

            setSaveToBuilderOpen(false);
            await appDialog.info(t('datainspector.saved_to_query_builder', 'Saved to Query Builder.'));
        } catch (err) {
            setSaveToBuilderError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsSavingToBuilder(false);
        }
    }, [inputSql, saveWidgetDescription, saveWidgetName, t, validateSqlForWidgetSave]);

    const applyViewPreset = (preset: InspectorViewPreset) => {
        setSelectedTable(preset.table);
        setSearchTerm(preset.searchTerm);
        setTableSortConfig(preset.sortConfig);
        setTableFilters(preset.filters || {});
        setShowTableFilters(Boolean(preset.showFilters));
        setMode('table');
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

    const quoteIdentifier = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

    const openCreateIndexModal = () => {
        if (!selectedTable || selectedSourceType !== 'table') return;
        setIndexName(`idx_${selectedTable}_`);
        setIndexColumns([]);
        setIndexUnique(false);
        setIndexWhere('');
        setIsCreateIndexOpen(true);
    };

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

    // Generate Columns dynamically
    const columns: Column<DbRow>[] = React.useMemo(() => {
        if (!items || items.length === 0) return [];

        const keys = Object.keys(items[0]).filter(k => k !== '_rowid');
        return keys.map(key => {
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
    }, [items]);

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

    const getTokenAtCursor = useCallback((sql: string, cursor: number) => {
        let start = cursor;
        let end = cursor;
        const isTokenChar = (ch: string) => /[A-Za-z0-9_."]/i.test(ch);

        while (start > 0 && isTokenChar(sql[start - 1])) start -= 1;
        while (end < sql.length && isTokenChar(sql[end])) end += 1;

        const token = sql.slice(start, cursor);
        return { start, end, token };
    }, []);

    const suggestions = React.useMemo<SqlSuggestion[]>(() => {
        if (mode !== 'sql' || !autocompleteEnabled) return [];

        const schemaColumns = (selectedTableSchema || []).map(col => col.name);
        const { token } = getTokenAtCursor(inputSql, sqlCursor);
        const prefix = token.trim().toLowerCase();
        const beforeCursor = inputSql.slice(0, sqlCursor).toUpperCase();

        const tableContext = /\b(FROM|JOIN|INTO|UPDATE|TABLE)\s+["A-Z0-9_]*$/i.test(beforeCursor);
        const columnContext = /\b(SELECT|WHERE|AND|OR|ON|HAVING|BY|ORDER BY|GROUP BY)\s+["A-Z0-9_.,]*$/i.test(beforeCursor);

        const keywordSuggestions: SqlSuggestion[] = SQL_KEYWORDS
            .filter(k => prefix.length === 0 || k.toLowerCase().startsWith(prefix))
            .map(k => ({ label: k, insert: k, type: 'keyword' }));

        const tableSuggestions: SqlSuggestion[] = (tables || [])
            .filter(t => prefix.length === 0 || t.toLowerCase().startsWith(prefix))
            .map(t => ({ label: t, insert: t, type: 'table' }));

        const columnSuggestions: SqlSuggestion[] = schemaColumns
            .filter(c => prefix.length === 0 || c.toLowerCase().startsWith(prefix))
            .map(c => ({ label: c, insert: c, type: 'column' }));

        let merged: SqlSuggestion[] = [];
        if (tableContext) {
            merged = [...tableSuggestions, ...keywordSuggestions];
        } else if (columnContext || token.includes('.')) {
            merged = [...columnSuggestions, ...keywordSuggestions, ...tableSuggestions];
        } else {
            merged = [...keywordSuggestions, ...tableSuggestions, ...columnSuggestions];
        }

        const deduped = merged.filter((item, idx, arr) => arr.findIndex(i => i.label === item.label && i.type === item.type) === idx);
        return deduped.slice(0, 16);
    }, [mode, autocompleteEnabled, selectedTableSchema, getTokenAtCursor, inputSql, sqlCursor, tables]);

    useEffect(() => {
        setAutocompleteIndex(0);
        setAutocompleteOpen(mode === 'sql' && autocompleteEnabled && suggestions.length > 0);
    }, [mode, autocompleteEnabled, suggestions]);

    useEffect(() => {
        if (!autocompleteEnabled) {
            setAutocompleteOpen(false);
        }
    }, [autocompleteEnabled]);

    const insertSuggestion = useCallback((suggestion: SqlSuggestion) => {
        const { start, end } = getTokenAtCursor(inputSql, sqlCursor);
        const nextSql = `${inputSql.slice(0, start)}${suggestion.insert}${inputSql.slice(end)}`;
        const nextCursor = start + suggestion.insert.length;
        setInputSql(nextSql);
        setSqlCursor(nextCursor);
        setAutocompleteOpen(false);
        setAutocompleteIndex(0);
        window.setTimeout(() => {
            sqlInputRef.current?.focus();
            sqlInputRef.current?.setSelectionRange(nextCursor, nextCursor);
        }, 0);
    }, [getTokenAtCursor, inputSql, sqlCursor]);

    const handleSqlEditorKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (!autocompleteEnabled) return;
        if (!autocompleteOpen || suggestions.length === 0) {
            if (e.key === ' ' && e.ctrlKey) {
                e.preventDefault();
                setAutocompleteOpen(true);
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAutocompleteIndex(prev => (prev + 1) % suggestions.length);
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setAutocompleteIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
            return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            insertSuggestion(suggestions[autocompleteIndex]);
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            setAutocompleteOpen(false);
        }
    }, [autocompleteEnabled, autocompleteOpen, autocompleteIndex, insertSuggestion, suggestions]);

    const updateAutocompletePosition = useCallback(() => {
        const textarea = sqlInputRef.current;
        if (!textarea) return;

        const caret = textarea.selectionStart ?? sqlCursor;
        const style = window.getComputedStyle(textarea);
        const mirror = document.createElement('div');
        const copiedStyles = [
            'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
            'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
            'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
            'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontFamily',
            'lineHeight', 'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing'
        ] as const;

        mirror.style.position = 'absolute';
        mirror.style.visibility = 'hidden';
        mirror.style.whiteSpace = 'pre-wrap';
        mirror.style.wordWrap = 'break-word';
        mirror.style.top = '0';
        mirror.style.left = '-9999px';

        for (const key of copiedStyles) {
            mirror.style[key] = style[key];
        }

        mirror.style.width = `${textarea.clientWidth}px`;
        mirror.textContent = textarea.value.slice(0, caret);

        const marker = document.createElement('span');
        marker.textContent = textarea.value.slice(caret) || '.';
        mirror.appendChild(marker);
        document.body.appendChild(mirror);

        const lineHeightRaw = Number.parseFloat(style.lineHeight);
        const lineHeight = Number.isFinite(lineHeightRaw) ? lineHeightRaw : 18;
        const desiredTop = marker.offsetTop - textarea.scrollTop + lineHeight + 6;
        const desiredLeft = marker.offsetLeft - textarea.scrollLeft + 8;

        document.body.removeChild(mirror);

        const clampedTop = Math.max(8, Math.min(desiredTop, textarea.clientHeight - 44));
        const clampedLeft = Math.max(8, Math.min(desiredLeft, textarea.clientWidth - 180));
        const availableWidth = Math.max(180, textarea.clientWidth - clampedLeft - 10);
        setAutocompletePosition({
            top: clampedTop,
            left: clampedLeft,
            width: Math.min(420, availableWidth)
        });
    }, [sqlCursor]);

    useEffect(() => {
        if (!autocompleteOpen || suggestions.length === 0) return;
        updateAutocompletePosition();
    }, [autocompleteOpen, suggestions.length, sqlCursor, inputSql, updateAutocompletePosition]);

    useEffect(() => {
        const textarea = sqlInputRef.current;
        if (!textarea) return;

        const observer = new ResizeObserver((entries) => {
            if (isResizingSqlPane) return;
            const entry = entries[0];
            if (!entry) return;
            const next = Math.round(entry.contentRect.height);
            const clamped = Math.max(120, Math.min(520, next));
            if (clamped !== sqlEditorHeight) {
                setSqlEditorHeight(clamped);
            }
        });

        observer.observe(textarea);
        return () => observer.disconnect();
    }, [sqlEditorHeight, mode, isResizingSqlPane]);

    useEffect(() => {
        setSqlEditorHeight(storedSqlEditorHeight);
    }, [storedSqlEditorHeight]);

    useEffect(() => {
        if (sqlEditorHeight === storedSqlEditorHeight) return;
        const persistTimer = window.setTimeout(() => {
            setStoredSqlEditorHeight(sqlEditorHeight);
        }, 180);
        return () => window.clearTimeout(persistTimer);
    }, [sqlEditorHeight, storedSqlEditorHeight, setStoredSqlEditorHeight]);

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

    const startSqlPaneResize = (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        sqlPaneResizeRef.current = { startY: event.clientY, startHeight: sqlEditorHeight };
        sqlPaneLiveHeightRef.current = sqlEditorHeight;
        setIsResizingSqlPane(true);
    };

    useEffect(() => {
        if (!isResizingSqlPane) return;

        const handleMouseMove = (event: MouseEvent) => {
            const state = sqlPaneResizeRef.current;
            if (!state) return;
            const delta = event.clientY - state.startY;
            const minHeight = 120;
            const maxHeight = Math.max(260, Math.floor(window.innerHeight * 0.62));
            const nextHeight = Math.max(minHeight, Math.min(maxHeight, state.startHeight + delta));
            sqlPaneLiveHeightRef.current = nextHeight;
            if (sqlInputRef.current) {
                sqlInputRef.current.style.height = `${nextHeight}px`;
            }
        };

        const handleMouseUp = () => {
            const nextHeight = Math.round(sqlPaneLiveHeightRef.current);
            setSqlEditorHeight(nextHeight);
            setIsResizingSqlPane(false);
            sqlPaneResizeRef.current = null;
        };

        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizingSqlPane, setSqlEditorHeight]);

    return (
        <PageLayout
            header={{
                title: t('sidebar.data_inspector'),
                subtitle: t('datainspector.subtitle', {
                    count: mode === 'sql' && sqlOutputView === 'explain'
                        ? explainRows.length
                        : mode === 'table' && tableResultTab === 'profiling'
                            ? profiling.length
                            : (items?.length || 0),
                    mode: mode === 'table' ? selectedTable : t('datainspector.sql_mode')
                }),
                onBack,
                actions: (
                    <>
                        {inspectorReturnHash && (
                            <button
                                onClick={() => { window.location.hash = inspectorReturnHash; }}
                                className="h-10 flex items-center gap-2 px-3 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                                title={t('datainspector.back_to_dashboard')}
                            >
                                <ArrowLeft className="w-4 h-4" />
                                <span className="hidden sm:inline">{t('datainspector.back_to_dashboard')}</span>
                            </button>
                        )}
                        {/* Mode Toggle */}
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

                        {/* Refresh */}
                        <button
                            onClick={execute}
                            className="h-10 w-10 flex items-center justify-center bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-all"
                            title={t('datainspector.refresh_title')}
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>

                        {/* Export */}
                        <button
                            onClick={() => {
                                if (!items || items.length === 0) return;
                                const timestamp = new Date().toISOString().slice(0, 10);
                                const exportRows = items.map((row) => {
                                    const cleaned = { ...row };
                                    delete cleaned._rowid;
                                    return cleaned;
                                });
                                exportToExcel(exportRows, `export_${timestamp}`, "Export");
                            }}
                            className="h-10 flex items-center gap-2 px-4 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">{t('datainspector.export_excel')}</span>
                        </button>
                    </>
                ),
            }}
            footer={footerText}
            breadcrumbs={[
                { label: t('sidebar.data_inspector') }
            ]}
            fillHeight
        >
            {/* Loading Bar at Top */}
            <div className="fixed top-0 left-0 w-full h-[3px] bg-blue-100 dark:bg-blue-900/30 z-[100] overflow-hidden">
                {loading && (
                    <div className="h-full bg-blue-600 dark:bg-blue-400 animate-pulse" style={{ width: '40%' }} />
                )}
            </div>

            {/* Controls Row: Selection or SQL Editor */}
            {mode === 'table' ? (
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
                    <div className="grid grid-cols-1 gap-3">
                        <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,320px)_minmax(280px,1fr)_auto] gap-3">
                            <div className="relative min-w-0">
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
                                className="w-full h-10 appearance-none pl-10 pr-10 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer text-sm font-medium"
                            >
                                {dataSources?.map(source => (
                                    <option key={source.name} value={source.name}>
                                        {source.type === 'view' ? `${source.name} (view)` : source.name}
                                    </option>
                                ))}
                            </select>
                            <Database className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 border-r-2 border-b-2 border-slate-400 rotate-45 pointer-events-none" />
                        </div>

                            <div className="relative min-w-0">
                            <input
                                type="text"
                                placeholder={t('datainspector.search_placeholder')}
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="w-full h-10 pl-10 pr-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        </div>

                            <button
                                onClick={() => execute()}
                                className="h-10 px-3 flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-medium"
                                title={t('datainspector.refresh_title')}
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                <span>{t('common.refresh', 'Refresh')}</span>
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-2 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm ring-1 ring-slate-900/5 flex-shrink-0">
                    <div className="relative">
                        <textarea
                            ref={sqlInputRef}
                            value={inputSql}
                            onChange={(e) => {
                                setInputSql(e.target.value);
                                setSqlOutputView('explain');
                                setSqlCursor(e.target.selectionStart ?? e.target.value.length);
                            }}
                            onClick={(e) => setSqlCursor(e.currentTarget.selectionStart ?? 0)}
                            onKeyUp={(e) => setSqlCursor(e.currentTarget.selectionStart ?? 0)}
                            onSelect={(e) => setSqlCursor(e.currentTarget.selectionStart ?? 0)}
                            onScroll={() => {
                                if (autocompleteEnabled && autocompleteOpen) updateAutocompletePosition();
                            }}
                            onKeyDown={handleSqlEditorKeyDown}
                            placeholder={t('datainspector.sql_placeholder')}
                            className="w-full p-4 font-mono text-sm bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y text-slate-800 dark:text-slate-200 min-h-[120px] max-h-[520px]"
                            style={{ height: `${sqlEditorHeight}px` }}
                        />
                        {autocompleteEnabled && autocompleteOpen && suggestions.length > 0 && (
                            <div
                                className="absolute z-20 border border-slate-200 dark:border-slate-700 rounded-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-lg max-h-40 overflow-auto"
                                style={{
                                    top: autocompletePosition.top,
                                    left: autocompletePosition.left,
                                    width: autocompletePosition.width
                                }}
                            >
                                {suggestions.slice(0, 10).map((s, idx) => (
                                    <button
                                        key={`${s.type}-${s.label}`}
                                        type="button"
                                        onClick={() => insertSuggestion(s)}
                                        className={`w-full text-left px-3 py-1.5 text-xs font-mono border-b last:border-b-0 border-slate-100 dark:border-slate-800 transition-colors ${
                                            idx === autocompleteIndex
                                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                                : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                        }`}
                                    >
                                        <span className="font-bold">{s.label}</span>
                                        <span className="ml-2 hidden sm:inline text-[10px] uppercase tracking-wide text-slate-400">{s.type}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="absolute bottom-4 right-4 flex gap-2">
                            <button
                                onClick={() => setInputSql('')}
                                className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            >
                                {t('datainspector.clear_sql')}
                            </button>
                            <button
                                onClick={() => { void handleRunSql(); }}
                                className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium shadow-sm transition-colors"
                            >
                                {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
                                {t('datainspector.run_sql')}
                            </button>
                            {loading && (
                                <button
                                    onClick={() => { void handleCancelSql(); }}
                                    className="px-3 py-1.5 rounded-md text-sm font-medium border bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                                >
                                    {t('datainspector.stop_sql', 'Stop')}
                                </button>
                            )}
                            <button
                                onClick={() => setAutocompleteEnabled(!autocompleteEnabled)}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                                    autocompleteEnabled
                                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                }`}
                                title={t('datainspector.autocomplete_toggle_title', 'Toggle SQL autocomplete')}
                            >
                                {autocompleteEnabled
                                    ? t('datainspector.autocomplete_on', 'Autocomplete on')
                                    : t('datainspector.autocomplete_off', 'Autocomplete off')}
                            </button>
                            <button
                                onClick={handleSaveCustomTemplate}
                                className="px-3 py-1.5 rounded-md text-sm font-medium border bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                                title={t('datainspector.save_template')}
                            >
                                {t('datainspector.save_template')}
                            </button>
                            <button
                                onClick={handleOpenSaveToBuilder}
                                disabled={!inputSql.trim()}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium border bg-white border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                                title={t('datainspector.save_to_query_builder', 'Save to Query Builder')}
                            >
                                <Save className="w-3.5 h-3.5" />
                                {t('datainspector.save_to_query_builder_short', 'Save Report')}
                            </button>
                            <button
                                onClick={() => toggleFavoriteQuery(inputSql)}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                                    favoriteQueries.includes(inputSql.trim())
                                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                }`}
                                title={favoriteQueries.includes(inputSql.trim()) ? t('datainspector.unpin_query') : t('datainspector.pin_query')}
                            >
                                <Star className={`w-3.5 h-3.5 ${favoriteQueries.includes(inputSql.trim()) ? 'fill-current' : ''}`} />
                                {favoriteQueries.includes(inputSql.trim()) ? t('datainspector.unpin') : t('datainspector.pin')}
                            </button>
                        </div>
                    </div>
                    {sqlLimitNotice && (
                        <div className="mt-2 px-3 py-2 text-xs rounded-md border border-amber-200 bg-amber-50 text-amber-800">
                            {sqlLimitNotice}
                        </div>
                    )}
                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50/70 dark:bg-slate-900/40">
                        <button
                            type="button"
                            onClick={() => setShowSqlAssist(!showSqlAssist)}
                            className="w-full flex items-center justify-between px-3 py-2 text-left"
                        >
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-300">
                                    {t('datainspector.sql_assist', 'SQL Assist')}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                    {t('datainspector.templates')}:{sqlTemplates.length}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                    {t('datainspector.favorite_queries')}: {favoriteQueries.length}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                    {t('datainspector.recent_queries')}: {sqlHistory.length}
                                </span>
                            </div>
                            <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
                                <span>{showSqlAssist ? t('common.hide', 'Hide') : t('common.show', 'Show')}</span>
                                <ChevronDown className={`w-4 h-4 transition-transform ${showSqlAssist ? 'rotate-180' : ''}`} />
                            </div>
                        </button>
                    </div>

                    {showSqlAssist && (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{t('datainspector.templates')}</span>
                                {sqlTemplates.map(template => (
                                    <button
                                        key={template.key}
                                        onClick={() => setInputSql(template.sql)}
                                        className="px-2 py-1 text-xs rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600"
                                    >
                                        {t(`datainspector.template_${template.key}`)}
                                    </button>
                                ))}
                            </div>

                            {customSqlTemplates.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{t('datainspector.custom_templates')}</span>
                                    <select
                                        value={selectedCustomTemplateId}
                                        onChange={(e) => {
                                            const templateId = e.target.value;
                                            setSelectedCustomTemplateId(templateId);
                                            if (!templateId) return;
                                            const template = customSqlTemplates.find(tpl => tpl.id === templateId);
                                            if (template) setInputSql(template.sql);
                                        }}
                                        className="flex-1 max-w-xl p-2 border border-slate-200 rounded text-[11px] bg-white outline-none"
                                    >
                                        <option value="">{t('datainspector.pick_custom_template')}</option>
                                        {customSqlTemplates.map((tpl) => (
                                            <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={handleRenameCustomTemplate}
                                        disabled={!selectedCustomTemplateId}
                                        className="px-2 py-1 text-xs rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 disabled:opacity-40"
                                    >
                                        {t('datainspector.rename_template')}
                                    </button>
                                    <button
                                        onClick={handleDeleteCustomTemplate}
                                        disabled={!selectedCustomTemplateId}
                                        className="px-2 py-1 text-xs rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 disabled:opacity-40"
                                    >
                                        {t('datainspector.delete_template')}
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!(await appDialog.confirm(t('datainspector.clear_templates_confirm')))) return;
                                            setCustomSqlTemplates([]);
                                            setSelectedCustomTemplateId('');
                                        }}
                                        className="px-2 py-1 text-xs rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-500"
                                    >
                                        {t('datainspector.clear_templates')}
                                    </button>
                                </div>
                            )}

                            {favoriteQueries.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{t('datainspector.favorite_queries')}</span>
                                    <select
                                        onChange={(e) => {
                                            if (!e.target.value) return;
                                            setInputSql(e.target.value);
                                        }}
                                        className="flex-1 max-w-xl p-2 border border-slate-200 rounded text-[11px] bg-white outline-none"
                                        defaultValue=""
                                    >
                                        <option value="">{t('datainspector.pick_favorite')}</option>
                                        {favoriteQueries.map((q, idx) => (
                                            <option key={`${idx}-${q.slice(0, 20)}`} value={q}>{q}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => setFavoriteQueries([])}
                                        className="px-2 py-1 text-xs rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-500"
                                    >
                                        {t('datainspector.clear_favorites')}
                                    </button>
                                </div>
                            )}

                            {sqlHistory.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{t('datainspector.recent_queries')}</span>
                                    <select
                                        onChange={(e) => {
                                            if (!e.target.value) return;
                                            setInputSql(e.target.value);
                                        }}
                                        className="flex-1 max-w-xl p-2 border border-slate-200 rounded text-[11px] bg-white outline-none"
                                        defaultValue=""
                                    >
                                        <option value="">{t('datainspector.pick_recent')}</option>
                                        {sqlHistory.map((q, idx) => (
                                            <option key={`${idx}-${q.slice(0, 20)}`} value={q}>{q}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => setSqlHistory([])}
                                        className="px-2 py-1 text-xs rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-500"
                                    >
                                        {t('datainspector.clear_history')}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {mode === 'sql' && (
                <div
                    onMouseDown={startSqlPaneResize}
                    className={`h-3 -mt-2 -mb-1 flex items-center justify-center cursor-row-resize ${isResizingSqlPane ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}
                    title={t('datainspector.resize_sql_split', 'Resize SQL and results panes')}
                >
                    <div className="h-1 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
                </div>
            )}

            <div className="flex-1 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col min-h-0 relative">
                {/* Opaque loading overlay when refreshing results */}
                {loading && items && items.length > 0 && !(mode === 'sql' && sqlOutputView === 'explain') && (
                    <div className="absolute inset-0 bg-white/40 dark:bg-slate-800/40 z-10 flex items-center justify-center backdrop-blur-[1px]">
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-full shadow-xl border border-slate-100 dark:border-slate-700">
                            <RefreshCw className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
                        </div>
                    </div>
                )}

                {mode === 'sql' && (
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 flex items-center justify-between gap-3">
                        <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1">
                            <button
                                onClick={() => setSqlOutputView('result')}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${sqlOutputView === 'result'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100'
                                    }`}
                            >
                                {t('datainspector.output_results', 'Results')}
                            </button>
                            <button
                                onClick={() => {
                                    setSqlOutputView('explain');
                                }}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${sqlOutputView === 'explain'
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100'
                                    }`}
                            >
                                {t('datainspector.output_explain', 'Explain')}
                            </button>
                        </div>
                        <span className="text-[11px] text-slate-400">{t('datainspector.explain_hint')}</span>
                    </div>
                )}

                {mode === 'table' && (
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 flex items-center justify-between gap-3">
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
                        <span className="text-[11px] text-slate-400">
                            {tableResultTab === 'profiling'
                                ? t('datainspector.profiling_issues', { count: profilingIssueCount })
                                : t('datainspector.auto_limit', { limit: pageSize })}
                        </span>
                    </div>
                )}

                {mode === 'table' && tableResultTab === 'profiling' && (
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between gap-3 text-[11px]">
                        <div className="font-semibold uppercase tracking-wider text-slate-500">
                            {t('datainspector.profiling_settings', 'Profiling Settings')}
                        </div>
                        <div className="flex items-center gap-2 text-slate-500">
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
                                    className="w-14 px-1.5 py-0.5 border border-slate-200 rounded bg-white text-slate-700"
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
                                    className="w-14 px-1.5 py-0.5 border border-slate-200 rounded bg-white text-slate-700"
                                />
                                <span>%</span>
                            </label>
                            <button
                                onClick={() => setProfilingThresholds({ nullRate: 30, cardinalityRate: 95 })}
                                className="px-2 py-0.5 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                            >
                                {t('datainspector.reset_thresholds')}
                            </button>
                        </div>
                    </div>
                )}

                {mode === 'table' && tableResultTab === 'data' && (
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between gap-3 text-[11px]">
                        <button
                            onClick={openCreateIndexModal}
                            disabled={selectedSourceType !== 'table'}
                            className="h-7 px-2 text-[11px] rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 flex items-center gap-1"
                            title={selectedSourceType !== 'table'
                                ? t('datasource.view_type', 'VIEW')
                                : t('datasource.create_index_title', 'Create index')}
                        >
                            <ListPlus className="w-3.5 h-3.5" />
                            {t('datasource.create_index_btn', 'Create index')}
                        </button>
                        <div className="flex items-center gap-2 justify-end">
                            <span className="text-slate-500 font-semibold uppercase tracking-wider">
                                {t('datainspector.saved_views', 'Saved Views')}
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
                                className="h-7 px-2 border border-slate-200 rounded bg-white text-slate-600 text-[11px] outline-none min-w-[180px]"
                            >
                                <option value="">{t('datainspector.select_view')}</option>
                                {savedViews.map(view => (
                                    <option key={view.id} value={view.id}>{view.name}</option>
                                ))}
                            </select>
                            <button
                                onClick={handleSaveCurrentView}
                                className="h-7 px-2 text-[11px] rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                            >
                                {activeViewId ? t('datainspector.update_view') : t('datainspector.save_view')}
                            </button>
                            <button
                                onClick={handleDeleteCurrentView}
                                disabled={!activeViewId}
                                className="h-7 px-2 text-[11px] rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 disabled:opacity-40"
                            >
                                {t('datainspector.delete_view')}
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-hidden flex flex-col relative min-h-0">
                    {mode === 'sql' && sqlOutputView === 'explain' ? (
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
                                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-400 uppercase text-[10px] z-[1]">
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
                    ) : mode === 'table' && tableResultTab === 'profiling' ? (
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
                                                                <span key={pattern} className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-semibold">
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
                                                                <span key={issue} className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold">
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
                            emptyMessage={mode === 'sql' && !inputSql ? t('datainspector.empty_sql') : t('common.no_data')}
                            onRowClick={(item) => setSelectedItem(item)}
                            sortConfig={mode === 'table' ? tableSortConfig : undefined}
                            onSortConfigChange={mode === 'table' ? setTableSortConfig : undefined}
                            filters={mode === 'table' ? tableFilters : undefined}
                            onFiltersChange={mode === 'table' ? setTableFilters : undefined}
                            showFilters={mode === 'table' ? showTableFilters : undefined}
                            onShowFiltersChange={mode === 'table' ? setShowTableFilters : undefined}
                            columnWidths={mode === 'table' ? activeColumnWidths : undefined}
                            onColumnWidthsChange={mode === 'table' ? handleColumnWidthsChange : undefined}
                        />
                    )}
                </div>
                <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700 text-[10px] flex justify-between items-center text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
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
                                    className="h-7 px-2 border border-slate-200 rounded bg-white text-slate-600 text-[10px] outline-none"
                                    title={t('datainspector.page_size')}
                                >
                                    {[50, 100, 250, 500].map(size => (
                                        <option key={size} value={size}>{t('datainspector.page_size_value', { size })}</option>
                                    ))}
                                </select>
                            )
                        ) : sqlOutputView === 'explain'
                            ? t('datainspector.output_explain', 'Explain')
                            : t('datainspector.sql_mode')}
                    </div>
                    <div className="flex items-center gap-4">
                        {mode === 'table' && tableResultTab === 'data' && (
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage <= 1}
                                    className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 disabled:opacity-40"
                                >
                                    {t('datainspector.prev_page')}
                                </button>
                                <span className="text-[10px] font-semibold text-slate-500">
                                    {t('datainspector.page_info', {
                                        page: currentPage,
                                        pages: totalPages,
                                        total: tableTotalRows || 0
                                    })}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(p => p + 1)}
                                    disabled={currentPage >= totalPages}
                                    className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 disabled:opacity-40"
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
                                        className="w-16 px-2 py-1 rounded border border-slate-200 bg-white text-slate-600 text-[10px] outline-none"
                                    />
                                    <button
                                        onClick={() => {
                                            const parsed = Number(pageJumpInput);
                                            if (Number.isNaN(parsed)) return;
                                            const target = Math.max(1, Math.min(totalPages, Math.floor(parsed)));
                                            setCurrentPage(target);
                                            setPageJumpInput('');
                                        }}
                                        className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 text-[10px]"
                                    >
                                        {t('datainspector.go')}
                                    </button>
                                </div>
                            </div>
                        )}
                        <span className="flex items-center gap-1"><Database className="w-3 h-3" /> LiteBI Studio DB</span>
                        <span className="font-medium">
                            {t('common.results_count', {
                                count: mode === 'sql' && sqlOutputView === 'explain'
                                    ? explainRows.length
                                    : mode === 'table' && tableResultTab === 'profiling'
                                        ? profiling.length
                                        : (items?.length || 0)
                            })}
                        </span>
                    </div>
                </div>
            </div>

            {/* Universal Record Detail Modal */}
            <RecordDetailModal
                isOpen={!!selectedItem}
                onClose={() => setSelectedItem(null)}
                items={items || []}
                initialIndex={items && selectedItem ? Math.max(0, items.indexOf(selectedItem)) : 0}
                title={t('common.details')}
                tableName={selectedTable}
                schema={undefined}
            />

            <Modal
                isOpen={isCreateIndexOpen}
                onClose={() => {
                    if (isCreatingIndex) return;
                    setIsCreateIndexOpen(false);
                }}
                title={t('datasource.create_index_title', 'Create index')}
            >
                <div className="space-y-4">
                    <div className="text-xs text-slate-500">
                        {t('datasource.index_create_for_table', 'Table')}: <span className="font-mono font-semibold text-slate-700">{selectedTable}</span>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                            {t('datasource.index_name', 'Index name')}
                        </label>
                        <input
                            type="text"
                            value={indexName}
                            onChange={(e) => setIndexName(e.target.value)}
                            className="w-full p-2 border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            placeholder={`idx_${selectedTable}_...`}
                        />
                    </div>

                    <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                            type="checkbox"
                            checked={indexUnique}
                            onChange={() => setIndexUnique(!indexUnique)}
                            className="h-4 w-4"
                        />
                        {t('datasource.index_unique', 'Unique index')}
                    </label>

                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-500 uppercase">
                            {t('datasource.index_columns', 'Columns')}
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-auto border border-slate-200 rounded p-2 bg-slate-50">
                            {(selectedTableSchema || []).map((col) => (
                                <label key={col.name} className="flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={indexColumns.includes(col.name)}
                                        onChange={() => toggleIndexColumn(col.name)}
                                        className="h-4 w-4"
                                    />
                                    <span className="font-mono">{col.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {indexColumns.length > 0 && (
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase">
                                {t('datasource.index_order', 'Column order')}
                            </label>
                            <div className="space-y-1 border border-slate-200 rounded p-2 bg-white">
                                {indexColumns.map((col, idx) => (
                                    <div key={col} className="flex items-center justify-between text-sm">
                                        <span className="font-mono text-slate-700">{idx + 1}. {col}</span>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => moveIndexColumn(col, 'up')}
                                                disabled={idx === 0}
                                                className="px-2 py-0.5 text-xs border border-slate-200 rounded disabled:opacity-40"
                                            >
                                                ↑
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveIndexColumn(col, 'down')}
                                                disabled={idx === indexColumns.length - 1}
                                                className="px-2 py-0.5 text-xs border border-slate-200 rounded disabled:opacity-40"
                                            >
                                                ↓
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                            {t('datasource.index_where_optional', 'WHERE (optional)')}
                        </label>
                        <input
                            type="text"
                            value={indexWhere}
                            onChange={(e) => setIndexWhere(e.target.value)}
                            className="w-full p-2 border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                            placeholder="status = 'open'"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            onClick={() => setIsCreateIndexOpen(false)}
                            disabled={isCreatingIndex}
                            className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 disabled:opacity-40"
                        >
                            {t('common.cancel', 'Cancel')}
                        </button>
                        <button
                            onClick={() => { void handleCreateIndex(); }}
                            disabled={isCreatingIndex}
                            className="px-4 py-1.5 rounded bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40"
                        >
                            {isCreatingIndex ? t('common.saving', 'Saving...') : t('datasource.create_index_btn', 'Create index')}
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={saveToBuilderOpen}
                onClose={() => {
                    if (isSavingToBuilder) return;
                    setSaveToBuilderOpen(false);
                }}
                title={t('datainspector.save_to_query_builder', 'Save to Query Builder')}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                            {t('common.name', 'Name')}
                        </label>
                        <input
                            type="text"
                            value={saveWidgetName}
                            onChange={(e) => setSaveWidgetName(e.target.value)}
                            className="w-full p-2 border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder={t('querybuilder.report_name_placeholder', 'Report name')}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                            {t('common.description', 'Description')}
                        </label>
                        <textarea
                            value={saveWidgetDescription}
                            onChange={(e) => setSaveWidgetDescription(e.target.value)}
                            className="w-full p-2 border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500 min-h-20"
                            placeholder={t('querybuilder.description_placeholder', 'Optional description')}
                        />
                    </div>
                    <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        {t('datainspector.save_select_only_hint', 'Only valid SELECT queries can be saved. SQL is checked before saving.')}
                    </div>
                    {saveToBuilderError && (
                        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            {saveToBuilderError}
                        </div>
                    )}
                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            onClick={() => setSaveToBuilderOpen(false)}
                            disabled={isSavingToBuilder}
                            className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 disabled:opacity-40"
                        >
                            {t('common.cancel', 'Cancel')}
                        </button>
                        <button
                            onClick={() => { void handleSaveToQueryBuilder(); }}
                            disabled={isSavingToBuilder || !saveWidgetName.trim()}
                            className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40"
                        >
                            {isSavingToBuilder ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
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
