import React, { useState, useEffect } from 'react';
import { useQuery } from '../../hooks/useQuery';
import { DataTable } from '../../components/ui/DataTable';
import { RecordDetailModal } from '../components/RecordDetailModal';
import { Download, RefreshCw, AlertCircle, ArrowLeft, Search, Database, Table as TableIcon, Code, Play } from 'lucide-react';
import { runQuery } from '../../lib/db';
import * as XLSX from 'xlsx';

interface DataInspectorProps {
    onBack: () => void;
}

export const DataInspector: React.FC<DataInspectorProps> = ({ onBack }) => {
    const [mode, setMode] = useState<'table' | 'sql'>('table');
    const [inputSql, setInputSql] = useState(''); // Textarea content
    const [activeSql, setActiveSql] = useState(''); // Executed query

    // Table Mode State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTable, setSelectedTable] = useState('invoice_items');
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [tables, setTables] = useState<string[]>([]);
    const [tableSchema, setTableSchema] = useState<any[]>([]);
    const limit = 500;

    // 1. Fetch available tables
    useEffect(() => {
        const fetchTables = async () => {
            const result = await runQuery("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
            setTables(result.map(r => r.name));
        };
        fetchTables();
    }, []);

    // 2. Fetch schema for selected table (Only in Table Mode)
    useEffect(() => {
        const fetchSchema = async () => {
            if (mode === 'table' && selectedTable) {
                const result = await runQuery(`PRAGMA table_info(${selectedTable})`);
                setTableSchema(result);
                // Reset SQL when switching tables
                setInputSql(`SELECT * FROM ${selectedTable} LIMIT 100`);
            }
        };
        fetchSchema();
    }, [selectedTable, mode]);

    // 3. Build Query based on Mode
    let query = '';
    let queryParams: any[] = [];

    if (mode === 'table') {
        // Table Mode: Search across text columns
        const searchFilter = searchTerm ? tableSchema
            .filter(col => col.type.toUpperCase().includes('TEXT') || col.name.toLowerCase().includes('id') || col.name.toLowerCase().includes('name'))
            .map(col => `${col.name} LIKE '%' || ?1 || '%'`)
            .join(' OR ') : '';

        query = `
            SELECT *
            FROM ${selectedTable}
            ${searchFilter ? `WHERE ${searchFilter}` : ''}
            ORDER BY rowid DESC 
            LIMIT ?2
        `;
        queryParams = [searchTerm, limit];
    } else {
        // SQL Mode: Use the user's active SQL
        query = activeSql;
        queryParams = [];
    }

    const { data: items, loading, error, refresh } = useQuery(query, queryParams);

    // 4. Generate Columns dynamically
    const columns: any[] = React.useMemo(() => {
        if (!items || items.length === 0) return [];

        // In SQL mode, or dynamic table mode, derive cols from first item
        const keys = Object.keys(items[0]);
        return keys.map(key => {
            const isAmount = key.toLowerCase().includes('amount') || key.toLowerCase().includes('price');
            const isId = key.toLowerCase().includes('id');
            const sampleVal = items[0][key];
            const isNumeric = typeof sampleVal === 'number';

            return {
                header: key,
                accessor: key,
                align: isNumeric ? 'right' : 'left',
                className: isId ? 'font-mono text-[10px] text-slate-400' :
                    (key === 'Period' || key === 'PostingDate' ? 'font-mono' : ''),
                render: isAmount ? (item: any) => (
                    <span className={item[key] < 0 ? 'text-red-500' : 'text-slate-900 dark:text-slate-100'}>
                        {new Intl.NumberFormat('de-DE', {
                            style: 'currency',
                            currency: item.Currency || 'EUR'
                        }).format(item[key] || 0)}
                    </span>
                ) : undefined
            };
        });
    }, [items]);

    const handleRunSql = () => {
        setActiveSql(inputSql);
        refresh();
    };

    return (
        <div className="p-8 max-w-7xl mx-auto h-full flex flex-col animate-in slide-in-from-bottom-4 duration-500">
            {/* Loading Bar at Top */}
            <div className="fixed top-0 left-0 w-full h-[3px] bg-blue-100 dark:bg-blue-900/30 z-[100] overflow-hidden">
                {loading && (
                    <div className="h-full bg-blue-600 dark:bg-blue-400 animate-pulse" style={{ width: '40%' }} />
                )}
            </div>

            <div className="flex flex-col gap-4 mb-6">

                {/* Header Row: Title & Navigation */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="p-2 -ml-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                        >
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                Data Inspector
                            </h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                        <button
                            onClick={() => setMode('table')}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === 'table' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            <TableIcon className="w-4 h-4" />
                            Table
                        </button>
                        <button
                            onClick={() => {
                                setMode('sql');
                                if (!inputSql) setInputSql(`SELECT * FROM ${selectedTable} LIMIT 10`);
                            }}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === 'sql' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            <Code className="w-4 h-4" />
                            SQL
                        </button>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={refresh}
                            className={`p-2 rounded-lg transition-all ${loading ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/40' : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
                            title="Refresh Data"
                        >
                            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            onClick={() => {
                                if (!items || items.length === 0) return;
                                const ws = XLSX.utils.json_to_sheet(items);
                                const wb = XLSX.utils.book_new();
                                XLSX.utils.book_append_sheet(wb, ws, "Export");
                                const timestamp = new Date().toISOString().slice(0, 10);
                                XLSX.writeFile(wb, `export_${timestamp}.xlsx`);
                            }}
                            className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm"
                        >
                            <Download className="w-4 h-4" />
                            Export Excel
                        </button>
                    </div>
                </div>

                {/* Controls Row: Selection or SQL Editor */}
                {mode === 'table' ? (
                    <div className="flex bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 items-center justify-between shadow-sm">
                        <div className="flex items-center gap-4 flex-1">
                            <div className="relative">
                                <select
                                    value={selectedTable}
                                    onChange={(e) => {
                                        setSelectedTable(e.target.value);
                                        setSearchTerm('');
                                    }}
                                    className="appearance-none pl-10 pr-10 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer text-sm font-medium"
                                >
                                    {tables.map(t => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                                <Database className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                                <div className="absolute right-3 top-3.5 w-2 h-2 border-r-2 border-b-2 border-slate-400 rotate-45 pointer-events-none" />
                            </div>

                            <div className="relative max-w-md w-full ml-4">
                                <input
                                    type="text"
                                    placeholder="Search in visible columns..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            </div>
                        </div>
                        <div className="text-xs text-slate-400 font-medium">
                            Auto-Limit: {limit}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm ring-1 ring-slate-900/5">
                        <div className="relative">
                            <textarea
                                value={inputSql}
                                onChange={(e) => setInputSql(e.target.value)}
                                placeholder="SELECT * FROM ..."
                                className="w-full h-24 p-4 font-mono text-sm bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-slate-800 dark:text-slate-200"
                            />
                            <div className="absolute bottom-4 right-4 flex gap-2">
                                <button
                                    onClick={() => setInputSql('')}
                                    className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                >
                                    Clear
                                </button>
                                <button
                                    onClick={handleRunSql}
                                    className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium shadow-sm transition-colors"
                                >
                                    {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
                                    Run Query
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col min-h-0 relative">
                {/* Opaque loading overlay when refreshing results */}
                {loading && items && items.length > 0 && (
                    <div className="absolute inset-0 bg-white/40 dark:bg-slate-800/40 z-10 flex items-center justify-center backdrop-blur-[1px]">
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-full shadow-xl border border-slate-100 dark:border-slate-700">
                            <RefreshCw className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-hidden flex flex-col relative min-h-0">
                    {loading && !items ? (
                        <div className="flex-1 flex items-center justify-center p-12 text-center text-slate-400 animate-pulse">
                            <div className="flex flex-col items-center gap-4">
                                <Search className="w-12 h-12 opacity-20" />
                                <p className="text-lg">Fetching data...</p>
                            </div>
                        </div>
                    ) : (
                        <DataTable
                            data={items || []}
                            columns={columns}
                            searchTerm=""
                            emptyMessage={mode === 'sql' && !activeSql ? "Enter a SQL query and click Run." : "No results found."}
                            onRowClick={(item) => setSelectedItem(item)}
                        />
                    )}
                </div>
                <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700 text-[10px] flex justify-between items-center text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="font-medium">
                        {mode === 'table' ? `Auto-Limit: ${limit}` : 'Custom SQL Query'}
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1"><Database className="w-3 h-3" /> IT Dashboard DB</span>
                        <span className="font-medium">{items?.length || 0} results</span>
                    </div>
                </div>
            </div>

            {/* Universal Record Detail Modal - Standardized with List Navigation */}
            <RecordDetailModal
                isOpen={!!selectedItem}
                onClose={() => setSelectedItem(null)}
                items={items || []}
                initialIndex={items && selectedItem ? items.indexOf(selectedItem) : 0}
                title="Datensatz-Details"
                infoLabel="Inspector-Daten"
            />

            {/* Error Toast / Floating Alert */}
            {error && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-red-100 dark:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-2 fade-in">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <div className="flex flex-col">
                        <p className="text-sm font-bold">SQL Error</p>
                        <p className="text-xs opacity-90">{String(error)}</p>
                    </div>
                    <button onClick={refresh} className="ml-auto p-1.5 hover:bg-red-200 dark:hover:bg-red-800 rounded-md transition-colors">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
};
