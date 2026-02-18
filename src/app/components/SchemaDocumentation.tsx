import React, { useState } from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { Modal } from './Modal';

interface SchemaDocumentationProps {
    schema: any;
    title?: string;
}

export const SchemaTable: React.FC<{ schema: any }> = ({ schema }) => {
    if (!schema) return null;

    // Handle both array/list schemas (with .items) and direct object schemas
    const target = schema.items || schema;
    const properties = target.properties;
    const required = target.required || [];

    if (!properties) return <div className="p-4 text-center text-slate-400 italic text-sm">Keine Feld-Informationen verfügbar.</div>;

    const propertyEntries = Object.entries(properties);

    return (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 uppercase text-[11px] font-bold">
                    <tr>
                        <th className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">Property</th>
                        <th className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">Type</th>
                        <th className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">Constraints</th>
                        <th className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">Description</th>
                    </tr>
                </thead>
                <tbody>
                    {propertyEntries.map(([key, value]: [string, any]) => (
                        <tr key={key} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0">
                            <td className="px-4 py-4 align-top">
                                <div className="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                    {key}
                                    {required.includes(key) && (
                                        <span className="text-[10px] text-red-500 font-bold px-1.5 py-0.5 bg-red-50 dark:bg-red-900/20 rounded border border-red-100 dark:border-red-900/30">REQ</span>
                                    )}
                                </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                                <code className="text-[11px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300">
                                    {value.type}
                                </code>
                            </td>
                            <td className="px-4 py-4 align-top">
                                <div className="flex flex-wrap gap-1">
                                    {value.enum && (
                                        <div className="w-full mb-1">
                                            <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Allowed Values:</span>
                                            <div className="flex flex-wrap gap-1">
                                                {value.enum.map((v: string) => (
                                                    <span key={v} className="text-[10px] px-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30 rounded">{v}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {value.pattern && (
                                        <div className="w-full">
                                            <span className="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">Regex Pattern:</span>
                                            <code className="text-[10px] text-indigo-500 font-mono break-all">{value.pattern}</code>
                                        </div>
                                    )}
                                    {value.format && <span className="text-[10px] px-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 rounded uppercase">{value.format}</span>}
                                    {value.minimum !== undefined && <span className="text-[10px] px-1 bg-slate-50 dark:bg-slate-700 text-slate-500 rounded font-mono">min: {value.minimum}</span>}
                                    {value.maximum !== undefined && <span className="text-[10px] px-1 bg-slate-50 dark:bg-slate-700 text-slate-500 rounded font-mono">max: {value.maximum}</span>}
                                </div>
                            </td>
                            <td className="px-4 py-4 align-top text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
                                {value.description || <span className="opacity-30 italic">No description available</span>}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export const SchemaDocumentation: React.FC<SchemaDocumentationProps> = ({ schema, title }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    if (!schema) {
        return <div className="text-slate-500 italic">Kein Schema vorhanden.</div>;
    }

    const target = schema.items || schema;
    const properties = target.properties;
    const required = target.required || [];

    if (!properties) return null;

    const propertyEntries = Object.entries(properties);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider mb-1 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4" />
                        {title || 'Validation Rules'}
                    </h3>
                    <p className="text-sm text-blue-600 dark:text-blue-400 italic">
                        {schema.description || 'Automatic documentation from JSON Schema.'}
                    </p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors active:scale-95 shadow-sm"
                >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View Details
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {propertyEntries.filter(([key]) => required.includes(key)).slice(0, 4).map(([key, value]: [string, any]) => (
                    <div key={key} className="text-xs p-2.5 rounded-lg bg-white/50 dark:bg-slate-900/50 border border-blue-200/50 dark:border-blue-800/30">
                        <div className="flex items-center justify-between mb-0.5">
                            <span className="font-bold text-blue-800 dark:text-blue-200">{key}</span>
                            <span className="text-[10px] uppercase font-bold text-blue-500/70">{value.type}</span>
                        </div>
                        <p className="text-slate-500 line-clamp-1">{value.description}</p>
                    </div>
                ))}
                <div className="text-xs p-2.5 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 border border-dashed border-blue-200 dark:border-blue-800/50 flex items-center justify-center text-blue-600 dark:text-blue-400 italic">
                    + {propertyEntries.length - Math.min(4, required.length)} more fields
                </div>
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={schema.title || 'Data Format Details'}
            >
                <div className="space-y-6">
                    <SchemaTable schema={schema} />
                </div>
            </Modal>
        </div>
    );
};
