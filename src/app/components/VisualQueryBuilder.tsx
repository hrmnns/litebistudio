import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Filter, Layers, Database, Hash, Type, Calendar, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { SystemRepository } from '../../lib/repositories/SystemRepository';

export interface QueryConfig {
    table: string;
    columns: string[];
    filters: {
        column: string;
        operator: '=' | '!=' | '>' | '<' | 'contains' | 'is null' | 'is not null';
        value: string;
    }[];
    filterLogic?: 'AND' | 'OR';
    aggregations: {
        column: string;
        type: 'sum' | 'avg' | 'count' | 'min' | 'max';
        alias?: string;
    }[];
    groupBy: string[];
    orderBy: { column: string; direction: 'ASC' | 'DESC' }[];
    limit: number;
}

interface VisualQueryBuilderProps {
    onChange: (sql: string, config: QueryConfig) => void;
    initialConfig?: QueryConfig;
    isAdminMode?: boolean;
}

export const VisualQueryBuilder: React.FC<VisualQueryBuilderProps> = ({ onChange, initialConfig, isAdminMode = false }) => {
    const [tables, setTables] = useState<string[]>([]);
    const [columns, setColumns] = useState<{ name: string; type: string }[]>([]);
    const [config, setConfig] = useState<QueryConfig>(initialConfig || {
        table: '',
        columns: [],
        filters: [],
        aggregations: [],
        groupBy: [],
        orderBy: [],
        limit: 100,
        filterLogic: 'AND'
    });

    // UI State
    const [search, setSearch] = useState('');
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        filters: true,
        aggregations: false,
        sorting: false
    });

    const toggleSection = (id: string) => {
        setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // Load tables
    useEffect(() => {
        SystemRepository.getTables().then(allTables => {
            const filteredTables = isAdminMode ? allTables : allTables.filter(t => !t.startsWith('sys_'));
            setTables(filteredTables);
            if (!config.table && filteredTables.length > 0) {
                setConfig(prev => ({ ...prev, table: filteredTables[0] }));
            }
        });
    }, [isAdminMode]);

    // Load columns when table changes
    useEffect(() => {
        if (config.table) {
            SystemRepository.getTableSchema(config.table).then(schema => {
                // @ts-ignore - PRAGMA info mapping
                setColumns(schema.map(c => ({ name: c.name, type: c.type.toLowerCase() })));
            });
        }
    }, [config.table]);

    // SQL Generation
    useEffect(() => {
        const sql = generateSQL(config);
        onChange(sql, config);
    }, [config, columns]);

    const generateSQL = (cfg: QueryConfig): string => {
        if (!cfg.table) return '';

        let select = cfg.columns.length > 0 ? cfg.columns.join(', ') : '*';

        if (cfg.aggregations.length > 0) {
            const aggs = cfg.aggregations.map(a => `${a.type.toUpperCase()}(${a.column}) AS ${a.alias || `${a.type}_${a.column}`}`);
            if (cfg.columns.length > 0) {
                select = [...cfg.columns, ...aggs].join(', ');
            } else {
                select = aggs.join(', ');
            }
        }

        let sql = `SELECT ${select} FROM ${cfg.table}`;

        if (cfg.filters.length > 0) {
            const filters = cfg.filters.map(f => {
                let val = f.value;
                if (f.operator === 'contains') return `${f.column} LIKE '%${val.replace(/'/g, "''")}%'`;
                if (f.operator === 'is null') return `${f.column} IS NULL`;
                if (f.operator === 'is not null') return `${f.column} IS NOT NULL`;

                // Quote string values
                const colType = columns.find(c => c.name === f.column)?.type || '';
                if (colType.includes('char') || colType.includes('text')) {
                    val = `'${val.replace(/'/g, "''")}'`;
                }
                return `${f.column} ${f.operator} ${val}`;
            });
            const logic = cfg.filterLogic || 'AND';
            sql += ` WHERE ${filters.join(` ${logic} `)}`;
        }

        if (cfg.groupBy.length > 0) {
            sql += ` GROUP BY ${cfg.groupBy.join(', ')}`;
        }

        if (cfg.orderBy.length > 0) {
            const orders = cfg.orderBy.map(o => `${o.column} ${o.direction}`);
            sql += ` ORDER BY ${orders.join(', ')}`;
        }

        if (cfg.limit) {
            sql += ` LIMIT ${cfg.limit}`;
        }

        return sql;
    };

    const toggleColumn = (col: string) => {
        setConfig(prev => ({
            ...prev,
            columns: prev.columns.includes(col)
                ? prev.columns.filter(c => c !== col)
                : [...prev.columns, col]
        }));
    };

    const addFilter = () => {
        if (columns.length === 0) return;
        setConfig(prev => ({
            ...prev,
            filters: [...prev.filters, { column: columns[0].name, operator: '=', value: '' }]
        }));
    };

    const updateFilter = (index: number, field: string, value: any) => {
        setConfig(prev => {
            const newFilters = [...prev.filters];
            newFilters[index] = { ...newFilters[index], [field]: value };
            return { ...prev, filters: newFilters };
        });
    };

    const removeFilter = (index: number) => {
        setConfig(prev => ({ ...prev, filters: prev.filters.filter((_, i) => i !== index) }));
    };

    const addAggregation = () => {
        if (columns.length === 0) return;
        setConfig(prev => ({
            ...prev,
            aggregations: [...prev.aggregations, { column: columns[0].name, type: 'sum' }]
        }));
    };

    const removeAggregation = (index: number) => {
        setConfig(prev => ({ ...prev, aggregations: prev.aggregations.filter((_, i) => i !== index) }));
    };

    return (
        <div className="space-y-6">
            {/* Table Selection */}
            <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600">
                    <Database className="w-5 h-5" />
                </div>
                <div className="flex-1">
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Datenquelle / Tabelle</label>
                    <select
                        value={config.table}
                        onChange={e => setConfig({ ...config, table: e.target.value, columns: [], filters: [], aggregations: [], groupBy: [] })}
                        className="bg-transparent text-sm font-bold text-slate-900 dark:text-white outline-none w-full cursor-pointer"
                    >
                        {tables.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
            </div>

            {/* Column Selection */}
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                        <Layers className="w-4 h-4" /> Spalten
                    </h4>
                    <div className="relative flex-1 max-w-[150px]">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Suchen..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-7 pr-2 py-1 text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto pr-1 custom-scrollbar">
                    {columns.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).map(col => {
                        const isSelected = config.columns.includes(col.name);
                        return (
                            <button
                                key={col.name}
                                onClick={() => toggleColumn(col.name)}
                                className={`
                                    flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium border transition-all
                                    ${isSelected
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-400'}
                                `}
                            >
                                {col.type.includes('int') || col.type.includes('real') ? <Hash className="w-2.5 h-2.5 opacity-60" /> : col.type.includes('date') ? <Calendar className="w-2.5 h-2.5 opacity-60" /> : <Type className="w-2.5 h-2.5 opacity-60" />}
                                {col.name}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Filters */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                <button
                    onClick={() => toggleSection('filters')}
                    className="w-full flex items-center justify-between mb-3 group"
                >
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                        <Filter className="w-4 h-4" /> Filter ({config.filters.length})
                    </h4>
                    {openSections.filters ? <ChevronUp className="w-4 h-4 text-slate-300 group-hover:text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />}
                </button>

                {openSections.filters && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="flex items-center justify-between">
                            {config.filters.length > 1 && (
                                <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <button
                                        onClick={() => setConfig({ ...config, filterLogic: 'AND' })}
                                        className={`px-3 py-1 text-[9px] font-black rounded-md transition-all ${config.filterLogic === 'AND' ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        ALLE (UND)
                                    </button>
                                    <button
                                        onClick={() => setConfig({ ...config, filterLogic: 'OR' })}
                                        className={`px-3 py-1 text-[9px] font-black rounded-md transition-all ${config.filterLogic === 'OR' ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        EINE (ODER)
                                    </button>
                                </div>
                            )}
                            <div className="flex-1" />
                            <button onClick={addFilter} className="p-1 px-2 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 rounded flex items-center gap-1 transition-colors">
                                <Plus className="w-3 h-3" /> Filter hinzufügen
                            </button>
                        </div>
                        {config.filters.map((f, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <select
                                    value={f.column}
                                    onChange={e => updateFilter(i, 'column', e.target.value)}
                                    className="flex-1 min-w-0 p-1.5 text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                    {columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                </select>
                                <select
                                    value={f.operator}
                                    onChange={e => updateFilter(i, 'operator', e.target.value)}
                                    className="w-20 p-1.5 text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                    <option value="=">=</option>
                                    <option value="!=">!=</option>
                                    <option value=">">&gt;</option>
                                    <option value="<">&lt;</option>
                                    <option value="contains">enthält</option>
                                    <option value="is null">ist leer</option>
                                    <option value="is not null">nicht leer</option>
                                </select>
                                {!f.operator.includes('null') && (
                                    <input
                                        type="text"
                                        value={f.value}
                                        onChange={e => updateFilter(i, 'value', e.target.value)}
                                        placeholder="Wert..."
                                        className="flex-1 min-w-0 p-1.5 text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                )}
                                <button onClick={() => removeFilter(i)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Aggregations */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                <button
                    onClick={() => toggleSection('aggregations')}
                    className="w-full flex items-center justify-between mb-3 group"
                >
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                        <Layers className="w-4 h-4" /> Aggregation ({config.aggregations.length})
                    </h4>
                    {openSections.aggregations ? <ChevronUp className="w-4 h-4 text-slate-300 group-hover:text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />}
                </button>

                {openSections.aggregations && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="flex justify-end">
                            <button onClick={addAggregation} className="p-1 px-2 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 rounded flex items-center gap-1 transition-colors">
                                <Plus className="w-3 h-3" /> Aggregation hinzufügen
                            </button>
                        </div>
                        <div className="space-y-2">
                            {config.aggregations.map((a, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <select
                                        value={a.type}
                                        onChange={e => {
                                            const newAggs = [...config.aggregations];
                                            newAggs[i].type = e.target.value as any;
                                            setConfig({ ...config, aggregations: newAggs });
                                        }}
                                        className="w-20 p-1.5 text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-blue-500"
                                    >
                                        <option value="sum">Summe</option>
                                        <option value="avg">Durchschn.</option>
                                        <option value="count">Anzahl</option>
                                        <option value="min">Min</option>
                                        <option value="max">Max</option>
                                    </select>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase">von</span>
                                    <select
                                        value={a.column}
                                        onChange={e => {
                                            const newAggs = [...config.aggregations];
                                            newAggs[i].column = e.target.value;
                                            setConfig({ ...config, aggregations: newAggs });
                                        }}
                                        className="flex-1 p-1.5 text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-blue-500"
                                    >
                                        {columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                    </select>
                                    <button onClick={() => removeAggregation(i)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {config.aggregations.length > 0 && (
                            <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-100 dark:border-slate-800">
                                <label className="block text-[9px] font-black uppercase text-slate-400 mb-2">Gruppieren nach</label>
                                <div className="flex flex-wrap gap-1">
                                    {columns.map(col => {
                                        const isGrouped = config.groupBy.includes(col.name);
                                        return (
                                            <button
                                                key={col.name}
                                                onClick={() => {
                                                    setConfig(prev => ({
                                                        ...prev,
                                                        groupBy: isGrouped ? prev.groupBy.filter(c => c !== col.name) : [...prev.groupBy, col.name]
                                                    }));
                                                }}
                                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all ${isGrouped ? 'bg-slate-900 text-white shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
                                            >
                                                {col.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Sort & Limit */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4 pb-2">
                <button
                    onClick={() => toggleSection('sorting')}
                    className="w-full flex items-center justify-between mb-3 group"
                >
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                        <Layers className="w-4 h-4" /> Sortierung & Limit
                    </h4>
                    {openSections.sorting ? <ChevronUp className="w-4 h-4 text-slate-300 group-hover:text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />}
                </button>

                {openSections.sorting && (
                    <div className="flex gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="flex-1">
                            <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">LIMIT</label>
                            <input
                                type="number"
                                value={config.limit}
                                onChange={e => setConfig({ ...config, limit: parseInt(e.target.value, 10) || 0 })}
                                className="w-full p-1.5 text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">Sortierung</label>
                            <select
                                value={config.orderBy[0]?.column || ''}
                                onChange={e => setConfig({ ...config, orderBy: e.target.value ? [{ column: e.target.value, direction: 'DESC' }] : [] })}
                                className="w-full p-1.5 text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-blue-500"
                            >
                                <option value="">Keine</option>
                                {columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                            </select>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
