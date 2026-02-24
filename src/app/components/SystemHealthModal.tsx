import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HardDrive, Cpu, Info, RotateCw, CheckCircle, AlertTriangle, XCircle, Wrench } from 'lucide-react';
import { useAsync } from '../../hooks/useAsync';
import { Modal } from './Modal';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { appDialog } from '../../lib/appDialog';

interface SystemHealthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface NavigatorWithDeviceMemory extends Navigator {
    deviceMemory?: number;
}

interface DiagnosticsInfo {
    schemaVersion?: number | string;
    dbSize?: number;
    pageCount?: number;
    pageSize?: number;
    tableStats?: Record<string, number>;
}

type HealthSeverity = 'error' | 'warning' | 'info';

interface HealthFinding {
    severity: HealthSeverity;
    code: string;
    title: string;
    details: string;
    recommendation?: string;
}

interface DatabaseHealthReport {
    status: 'ok' | 'warning' | 'error';
    score: number;
    checkedAt: string;
    checksRun: number;
    findings: HealthFinding[];
}

interface ClientHealthReport {
    status: 'ok' | 'warning' | 'error';
    score: number;
    checksRun: number;
    findings: HealthFinding[];
}

export const SystemHealthModal: React.FC<SystemHealthModalProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'overview' | 'storage' | 'database'>('overview');
    const [databaseSubTab, setDatabaseSubTab] = useState<'health' | 'stats'>('health');
    const [storageEst, setStorageEst] = useState<{ quota?: number, usage?: number }>({});
    const [expandedFindingKey, setExpandedFindingKey] = useState<string | null>(null);
    const [expandedClientFindingKey, setExpandedClientFindingKey] = useState<string | null>(null);
    const [fixingFindingKey, setFixingFindingKey] = useState<string | null>(null);
    const [clientHealth, setClientHealth] = useState<ClientHealthReport | null>(null);

    // Fetch Diagnostics on modal open
    const { data: diagnostics, loading: diagLoading, refresh: refreshDiag } = useAsync<DiagnosticsInfo>(
        () => SystemRepository.getDiagnostics(),
        [isOpen]
    );
    const { data: healthReport, loading: healthLoading, refresh: refreshHealth } = useAsync<DatabaseHealthReport | null>(
        async () => {
            if (!isOpen) return null;
            return await SystemRepository.getDatabaseHealth() as unknown as DatabaseHealthReport;
        },
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

    useEffect(() => {
        if (!isOpen) return;

        const findings: HealthFinding[] = [];
        let checksRun = 0;
        const addFinding = (
            severity: HealthSeverity,
            code: string,
            title: string,
            details: string,
            recommendation?: string
        ) => {
            findings.push({ severity, code, title, details, recommendation });
        };

        checksRun += 1;
        if (storageEst.quota && storageEst.usage !== undefined) {
            const ratio = storageEst.usage / storageEst.quota;
            const percent = (ratio * 100).toFixed(2);
            if (ratio >= 0.9) {
                addFinding('error', 'storage_quota_critical', t('widgets.system_health.client_storage_quota_critical'), `${percent}%`);
            } else if (ratio >= 0.75) {
                addFinding('warning', 'storage_quota_high', t('widgets.system_health.client_storage_quota_high'), `${percent}%`);
            } else {
                addFinding('info', 'storage_quota_ok', t('widgets.system_health.client_storage_quota_ok'), `${percent}%`);
            }
        } else {
            addFinding('info', 'storage_quota_unknown', t('widgets.system_health.client_storage_quota_unknown'), t('widgets.system_health.no_storage_info'));
        }

        checksRun += 1;
        const localKeys = Object.keys(window.localStorage);
        const localBytes = localKeys.reduce((sum, key) => sum + ((key.length + (window.localStorage.getItem(key)?.length || 0)) * 2), 0);
        const localKeyPreview = localKeys.slice(0, 8).join(', ');
        if (localBytes > 4 * 1024 * 1024) {
            addFinding(
                'warning',
                'local_storage_large',
                t('widgets.system_health.client_local_storage_large'),
                `${(localBytes / 1024 / 1024).toFixed(2)} MB | ${localKeys.length} keys`,
                localKeyPreview ? `Keys: ${localKeyPreview}${localKeys.length > 8 ? ' ...' : ''}` : undefined
            );
        } else {
            addFinding(
                'info',
                'local_storage_ok',
                t('widgets.system_health.client_local_storage_ok'),
                `${localKeys.length} keys`,
                localKeyPreview ? `Keys: ${localKeyPreview}${localKeys.length > 8 ? ' ...' : ''}` : undefined
            );
        }

        checksRun += 1;
        const sessionKeys = Object.keys(window.sessionStorage);
        const sessionBytes = sessionKeys.reduce((sum, key) => sum + ((key.length + (window.sessionStorage.getItem(key)?.length || 0)) * 2), 0);
        const sessionKeyPreview = sessionKeys.slice(0, 8).join(', ');
        if (sessionBytes > 1024 * 1024) {
            addFinding(
                'warning',
                'session_storage_large',
                t('widgets.system_health.client_session_storage_large'),
                `${(sessionBytes / 1024 / 1024).toFixed(2)} MB | ${sessionKeys.length} keys`,
                sessionKeyPreview ? `Keys: ${sessionKeyPreview}${sessionKeys.length > 8 ? ' ...' : ''}` : undefined
            );
        } else {
            addFinding(
                'info',
                'session_storage_ok',
                t('widgets.system_health.client_session_storage_ok'),
                `${sessionKeys.length} keys`,
                sessionKeyPreview ? `Keys: ${sessionKeyPreview}${sessionKeys.length > 8 ? ' ...' : ''}` : undefined
            );
        }

        checksRun += 1;
        if (window.localStorage.getItem('notifications_confirm_destructive') === 'false') {
            addFinding('warning', 'destructive_confirm_off', t('widgets.system_health.client_destructive_confirm_off'), t('widgets.system_health.client_destructive_confirm_off_detail'));
        } else {
            addFinding('info', 'destructive_confirm_on', t('widgets.system_health.client_destructive_confirm_on'), t('widgets.system_health.client_destructive_confirm_on_detail'));
        }

        checksRun += 1;
        const logLevel = (window.localStorage.getItem('app_log_level') || 'info').toLowerCase();
        if (logLevel === 'debug') {
            addFinding('warning', 'log_level_debug', t('widgets.system_health.client_log_level_debug'), t('widgets.system_health.client_log_level_debug_detail'));
        } else {
            addFinding('info', 'log_level_ok', t('widgets.system_health.client_log_level_ok'), `Level: ${logLevel}`);
        }

        checksRun += 1;
        const lastBackup = window.localStorage.getItem('litebistudio_last_backup');
        if (!lastBackup) {
            addFinding('warning', 'backup_missing', t('widgets.system_health.client_backup_missing'), t('widgets.system_health.client_backup_missing_detail'));
        } else {
            addFinding('info', 'backup_exists', t('widgets.system_health.client_backup_exists'), new Date(lastBackup).toLocaleString());
        }

        const errorCount = findings.filter((f) => f.severity === 'error').length;
        const warningCount = findings.filter((f) => f.severity === 'warning').length;
        const infoCount = findings.filter((f) => f.severity === 'info').length;

        setClientHealth({
            status: errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'ok',
            score: Math.max(0, 100 - (errorCount * 25) - (warningCount * 10) - (infoCount * 1)),
            checksRun,
            findings
        });
    }, [isOpen, storageEst, t]);

    const handleRunFullHealthCheck = () => {
        refreshDiag();
        refreshHealth();
        setActiveTab('database');
        setDatabaseSubTab('health');
    };

    const openBackupCenter = () => {
        sessionStorage.setItem('litebistudio_datasource_tab', 'system');
        window.location.hash = '#/datasource';
    };

    const openInspector = () => {
        window.location.hash = '#/inspector';
    };

    // Helper to format bytes
    const formatBytes = (bytes?: number) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const escapeIdentifier = (identifier: string) => identifier.replace(/"/g, '""');

    const parseQuickFixCandidates = (finding: HealthFinding): Array<{ table: string; column?: string }> => {
        const details = finding.details || '';
        if (finding.code === 'query_plan_full_scan_risk') {
            const matches = Array.from(details.matchAll(/([a-zA-Z0-9_]+)\s+\(column:\s*([a-zA-Z0-9_]+)\)/g));
            return matches.map((match) => ({ table: match[1], column: match[2] }));
        }
        if (finding.code === 'large_unindexed_tables') {
            const matches = Array.from(details.matchAll(/([a-zA-Z0-9_]+)\s+\(\d+\s+rows\)/g));
            return matches.map((match) => ({ table: match[1] }));
        }
        return [];
    };

    const buildQuickFixSql = async (finding: HealthFinding): Promise<string[]> => {
        const candidates = parseQuickFixCandidates(finding);
        const statements: string[] = [];
        for (const candidate of candidates) {
            const tableName = candidate.table;
            const schema = await SystemRepository.getTableSchema(tableName);
            if (!schema.length) continue;
            const columnName = candidate.column && schema.some((col) => col.name === candidate.column)
                ? candidate.column
                : schema.find((col) => Number(col.pk || 0) > 0)?.name || schema[0]?.name;
            if (!columnName) continue;

            const indexName = `idx_auto_${tableName}_${columnName}`.slice(0, 60);
            statements.push(
                `CREATE INDEX IF NOT EXISTS "${escapeIdentifier(indexName)}" ON "${escapeIdentifier(tableName)}"("${escapeIdentifier(columnName)}")`
            );
        }
        return statements;
    };

    const supportsQuickFix = (finding: HealthFinding): boolean =>
        finding.code === 'query_plan_full_scan_risk' || finding.code === 'large_unindexed_tables';

    const handleApplyQuickFix = async (finding: HealthFinding, key: string) => {
        try {
            setFixingFindingKey(key);
            const statements = await buildQuickFixSql(finding);
            if (!statements.length) {
                await appDialog.warning(t('widgets.system_health.quick_fix_none'));
                return;
            }

            const preview = statements.slice(0, 5).join(';\n');
            const shouldApply = await appDialog.confirm(
                `${t('widgets.system_health.quick_fix_confirm')}\n\n${preview}${statements.length > 5 ? '\n...' : ''}`
            );
            if (!shouldApply) return;

            for (const sql of statements) {
                await SystemRepository.executeRaw(sql);
            }
            await appDialog.info(t('widgets.system_health.quick_fix_success', { count: statements.length }));
            refreshDiag();
            refreshHealth();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            await appDialog.error(`${t('widgets.system_health.quick_fix_failed')} ${message}`);
        } finally {
            setFixingFindingKey(null);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('widgets.system_health.title')}
        >
            <div className="h-[70vh] min-h-[520px] max-h-[760px] flex flex-col">
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

                <div className="flex-1 min-h-0 overflow-hidden">
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
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900">
                                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{t('widgets.system_health.overview_db_health')}</div>
                                    <div className={`mt-1 text-sm font-semibold ${healthReport?.status === 'error'
                                        ? 'text-red-600 dark:text-red-300'
                                        : healthReport?.status === 'warning'
                                            ? 'text-amber-600 dark:text-amber-300'
                                            : 'text-emerald-600 dark:text-emerald-300'
                                        }`}>
                                        {healthReport ? t(`widgets.system_health.health_status_${healthReport.status}`) : t('widgets.system_health.overview_not_available')}
                                    </div>
                                    {healthReport && (
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('widgets.system_health.health_score', { score: healthReport.score })}</div>
                                    )}
                                </div>
                                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900">
                                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{t('widgets.system_health.overview_storage_health')}</div>
                                    <div className={`mt-1 text-sm font-semibold ${clientHealth?.status === 'error'
                                        ? 'text-red-600 dark:text-red-300'
                                        : clientHealth?.status === 'warning'
                                            ? 'text-amber-600 dark:text-amber-300'
                                            : 'text-emerald-600 dark:text-emerald-300'
                                        }`}>
                                        {clientHealth ? t(`widgets.system_health.health_status_${clientHealth.status}`) : t('widgets.system_health.overview_not_available')}
                                    </div>
                                    {clientHealth && (
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('widgets.system_health.health_score', { score: clientHealth.score })}</div>
                                    )}
                                </div>
                                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900">
                                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{t('widgets.system_health.overview_last_backup')}</div>
                                    <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
                                        {window.localStorage.getItem('litebistudio_last_backup')
                                            ? new Date(String(window.localStorage.getItem('litebistudio_last_backup'))).toLocaleString()
                                            : t('widgets.system_health.overview_not_available')}
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900">
                                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">{t('widgets.system_health.overview_quick_actions')}</div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={handleRunFullHealthCheck}
                                        className="px-3 py-1.5 text-xs font-bold rounded border border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                    >
                                        {t('widgets.system_health.overview_action_run_health')}
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('storage')}
                                        className="px-3 py-1.5 text-xs font-bold rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        {t('widgets.system_health.overview_action_open_storage')}
                                    </button>
                                    <button
                                        onClick={openBackupCenter}
                                        className="px-3 py-1.5 text-xs font-bold rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        {t('widgets.system_health.overview_action_backup')}
                                    </button>
                                    <button
                                        onClick={openInspector}
                                        className="px-3 py-1.5 text-xs font-bold rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        {t('widgets.system_health.overview_action_inspector')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STORAGE TAB */}
                    {activeTab === 'storage' && (
                        <div className="h-full min-h-0 overflow-y-auto xl:overflow-hidden pr-1 xl:pr-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">
                                <div className="xl:col-span-5 space-y-4">
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

                                {clientHealth && (
                                    <div className="xl:col-span-7 min-h-0">
                                        <div className="h-full min-h-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden flex flex-col">
                                            <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-2 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                {t('widgets.system_health.client_health_title')}
                                            </div>
                                            <div className="p-4 space-y-3 flex-1 min-h-0 flex flex-col">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        {clientHealth.status === 'ok' && <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                                                        {clientHealth.status === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
                                                        {clientHealth.status === 'error' && <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />}
                                                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                                            {t(`widgets.system_health.health_status_${clientHealth.status}`)}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                                                        {t('widgets.system_health.health_score', { score: clientHealth.score })}
                                                    </div>
                                                </div>
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                                    {t('widgets.system_health.client_health_meta', { checks: clientHealth.checksRun })}
                                                </div>
                                                <div className="space-y-2 flex-1 min-h-0 overflow-auto pr-1">
                                                    {clientHealth.findings.map((finding, idx) => {
                                                        const findingKey = `client-${finding.code}-${idx}`;
                                                        const hasDetails = Boolean(finding.recommendation && finding.recommendation.trim().length > 0);
                                                        return (
                                                            <div
                                                                key={findingKey}
                                                            className={`rounded-lg border px-3 py-2 ${finding.severity === 'error'
                                                                ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10'
                                                                : finding.severity === 'warning'
                                                                    ? 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10'
                                                                    : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/30'
                                                                }`}
                                                            >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="text-xs font-semibold text-slate-900 dark:text-white">{finding.title}</span>
                                                                <span className={`text-[10px] uppercase font-bold ${finding.severity === 'error'
                                                                    ? 'text-red-700 dark:text-red-300'
                                                                    : finding.severity === 'warning'
                                                                        ? 'text-amber-700 dark:text-amber-300'
                                                                        : 'text-slate-500 dark:text-slate-400'
                                                                    }`}>
                                                                    {t(`widgets.system_health.severity_${finding.severity}`)}
                                                                </span>
                                                            </div>
                                                            <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{finding.details}</div>
                                                            <div className="mt-2 flex flex-wrap gap-2">
                                                                <button
                                                                    disabled={!hasDetails}
                                                                    onClick={() => setExpandedClientFindingKey((prev) => prev === findingKey ? null : findingKey)}
                                                                    className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors ${hasDetails
                                                                        ? 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                                                        : 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 bg-slate-100/60 dark:bg-slate-800/60 cursor-not-allowed'
                                                                        }`}
                                                                >
                                                                    {expandedClientFindingKey === findingKey
                                                                        ? t('widgets.system_health.hide_details')
                                                                        : t('widgets.system_health.show_details')}
                                                                </button>
                                                            </div>
                                                            {expandedClientFindingKey === findingKey && finding.recommendation && (
                                                                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                                                    {t('widgets.system_health.recommendation_prefix')} {finding.recommendation}
                                                                </div>
                                                            )}
                                                        </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* DATABASE TAB */}
                    {activeTab === 'database' && (
                        <div className="h-full min-h-0 flex flex-col space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {diagLoading || healthLoading ? (
                                <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-400">
                                    <RotateCw className="w-8 h-8 animate-spin mb-2" />
                                    <p>{t('widgets.system_health.analyzing_db')}</p>
                                </div>
                            ) : diagnostics ? (
                                <div className="flex-1 min-h-0 flex flex-col gap-4">
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

                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col">
                                        <div className="bg-slate-50 dark:bg-slate-800/50 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                                            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                                                <button
                                                    onClick={() => setDatabaseSubTab('health')}
                                                    className={`px-3 py-1.5 text-xs font-bold transition-colors ${databaseSubTab === 'health'
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                                        }`}
                                                >
                                                    {t('widgets.system_health.health_check_title')}
                                                </button>
                                                <button
                                                    onClick={() => setDatabaseSubTab('stats')}
                                                    className={`px-3 py-1.5 text-xs font-bold transition-colors ${databaseSubTab === 'stats'
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                                        }`}
                                                >
                                                    {t('widgets.system_health.table_stats')}
                                                </button>
                                            </div>
                                        </div>
                                        {databaseSubTab === 'health' && healthReport && (
                                            <div className="p-4 space-y-3 flex-1 min-h-0 flex flex-col">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        {healthReport.status === 'ok' && <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                                                        {healthReport.status === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
                                                        {healthReport.status === 'error' && <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />}
                                                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                                            {t(`widgets.system_health.health_status_${healthReport.status}`)}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                                                        {t('widgets.system_health.health_score', { score: healthReport.score })}
                                                    </div>
                                                </div>
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                                    {t('widgets.system_health.health_meta', {
                                                        checks: healthReport.checksRun,
                                                        timestamp: new Date(healthReport.checkedAt).toLocaleString()
                                                    })}
                                                </div>
                                                <div className="space-y-2 flex-1 min-h-0 overflow-auto pr-1">
                                                    {healthReport.findings.map((finding, index) => {
                                                        const findingKey = `${finding.code}-${index}`;
                                                        const hasDetails = Boolean(finding.recommendation && finding.recommendation.trim().length > 0);
                                                        return (
                                                            <div
                                                                key={findingKey}
                                                            className={`rounded-lg border px-3 py-2 ${finding.severity === 'error'
                                                                ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10'
                                                                : finding.severity === 'warning'
                                                                    ? 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10'
                                                                    : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/30'
                                                                }`}
                                                            >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="text-xs font-semibold text-slate-900 dark:text-white">{finding.title}</span>
                                                                <span className={`text-[10px] uppercase font-bold ${finding.severity === 'error'
                                                                    ? 'text-red-700 dark:text-red-300'
                                                                    : finding.severity === 'warning'
                                                                        ? 'text-amber-700 dark:text-amber-300'
                                                                        : 'text-slate-500 dark:text-slate-400'
                                                                    }`}>
                                                                    {t(`widgets.system_health.severity_${finding.severity}`)}
                                                                </span>
                                                            </div>
                                                            <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{finding.details}</div>
                                                            <div className="mt-2 flex flex-wrap gap-2">
                                                                <button
                                                                    disabled={!hasDetails}
                                                                    onClick={() => setExpandedFindingKey((prev) => prev === findingKey ? null : findingKey)}
                                                                    className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors ${hasDetails
                                                                        ? 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                                                        : 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 bg-slate-100/60 dark:bg-slate-800/60 cursor-not-allowed'
                                                                        }`}
                                                                >
                                                                    {expandedFindingKey === findingKey
                                                                        ? t('widgets.system_health.hide_details')
                                                                        : t('widgets.system_health.show_details')}
                                                                </button>
                                                                {supportsQuickFix(finding) && (
                                                                    <button
                                                                        disabled={fixingFindingKey === findingKey}
                                                                        onClick={() => handleApplyQuickFix(finding, findingKey)}
                                                                        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded border border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    >
                                                                        <Wrench className="w-3 h-3" />
                                                                        {fixingFindingKey === findingKey
                                                                            ? t('widgets.system_health.quick_fix_running')
                                                                            : t('widgets.system_health.quick_fix')}
                                                                    </button>
                                                                )}
                                                            </div>
                                                            {expandedFindingKey === findingKey && finding.recommendation && (
                                                                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                                                                    {t('widgets.system_health.recommendation_prefix')} {finding.recommendation}
                                                                </div>
                                                            )}
                                                        </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                        {databaseSubTab === 'stats' && (
                                            <div className="divide-y divide-slate-100 dark:divide-slate-800 flex-1 min-h-0 overflow-auto">
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
                                        )}
                                    </div>

                                    <div className="flex justify-end pt-2">
                                        <button
                                            onClick={() => {
                                                refreshDiag();
                                                refreshHealth();
                                            }}
                                            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold transition-colors"
                                        >
                                            <RotateCw className="w-3.5 h-3.5" />
                                            {t('widgets.system_health.refresh_diag')}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center py-12 text-red-400">
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
