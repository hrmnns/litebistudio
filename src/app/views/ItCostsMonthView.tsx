import React, { useState, useMemo } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { InvoiceRepository } from '../../lib/repositories/InvoiceRepository';
import { Search, Receipt, Calendar, TrendingUp, PlusCircle, AlertTriangle, Copy, ShieldCheck, Box, FileText, Layers } from 'lucide-react';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { ExportFAB } from '../components/ui/ExportFAB';
import { ViewHeader } from '../components/ui/ViewHeader';
import { SummaryCard } from '../components/ui/SummaryCard';
import { getPreviousPeriod } from '../../lib/utils/dateUtils';
import { exportToExcel } from '../../lib/utils/exportUtils';
import type { InvoiceItem } from '../../types';

/** Grouped invoice structure for the month view */
interface InvoiceGroup {
    DocumentId: string;
    PostingDate: string;
    VendorName: string | null;
    VendorId: string | null;
    total_amount: number;
    items: InvoiceItem[];
    primary_description: string | null;
    newItemsCount: number;
    amountChangedCount: number;
    ambiguousCount: number;
}

interface ItCostsMonthViewProps {
    period: string;
    onBack: () => void;
    onDrillDown?: (invoiceId: string) => void;
}

export const ItCostsMonthView: React.FC<ItCostsMonthViewProps> = ({ period, onBack, onDrillDown }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const previousPeriod = useMemo(() => getPreviousPeriod(period), [period]);

    // Retrieve custom key fields from saved mappings
    const keyFields: string[] = useMemo(() => {
        try {
            const savedMappings: Record<string, Record<string, unknown>> = JSON.parse(localStorage.getItem('excel_mappings_v2') || '{}');
            const firstMappingWithKeys = Object.values(savedMappings).find(m => m.__keyFields);
            return (firstMappingWithKeys?.__keyFields as string[] | undefined) || ['DocumentId', 'LineId'];
        } catch (e) {
            return ['DocumentId', 'LineId'];
        }
    }, []);

    // Fetch current month invoices
    const { data: currentItems, loading: loadingCurrent } = useAsync<InvoiceItem[]>(
        () => InvoiceRepository.getMonthlyOverview(period),
        [period]
    );

    // Fetch previous period for comparison
    const { data: previousItems, loading: loadingPrevious } = useAsync<InvoiceItem[]>(
        () => InvoiceRepository.getMonthlyOverview(previousPeriod),
        [previousPeriod]
    );

    // Intra-month duplicate detection (ambiguity check)
    const keyFrequency = useMemo(() => {
        const freq: Record<string, number> = {};
        if (currentItems) {
            currentItems.forEach((item: InvoiceItem) => {
                const compositeKey = keyFields.map((f: string) => String(item[f] || '').trim()).join('|');
                freq[compositeKey] = (freq[compositeKey] || 0) + 1;
            });
        }
        return freq;
    }, [currentItems, keyFields]);

    // Fast lookup for previous month items
    const prevItemMap = useMemo(() => {
        const map = new Map<string, InvoiceItem>();
        if (previousItems) {
            previousItems.forEach((p: InvoiceItem) => {
                const key = keyFields.map((f: string) => String(p[f] || '').trim()).join('|');
                map.set(key, p);
            });
        }
        return map;
    }, [previousItems, keyFields]);

    if (loadingCurrent || loadingPrevious) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
    );

    // Group current items by Invoice (DocumentId)
    const invoices = (() => {
        const grouped = new Map<string, any>();

        if (currentItems) {
            currentItems.forEach((item: InvoiceItem) => {
                if (!grouped.has(item.DocumentId)) {
                    grouped.set(item.DocumentId, {
                        DocumentId: item.DocumentId,
                        PostingDate: item.PostingDate,
                        VendorName: item.VendorName,
                        VendorId: item.VendorId,
                        total_amount: 0,
                        items: [],
                        primary_description: item.Description
                    });
                }
                const invoice = grouped.get(item.DocumentId);
                invoice.total_amount += item.Amount;
                invoice.items.push(item);
            });
        }

        // Calculate Anomalies per Invoice
        return Array.from(grouped.values()).map(invoice => {
            let newItemsCount = 0;
            let amountChangedCount = 0;
            let ambiguousCount = 0;

            invoice.items.forEach((currentItem: InvoiceItem) => {
                const compositeKey = keyFields.map((f: string) => String(currentItem[f] || '').trim()).join('|');
                const isAmbiguous = keyFrequency[compositeKey] > 1;

                if (isAmbiguous) {
                    ambiguousCount++;
                    return; // Skip further comparison for ambiguous items
                }

                // STRICT MATCHING ONLY (Key-Centric)
                const match = prevItemMap.get(compositeKey);

                if (!match) {
                    newItemsCount++;
                } else {
                    // Check for significant price change (>10% AND absolute diff > 10€)
                    const diff = Math.abs(currentItem.Amount - match.Amount);
                    const percentDiff = diff / Math.abs(match.Amount || 1);
                    if (diff > 10 && percentDiff > 0.1) {
                        amountChangedCount++;
                    }
                }
            });

            return { ...invoice, newItemsCount, amountChangedCount, ambiguousCount };
        }).sort((a, b) => b.PostingDate.localeCompare(a.PostingDate));
    })();

    const totalAmount = invoices.reduce((acc, inv) => acc + inv.total_amount, 0);
    const totalAnomalies = invoices.reduce((acc, inv) => acc + inv.newItemsCount + inv.amountChangedCount + inv.ambiguousCount, 0);

    // Calculate Data Integrity Metrics
    const totalPositions = currentItems?.length || 0;
    const autoGenInvoicesCount = invoices.filter(inv => inv.DocumentId?.startsWith('GEN-')).length;
    const dataCoverage = invoices.length > 0
        ? Math.round(((invoices.length - autoGenInvoicesCount) / invoices.length) * 100)
        : 100;

    const handleExcelExport = () => {
        const exportData = invoices.map(inv => ({
            'Posting Date': inv.PostingDate,
            'Document ID': inv.DocumentId,
            'Vendor': inv.VendorName,
            'Vendor ID': inv.VendorId,
            'Description': inv.primary_description,
            'Total Amount': inv.total_amount,
            'New Items': inv.newItemsCount,
            'Price Changes': inv.amountChangedCount,
            'Ambiguities': inv.ambiguousCount,
            'Status': (inv.newItemsCount + inv.amountChangedCount + inv.ambiguousCount > 0) ? 'Anomalous' : 'Stable'
        }));

        exportToExcel(exportData, `IT_Costs_Analysis_${period}`, "Monthly Analysis");
    };

    const columns: Column<InvoiceGroup>[] = [
        {
            header: 'Date / Invoice',
            accessor: 'DocumentId',
            render: (item: InvoiceGroup) => {
                const isAutoGenerated = item.DocumentId?.startsWith('GEN-');
                return (
                    <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {item.PostingDate}
                        </span>
                        <span className={`text-[10px] font-medium flex items-center gap-1.5 ${isAutoGenerated ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400'}`}>
                            <Receipt className={`w-3 h-3 ${isAutoGenerated ? 'text-orange-500' : 'text-slate-300'}`} />
                            {item.DocumentId}
                            {isAutoGenerated && (
                                <AlertTriangle className="w-2.5 h-2.5 ml-0.5" />
                            )}
                        </span>
                    </div>
                );
            }
        },
        {
            header: 'Vendor',
            accessor: 'VendorName',
            className: 'w-[25%]',
            render: (item: InvoiceGroup) => (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-xs">
                        {item.VendorName?.charAt(0) ?? '?'}
                    </div>
                    <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{item.VendorName}</span>
                </div>
            )
        },
        {
            header: 'Positions',
            accessor: (item: InvoiceGroup) => item.items.length,
            align: 'center',
            render: (item: InvoiceGroup) => (
                <div className="flex flex-col items-center">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{item.items.length}</span>
                    <span className="text-[9px] uppercase font-black text-slate-400 tracking-tighter">Items</span>
                </div>
            )
        },
        {
            header: 'Source',
            accessor: 'DocumentId',
            render: (item: InvoiceGroup) => {
                const isAutoGenerated = item.DocumentId?.startsWith('GEN-');
                return (
                    <div className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider text-center border ${isAutoGenerated
                        ? 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-800/30'
                        : 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800/30'
                        }`}>
                        {isAutoGenerated ? 'Synthetic' : 'Standard'}
                    </div>
                );
            }
        },
        {
            header: 'Anomalies',
            accessor: 'newItemsCount',
            render: (item: InvoiceGroup) => (
                <div className="flex gap-2">
                    {item.newItemsCount > 0 && (
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md text-[10px] font-bold flex items-center gap-1" title={`${item.newItemsCount} new items`}>
                            <PlusCircle className="w-3 h-3" />
                            {item.newItemsCount}
                        </span>
                    )}
                    {item.amountChangedCount > 0 && (
                        <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-md text-[10px] font-bold flex items-center gap-1" title={`${item.amountChangedCount} price changes`}>
                            <AlertTriangle className="w-3 h-3" />
                            {item.amountChangedCount}
                        </span>
                    )}
                    {item.ambiguousCount > 0 && (
                        <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md text-[10px] font-bold flex items-center gap-1 animate-pulse" title={`${item.ambiguousCount} ambiguous keys`}>
                            <Copy className="w-3 h-3" />
                            {item.ambiguousCount}
                        </span>
                    )}
                    {item.newItemsCount === 0 && item.amountChangedCount === 0 && item.ambiguousCount === 0 && (
                        <span className="px-2 py-1 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-md text-[10px] font-medium flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            Stable
                        </span>
                    )}
                </div>
            )
        },
        {
            header: 'Total Amount',
            accessor: 'total_amount',
            align: 'right',
            render: (item: InvoiceGroup) => {
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
            className: 'w-[100px] text-right sticky right-0 z-10 bg-white dark:bg-slate-800 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.1)] dark:shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.5)]',
            render: (item: InvoiceGroup) => (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDrillDown?.(item.DocumentId);
                    }}
                    className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400 hover:underline px-3 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-md transition-colors whitespace-nowrap"
                >
                    Analyze
                </button>
            )
        }
    ];

    const avgInvoiceAmount = totalAmount / (invoices.length || 1);

    return (
        <div className="p-6 md:p-8 h-full flex flex-col space-y-6">
            <div className="flex-none space-y-6">
                <ViewHeader
                    title={`Monthly Analysis: ${period}`}
                    subtitle={`Comparing to ${previousPeriod}`}
                    onBack={onBack}
                    badges={totalAnomalies > 0 ? (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-bold uppercase rounded-full">
                            {totalAnomalies} Anomalies Detected
                        </span>
                    ) : null}
                />

                {/* Quick Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <SummaryCard
                        title="Period Total"
                        value={`€${totalAmount.toLocaleString()}`}
                        icon={TrendingUp}
                        color="text-blue-500"
                        className="bg-slate-900 text-white dark:bg-slate-900 border-slate-800"
                    />

                    <SummaryCard
                        title="Volume"
                        value={invoices.length}
                        icon={Box}
                        color="text-purple-500"
                        subtext={`(${totalPositions} Positions total)`}
                        trendLabel="Invoices"
                    />

                    <SummaryCard
                        title="Data Integrity"
                        value={`${dataCoverage}%`}
                        icon={ShieldCheck}
                        color={dataCoverage > 90 ? 'text-emerald-500' : 'text-orange-500'}
                        subtext={`${autoGenInvoicesCount} Synthetic IDs`}
                        trendLabel="Coverage"
                    />

                    <SummaryCard
                        title="Avg. Invoice"
                        value={`€${Math.round(avgInvoiceAmount).toLocaleString()}`}
                        icon={FileText}
                        color="text-blue-500"
                        trendLabel="per Document"
                    />
                </div>
            </div>

            {/* Search and Table */}
            <div className="flex-1 min-h-0 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
                <div className="flex-none p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col md:flex-row gap-4 justify-between">
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

                <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
                    <DataTable
                        data={invoices}
                        columns={columns}
                        searchTerm={searchTerm}
                        searchFields={['VendorName', 'DocumentId', 'primary_description']}
                        emptyMessage="No invoices found matching your search"
                        onRowClick={(item) => onDrillDown?.(item.DocumentId)}
                    />
                </div>

                {/* Status Footer */}
                <div className="flex-none px-4 py-3 border-t border-slate-100 dark:border-slate-700 text-[10px] flex justify-between items-center text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 font-medium">
                            <ShieldCheck className={`w-3 h-3 ${dataCoverage > 90 ? 'text-emerald-500' : 'text-orange-500'}`} />
                            {dataCoverage}% Integrity
                        </div>
                        <div className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3 h-3 text-orange-400" />
                            {autoGenInvoicesCount} Synthetic Header IDs
                        </div>
                    </div>
                    <div className="flex items-center gap-6 font-bold uppercase tracking-widest">
                        <div className="flex items-center gap-1.5 hover:text-slate-600 transition-colors">
                            <Box className="w-3 h-3" />
                            {invoices.length} Documents
                        </div>
                        <div className="flex items-center gap-1.5 hover:text-slate-600 transition-colors">
                            <Layers className="w-3 h-3" />
                            {totalPositions} Positions
                        </div>
                        <div className="text-slate-600 dark:text-slate-300 bg-slate-200/50 dark:bg-slate-700/50 px-2 py-1 rounded">
                            Σ €{totalAmount.toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>


            <ExportFAB onExcelExport={handleExcelExport} />
        </div>
    );
};
