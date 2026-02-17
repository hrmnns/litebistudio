import React, { useState, useMemo } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { InvoiceRepository } from '../../lib/repositories/InvoiceRepository';
import { Search, Receipt, AlertTriangle, PlusCircle, Copy, Download, Wallet, Printer } from 'lucide-react';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { PageLayout } from '../components/ui/PageLayout';
import { SummaryCard } from '../components/ui/SummaryCard';
import { getPreviousPeriod } from '../../lib/utils/dateUtils';
import { exportToExcel } from '../../lib/utils/exportUtils';
import type { InvoiceItem } from '../../types';
import { getSmartKeyFields } from '../../lib/utils/invoiceUtils';

interface ItCostsInvoiceItemsViewProps {
    invoiceId: string;
    period: string;
    onBack: () => void;
    onViewHistory: (item: InvoiceItem) => void;
}

export const ItCostsInvoiceItemsView: React.FC<ItCostsInvoiceItemsViewProps> = ({ invoiceId, period, onBack, onViewHistory }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const previousPeriod = useMemo(() => getPreviousPeriod(period), [period]);

    // 1. Fetch current items FIRST
    const { data: items, loading: loadingCurrent, error: loadError } = useAsync<InvoiceItem[]>(
        () => InvoiceRepository.getItemsByInvoice(period, invoiceId),
        [period, invoiceId]
    );

    // ... imports

    // 3. Fetch previous month items strictly by Period (to find matches across different DocumentIds)
    const { data: previousItems, loading: loadingPrevious } = useAsync<InvoiceItem[]>(
        () => InvoiceRepository.getMonthlyOverview(previousPeriod),
        [previousPeriod]
    );

    const currentItems = items || [];
    const prevItems = previousItems || [];

    // 2. Retrieve keyFields using smart logic (based on first item)
    const keyFields = useMemo(() => {
        return getSmartKeyFields(currentItems[0]);
    }, [currentItems]);

    // Intra-month duplicate detection (ambiguity check)
    const keyFrequency = useMemo(() => {
        const freq: Record<string, number> = {};
        currentItems.forEach((item: InvoiceItem) => {
            const compositeKey = keyFields.map((f: string) => String(item[f] || '').trim()).join('|');
            freq[compositeKey] = (freq[compositeKey] || 0) + 1;
        });
        return freq;
    }, [currentItems, keyFields]);

    const enhancedItems = useMemo(() => {
        return currentItems.map((item: InvoiceItem) => {
            const compositeKey = keyFields.map((f: string) => String(item[f] || '').trim()).join('|');
            const isAmbiguous = keyFrequency[compositeKey] > 1;

            let status: 'normal' | 'new' | 'changed' | 'ambiguous' = 'normal';
            let previousAmount: number | null = null;

            if (isAmbiguous) {
                status = 'ambiguous';
            } else {
                let match = prevItems.find((p: InvoiceItem) => {
                    return keyFields.every((f: string) =>
                        String(p[f] || '').trim() === String(item[f] || '').trim()
                    );
                });

                if (match) {
                    // Ensure match.Amount is treated as a number
                    const matchedAmount = typeof match.Amount === 'number' ? match.Amount : 0;

                    if (Math.abs(item.Amount - matchedAmount) > 0.01) { // Check for significant difference
                        status = 'changed';
                        previousAmount = matchedAmount;
                    }
                } else {
                    status = 'new';
                }
            }

            return { ...item, status, previousAmount, compositeKey };
        });
    }, [currentItems, prevItems, keyFields, keyFrequency]);

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

    const totalAmount = currentItems.reduce((acc: number, item: InvoiceItem) => acc + item.Amount, 0);
    const vendorName = currentItems[0]?.VendorName || 'Unbekannter Lieferant';

    const now = new Date();
    const footerText = `Letzte Aktualisierung: ${now.toLocaleDateString('de-DE')}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;

    const handleExcelExport = () => {
        const exportData = currentItems.map(p => ({
            'Sac-Kto': p.ServiceAccount,
            'Beschreibung': p.Description,
            'KST': p.CostCenter,
            'Asset': p.AssetId,
            'Status': p.is_new ? 'Neu' : (p.amount_changed ? 'Geändert' : 'Stabil'),
            'Betrag': p.Amount
        }));

        exportToExcel(exportData, `Rechnung_${invoiceId}_${period}`, "Rechnungspositionen");
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
                            Konflikt
                        </span>
                    </div>
                );
                if (item.status === 'new') return (
                    <div className="flex items-center justify-center text-blue-500">
                        <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase rounded border border-blue-100 dark:border-blue-900/30 flex items-center gap-1">
                            <PlusCircle className="w-3 h-3" />
                            Neu
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
            header: 'Pos / Identität',
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
            header: 'Beschreibung & Kategorie',
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
            header: 'Kostenstelle / Sachkonto',
            accessor: 'CostCenter',
            render: (item: any) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">{item.CostCenter}</span>
                    <span className="text-[9px] font-mono text-slate-400">Konto: {item.GLAccount}</span>
                </div>
            )
        },
        {
            header: 'Betrag',
            accessor: 'Amount',
            align: 'right',
            render: (item: any) => {
                const isCredit = item.Amount < 0;
                return (
                    <div className="flex flex-col items-end">
                        <span className={`text-sm font-black ${isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                            {isCredit ? '-' : ''}€{Math.abs(item.Amount).toLocaleString('de-DE')}
                        </span>
                        {item.status === 'changed' && item.previousAmount != null && (
                            <span className={`text-[9px] font-bold flex items-center gap-0.5 ${(item.Amount - Number(item.previousAmount)) > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                {(item.Amount - Number(item.previousAmount)) > 0 ? '+' : ''}{(item.Amount - Number(item.previousAmount)).toLocaleString('de-DE')}€
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
                    title="Lifecycle Analyse"
                >
                    <Search className="w-3.5 h-3.5" />
                </button>
            )
        }
    ];

    return (
        <PageLayout
            header={{
                title: `Beleg ${invoiceId}`,
                subtitle: `${vendorName} · ${period}`,
                onBack,
                actions: (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => window.print()}
                            className="h-10 flex items-center gap-2 px-4 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
                            title="Als PDF exportieren"
                        >
                            <Printer className="w-4 h-4 text-slate-500" />
                            <span className="hidden lg:inline uppercase tracking-widest text-[10px] font-black">PDF Export</span>
                        </button>
                        <button
                            onClick={handleExcelExport}
                            className="h-10 flex items-center gap-2 px-4 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
                            title="Als Excel exportieren"
                        >
                            <Download className="w-4 h-4 text-emerald-500" />
                            <span className="hidden lg:inline uppercase tracking-widest text-[10px] font-black">Excel Export</span>
                        </button>
                    </div>
                ),
            }}
            alerts={loadError ? [{
                level: 'error',
                message: `Daten konnten nicht geladen werden: ${loadError.message}`,
                action: { label: 'Erneut versuchen', onClick: () => window.location.reload() }
            }] : undefined}
            footer={footerText}
            breadcrumbs={[
                { label: 'IT Kosten', href: '#/costs' },
                { label: 'Jahresanalyse', href: `#/costs` },
                { label: 'Monatsanalyse', href: `#/costs/${period}` },
                { label: 'Rechnungsdetails' }
            ]}
            fillHeight
        >
            {/* Print-Only Header (Professional Invoice Look) */}
            <div className="hidden print-only flex-col gap-8 mb-12 border-b-2 border-slate-900 pb-8">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-4xl font-black text-slate-900 tracking-tight">KOSTENAUFSTELLUNG</h1>
                        <p className="text-xl text-slate-500 mt-2 font-bold">Beleg-Nr: {invoiceId}</p>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-black text-blue-600">IT DASHBOARD</div>
                        <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-bold">Internal Financial Report</p>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-12 pt-4">
                    <div>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Lieferant</div>
                        <div className="text-sm font-bold text-slate-900">{vendorName}</div>
                    </div>
                    <div>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Abrechnungszeitraum</div>
                        <div className="text-sm font-bold text-slate-900">{period}</div>
                    </div>
                    <div>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Druckdatum</div>
                        <div className="text-sm font-bold text-slate-900">{now.toLocaleDateString('de-DE')}</div>
                    </div>
                </div>

                <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex justify-between items-center text-sm">
                        <span className="font-bold text-slate-600 uppercase tracking-wider text-[10px]">Netto-Gesamtsumme</span>
                        <span className="text-2xl font-black text-slate-900">€{totalAmount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                </div>
            </div>



            {/* Quality Summary Strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 no-print flex-shrink-0">
                <SummaryCard
                    title="Positionen gesamt"
                    value={currentItems.length}
                    icon={Receipt}
                    color="text-slate-500"
                />

                <SummaryCard
                    title="Neu entdeckt"
                    value={anomalySummary.new}
                    icon={PlusCircle}
                    color={anomalySummary.new > 0 ? 'text-blue-600' : 'text-slate-400'}
                    className={anomalySummary.new > 0 ? 'bg-blue-50/50 border-blue-100 dark:bg-blue-900/10' : 'opacity-60'}
                />

                <SummaryCard
                    title="Wert-Abweichung"
                    value={anomalySummary.changed}
                    icon={AlertTriangle}
                    color={anomalySummary.changed > 0 ? 'text-orange-600' : 'text-slate-400'}
                    className={anomalySummary.changed > 0 ? 'bg-orange-50/50 border-orange-100 dark:bg-orange-900/10' : 'opacity-60'}
                />

                <SummaryCard
                    title="Schlüssel-Konflikte"
                    value={anomalySummary.ambiguous}
                    icon={Copy}
                    color={anomalySummary.ambiguous > 0 ? 'text-red-600' : 'text-slate-400'}
                    className={anomalySummary.ambiguous > 0 ? 'bg-red-50/50 border-red-100 dark:bg-red-900/10 ring-1 ring-red-500/50' : 'opacity-60'}
                />
            </div>

            <div className="flex-1 min-h-0 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
                <div className="flex-none p-4 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-1 bg-slate-200 dark:bg-slate-700 rounded-lg">
                            <Receipt className="w-4 h-4 text-slate-500" />
                        </div>
                        <span className="font-bold text-slate-900 dark:text-white">Detaillierte Positionen</span>
                    </div>
                    <div className="relative max-w-md w-full no-print">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="search"
                            placeholder="Beschreibung, Kostenstelle, Sachkonto..."
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-4 py-1.5 text-xs w-full shadow-sm focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
                    <DataTable
                        data={enhancedItems}
                        columns={columns}
                        searchTerm={searchTerm}
                        searchFields={['Description', 'CostCenter', 'GLAccount', 'Category']}
                        emptyMessage="Keine passenden Positionen gefunden"
                    />
                </div>

                {/* Status Footer */}
                <div className="flex-none px-4 py-3 border-t border-slate-100 dark:border-slate-700 text-[10px] flex justify-between items-center text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 font-medium">
                            <span className="w-2 h-2 rounded-full bg-blue-500" />
                            {currentItems.length} Positionen gesamt
                        </div>
                        {anomalySummary.ambiguous > 0 && (
                            <div className="flex items-center gap-1.5 text-red-500 font-black">
                                <AlertTriangle className="w-3 h-3" />
                                {anomalySummary.ambiguous} Konflikte erkannt
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-6 font-bold uppercase tracking-widest">
                        <div className="flex items-center gap-1.5 hover:text-slate-600 transition-colors">
                            <Wallet className="w-3 h-3" />
                            Lieferant: {vendorName}
                        </div>
                        <div className="text-slate-600 dark:text-slate-300 bg-slate-200/50 dark:bg-slate-700/50 px-2 py-1 rounded">
                            Σ €{totalAmount.toLocaleString('de-DE')}
                        </div>
                    </div>
                </div>
            </div>
        </PageLayout>
    );
};
