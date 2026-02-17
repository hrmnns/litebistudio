import React, { useState, useMemo } from 'react';
import { useQuery } from '../../hooks/useQuery';
import { Search, Filter, ArrowUpRight, PlusCircle, AlertTriangle, TrendingUp } from 'lucide-react';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { PageLayout } from '../components/ui/PageLayout';
import type { Anomaly } from '../../types';

interface AnomalyDetectionViewProps {
    onBack: () => void;
    onDrillDown?: (invoiceId: string, period: string) => void;
}

export const AnomalyDetectionView: React.FC<AnomalyDetectionViewProps> = ({ onBack, onDrillDown }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<string>('All');

    // Fetch all anomalies
    const { data: anomalies, loading } = useQuery<Anomaly>(`
        SELECT * FROM view_anomalies 
        ORDER BY RiskScore DESC, Period DESC
    `);

    const items = anomalies || [];

    const filteredItems = useMemo(() => {
        let result = items;
        if (filterType !== 'All') {
            result = result.filter((i: Anomaly) => i.AnomalyType === filterType);
        }
        return result;
    }, [items, filterType]);

    const stats = useMemo(() => ({
        total: items.length,
        critical: items.filter((i: Anomaly) => i.RiskScore >= 80).length,
        high: items.filter((i: Anomaly) => i.RiskScore >= 50 && i.RiskScore < 80).length,
        medium: items.filter((i: Anomaly) => i.RiskScore < 50).length
    }), [items]);

    const now = new Date();
    const footerText = `Letzte Aktualisierung: ${now.toLocaleDateString('de-DE')}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;

    const columns: Column<Anomaly>[] = [
        {
            header: 'Risiko',
            accessor: 'RiskScore',
            align: 'center',
            render: (item: Anomaly) => (
                <div className="flex justify-center">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border-2 shadow-sm ${item.RiskScore >= 80 ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:border-red-800' :
                        item.RiskScore >= 50 ? 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800' :
                            'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                        }`}>
                        {item.RiskScore}
                    </div>
                </div>
            )
        },
        {
            header: 'Anomalie-Typ',
            accessor: 'AnomalyType',
            render: (item: Anomaly) => (
                <div className="flex items-center gap-2">
                    {item.AnomalyType === 'Cost Drift' && <TrendingUp className="w-4 h-4 text-orange-500" />}
                    {item.AnomalyType === 'New Item' && <PlusCircle className="w-4 h-4 text-blue-500" />}
                    {item.AnomalyType === 'Data Quality' && <AlertTriangle className="w-4 h-4 text-red-500" />}
                    <span className="font-bold text-slate-700 dark:text-slate-200">{item.AnomalyType}</span>
                </div>
            )
        },
        {
            header: 'Beschreibung / Lieferant',
            accessor: 'Description',
            render: (item: Anomaly) => (
                <div className="flex flex-col max-w-md">
                    <span className="font-bold text-slate-900 dark:text-white truncate" title={item.Description ?? undefined}>
                        {item.Description}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold">{item.VendorName}</span>
                        <span>•</span>
                        <span>{item.Period}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5 font-mono">
                        <span title="Dokument-ID">DOC: {item.DocumentId}</span>
                        <span className="text-slate-300">|</span>
                        <span title="Zeile">LN: {item.LineId || '#'}</span>
                    </div>
                </div>
            )
        },
        {
            header: 'Auswirkung',
            accessor: 'Amount',
            align: 'right',
            render: (item: Anomaly) => (
                <div className="flex flex-col items-end gap-0.5">
                    <span className="font-black text-slate-900 dark:text-white">
                        €{item.Amount.toLocaleString()}
                    </span>
                    {item.PrevAmount && (
                        <div className="flex items-center gap-1 text-[10px] font-bold">
                            <span className="text-slate-400 decoration-slate-300 line-through">
                                €{item.PrevAmount.toLocaleString()}
                            </span>
                            <span className={item.Amount > item.PrevAmount ? 'text-red-500' : 'text-emerald-500'}>
                                ({item.Amount > item.PrevAmount ? '+' : ''}{Math.round(((item.Amount - item.PrevAmount) / item.PrevAmount) * 100)}%)
                            </span>
                        </div>
                    )}
                </div>
            )
        },
        {
            header: 'Aktion',
            accessor: 'DocumentId',
            align: 'right',
            render: (item: Anomaly) => (
                <button
                    onClick={() => onDrillDown?.(item.DocumentId, item.Period)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"
                >
                    <ArrowUpRight className="w-4 h-4" />
                </button>
            )
        }
    ];

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
    );

    return (
        <PageLayout
            header={{
                title: 'Anomalie Radar',
                subtitle: 'KI-gestützte Risikobewertung',
                onBack,
                actions: (
                    <div className="flex gap-2">
                        <span className="px-2.5 py-1 bg-red-100 text-red-700 text-[10px] font-bold uppercase rounded-full dark:bg-red-900/30 dark:text-red-400">
                            {stats.critical} Kritisch
                        </span>
                        <span className="px-2.5 py-1 bg-orange-100 text-orange-700 text-[10px] font-bold uppercase rounded-full dark:bg-orange-900/30 dark:text-orange-400">
                            {stats.high} Hoch
                        </span>
                    </div>
                ),
            }}
            footer={footerText}
            breadcrumbs={[
                { label: 'Anomalie Radar' }
            ]}
            fillHeight
        >
            {/* Filter Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-shrink-0">
                {[
                    { type: 'All', label: 'Gesamt erkannt' },
                    { type: 'Cost Drift', label: 'Cost Drift' },
                    { type: 'New Item', label: 'New Item' },
                    { type: 'Data Quality', label: 'Data Quality' },
                ].map(({ type, label }) => (
                    <button
                        key={type}
                        onClick={() => setFilterType(type)}
                        className={`p-4 rounded-xl border transition-all text-left group ${filterType === type
                            ? 'bg-blue-50 border-blue-200 shadow-blue-100 dark:bg-blue-900/20 dark:border-blue-800'
                            : 'bg-white border-slate-200 hover:border-blue-100 dark:bg-slate-800 dark:border-slate-700'
                            }`}
                    >
                        <span className={`text-[10px] font-black uppercase tracking-wider block mb-1 ${filterType === type ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 group-hover:text-blue-400'
                            }`}>
                            {label}
                        </span>
                        <span className={`text-2xl font-black ${filterType === type ? 'text-blue-700 dark:text-blue-300' : 'text-slate-900 dark:text-white'
                            }`}>
                            {type === 'All' ? stats.total : items.filter((i: Anomaly) => i.AnomalyType === type).length}
                        </span>
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 flex justify-between items-center flex-shrink-0">
                    <div className="relative max-w-md w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Anomalien suchen..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                        <Filter className="w-4 h-4" />
                        <span>Sortiert nach Risiko-Score</span>
                    </div>
                </div>
                <DataTable
                    data={filteredItems}
                    columns={columns}
                    searchTerm={searchTerm}
                    searchFields={['Description', 'VendorName', 'Period', 'DocumentId', 'LineId']}
                />
            </div>
        </PageLayout>
    );
};
