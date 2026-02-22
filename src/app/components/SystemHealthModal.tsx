import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HardDrive, Cpu, Info, RotateCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAsync } from '../../hooks/useAsync';
import { Modal } from './Modal';
import { SystemRepository } from '../../lib/repositories/SystemRepository';

interface SystemHealthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface NavigatorWithDeviceMemory extends Navigator {
    deviceMemory?: number;
}

export const SystemHealthModal: React.FC<SystemHealthModalProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'overview' | 'storage' | 'database'>('overview');
    const [storageEst, setStorageEst] = useState<{ quota?: number, usage?: number }>({});

    // Fetch Diagnostics on modal open
    const { data: diagnostics, loading: diagLoading, refresh: refreshDiag } = useAsync(
        () => SystemRepository.getDiagnostics(),
        [isOpen]
    );

    const version = __APP_VERSION__;
    const buildDate = __BUILD_DATE__;
    const navigatorWithDeviceMemory = navigator as NavigatorWithDeviceMemory;

    // Check storage quota
    useEffect(() => {
        if (isOpen && navigator.storage && navigator.storage.estimate) {
            navigator.storage.estimate().then(est => setStorageEst(est));
        }
    }, [isOpen]);

    // Helper to format bytes
    const formatBytes = (bytes?: number) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('widgets.system_health.title')}
        >
            <div>
                {/* Tabs */}
                <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6 sticky top-0 bg-white dark:bg-slate-800 z-10 -mx-6 px-6 pt-2">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`pb-3 px-4 text-sm font-medium transition-colors relative ${activeTab === 'overview' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                        {t('widgets.system_health.tab_overview')}
                        {activeTab === 'overview' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('storage')}
                        className={`pb-3 px-4 text-sm font-medium transition-colors relative ${activeTab === 'storage' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                        {t('widgets.system_health.tab_storage')}
                        {activeTab === 'storage' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('database')}
                        className={`pb-3 px-4 text-sm font-medium transition-colors relative ${activeTab === 'database' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                        {t('widgets.system_health.tab_database')}
                        {activeTab === 'database' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />}
                    </button>
                </div>

                <div className="min-h-[300px]">
                    {/* OVERVIEW TAB */}
                    {activeTab === 'overview' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                                    <Cpu className="w-4 h-4 text-indigo-500" />
                                    {t('widgets.system_health.app_environment')}
                                </h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between border-b border-slate-200 dark:border-slate-700/50 pb-2">
                                        <span className="text-slate-500 dark:text-slate-400">{t('widgets.system_health.version')}</span>
                                        <span className="font-mono font-medium text-slate-900 dark:text-white">{version}</span>
                                    </div>
                                    {diagnostics?.schemaVersion !== undefined && (
                                        <div className="flex justify-between border-b border-slate-200 dark:border-slate-700/50 pb-2">
                                            <span className="text-slate-500 dark:text-slate-400">Database Schema</span>
                                            <span className="font-mono font-bold text-blue-600 dark:text-blue-400">V{diagnostics.schemaVersion}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between border-b border-slate-200 dark:border-slate-700/50 pb-2">
                                        <span className="text-slate-500 dark:text-slate-400">{t('widgets.system_health.build_date')}</span>
                                        <span className="font-mono font-medium text-slate-900 dark:text-white">{buildDate}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-200 dark:border-slate-700/50 pb-2">
                                        <span className="text-slate-500 dark:text-slate-400">{t('widgets.system_health.environment')}</span>
                                        <span className="font-mono font-medium text-slate-900 dark:text-white uppercase text-xs bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">{import.meta.env.MODE}</span>
                                    </div>
                                    <div className="flex flex-col gap-1 pb-1">
                                        <span className="text-slate-500 dark:text-slate-400">{t('widgets.system_health.user_agent')}</span>
                                        <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 break-all bg-slate-100 dark:bg-slate-900/50 p-2 rounded border border-slate-200 dark:border-slate-800/50">
                                            {navigator.userAgent}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
                                    <div className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase mb-1">{t('widgets.system_health.cpu_cores')}</div>
                                    <div className="text-2xl font-black text-blue-700 dark:text-blue-300">
                                        {navigator.hardwareConcurrency || '?'}
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30">
                                    <div className="text-xs text-purple-600 dark:text-purple-400 font-bold uppercase mb-1">{t('widgets.system_health.device_memory')}</div>
                                    <div className="text-2xl font-black text-purple-700 dark:text-purple-300" title={t('widgets.system_health.memory_limit_hint')}>
                                        {navigatorWithDeviceMemory.deviceMemory ?
                                            `${navigatorWithDeviceMemory.deviceMemory >= 8 ? '≥ ' : '~'}${navigatorWithDeviceMemory.deviceMemory} GB`
                                            : '?'}
                                    </div>
                                    <div className="text-[9px] text-purple-400 dark:text-purple-500 mt-1 leading-tight">
                                        {t('widgets.system_health.memory_limit_hint')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STORAGE TAB */}
                    {activeTab === 'storage' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border border-slate-200 dark:border-slate-700 text-center">
                                <HardDrive className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                                {storageEst.quota ? (
                                    <>
                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{t('widgets.system_health.used_storage')}</div>
                                        <div className="text-3xl font-black text-slate-900 dark:text-white mb-4">
                                            {formatBytes(storageEst.usage)}
                                        </div>

                                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t('widgets.system_health.max_available')}</div>
                                        <div className="text-sm text-slate-600 dark:text-slate-300 mb-6 font-mono">
                                            {formatBytes(storageEst.quota)}
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="relative h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden max-w-xs mx-auto mb-2">
                                            <div
                                                className="absolute top-0 left-0 h-full bg-blue-500 transition-all duration-1000"
                                                style={{ width: `${Math.min(100, Math.max(1, ((storageEst.usage || 0) / (storageEst.quota || 1)) * 100))}%` }}
                                            />
                                        </div>
                                        <div className="text-[10px] text-slate-400">
                                            {t('widgets.system_health.quota_used', { percent: ((storageEst.usage || 0) / (storageEst.quota || 1) * 100).toFixed(6) })}
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-slate-500 italic">{t('widgets.system_health.no_storage_info')}</div>
                                )}
                            </div>

                            <div className="flex gap-4 p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-xl">
                                <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                <div className="text-xs text-amber-800 dark:text-amber-300">
                                    <p className="font-bold mb-1">{t('widgets.system_health.opfs_title')}</p>
                                    <p>
                                        {t('widgets.system_health.opfs_description')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* DATABASE TAB */}
                    {activeTab === 'database' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {diagLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <RotateCw className="w-8 h-8 animate-spin mb-2" />
                                    <p>{t('widgets.system_health.analyzing_db')}</p>
                                </div>
                            ) : diagnostics ? (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
                                            <div className="text-xs text-emerald-600 dark:text-emerald-400 font-bold uppercase mb-1">{t('widgets.system_health.db_size')}</div>
                                            <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
                                                {formatBytes(diagnostics.dbSize)}
                                            </div>
                                            <div className="text-[10px] text-emerald-600/70 mt-1 font-mono">
                                                {diagnostics.pageCount} Pages @ {diagnostics.pageSize} Bytes
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 flex flex-col justify-center items-center text-center">
                                            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
                                                <CheckCircle className="w-5 h-5" />
                                                <span className="font-bold">{t('widgets.system_health.connected')}</span>
                                            </div>
                                            <div className="text-xs text-slate-400">{t('widgets.system_health.worker_active')}</div>
                                        </div>
                                    </div>

                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                                        <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-2 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                            {t('widgets.system_health.table_stats')}
                                        </div>
                                        <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[400px] overflow-auto">
                                            {/* User Tables */}
                                            {Object.entries(diagnostics.tableStats || {})
                                                .filter(([table]) => !table.startsWith('sys_') && !table.startsWith('sqlite_'))
                                                .length > 0 && (
                                                    <div className="bg-blue-50/30 dark:bg-blue-900/10 px-4 py-1.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-tight">
                                                        {t('widgets.system_health.user_tables')}
                                                    </div>
                                                )}
                                            {Object.entries(diagnostics.tableStats || {})
                                                .filter(([table]) => !table.startsWith('sys_') && !table.startsWith('sqlite_'))
                                                .map(([table, count]) => (
                                                    <div key={table} className="flex justify-between px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                        <span className="font-mono text-slate-700 dark:text-slate-200">{table}</span>
                                                        <span className="font-bold text-slate-900 dark:text-white">{(count as number).toLocaleString()}</span>
                                                    </div>
                                                ))}

                                            {/* System Tables */}
                                            <div className="bg-slate-100 dark:bg-slate-800/80 px-4 py-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight">
                                                {t('widgets.system_health.system_tables')}
                                            </div>
                                            {Object.entries(diagnostics.tableStats || {})
                                                .filter(([table]) => table.startsWith('sys_') || table.startsWith('sqlite_'))
                                                .map(([table, count]) => (
                                                    <div key={table} className="flex justify-between px-4 py-3 text-sm opacity-70 hover:opacity-100 transition-opacity">
                                                        <span className="font-mono text-slate-500 dark:text-slate-400 text-xs">{table}</span>
                                                        <span className="font-medium text-slate-700 dark:text-slate-300">{(count as number).toLocaleString()}</span>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-2">
                                        <button
                                            onClick={refreshDiag}
                                            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold transition-colors"
                                        >
                                            <RotateCw className="w-3.5 h-3.5" />
                                            {t('widgets.system_health.refresh_diag')}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-12 text-red-400">
                                    <AlertTriangle className="w-8 h-8 mb-2" />
                                    <p>{t('widgets.system_health.diag_failed')}</p>
                                    <button onClick={refreshDiag} className="mt-4 text-blue-500 underline text-sm">{t('widgets.system_health.retry')}</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};
