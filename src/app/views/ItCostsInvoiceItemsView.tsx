import React, { useState, useMemo } from 'react';
import { useQuery } from '../../hooks/useQuery';
import { Search, Receipt, AlertTriangle, PlusCircle, Copy } from 'lucide-react';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { ExportFAB } from '../../components/ui/ExportFAB';
import { ViewHeader } from '../components/ui/ViewHeader';
import { SummaryCard } from '../components/ui/SummaryCard';
import * as XLSX from 'xlsx';

interface ItCostsInvoiceItemsViewProps {
    invoiceId: string;
    period: string;
    onBack: () => void;
    onViewHistory: (item: any) => void;
}

// Helper to get previous period (assuming YYYY-MM format)
const getPreviousPeriod = (currentPeriod: string) => {
    const [year, month] = currentPeriod.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    date.setMonth(date.getMonth() - 1);
    const prevYear = date.getFullYear();
    const prevMonth = String(date.getMonth() + 1).padStart(2, '0');
    return `${prevYear}-${prevMonth}`;
};

export const ItCostsInvoiceItemsView: React.FC<ItCostsInvoiceItemsViewProps> = ({ invoiceId, period, onBack, onViewHistory }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const previousPeriod = useMemo(() => getPreviousPeriod(period), [period]);

    // 1. Fetch current items FIRST
    const { data: currentItemsData, loading: loadingCurrent, error } = useQuery(
        `SELECT * FROM invoice_items WHERE DocumentId = ? AND Period = ? ORDER BY LineId ASC`,
        [invoiceId, period]
    );

    const items = currentItemsData || [];

    // 2. Retrieve keyFields (now items is safely defined)
    const keyFields = useMemo(() => {
        try {
            const savedMappings = JSON.parse(localStorage.getItem('excel_mappings_v2') || '{}');

            if (items.length > 0) {
                const currentFields = Object.keys(items[0]);
                let bestMapping = null;
                let maxOverlap = -1;

                for (const mapping of Object.values(savedMappings) as any[]) {
                    if (!mapping.__keyFields) continue;
                    const mappedFields = Object.keys(mapping);
                    const overlap = mappedFields.filter(f => currentFields.includes(f)).length;
                    if (overlap > maxOverlap) {
                        maxOverlap = overlap;
                        bestMapping = mapping;
                    }
                }
                if (bestMapping) return (bestMapping as any).__keyFields;
            }

            const firstMappingWithKeys = Object.values(savedMappings).find((m: any) => m.__keyFields);
            return (firstMappingWithKeys as any)?.__keyFields || ['DocumentId', 'LineId'];
        } catch (e) {
            return ['DocumentId', 'LineId'];
        }
    }, [items]);

    // 3. Fetch previous month items by DocumentId ONLY (Key-Centric)
    // We ignore VendorIds and fetch all items with the same DocumentId to find matches via keyFields.
    const prevQuery = `SELECT * FROM invoice_items WHERE Period = ? AND DocumentId = ?`;
    const prevParams = [previousPeriod, invoiceId];

    const { data: previousItemsData, loading: loadingPrevious } = useQuery(prevQuery, prevParams);

    const previousItems = previousItemsData || [];

    // Intra-month duplicate detection (ambiguity check)
    const keyFrequency = useMemo(() => {
        const freq: Record<string, number> = {};
        items.forEach((item: any) => {
            const compositeKey = keyFields.map((f: string) => String(item[f] || '').trim()).join('|');
            freq[compositeKey] = (freq[compositeKey] || 0) + 1;
        });
        return freq;
    }, [items, keyFields]);

    const enhancedItems = useMemo(() => {
        return items.map((item: any) => {
            const compositeKey = keyFields.map((f: string) => String(item[f] || '').trim()).join('|');
            const isAmbiguous = keyFrequency[compositeKey] > 1;

            let match = previousItems.find((p: any) => {
                return keyFields.every((f: string) =>
                    String(p[f] || '').trim() === String(item[f] || '').trim()
                );
            });

            let status: 'normal' | 'new' | 'changed' | 'ambiguous' = 'normal';
            let previousAmount = null;

            if (isAmbiguous) {
                status = 'ambiguous';
            } else if (!match) {
                status = 'new';
            } else {
                const diff = Math.abs(item.Amount - match.Amount);
                const percentDiff = diff / Math.abs(match.Amount || 1);
                if (diff > 10 && percentDiff > 0.1) {
                    status = 'changed';
                    previousAmount = match.Amount;
                }
            }

            return { ...item, status, previousAmount, compositeKey };
        });
    }, [items, previousItems, keyFields, keyFrequency]);

    const anomalySummary = useMemo(() => {
        return {
            new: enhancedItems.filter(i => i.status === 'new').length,
            changed: enhancedItems.filter(i => i.status === 'changed').length,
            ambiguous: enhancedItems.filter(i => i.status === 'ambiguous').length
        };
    }, [enhancedItems]);

    if (loadingCurrent || loadingPrevious) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
    );

    if (error) return <div className="p-8 text-red-500">Error: {error.message}</div>;

    const totalAmount = items.reduce((acc: number, item: any) => acc + item.Amount, 0);
    const vendorName = items[0]?.VendorName || 'Unknown Vendor';

    const handleExcelExport = () => {
        const exportData = items.map(p => ({
            'Sac-Kto': p.ServiceAccount,
            'Description': p.Description,
            'KST': p.CostCenter,
            'Asset': p.AssetId,
            'Status': p.is_new ? 'New' : (p.amount_changed ? 'Changed' : 'Stable'),
            'Amount': p.Amount
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Invoice Positions");
        XLSX.writeFile(wb, `Invoice_${invoiceId}_${period}.xlsx`);
    };

    const columns: Column<any>[] = [
        {
            header: 'Status',
            accessor: 'status',
            align: 'center',
            render: (item: any) => {
                if (item.status === 'ambiguous') return (
                    <div className="flex items-center justify-center">
                        <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-black uppercase rounded animate-pulse border border-red-200 dark:border-red-900/50 flex items-center gap-1">
                            <Copy className="w-3 h-3" />
                            Conflict
                        </span>
                    </div>
                );
                if (item.status === 'new') return (
                    <div className="flex items-center justify-center text-blue-500">
                        <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase rounded border border-blue-100 dark:border-blue-900/30 flex items-center gap-1">
                            <PlusCircle className="w-3 h-3" />
                            New
                        </span>
                    </div>
                );
                if (item.status === 'changed') return (
                    <div className="flex items-center justify-center text-orange-500">
                        <span className="px-2 py-1 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 text-[10px] font-black uppercase rounded border border-orange-100 dark:border-orange-900/30 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Diff
                        </span>
                    </div>
                );
                return (
                    <div className="flex items-center justify-center opacity-20">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    </div>
                );
            }
        },
        {
            header: 'Pos / Identity',
            accessor: 'LineId',
            render: (item: any) => (
                <div className="flex flex-col">
                    <span className="text-xs font-black text-slate-700 dark:text-slate-200">#{item.LineId}</span>
                    <span className="text-[9px] font-mono text-slate-400 uppercase tracking-tighter">
                        {keyFields.filter((f: string) => f !== 'DocumentId' && f !== 'LineId').map((f: string) => item[f]).join(' · ')}
                    </span>
                </div>
            )
        },
        {
            header: 'Description & Category',
            accessor: 'Description',
            render: (item: any) => (
                <div className="flex flex-col gap-0.5 max-w-md">
                    <span className="font-bold text-slate-900 dark:text-white truncate">{item.Description}</span>
                    <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[8px] font-black uppercase rounded tracking-wider">
                            {item.Category} {item.SubCategory ? ` › ${item.SubCategory}` : ''}
                        </span>
                    </div>
                </div>
            )
        },
        {
            header: 'Cost Center / G/L Account',
            accessor: 'CostCenter',
            render: (item: any) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">{item.CostCenter}</span>
                    <span className="text-[9px] font-mono text-slate-400">Account: {item.GLAccount}</span>
                </div>
            )
        },
        {
            header: 'Amount',
            accessor: 'Amount',
            align: 'right',
            render: (item: any) => {
                const isCredit = item.Amount < 0;
                return (
                    <div className="flex flex-col items-end">
                        <span className={`text-sm font-black ${isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                            {isCredit ? '-' : ''}€{Math.abs(item.Amount).toLocaleString()}
                        </span>
                        {item.status === 'changed' && (
                            <span className={`text-[9px] font-bold flex items-center gap-0.5 ${(item.Amount - item.previousAmount) > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                {(item.Amount - item.previousAmount) > 0 ? '+' : ''}{(item.Amount - item.previousAmount).toLocaleString()}€
                            </span>
                        )}
                    </div>
                );
            }
        },
        {
            header: '',
            accessor: 'actions',
            align: 'right',
            render: (item: any) => (
                <button
                    onClick={() => onViewHistory(item)}
                    className="p-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-600 dark:hover:bg-blue-600 rounded-xl text-blue-600 dark:text-blue-400 hover:text-white dark:hover:text-white transition-all shadow-sm border border-blue-100 dark:border-blue-900/30 group"
                    title="Lifecycle Analysis"
                >
                    <Search className="w-3.5 h-3.5" />
                </button>
            )
        }
    ];

    return (
        <div className="p-6 md:p-8 h-full flex flex-col space-y-6 print:space-y-4">
            <div className="flex-none space-y-6">
                <ViewHeader
                    title={vendorName}
                    subtitle={`${period}`}
                    onBack={onBack}
                    badges={
                        <>
                            <div className={`px-2 py-0.5 text-white text-[10px] font-black uppercase rounded flex items-center gap-1.5 shadow-sm ${invoiceId.startsWith('GEN-') ? 'bg-orange-600' : 'bg-slate-900'}`}>
                                <Receipt className="w-3 h-3" />
                                Invoice {invoiceId}
                            </div>
                            {invoiceId.startsWith('GEN-') && (
                                <div className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[9px] font-black uppercase rounded shadow-sm flex items-center gap-1">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    Auto-ID: Missing Data
                                </div>
                            )}
                        </>
                    }
                    actions={
                        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 px-5 shadow-sm flex flex-col min-w-[160px]">
                            <span className="text-[9px] font-black text-slate-400 uppercase text-left tracking-widest">Total Position Value</span>
                            <span className="text-2xl font-black text-blue-600 dark:text-blue-400 text-right mt-1">€{totalAmount.toLocaleString()}</span>
                        </div>
                    }
                />

                {/* Quality Summary Strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 no-print">
                    <SummaryCard
                        title="Total Items"
                        value={items.length}
                        icon={Receipt}
                        color="text-slate-500"
                    />

                    <SummaryCard
                        title="New Discoveries"
                        value={anomalySummary.new}
                        icon={PlusCircle}
                        color={anomalySummary.new > 0 ? 'text-blue-600' : 'text-slate-400'}
                        className={anomalySummary.new > 0 ? 'bg-blue-50/50 border-blue-100 dark:bg-blue-900/10' : 'opacity-60'}
                    />

                    <SummaryCard
                        title="Value Drift"
                        value={anomalySummary.changed}
                        icon={AlertTriangle}
                        color={anomalySummary.changed > 0 ? 'text-orange-600' : 'text-slate-400'}
                        className={anomalySummary.changed > 0 ? 'bg-orange-50/50 border-orange-100 dark:bg-orange-900/10' : 'opacity-60'}
                    />

                    <SummaryCard
                        title="Key Conflicts"
                        value={anomalySummary.ambiguous}
                        icon={Copy}
                        color={anomalySummary.ambiguous > 0 ? 'text-red-600' : 'text-slate-400'}
                        className={anomalySummary.ambiguous > 0 ? 'bg-red-50/50 border-red-100 dark:bg-red-900/10 ring-2 ring-red-500 animate-pulse' : 'opacity-60'}
                    />
                </div>
            </div>

            <div className="flex-1 min-h-0 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden print:border-0 print:shadow-none flex flex-col">
                <div className="flex-none p-4 px-6 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-1 bg-slate-200 dark:bg-slate-700 rounded-lg">
                            <Receipt className="w-4 h-4 text-slate-500" />
                        </div>
                        <span className="font-bold text-slate-900 dark:text-white">Detailed Positions</span>
                    </div>
                    <input
                        type="search"
                        placeholder="Filter by description, cost center, account..."
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-1.5 text-xs w-80 shadow-sm focus:ring-2 focus:ring-blue-500 transition-all outline-none no-print"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
                    <DataTable
                        data={enhancedItems}
                        columns={columns}
                        searchTerm={searchTerm}
                        searchFields={['Description', 'CostCenter', 'GLAccount', 'Category']}
                        emptyMessage="No positions found matching your search"
                    />
                </div>

                {/* Status Footer */}
                <div className="flex-none px-4 py-3 border-t border-slate-100 dark:border-slate-700 text-[10px] flex justify-between items-center text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 font-medium">
                            <span className="w-2 h-2 rounded-full bg-blue-500" />
                            {items.length} Positions Total
                        </div>
                        {anomalySummary.ambiguous > 0 && (
                            <div className="flex items-center gap-1.5 text-red-500 font-black">
                                <AlertTriangle className="w-3 h-3" />
                                {anomalySummary.ambiguous} Conflicts Detected
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-6 font-bold uppercase tracking-widest">
                        <div className="flex items-center gap-1.5 hover:text-slate-600 transition-colors">
                            <Receipt className="w-3 h-3" />
                            Inv: {invoiceId}
                        </div>
                        <div className="text-slate-600 dark:text-slate-300 bg-slate-200/50 dark:bg-slate-700/50 px-2 py-1 rounded">
                            Σ €{totalAmount.toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>


            <ExportFAB onExcelExport={handleExcelExport} />
        </div >
    );
};
