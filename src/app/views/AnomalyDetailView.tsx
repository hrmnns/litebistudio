import React, { useMemo, useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { AnomalyRepository } from '../../lib/repositories/AnomalyRepository';
import { InvoiceRepository } from '../../lib/repositories/InvoiceRepository';
import { PageLayout } from '../components/ui/PageLayout';
import { RecordDetailModal } from '../components/RecordDetailModal';
import { ShieldAlert, TrendingUp, AlertTriangle, PlusCircle, FileText, Calendar, Receipt } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import type { InvoiceItem, Anomaly, InvoiceItemHistory } from '../../types';
import invoiceItemsSchema from '../../schemas/invoice-items-schema.json';

interface AnomalyDetailViewProps {
    anomalyId: string; // DocumentId
    period: string;
    onBack: () => void;
    onOpenInvoice: () => void;
}

export const AnomalyDetailView: React.FC<AnomalyDetailViewProps> = ({ anomalyId, period, onBack, onOpenInvoice }) => {
    const [selectedHistory, setSelectedHistory] = useState<{ items: InvoiceItem[], index: number } | null>(null);
    // 1. Fetch the specific anomaly details
    const { data: anomaly, loading } = useAsync<Anomaly | null>(
        () => AnomalyRepository.getAnomalyDetail(anomalyId, period),
        [anomalyId, period],
        { cacheKey: `anomaly-${anomalyId}-${period}` }
    );

    // 2. Fetch Report / History for this item (Context)
    // We match by VendorName and Description to find the same "Item" over time
    // 2. Fetch Report / History for this item (Context)
    const { data: historyData } = useAsync(
        async () => {
            if (!anomaly) return [];
            const result = await InvoiceRepository.getVendorItemHistory(
                anomaly.VendorName || '',
                anomaly.Description || ''
            );
            return result as unknown as InvoiceItemHistory[];
        },
        [anomaly],
        { cacheKey: `history-${anomalyId}` }
    );

    const history = useMemo(() => historyData || [], [historyData]);

    const handleSelectHistoryPoint = async (point: any) => {
        try {
            const results = await InvoiceRepository.getItemsByVendorAndDescription(
                anomaly?.VendorName || '',
                anomaly?.Description || '',
                point.Period
            );
            if (results && results.length > 0) {
                setSelectedHistory({ items: results, index: 0 });
            }
        } catch (err) {
            console.error("Failed to fetch drill-down records", err);
        }
    };

    // 3. Reasoning Engine
    const reasoning = useMemo(() => {
        if (!anomaly) return [];
        const reasons = [];

        if (anomaly.ScoreDrift > 0) {
            const diff = anomaly.Amount - (anomaly.PrevAmount || 0);
            const percent = anomaly.PrevAmount ? Math.round((diff / anomaly.PrevAmount) * 100) : 100;
            reasons.push({
                icon: TrendingUp,
                color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20',
                title: 'Massive Cost Drift',
                description: `Costs increased by ${percent}% (+€${diff.toLocaleString()}) compared to previous period.`,
                action: 'Check if this is a planned price increase or a billing error. Compare with contract terms.'
            });
        }

        if (anomaly.ScoreNew > 0) {
            reasons.push({
                icon: PlusCircle,
                color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20',
                title: 'New Position',
                description: 'This Item appeared for the first time. Verify contract coverage.',
                action: 'Confirm if this new service was authorized. Check for duplicate services under different names.'
            });
        }

        if (anomaly.ScoreQuality > 0) {
            reasons.push({
                icon: AlertTriangle,
                color: 'text-red-500 bg-red-50 dark:bg-red-900/20',
                title: 'Data Quality Issue',
                description: 'Synthetic Document ID detected. Source data might be incomplete or manually booked.',
                action: 'Trace back to the original invoice. Ensure the source system provides a valid Document ID.'
            });
        }

        if (reasons.length === 0) {
            reasons.push({
                icon: ShieldAlert,
                color: 'text-slate-500 bg-slate-50 dark:bg-slate-900/20',
                title: 'High Value Item',
                description: 'This item has a significant impact on the total budget.',
                action: 'Review for potential consolidation or savings.'
            });
        }

        return reasons;
    }, [anomaly]);

    const now = new Date();
    const footerText = `Letzte Aktualisierung: ${now.toLocaleDateString('de-DE')}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;

    if (loading && !anomaly) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
    );

    if (!anomaly) return (
        <div className="p-8 text-center">
            <h2 className="text-xl font-bold text-slate-700">Anomaly Not Found</h2>
            <button onClick={onBack} className="text-blue-500 hover:underline mt-4">Go Back</button>
        </div>
    );

    return (
        <PageLayout
            header={{
                title: `Anomalie #${anomaly.id}`,
                subtitle: `${anomaly.VendorName} · ${anomaly.Description}`,
                onBack,
                actions: (
                    <div className="flex items-center gap-2">
                        <span className={`px-4 py-1.5 rounded-lg text-white text-[10px] font-black uppercase tracking-widest shadow-lg ${anomaly.RiskScore >= 80 ? 'bg-red-600 shadow-red-200 dark:shadow-none' :
                            anomaly.RiskScore >= 50 ? 'bg-orange-600 shadow-orange-200 dark:shadow-none' :
                                'bg-blue-600 shadow-blue-200 dark:shadow-none'
                            }`}>
                            Risiko-Score: {anomaly.RiskScore}
                        </span>
                    </div>
                )
            }}
            footer={footerText}
            breadcrumbs={[
                { label: 'Anomalie Radar', href: '#/anomalies' },
                { label: 'Anomalie-Details' }
            ]}
            fillHeight
        >
            {/* Top Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-xl text-slate-500">
                                <Receipt className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Beleg-Referenz</div>
                                <div className="text-sm font-mono font-bold text-slate-900 dark:text-white">{anomaly.DocumentId}</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-xl text-slate-500">
                                <Calendar className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Abrechnungszeitraum</div>
                                <div className="text-sm font-bold text-slate-900 dark:text-white">{anomaly.Period}</div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-between items-end">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Betrag</div>
                        <div className="text-3xl font-black text-slate-900 dark:text-white">€{anomaly.Amount.toLocaleString('de-DE')}</div>
                    </div>
                </div>

                {/* Reasoning Section - Automated Insights */}
                <div className="md:col-span-2 bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-blue-500" />
                        KI-Analyse-Engine
                    </div>
                    <div className="space-y-3">
                        {reasoning.map((reason, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800">
                                <div className={`p-2 rounded-lg ${reason.color}`}>
                                    <reason.icon className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{reason.title}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1">
                                        {reason.description}
                                    </div>
                                    <div className="mt-2 text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded inline-block">
                                        Empfehlung: {reason.action}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Historical Context Chart */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm h-[500px] relative">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            Historischer Kontext
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Vergleiche die Kostenentwicklung dieser Position über die letzten 6 Monate.
                        </p>
                    </div>
                    <div className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">Letzte 6 Monate</div>
                </div>
                <div className="w-full h-full pb-8 cursor-pointer">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={history}
                            margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                            onClick={(data: any) => {
                                if (data && data.activePayload && data.activePayload.length) {
                                    handleSelectHistoryPoint(data.activePayload[0].payload);
                                }
                            }}
                        >
                            <defs>
                                <linearGradient id="colorAmountAnomaly" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                            <XAxis
                                dataKey="Period"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 10, fill: '#64748b' }}
                                dy={10}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 10, fill: '#64748b' }}
                                tickFormatter={(val: number) => `€${val}`}
                            />
                            <Tooltip
                                wrapperStyle={{ pointerEvents: 'none', outline: 'none' }}
                                content={({ active, payload }: any) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4 rounded-2xl shadow-xl space-y-3 min-w-[200px] pointer-events-none">
                                                <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-2">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">
                                                            {data.Period}
                                                        </span>
                                                        {data.RecordCount > 1 && (
                                                            <span className="text-[9px] font-bold text-orange-500 uppercase tracking-tight">
                                                                {data.RecordCount} Datensätze (Summiert)
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-sm font-black text-blue-600 dark:text-blue-400">
                                                        €{data.Amount.toLocaleString()}
                                                    </span>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between items-center gap-4">
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase">
                                                            {data.RecordCount > 1 ? 'Primary ID' : 'Internal ID'}
                                                        </span>
                                                        <span className="text-[9px] font-mono text-slate-600 dark:text-slate-300">#{data.id || data.ID}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center gap-4">
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase">Document ID</span>
                                                        <span className="text-[9px] font-mono text-slate-600 dark:text-slate-300">{data.DocumentId}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center gap-4">
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase">Line ID</span>
                                                        <span className="text-[9px] font-mono text-slate-600 dark:text-slate-300">{data.LineId}</span>
                                                    </div>
                                                </div>
                                                {data.RecordCount > 1 && (
                                                    <div className="pt-2 mt-1 border-t border-slate-50 dark:border-slate-800 text-[8px] text-slate-400 italic">
                                                        Klick zeigt den Hauptbeleg dieses Monats.
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="Amount"
                                stroke="#3b82f6"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorAmountAnomaly)"
                                dot={(props: any) => {
                                    const { cx, cy, payload } = props;
                                    return (
                                        <circle
                                            key={`dot-${cx}-${cy}`}
                                            cx={cx}
                                            cy={cy}
                                            r={4}
                                            fill="#3b82f6"
                                            stroke="#fff"
                                            strokeWidth={2}
                                            style={{ cursor: 'pointer' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleSelectHistoryPoint(payload);
                                            }}
                                        />
                                    );
                                }}
                                activeDot={(props: any) => {
                                    const { cx, cy, payload } = props;
                                    return (
                                        <g
                                            style={{ cursor: 'pointer' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleSelectHistoryPoint(payload);
                                            }}
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                handleSelectHistoryPoint(payload);
                                            }}
                                        >
                                            {/* Larger invisible hit area */}
                                            <circle cx={cx} cy={cy} r={12} fill="transparent" />
                                            {/* Visual dot */}
                                            <circle
                                                cx={cx}
                                                cy={cy}
                                                r={6}
                                                fill="#3b82f6"
                                                stroke="#fff"
                                                strokeWidth={2}
                                                className="filter drop-shadow-sm"
                                            />
                                        </g>
                                    );
                                }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="flex justify-end gap-3 no-print mt-auto pt-6">
                <button className="px-6 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    Als sicher markieren
                </button>
                <button
                    onClick={onOpenInvoice}
                    className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 dark:shadow-none flex items-center gap-2"
                >
                    <FileText className="w-4 h-4" />
                    Beleg öffnen
                </button>
            </div>

            {/* Universal Record Detail Modal */}
            <RecordDetailModal
                isOpen={!!selectedHistory}
                onClose={() => setSelectedHistory(null)}
                items={selectedHistory?.items || []}
                initialIndex={selectedHistory?.index || 0}
                title="Historischer Datensatz"
                tableName="invoice_items"
                schema={invoiceItemsSchema}
            />
        </PageLayout>
    );
};

