import React, { useState } from 'react';
import { useQuery } from '../../hooks/useQuery';
import { ArrowLeft, Search, Download, Receipt, Calendar } from 'lucide-react';
import { DataTable, type Column } from '../../components/ui/DataTable';

interface ItCostsMonthViewProps {
    period: string;
    onBack: () => void;
    onDrillDown?: (invoiceId: string) => void;
}

export const ItCostsMonthView: React.FC<ItCostsMonthViewProps> = ({ period, onBack, onDrillDown }) => {
    const [searchTerm, setSearchTerm] = useState('');

    // Fetch all unique invoices for this period
    const { data, loading, error } = useQuery(`
        SELECT 
            DocumentId,
            MAX(PostingDate) as PostingDate,
            MAX(VendorName) as VendorName,
            MAX(VendorId) as VendorId,
            SUM(Amount) as total_amount,
            COUNT(*) as item_count,
            MAX(Description) as primary_description
        FROM invoice_items 
        WHERE Period = '${period}'
        GROUP BY DocumentId
        ORDER BY PostingDate DESC
    `);

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
    );

    if (error) return <div className="p-8 text-red-500">Error: {error.message}</div>;

    const items = data || [];
    const totalAmount = items.reduce((acc: number, item: any) => acc + item.total_amount, 0);
    const vendorCount = new Set(items.map((item: any) => item.VendorId)).size;

    const columns: Column<any>[] = [
        {
            header: 'Date / Invoice',
            accessor: 'DocumentId',
            render: (item: any) => (
                <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {item.PostingDate}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5">
                        <Receipt className="w-3 h-3 text-slate-300" />
                        {item.DocumentId}
                    </span>
                </div>
            )
        },
        {
            header: 'Vendor',
            accessor: 'VendorName',
            render: (item: any) => (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-xs">
                        {item.VendorName?.charAt(0) ?? '?'}
                    </div>
                    <span className="font-medium text-slate-700 dark:text-slate-200">{item.VendorName}</span>
                </div>
            )
        },
        {
            header: 'Items',
            accessor: 'item_count',
            align: 'center',
            render: (item: any) => (
                <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-md text-[10px] font-bold">
                    {item.item_count} Pos.
                </span>
            )
        },
        {
            header: 'Total Amount',
            accessor: 'total_amount',
            align: 'right',
            render: (item: any) => {
                const isCredit = item.total_amount < 0;
                return (
                    <span className={`font-bold ${isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                        {isCredit ? '-' : ''}€{Math.abs(item.total_amount).toLocaleString()}
                    </span>
                );
            }
        },
        {
            header: 'Action',
            accessor: 'DocumentId',
            align: 'right',
            render: (item: any) => (
                <button
                    onClick={() => onDrillDown?.(item.DocumentId)}
                    className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400 hover:underline px-3 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-md transition-colors"
                >
                    View Items
                </button>
            )
        }
    ];

    return (
        <div className="p-6 md:p-8 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Monthly Invoices: {period}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Overview of all individual invoices for this period</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
                        <Download className="w-4 h-4" />
                        Export Period
                    </button>
                </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-blue-600 p-4 rounded-2xl text-white shadow-lg shadow-blue-200 dark:shadow-none">
                    <div className="text-blue-100 text-[10px] uppercase font-bold tracking-wider mb-1">Period Total</div>
                    <div className="text-2xl font-black text-right">€{totalAmount.toLocaleString()}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-1">Active Vendors</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white text-right">{vendorCount}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-1">Invoice Count</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white text-right">{items.length}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-1">Avg. Invoice value</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white text-right">€{Math.round(totalAmount / (items.length || 1)).toLocaleString()}</div>
                </div>
            </div>

            {/* Search and Table */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col md:flex-row gap-4 justify-between">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by vendor, description, or invoice..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        />
                    </div>
                </div>

                <DataTable
                    data={items}
                    columns={columns}
                    searchTerm={searchTerm}
                    searchFields={['VendorName', 'DocumentId', 'primary_description']}
                    emptyMessage="No invoices found matching your search"
                />
            </div>
        </div>
    );
};
