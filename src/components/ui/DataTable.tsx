import React, { useMemo, useCallback } from 'react';
import { Search, Filter, X } from 'lucide-react';

export interface Column<T> {
    header: string;
    accessor: keyof T | ((item: T) => unknown);
    render?: (item: T) => React.ReactNode;
    align?: 'left' | 'center' | 'right';
    className?: string;
    width?: string;
}

interface DataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    searchTerm?: string;
    searchFields?: (keyof T)[];
    emptyMessage?: string;
    onRowClick?: (item: T) => void;
}

export function DataTable<T>({
    data,
    columns,
    searchTerm = '',
    searchFields = [],
    emptyMessage = 'No items found',
    onRowClick
}: DataTableProps<T>) {

    const headerRef = React.useRef<HTMLDivElement>(null);
    const bodyRef = React.useRef<HTMLDivElement>(null);
    const [sortConfig, setSortConfig] = React.useState<{ key: keyof T | string; direction: 'asc' | 'desc' } | null>(null);
    const [filters, setFilters] = React.useState<Record<string, string>>({});
    const [showFilters, setShowFilters] = React.useState(false);

    const getValueByAccessor = useCallback((item: T, accessor: keyof T | string): unknown => {
        return (item as Record<string, unknown>)[accessor as string];
    }, []);

    const filteredData = useMemo(() => {
        let processed = data;

        // 1. Global Search
        if (searchTerm) {
            const lowerSearch = searchTerm.toLowerCase();
            processed = processed.filter(item =>
                searchFields.some(field => {
                    const val = item[field];
                    return (String(val ?? '').toLowerCase()).includes(lowerSearch);
                })
            );
        }

        // 2. Column Filters
        if (Object.keys(filters).length > 0) {
            processed = processed.filter(item => {
                return Object.entries(filters).every(([key, filterValue]) => {
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

        // 3. Sort
        if (sortConfig) {
            processed = [...processed].sort((a, b) => {
                const col = columns.find(c => c.accessor === sortConfig.key || (typeof c.accessor === 'string' && c.accessor === sortConfig.key));

                let valA: unknown;
                let valB: unknown;

                if (col && typeof col.accessor === 'function') {
                    valA = col.accessor(a);
                    valB = col.accessor(b);
                } else {
                    valA = getValueByAccessor(a, sortConfig.key);
                    valB = getValueByAccessor(b, sortConfig.key);
                }

                if (valA === valB) return 0;
                if (valA === null || valA === undefined) return 1;
                if (valB === null || valB === undefined) return -1;

                const compareResult = valA < valB ? -1 : 1;
                return sortConfig.direction === 'asc' ? compareResult : -compareResult;
            });
        }

        return processed;
    }, [data, searchTerm, searchFields, sortConfig, columns, filters, getValueByAccessor]);

    const handleScroll = () => {
        if (headerRef.current && bodyRef.current) {
            headerRef.current.scrollLeft = bodyRef.current.scrollLeft;
        }
    };

    const requestSort = (col: Column<T>) => {
        const key = typeof col.accessor === 'string' ? col.accessor : col.header;

        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const renderColGroup = () => (
        <colgroup>
            {columns.map((col, i) => (
                <col key={i} style={{ width: col.width || '150px', minWidth: col.width || '150px' }} />
            ))}
        </colgroup>
    );

    return (
        <div className="flex flex-col flex-1 overflow-hidden h-full relative border rounded-lg border-slate-300 dark:border-slate-700">
            {/* Header Table (Static Vertical, Scrolls Horizontal) */}
            <div
                ref={headerRef}
                className="overflow-hidden flex-none bg-slate-50 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-700"
            >
                <table className="w-full text-sm text-left table-fixed">
                    {renderColGroup()}
                    <thead className="text-[10px] text-slate-400 uppercase font-bold text-left">
                        <tr>
                            {columns.map((col, i) => {
                                const key = typeof col.accessor === 'string' ? col.accessor : col.header;
                                const isSorted = sortConfig?.key === key;

                                return (
                                    <th
                                        key={i}
                                        className={`px-4 py-3 truncate cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.className || ''}`}
                                        title={col.header}
                                        onClick={() => requestSort(col)}
                                    >
                                        <div className={`flex items-center gap-1.5 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'}`}>
                                            {/* Filter Toggle in First Column */}
                                            {i === 0 && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowFilters(!showFilters);
                                                    }}
                                                    className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors mr-2 ${showFilters || Object.keys(filters).length > 0 ? 'text-blue-600 bg-blue-100 dark:bg-blue-900/40' : 'text-slate-500 hover:text-slate-700'}`}
                                                    title="Toggle Column Filters"
                                                >
                                                    <Filter className="w-4 h-4" />
                                                </button>
                                            )}

                                            <span className="truncate">{col.header}</span>

                                            {isSorted && (
                                                <span className="text-blue-500 text-[9px]">
                                                    {sortConfig.direction === 'asc' ? '▲' : '▼'}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                )
                            })}
                        </tr>
                        {/* Filter Row */}
                        {showFilters && (
                            <tr className="bg-slate-100/50 dark:bg-slate-800/50">
                                {columns.map((col, i) => {
                                    const key = typeof col.accessor === 'string' ? col.accessor : col.header;
                                    return (
                                        <th key={i} className="px-2 py-1">
                                            <div className="relative flex items-center">
                                                <input
                                                    type="text"
                                                    value={filters[key as string] || ''}
                                                    onChange={(e) => handleFilterChange(key as string, e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    placeholder={`Filter ${col.header}...`}
                                                    className="w-full px-2 py-1 text-[10px] font-normal border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-300"
                                                />
                                                {filters[key as string] && (
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

            {/* Body Table (Scrolls Vertical & Horizontal) */}
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

                                    return (
                                        <td
                                            key={colIndex}
                                            className={`px-4 py-3 truncate ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.className || ''}`}
                                            title={typeof value === 'string' ? value : undefined}
                                        >
                                            {col.render ? col.render(item) : value}
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
