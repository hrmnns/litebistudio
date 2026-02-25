import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '../components/ui/PageLayout';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { useAsync } from '../../hooks/useAsync';
import { Plus, Layout, Trash2, Database, Star, Settings, Check, X, Edit2, Download, Maximize2, Filter, ArrowUp, ArrowDown } from 'lucide-react';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    useDraggable,
    useDroppable,
    type DragEndEvent
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useReportExport } from '../../hooks/useReportExport';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import WidgetRenderer from '../components/WidgetRenderer';
import { Modal } from '../components/Modal';
import { getComponent, SYSTEM_WIDGETS } from '../registry';
import { COMPONENTS } from '../../config/components';
import { useDashboard } from '../../lib/context/DashboardContext';
import type { DbRow, WidgetConfig } from '../../types';
import { createLogger } from '../../lib/logger';
import { appDialog } from '../../lib/appDialog';

const logger = createLogger('CustomDashboardView');

interface FilterDef {
    column: string;
    operator: string;
    value: string;
}

interface SavedWidget {
    id: string; // Either UUID for custom or 'sys_...' for system
    type: 'custom' | 'system';
    position?: number;
}

interface DashboardDef {
    id: string;
    name: string;
    layout: SavedWidget[];
    is_default: boolean;
    filters?: FilterDef[];
}

interface CustomWidgetRecord extends DbRow {
    id: string;
    name: string;
    sql_query: string;
    visualization_config: string;
}

interface DashboardSortableItemProps {
    id: string;
    className?: string;
    children: React.ReactNode;
}

const DashboardSortableItem: React.FC<DashboardSortableItemProps> = ({ id, className, children }) => {
    const {
        attributes,
        listeners,
        setNodeRef: setDraggableRef,
        transform,
        isDragging
    } = useDraggable({ id });
    const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id });

    const setNodeRef = (node: HTMLElement | null) => {
        setDraggableRef(node);
        setDroppableRef(node);
    };

    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Translate.toString(transform) }}
            className={`${className || ''} ${isDragging ? 'opacity-50 z-10' : ''} ${isOver && !isDragging ? 'ring-2 ring-blue-300 rounded-xl' : ''}`}
            {...attributes}
            {...listeners}
        >
            {children}
        </div>
    );
};

export const CustomDashboardView: React.FC = () => {
    const { t } = useTranslation();
    // Dashboards State
    const [dashboards, setDashboards] = useState<DashboardDef[]>([]);
    const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    // Modals
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isManageModalOpen, setIsManageModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'system' | 'custom'>('system');

    // Edit State
    const [editName, setEditName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const [showFilters, setShowFilters] = useState(false);
    const [showDashboardTools, setShowDashboardTools] = useLocalStorage<boolean>('dashboard_tools_open', false);
    const [dashboardToolsTab, setDashboardToolsTab] = useLocalStorage<'layout' | 'filters'>('dashboard_tools_tab_v1', 'layout');
    const [suggestedColumns, setSuggestedColumns] = useState<string[]>([]);
    const { visibleSidebarComponentIds, setVisibleSidebarComponentIds, togglePresentationMode, isReadOnly } = useDashboard();
    const { isExporting, exportToPdf } = useReportExport();
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8
            }
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates
        })
    );

    // Fetch custom widgets
    const { data: customWidgets, refresh: refreshCustomWidgets } = useAsync<CustomWidgetRecord[]>(
        async () => {
            return await SystemRepository.executeRaw('SELECT * FROM sys_user_widgets ORDER BY created_at DESC') as CustomWidgetRecord[];
        },
        []
    );

    const initRef = React.useRef(false);

    // Initial Load & Migration
    useEffect(() => {
        const init = async () => {
            if (initRef.current) return;
            initRef.current = true;

            const rawDashboards = await SystemRepository.getDashboards();
            let dbDashboards = rawDashboards as unknown as DashboardDef[];

            // Migration from localStorage
            const legacyLayout = localStorage.getItem('custom_dashboard_layout');
            if (dbDashboards.length === 0) {
                const defaultDash: DashboardDef = {
                    id: crypto.randomUUID(),
                    name: t('dashboard.default_name'),
                    layout: legacyLayout ? JSON.parse(legacyLayout) : [],
                    is_default: true
                };
                await SystemRepository.saveDashboard(defaultDash, true);
                if (legacyLayout) localStorage.removeItem('custom_dashboard_layout');
                dbDashboards = [defaultDash];
            } else if (dbDashboards.length > 0) {
                // Parse layouts from strings
                dbDashboards = dbDashboards.map((d: DashboardDef) => ({
                    ...d,
                    layout: typeof d.layout === 'string' ? JSON.parse(d.layout) : d.layout
                }));
            }

            setDashboards(dbDashboards);
            const hashPart = window.location.hash || '#/';
            const queryString = hashPart.includes('?') ? hashPart.slice(hashPart.indexOf('?') + 1) : '';
            const requestedDashboardId = queryString ? new URLSearchParams(queryString).get('dashboard') : null;
            const resolvedDashboardId = requestedDashboardId && dbDashboards.some(d => d.id === requestedDashboardId)
                ? requestedDashboardId
                : (dbDashboards[0]?.id ?? null);
            setActiveDashboardId(resolvedDashboardId);
            setIsLoaded(true);
        };
        init();
    }, [t]);

    const activeDashboard = dashboards.find(d => d.id === activeDashboardId);

    // Dynamic Column Scanner for Global Filters
    useEffect(() => {
        if (!activeDashboard || !customWidgets) return;

        const scanColumns = async () => {
            const dashboardWidgetIds = activeDashboard.layout.map(w => w.id);
            const activeWidgets = customWidgets.filter(w => dashboardWidgetIds.includes(w.id));

            const tables = new Set<string>();
            activeWidgets.forEach(w => {
                const match = w.sql_query.match(/FROM\s+([a-zA-Z0-9_]+)/i);
                if (match) tables.add(match[1]);
            });

            const allCols = new Set<string>();
            for (const table of Array.from(tables)) {
                try {
                    const cols = await SystemRepository.getTableSchema(table);
                    if (cols && Array.isArray(cols)) {
                        cols.forEach(c => allCols.add(c.name));
                    }
                } catch (e) {
                    logger.error('Error fetching schema for table', table, e);
                }
            }
            setSuggestedColumns(Array.from(allCols).sort());
        };

        scanColumns();
    }, [activeDashboard, customWidgets]);

    // Sync active dashboard to DB
    const syncDashboard = async (updatedDash: DashboardDef) => {
        await SystemRepository.saveDashboard(updatedDash);
        setDashboards(prev => prev.map(d => d.id === updatedDash.id ? updatedDash : d));
    };

    const addToDashboard = async (id: string, type: 'custom' | 'system') => {
        if (!activeDashboard) return;
        if (activeDashboard.layout.find(w => w.id === id)) return;

        const updated = {
            ...activeDashboard,
            layout: [...activeDashboard.layout, { id, type }]
        };
        await syncDashboard(updated);
        setIsAddModalOpen(false);
    };

    const removeFromDashboard = async (id: string) => {
        if (!activeDashboard) return;
        const updated = {
            ...activeDashboard,
            layout: activeDashboard.layout.filter(w => w.id !== id)
        };
        await syncDashboard(updated);
    };

    const handleDashboardDragEnd = async (event: DragEndEvent) => {
        if (isReadOnly || !activeDashboard) return;
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = activeDashboard.layout.findIndex(w => w.id === String(active.id));
        const newIndex = activeDashboard.layout.findIndex(w => w.id === String(over.id));
        if (oldIndex < 0 || newIndex < 0) return;

        const reorderedLayout = arrayMove(activeDashboard.layout, oldIndex, newIndex);
        await syncDashboard({
            ...activeDashboard,
            layout: reorderedLayout
        });
    };

    const moveWidgetInLayout = async (widgetId: string, delta: -1 | 1) => {
        if (!activeDashboard) return;
        const index = activeDashboard.layout.findIndex(w => w.id === widgetId);
        if (index < 0) return;
        const nextIndex = index + delta;
        if (nextIndex < 0 || nextIndex >= activeDashboard.layout.length) return;
        const nextLayout = arrayMove(activeDashboard.layout, index, nextIndex);
        await syncDashboard({ ...activeDashboard, layout: nextLayout });
    };

    const addDashboardFilter = async (column = '') => {
        if (!activeDashboard) return;
        await syncDashboard({
            ...activeDashboard,
            filters: [...(activeDashboard.filters || []), { column, operator: '=', value: '' }]
        });
    };

    const updateDashboardFilter = async (index: number, patch: Partial<FilterDef>) => {
        if (!activeDashboard) return;
        const next = [...(activeDashboard.filters || [])];
        next[index] = { ...next[index], ...patch };
        await syncDashboard({ ...activeDashboard, filters: next });
    };

    const removeDashboardFilter = async (index: number) => {
        if (!activeDashboard) return;
        await syncDashboard({
            ...activeDashboard,
            filters: (activeDashboard.filters || []).filter((_, idx) => idx !== index)
        });
    };

    const clearDashboardFilters = async () => {
        if (!activeDashboard) return;
        await syncDashboard({ ...activeDashboard, filters: [] });
    };

    const getWidgetLabel = (widget: SavedWidget) => {
        if (widget.type === 'system') {
            const meta = SYSTEM_WIDGETS.find(w => w.id === widget.id);
            return meta ? t(meta.titleKey) : widget.id;
        }
        return customWidgets?.find(w => w.id === widget.id)?.name || widget.id;
    };

    const deleteCustomWidget = async (id: string) => {
        if (await appDialog.confirm(t('dashboard.confirm_delete_report'))) {
            await SystemRepository.executeRaw(`DELETE FROM sys_user_widgets WHERE id = '${id}'`);
            refreshCustomWidgets();
            removeFromDashboard(id);
        }
    };

    const createDashboard = async () => {
        if (!editName.trim()) return;
        const newDash: DashboardDef = {
            id: crypto.randomUUID(),
            name: editName,
            layout: [],
            is_default: false
        };
        await SystemRepository.saveDashboard(newDash);
        setDashboards([...dashboards, newDash]);
        setActiveDashboardId(newDash.id);
        setEditName('');
        setIsCreating(false);
    };

    const removeDashboard = async (id: string) => {
        if (dashboards.length <= 1) return;
        if (!(await appDialog.confirm(t('dashboard.delete_confirm')))) return;

        await SystemRepository.deleteDashboard(id);
        const filtered = dashboards.filter(d => d.id !== id);
        setDashboards(filtered);
        if (activeDashboardId === id) {
            setActiveDashboardId(filtered[0].id);
        }
    };

    if (!isLoaded) return null;

    return (
        <PageLayout
            header={{
                title: t('dashboard.title'),
                subtitle: t('dashboard.subtitle'),
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
                            onClick={() => exportToPdf('dashboard-grid', `dashboard-${activeDashboard?.name || 'export'}`)}
                            disabled={isExporting}
                            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium text-sm disabled:opacity-50"
                        >
                            <Download className="w-4 h-4" />
                            {isExporting ? t('common.exporting') : t('common.export_pdf')}
                        </button>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`p-2 rounded-lg transition-colors border ${showFilters ? 'bg-blue-50 border-blue-200 text-blue-600' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 border-transparent hover:border-blue-100'}`}
                            title={t('querybuilder.filter')}
                        >
                            <Filter className="w-5 h-5" />
                        </button>
                        {!isReadOnly && (
                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium text-sm"
                            >
                                <Plus className="w-4 h-4" />
                                {t('dashboard.add_title')}
                            </button>
                        )}
                    </div>
                )
            }}
            rightPanel={{
                title: t('dashboard.tools_title', 'Dashboard Tools'),
                enabled: Boolean(activeDashboard),
                triggerTitle: t('dashboard.tools_title', 'Dashboard Tools'),
                width: 'sm',
                isOpen: showDashboardTools,
                onOpenChange: setShowDashboardTools,
                content: (
                    <div className="h-full min-h-0 flex flex-col gap-4">
                        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1 flex-shrink-0">
                            <button
                                type="button"
                                onClick={() => setDashboardToolsTab('layout')}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${dashboardToolsTab === 'layout' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {t('dashboard.tools_tab_layout', 'Layout')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setDashboardToolsTab('filters')}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${dashboardToolsTab === 'filters' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {t('dashboard.tools_tab_filters', 'Filters')}
                            </button>
                        </div>

                        {!activeDashboard ? (
                            <div className="text-xs text-slate-500">{t('common.no_data')}</div>
                        ) : dashboardToolsTab === 'layout' ? (
                            <div className="flex-1 min-h-0 flex flex-col gap-2">
                                <p className="text-xs text-slate-500">{t('dashboard.tools_layout_hint', 'Reorder widgets and remove items without leaving the dashboard.')}</p>
                                <div className="flex-1 min-h-0 overflow-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                    {activeDashboard.layout.length === 0 ? (
                                        <div className="p-3 text-xs text-slate-400">{t('dashboard.no_reports')}</div>
                                    ) : (
                                        activeDashboard.layout.map((widget, index) => (
                                            <div key={`${widget.type}:${widget.id}`} className="p-3 flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="text-xs font-semibold text-slate-700 truncate">{getWidgetLabel(widget)}</div>
                                                    <div className="text-[10px] text-slate-400 uppercase">{widget.type}</div>
                                                </div>
                                                {!isReadOnly && (
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => { void moveWidgetInLayout(widget.id, -1); }}
                                                            disabled={index === 0}
                                                            className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40"
                                                            title={t('dashboard.tools_move_up', 'Move up')}
                                                        >
                                                            <ArrowUp className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { void moveWidgetInLayout(widget.id, 1); }}
                                                            disabled={index === activeDashboard.layout.length - 1}
                                                            className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40"
                                                            title={t('dashboard.tools_move_down', 'Move down')}
                                                        >
                                                            <ArrowDown className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { void removeFromDashboard(widget.id); }}
                                                            className="h-7 w-7 inline-flex items-center justify-center rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700"
                                                            title={t('common.remove')}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 min-h-0 flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs text-slate-500">{t('dashboard.tools_filters_hint', 'Manage global dashboard filters in one place.')}</p>
                                    {!isReadOnly && (
                                        <button
                                            type="button"
                                            onClick={() => { void addDashboardFilter(''); }}
                                            className="h-7 px-2 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold"
                                        >
                                            {t('dashboard.add_filter')}
                                        </button>
                                    )}
                                </div>
                                {!isReadOnly && (
                                    <div className="flex items-center justify-end">
                                        <button
                                            type="button"
                                            onClick={() => { void clearDashboardFilters(); }}
                                            className="text-[11px] text-slate-500 hover:text-slate-700"
                                        >
                                            {t('dashboard.tools_clear_filters', 'Clear filters')}
                                        </button>
                                    </div>
                                )}
                                <div className="flex-1 min-h-0 overflow-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                    {(activeDashboard.filters || []).length === 0 ? (
                                        <div className="p-3 text-xs text-slate-400">{t('dashboard.no_filters')}</div>
                                    ) : (
                                        (activeDashboard.filters || []).map((f, i) => (
                                            <div key={i} className="p-3 space-y-2">
                                                <input
                                                    list="suggested-columns"
                                                    value={f.column}
                                                    onChange={(e) => { void updateDashboardFilter(i, { column: e.target.value }); }}
                                                    placeholder={t('dashboard.filter_column')}
                                                    className="w-full h-8 px-2 border border-slate-200 rounded bg-white text-xs outline-none"
                                                />
                                                <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                                                    <select
                                                        value={f.operator}
                                                        onChange={(e) => { void updateDashboardFilter(i, { operator: e.target.value }); }}
                                                        className="h-8 px-2 border border-slate-200 rounded bg-white text-xs outline-none"
                                                    >
                                                        <option value="=">=</option>
                                                        <option value="!=">!=</option>
                                                        <option value=">">&gt;</option>
                                                        <option value="<">&lt;</option>
                                                        <option value="contains">{t('dashboard.op_contains')}</option>
                                                        <option value="is null">{t('dashboard.op_is_null')}</option>
                                                    </select>
                                                    <input
                                                        value={f.value}
                                                        onChange={(e) => { void updateDashboardFilter(i, { value: e.target.value }); }}
                                                        placeholder={t('dashboard.filter_value')}
                                                        className="h-8 px-2 border border-slate-200 rounded bg-white text-xs outline-none"
                                                    />
                                                    {!isReadOnly && (
                                                        <button
                                                            type="button"
                                                            onClick={() => { void removeDashboardFilter(i); }}
                                                            className="h-8 w-8 inline-flex items-center justify-center rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700"
                                                            title={t('common.remove')}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )
            }}
        >
            {/* Global Filter Bar */}
            {showFilters && activeDashboard && (
                <div className="mb-6 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm animate-in slide-in-from-top-2 duration-300">
                    <datalist id="suggested-columns">
                        {suggestedColumns.map(col => <option key={col} value={col} />)}
                    </datalist>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex flex-col gap-1">
                            <h4 className="text-xs font-black uppercase text-slate-400 flex items-center gap-2">
                                <Filter className="w-3.5 h-3.5 text-blue-500" /> {t('dashboard.filters_title')}
                            </h4>
                            <p className="text-[10px] text-slate-400">{t('dashboard.filters_subtitle', 'Slicers that affect all dashboard charts simultaneously.')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Smart Filter Buttons based on detected columns */}
                            {suggestedColumns.filter(c =>
                                ['Year', 'FiscalYear', 'Date', 'Month', 'Category', 'Group', 'Type', 'Status'].some(key => c.toLowerCase().includes(key.toLowerCase()))
                            ).slice(0, 3).map(col => (
                                <button
                                    key={col}
                                    onClick={() => syncDashboard({ ...activeDashboard, filters: [...(activeDashboard.filters || []), { column: col, operator: '=', value: '' }] })}
                                    className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold text-slate-500 hover:text-blue-600 transition-colors"
                                >
                                    + {col}
                                </button>
                            ))}
                            <button
                                onClick={() => syncDashboard({ ...activeDashboard, filters: [...(activeDashboard.filters || []), { column: '', operator: '=', value: '' }] })}
                                className="px-3 py-1 bg-blue-600 text-white rounded text-[10px] font-bold shadow-sm shadow-blue-100 hover:bg-blue-700 transition-colors"
                            >
                                {t('dashboard.add_filter')}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        {(activeDashboard.filters || []).map((f, i) => (
                            <div key={i} className="flex items-center gap-2 group animate-in slide-in-from-left-2 duration-200" style={{ animationDelay: `${i * 50}ms` }}>
                                <div className="flex-1 grid grid-cols-12 gap-2 p-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-lg group-hover:border-slate-200 group-hover:bg-white dark:group-hover:bg-slate-800 transition-all">
                                    <input
                                        placeholder={t('dashboard.filter_column')}
                                        list="suggested-columns"
                                        className="col-span-4 p-1.5 text-[11px] bg-transparent outline-none font-bold text-slate-700 dark:text-slate-200"
                                        value={f.column}
                                        onChange={e => {
                                            const next = [...(activeDashboard.filters || [])];
                                            next[i].column = e.target.value;
                                            syncDashboard({ ...activeDashboard, filters: next });
                                        }}
                                    />
                                    <select
                                        className="col-span-3 p-1.5 text-[11px] bg-transparent outline-none border-l border-slate-100 dark:border-slate-800 text-slate-500 font-medium cursor-pointer"
                                        value={f.operator}
                                        onChange={e => {
                                            const next = [...(activeDashboard.filters || [])];
                                            next[i].operator = e.target.value;
                                            syncDashboard({ ...activeDashboard, filters: next });
                                        }}
                                    >
                                        <option value="=">=</option>
                                        <option value="!=">!=</option>
                                        <option value=">">&gt;</option>
                                        <option value="<">&lt;</option>
                                        <option value="contains">{t('dashboard.op_contains')}</option>
                                        <option value="is null">{t('dashboard.op_is_null')}</option>
                                    </select>
                                    <input
                                        placeholder={t('dashboard.filter_value')}
                                        className="col-span-5 p-1.5 text-[11px] bg-transparent outline-none border-l border-slate-100 dark:border-slate-800 font-bold text-blue-600 dark:text-blue-400 placeholder:text-blue-200"
                                        value={f.value}
                                        onChange={e => {
                                            const next = [...(activeDashboard.filters || [])];
                                            next[i].value = e.target.value;
                                            syncDashboard({ ...activeDashboard, filters: next });
                                        }}
                                    />
                                </div>
                                <button
                                    onClick={() => syncDashboard({ ...activeDashboard, filters: (activeDashboard.filters || []).filter((_, idx) => idx !== i) })}
                                    className="p-1.5 text-slate-300 hover:text-red-500 transition-colors bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                        {(activeDashboard.filters || []).length === 0 && (
                            <div className="py-8 text-center border-2 border-dashed border-slate-50 dark:border-slate-800 rounded-xl">
                                <Filter className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">{t('dashboard.no_filters')}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* Dashboard Tabs */}
            <div className="mb-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-px">
                    {dashboards.map(d => (
                        <button
                            key={d.id}
                            onClick={() => setActiveDashboardId(d.id)}
                            className={`px-4 py-2.5 text-sm font-bold transition-all border-b-2 whitespace-nowrap ${activeDashboardId === d.id
                                ? 'text-blue-600 border-blue-600'
                                : 'text-slate-400 border-transparent hover:text-slate-600'
                                }`}
                        >
                            {d.name}
                        </button>
                    ))}
                    {!isReadOnly && (
                        <button
                            onClick={() => { setIsCreating(true); setEditName(''); }}
                            className="px-4 py-2.5 text-slate-400 hover:text-blue-600 transition-all border-b-2 border-transparent"
                            title={t('dashboard.new_dashboard_title')}
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {!isReadOnly && (
                    <button
                        onClick={() => setIsManageModalOpen(true)}
                        className="p-2 text-slate-400 hover:text-slate-600"
                        title={t('dashboard.manage_title')}
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Dashboard Name Editor (Inline Create) */}
            {
                isCreating && (
                    <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center gap-3">
                        <Layout className="w-5 h-5 text-slate-400" />
                        <input
                            autoFocus
                            type="text"
                            placeholder={t('dashboard.new_dashboard_placeholder')}
                            className="flex-1 bg-transparent border-none outline-none font-bold text-slate-700 dark:text-slate-200"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && createDashboard()}
                        />
                        <div className="flex items-center gap-1">
                            <button onClick={createDashboard} className="p-1.5 text-green-600 hover:bg-green-50 rounded"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setIsCreating(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded"><X className="w-4 h-4" /></button>
                        </div>
                    </div>
                )
            }

            {
                activeDashboard && activeDashboard.layout.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 text-slate-400">
                        <Layout className="w-12 h-12 mb-4 opacity-50" />
                        <h3 className="font-bold text-lg text-slate-600">{t('dashboard.empty_msg', { name: activeDashboard.name })}</h3>
                        <p className="mb-4 text-sm text-center">{t('dashboard.empty_hint')}</p>
                        {!isReadOnly && (
                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                className="px-6 py-2 bg-white border border-slate-200 rounded-lg text-blue-600 font-bold hover:shadow-sm transition-all text-sm"
                            >
                                {t('dashboard.add_title')}
                            </button>
                        )}
                    </div>
                ) : activeDashboard ? (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => { void handleDashboardDragEnd(event); }}
                    >
                        <div id="dashboard-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 auto-rows-[300px]">
                        {activeDashboard.layout.map((widgetRef) => {
                            // Render System Widget
                            if (widgetRef.type === 'system') {
                                const meta = SYSTEM_WIDGETS.find(w => w.id === widgetRef.id);
                                if (!meta) return null;
                                const Component = getComponent(meta.id);
                                if (!Component) return null;

                                return (
                                    <DashboardSortableItem key={widgetRef.id} id={widgetRef.id} className={`relative group h-full ${meta.defaultColSpan === 2 ? 'md:col-span-2' : ''}`}>
                                        {!isReadOnly && (
                                            <div className="absolute -top-2 -right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeFromDashboard(widgetRef.id); }}
                                                    className="p-1.5 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-full text-slate-400 hover:text-red-500 shadow-sm"
                                                    title={t('common.remove')}
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        )}
                                        <div className="h-full">
                                            <Component
                                                onRemove={undefined}
                                                targetView={COMPONENTS.find(c => c.component === meta.id)?.targetView}
                                            />
                                        </div>
                                    </DashboardSortableItem>
                                );
                            }

                            // Render Custom Widget
                            const dbWidget = customWidgets?.find(w => w.id === widgetRef.id);
                            if (!dbWidget) return null;

                            let config: WidgetConfig;
                            try {
                                config = JSON.parse(dbWidget.visualization_config) as WidgetConfig;
                            } catch {
                                config = { type: 'table' };
                            }

                            return (
                                <DashboardSortableItem key={widgetRef.id} id={widgetRef.id} className="relative group md:col-span-1 xl:col-span-2 h-full">
                                    {!isReadOnly && (
                                        <div className="absolute -top-2 -right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => removeFromDashboard(widgetRef.id)}
                                                className="p-1.5 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-full text-slate-400 hover:text-red-500 shadow-sm"
                                                title="Entfernen"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                    <WidgetRenderer
                                        title={dbWidget.name}
                                        sql={dbWidget.sql_query}
                                        config={config}
                                        globalFilters={activeDashboard.filters}
                                        showInspectorJump
                                        inspectorReturnHash={activeDashboard?.id ? `#/?dashboard=${encodeURIComponent(activeDashboard.id)}` : '#/'}
                                    />
                                </DashboardSortableItem>
                            );
                        })}
                        </div>
                    </DndContext>
                ) : null
            }

            {/* Manage Dashboards Modal */}
            <Modal isOpen={isManageModalOpen} onClose={() => setIsManageModalOpen(false)} title={t('dashboard.manage_title')}>
                <div className="space-y-3">
                    {dashboards.map(d => (
                        <div key={d.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg group">
                            <div className="flex items-center gap-3">
                                <Layout className="w-4 h-4 text-slate-400" />
                                <span className="font-bold text-slate-700">{d.name}</span>
                                {d.is_default && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Default</span>}
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={async () => {
                                        const newName = await appDialog.prompt('Name fuer Dashboard:', { defaultValue: d.name });
                                        if (newName && newName !== d.name) {
                                            syncDashboard({ ...d, name: newName });
                                        }
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                >
                                    <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => removeDashboard(d.id)}
                                    disabled={dashboards.length <= 1}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-30"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                    <button
                        onClick={() => { setIsManageModalOpen(false); setIsCreating(true); }}
                        className="w-full p-3 border-2 border-dashed border-slate-100 rounded-lg text-slate-400 hover:text-blue-600 hover:border-blue-200 text-sm font-bold transition-all flex items-center justify-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Neues Dashboard
                    </button>
                </div>
            </Modal>

            {/* Add Widget Modal (Customized for active dashboard) */}
            <Modal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                title={t('dashboard.add_title')}
            >
                <div className="flex gap-4 mb-4 border-b border-slate-200">
                    <button
                        onClick={() => setActiveTab('system')}
                        className={`pb-2 text-sm font-bold ${activeTab === 'system' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}
                    >
                        {t('dashboard.system_widgets')}
                    </button>
                    <button
                        onClick={() => setActiveTab('custom')}
                        className={`pb-2 text-sm font-bold ${activeTab === 'custom' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}
                    >
                        {t('dashboard.custom_widgets')}
                    </button>
                </div>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto min-h-[300px]">
                    {activeTab === 'system' && (
                        <div className="grid grid-cols-1 gap-2">
                            {SYSTEM_WIDGETS.map(w => {
                                const isAdded = activeDashboard?.layout.some(dw => dw.id === w.id);
                                const componentConfig = COMPONENTS.find(c => c.component === w.id);
                                const hasView = !!componentConfig?.targetView;
                                const isPinned = hasView && visibleSidebarComponentIds.includes(componentConfig!.id);

                                return (
                                    <div key={w.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-slate-100 rounded-lg text-slate-500">
                                                <w.icon className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-700">{t(w.titleKey)}</div>
                                                <div className="text-xs text-slate-400">{t(w.descriptionKey)}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {/* Pin to Sidebar Toggle */}
                                            {hasView && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (isPinned) {
                                                            setVisibleSidebarComponentIds(visibleSidebarComponentIds.filter(id => id !== componentConfig!.id));
                                                        } else {
                                                            setVisibleSidebarComponentIds([...visibleSidebarComponentIds, componentConfig!.id]);
                                                        }
                                                    }}
                                                    title={isPinned ? t('dashboard.unpin_sidebar') : t('dashboard.pin_sidebar')}
                                                    className={`p-1.5 rounded-md border transition-all ${isPinned ? 'bg-amber-50 border-amber-200 text-amber-500' : 'bg-white border-slate-200 text-slate-300 hover:text-amber-400'}`}
                                                >
                                                    <Star className={`w-4 h-4 ${isPinned ? 'fill-current' : ''}`} />
                                                </button>
                                            )}

                                            <button
                                                onClick={() => addToDashboard(w.id, 'system')}
                                                disabled={isAdded}
                                                className={`px-3 py-1.5 text-xs font-bold rounded ${isAdded ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                                            >
                                                {isAdded ? t('dashboard.active') : t('common.add')}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {activeTab === 'custom' && (
                        <div className="grid grid-cols-1 gap-2">
                            {customWidgets && customWidgets.length > 0 ? customWidgets.map(w => {
                                const isAdded = activeDashboard?.layout.some(dw => dw.id === w.id);
                                return (
                                    <div key={w.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-50 rounded-lg text-blue-500">
                                                <Database className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-700">{w.name}</div>
                                                <div className="text-xs text-slate-400 truncate max-w-[200px]">{w.sql_query}</div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => deleteCustomWidget(w.id)}
                                                className="p-2 text-slate-400 hover:text-red-500"
                                                title={t('common.delete')}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => addToDashboard(w.id, 'custom')}
                                                disabled={isAdded}
                                                className={`px-3 py-1.5 text-xs font-bold rounded ${isAdded ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                                            >
                                                {isAdded ? t('dashboard.active') : t('common.add')}
                                            </button>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <p className="text-center text-slate-400 py-4">{t('dashboard.no_reports')}</p>
                            )}
                        </div>
                    )}
                </div>
            </Modal>
        </PageLayout >
    );
};

