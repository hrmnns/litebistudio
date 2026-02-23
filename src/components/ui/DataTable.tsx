import React, { useMemo, useCallback } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { useLocalStorage } from '../../hooks/useLocalStorage';

export interface Column<T> {
    header: string;
    accessor: keyof T | ((item: T) => unknown);
    render?: (item: T) => React.ReactNode;
    align?: 'left' | 'center' | 'right';
    className?: string;
    width?: string;
}

export interface DataTableSortConfig<T> {
    key: keyof T | string;
    direction: 'asc' | 'desc';
}

type ColumnWidthMap = Record<string, number>;

interface DataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    searchTerm?: string;
    searchFields?: (keyof T)[];
    emptyMessage?: string;
    onRowClick?: (item: T) => void;
    sortConfig?: DataTableSortConfig<T> | null;
    onSortConfigChange?: (config: DataTableSortConfig<T> | null) => void;
    filters?: Record<string, string>;
    onFiltersChange?: (filters: Record<string, string>) => void;
    showFilters?: boolean;
    onShowFiltersChange?: (visible: boolean) => void;
    columnWidths?: ColumnWidthMap;
    onColumnWidthsChange?: (widths: ColumnWidthMap) => void;
}

export function DataTable<T>({
    data,
    columns,
    searchTerm = '',
    searchFields = [],
    emptyMessage = 'No items found',
    onRowClick,
    sortConfig,
    onSortConfigChange,
    filters,
    onFiltersChange,
    showFilters,
    onShowFiltersChange,
    columnWidths,
    onColumnWidthsChange
}: DataTableProps<T>) {
    const headerRef = React.useRef<HTMLDivElement>(null);
    const bodyRef = React.useRef<HTMLDivElement>(null);
    const resizeStateRef = React.useRef<{ key: string; startX: number; startWidth: number } | null>(null);
    const [internalSortConfig, setInternalSortConfig] = React.useState<DataTableSortConfig<T> | null>(null);
    const [internalFilters, setInternalFilters] = React.useState<Record<string, string>>({});
    const [internalShowFilters, setInternalShowFilters] = React.useState(false);
    const [internalColumnWidths, setInternalColumnWidths] = React.useState<ColumnWidthMap>({});
    const [tableDensity] = useLocalStorage<'compact' | 'normal'>('ui_table_density', 'normal');
    const [wrapCells] = useLocalStorage<boolean>('ui_table_wrap_cells', false);

    const activeSortConfig = sortConfig !== undefined ? sortConfig : internalSortConfig;
    const activeFilters = filters !== undefined ? filters : internalFilters;
    const activeShowFilters = showFilters !== undefined ? showFilters : internalShowFilters;
    const activeColumnWidths = columnWidths !== undefined ? columnWidths : internalColumnWidths;

    const setSortConfig = (next: DataTableSortConfig<T> | null) => {
        if (sortConfig === undefined) setInternalSortConfig(next);
        onSortConfigChange?.(next);
    };

    const setFilters = (next: Record<string, string>) => {
        if (filters === undefined) setInternalFilters(next);
        onFiltersChange?.(next);
    };

    const setShowFilters = (next: boolean) => {
        if (showFilters === undefined) setInternalShowFilters(next);
        onShowFiltersChange?.(next);
    };

    const setColumnWidths = React.useCallback((next: ColumnWidthMap) => {
        if (columnWidths === undefined) setInternalColumnWidths(next);
        onColumnWidthsChange?.(next);
    }, [columnWidths, onColumnWidthsChange]);

    const getColumnKey = (col: Column<T>) => (typeof col.accessor === 'string' ? col.accessor : col.header);

    const parseWidth = (value?: string): number | null => {
        if (!value) return null;
        const match = /^(\d+)px$/i.exec(value.trim());
        return match ? Number(match[1]) : null;
    };

    const getWidthForColumn = (col: Column<T>): number => {
        const key = getColumnKey(col);
        if (activeColumnWidths[key]) return Math.max(90, activeColumnWidths[key]);
        const parsed = parseWidth(col.width);
        return parsed ? Math.max(90, parsed) : 150;
    };

    const getValueByAccessor = useCallback((item: T, accessor: keyof T | string): unknown => {
        return (item as Record<string, unknown>)[accessor as string];
    }, []);

    const filteredData = useMemo(() => {
        let processed = data;

        if (searchTerm) {
            const lowerSearch = searchTerm.toLowerCase();
            processed = processed.filter(item =>
                searchFields.some(field => {
                    const val = item[field];
                    return String(val ?? '').toLowerCase().includes(lowerSearch);
                })
            );
        }

        if (Object.keys(activeFilters).length > 0) {
            processed = processed.filter(item => {
                return Object.entries(activeFilters).every(([key, filterValue]) => {
                    if (!filterValue) return true;

                    const col = columns.find(c => (typeof c.accessor === 'string' ? c.accessor : c.header) === key);
                    if (!col) return true;

                    let itemValue: unknown;
                    if (typeof col.accessor === 'function') {
                        itemValue = col.accessor(item);
                    } else {
                        itemValue = getValueByAccessor(item, col.accessor);
                    }

                    return String(itemValue ?? '').toLowerCase().includes(filterValue.toLowerCase());
                });
            });
        }

        if (activeSortConfig) {
            processed = [...processed].sort((a, b) => {
                const col = columns.find(c => c.accessor === activeSortConfig.key || (typeof c.accessor === 'string' && c.accessor === activeSortConfig.key));

                let valA: unknown;
                let valB: unknown;

                if (col && typeof col.accessor === 'function') {
                    valA = col.accessor(a);
                    valB = col.accessor(b);
                } else {
                    valA = getValueByAccessor(a, activeSortConfig.key);
                    valB = getValueByAccessor(b, activeSortConfig.key);
                }

                if (valA === valB) return 0;
                if (valA === null || valA === undefined) return 1;
                if (valB === null || valB === undefined) return -1;

                const compareResult = valA < valB ? -1 : 1;
                return activeSortConfig.direction === 'asc' ? compareResult : -compareResult;
            });
        }

        return processed;
    }, [data, searchTerm, searchFields, activeSortConfig, columns, activeFilters, getValueByAccessor]);

    const handleScroll = () => {
        if (headerRef.current && bodyRef.current) {
            headerRef.current.scrollLeft = bodyRef.current.scrollLeft;
        }
    };

    const startColumnResize = (event: React.MouseEvent<HTMLDivElement>, col: Column<T>) => {
        event.preventDefault();
        event.stopPropagation();
        resizeStateRef.current = {
            key: getColumnKey(col),
            startX: event.clientX,
            startWidth: getWidthForColumn(col)
        };
    };

    React.useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            const state = resizeStateRef.current;
            if (!state) return;
            const nextWidth = Math.max(90, Math.min(900, state.startWidth + (event.clientX - state.startX)));
            if (activeColumnWidths[state.key] === nextWidth) return;
            setColumnWidths({
                ...activeColumnWidths,
                [state.key]: nextWidth
            });
        };

        const handleMouseUp = () => {
            resizeStateRef.current = null;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [activeColumnWidths, setColumnWidths]);

    const requestSort = (col: Column<T>) => {
        const key = getColumnKey(col);

        let direction: 'asc' | 'desc' = 'asc';
        if (activeSortConfig && activeSortConfig.key === key && activeSortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleFilterChange = (key: string, value: string) => {
        setFilters({
            ...activeFilters,
            [key]: value
        });
    };

    const renderColGroup = () => (
        <colgroup>
            {columns.map((col, i) => (
                <col key={i} style={{ width: `${getWidthForColumn(col)}px`, minWidth: `${getWidthForColumn(col)}px` }} />
            ))}
        </colgroup>
    );

    return (
        <div className="flex flex-col flex-1 overflow-hidden h-full relative border rounded-lg border-slate-300 dark:border-slate-700">
            <div
                ref={headerRef}
                className="overflow-hidden flex-none bg-slate-50 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-700"
            >
                <table className="w-full text-sm text-left table-fixed">
                    {renderColGroup()}
                    <thead className="text-[10px] text-slate-400 uppercase font-bold text-left">
                        <tr>
                            {columns.map((col, i) => {
                                const key = getColumnKey(col);
                                const isSorted = activeSortConfig?.key === key;

                                return (
                                    <th
                                        key={i}
                                        className={`relative px-4 ${tableDensity === 'compact' ? 'py-2' : 'py-3'} truncate cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.className || ''}`}
                                        title={col.header}
                                        onClick={() => requestSort(col)}
                                    >
                                        <div className={`flex items-center gap-1.5 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'}`}>
                                            {i === 0 && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowFilters(!activeShowFilters);
                                                    }}
                                                    className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors mr-2 ${activeShowFilters || Object.keys(activeFilters).length > 0 ? 'text-blue-600 bg-blue-100 dark:bg-blue-900/40' : 'text-slate-500 hover:text-slate-700'}`}
                                                    title="Toggle Column Filters"
                                                >
                                                    <Filter className="w-4 h-4" />
                                                </button>
                                            )}

                                            <span className="truncate">{col.header}</span>

                                            {isSorted && (
                                                <span className="text-blue-500 text-[9px]">
                                                    {activeSortConfig?.direction === 'asc' ? '▲' : '▼'}
                                                </span>
                                            )}
                                        </div>
                                        <div
                                            className="absolute top-0 right-0 h-full w-2 cursor-col-resize group"
                                            onMouseDown={(event) => startColumnResize(event, col)}
                                            role="separator"
                                            aria-orientation="vertical"
                                            aria-label={`Resize ${col.header}`}
                                        >
                                            <div className="mx-auto h-full w-px bg-slate-300 dark:bg-slate-700 opacity-0 group-hover:opacity-100" />
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                        {activeShowFilters && (
                            <tr className="bg-slate-100/50 dark:bg-slate-800/50">
                                {columns.map((col, i) => {
                                    const key = typeof col.accessor === 'string' ? col.accessor : col.header;
                                    return (
                                        <th key={i} className={`px-2 ${tableDensity === 'compact' ? 'py-0.5' : 'py-1'}`}>
                                            <div className="relative flex items-center">
                                                <input
                                                    type="text"
                                                    value={activeFilters[key as string] || ''}
                                                    onChange={(e) => handleFilterChange(key as string, e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    placeholder={`Filter ${col.header}...`}
                                                    className="w-full px-2 py-1 text-[10px] font-normal border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-300"
                                                />
                                                {activeFilters[key as string] && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleFilterChange(key as string, '');
                                                        }}
                                                        className="absolute right-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        )}
                    </thead>
                </table>
            </div>

            <div
                ref={bodyRef}
                onScroll={handleScroll}
                className="flex-1 overflow-auto bg-white dark:bg-slate-800"
            >
                <table className="w-full text-sm text-left table-fixed">
                    {renderColGroup()}
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {filteredData.map((item, rowIndex) => (
                            <tr
                                key={rowIndex}
                                onClick={() => onRowClick && onRowClick(item)}
                                className={`transition-colors group ${onRowClick ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}
                            >
                                {columns.map((col, colIndex) => {
                                    const value = typeof col.accessor === 'function'
                                        ? col.accessor(item)
                                        : getValueByAccessor(item, col.accessor);
                                    const displayValue = col.render
                                        ? col.render(item)
                                        : (typeof value === 'string' || typeof value === 'number'
                                            ? value
                                            : value === null || value === undefined
                                                ? ''
                                                : String(value));

                                    return (
                                        <td
                                            key={colIndex}
                                            className={`px-4 ${tableDensity === 'compact' ? 'py-2' : 'py-3'} ${wrapCells ? 'whitespace-normal break-words' : 'truncate'} ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.className || ''}`}
                                            title={typeof value === 'string' ? value : undefined}
                                        >
                                            {displayValue}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                        {filteredData.length === 0 && (
                            <tr>
                                <td colSpan={columns.length} className="px-6 py-20 text-center text-slate-400">
                                    <Search className="w-12 h-12 mx-auto mb-4 opacity-10" />
                                    <p className="text-lg">{emptyMessage}</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
