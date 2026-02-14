import React, { useMemo } from 'react';
import { Search } from 'lucide-react';

export interface Column<T> {
    header: string;
    accessor: keyof T | ((item: T) => any);
    render?: (item: T) => React.ReactNode;
    align?: 'left' | 'center' | 'right';
    className?: string;
}

interface DataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    searchTerm?: string;
    searchFields?: (keyof T)[];
    emptyMessage?: string;
}

export function DataTable<T>({
    data,
    columns,
    searchTerm = '',
    searchFields = [],
    emptyMessage = 'No items found'
}: DataTableProps<T>) {

    const filteredData = useMemo(() => {
        if (!searchTerm) return data;
        const lowerSearch = searchTerm.toLowerCase();
        return data.filter(item =>
            searchFields.some(field => {
                const val = item[field];
                return (String(val ?? '').toLowerCase()).includes(lowerSearch);
            })
        );
    }, [data, searchTerm, searchFields]);

    return (
        <div className="flex-1 overflow-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-[10px] text-slate-400 uppercase font-bold bg-slate-50/30 dark:bg-slate-900/30 sticky top-0 z-10">
                    <tr>
                        {columns.map((col, i) => (
                            <th
                                key={i}
                                className={`px-6 py-4 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                            >
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredData.map((item, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group">
                            {columns.map((col, colIndex) => {
                                const value = typeof col.accessor === 'function'
                                    ? col.accessor(item)
                                    : (item as any)[col.accessor];

                                return (
                                    <td
                                        key={colIndex}
                                        className={`px-6 py-4 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.className || ''}`}
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
    );
}
