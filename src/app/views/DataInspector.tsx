import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAsync } from '../../hooks/useAsync';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { DataTable, type Column, type DataTableSortConfig } from '../../components/ui/DataTable';
import { RecordDetailModal } from '../components/RecordDetailModal';
import { exportToExcel } from '../../lib/utils/exportUtils';
import { Download, RefreshCw, AlertCircle, Search, Database, Table as TableIcon, Code, Play, Star } from 'lucide-react';
import { PageLayout } from '../components/ui/PageLayout';
import { useDashboard } from '../../lib/context/DashboardContext';
import type { DbRow } from '../../types';

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

export const DataInspector: React.FC<DataInspectorProps> = ({ onBack }) => {
    const { t, i18n } = useTranslation();
    const { isAdminMode } = useDashboard();
    const [mode, setMode] = useState<'table' | 'sql'>('table');
    const [inputSql, setInputSql] = useState(''); // Textarea content
    const [sqlHistory, setSqlHistory] = useLocalStorage<string[]>('data_inspector_sql_history', []);
    const [favoriteQueries, setFavoriteQueries] = useLocalStorage<string[]>('data_inspector_favorite_queries', []);
    const [customSqlTemplates, setCustomSqlTemplates] = useLocalStorage<CustomSqlTemplate[]>('data_inspector_custom_sql_templates', []);
    const [selectedCustomTemplateId, setSelectedCustomTemplateId] = useLocalStorage<string>('data_inspector_selected_custom_template', '');
    const [explainMode, setExplainMode] = useLocalStorage<boolean>('data_inspector_explain_mode', false);
    const [explainRows, setExplainRows] = useState<DbRow[]>([]);
    const [explainError, setExplainError] = useState('');
    const [explainLoading, setExplainLoading] = useState(false);

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
    const [showTableFilters, setShowTableFilters] = useState(false);
    const [savedViews, setSavedViews] = useLocalStorage<InspectorViewPreset[]>('data_inspector_saved_views', []);
    const [activeViewId, setActiveViewId] = useLocalStorage<string>('data_inspector_active_view', '');
    const [showProfiling, setShowProfiling] = useLocalStorage<boolean>('data_inspector_show_profiling', true);
    const [profilingHeight, setProfilingHeight] = useLocalStorage<number>('data_inspector_profiling_height', 235);
    const [profilingThresholds, setProfilingThresholds] = useLocalStorage<ProfilingThresholds>('data_inspector_profiling_thresholds', {
        nullRate: 30,
        cardinalityRate: 95
    });
    const [isResizingProfile, setIsResizingProfile] = useState(false);
    const resizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

    // Fetch available tables
    const { data: tables } = useAsync<string[]>(
        async () => {
            const allTables = await SystemRepository.getTables();
            const filteredTables = isAdminMode ? allTables : allTables.filter(t => !t.startsWith('sys_'));

            if (filteredTables.length > 0 && (!selectedTable || (selectedTable.startsWith('sys_') && !isAdminMode))) {
                setSelectedTable(filteredTables[0]);
            }
            return filteredTables;
        },
        [isAdminMode]
    );

    // Main Data Fetching
    const { data: items, loading, error, refresh: execute } = useAsync<DbRow[]>(
        async () => {
            if (mode === 'table') {
                if (!selectedTable) return [];
                return await SystemRepository.inspectTable(selectedTable, pageSize, searchTerm, offset);
            } else {
                if (!inputSql) return []; // Don't run empty SQL
                return await SystemRepository.executeRaw(inputSql);
            }
        },
        [mode, selectedTable, pageSize, currentPage] // Auto-run when mode/table/page changes
    );

    const { data: tableTotalRows } = useAsync<number>(
        async () => {
            if (mode !== 'table' || !selectedTable) return 0;
            return await SystemRepository.countTableRows(selectedTable, searchTerm);
        },
        [mode, selectedTable, searchTerm]
    );
    const totalPages = Math.max(1, Math.ceil((tableTotalRows || 0) / pageSize));

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
        if (isPotentialWriteQuery && !confirm(t('datainspector.write_confirm'))) return;

        execute();
        setSqlHistory(prev => [trimmed, ...prev.filter(q => q !== trimmed)].slice(0, 12));

        if (explainMode) {
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
        } else {
            setExplainRows([]);
            setExplainError('');
        }
    };

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

    const handleSaveCustomTemplate = () => {
        const trimmedSql = inputSql.trim();
        if (!trimmedSql) return;

        const suggestedName = `${selectedTable || 'Query'} Template`;
        const name = prompt(t('datainspector.custom_template_prompt'), suggestedName)?.trim();
        if (!name) return;

        const existing = customSqlTemplates.find(tpl => tpl.name.toLowerCase() === name.toLowerCase());
        if (existing && !confirm(t('datainspector.custom_template_overwrite_confirm', { name }))) return;

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

    const handleDeleteCustomTemplate = () => {
        if (!selectedCustomTemplateId) return;
        if (!confirm(t('datainspector.custom_template_delete_confirm'))) return;
        setCustomSqlTemplates(prev => prev.filter(tpl => tpl.id !== selectedCustomTemplateId));
        setSelectedCustomTemplateId('');
    };

    const handleRenameCustomTemplate = () => {
        if (!selectedCustomTemplateId) return;
        const current = customSqlTemplates.find(tpl => tpl.id === selectedCustomTemplateId);
        if (!current) return;

        const nextName = prompt(t('datainspector.rename_template_prompt'), current.name)?.trim();
        if (!nextName || nextName === current.name) return;

        const conflicting = customSqlTemplates.find(
            tpl => tpl.id !== selectedCustomTemplateId && tpl.name.toLowerCase() === nextName.toLowerCase()
        );
        if (conflicting && !confirm(t('datainspector.custom_template_overwrite_confirm', { name: nextName }))) return;

        setCustomSqlTemplates(prev => {
            const withoutConflicting = prev.filter(tpl => tpl.id !== conflicting?.id);
            return withoutConflicting.map(tpl =>
                tpl.id === selectedCustomTemplateId ? { ...tpl, name: nextName } : tpl
            );
        });
    };

    const applyViewPreset = (preset: InspectorViewPreset) => {
        setSelectedTable(preset.table);
        setSearchTerm(preset.searchTerm);
        setTableSortConfig(preset.sortConfig);
        setTableFilters(preset.filters || {});
        setShowTableFilters(Boolean(preset.showFilters));
        setMode('table');
    };

    const handleSaveCurrentView = () => {
        const suggested = savedViews.find(v => v.id === activeViewId)?.name || `${selectedTable} View`;
        const name = prompt(t('datainspector.new_view_prompt'), suggested)?.trim();
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

    const handleDeleteCurrentView = () => {
        if (!activeViewId) return;
        if (!confirm(t('datainspector.delete_view_confirm'))) return;
        setSavedViews(prev => prev.filter(v => v.id !== activeViewId));
        setActiveViewId('');
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

    const sqlTemplates = [
        { key: 'top10', sql: `SELECT * FROM ${selectedTable || 'table_name'} LIMIT 10` },
        { key: 'count', sql: `SELECT COUNT(*) AS total_rows FROM ${selectedTable || 'table_name'}` },
        { key: 'nullscan', sql: `SELECT * FROM ${selectedTable || 'table_name'} WHERE 1=1 LIMIT 50` },
        { key: 'duplicates', sql: `SELECT key_column, COUNT(*) AS cnt FROM ${selectedTable || 'table_name'} GROUP BY key_column HAVING COUNT(*) > 1 ORDER BY cnt DESC LIMIT 50` },
        { key: 'outliers', sql: `SELECT * FROM ${selectedTable || 'table_name'} WHERE value_column IS NOT NULL ORDER BY value_column DESC LIMIT 25` },
    ];

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

    const startProfileResize = (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        resizeStateRef.current = { startY: event.clientY, startHeight: profilingHeight };
        setIsResizingProfile(true);
    };

    useEffect(() => {
        if (!isResizingProfile) return;

        const handleMouseMove = (event: MouseEvent) => {
            const state = resizeStateRef.current;
            if (!state) return;
            const delta = event.clientY - state.startY;
            const minHeight = 140;
            const maxHeight = Math.max(220, Math.floor(window.innerHeight * 0.45));
            const nextHeight = Math.max(minHeight, Math.min(maxHeight, state.startHeight + delta));
            setProfilingHeight(nextHeight);
        };

        const handleMouseUp = () => {
            setIsResizingProfile(false);
            resizeStateRef.current = null;
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
    }, [isResizingProfile, setProfilingHeight]);

    return (
        <PageLayout
            header={{
                title: t('sidebar.data_inspector'),
                subtitle: t('datainspector.subtitle', { count: items?.length || 0, mode: mode === 'table' ? selectedTable : t('datainspector.sql_mode') }),
                onBack,
                actions: (
                    <>
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
                <div className="flex flex-col xl:flex-row xl:items-center gap-3 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 w-full xl:flex-1">
                        <div className="relative w-full sm:w-auto">
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
                                className="appearance-none pl-10 pr-10 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer text-sm font-medium"
                            >
                                {tables?.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                            <Database className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                            <div className="absolute right-3 top-3.5 w-2 h-2 border-r-2 border-b-2 border-slate-400 rotate-45 pointer-events-none" />
                        </div>

                        <div className="relative w-full sm:max-w-md sm:ml-0">
                            <input
                                type="text"
                                placeholder={t('datainspector.search_placeholder')}
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto xl:ml-3">
                        <select
                            value={activeViewId}
                            onChange={(e) => {
                                const nextId = e.target.value;
                                setActiveViewId(nextId);
                                if (!nextId) return;
                                const preset = savedViews.find(v => v.id === nextId);
                                if (preset) applyViewPreset(preset);
                            }}
                            className="p-2 border border-slate-200 rounded text-[11px] bg-white outline-none w-full sm:w-auto sm:min-w-[180px]"
                        >
                            <option value="">{t('datainspector.select_view')}</option>
                            {savedViews.map(view => (
                                <option key={view.id} value={view.id}>{view.name}</option>
                            ))}
                        </select>
                        <button
                            onClick={handleSaveCurrentView}
                            className="px-2 py-1 text-xs rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                        >
                            {activeViewId ? t('datainspector.update_view') : t('datainspector.save_view')}
                        </button>
                        <button
                            onClick={handleDeleteCurrentView}
                            disabled={!activeViewId}
                            className="px-2 py-1 text-xs rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 disabled:opacity-40"
                        >
                            {t('datainspector.delete_view')}
                        </button>
                        <div className="text-xs text-slate-400 font-medium sm:ml-2">
                            {t('datainspector.auto_limit', { limit: pageSize })}
                        </div>
                        <select
                            value={String(pageSize)}
                            onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="p-2 border border-slate-200 rounded text-[11px] bg-white outline-none"
                            title={t('datainspector.page_size')}
                        >
                            {[50, 100, 250, 500].map(size => (
                                <option key={size} value={size}>{t('datainspector.page_size_value', { size })}</option>
                            ))}
                        </select>
                        <button
                            onClick={() => setShowProfiling(!showProfiling)}
                            className="px-2 py-1 text-xs rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 ml-1"
                        >
                            {showProfiling ? t('datainspector.hide_profile') : t('datainspector.show_profile')}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-2 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm ring-1 ring-slate-900/5 flex-shrink-0">
                    <div className="relative">
                        <textarea
                            value={inputSql}
                            onChange={(e) => setInputSql(e.target.value)}
                            placeholder={t('datainspector.sql_placeholder')}
                            className="w-full h-24 p-4 font-mono text-sm bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-slate-800 dark:text-slate-200"
                        />
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
                            <button
                                onClick={() => {
                                    setExplainMode(!explainMode);
                                    if (explainMode) {
                                        setExplainRows([]);
                                        setExplainError('');
                                    }
                                }}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                                    explainMode
                                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                }`}
                                title={t('datainspector.explain_mode')}
                            >
                                {t('datainspector.explain')}
                            </button>
                            <button
                                onClick={handleSaveCustomTemplate}
                                className="px-3 py-1.5 rounded-md text-sm font-medium border bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                                title={t('datainspector.save_template')}
                            >
                                {t('datainspector.save_template')}
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
                                    onClick={() => {
                                        if (!confirm(t('datainspector.clear_templates_confirm'))) return;
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
                </div>
            )}

            {mode === 'sql' && explainMode && (
                <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/40 shadow-sm flex-shrink-0">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('datainspector.explain_title')}</h3>
                        <span className="text-[11px] text-slate-400">{t('datainspector.explain_hint')}</span>
                    </div>
                    {explainLoading ? (
                        <div className="text-xs text-slate-400 flex items-center gap-2">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            {t('common.loading')}
                        </div>
                    ) : explainError ? (
                        <div className="text-xs text-rose-600">{explainError}</div>
                    ) : explainRows.length === 0 ? (
                        <div className="text-xs text-slate-400">{t('datainspector.explain_empty')}</div>
                    ) : (
                        <div className="overflow-auto max-h-36 custom-scrollbar border border-slate-100 dark:border-slate-700 rounded">
                            <table className="w-full text-xs min-w-[520px]">
                                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-400 uppercase text-[10px]">
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
                    )}
                </div>
            )}

            {mode === 'table' && showProfiling && (
                <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('datainspector.profiling_title')}</h3>
                            <p className="text-[11px] text-slate-400">{t('datainspector.profiling_subtitle', { count: items?.length || 0 })}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="text-[11px] text-slate-500 font-semibold">
                                {t('datainspector.profiling_issues', { count: profilingIssueCount })}
                            </div>
                            <div className="flex items-center gap-2 text-[11px]">
                                <span className="text-slate-400 font-semibold uppercase tracking-wider">{t('datainspector.thresholds')}</span>
                                <label className="flex items-center gap-1 text-slate-500">
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
                                <label className="flex items-center gap-1 text-slate-500">
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
                    </div>
                    {profiling.length === 0 ? (
                        <div className="text-xs text-slate-400">{t('datainspector.no_profile')}</div>
                    ) : (
                        <div className="overflow-auto overflow-y-auto pr-1 custom-scrollbar" style={{ height: profilingHeight }}>
                            <table className="w-full text-xs min-w-[760px]">
                                <thead className="text-slate-400 uppercase text-[10px] sticky top-0 bg-white dark:bg-slate-800 z-[1]">
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
                                            <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">
                                                {t(`datainspector.type_${col.detectedType}`)}
                                            </td>
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
                    )}
                </div>
            )}

            {mode === 'table' && showProfiling && (
                <div
                    onMouseDown={startProfileResize}
                    className={`h-3 -mt-2 -mb-1 flex items-center justify-center cursor-row-resize ${isResizingProfile ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}
                    title={t('datainspector.resize_profile')}
                >
                    <div className="h-1 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
                </div>
            )}

            <div className="flex-1 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col min-h-0 relative">
                {/* Opaque loading overlay when refreshing results */}
                {loading && items && items.length > 0 && (
                    <div className="absolute inset-0 bg-white/40 dark:bg-slate-800/40 z-10 flex items-center justify-center backdrop-blur-[1px]">
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-full shadow-xl border border-slate-100 dark:border-slate-700">
                            <RefreshCw className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-hidden flex flex-col relative min-h-0">
                    {loading && !items ? (
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
                        />
                    )}
                </div>
                <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700 text-[10px] flex justify-between items-center text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="font-medium">
                        {mode === 'table' ? t('datainspector.auto_limit', { limit: pageSize }) : t('datainspector.sql_mode')}
                    </div>
                    <div className="flex items-center gap-4">
                        {mode === 'table' && (
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
                        <span className="font-medium">{t('common.results_count', { count: items?.length || 0 })}</span>
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
