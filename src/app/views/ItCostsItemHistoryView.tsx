import React, { useMemo, useState } from 'react';
import { useQuery } from '../../hooks/useQuery';
import { TrendingUp, AlertCircle, Info, Tag, Layers, Receipt } from 'lucide-react';
import { Modal } from '../components/Modal';
import { ViewHeader } from '../components/ui/ViewHeader';
import { SummaryCard } from '../components/ui/SummaryCard';
import { RecordComparison } from '../components/ui/RecordComparison';

interface ItCostsItemHistoryViewProps {
    item: any;
    onBack: () => void;
}

export const ItCostsItemHistoryView: React.FC<ItCostsItemHistoryViewProps> = ({ item: referenceItem, onBack }) => {
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [showRawDetails, setShowRawDetails] = useState(false);

    // Retrieve custom key fields
    const keyFields = useMemo(() => {
        try {
            const savedMappings = JSON.parse(localStorage.getItem('excel_mappings_v2') || '{}');
            const firstMappingWithKeys = Object.values(savedMappings).find((m: any) => m.__keyFields);
            return (firstMappingWithKeys as any)?.__keyFields || ['DocumentId', 'LineId'];
        } catch (e) {
            return ['DocumentId', 'LineId'];
        }
    }, []);

    // Build dynamic SQL with all key fields to track THIS specific item identity over time
    const sql = useMemo(() => {
        const conditions: string[] = [];
        const params: any[] = [];

        keyFields.forEach((field: string) => {
            if (referenceItem[field] !== undefined && referenceItem[field] !== null) {
                conditions.push(`${field} = ?`);
                params.push(referenceItem[field]);
            } else {
                conditions.push(`${field} IS NULL`);
            }
        });

        return {
            query: `SELECT * FROM invoice_items WHERE ${conditions.join(' AND ')} ORDER BY Period ASC, PostingDate ASC`,
            params
        };
    }, [referenceItem, keyFields]);

    const { data, loading, error } = useQuery(sql.query, sql.params);

    const history = data || [];

    // 1. Detect ambiguity (multiple records per period for the same primary key)
    const ambiguityMap = useMemo(() => {
        const counts: Record<string, number> = {};
        history.forEach((i: any) => counts[i.Period] = (counts[i.Period] || 0) + 1);
        return counts;
    }, [history]);

    const hasAmbiguity = Object.values(ambiguityMap).some(count => count > 1);

    // 2. Separate "Past", "Current", and "Future" records
    const referencePeriod = referenceItem.Period;
    const records = useMemo(() => {
        return history.map((i: any) => {
            const currentId = i.id ?? i.ID;
            const referenceId = referenceItem.id ?? referenceItem.ID;
            const isMatch = currentId !== undefined && currentId !== null && currentId === referenceId;

            return {
                ...i,
                isFuture: i.Period > referencePeriod,
                isCurrent: isMatch,
                isPast: i.Period < referencePeriod,
                isAmbiguousInPeriod: ambiguityMap[i.Period] > 1
            };
        });
    }, [history, referencePeriod, ambiguityMap]);



    // 3. Advanced Metrics (Avg, Stability, Volatility)
    const metrics = useMemo(() => {
        if (history.length === 0) return null;
        const total = history.reduce((acc: number, i: any) => acc + i.Amount, 0);
        const avg = total / history.length;

        // Simple variance/stability score
        const sqDiffs = history.map((i: any) => Math.pow(i.Amount - avg, 2));
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

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
    );

    if (error) return <div className="p-8 text-red-500">Error: {error.message}</div>;


    // Timeline Component
    const TimelineItem = ({ record }: { record: any, previousRecord?: any }) => {
        // Delta now relative to the REFERENCE item, not the previous month
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
                    <div>
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
                                {record.isFuture && " (Future Insight 🔮)"}
                            </span>
                        </div>

                        <div className="flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-1.5">
                                <Layers className={`w-3.5 h-3.5 ${record.isCurrent ? 'text-slate-400' : 'text-slate-400'}`} />
                                <span className={`text-[10px] uppercase tracking-tighter ${record.isCurrent ? 'font-black text-slate-700 dark:text-slate-200' : 'font-bold text-slate-500'}`}>
                                    Pos: #{record.LineId || 'NoID'}
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
                                    ID: {record.id || record.ID}
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
                                <div className={`text-[11px] font-black flex items-center gap-1 ${delta > 0 ? 'text-red-500' : delta < 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                                    {delta !== 0 ? (
                                        <>
                                            {delta > 0 ? '+' : ''}{delta.toLocaleString()}€
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
                                €{record.Amount.toLocaleString()}
                            </div>
                            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-tighter">Abrechnungsbetrag</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
            {/* Header with Navigation */}
            <ViewHeader
                title={referenceItem.Description || 'Item Record'}
                subtitle={`${referenceItem.VendorName || referenceItem.VendorId || 'Global Vendor'}`}
                onBack={onBack}
                badges={
                    <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-black uppercase rounded shadow-sm">Lifetime Analysis</span>
                }
            />

            {/* Hero Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <SummaryCard
                    title="Lifetime Total"
                    value={`€${metrics?.total.toLocaleString()}`}
                    icon={TrendingUp}
                    color="text-blue-500"
                    subtext="Sum of all tracked entries"
                    className="overflow-hidden"
                />

                <SummaryCard
                    title="Monthly Average"
                    value={`€${Math.round(metrics?.avg || 0).toLocaleString()}`}
                    icon={TrendingUp} // Or create a new "Avg" icon
                    color="text-slate-900 dark:text-white"
                    trendValue={referenceItem.Amount > (metrics?.avg || 0) ? `+${Math.round(referenceItem.Amount - (metrics?.avg || 0))}€` : 'Below Avg'}
                    trend={referenceItem.Amount > (metrics?.avg || 0) ? 'up' : 'down'}
                    trendLabel="vs Average"
                />

                <SummaryCard
                    title="Stability Check"
                    value={metrics?.isStable ? 'Stable' : metrics?.isVolatile ? 'Volatile' : 'Normal'}
                    icon={metrics?.isVolatile ? AlertCircle : Info}
                    color={metrics?.isStable ? 'text-emerald-500' : metrics?.isVolatile ? 'text-red-500' : 'text-amber-500'}
                    subtext={`Variation: ${metrics?.volatility.toFixed(1)}%`}
                    trendLabel={metrics?.isVolatile ? 'High Risk' : ''}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

                {/* Left Side: Timeline / Journal */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-black flex items-center gap-2">
                                <Layers className="w-5 h-5 text-blue-500" />
                                Growth Timeline
                            </h3>
                            <button
                                onClick={() => setShowRawDetails(true)}
                                className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-700 transition-colors"
                            >
                                Item Details...
                            </button>
                        </div>

                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-2xl leading-relaxed">
                            Diese Timeline visualisiert die Kostenentwicklung dieses spezifischen Elements (identifiziert durch seinen Composite Key) über alle berichteten Perioden hinweg. Sie hilft dabei, Anomalien, Preissprünge oder Änderungen in der Kostenstellen-Zuordnung auf einen Blick zu erfassen.
                        </p>

                        <div className="space-y-[3px]">
                            {records.sort((a, b) => b.Period.localeCompare(a.Period)).map((rec, idx, arr) => (
                                <TimelineItem
                                    key={`${rec.Period}-${rec.id || rec.ID || idx}-${idx}`}
                                    record={rec}
                                    previousRecord={arr[idx + 1]}
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
                            Technical Identity
                        </h3>

                        <div className="grid grid-cols-1 gap-5 relative z-10">
                            {[
                                { label: 'Internal DB ID', value: referenceItem?.id || referenceItem?.ID, icon: AlertCircle },
                                { label: 'Dokument ID', value: referenceItem?.DocumentId, icon: Receipt },
                                { label: 'Line ID', value: referenceItem?.LineId, icon: Layers },
                                { label: 'Period', value: referenceItem?.Period, icon: Info },
                                { label: 'Cost Center', value: referenceItem?.CostCenter, icon: Layers },
                                { label: 'Quantity / Unit', value: referenceItem?.Quantity !== undefined && referenceItem?.Quantity !== null ? `${referenceItem.Quantity} ${referenceItem.Unit || ''}` : null, icon: Info },
                                { label: 'Amount / Currency', value: referenceItem?.Amount !== undefined && referenceItem?.Amount !== null ? `${referenceItem.Amount.toLocaleString()} ${referenceItem.Currency || ''}` : null, icon: Receipt },
                            ].map((prop, i) => (
                                <div key={i} className="group">
                                    <div className="text-[9px] font-black uppercase text-slate-500 tracking-tighter mb-1">{prop.label}</div>
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 bg-slate-800 rounded-lg text-slate-400 group-hover:text-blue-400 transition-colors">
                                            <prop.icon className="w-3.5 h-3.5" />
                                        </div>
                                        <span className={`text-sm font-mono break-all ${!prop.value ? 'text-slate-600 italic' : 'text-slate-200'}`}>
                                            {prop.value || '<Not Provided>'}
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
                                Identity Conflict
                            </div>
                            <p className="text-xs text-amber-800 dark:text-amber-200/70 leading-relaxed">
                                This item has multiple records in some periods. This usually happens when the "Primary Keys" are not set correctly during import.
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
            <Modal
                isOpen={showRawDetails}
                onClose={() => setShowRawDetails(false)}
                title="Datensatz-Details"
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    {Object.entries(referenceItem).map(([key, value]) => (
                        <div key={key} className="border-b border-slate-100 dark:border-slate-700 pb-2">
                            <dt className="text-[10px] font-bold uppercase text-slate-400 mb-1">{key}</dt>
                            <dd className="text-sm font-medium text-slate-900 dark:text-white break-all">
                                {value === null || value === undefined || value === '' ? (
                                    <span className="text-slate-300 italic">&lt;leer&gt;</span>
                                ) : (
                                    String(value)
                                )}
                            </dd>
                        </div>
                    ))}
                </div>
            </Modal>
        </div>
    );
};
