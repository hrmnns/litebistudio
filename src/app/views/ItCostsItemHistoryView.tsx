import React, { useMemo, useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { InvoiceRepository } from '../../lib/repositories/InvoiceRepository';
import { TrendingUp, AlertCircle, Info, Tag, Layers, Receipt, Layout, FileText, Activity } from 'lucide-react';
import { Modal } from '../components/Modal';
import { RecordDetailModal } from '../components/RecordDetailModal';
import { SummaryCard } from '../components/ui/SummaryCard';
import { RecordComparison } from '../components/ui/RecordComparison';
import { PageLayout } from '../components/ui/PageLayout';
import type { InvoiceItem } from '../../types';

interface ItCostsItemHistoryViewProps {
    item: InvoiceItem;
    onBack: () => void;
}

export const ItCostsItemHistoryView: React.FC<ItCostsItemHistoryViewProps> = ({ item: referenceItem, onBack }) => {
    const [selectedItem, setSelectedItem] = useState<InvoiceItem | null>(null);
    const [showRawDetails, setShowRawDetails] = useState(false);

    // Retrieve custom key fields
    const keyFields = useMemo(() => {
        try {
            const savedMappings = JSON.parse(localStorage.getItem('excel_mappings_v2') || '{}');
            const firstMappingWithKeys = Object.values(savedMappings as Record<string, Record<string, unknown>>).find(m => m.__keyFields);
            return (firstMappingWithKeys?.__keyFields as string[] | undefined) || ['DocumentId', 'LineId'];
        } catch (e) {
            return ['DocumentId', 'LineId'];
        }
    }, []);

    const { data: historyData, loading, error: loadError } = useAsync<InvoiceItem[]>(
        () => InvoiceRepository.getItemHistory(referenceItem, keyFields),
        [referenceItem, keyFields]
    );

    const history = historyData || [];

    // 1. Detect ambiguity (multiple records per period for the same primary key)
    const ambiguityMap = useMemo(() => {
        const counts: Record<string, number> = {};
        history.forEach((i: InvoiceItem) => counts[i.Period] = (counts[i.Period] || 0) + 1);
        return counts;
    }, [history]);

    const hasAmbiguity = Object.values(ambiguityMap).some(count => count > 1);

    // 2. Separate "Past", "Current", and "Future" records
    const referencePeriod = referenceItem.Period;
    const records = useMemo(() => {
        return history.map((i: InvoiceItem) => {
            const isMatch = i.id !== undefined && i.id !== null && i.id === referenceItem.id;

            return {
                ...i,
                isFuture: i.Period > referencePeriod,
                isCurrent: isMatch,
                isPast: i.Period < referencePeriod,
                isAmbiguousInPeriod: ambiguityMap[i.Period] > 1
            };
        });
    }, [history, referencePeriod, referenceItem.id, ambiguityMap]);

    // 2.5 Sorted records for navigation (Newest first)
    const sortedRecords = useMemo(() => {
        return [...records].sort((a, b) => b.Period.localeCompare(a.Period));
    }, [records]);

    const referenceIndex = useMemo(() => {
        return sortedRecords.findIndex((r: any) => r.id === referenceItem.id);
    }, [sortedRecords, referenceItem.id]);

    // 3. Advanced Metrics (Avg, Stability, Volatility)
    const metrics = useMemo(() => {
        if (history.length === 0) return null;
        const total = history.reduce((acc: number, i: InvoiceItem) => acc + i.Amount, 0);
        const avg = total / history.length;

        // Simple variance/stability score
        const sqDiffs = history.map((i: InvoiceItem) => Math.pow(i.Amount - avg, 2));
        const variance = sqDiffs.reduce((a, b) => a + b, 0) / history.length;
        const stdDev = Math.sqrt(variance);
        const volatility = avg > 0 ? (stdDev / avg) * 100 : 0; // Coefficient of variation

        return {
            total,
            avg,
            volatility,
            isStable: volatility < 10,
            isVolatile: volatility > 40
        };
    }, [history]);

    const now = new Date();
    const footerText = `Letzte Aktualisierung: ${now.toLocaleDateString('de-DE')}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
    );

    // Timeline Component
    const TimelineItem = ({ record }: { record: any }) => {
        const delta = record.Amount - referenceItem.Amount;
        const deltaPercent = referenceItem.Amount !== 0 ? (delta / Math.abs(referenceItem.Amount)) * 100 : 0;

        return (
            <div className="relative pb-[3px]">
                <div
                    onClick={record.isCurrent ? undefined : () => setSelectedItem(record)}
                    className={`flex flex-col md:flex-row md:items-center justify-between gap-4 group/item p-5 rounded-xl transition-all ${record.isCurrent
                        ? 'bg-slate-50 dark:bg-slate-800/40 border-2 border-slate-300 dark:border-slate-600 cursor-default opacity-85'
                        : 'bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-white dark:hover:bg-slate-800 cursor-pointer'
                        }`}
                >
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <span className={`text-xs font-black uppercase tracking-wider flex items-center gap-2 ${record.isCurrent ? 'text-slate-600 dark:text-slate-300' :
                                record.isFuture ? 'text-indigo-500' : 'text-slate-500'
                                }`}>
                                {record.Period}
                                {record.isCurrent && (
                                    <span className="px-1.5 py-0.5 bg-slate-500 dark:bg-slate-400 text-white text-[8px] font-black rounded-sm shadow-sm uppercase">Referenz</span>
                                )}
                                {record.isAmbiguousInPeriod && !record.isCurrent && (
                                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-black uppercase rounded-sm shadow-sm flex items-center gap-1 border border-amber-200">
                                        <AlertCircle className="w-2.5 h-2.5" />
                                        Dublette
                                    </span>
                                )}
                                {record.isFuture && " (Zukunfts-Prognose 🔮)"}
                            </span>
                        </div>

                        <div className="flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-slate-400" />
                                <span className={`text-[10px] uppercase tracking-tighter ${record.isCurrent ? 'font-black text-slate-700 dark:text-slate-200' : 'font-bold text-slate-500'}`}>
                                    Pos: #{record.LineId || 'k.A.'}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 opacity-60">
                                <Receipt className="w-3 h-3 text-slate-400" />
                                <span className="text-[9px] uppercase font-black text-slate-500">
                                    Beleg: <span className="font-mono">{record.DocumentId}</span>
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 opacity-40">
                                <span className="text-[9px] uppercase font-black px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300">
                                    ID: {record.id}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 mt-2 overflow-x-auto pb-1 no-scrollbar">
                            {record.Category && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <Tag className="w-3 h-3 text-slate-400" />
                                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">{record.Category}</span>
                                </div>
                            )}
                            {record.CostCenter && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <div className="w-1 h-1 rounded-full bg-slate-300" />
                                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">KST: {record.CostCenter}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-8 shrink-0">
                        {!record.isCurrent && (
                            <div className="flex flex-col items-end">
                                <div
                                    title={`Differenz zum Referenzmonat (${referenceItem.Period})`}
                                    className={`text-[11px] font-black flex items-center gap-1 ${delta > 0 ? 'text-red-500' : delta < 0 ? 'text-emerald-500' : 'text-slate-400'}`}
                                >
                                    {delta !== 0 ? (
                                        <>
                                            {delta > 0 ? '+' : ''}{delta.toLocaleString('de-DE')}€
                                            <span className="opacity-60 font-medium">({delta > 0 ? '+' : ''}{deltaPercent.toFixed(1)}%)</span>
                                        </>
                                    ) : (
                                        <span className="uppercase text-[9px] tracking-widest opacity-40 italic">Identisch</span>
                                    )}
                                </div>
                                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-tighter">vs. Referenz</span>
                            </div>
                        )}

                        <div className="flex flex-col items-end min-w-[100px]">
                            <div className={`text-xl font-black ${record.isCurrent ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>
                                €{record.Amount.toLocaleString('de-DE')}
                            </div>
                            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-tighter">Abrechnungsbetrag</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <PageLayout
            header={{
                title: referenceItem.Description || 'Datensatz',
                subtitle: `${referenceItem.VendorName || referenceItem.VendorId || 'Globaler Lieferant'}`,
                onBack,
                actions: (
                    <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold uppercase rounded-full dark:bg-blue-900/30 dark:text-blue-400">
                            Lebenszyklus-Analyse
                        </span>
                        <button
                            onClick={() => setShowRawDetails(true)}
                            className="h-10 flex items-center gap-2 px-4 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
                        >
                            <Layout className="w-4 h-4" />
                            <span className="hidden sm:inline">Datensatz-Details</span>
                        </button>
                    </div>
                )
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
                { label: 'Monatsanalyse', href: `#/costs/${referenceItem.Period}` },
                { label: 'Rechnungsdetails', onClick: onBack },
                { label: 'Lebenszyklus-Analyse' }
            ]}
        >
            {/* Hero Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-shrink-0">
                <SummaryCard
                    title="Lebenszyklus Gesamt"
                    value={`€${metrics?.total.toLocaleString('de-DE')}`}
                    icon={TrendingUp}
                    color="text-blue-500"
                    subtext="Summe aller erfassten Einträge"
                    className="overflow-hidden"
                />

                <SummaryCard
                    title="Monatlicher Durchschnitt"
                    value={`€${Math.round(metrics?.avg || 0).toLocaleString('de-DE')}`}
                    icon={FileText}
                    color="text-slate-900 dark:text-white"
                    trendValue={referenceItem.Amount > (metrics?.avg || 0) ? `+${Math.round(referenceItem.Amount - (metrics?.avg || 0))}€` : 'Unter Durchschnitt'}
                    trend={referenceItem.Amount > (metrics?.avg || 0) ? 'up' : 'down'}
                    trendLabel="vs Durchschnitt"
                />

                <SummaryCard
                    title="Stabilitätscheck"
                    value={metrics?.isStable ? 'Stabil' : metrics?.isVolatile ? 'Volatil' : 'Normal'}
                    icon={Activity}
                    color={metrics?.isStable ? 'text-emerald-500' : metrics?.isVolatile ? 'text-red-500' : 'text-amber-500'}
                    subtext={`Varianz: ${metrics?.volatility.toFixed(1)}%`}
                    trendLabel={metrics?.isVolatile ? 'Hohes Risiko' : ''}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                {/* Left Side: Timeline / Journal */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-black flex items-center gap-2">
                                <Layers className="w-5 h-5 text-blue-500" />
                                Wachstums-Timeline
                            </h3>
                        </div>

                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-2xl leading-relaxed">
                            Diese Timeline visualisiert die Kostenentwicklung dieses spezifischen Elements (identifiziert durch seinen Composite Key) über alle berichteten Perioden hinweg. Sie hilft dabei, Anomalien, Preissprünge oder Änderungen in der Kostenstellen-Zuordnung auf einen Blick zu erfassen.
                        </p>

                        <div className="space-y-[3px]">
                            {sortedRecords.map((rec, idx) => (
                                <TimelineItem
                                    key={`${rec.Period}-${rec.id}-${idx}`}
                                    record={rec}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Side: Properties Grid */}
                <div className="space-y-6">
                    <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-blue-400 mb-6 flex items-center gap-2">
                            <Info className="w-4 h-4" />
                            Technische Identität
                        </h3>

                        <div className="grid grid-cols-1 gap-5 relative z-10">
                            {[
                                { label: 'Interne DB ID', value: referenceItem?.id, icon: AlertCircle },
                                { label: 'Belegnummer', value: referenceItem?.DocumentId, icon: Receipt },
                                { label: 'Zeilennummer', value: referenceItem?.LineId, icon: Layers },
                                { label: 'Periode', value: referenceItem?.Period, icon: Info },
                                { label: 'Kostenstelle', value: referenceItem?.CostCenter, icon: Layers },
                                { label: 'Menge / Einheit', value: referenceItem?.Quantity !== undefined && referenceItem?.Quantity !== null ? `${referenceItem.Quantity} ${referenceItem.Unit || ''}` : null, icon: Info },
                                { label: 'Betrag / Währung', value: referenceItem?.Amount !== undefined && referenceItem?.Amount !== null ? `${referenceItem.Amount.toLocaleString('de-DE')} ${referenceItem.Currency || ''}` : null, icon: Receipt },
                            ].map((prop, i) => (
                                <div key={i} className="group">
                                    <div className="text-[9px] font-black uppercase text-slate-500 tracking-tighter mb-1">{prop.label}</div>
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 bg-slate-800 rounded-lg text-slate-400 group-hover:text-blue-400 transition-colors">
                                            <prop.icon className="w-3.5 h-3.5" />
                                        </div>
                                        <span className={`text-sm font-mono break-all ${!prop.value ? 'text-slate-600 italic' : 'text-slate-200'}`}>
                                            {prop.value || '<Nicht angegeben>'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {hasAmbiguity && (
                        <div className="bg-amber-50 dark:bg-amber-900/10 border-2 border-dashed border-amber-200 dark:border-amber-900/30 rounded-2xl p-6">
                            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-black text-xs uppercase mb-2">
                                <AlertCircle className="w-4 h-4" />
                                Identitäts-Konflikt
                            </div>
                            <p className="text-xs text-amber-800 dark:text-amber-200/70 leading-relaxed">
                                Für diesen Zeitraum existieren mehrere Datensätze mit dem gleichen Schlüssel. Dies deutet auf unzureichende Primärschlüssel-Definitionen beim Import hin.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Slide-over / Modal for details */}
            <Modal
                isOpen={!!selectedItem}
                onClose={() => setSelectedItem(null)}
                title="Datensatz-Vergleich"
            >
                {selectedItem ? (
                    <div className="space-y-6">
                        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
                            <span className="font-black uppercase mr-2">🔍 Analyse-Modus:</span>
                            Du vergleichst den aktuell ausgewählten Datensatz (Referenz) mit einem historischen Eintrag aus der Timeline.
                            Unterschiede in den Feldern sind farblich hervorgehoben.
                        </div>

                        <RecordComparison
                            leftItem={referenceItem}
                            rightItem={selectedItem}
                            leftLabel={`Referenz (${referenceItem.Period})`}
                            rightLabel={`Vergleich (${selectedItem.Period})`}
                        />
                    </div>
                ) : null}
            </Modal>

            {/* Raw Details Modal */}
            <RecordDetailModal
                isOpen={showRawDetails}
                onClose={() => setShowRawDetails(false)}
                items={sortedRecords}
                initialIndex={referenceIndex >= 0 ? referenceIndex : 0}
                title="Datensatz-Details"
                tableName="invoice_items"
            />
        </PageLayout>
    );
};
