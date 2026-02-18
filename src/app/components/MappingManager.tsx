import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Upload, Trash2, Check, AlertCircle } from 'lucide-react';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import type { MappingConfig } from './ColumnMapper';

export const MappingManager: React.FC = () => {
    const { t } = useTranslation();
    // Shared key with ExcelImport
    const [savedMappings, setSavedMappings] = useLocalStorage<Record<string, Record<string, MappingConfig>>>('excel_mappings_v2', {});
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [message, setMessage] = React.useState<string | null>(null);
    const [status, setStatus] = React.useState<'success' | 'error' | null>(null);

    const handleExport = () => {
        try {
            const data = JSON.stringify(savedMappings, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `itdashboard_mappings_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setStatus('success');
            setMessage(t('common.success'));
        } catch (e: any) {
            setStatus('error');
            setMessage(t('common.error') + ': ' + e.message);
        }
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (typeof json !== 'object' || json === null) throw new Error('Invalid JSON');

                // Merge strategies?
                // For now, let's merge and overwrite existing keys
                setSavedMappings((prev: Record<string, Record<string, MappingConfig>>) => ({ ...prev, ...json }));

                setStatus('success');
                setMessage(t('common.success'));
            } catch (err: any) {
                setStatus('error');
                setMessage(t('common.error') + ': ' + err.message);
            }
        };
        reader.readAsText(file);
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleClear = () => {
        if (confirm(t('datasource.clear_mappings_confirm'))) {
            setSavedMappings({});
            setStatus('success');
            setMessage(t('common.success'));
        }
    };

    // Auto-hide message
    React.useEffect(() => {
        if (message) {
            const timer = setTimeout(() => {
                setMessage(null);
                setStatus(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [message]);

    const count = Object.keys(savedMappings).length;

    return (
        <div className="flex items-center gap-3">
            {message && (
                <div className={`text-xs px-2 py-1 rounded flex items-center gap-1.5 animate-in fade-in slide-in-from-right-4 ${status === 'success'
                    ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                    : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                    }`}>
                    {status === 'success' ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {message}
                </div>
            )}

            <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 mr-2">
                    {t('datasource.mappings_saved', { count })}
                </span>

                <button
                    onClick={handleExport}
                    disabled={count === 0}
                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t('datasource.export_mappings')}
                >
                    <Download className="w-4 h-4" />
                </button>

                <div className="relative">
                    <input
                        type="file"
                        accept=".json"
                        ref={fileInputRef}
                        onChange={handleImport}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        title={t('datasource.import_mappings')}
                    />
                    <button className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-700 rounded transition-colors pointer-events-none">
                        <Upload className="w-4 h-4" />
                    </button>
                </div>

                <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />

                <button
                    onClick={handleClear}
                    disabled={count === 0}
                    className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t('datasource.clear_mappings')}
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};
