import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '../components/ui/PageLayout';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { useAsync } from '../../hooks/useAsync';
import { Plus, Layout, Trash2, Database, Star, Settings, Edit2, Download, Maximize2, Minimize2, Filter, ArrowUp, ArrowDown, ArrowRightLeft, FolderOpen } from 'lucide-react';
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
const APP_READY_EVENT = 'litebi:app-ready';

interface FilterDef {
    column: string;
    operator: string;
    value: string;
}

interface SavedWidget {
    id: string; // Either UUID for custom or 'sys_...' for system
    type: 'custom' | 'system';
    position?: number;
    size?: '1x1' | '1x2' | '2x1' | '2x2';
}

interface DashboardDef {
    id: string;
    name: string;
    layout: SavedWidget[];
    is_default: boolean;
    filters?: FilterDef[];
}

type WidgetTileSize = NonNullable<SavedWidget['size']>;

const DEFAULT_SYSTEM_WIDGET_SIZE: WidgetTileSize = '1x1';
const DEFAULT_CUSTOM_WIDGET_SIZE: WidgetTileSize = '2x1';

const WIDGET_TILE_SIZE_OPTIONS: WidgetTileSize[] = ['1x1', '1x2', '2x1', '2x2'];

const getDefaultWidgetSize = (type: SavedWidget['type']): WidgetTileSize => (
    type === 'system' ? DEFAULT_SYSTEM_WIDGET_SIZE : DEFAULT_CUSTOM_WIDGET_SIZE
);

const normalizeSavedWidget = (raw: unknown): SavedWidget | null => {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Partial<SavedWidget>;
    if (typeof item.id !== 'string' || (item.type !== 'custom' && item.type !== 'system')) return null;
    const nextSize = item.size && WIDGET_TILE_SIZE_OPTIONS.includes(item.size) ? item.size : getDefaultWidgetSize(item.type);
    return {
        id: item.id,
        type: item.type,
        position: typeof item.position === 'number' ? item.position : undefined,
        size: nextSize
    };
};

const getWidgetSizeClassName = (size: WidgetTileSize): string => {
    switch (size) {
        case '1x2':
            return 'md:col-span-1 xl:col-span-1 row-span-2';
        case '2x1':
            return 'md:col-span-2 xl:col-span-2 row-span-1';
        case '2x2':
            return 'md:col-span-2 xl:col-span-2 row-span-2';
        case '1x1':
        default:
            return 'md:col-span-1 xl:col-span-1 row-span-1';
    }
};

const getWidgetRefKey = (widget: SavedWidget): string => `${widget.type}:${widget.id}`;

interface CustomWidgetRecord extends DbRow {
    id: string;
    name: string;
    description?: string | null;
    sql_statement_id?: string | null;
    sql_query: string;
    visualization_config: string;
    visual_builder_config?: string | null;
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
    const [dashboardOrderIds, setDashboardOrderIds] = useLocalStorage<string[]>('dashboard_order_v1', []);
    const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    // Modals
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'system' | 'custom'>('system');

    const [showDashboardTools, setShowDashboardTools] = useLocalStorage<boolean>('dashboard_tools_open', false);
    const [dashboardToolsTab, setDashboardToolsTab] = useLocalStorage<'layout' | 'filters' | 'dashboards'>('dashboard_tools_tab_v1', 'layout');
    const [movePickerWidgetId, setMovePickerWidgetId] = useState<string | null>(null);
    const [zoomedWidgetKey, setZoomedWidgetKey] = useState<string | null>(null);
    const [suggestedColumns, setSuggestedColumns] = useState<string[]>([]);
    const [filterValueSuggestions, setFilterValueSuggestions] = useState<Record<string, string[]>>({});
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
                const migratedLegacyLayout = legacyLayout
                    ? (JSON.parse(legacyLayout) as unknown[])
                        .map(normalizeSavedWidget)
                        .filter((w): w is SavedWidget => Boolean(w))
                    : [];
                const defaultDash: DashboardDef = {
                    id: crypto.randomUUID(),
                    name: t('dashboard.default_name'),
                    layout: migratedLegacyLayout,
                    is_default: true
                };
                await SystemRepository.saveDashboard(defaultDash, true);
                if (legacyLayout) localStorage.removeItem('custom_dashboard_layout');
                dbDashboards = [defaultDash];
            } else if (dbDashboards.length > 0) {
                // Parse layouts from strings
                dbDashboards = dbDashboards.map((d: DashboardDef) => {
                    let rawLayout: unknown = d.layout;
                    if (typeof rawLayout === 'string') {
                        try {
                            rawLayout = JSON.parse(rawLayout);
                        } catch {
                            rawLayout = [];
                        }
                    }
                    const normalizedLayout = (Array.isArray(rawLayout) ? rawLayout : [])
                        .map(normalizeSavedWidget)
                        .filter((w): w is SavedWidget => Boolean(w));
                    return {
                        ...d,
                        layout: normalizedLayout
                    };
                });
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
            (window as Window & { __LITEBI_READY__?: boolean }).__LITEBI_READY__ = true;
            window.dispatchEvent(new Event(APP_READY_EVENT));
        };
        init();
    }, [t]);

    const orderedDashboards = React.useMemo(() => {
        if (!dashboards.length) return [];
        const byId = new Map(dashboards.map(d => [d.id, d] as const));
        const orderedFromConfig = dashboardOrderIds
            .map((id) => byId.get(id))
            .filter((d): d is DashboardDef => Boolean(d));
        const missing = dashboards.filter(d => !dashboardOrderIds.includes(d.id));
        return [...orderedFromConfig, ...missing];
    }, [dashboards, dashboardOrderIds]);
    const activeDashboard = orderedDashboards.find(d => d.id === activeDashboardId);
    const targetDashboards = React.useMemo(
        () => orderedDashboards.filter(d => d.id !== activeDashboardId),
        [orderedDashboards, activeDashboardId]
    );
    const effectiveMovePickerWidgetId = React.useMemo(() => {
        if (!movePickerWidgetId || !activeDashboard) return null;
        return activeDashboard.layout.some(w => w.id === movePickerWidgetId) ? movePickerWidgetId : null;
    }, [activeDashboard, movePickerWidgetId]);
    const zoomedWidgetRef = React.useMemo(() => {
        if (!zoomedWidgetKey || !activeDashboard) return null;
        return activeDashboard.layout.find((w) => getWidgetRefKey(w) === zoomedWidgetKey) || null;
    }, [activeDashboard, zoomedWidgetKey]);

    // Compute filterable columns that are available across all active query widgets.
    useEffect(() => {
        if (!activeDashboard || !customWidgets) return;

        const scanColumns = async () => {
            const dashboardWidgetIds = activeDashboard.layout.map(w => w.id);
            const activeWidgets = customWidgets.filter(w => dashboardWidgetIds.includes(w.id));
            if (activeWidgets.length === 0) {
                setSuggestedColumns([]);
                return;
            }

            const widgetColumnSets: Set<string>[] = [];
            for (const widget of activeWidgets) {
                const tables = new Set<string>();
                const tableRegex = /\b(?:FROM|JOIN)\s+([a-zA-Z0-9_]+)/gi;
                let match: RegExpExecArray | null = null;
                while ((match = tableRegex.exec(widget.sql_query)) !== null) {
                    if (match[1]) tables.add(match[1]);
                }

                const widgetCols = new Set<string>();
                for (const table of Array.from(tables)) {
                    try {
                        const cols = await SystemRepository.getTableSchema(table);
                        if (cols && Array.isArray(cols)) {
                            cols.forEach(c => widgetCols.add(c.name));
                        }
                    } catch (e) {
                        logger.error('Error fetching schema for table', table, e);
                    }
                }
                if (widgetCols.size > 0) {
                    widgetColumnSets.push(widgetCols);
                }
            }

            if (widgetColumnSets.length === 0) {
                setSuggestedColumns([]);
                return;
            }

            const [firstSet, ...restSets] = widgetColumnSets;
            const commonCols = new Set<string>(Array.from(firstSet).filter(col => restSets.every(set => set.has(col))));
            setSuggestedColumns(Array.from(commonCols).sort());
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
            layout: [...activeDashboard.layout, { id, type, size: getDefaultWidgetSize(type) }]
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
        setZoomedWidgetKey((prev) => {
            const removed = activeDashboard.layout.find((w) => w.id === id);
            if (!removed) return prev;
            return prev === getWidgetRefKey(removed) ? null : prev;
        });
    };

    const updateWidgetSize = async (widgetId: string, size: WidgetTileSize) => {
        if (!activeDashboard) return;
        const nextLayout = activeDashboard.layout.map((widget) =>
            widget.id === widgetId
                ? {
                    ...widget,
                    size: widget.type === 'system' ? DEFAULT_SYSTEM_WIDGET_SIZE : size
                }
                : widget
        );
        await syncDashboard({ ...activeDashboard, layout: nextLayout });
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

    const moveWidgetsToDashboard = async (widgetIds: string[], targetDashboardId: string) => {
        if (!activeDashboard || !targetDashboardId || targetDashboardId === activeDashboard.id) return;
        const targetDashboard = dashboards.find(d => d.id === targetDashboardId);
        if (!targetDashboard) return;

        const uniqueWidgetIds = Array.from(new Set(widgetIds));
        if (uniqueWidgetIds.length === 0) return;

        const widgetsFromSource = activeDashboard.layout.filter(w => uniqueWidgetIds.includes(w.id));
        if (widgetsFromSource.length === 0) return;

        const targetWidgetIds = new Set(targetDashboard.layout.map(w => w.id));
        const widgetsToAppend = widgetsFromSource.filter(w => !targetWidgetIds.has(w.id));
        const nextSourceLayout = activeDashboard.layout.filter(w => !uniqueWidgetIds.includes(w.id));
        const nextTargetLayout = [...targetDashboard.layout, ...widgetsToAppend];

        await Promise.all([
            SystemRepository.saveDashboard({ ...activeDashboard, layout: nextSourceLayout }),
            SystemRepository.saveDashboard({ ...targetDashboard, layout: nextTargetLayout })
        ]);

        setDashboards(prev => prev.map(d => {
            if (d.id === activeDashboard.id) return { ...d, layout: nextSourceLayout };
            if (d.id === targetDashboard.id) return { ...d, layout: nextTargetLayout };
            return d;
        }));
        setMovePickerWidgetId(null);

        if (widgetsToAppend.length < widgetsFromSource.length) {
            const skipped = widgetsFromSource.length - widgetsToAppend.length;
            await appDialog.info(
                t(
                    'dashboard.tools_move_duplicate_skip',
                    '{{count}} widget(s) already existed in the target dashboard and were skipped.',
                    { count: skipped }
                )
            );
        }
    };

    const addDashboardFilter = async (column = suggestedColumns[0] || '') => {
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
        if (typeof patch.column === 'string') {
            const column = patch.column.trim();
            if (column && !filterValueSuggestions[column]) {
                void loadFilterValueSuggestions(column);
            }
        }
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
    const getWidgetSize = (widget: SavedWidget): WidgetTileSize => {
        if (widget.size && WIDGET_TILE_SIZE_OPTIONS.includes(widget.size)) return widget.size;
        return getDefaultWidgetSize(widget.type);
    };

    useEffect(() => {
        if (!zoomedWidgetKey || !activeDashboard) return;
        const exists = activeDashboard.layout.some((widget) => getWidgetRefKey(widget) === zoomedWidgetKey);
        if (!exists) setZoomedWidgetKey(null);
    }, [activeDashboard, zoomedWidgetKey]);

    useEffect(() => {
        if (!zoomedWidgetKey) return;
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setZoomedWidgetKey(null);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [zoomedWidgetKey]);

    const deleteCustomWidget = async (id: string) => {
        if (await appDialog.confirm(t('dashboard.confirm_delete_report'))) {
            await SystemRepository.deleteUserWidget(id);
            refreshCustomWidgets();
            removeFromDashboard(id);
        }
    };
    const renameCustomWidget = async (widget: CustomWidgetRecord) => {
        const currentName = (widget.name || '').trim();
        const parsedConfigForDescription = (() => {
            if (typeof widget.visualization_config !== 'string') return null;
            try {
                return JSON.parse(widget.visualization_config) as { widgetDescription?: string };
            } catch {
                return null;
            }
        })();
        const currentDescription = (widget.description || '').trim()
            || (parsedConfigForDescription?.widgetDescription || '').trim();
        const prompted = await appDialog.prompt2(
            t('dashboard.rename_report_name_label', 'Name des Berichts'),
            t('common.description', 'Description'),
            {
                title: t('dashboard.rename_report_title', 'Bericht umbenennen'),
                defaultValue: currentName,
                secondDefaultValue: currentDescription,
                secondPlaceholder: t('querybuilder.widget_description_placeholder', 'Kurze Einordnung oder Kontext (optional)')
            }
        );
        if (!prompted) return;
        const nextName = prompted.value.trim();
        const nextDescription = prompted.secondValue.trim();
        if (!nextName || nextName === currentName) return;
        const conflicting = (customWidgets || []).find((entry) =>
            entry.id !== widget.id && (entry.name || '').trim().toLowerCase() === nextName.toLowerCase()
        );
        if (conflicting) {
            const overwrite = await appDialog.confirm(
                t('dashboard.rename_report_conflict_confirm', 'Ein Bericht mit dem Namen "{{name}}" existiert bereits. Trotzdem umbenennen?', { name: nextName })
            );
            if (!overwrite) return;
        }

        const parseJsonMaybe = (raw: unknown, fallback: unknown) => {
            if (typeof raw !== 'string') return raw ?? fallback;
            try {
                return JSON.parse(raw);
            } catch {
                return fallback;
            }
        };

        await SystemRepository.saveUserWidget({
            id: widget.id,
            name: nextName,
            description: nextDescription,
            sql_statement_id: widget.sql_statement_id || null,
            sql_query: widget.sql_query || '',
            visualization_config: parseJsonMaybe(widget.visualization_config, {}),
            visual_builder_config: parseJsonMaybe(widget.visual_builder_config, null)
        });
        refreshCustomWidgets();
    };

    const createDashboard = async () => {
        const inputName = await appDialog.prompt(t('dashboard.new_dashboard_placeholder', 'Dashboard name'), {
            title: t('dashboard.new_dashboard_title', 'Create new dashboard')
        });
        if (inputName === null) return;
        const name = inputName.trim();
        if (!name) return;
        const newDash: DashboardDef = {
            id: crypto.randomUUID(),
            name,
            layout: [],
            is_default: false
        };
        await SystemRepository.saveDashboard(newDash);
        setDashboards(prev => [...prev, newDash]);
        setDashboardOrderIds(prev => [...prev.filter(id => id !== newDash.id), newDash.id]);
        setActiveDashboardId(newDash.id);
    };

    const renameDashboard = async (dashboard: DashboardDef) => {
        const newName = await appDialog.prompt(t('dashboard.rename_dashboard_prompt', 'Name for dashboard:'), {
            defaultValue: dashboard.name
        });
        if (!newName) return;
        const trimmed = newName.trim();
        if (!trimmed || trimmed === dashboard.name) return;
        await syncDashboard({ ...dashboard, name: trimmed });
    };

    const removeDashboard = async (id: string) => {
        if (orderedDashboards.length <= 1) return;
        const dashboard = orderedDashboards.find(d => d.id === id);
        if (!dashboard) return;
        if (dashboard.is_default) return;
        if (!(await appDialog.confirm(t('dashboard.delete_confirm')))) return;

        await SystemRepository.deleteDashboard(id);
        const filtered = dashboards.filter(d => d.id !== id);
        setDashboards(filtered);
        setDashboardOrderIds(prev => prev.filter(existingId => existingId !== id));
        if (activeDashboardId === id) {
            setActiveDashboardId(filtered[0].id);
        }
    };

    const moveDashboardOrder = (dashboardId: string, delta: -1 | 1) => {
        const index = orderedDashboards.findIndex(d => d.id === dashboardId);
        if (index < 0) return;
        const nextIndex = index + delta;
        if (nextIndex < 0 || nextIndex >= orderedDashboards.length) return;
        const nextOrdered = arrayMove(orderedDashboards, index, nextIndex);
        setDashboardOrderIds(nextOrdered.map(d => d.id));
    };

    const parseSqlTables = React.useCallback((sql: string): string[] => {
        const tables = new Set<string>();
        const tableRegex = /\b(?:FROM|JOIN)\s+([a-zA-Z0-9_]+)/gi;
        let match: RegExpExecArray | null = null;
        while ((match = tableRegex.exec(sql)) !== null) {
            if (match[1]) tables.add(match[1]);
        }
        return Array.from(tables);
    }, []);

    const isSafeIdentifier = React.useCallback((value: string): boolean => /^[A-Za-z_][A-Za-z0-9_]*$/.test(value), []);

    const loadFilterValueSuggestions = React.useCallback(async (column: string) => {
        const trimmedColumn = column.trim();
        if (!trimmedColumn || !activeDashboard || !customWidgets) return;
        if (!isSafeIdentifier(trimmedColumn)) return;

        const dashboardWidgetIds = new Set(activeDashboard.layout.map(w => w.id));
        const activeWidgets = customWidgets.filter(w => dashboardWidgetIds.has(w.id));
        if (activeWidgets.length === 0) return;

        const widgetTables = new Set<string>();
        activeWidgets.forEach((widget) => {
            parseSqlTables(widget.sql_query || '').forEach((table) => widgetTables.add(table));
        });

        const relevantTables: string[] = [];
        for (const table of Array.from(widgetTables)) {
            if (!isSafeIdentifier(table)) continue;
            try {
                const schema = await SystemRepository.getTableSchema(table);
                if (schema.some((c) => c.name === trimmedColumn)) {
                    relevantTables.push(table);
                }
            } catch (error) {
                logger.error('Failed to inspect table schema for filter suggestions', table, error);
            }
        }

        if (relevantTables.length === 0) {
            setFilterValueSuggestions(prev => ({ ...prev, [trimmedColumn]: [] }));
            return;
        }

        const values = new Set<string>();
        for (const table of relevantTables) {
            const safeTable = table.replace(/"/g, '""');
            const safeColumn = trimmedColumn.replace(/"/g, '""');
            try {
                const rows = await SystemRepository.executeRaw(
                    `SELECT DISTINCT CAST("${safeColumn}" AS TEXT) AS value FROM "${safeTable}" WHERE "${safeColumn}" IS NOT NULL AND TRIM(CAST("${safeColumn}" AS TEXT)) <> '' LIMIT 200`
                ) as DbRow[];
                rows.forEach((row) => {
                    const value = row?.value;
                    if (value === null || value === undefined) return;
                    const normalized = String(value).trim();
                    if (!normalized) return;
                    values.add(normalized);
                });
            } catch (error) {
                logger.error('Failed to load filter value suggestions', { table, column: trimmedColumn }, error);
            }
        }

        const sortedValues = Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        const normalizedColumn = trimmedColumn.toLowerCase();
        const looksCategorical = ['month', 'monat', 'year', 'jahr', 'status', 'type', 'typ', 'category', 'kategorie', 'quarter', 'quartal']
            .some(token => normalizedColumn.includes(token));
        const displayedValues = (looksCategorical || sortedValues.length <= 20)
            ? sortedValues
            : sortedValues.slice(0, 10);

        setFilterValueSuggestions(prev => ({ ...prev, [trimmedColumn]: displayedValues }));
    }, [activeDashboard, customWidgets, isSafeIdentifier, parseSqlTables]);

    useEffect(() => {
        if (!activeDashboard) return;
        const columns = Array.from(new Set((activeDashboard.filters || [])
            .map((f) => (f.column || '').trim())
            .filter((col) => col.length > 0)));
        columns.forEach((column) => {
            if (filterValueSuggestions[column]) return;
            void loadFilterValueSuggestions(column);
        });
    }, [activeDashboard, filterValueSuggestions, loadFilterValueSuggestions]);

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
                            className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors border border-transparent hover:border-blue-100 dark:hover:border-blue-800/40"
                            title={t('dashboard.presentation_mode')}
                        >
                            <Maximize2 className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => exportToPdf('dashboard-grid', `dashboard-${activeDashboard?.name || 'export'}`)}
                            disabled={isExporting}
                            className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm font-medium text-sm disabled:opacity-50"
                        >
                            <Download className="w-4 h-4" />
                            {isExporting ? t('common.exporting') : t('common.export_pdf')}
                        </button>
                        <button
                            onClick={() => {
                                setDashboardToolsTab('filters');
                                setShowDashboardTools(true);
                            }}
                            className={`p-2 rounded-lg transition-colors border ${(showDashboardTools && dashboardToolsTab === 'filters') ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-300' : 'text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-transparent hover:border-blue-100 dark:hover:border-blue-800/40'}`}
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
                        <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 flex-shrink-0">
                            <button
                                type="button"
                                onClick={() => setDashboardToolsTab('dashboards')}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${dashboardToolsTab === 'dashboards' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                            >
                                {t('dashboard.tools_tab_dashboards', 'Dashboards')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setDashboardToolsTab('layout')}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${dashboardToolsTab === 'layout' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                            >
                                {t('dashboard.tools_tab_layout', 'Widgets')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setDashboardToolsTab('filters')}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${dashboardToolsTab === 'filters' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                            >
                                {t('dashboard.tools_tab_filters', 'Filters')}
                            </button>
                        </div>

                        {!activeDashboard ? (
                            <div className="text-xs text-slate-500 dark:text-slate-400">{t('common.no_data')}</div>
                        ) : dashboardToolsTab === 'layout' ? (
                            <div className="flex-1 min-h-0 flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                        {t('dashboard.tools_active_dashboard', 'Dashboard')}
                                    </span>
                                    <select
                                        value={activeDashboardId ?? ''}
                                        onChange={(e) => setActiveDashboardId(e.target.value)}
                                        className="flex-1 h-8 px-2 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 outline-none"
                                        disabled={orderedDashboards.length === 0}
                                    >
                                        {orderedDashboards.map(d => (
                                            <option key={d.id} value={d.id}>
                                                {d.name}
                                            </option>
                                        ))}
                                    </select>
                                    {!isReadOnly && (
                                        <button
                                            type="button"
                                            onClick={() => setIsAddModalOpen(true)}
                                            className="h-8 px-2 inline-flex items-center gap-1 rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[11px] font-semibold whitespace-nowrap"
                                            title={t('dashboard.add_title')}
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            {t('dashboard.add_title')}
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.tools_layout_hint', 'Reorder widgets and remove items without leaving the dashboard.')}</p>
                                <div className="flex-1 min-h-0 overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-700">
                                    {activeDashboard.layout.length === 0 ? (
                                        <div className="p-3 text-xs text-slate-400 dark:text-slate-500">{t('dashboard.no_reports')}</div>
                                    ) : (
                                        activeDashboard.layout.map((widget, index) => {
                                            const customWidgetRecord = widget.type === 'custom'
                                                ? customWidgets?.find(w => w.id === widget.id)
                                                : undefined;
                                            const currentSize = getWidgetSize(widget);
                                            return (
                                            <div key={`${widget.type}:${widget.id}`} className="p-3 flex items-center justify-between gap-2">
                                                <div className="min-w-0 flex items-center gap-2">
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{getWidgetLabel(widget)}</div>
                                                        <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">{widget.type} | {currentSize}</div>
                                                    </div>
                                                </div>
                                                {!isReadOnly && (
                                                    <div className="relative flex items-center gap-1">
                                                        <select
                                                            value={currentSize}
                                                            onChange={(e) => { void updateWidgetSize(widget.id, e.target.value as WidgetTileSize); }}
                                                            disabled={widget.type === 'system'}
                                                            className="h-7 px-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300 outline-none disabled:opacity-40"
                                                            title={widget.type === 'system'
                                                                ? t('dashboard.widget_size_system_locked', 'System widgets stay 1x1')
                                                                : t('dashboard.widget_size', 'Widget size')}
                                                        >
                                                            {WIDGET_TILE_SIZE_OPTIONS.map((sizeOption) => (
                                                                <option key={sizeOption} value={sizeOption}>
                                                                    {sizeOption}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <button
                                                            type="button"
                                                            onClick={() => setMovePickerWidgetId(prev => prev === widget.id ? null : widget.id)}
                                                            disabled={targetDashboards.length === 0}
                                                            className="h-7 w-7 inline-flex items-center justify-center rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 disabled:opacity-40"
                                                            title={t('dashboard.tools_move_to_dashboard', 'Move to dashboard')}
                                                        >
                                                            <ArrowRightLeft className="w-3.5 h-3.5" />
                                                        </button>
                                                        {effectiveMovePickerWidgetId === widget.id && (
                                                            <div className="absolute right-0 top-8 z-30 w-56 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-1">
                                                                {targetDashboards.length === 0 ? (
                                                                    <div className="px-2 py-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                                        {t('dashboard.tools_no_target_dashboard', 'No target dashboard available')}
                                                                    </div>
                                                                ) : (
                                                                    targetDashboards.map(d => (
                                                                        <button
                                                                            key={d.id}
                                                                            type="button"
                                                                            onClick={() => { void moveWidgetsToDashboard([widget.id], d.id); }}
                                                                            className="w-full text-left px-2 py-1.5 text-xs rounded text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                                        >
                                                                            {d.name}
                                                                        </button>
                                                                    ))
                                                                )}
                                                            </div>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => { void moveWidgetInLayout(widget.id, -1); }}
                                                            disabled={index === 0}
                                                            className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40"
                                                            title={t('dashboard.tools_move_up', 'Move up')}
                                                        >
                                                            <ArrowUp className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { void moveWidgetInLayout(widget.id, 1); }}
                                                            disabled={index === activeDashboard.layout.length - 1}
                                                            className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40"
                                                            title={t('dashboard.tools_move_down', 'Move down')}
                                                        >
                                                            <ArrowDown className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (widget.type === 'custom' && customWidgetRecord) {
                                                                    void renameCustomWidget(customWidgetRecord);
                                                                }
                                                            }}
                                                            disabled={!(widget.type === 'custom' && customWidgetRecord)}
                                                            className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40"
                                                            title={
                                                                widget.type === 'custom' && customWidgetRecord
                                                                    ? t('common.rename', 'Rename')
                                                                    : t('dashboard.tools_rename_unavailable', 'System widgets cannot be renamed')
                                                            }
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { void removeFromDashboard(widget.id); }}
                                                            className="h-7 w-7 inline-flex items-center justify-center rounded border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-700 dark:text-rose-300"
                                                            title={t('common.remove')}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        ) : dashboardToolsTab === 'filters' ? (
                            <div className="flex-1 min-h-0 flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.tools_filters_hint', 'Manage global dashboard filters in one place.')}</p>
                                    {!isReadOnly && (
                                        <button
                                            type="button"
                                            onClick={() => { void addDashboardFilter(); }}
                                            disabled={suggestedColumns.length === 0}
                                            className="h-7 px-2 rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[11px] font-semibold disabled:opacity-40"
                                        >
                                            {t('dashboard.add_filter')}
                                        </button>
                                    )}
                                </div>
                                {suggestedColumns.length === 0 && (
                                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                        {t('dashboard.tools_filters_no_common_columns', 'No common filter fields are available across the current widgets.')}
                                    </p>
                                )}
                                {!isReadOnly && (
                                    <div className="flex items-center justify-end">
                                        <button
                                            type="button"
                                            onClick={() => { void clearDashboardFilters(); }}
                                            className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                        >
                                            {t('dashboard.tools_clear_filters', 'Clear filters')}
                                        </button>
                                    </div>
                                )}
                                <div className="flex-1 min-h-0 overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-700">
                                    {(activeDashboard.filters || []).length === 0 ? (
                                        <div className="p-3 text-xs text-slate-400 dark:text-slate-500">{t('dashboard.no_filters')}</div>
                                    ) : (
                                        (activeDashboard.filters || []).map((f, i) => (
                                            <div key={i} className="p-3 space-y-2">
                                                <select
                                                    value={f.column}
                                                    onChange={(e) => { void updateDashboardFilter(i, { column: e.target.value }); }}
                                                    className="w-full h-8 px-2 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 outline-none"
                                                >
                                                    <option value="">{t('dashboard.filter_column')}</option>
                                                    {suggestedColumns.map((col) => (
                                                        <option key={col} value={col}>{col}</option>
                                                    ))}
                                                    {f.column && !suggestedColumns.includes(f.column) && (
                                                        <option value={f.column}>{f.column}</option>
                                                    )}
                                                </select>
                                                <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                                                    <select
                                                        value={f.operator}
                                                        onChange={(e) => { void updateDashboardFilter(i, { operator: e.target.value }); }}
                                                        className="h-8 px-2 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 outline-none"
                                                    >
                                                        <option value="=">=</option>
                                                        <option value="!=">!=</option>
                                                        <option value=">">&gt;</option>
                                                        <option value="<">&lt;</option>
                                                        <option value="contains">{t('dashboard.op_contains')}</option>
                                                        <option value="is null">{t('dashboard.op_is_null')}</option>
                                                    </select>
                                                    <input
                                                        list={f.column ? `filter-value-suggestions-${i}` : undefined}
                                                        value={f.value}
                                                        onChange={(e) => { void updateDashboardFilter(i, { value: e.target.value }); }}
                                                        placeholder={t('dashboard.filter_value')}
                                                        className="h-8 px-2 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 outline-none"
                                                    />
                                                    {f.column && (
                                                        <datalist id={`filter-value-suggestions-${i}`}>
                                                            {(filterValueSuggestions[f.column] || []).map((value) => (
                                                                <option key={value} value={value} />
                                                            ))}
                                                        </datalist>
                                                    )}
                                                    {!isReadOnly && (
                                                        <button
                                                            type="button"
                                                            onClick={() => { void removeDashboardFilter(i); }}
                                                            className="h-8 w-8 inline-flex items-center justify-center rounded border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-700 dark:text-rose-300"
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
                        ) : (
                            <div className="flex-1 min-h-0 flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.tools_dashboards_hint', 'Create, rename, and remove dashboards.')}</p>
                                    {!isReadOnly && (
                                        <button
                                            type="button"
                                            onClick={() => { void createDashboard(); }}
                                            className="h-7 px-2 rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[11px] font-semibold inline-flex items-center gap-1"
                                            title={t('dashboard.new_dashboard_title', 'Create new dashboard')}
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            {t('dashboard.new_short', 'Neu')}
                                        </button>
                                    )}
                                </div>
                                <div className="flex-1 min-h-0 overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-700">
                                    {orderedDashboards.map((d, index) => (
                                        <div key={d.id} className="p-3 flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{d.name}</div>
                                                <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">
                                                    {d.is_default ? t('dashboard.default_badge', 'Default') : ''}
                                                </div>
                                            </div>
                                            {!isReadOnly && (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveDashboardId(d.id)}
                                                        className={`h-7 w-7 inline-flex items-center justify-center rounded border ${activeDashboardId === d.id
                                                            ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                                                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                                                            }`}
                                                        title={t('dashboard.tools_switch_dashboard', 'Switch dashboard')}
                                                    >
                                                        <FolderOpen className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => moveDashboardOrder(d.id, -1)}
                                                        disabled={index === 0}
                                                        className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40"
                                                        title={t('dashboard.tools_move_up', 'Move up')}
                                                    >
                                                        <ArrowUp className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => moveDashboardOrder(d.id, 1)}
                                                        disabled={index === orderedDashboards.length - 1}
                                                        className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40"
                                                        title={t('dashboard.tools_move_down', 'Move down')}
                                                    >
                                                        <ArrowDown className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => { void renameDashboard(d); }}
                                                        className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                                                        title={t('common.rename', 'Rename')}
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => { void removeDashboard(d.id); }}
                                                        disabled={orderedDashboards.length <= 1 || Boolean(d.is_default)}
                                                        className="h-7 w-7 inline-flex items-center justify-center rounded border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-700 dark:text-rose-300 disabled:opacity-30"
                                                        title={d.is_default ? t('dashboard.default_not_deletable', 'Default dashboard cannot be deleted') : t('common.remove')}
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )
            }}
        >
            <datalist id="suggested-columns">
                {suggestedColumns.map(col => <option key={col} value={col} />)}
            </datalist>
            {/* Dashboard Tabs */}
            <div className="mb-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-px">
                    {orderedDashboards.map(d => (
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
                            onClick={() => { void createDashboard(); }}
                            className="px-4 py-2.5 text-slate-400 hover:text-blue-600 transition-all border-b-2 border-transparent"
                            title={t('dashboard.new_dashboard_title')}
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {!isReadOnly && (
                    <button
                        onClick={() => {
                            setDashboardToolsTab('dashboards');
                            setShowDashboardTools(true);
                        }}
                        className="p-2 text-slate-400 hover:text-slate-600"
                        title={t('dashboard.manage_title')}
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                )}
            </div>

            {
                activeDashboard && activeDashboard.layout.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500">
                        <Layout className="w-12 h-12 mb-4 opacity-50" />
                        <h3 className="font-bold text-lg text-slate-600 dark:text-slate-200">{t('dashboard.empty_msg', { name: activeDashboard.name })}</h3>
                        <p className="mb-4 text-sm text-center text-slate-500 dark:text-slate-400">{t('dashboard.empty_hint')}</p>
                        {!isReadOnly && (
                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                className="px-6 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-blue-600 dark:text-blue-300 font-bold hover:shadow-sm transition-all text-sm"
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
                                const widgetClassName = getWidgetSizeClassName(getWidgetSize(widgetRef));
                                const widgetKey = getWidgetRefKey(widgetRef);

                                return (
                                    <DashboardSortableItem key={widgetRef.id} id={widgetRef.id} className={`relative group h-full ${widgetClassName}`}>
                                        <div className="absolute top-2 right-2 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setZoomedWidgetKey(widgetKey); }}
                                                className="p-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-full text-slate-500 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-300 shadow-sm"
                                                title={t('dashboard.widget_zoom', 'Zoom')}
                                            >
                                                <Maximize2 className="w-3 h-3" />
                                            </button>
                                            {!isReadOnly && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeFromDashboard(widgetRef.id); }}
                                                    className="p-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-full text-slate-400 dark:text-slate-300 hover:text-red-500 shadow-sm"
                                                    title={t('common.remove')}
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
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
                            const widgetClassName = getWidgetSizeClassName(getWidgetSize(widgetRef));
                            const widgetKey = getWidgetRefKey(widgetRef);

                            return (
                                <DashboardSortableItem key={widgetRef.id} id={widgetRef.id} className={`relative group h-full ${widgetClassName}`}>
                                    <WidgetRenderer
                                        title={dbWidget.name}
                                        sql={dbWidget.sql_query}
                                        config={config}
                                        description={dbWidget.description || ''}
                                        headerActions={(
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); setZoomedWidgetKey(widgetKey); }}
                                                    className="h-7 w-7 inline-flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 text-slate-500 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-300 hover:border-blue-300 dark:hover:border-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title={t('dashboard.widget_zoom', 'Zoom')}
                                                >
                                                    <Maximize2 className="w-3 h-3" />
                                                </button>
                                                {!isReadOnly && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); removeFromDashboard(widgetRef.id); }}
                                                        className="h-7 w-7 inline-flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 text-slate-400 dark:text-slate-300 hover:text-red-500 hover:border-rose-300 dark:hover:border-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title={t('common.remove')}
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </>
                                        )}
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

            {zoomedWidgetRef && (
                <div
                    className="fixed inset-0 z-[130] bg-slate-950/55 backdrop-blur-sm p-3 md:p-6"
                    onClick={() => setZoomedWidgetKey(null)}
                >
                    <div
                        className="relative w-full h-full rounded-2xl border border-slate-300/30 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="h-12 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                                {getWidgetLabel(zoomedWidgetRef)} ({getWidgetSize(zoomedWidgetRef)})
                            </div>
                            <button
                                type="button"
                                onClick={() => setZoomedWidgetKey(null)}
                                className="h-8 w-8 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                                title={t('common.close', 'Close')}
                            >
                                <Minimize2 className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="h-[calc(100%-3rem)] p-3 md:p-4">
                            {zoomedWidgetRef.type === 'system' ? (
                                (() => {
                                    const meta = SYSTEM_WIDGETS.find(w => w.id === zoomedWidgetRef.id);
                                    const Component = meta ? getComponent(meta.id) : null;
                                    if (!Component) return null;
                                    return (
                                        <div className="h-full">
                                            <Component
                                                onRemove={undefined}
                                                targetView={COMPONENTS.find(c => c.component === meta.id)?.targetView}
                                            />
                                        </div>
                                    );
                                })()
                            ) : (
                                (() => {
                                    const dbWidget = customWidgets?.find(w => w.id === zoomedWidgetRef.id);
                                    if (!dbWidget) return null;
                                    let config: WidgetConfig;
                                    try {
                                        config = JSON.parse(dbWidget.visualization_config) as WidgetConfig;
                                    } catch {
                                        config = { type: 'table' };
                                    }
                                    return (
                                        <div className="h-full">
                                            <WidgetRenderer
                                                title={dbWidget.name}
                                                sql={dbWidget.sql_query}
                                                config={config}
                                                description={dbWidget.description || ''}
                                                globalFilters={activeDashboard?.filters}
                                                showInspectorJump
                                                inspectorReturnHash={activeDashboard?.id ? `#/?dashboard=${encodeURIComponent(activeDashboard.id)}` : '#/'}
                                            />
                                        </div>
                                    );
                                })()
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add Widget Modal (Customized for active dashboard) */}
            <Modal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                title={t('dashboard.add_title')}
            >
                <div className="flex gap-4 mb-4 border-b border-slate-200 dark:border-slate-700">
                    <button
                        onClick={() => setActiveTab('system')}
                        className={`pb-2 text-sm font-bold ${activeTab === 'system' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                    >
                        {t('dashboard.system_widgets')}
                    </button>
                    <button
                        onClick={() => setActiveTab('custom')}
                        className={`pb-2 text-sm font-bold ${activeTab === 'custom' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
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
                                    <div key={w.id} className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-300">
                                                <w.icon className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-700 dark:text-slate-100">{t(w.titleKey)}</div>
                                                <div className="text-xs text-slate-400 dark:text-slate-500">{t(w.descriptionKey)}</div>
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
                                                    className={`p-1.5 rounded-md border transition-all ${isPinned ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700 text-amber-500 dark:text-amber-300' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-500 hover:text-amber-400 dark:hover:text-amber-300'}`}
                                                >
                                                    <Star className={`w-4 h-4 ${isPinned ? 'fill-current' : ''}`} />
                                                </button>
                                            )}

                                            <button
                                                onClick={() => addToDashboard(w.id, 'system')}
                                                disabled={isAdded}
                                                className={`px-3 py-1.5 text-xs font-bold rounded ${isAdded ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50'}`}
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
                                const widgetDescription = (() => {
                                    const direct = (typeof w.description === 'string' ? w.description : '').trim();
                                    if (direct) return direct;
                                    if (typeof w.visualization_config !== 'string') return '';
                                    try {
                                        const parsed = JSON.parse(w.visualization_config) as { widgetDescription?: string };
                                        return (parsed.widgetDescription || '').trim();
                                    } catch {
                                        return '';
                                    }
                                })();
                                return (
                                    <div key={w.id} className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-500 dark:text-blue-300">
                                                <Database className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-700 dark:text-slate-100">{w.name}</div>
                                                <div
                                                    className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[260px]"
                                                    title={widgetDescription || w.sql_query}
                                                >
                                                    {widgetDescription || w.sql_query}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => { void renameCustomWidget(w); }}
                                                className="p-2 text-slate-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-300"
                                                title={t('common.rename')}
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => deleteCustomWidget(w.id)}
                                                className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-300"
                                                title={t('common.delete')}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => addToDashboard(w.id, 'custom')}
                                                disabled={isAdded}
                                                className={`px-3 py-1.5 text-xs font-bold rounded ${isAdded ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50'}`}
                                            >
                                                {isAdded ? t('dashboard.active') : t('common.add')}
                                            </button>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <p className="text-center text-slate-400 dark:text-slate-500 py-4">{t('dashboard.no_reports')}</p>
                            )}
                        </div>
                    )}
                </div>
            </Modal>
        </PageLayout >
    );
};

