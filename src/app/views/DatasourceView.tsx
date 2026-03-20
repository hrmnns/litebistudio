import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Database, Upload, Table as TableIcon, Plus, Trash2, RefreshCw, AlertTriangle, Loader2, ListPlus, FileText, Columns3, ChevronDown, Link2, Check, Pencil, Search } from 'lucide-react';
import { ExcelImport, type ImportConfig } from '../components/ExcelImport';
import { SmartImport } from '../components/SmartImport';
import type { SchemaDefinition } from '../components/SchemaDocumentation';
import { InlineAlert } from '../components/ui/InlineAlert';
import type { AlertType } from '../components/ui/InlineAlert';
import { Modal } from '../components/Modal';
import { CreateTableModal } from '../components/CreateTableModal';
import { PageLayout } from '../components/ui/PageLayout';
import { MappingManager } from '../components/MappingManager';
import { useBackupStatus } from '../../hooks/useBackupStatus';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { useAsync } from '../../hooks/useAsync';
import { encryptBuffer, decryptBuffer } from '../../lib/utils/crypto';
import { Lock, Unlock } from 'lucide-react';
import { useDashboard } from '../../lib/context/DashboardContext';
import type {
    BackupHistoryEntry,
    LiteBiSchemaExportPackage,
    SchemaImportConflictResolution,
    SchemaImportAnalysisResult,
    SchemaImportMergeSummary,
    TableIndexInfo,
    SchemaTableDocRecord,
    SchemaColumnDocRecord,
    SchemaRelationshipDocRecord,
    SchemaRelationshipCheckSummary,
    SchemaValidationSummary,
    SchemaCleanupSummary
} from '../../lib/repositories/SystemRepository';
import { createLogger } from '../../lib/logger';
import { appDialog } from '../../lib/appDialog';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { clearSavedBackupDirectory, getSavedBackupDirectoryLabel, isBackupDirectorySupported, pickBackupFileFromRememberedDirectoryWithStatus, saveBackupToRememberedDirectory } from '../../lib/utils/backupLocation';
import { useLocation, useNavigate } from 'react-router-dom';
import { importDatabase, exportDatabase, factoryResetDatabase } from '../../lib/db';
import { isValidIdentifier } from '../../lib/utils';
import { clearAllPageStates, getPageState, setPageState } from '../../lib/state/pageStateStore';
import { usePageFooterStatus } from '../hooks/usePageFooterStatus';
import { RightOverlayPanel } from '../components/ui/RightOverlayPanel';

interface DatasourceViewProps {
    onImportComplete: () => void;
}

interface RestoreReport {
    headerMatch: boolean;
    isValid: boolean;
    error?: string;
    isDowngrade?: boolean;
    missingTables: string[];
    missingColumns: Record<string, string[]>;
    versionInfo?: {
        backup: string | number;
        current: string | number;
    };
}

interface TableMetaStats {
    rows: number;
    indexes: number;
}

interface DatasourcePageState {
    activeTab: 'import' | 'structure' | 'system' | 'danger';
    selectedTable: string;
    visibleUserTablesCount: number;
    visibleUserViewsCount: number;
    structureSchemaFilter: StructureSchemaFilter;
}

interface ViewMetaStatus {
    valid: boolean;
    rows?: number;
    error?: string;
}

interface TableSchemaColumn {
    name: string;
    type: string;
    notnull: boolean;
}

interface ColumnDocDraft {
    display_name: string;
    description: string;
    semantic_type: string;
}

type StructureSchemaFilter = 'all' | 'issues' | 'review' | 'undocumented';

function getSchemaStatusMeta(status: string, t: (key: string, fallback?: string) => string): { label: string; className: string; iconOnly?: boolean; tooltip: string } {
    switch (status) {
        case 'missing_table':
            return {
                label: t('datasource.schema_status_missing_table', 'Tabelle fehlt'),
                className: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/40',
                tooltip: t('datasource.schema_status_missing_table', 'Tabelle fehlt')
            };
        case 'missing_column':
            return {
                label: t('datasource.schema_status_missing_column', 'Spalte fehlt'),
                className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/40',
                tooltip: t('datasource.schema_status_missing_column', 'Spalte fehlt')
            };
        case 'needs_review':
            return {
                label: t('datasource.schema_status_needs_review', 'Prüfen'),
                className: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-300 dark:border-yellow-900/40',
                tooltip: t('datasource.schema_status_needs_review', 'Prüfen')
            };
        case 'archived':
            return {
                label: t('datasource.schema_status_archived', 'Archiviert'),
                className: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-900/50 dark:text-slate-300 dark:border-slate-700',
                tooltip: t('datasource.schema_status_archived', 'Archiviert')
            };
        default:
            return {
                label: t('datasource.schema_status_valid', 'Gültig'),
                className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/40',
                iconOnly: true,
                tooltip: t('datasource.schema_status_valid_tooltip', 'Die Schema-Dokumentation passt zum aktuellen Schema.')
            };
    }
}

const SYSTEM_TABLE_METADATA: Record<string, {
    titleKey: string;
    titleFallback: string;
    descriptionKey: string;
    descriptionFallback: string;
}> = {
    sys_settings: {
        titleKey: 'datasource.system_table.sys_settings.title',
        titleFallback: 'Application settings',
        descriptionKey: 'datasource.system_table.sys_settings.description',
        descriptionFallback: 'Stores application-wide settings and local preferences.'
    },
    sys_user_widgets: {
        titleKey: 'datasource.system_table.sys_user_widgets.title',
        titleFallback: 'Widgets',
        descriptionKey: 'datasource.system_table.sys_user_widgets.description',
        descriptionFallback: 'Stores saved widget definitions, visualization settings and SQL links.'
    },
    sys_worklist: {
        titleKey: 'datasource.system_table.sys_worklist.title',
        titleFallback: 'Worklist',
        descriptionKey: 'datasource.system_table.sys_worklist.description',
        descriptionFallback: 'Stores follow-up tasks, review items and workflow states.'
    },
    sys_migrations: {
        titleKey: 'datasource.system_table.sys_migrations.title',
        titleFallback: 'Migrations',
        descriptionKey: 'datasource.system_table.sys_migrations.description',
        descriptionFallback: 'Tracks applied database migrations and schema upgrades.'
    },
    sys_dashboards: {
        titleKey: 'datasource.system_table.sys_dashboards.title',
        titleFallback: 'Dashboards',
        descriptionKey: 'datasource.system_table.sys_dashboards.description',
        descriptionFallback: 'Stores saved dashboards and their layouts.'
    },
    sys_report_packs: {
        titleKey: 'datasource.system_table.sys_report_packs.title',
        titleFallback: 'Report packages',
        descriptionKey: 'datasource.system_table.sys_report_packs.description',
        descriptionFallback: 'Stores report pack definitions, categories and export settings.'
    },
    sys_sql_statement: {
        titleKey: 'datasource.system_table.sys_sql_statement.title',
        titleFallback: 'SQL statements',
        descriptionKey: 'datasource.system_table.sys_sql_statement.description',
        descriptionFallback: 'Stores reusable SQL statements, descriptions and usage metadata.'
    },
    sys_health_snapshot: {
        titleKey: 'datasource.system_table.sys_health_snapshot.title',
        titleFallback: 'Health snapshots',
        descriptionKey: 'datasource.system_table.sys_health_snapshot.description',
        descriptionFallback: 'Stores persisted system health snapshots for diagnostics and reporting.'
    },
    sys_schema_table_docs: {
        titleKey: 'datasource.system_table.sys_schema_table_docs.title',
        titleFallback: 'Table documentation',
        descriptionKey: 'datasource.system_table.sys_schema_table_docs.description',
        descriptionFallback: 'Stores semantic table descriptions and display names.'
    },
    sys_schema_column_docs: {
        titleKey: 'datasource.system_table.sys_schema_column_docs.title',
        titleFallback: 'Column documentation',
        descriptionKey: 'datasource.system_table.sys_schema_column_docs.description',
        descriptionFallback: 'Stores semantic column descriptions, aliases and types.'
    },
    sys_schema_relationship_docs: {
        titleKey: 'datasource.system_table.sys_schema_relationship_docs.title',
        titleFallback: 'Relationship documentation',
        descriptionKey: 'datasource.system_table.sys_schema_relationship_docs.description',
        descriptionFallback: 'Stores manually maintained semantic relationships between tables and columns.'
    }
};

const logger = createLogger('DatasourceView');
const STRUCTURE_META_BATCH_SIZE = 24;
const DATASOURCE_PAGE_STATE_ID = 'datasource_view';
const DATASOURCE_PAGE_STATE_VERSION = 1;

const FACTORY_RESET_LOCALSTORAGE_PREFIXES = [
    'litebistudio_',
    'tables_',
    'widgets_',
    'data_table_',
    'ui_table_',
    'notifications_',
    'import_',
    'backup_',
    'health_',
    'reports_',
    'worklist_',
    'sql_editor_',
    'ui_sidebar_'
];

const FACTORY_RESET_LOCALSTORAGE_KEYS = new Set([
    'app_log_level',
    'custom_dashboard_layout',
    'excel_mappings_v2',
    'i18nextLng',
    'visibleComponentIds',
    'visibleSidebarComponentIds',
    'componentOrder',
    'isSidebarCollapsed',
    'theme',
    'ui_light_theme_variant'
]);

const FACTORY_RESET_SESSIONSTORAGE_PREFIXES = [
    'litebistudio_',
    'tables_',
    'widgets_'
];

const pad2 = (value: number): string => String(value).padStart(2, '0');

const buildBackupFileName = (pattern: string, secure: boolean): string => {
    const now = new Date();
    const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
    const dateTime = `${date}_${time}`;
    const mode = secure ? 'secure' : 'standard';
    const basePattern = (pattern || 'backup_{date}_{mode}').trim();
    const withTokens = basePattern
        .replace(/\{date\}/gi, date)
        .replace(/\{time\}/gi, time)
        .replace(/\{datetime\}/gi, dateTime)
        .replace(/\{mode\}/gi, mode);
    const withoutReserved = withTokens.replace(/[<>:"/\\|?*]/g, '_');
    const withoutControlChars = Array.from(withoutReserved)
        .map((ch) => (ch.charCodeAt(0) < 32 ? '_' : ch))
        .join('');
    const sanitized = withoutControlChars.trim() || `backup_${date}_${mode}`;
    return sanitized.toLowerCase().endsWith('.sqlite3') ? sanitized : `${sanitized}.sqlite3`;
};

const isWeakBackupPassword = (password: string): boolean => {
    const trimmed = password.trim();
    if (trimmed.length < 8) return true;
    const hasLower = /[a-z]/.test(trimmed);
    const hasUpper = /[A-Z]/.test(trimmed);
    const hasDigit = /\d/.test(trimmed);
    const hasSymbol = /[^A-Za-z0-9]/.test(trimmed);
    const score = Number(hasLower) + Number(hasUpper) + Number(hasDigit) + Number(hasSymbol);
    return score < 3;
};

const resetEnvironmentSettings = async (): Promise<void> => {
    try {
        const localKeys = Object.keys(window.localStorage);
        for (const key of localKeys) {
            if (
                FACTORY_RESET_LOCALSTORAGE_KEYS.has(key) ||
                FACTORY_RESET_LOCALSTORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
            ) {
                window.localStorage.removeItem(key);
            }
        }
    } catch (error) {
        logger.warn('Failed to clear localStorage during factory reset cleanup', error);
    }

    try {
        const sessionKeys = Object.keys(window.sessionStorage);
        for (const key of sessionKeys) {
            if (FACTORY_RESET_SESSIONSTORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
                window.sessionStorage.removeItem(key);
            }
        }
    } catch (error) {
        logger.warn('Failed to clear sessionStorage during factory reset cleanup', error);
    }

    clearAllPageStates();

    try {
        await clearSavedBackupDirectory();
    } catch (error) {
        logger.warn('Failed to clear remembered backup directory during factory reset cleanup', error);
    }
};

const shouldConfirmDestructiveActions = (): boolean => {
    try {
        return localStorage.getItem('notifications_confirm_destructive') !== 'false';
    } catch {
        return true;
    }
};

export const DatasourceView: React.FC<DatasourceViewProps> = ({ onImportComplete }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const initialPageState = React.useMemo(
        () => getPageState<DatasourcePageState>(DATASOURCE_PAGE_STATE_ID, { scope: 'memory', version: DATASOURCE_PAGE_STATE_VERSION }),
        []
    );
    const footerText = usePageFooterStatus();
    const { isReadOnly, isAdminMode } = useDashboard();
    const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

    // Tab State
    const initialTabFromNavigation = (location.state as { initialTab?: string } | null)?.initialTab;
    const initialTabFromQuery = React.useMemo(() => {
        const tab = new URLSearchParams(location.search).get('tab');
        if (tab === 'import' || tab === 'structure' || tab === 'system' || tab === 'danger') {
            return tab;
        }
        return null;
    }, [location.search]);
    const [activeTab, setActiveTab] = useState<'import' | 'structure' | 'system' | 'danger'>(
        initialTabFromNavigation === 'import'
            || initialTabFromNavigation === 'structure'
            || initialTabFromNavigation === 'system'
            || initialTabFromNavigation === 'danger'
            ? initialTabFromNavigation
            : (initialTabFromQuery ?? initialPageState?.activeTab ?? 'import')
    );
    const [visibleUserTablesCount, setVisibleUserTablesCount] = useState(initialPageState?.visibleUserTablesCount ?? STRUCTURE_META_BATCH_SIZE);
    const [visibleUserViewsCount, setVisibleUserViewsCount] = useState(initialPageState?.visibleUserViewsCount ?? STRUCTURE_META_BATCH_SIZE);
    const [structureSchemaFilter, setStructureSchemaFilter] = useState<StructureSchemaFilter>(initialPageState?.structureSchemaFilter ?? 'all');

    // Import State
    const [selectedTable, setSelectedTable] = useState<string>(initialPageState?.selectedTable ?? '');
    const [tableSchema, setTableSchema] = useState<SchemaDefinition | null>(null);
    const [selectedTableSchema, setSelectedTableSchema] = useState<TableSchemaColumn[]>([]);
    const [isSchemaDocsOpen, setIsSchemaDocsOpen] = useState(false);
    const [isSchemaToolsOpen, setIsSchemaToolsOpen] = useState(false);
    const [schemaDocSections, setSchemaDocSections] = useState({
        tableDetails: true,
        columns: true,
        relationships: false
    });
    const [tableDocDraft, setTableDocDraft] = useState({ display_name: '', description: '' });
    const [columnDocDrafts, setColumnDocDrafts] = useState<Record<string, ColumnDocDraft>>({});
    const [isSavingSchemaDocs, setIsSavingSchemaDocs] = useState(false);
    const [schemaDocDraftReady, setSchemaDocDraftReady] = useState(false);
    const [schemaDocSaveState, setSchemaDocSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
    const [isValidatingSchemaDocs, setIsValidatingSchemaDocs] = useState(false);
    const [schemaValidationSummary, setSchemaValidationSummary] = useState<SchemaValidationSummary | null>(null);
    const [schemaCleanupSummary, setSchemaCleanupSummary] = useState<SchemaCleanupSummary | null>(null);
    const [isCleaningSchemaDocs, setIsCleaningSchemaDocs] = useState(false);
    const [isCheckingRelationshipId, setIsCheckingRelationshipId] = useState('');
    const [relationshipCheckResults, setRelationshipCheckResults] = useState<Record<string, SchemaRelationshipCheckSummary>>({});
    const [editingRelationshipId, setEditingRelationshipId] = useState('');
    const [relationshipDraft, setRelationshipDraft] = useState({
        source_column: '',
        target_table: '',
        target_column: '',
        relationship_kind: 'n:1',
        join_type: 'LEFT JOIN',
        display_name: '',
        description: ''
    });
    const [isSavingRelationship, setIsSavingRelationship] = useState(false);
    const [isExportingSchemaPackage, setIsExportingSchemaPackage] = useState(false);
    const [isAnalyzingSchemaImport, setIsAnalyzingSchemaImport] = useState(false);
    const [schemaImportAnalysis, setSchemaImportAnalysis] = useState<SchemaImportAnalysisResult | null>(null);
    const [pendingSchemaImportPackage, setPendingSchemaImportPackage] = useState<LiteBiSchemaExportPackage | null>(null);
    const [schemaImportConflictResolutions, setSchemaImportConflictResolutions] = useState<Record<string, SchemaImportConflictResolution>>({});
    const [schemaImportConflictDraftResolutions, setSchemaImportConflictDraftResolutions] = useState<Record<string, SchemaImportConflictResolution>>({});
    const [isMergingSchemaImport, setIsMergingSchemaImport] = useState(false);
    const [schemaImportMergeProgress, setSchemaImportMergeProgress] = useState(0);
    const [schemaImportMergeProgressLabel, setSchemaImportMergeProgressLabel] = useState('');
    const [schemaImportMergeSummary, setSchemaImportMergeSummary] = useState<SchemaImportMergeSummary | null>(null);
    const [isSchemaImportConflictDialogOpen, setIsSchemaImportConflictDialogOpen] = useState(false);
    const [isCreateIndexOpen, setIsCreateIndexOpen] = useState(false);
    const [indexTableName, setIndexTableName] = useState('');
    const [indexName, setIndexName] = useState('');
    const [indexColumns, setIndexColumns] = useState<string[]>([]);
    const [indexUnique, setIndexUnique] = useState(false);
    const [indexWhere, setIndexWhere] = useState('');
    const [availableIndexColumns, setAvailableIndexColumns] = useState<string[]>([]);

    // Schema Manager State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newTableName, setNewTableName] = useState('');
    const [createColumns, setCreateColumns] = useState<{ name: string, type: string }[]>([{ name: 'id', type: 'INTEGER PRIMARY KEY' }]);

    const { isBackupRecommended, changeCount, markBackupComplete } = useBackupStatus();

    // Backup State
    const [useEncryption, setUseEncryption] = useState(false);
    const [backupPassword, setBackupPassword] = useState('');
    const [restoreAlert, setRestoreAlert] = useState<{ type: AlertType; message: string; title?: string; details?: string } | null>(null);
    const [isResetting, setIsResetting] = useState(false);
    const [isResettingSqlManager, setIsResettingSqlManager] = useState(false);
    const [backupNamePattern] = useLocalStorage<string>('backup_file_name_pattern', 'backup_{date}_{mode}');
    const [backupUseSavedLocation] = useLocalStorage<boolean>('backup_use_saved_location', true);
    const [schemaDocsAutosave] = useLocalStorage<boolean>('schema_docs_autosave', true);
    const [schemaDocsIncludeViews] = useLocalStorage<boolean>('schema_docs_include_views', true);
    const [schemaDocsPreferTechnicalNames] = useLocalStorage<boolean>('schema_docs_prefer_technical_names', true);
    const [schemaDocsHighlightUndocumented] = useLocalStorage<boolean>('schema_docs_highlight_undocumented', true);
    const [schemaDocsShowSystemDescriptions] = useLocalStorage<boolean>('schema_docs_show_system_descriptions', true);
    const [schemaDocsShowImportDifferences] = useLocalStorage<boolean>('schema_docs_show_import_differences', false);
    const restoreInputRef = useRef<HTMLInputElement | null>(null);
    const backupDirectorySupported = isBackupDirectorySupported();
    const schemaDocLastSavedSnapshotRef = useRef('');
    const schemaDocSavedStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const schemaImportInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        setPageState<DatasourcePageState>(DATASOURCE_PAGE_STATE_ID, {
            activeTab,
            selectedTable,
            visibleUserTablesCount,
            visibleUserViewsCount,
            structureSchemaFilter
        }, { scope: 'memory', version: DATASOURCE_PAGE_STATE_VERSION });
    }, [activeTab, selectedTable, visibleUserTablesCount, visibleUserViewsCount, structureSchemaFilter]);

    useEffect(() => {
        if (!initialTabFromQuery) return;
        setActiveTab(initialTabFromQuery);
    }, [initialTabFromQuery]);

    const { data: backupHistory, refresh: refreshBackupHistory } = useAsync<BackupHistoryEntry[]>(
        () => SystemRepository.listBackupHistory(12),
        []
    );
    const backupHistoryEntries = Array.isArray(backupHistory) ? backupHistory : [];

    const appendBackupHistorySafe = async (entry: {
        action: 'backup' | 'restore';
        status: 'success' | 'warning' | 'error';
        fileName: string;
        locationType?: 'remembered_folder' | 'browser_download' | 'file_picker' | 'unknown';
        locationLabel?: string;
        encrypted?: boolean;
        message?: string;
    }) => {
        try {
            await SystemRepository.appendBackupHistory(entry);
            await refreshBackupHistory();
        } catch (err) {
            logger.warn('Failed to append backup history entry', err);
        }
    };

    const processRestoreFile = async (
        file: File,
        source: { type: 'remembered_folder' | 'file_picker'; label?: string } = { type: 'file_picker' }
    ): Promise<void> => {
        const logTime = () => new Date().toLocaleTimeString();
        logger.debug(`[Restore][${logTime()}] File selected:`, file.name, file.size, file.type);

        try {
            logger.debug(`[Restore][${logTime()}] Calling file.arrayBuffer()...`);
            const buffer = await file.arrayBuffer();
            logger.debug(`[Restore][${logTime()}] Buffer received, size:`, buffer.byteLength);

            const header = new Uint8Array(buffer.slice(0, 16));
            const headerString = new TextDecoder().decode(header);
            const isSqlite = headerString.startsWith('SQLite format 3');
            logger.debug('[Restore] Header check - isSqlite:', isSqlite);

            let finalBuffer = buffer;

            if (!isSqlite) {
                const pwd = await appDialog.prompt(t('datasource.restore_encrypted_prompt'));
                if (!pwd) return;

                try {
                    const decrypted = await decryptBuffer(buffer, pwd);
                    finalBuffer = decrypted;
                } catch {
                    await appendBackupHistorySafe({
                        action: 'restore',
                        status: 'error',
                        fileName: file.name,
                        locationType: source.type,
                        locationLabel: source.label || '',
                        message: t('datasource.restore_failed')
                    });
                    setRestoreAlert({
                        type: 'error',
                        title: t('common.error'),
                        message: t('datasource.restore_failed')
                    });
                    return;
                }
            }

            if (!(await appDialog.confirm(t('datasource.restore_confirm')))) {
                await appendBackupHistorySafe({
                    action: 'restore',
                    status: 'warning',
                    fileName: file.name,
                    locationType: source.type,
                    locationLabel: source.label || '',
                    message: 'Restore cancelled by user.'
                });
                return;
            }
            logger.info(`[Restore][${logTime()}] User confirmed restore. Starting process...`);
            setRestoreAlert({
                type: 'warning',
                title: t('common.loading'),
                message: 'Verarbeite Backup-Datei...'
            });

            try {
                logger.debug(`[Restore][${logTime()}] Calling worker importDatabase...`);
                const report = await importDatabase(finalBuffer) as unknown as RestoreReport;
                logger.debug(`[Restore][${logTime()}] Worker report received:`, report);
                const { versionInfo } = report;

                if (!report.headerMatch) {
                    await appendBackupHistorySafe({
                        action: 'restore',
                        status: 'error',
                        fileName: file.name,
                        locationType: source.type,
                        locationLabel: source.label || '',
                        message: report.error || t('datasource.restore_warning_hint')
                    });
                    setRestoreAlert({
                        type: 'error',
                        title: t('datasource.restore_invalid'),
                        message: report.error || t('datasource.restore_warning_hint')
                    });
                    return;
                }

                if (report.error) {
                    await appendBackupHistorySafe({
                        action: 'restore',
                        status: 'error',
                        fileName: file.name,
                        locationType: source.type,
                        locationLabel: source.label || '',
                        message: report.error
                    });
                    setRestoreAlert({
                        type: 'error',
                        title: report.isDowngrade ? 'Incompatible Backup' : t('common.error'),
                        message: report.error,
                        details: versionInfo ? `Backup Version: V${versionInfo.backup} | App Version: V${versionInfo.current}` : undefined
                    });
                    return;
                }

                if (!report.isValid) {
                    let details = '';
                    if (versionInfo) {
                        details += `Schema: V${versionInfo.backup} -> V${versionInfo.current} (Update required)\n\n`;
                    }
                    if (report.missingTables.length > 0) {
                        details += t('datasource.restore_missing_tables') + '\n- ' + report.missingTables.join('\n- ') + '\n\n';
                    }

                    if (Object.keys(report.missingColumns).length > 0) {
                        details += t('datasource.restore_missing_columns') + '\n';
                        for (const [tbl, cols] of Object.entries(report.missingColumns)) {
                            details += `- ${tbl}: ${(cols as string[]).join(', ')}\n`;
                        }
                    }

                    await appendBackupHistorySafe({
                        action: 'restore',
                        status: 'warning',
                        fileName: file.name,
                        locationType: source.type,
                        locationLabel: source.label || '',
                        message: t('datasource.restore_warning_hint')
                    });
                    setRestoreAlert({
                        type: 'warning',
                        title: t('datasource.restore_warning_title'),
                        message: t('datasource.restore_warning_hint'),
                        details
                    });
                } else {
                    await appendBackupHistorySafe({
                        action: 'restore',
                        status: 'success',
                        fileName: file.name,
                        locationType: source.type,
                        locationLabel: source.label || '',
                        encrypted: !isSqlite,
                        message: t('datasource.restore_success_reload')
                    });
                    setRestoreAlert({
                        type: 'success',
                        title: t('common.success'),
                        message: t('datasource.restore_success_reload'),
                        details: versionInfo ? `Database Version: V${versionInfo.backup} (Upgraded to V${versionInfo.current})` : undefined
                    });
                    logger.info(`[Restore][${logTime()}] Success! Reloading in 2s...`);
                    markBackupComplete();
                    setTimeout(() => window.location.reload(), 2000);
                }
            } catch (err: unknown) {
                await appendBackupHistorySafe({
                    action: 'restore',
                    status: 'error',
                    fileName: file.name,
                    locationType: source.type,
                    locationLabel: source.label || '',
                    message: getErrorMessage(err)
                });
                logger.error(`[Restore][${logTime()}] Inner Error:`, err);
                setRestoreAlert({
                    type: 'error',
                    title: t('common.error'),
                    message: getErrorMessage(err)
                });
            }
        } catch (err: unknown) {
            await appendBackupHistorySafe({
                action: 'restore',
                status: 'error',
                fileName: file.name,
                locationType: source.type,
                locationLabel: source.label || '',
                message: getErrorMessage(err)
            });
            logger.error(`[Restore][${logTime()}] Outer Error:`, err);
            setRestoreAlert({
                type: 'error',
                title: t('common.error'),
                message: getErrorMessage(err)
            });
        }
    };

    const handleStartRestore = async (): Promise<void> => {
        setRestoreAlert(null);
        if (backupUseSavedLocation && backupDirectorySupported) {
            const picked = await pickBackupFileFromRememberedDirectoryWithStatus();
            if (picked.cancelled) return;
            if (picked.file) {
                await processRestoreFile(picked.file, {
                    type: 'remembered_folder',
                    label: getSavedBackupDirectoryLabel()
                });
                return;
            }
            if (restoreInputRef.current) restoreInputRef.current.click();
            return;
        }
        if (restoreInputRef.current) restoreInputRef.current.click();
    };

    // Fetch Tables
    const { data: tables, refresh: refreshTables } = useAsync<string[]>(
        () => SystemRepository.getTables(),
        []
    );
    const { data: dataSources, refresh: refreshDataSources } = useAsync<Array<{ name: string; type: 'table' | 'view' }>>(
        () => SystemRepository.getDataSources(),
        []
    );
    const { data: schemaTableDocs, refresh: refreshSchemaTableDocs } = useAsync<SchemaTableDocRecord[]>(
        async () => {
            if (activeTab !== 'structure') return [];
            return await SystemRepository.listSchemaTableDocs();
        },
        [activeTab],
        { cacheKey: activeTab === 'structure' ? 'datasource-schema-table-docs' : undefined }
    );
    const { data: schemaColumnDocs } = useAsync<SchemaColumnDocRecord[]>(
        async () => {
            if (activeTab !== 'structure') return [];
            return await SystemRepository.listSchemaColumnDocs();
        },
        [activeTab],
        { cacheKey: activeTab === 'structure' ? 'datasource-schema-column-docs' : undefined }
    );
    const { data: schemaRelationshipDocs } = useAsync<SchemaRelationshipDocRecord[]>(
        async () => {
            if (activeTab !== 'structure') return [];
            return await SystemRepository.listSchemaRelationshipDocs();
        },
        [activeTab],
        { cacheKey: activeTab === 'structure' ? 'datasource-schema-relationship-docs' : undefined }
    );

    // Filter Tables
    const isSystemTable = (name: string) => name.startsWith('sys_') || name === 'sqlite_sequence';
    const isSystemView = (name: string) => name.startsWith('sys_');
    const userTables = tables?.filter((t: string) => !isSystemTable(t)) || [];
    const systemTables = tables?.filter((t: string) => isSystemTable(t)) || [];
    const userViews = schemaDocsIncludeViews
        ? (dataSources || []).filter((s) => s.type === 'view' && !isSystemView(s.name))
        : [];
    const getSchemaDocKey = React.useCallback((name: string, objectType: 'table' | 'view') => `${objectType}:${name}`, []);
    const schemaTableDocByKey = React.useMemo(
        () => Object.fromEntries((schemaTableDocs || []).map((entry) => [getSchemaDocKey(entry.table_name, entry.object_type), entry] as const)),
        [getSchemaDocKey, schemaTableDocs]
    );
    const schemaColumnDocsByKey = React.useMemo(
        () => (schemaColumnDocs || []).reduce<Record<string, SchemaColumnDocRecord[]>>((acc, entry) => {
            const key = getSchemaDocKey(entry.table_name, entry.object_type);
            if (!acc[key]) acc[key] = [];
            acc[key].push(entry);
            return acc;
        }, {}),
        [getSchemaDocKey, schemaColumnDocs]
    );
    const schemaRelationshipDocsBySource = React.useMemo(
        () => (schemaRelationshipDocs || []).reduce<Record<string, SchemaRelationshipDocRecord[]>>((acc, entry) => {
            if (!acc[entry.source_table]) acc[entry.source_table] = [];
            acc[entry.source_table].push(entry);
            return acc;
        }, {}),
        [schemaRelationshipDocs]
    );
    const getStructureDocumentationState = React.useCallback((name: string, objectType: 'table' | 'view') => {
        const objectKey = getSchemaDocKey(name, objectType);
        const tableDoc = schemaTableDocByKey[objectKey];
        const columnDocsForObject = schemaColumnDocsByKey[objectKey] || [];
        const relationshipDocsForObject = schemaRelationshipDocsBySource[name] || [];
        const hasIssueStatus = [tableDoc, ...columnDocsForObject, ...relationshipDocsForObject].some(
            (entry) => Boolean(entry) && (entry.status || 'valid') !== 'valid'
        );
        const needsReview = [tableDoc, ...columnDocsForObject, ...relationshipDocsForObject].some(
            (entry) => Boolean(entry) && (entry.status || 'valid') === 'needs_review'
        );
        const hasTableDocumentation = Boolean(tableDoc?.display_name?.trim() || tableDoc?.description?.trim());
        const hasColumnDocumentation = columnDocsForObject.some((entry) => Boolean(
            entry.display_name?.trim()
            || entry.description?.trim()
            || entry.semantic_type?.trim()
        ));
        const hasRelationshipDocumentation = relationshipDocsForObject.length > 0;
        return {
            hasIssues: hasIssueStatus,
            needsReview,
            undocumented: !hasTableDocumentation && !hasColumnDocumentation && !hasRelationshipDocumentation
        };
    }, [getSchemaDocKey, schemaColumnDocsByKey, schemaRelationshipDocsBySource, schemaTableDocByKey]);
    const structureObjectMatchesFilter = React.useCallback((name: string, objectType: 'table' | 'view') => {
        const state = getStructureDocumentationState(name, objectType);
        switch (structureSchemaFilter) {
            case 'issues':
                return state.hasIssues;
            case 'review':
                return state.needsReview;
            case 'undocumented':
                return state.undocumented;
            default:
                return true;
        }
    }, [getStructureDocumentationState, structureSchemaFilter]);
    const filteredUserTables = React.useMemo(
        () => userTables.filter((name) => structureObjectMatchesFilter(name, 'table')),
        [structureObjectMatchesFilter, userTables]
    );
    const filteredUserViews = React.useMemo(
        () => userViews.filter((view) => structureObjectMatchesFilter(view.name, 'view')),
        [structureObjectMatchesFilter, userViews]
    );
    const selectedObjectType = React.useMemo<'table' | 'view'>(() => {
        if (!selectedTable) return 'table';
        const matchingSource = (dataSources || []).find((source) => source.name === selectedTable);
        return matchingSource?.type === 'view' ? 'view' : 'table';
    }, [dataSources, selectedTable]);
    useEffect(() => {
        if (activeTab !== 'structure') return;
        setVisibleUserTablesCount(Math.min(STRUCTURE_META_BATCH_SIZE, filteredUserTables.length));
    }, [activeTab, filteredUserTables.length, structureSchemaFilter]);
    useEffect(() => {
        if (activeTab !== 'structure') return;
        setVisibleUserViewsCount(Math.min(STRUCTURE_META_BATCH_SIZE, filteredUserViews.length));
    }, [activeTab, filteredUserViews.length, structureSchemaFilter]);
    const visibleUserTables = filteredUserTables.slice(0, visibleUserTablesCount);
    const visibleUserViews = filteredUserViews.slice(0, visibleUserViewsCount);
    useEffect(() => {
        if (!schemaDocsIncludeViews && selectedObjectType === 'view') {
            setSelectedTable('');
            setIsSchemaDocsOpen(false);
        }
    }, [schemaDocsIncludeViews, selectedObjectType]);
    const relationshipTargetSources = React.useMemo(
        () => (dataSources || []).filter((source) => source.name !== selectedTable),
        [dataSources, selectedTable]
    );
    const getSystemTableMeta = React.useCallback((tableName: string) => {
        const meta = SYSTEM_TABLE_METADATA[tableName];
        if (!meta) return null;
        return {
            displayName: t(meta.titleKey, meta.titleFallback),
            description: t(meta.descriptionKey, meta.descriptionFallback)
        };
    }, [t]);
    const isSelectedSystemTable = Boolean(selectedTable) && isSystemTable(selectedTable);
    const selectedSystemTableMeta = selectedTable ? getSystemTableMeta(selectedTable) : null;
    const { data: tableMetaStats } = useAsync<Record<string, TableMetaStats>>(
        async () => {
            if (activeTab !== 'structure' || visibleUserTables.length === 0) return {};
            const entries = await Promise.all(visibleUserTables.map(async (tableName) => {
                const [rowsResult, indexResult] = await Promise.all([
                    SystemRepository.executeRaw(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)}`),
                    SystemRepository.executeRaw(
                        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND LOWER(tbl_name) = LOWER(?) AND name NOT LIKE 'sqlite_%'",
                        [tableName]
                    )
                ]);
                return [
                    tableName,
                    {
                        rows: Number(rowsResult[0]?.count || 0),
                        indexes: Number(indexResult[0]?.count || 0)
                    } as TableMetaStats
                ] as const;
            }));
            return Object.fromEntries(entries);
        },
        [activeTab, visibleUserTables.join('|')],
        { cacheKey: `datasource-table-meta-${visibleUserTables.join('|')}`, ttl: 15000 }
    );
    const { data: viewMetaStats } = useAsync<Record<string, ViewMetaStatus>>(
        async () => {
            if (activeTab !== 'structure' || visibleUserViews.length === 0) return {};
            const entries = await Promise.all(visibleUserViews.map(async (view) => {
                try {
                    const rowsResult = await SystemRepository.executeRaw(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(view.name)}`);
                    return [
                        view.name,
                        {
                            valid: true,
                            rows: Number(rowsResult[0]?.count || 0)
                        } as ViewMetaStatus
                    ] as const;
                } catch (error: unknown) {
                    return [
                        view.name,
                        {
                            valid: false,
                            error: getErrorMessage(error)
                        } as ViewMetaStatus
                    ] as const;
                }
            }));
            return Object.fromEntries(entries);
        },
        [activeTab, visibleUserViews.map(v => v.name).join('|')],
        { cacheKey: `datasource-view-meta-${visibleUserViews.map(v => v.name).join('|')}`, ttl: 15000 }
    );

    // Load Schema for selected table (Generic Import)
    useEffect(() => {
        const loadSchema = async () => {
            if (!selectedTable) {
                setTableSchema(null);
                setSelectedTableSchema([]);
                return;
            }

            // Dynamic Schema
            try {
                const [columns, indexes] = await Promise.all([
                    SystemRepository.getTableSchema(selectedTable),
                    SystemRepository.getTableIndexes(selectedTable)
                ]);
                const properties: NonNullable<SchemaDefinition['properties']> = {};
                columns.forEach(col => {
                    properties[col.name] = {
                        type: col.type.toUpperCase().includes('INT') || col.type.toUpperCase().includes('REAL') ? 'number' : 'string',
                        description: col.type
                    };
                });
                setSelectedTableSchema(columns.map((col) => ({
                    name: col.name,
                    type: col.type,
                    notnull: !!col.notnull
                })));
                setTableSchema({
                    title: selectedTable,
                    description: t('datasource.records_label', { name: selectedTable }),
                    properties,
                    required: columns.filter(c => c.notnull).map(c => c.name),
                    indexes: indexes.map((idx: TableIndexInfo) => ({
                        name: idx.name,
                        unique: idx.unique,
                        columns: idx.columns,
                        origin: idx.origin,
                        partial: idx.partial
                    }))
                });
            } catch (e) {
                logger.error('Failed to load schema', e);
                setTableSchema(null);
                setSelectedTableSchema([]);
            }
        };
        loadSchema();
    }, [selectedTable, tables, t]);

    const { data: selectedTableDoc, refresh: refreshSelectedTableDoc } = useAsync<SchemaTableDocRecord | null>(
        async () => {
            if (!selectedTable) return null;
            return await SystemRepository.getSchemaTableDoc(selectedTable, selectedObjectType);
        },
        [selectedObjectType, selectedTable],
        { cacheKey: selectedTable ? `schema-table-doc:${selectedObjectType}:${selectedTable}` : undefined }
    );
    const { data: selectedColumnDocs, refresh: refreshSelectedColumnDocs } = useAsync<SchemaColumnDocRecord[]>(
        async () => {
            if (!selectedTable) return [];
            return await SystemRepository.listSchemaColumnDocs(selectedTable, selectedObjectType);
        },
        [selectedObjectType, selectedTable],
        { cacheKey: selectedTable ? `schema-column-docs:${selectedObjectType}:${selectedTable}` : undefined }
    );
    const { data: selectedRelationshipDocs, refresh: refreshSelectedRelationshipDocs } = useAsync<SchemaRelationshipDocRecord[]>(
        async () => {
            if (!selectedTable) return [];
            return await SystemRepository.listSchemaRelationshipDocs(selectedTable);
        },
        [selectedTable],
        { cacheKey: selectedTable ? `schema-relationship-docs:${selectedTable}` : undefined }
    );
    const { data: relationshipTargetSchema } = useAsync<TableSchemaColumn[]>(
        async () => {
            if (!relationshipDraft.target_table) return [];
            const columns = await SystemRepository.getTableSchema(relationshipDraft.target_table);
            return columns.map((col) => ({
                name: col.name,
                type: col.type,
                notnull: !!col.notnull
            }));
        },
        [relationshipDraft.target_table],
        { cacheKey: relationshipDraft.target_table ? `schema-relationship-target:${relationshipDraft.target_table}` : undefined }
    );
    const selectedColumnDocsByName = React.useMemo(
        () => Object.fromEntries((selectedColumnDocs || []).map((entry) => [entry.column_name, entry] as const)),
        [selectedColumnDocs]
    );

    useEffect(() => {
        if (!selectedTable) {
            setTableDocDraft({ display_name: '', description: '' });
            setColumnDocDrafts({});
            setEditingRelationshipId('');
            setRelationshipDraft({
                source_column: '',
                target_table: '',
                target_column: '',
                relationship_kind: 'n:1',
                join_type: 'LEFT JOIN',
                display_name: '',
                description: ''
            });
            setSchemaDocDraftReady(false);
            setSchemaDocSaveState('idle');
            schemaDocLastSavedSnapshotRef.current = '';
            return;
        }

        const nextTableDocDraft = {
            display_name: isSystemTable(selectedTable)
                ? (getSystemTableMeta(selectedTable)?.displayName || '')
                : (selectedTableDoc?.display_name || ''),
            description: isSystemTable(selectedTable)
                ? (schemaDocsShowSystemDescriptions ? (getSystemTableMeta(selectedTable)?.description || '') : '')
                : (selectedTableDoc?.description || '')
        };
        const nextDrafts: Record<string, ColumnDocDraft> = {};
        (selectedTableSchema || []).forEach((column) => {
            const existing = (selectedColumnDocs || []).find((entry) => entry.column_name === column.name);
            nextDrafts[column.name] = {
                display_name: existing?.display_name || '',
                description: existing?.description || '',
                semantic_type: existing?.semantic_type || ''
            };
        });
        setTableDocDraft(nextTableDocDraft);
        setColumnDocDrafts(nextDrafts);
        schemaDocLastSavedSnapshotRef.current = JSON.stringify({
            table_name: selectedTable,
            object_type: selectedObjectType,
            table: nextTableDocDraft,
            columns: (selectedTableSchema || []).map((column) => ({
                name: column.name,
                display_name: nextDrafts[column.name]?.display_name || '',
                description: nextDrafts[column.name]?.description || '',
                semantic_type: nextDrafts[column.name]?.semantic_type || ''
            }))
        });
        setSchemaDocDraftReady(true);
        setSchemaDocSaveState('idle');
    }, [getSystemTableMeta, schemaDocsShowSystemDescriptions, selectedColumnDocs, selectedObjectType, selectedTableDoc, selectedTableSchema, selectedTable]);

    const quoteIdentifier = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
    const isSafeColumnType = (type: string): boolean => /^[A-Za-z0-9_ (),]+$/.test(type.trim());

    // Build Import Config
    const getImportConfig = (): ImportConfig | undefined => {
        if (!selectedTable || !tableSchema) return undefined;

        return {
            key: `import_${selectedTable}`,
            entityLabel: t('datasource.records_label', { name: selectedTable }),
            schema: tableSchema,
            validate: () => true,
            getValidationErrors: () => [],
            importFn: async (data) => {
                const CHUNK_SIZE = 500;
                for (let i = 0; i < data.length; i += CHUNK_SIZE) {
                    await SystemRepository.bulkInsert(selectedTable, data.slice(i, i + CHUNK_SIZE));
                }
            },
            clearFn: async () => {
                await SystemRepository.executeRaw(`DELETE FROM ${quoteIdentifier(selectedTable)}`);
            }
        };
    };

    const activeConfig = getImportConfig();

    // Table Actions
    const openCreateTableModal = () => {
        setNewTableName('');
        setCreateColumns([{ name: 'id', type: 'INTEGER PRIMARY KEY' }]);
        setIsCreateModalOpen(true);
    };

    const handleCreateTable = async () => {
        try {
            const normalizedTableName = newTableName.trim();
            if (!isValidIdentifier(normalizedTableName)) {
                await appDialog.warning(t('datasource.invalid_table_name', 'Ungueltiger Tabellenname. Bitte nur Buchstaben, Zahlen und Unterstrich verwenden.'));
                return;
            }
            if (!createColumns.length) {
                await appDialog.warning(t('datasource.invalid_columns', 'Bitte mindestens eine gueltige Spalte angeben.'));
                return;
            }
            for (const col of createColumns) {
                const colName = col.name.trim();
                const colType = col.type.trim();
                if (!isValidIdentifier(colName) || !colType || !isSafeColumnType(colType)) {
                    await appDialog.warning(t('datasource.invalid_columns', 'Bitte mindestens eine gueltige Spalte angeben.'));
                    return;
                }
            }
            const cols = createColumns.map(c => `${quoteIdentifier(c.name.trim())} ${c.type.trim()}`).join(', ');
            const sql = `CREATE TABLE ${quoteIdentifier(normalizedTableName)} (${cols})`;
            await SystemRepository.executeRaw(sql);

            setIsCreateModalOpen(false);
            refreshTables();
            setNewTableName('');
            setCreateColumns([{ name: 'id', type: 'INTEGER PRIMARY KEY' }]);
            await appDialog.info(t('datasource.table_created'));
        } catch (error: unknown) {
            await appDialog.error(t('common.error') + ': ' + getErrorMessage(error));
        }
    };

    const handleDropTable = async (tableName: string) => {
        const shouldConfirm = shouldConfirmDestructiveActions();
        if (shouldConfirm && !(await appDialog.confirm(t('datasource.drop_confirm', { name: tableName })))) return;
        try {
            await SystemRepository.executeRaw(`DROP TABLE ${quoteIdentifier(tableName)}`);
            refreshTables();
            refreshDataSources();
            if (selectedTable === tableName) setSelectedTable('');
        } catch (error: unknown) {
            await appDialog.error(t('common.error') + ': ' + getErrorMessage(error));
        }
    };

    const handleDropView = async (viewName: string) => {
        const shouldConfirm = shouldConfirmDestructiveActions();
        if (shouldConfirm && !(await appDialog.confirm(t('datasource.drop_view_confirm', `View "${viewName}" löschen?`, { name: viewName })))) return;
        try {
            await SystemRepository.executeRaw(`DROP VIEW ${quoteIdentifier(viewName)}`);
            refreshTables();
            refreshDataSources();
            if (selectedTable === viewName) setSelectedTable('');
        } catch (error: unknown) {
            await appDialog.error(t('common.error') + ': ' + getErrorMessage(error));
        }
    };

    const handleClearTable = async (tableName: string) => {
        const shouldConfirm = shouldConfirmDestructiveActions();
        if (shouldConfirm && !(await appDialog.confirm(t('datasource.clear_confirm', { name: tableName })))) return;
        try {
            await SystemRepository.executeRaw(`DELETE FROM ${quoteIdentifier(tableName)}`);
            refreshTables();
            await appDialog.info(t('datasource.cleared_success'));
        } catch (error: unknown) {
            await appDialog.error(t('common.error') + ': ' + getErrorMessage(error));
        }
    };

    const handleResetSqlManager = async () => {
        const confirmText = t('datasource.sql_manager_reset_confirm', 'Reset SQL Manager? All saved SQL statements and favorites will be deleted.');
        if (!(await appDialog.confirm(confirmText))) return;
        const promptText = await appDialog.prompt(t('datasource.sql_manager_reset_prompt', 'Please type "RESET" to continue:'));
        if (promptText !== 'RESET') {
            if (promptText !== null) {
                await appDialog.warning(t('datasource.sql_manager_reset_aborted', 'Canceled: Wrong input.'));
            }
            return;
        }
        try {
            setIsResettingSqlManager(true);
            await SystemRepository.executeRaw(`
                UPDATE sys_user_widgets
                SET sql_statement_id = NULL
                WHERE COALESCE(TRIM(sql_statement_id), '') <> '';
                DELETE FROM sys_sql_statement;
            `);
            await appDialog.info(t('datasource.sql_manager_reset_success', 'SQL Manager was reset.'));
        } catch (error: unknown) {
            await appDialog.error(t('common.error') + ': ' + getErrorMessage(error));
        } finally {
            setIsResettingSqlManager(false);
        }
    };

    const openCreateIndexModal = async (tableName: string) => {
        try {
            const schema = await SystemRepository.getTableSchema(tableName);
            const cols = schema.map(col => col.name).filter(Boolean);
            setIndexTableName(tableName);
            setAvailableIndexColumns(cols);
            setIndexColumns([]);
            setIndexUnique(false);
            setIndexWhere('');
            setIndexName(`idx_${tableName}_`);
            setIsCreateIndexOpen(true);
        } catch (error: unknown) {
            await appDialog.error(t('common.error') + ': ' + getErrorMessage(error));
        }
    };

    const toggleIndexColumn = (column: string) => {
        setIndexColumns(prev => (
            prev.includes(column)
                ? prev.filter(col => col !== column)
                : [...prev, column]
        ));
    };

    const moveIndexColumn = (column: string, direction: 'up' | 'down') => {
        setIndexColumns(prev => {
            const index = prev.indexOf(column);
            if (index === -1) return prev;
            const nextIndex = direction === 'up' ? index - 1 : index + 1;
            if (nextIndex < 0 || nextIndex >= prev.length) return prev;
            const next = [...prev];
            [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
            return next;
        });
    };

    const handleCreateIndex = async () => {
        const trimmedName = indexName.trim();
        if (!trimmedName) {
            await appDialog.warning(t('datasource.index_create_name_required', 'Bitte einen Indexnamen angeben.'));
            return;
        }
        if (indexColumns.length === 0) {
            await appDialog.warning(t('datasource.index_create_columns_required', 'Bitte mindestens eine Spalte auswählen.'));
            return;
        }
        try {
            const uniqueSql = indexUnique ? 'UNIQUE ' : '';
            const quotedCols = indexColumns.map(quoteIdentifier).join(', ');
            const whereSql = indexWhere.trim() ? ` WHERE ${indexWhere.trim()}` : '';
            const sql = `CREATE ${uniqueSql}INDEX ${quoteIdentifier(trimmedName)} ON ${quoteIdentifier(indexTableName)} (${quotedCols})${whereSql};`;
            await SystemRepository.executeRaw(sql);
            setIsCreateIndexOpen(false);
            await refreshTables();
            await appDialog.info(t('datasource.index_create_success', 'Index erstellt.'));
        } catch (error: unknown) {
            await appDialog.error(t('common.error') + ': ' + getErrorMessage(error));
        }
    };

    const schemaDocSnapshot = React.useMemo(() => JSON.stringify({
        table_name: selectedTable,
        object_type: selectedObjectType,
        table: tableDocDraft,
        columns: selectedTableSchema.map((column) => ({
            name: column.name,
            display_name: columnDocDrafts[column.name]?.display_name || '',
            description: columnDocDrafts[column.name]?.description || '',
            semantic_type: columnDocDrafts[column.name]?.semantic_type || ''
        }))
    }), [selectedObjectType, selectedTable, tableDocDraft, columnDocDrafts, selectedTableSchema]);

    const handleSaveSchemaDocumentation = async (options?: { silent?: boolean }) => {
        if (!selectedTable || isSystemTable(selectedTable)) return;
        const currentSnapshot = schemaDocSnapshot;
        try {
            setIsSavingSchemaDocs(true);
            setSchemaDocSaveState('saving');
            await SystemRepository.saveSchemaTableDoc({
                table_name: selectedTable,
                object_type: selectedObjectType,
                display_name: tableDocDraft.display_name.trim(),
                description: tableDocDraft.description.trim()
            });
            await Promise.all(
                Object.entries(columnDocDrafts).map(([columnName, draft]) => (
                    SystemRepository.saveSchemaColumnDoc({
                        table_name: selectedTable,
                        object_type: selectedObjectType,
                        column_name: columnName,
                        display_name: draft.display_name.trim(),
                        description: draft.description.trim(),
                        semantic_type: draft.semantic_type
                    })
                ))
            );
            refreshSelectedTableDoc();
            refreshSelectedColumnDocs();
            refreshSchemaTableDocs();
            schemaDocLastSavedSnapshotRef.current = currentSnapshot;
            setSchemaDocSaveState('saved');
            if (schemaDocSavedStateTimerRef.current) {
                window.clearTimeout(schemaDocSavedStateTimerRef.current);
            }
            schemaDocSavedStateTimerRef.current = window.setTimeout(() => {
                setSchemaDocSaveState('idle');
                schemaDocSavedStateTimerRef.current = null;
            }, 1400);
        } catch (error: unknown) {
            setSchemaDocSaveState('error');
            if (!options?.silent) {
                await appDialog.error(t('common.error') + ': ' + getErrorMessage(error));
            }
        } finally {
            setIsSavingSchemaDocs(false);
        }
    };

    useEffect(() => {
        if (!schemaDocsAutosave || !isSchemaDocsOpen || !selectedTable || !schemaDocDraftReady || isSystemTable(selectedTable)) return;
        if (schemaDocSnapshot === schemaDocLastSavedSnapshotRef.current) return;

        setSchemaDocSaveState((prev) => (prev === 'saving' ? prev : 'dirty'));
        const timer = window.setTimeout(() => {
            void handleSaveSchemaDocumentation({ silent: true });
        }, 700);

        return () => window.clearTimeout(timer);
    }, [schemaDocsAutosave, isSchemaDocsOpen, selectedTable, schemaDocDraftReady, schemaDocSnapshot]);

    useEffect(() => () => {
        if (schemaDocSavedStateTimerRef.current) {
            window.clearTimeout(schemaDocSavedStateTimerRef.current);
        }
    }, []);

    const resetRelationshipDraft = React.useCallback(() => {
        setEditingRelationshipId('');
        setRelationshipDraft({
            source_column: '',
            target_table: '',
            target_column: '',
            relationship_kind: 'n:1',
            join_type: 'LEFT JOIN',
            display_name: '',
            description: ''
        });
    }, []);

    const handleSaveRelationship = async () => {
        if (!selectedTable || !relationshipDraft.source_column || !relationshipDraft.target_table || !relationshipDraft.target_column) {
            await appDialog.warning(t('datasource.schema_relationship_required', 'Bitte Quelle, Zieltabelle und Zielspalte auswählen.'));
            return;
        }
        try {
            setIsSavingRelationship(true);
            const relationshipId = await SystemRepository.saveSchemaRelationshipDoc({
                id: editingRelationshipId || undefined,
                source_table: selectedTable,
                source_column: relationshipDraft.source_column,
                target_table: relationshipDraft.target_table,
                target_column: relationshipDraft.target_column,
                relationship_kind: relationshipDraft.relationship_kind,
                join_type: relationshipDraft.join_type,
                display_name: relationshipDraft.display_name.trim(),
                description: relationshipDraft.description.trim()
            });
            setRelationshipCheckResults((prev) => {
                if (!Object.prototype.hasOwnProperty.call(prev, relationshipId)) return prev;
                const next = { ...prev };
                delete next[relationshipId];
                return next;
            });
            resetRelationshipDraft();
            refreshSelectedRelationshipDocs();
        } catch (error: unknown) {
            await appDialog.error(t('common.error') + ': ' + getErrorMessage(error));
        } finally {
            setIsSavingRelationship(false);
        }
    };

    const handleEditRelationship = (relationship: SchemaRelationshipDocRecord) => {
        setEditingRelationshipId(relationship.id);
        setRelationshipDraft({
            source_column: relationship.source_column,
            target_table: relationship.target_table,
            target_column: relationship.target_column,
            relationship_kind: relationship.relationship_kind || 'n:1',
            join_type: relationship.join_type || 'LEFT JOIN',
            display_name: relationship.display_name || '',
            description: relationship.description || ''
        });
        setSchemaDocSections((prev) => ({ ...prev, relationships: true }));
    };

    const handleDeleteRelationship = async (relationshipId: string) => {
        if (!(await appDialog.confirm(t('datasource.schema_relationship_delete_confirm', 'Beziehung wirklich löschen?')))) return;
        try {
            await SystemRepository.deleteSchemaRelationshipDoc(relationshipId);
            setRelationshipCheckResults((prev) => {
                if (!Object.prototype.hasOwnProperty.call(prev, relationshipId)) return prev;
                const next = { ...prev };
                delete next[relationshipId];
                return next;
            });
            refreshSelectedRelationshipDocs();
        } catch (error: unknown) {
            await appDialog.error(t('common.error') + ': ' + getErrorMessage(error));
        }
    };

    const handleCheckRelationship = async (relationshipId: string) => {
        try {
            setIsCheckingRelationshipId(relationshipId);
            const summary = await SystemRepository.checkSchemaRelationship(relationshipId);
            setRelationshipCheckResults((prev) => ({ ...prev, [relationshipId]: summary }));
        } catch (error: unknown) {
            await appDialog.error(t('common.error') + ': ' + getErrorMessage(error));
        } finally {
            setIsCheckingRelationshipId('');
        }
    };

    const handleValidateSchemaDocumentation = async () => {
        try {
            setIsValidatingSchemaDocs(true);
            setSchemaCleanupSummary(null);
            const summary = await SystemRepository.validateSchemaDocumentation();
            setSchemaValidationSummary(summary);
            refreshSchemaTableDocs();
            refreshSelectedTableDoc();
            refreshSelectedColumnDocs();
            refreshSelectedRelationshipDocs();
        } catch (error: unknown) {
            await appDialog.error(t('common.error') + ': ' + getErrorMessage(error));
        } finally {
            setIsValidatingSchemaDocs(false);
        }
    };

    const handleCleanupSchemaDocumentation = async () => {
        if (!(await appDialog.confirm(t('datasource.schema_cleanup_confirm', 'Verwaiste Schema-Dokumentation wirklich bereinigen?')))) return;
        try {
            setIsCleaningSchemaDocs(true);
            const summary = await SystemRepository.cleanupInvalidSchemaDocumentation();
            setSchemaCleanupSummary(summary);
            setRelationshipCheckResults({});
            const validationSummary = await SystemRepository.validateSchemaDocumentation();
            setSchemaValidationSummary(validationSummary);
            refreshSchemaTableDocs();
            refreshSelectedTableDoc();
            refreshSelectedColumnDocs();
            refreshSelectedRelationshipDocs();
            if (!selectedTable) return;
            const stillExists = (tables || []).includes(selectedTable) || (dataSources || []).some((entry) => entry.name === selectedTable);
            if (!stillExists) {
                setSelectedTable('');
                setIsSchemaDocsOpen(false);
            }
        } catch (error: unknown) {
            await appDialog.error(t('common.error') + ': ' + getErrorMessage(error));
        } finally {
            setIsCleaningSchemaDocs(false);
        }
    };

    const handleExportSchemaPackage = async () => {
        try {
            setIsExportingSchemaPackage(true);
            const schemaPackage = await SystemRepository.exportSchemaPackage();
            const fileDate = new Date().toISOString().slice(0, 10);
            const blob = new Blob([JSON.stringify(schemaPackage, null, 2)], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `litebi-schema-export-${fileDate}.json`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error: unknown) {
            await appDialog.error(t('common.error') + ': ' + getErrorMessage(error));
        } finally {
            setIsExportingSchemaPackage(false);
        }
    };

    const handleAnalyzeSchemaImport = async (file: File) => {
        try {
            setIsAnalyzingSchemaImport(true);
            const text = await file.text();
            const parsed = JSON.parse(text) as LiteBiSchemaExportPackage;
            const analysis = await SystemRepository.analyzeSchemaImportPackage(parsed);
            const defaultResolutions = Object.fromEntries(
                [...analysis.object_matches, ...analysis.column_matches, ...analysis.relationship_matches]
                    .filter((entry) => entry.status === 'conflict' && entry.conflict_key)
                    .map((entry) => [entry.conflict_key!, 'keep_local' as SchemaImportConflictResolution])
            );
            setPendingSchemaImportPackage(parsed);
            setSchemaImportAnalysis(analysis);
            setSchemaImportConflictResolutions(defaultResolutions);
            setSchemaImportConflictDraftResolutions(defaultResolutions);
            setSchemaImportMergeProgress(0);
            setSchemaImportMergeProgressLabel('');
            setSchemaImportMergeSummary(null);
            setIsSchemaImportConflictDialogOpen(false);
        } catch (error: unknown) {
            setPendingSchemaImportPackage(null);
            setSchemaImportAnalysis(null);
            setSchemaImportConflictResolutions({});
            setSchemaImportConflictDraftResolutions({});
            setSchemaImportMergeProgress(0);
            setSchemaImportMergeProgressLabel('');
            setSchemaImportMergeSummary(null);
            setIsSchemaImportConflictDialogOpen(false);
            await appDialog.error(t('common.error') + ': ' + getErrorMessage(error));
        } finally {
            setIsAnalyzingSchemaImport(false);
            if (schemaImportInputRef.current) {
                schemaImportInputRef.current.value = '';
            }
        }
    };

    const handleMergeSchemaImport = async () => {
        if (!pendingSchemaImportPackage) return;
        try {
            setIsMergingSchemaImport(true);
            setSchemaImportMergeProgress(15);
            setSchemaImportMergeProgressLabel(t('datasource.schema_import_progress_merging', 'Dokumentation wird übernommen...'));
            const mergeSummary = await SystemRepository.mergeSchemaImportPackage(
                pendingSchemaImportPackage,
                schemaImportConflictResolutions
            );
            setSchemaImportMergeSummary(mergeSummary);
            setSchemaImportMergeProgress(60);
            setSchemaImportMergeProgressLabel(t('datasource.schema_import_progress_validating', 'Schema-Dokumentation wird geprüft...'));
            const validationSummary = await SystemRepository.validateSchemaDocumentation();
            setSchemaValidationSummary(validationSummary);
            setSchemaImportMergeProgress(85);
            setSchemaImportMergeProgressLabel(t('datasource.schema_import_progress_refreshing', 'Ansicht wird aktualisiert...'));
            refreshSchemaTableDocs();
            refreshSelectedTableDoc();
            refreshSelectedColumnDocs();
            refreshSelectedRelationshipDocs();
            setSchemaImportMergeProgress(100);
            setSchemaImportMergeProgressLabel(t('datasource.schema_import_progress_done', 'Übernahme abgeschlossen.'));
            setIsSchemaImportConflictDialogOpen(false);
        } catch (error: unknown) {
            await appDialog.error(t('common.error') + ': ' + getErrorMessage(error));
        } finally {
            setIsMergingSchemaImport(false);
        }
    };

    const resetSchemaImportWorkflow = () => {
        setPendingSchemaImportPackage(null);
        setSchemaImportAnalysis(null);
        setSchemaImportConflictResolutions({});
        setSchemaImportConflictDraftResolutions({});
        setSchemaImportMergeProgress(0);
        setSchemaImportMergeProgressLabel('');
        setSchemaImportMergeSummary(null);
        setIsSchemaImportConflictDialogOpen(false);
        if (schemaImportInputRef.current) {
            schemaImportInputRef.current.value = '';
        }
    };

    const setAllSchemaImportConflictResolutions = (resolution: SchemaImportConflictResolution) => {
        const nextResolutions = Object.fromEntries(
            schemaImportConflictEntries.map((entry, index) => {
                const label = entry.column_name
                    ? `${entry.table_name}.${entry.column_name}`
                    : entry.technical_name || entry.id || '';
                const conflictKey = entry.conflict_key || `${label}:${entry.field}:${index}`;
                return [conflictKey, resolution];
            })
        ) as Record<string, SchemaImportConflictResolution>;
        setSchemaImportConflictResolutions(nextResolutions);
    };

    const setAllSchemaImportConflictDraftResolutions = (resolution: SchemaImportConflictResolution) => {
        const nextResolutions = Object.fromEntries(
            schemaImportConflictEntries.map((entry, index) => {
                const label = entry.column_name
                    ? `${entry.table_name}.${entry.column_name}`
                    : entry.technical_name || entry.id || '';
                const conflictKey = entry.conflict_key || `${label}:${entry.field}:${index}`;
                return [conflictKey, resolution];
            })
        ) as Record<string, SchemaImportConflictResolution>;
        setSchemaImportConflictDraftResolutions(nextResolutions);
    };

    const openSchemaImportConflictDialog = () => {
        setSchemaImportConflictDraftResolutions(schemaImportConflictResolutions);
        setIsSchemaImportConflictDialogOpen(true);
    };

    const closeSchemaImportConflictDialog = () => {
        if (isMergingSchemaImport) return;
        setSchemaImportConflictDraftResolutions(schemaImportConflictResolutions);
        setIsSchemaImportConflictDialogOpen(false);
    };

    const applyAndMergeSchemaImportConflictDialog = async () => {
        setSchemaImportConflictResolutions(schemaImportConflictDraftResolutions);
        if (!pendingSchemaImportPackage) return;
        try {
            setIsMergingSchemaImport(true);
            setSchemaImportMergeProgress(10);
            setSchemaImportMergeProgressLabel(t('datasource.schema_import_progress_preparing', 'Konfliktentscheidungen werden vorbereitet...'));
            const mergeSummary = await SystemRepository.mergeSchemaImportPackage(
                pendingSchemaImportPackage,
                schemaImportConflictDraftResolutions
            );
            setSchemaImportConflictResolutions(schemaImportConflictDraftResolutions);
            setSchemaImportMergeSummary(mergeSummary);
            setSchemaImportMergeProgress(60);
            setSchemaImportMergeProgressLabel(t('datasource.schema_import_progress_validating', 'Schema-Dokumentation wird geprüft...'));
            const validationSummary = await SystemRepository.validateSchemaDocumentation();
            setSchemaValidationSummary(validationSummary);
            setSchemaImportMergeProgress(85);
            setSchemaImportMergeProgressLabel(t('datasource.schema_import_progress_refreshing', 'Ansicht wird aktualisiert...'));
            refreshSchemaTableDocs();
            refreshSelectedTableDoc();
            refreshSelectedColumnDocs();
            refreshSelectedRelationshipDocs();
            setSchemaImportMergeProgress(100);
            setSchemaImportMergeProgressLabel(t('datasource.schema_import_progress_done', 'Übernahme abgeschlossen.'));
        } catch (error: unknown) {
            await appDialog.error(t('common.error') + ': ' + getErrorMessage(error));
        } finally {
            setIsMergingSchemaImport(false);
        }
    };

    const renderSchemaObjectTitle = React.useCallback((technicalName: string, displayName?: string) => {
        const trimmedDisplayName = displayName?.trim() || '';
        return (
            <div className="flex min-w-0 items-baseline gap-2">
                <span className={`truncate ${schemaDocsPreferTechnicalNames || !trimmedDisplayName ? 'font-mono text-sm font-bold text-slate-700 dark:text-slate-200' : 'text-sm font-bold text-slate-700 dark:text-slate-200'}`}>
                    {schemaDocsPreferTechnicalNames || !trimmedDisplayName ? technicalName : trimmedDisplayName}
                </span>
                {trimmedDisplayName && (
                    <span className={`truncate text-[11px] font-medium text-slate-500 dark:text-slate-400 ${schemaDocsPreferTechnicalNames ? '' : 'font-mono'}`}>
                        {schemaDocsPreferTechnicalNames ? trimmedDisplayName : technicalName}
                    </span>
                )}
            </div>
        );
    }, [schemaDocsPreferTechnicalNames]);

    const renderSchemaStatusBadge = React.useCallback((statusMeta: ReturnType<typeof getSchemaStatusMeta>, compact: boolean = false) => (
        <span
            title={statusMeta.tooltip}
            className={`inline-flex items-center rounded-full border font-bold uppercase tracking-wide ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]'} ${statusMeta.className}`}
        >
            {statusMeta.iconOnly ? <Check className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} /> : statusMeta.label}
        </span>
    ), []);
    const schemaImportConflictEntries = React.useMemo(
        () => schemaImportAnalysis
            ? [...schemaImportAnalysis.object_matches, ...schemaImportAnalysis.column_matches, ...schemaImportAnalysis.relationship_matches]
                .filter((entry) => entry.status === 'conflict')
            : [],
        [schemaImportAnalysis]
    );
    const schemaImportConflictCount = schemaImportConflictEntries.length;
    const schemaImportUseImportCount = React.useMemo(
        () => schemaImportConflictEntries.filter((entry, index) => {
            const label = entry.column_name
                ? `${entry.table_name}.${entry.column_name}`
                : entry.technical_name || entry.id || '';
            const conflictKey = entry.conflict_key || `${label}:${entry.field}:${index}`;
            return schemaImportConflictResolutions[conflictKey] === 'use_import';
        }).length,
        [schemaImportConflictEntries, schemaImportConflictResolutions]
    );
    const getSchemaImportConflictFieldLabel = React.useCallback((field?: string) => {
        switch (field) {
            case 'display_name':
                return t('datasource.schema_import_conflict_field_display_name', 'Anzeigename');
            case 'description':
                return t('datasource.schema_import_conflict_field_description', 'Beschreibung');
            case 'semantic_type':
                return t('datasource.schema_import_conflict_field_semantic_type', 'Semantischer Typ');
            case 'relationship_kind':
                return t('datasource.schema_import_conflict_field_relationship_kind', 'Beziehungstyp');
            case 'join_type':
                return t('datasource.schema_import_conflict_field_join_type', 'Join-Art');
            default:
                return field || t('datasource.schema_import_conflict_field_unknown', 'Feld');
        }
    }, [t]);
    const schemaImportReviewedConflicts = React.useMemo(
        () => schemaImportConflictEntries.map((entry, index) => {
            const label = entry.column_name
                ? `${entry.table_name}.${entry.column_name}`
                : entry.technical_name || entry.id || '';
            const conflictKey = entry.conflict_key || `${label}:${entry.field}:${index}`;
            return {
                conflictKey,
                label,
                fieldLabel: getSchemaImportConflictFieldLabel(entry.field),
                resolution: schemaImportConflictResolutions[conflictKey] || 'keep_local'
            };
        }),
        [getSchemaImportConflictFieldLabel, schemaImportConflictEntries, schemaImportConflictResolutions]
    );
    const schemaImportAppliedConflicts = React.useMemo(
        () => schemaImportReviewedConflicts.filter((entry) => entry.resolution === 'use_import'),
        [schemaImportReviewedConflicts]
    );
    const schemaImportKeptLocalConflicts = React.useMemo(
        () => schemaImportReviewedConflicts.filter((entry) => entry.resolution !== 'use_import'),
        [schemaImportReviewedConflicts]
    );
    const schemaImportObjectIssues = React.useMemo(
        () => schemaImportAnalysis
            ? schemaImportAnalysis.object_matches.filter((entry) => entry.status !== 'direct_match' && entry.status !== 'conflict')
            : [],
        [schemaImportAnalysis]
    );
    const schemaImportColumnIssues = React.useMemo(
        () => schemaImportAnalysis
            ? schemaImportAnalysis.column_matches.filter((entry) => entry.status !== 'direct_match' && entry.status !== 'conflict')
            : [],
        [schemaImportAnalysis]
    );
    const schemaImportRelationshipIssues = React.useMemo(
        () => schemaImportAnalysis
            ? schemaImportAnalysis.relationship_matches.filter((entry) => entry.status !== 'direct_match' && entry.status !== 'conflict')
            : [],
        [schemaImportAnalysis]
    );
    const hasRemovableSchemaIssues = Boolean(
        schemaValidationSummary
        && (schemaValidationSummary.missing_tables > 0 || schemaValidationSummary.missing_columns > 0)
    );
    const schemaTechnicalIssues = (schemaValidationSummary?.missing_tables || 0) + (schemaValidationSummary?.missing_columns || 0);
    const hasAnySchemaDocumentation = React.useMemo(
        () => Boolean(
            (schemaTableDocs || []).some((entry) => Boolean(entry.display_name?.trim() || entry.description?.trim()))
            || (schemaColumnDocs || []).some((entry) => Boolean(entry.display_name?.trim() || entry.description?.trim() || entry.semantic_type?.trim()))
            || (schemaRelationshipDocs || []).length > 0
        ),
        [schemaColumnDocs, schemaRelationshipDocs, schemaTableDocs]
    );

    const renderSchemaDocumentationEditor = () => {
        if (!selectedTable) {
            return (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-400">
                    {t('datasource.schema_docs_select_table_hint', 'Waehlen Sie links eine Tabelle oder einen View aus, um Struktur und Dokumentation zu bearbeiten.')}
                </div>
            );
        }

        return (
            <div className="space-y-4">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/30">
                    <button
                        type="button"
                        onClick={() => toggleSchemaDocSection('tableDetails')}
                        className="flex w-full items-center justify-between gap-2 bg-slate-50/90 px-3 py-2.5 text-left text-xs font-black uppercase text-slate-500 transition-colors hover:bg-slate-100/90 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                        <span className="flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-blue-500" />{t('datasource.schema_table_details', 'Tabellen-Details')}</span>
                        <div className="flex items-center gap-2">
                            <span className="truncate font-mono text-[10px] text-slate-400">{selectedTable}</span>
                            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${schemaDocSections.tableDetails ? 'rotate-180' : ''}`} />
                        </div>
                    </button>
                    {schemaDocSections.tableDetails && (
                        <div className="space-y-3 px-3 pb-3 pt-3">
                            <div>
                                <div className="mb-1 flex items-center justify-between gap-3">
                                    <label className="block text-left text-[10px] font-black uppercase text-slate-400">{t('datasource.schema_table_name', 'Technischer Name')}</label>
                                    {!isSelectedSystemTable && selectedTableDoc && (
                                        <div className="shrink-0">
                                            {(() => {
                                                const statusMeta = getSchemaStatusMeta(selectedTableDoc.status || 'valid', t);
                                                return renderSchemaStatusBadge(statusMeta);
                                            })()}
                                        </div>
                                    )}
                                </div>
                                <input
                                    value={selectedTable}
                                    readOnly
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-left text-[10px] font-black uppercase text-slate-400">{t('datasource.schema_table_display_name', 'Anzeigename')}</label>
                                <input
                                    value={isSelectedSystemTable ? (selectedSystemTableMeta?.displayName || '') : tableDocDraft.display_name}
                                    onChange={(e) => setTableDocDraft((prev) => ({ ...prev, display_name: e.target.value }))}
                                    readOnly={isSelectedSystemTable}
                                    className={`w-full rounded-lg border border-slate-200 p-2 text-[11px] outline-none placeholder:text-slate-300 dark:border-slate-700 dark:placeholder:text-slate-600 ${
                                        isSelectedSystemTable
                                            ? 'bg-slate-50 text-slate-500 dark:bg-slate-900/70 dark:text-slate-300'
                                            : 'bg-white font-medium text-slate-800 dark:bg-slate-900 dark:text-slate-100'
                                    }`}
                                    placeholder={t('datasource.schema_table_display_name_placeholder', 'Optionaler sprechender Name')}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-left text-[10px] font-black uppercase text-slate-400">{t('datasource.schema_table_description', 'Beschreibung')}</label>
                                <textarea
                                    value={isSelectedSystemTable ? (selectedSystemTableMeta?.description || '') : tableDocDraft.description}
                                    onChange={(e) => setTableDocDraft((prev) => ({ ...prev, description: e.target.value }))}
                                    readOnly={isSelectedSystemTable}
                                    className={`h-20 w-full resize-y rounded-lg border border-slate-200 p-2 text-[11px] outline-none placeholder:text-slate-300 dark:border-slate-700 dark:placeholder:text-slate-600 ${
                                        isSelectedSystemTable
                                            ? 'bg-slate-50 text-slate-500 dark:bg-slate-900/70 dark:text-slate-300'
                                            : 'bg-white font-medium text-slate-800 dark:bg-slate-900 dark:text-slate-100'
                                    }`}
                                    placeholder={t('datasource.schema_table_description_placeholder', 'Kurze fachliche Beschreibung dieser Tabelle')}
                                />
                            </div>
                            {isSelectedSystemTable && (
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    {t('datasource.schema_docs_system_readonly_hint', 'Systemtabellen werden durch die Anwendung beschrieben und sind hier nur lesbar.')}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/30">
                    <button
                        type="button"
                        onClick={() => toggleSchemaDocSection('columns')}
                        className="flex w-full items-center justify-between gap-2 bg-slate-50/90 px-3 py-2.5 text-left text-xs font-black uppercase text-slate-500 transition-colors hover:bg-slate-100/90 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                        <span className="flex items-center gap-2"><Columns3 className="w-3.5 h-3.5 text-blue-500" />{t('datasource.schema_columns', 'Spalten')}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400">{selectedTableSchema.length}</span>
                            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${schemaDocSections.columns ? 'rotate-180' : ''}`} />
                        </div>
                    </button>
                    {schemaDocSections.columns && (
                        <div className="space-y-2 px-3 pb-3 pt-3">
                            {selectedTableSchema.map((column) => (
                                <div key={column.name} className={`rounded-lg border px-3 py-2.5 ${
                                    schemaDocsHighlightUndocumented
                                    && !columnDocDrafts[column.name]?.display_name
                                    && !columnDocDrafts[column.name]?.description
                                    && !columnDocDrafts[column.name]?.semantic_type
                                        ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20'
                                        : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40'
                                }`}>
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <div className="min-w-0 flex items-center gap-2">
                                            <div className="truncate font-mono text-xs font-bold text-slate-700 dark:text-slate-200">{column.name}</div>
                                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                                                {column.type}
                                            </span>
                                        </div>
                                        {selectedColumnDocsByName[column.name] && (
                                            <div className="shrink-0">
                                                {(() => {
                                                    const statusMeta = getSchemaStatusMeta(selectedColumnDocsByName[column.name].status || 'valid', t);
                                                    return renderSchemaStatusBadge(statusMeta);
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1.15fr)_150px_minmax(0,1.35fr)]">
                                        <input
                                            value={columnDocDrafts[column.name]?.display_name || ''}
                                            onChange={(e) => setColumnDocDrafts((prev) => ({
                                                ...prev,
                                                [column.name]: {
                                                    display_name: e.target.value,
                                                    description: prev[column.name]?.description || '',
                                                    semantic_type: prev[column.name]?.semantic_type || ''
                                                }
                                            }))}
                                            readOnly={isSelectedSystemTable}
                                            className={`h-9 w-full rounded-lg border border-slate-200 px-2.5 text-[11px] outline-none placeholder:text-slate-300 dark:border-slate-700 dark:placeholder:text-slate-600 ${
                                                isSelectedSystemTable
                                                    ? 'bg-slate-50 text-slate-500 dark:bg-slate-900/70 dark:text-slate-300'
                                                    : 'bg-white font-medium text-slate-800 dark:bg-slate-900 dark:text-slate-100'
                                            }`}
                                            placeholder={t('datasource.schema_column_display_name_placeholder', 'Alias / Anzeigename')}
                                        />
                                        <select
                                            value={columnDocDrafts[column.name]?.semantic_type || ''}
                                            onChange={(e) => setColumnDocDrafts((prev) => ({
                                                ...prev,
                                                [column.name]: {
                                                    display_name: prev[column.name]?.display_name || '',
                                                    description: prev[column.name]?.description || '',
                                                    semantic_type: e.target.value
                                                }
                                            }))}
                                            disabled={isSelectedSystemTable}
                                            className={`h-9 w-full rounded-lg border border-slate-200 px-2.5 text-[11px] outline-none placeholder:text-slate-300 dark:border-slate-700 dark:placeholder:text-slate-600 ${
                                                isSelectedSystemTable
                                                    ? 'bg-slate-50 text-slate-500 dark:bg-slate-900/70 dark:text-slate-300'
                                                    : 'bg-white font-medium text-slate-800 dark:bg-slate-900 dark:text-slate-100'
                                            }`}
                                        >
                                            <option value="">{t('datasource.schema_semantic_type_none', 'Kein semantischer Typ')}</option>
                                            <option value="id">{t('datasource.schema_semantic_type_id', 'ID')}</option>
                                            <option value="date">{t('datasource.schema_semantic_type_date', 'Datum')}</option>
                                            <option value="metric">{t('datasource.schema_semantic_type_metric', 'Kennzahl')}</option>
                                            <option value="category">{t('datasource.schema_semantic_type_category', 'Kategorie')}</option>
                                            <option value="text">{t('datasource.schema_semantic_type_text', 'Text')}</option>
                                            <option value="currency">{t('datasource.schema_semantic_type_currency', 'Währung')}</option>
                                            <option value="percent">{t('datasource.schema_semantic_type_percent', 'Prozent')}</option>
                                            <option value="boolean">{t('datasource.schema_semantic_type_boolean', 'Boolean')}</option>
                                        </select>
                                        <input
                                            value={columnDocDrafts[column.name]?.description || ''}
                                            onChange={(e) => setColumnDocDrafts((prev) => ({
                                                ...prev,
                                                [column.name]: {
                                                    display_name: prev[column.name]?.display_name || '',
                                                    description: e.target.value,
                                                    semantic_type: prev[column.name]?.semantic_type || ''
                                                }
                                            }))}
                                            readOnly={isSelectedSystemTable}
                                            className={`h-9 w-full rounded-lg border border-slate-200 px-2.5 text-[11px] outline-none placeholder:text-slate-300 dark:border-slate-700 dark:placeholder:text-slate-600 ${
                                                isSelectedSystemTable
                                                    ? 'bg-slate-50 text-slate-500 dark:bg-slate-900/70 dark:text-slate-300'
                                                    : 'bg-white font-medium text-slate-800 dark:bg-slate-900 dark:text-slate-100'
                                            }`}
                                            placeholder={t('datasource.schema_column_description_placeholder', 'Kurze Beschreibung der Spalte')}
                                        />
                                    </div>
                                </div>
                            ))}
                            <div className="flex items-center justify-end gap-2 pt-1">
                                {!isSelectedSystemTable && schemaDocSaveState === 'saving' && (
                                    <span className="inline-flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        {t('common.saving', 'Speichern...')}
                                    </span>
                                )}
                                {!isSelectedSystemTable && schemaDocSaveState === 'saved' && (
                                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                                        {t('datasource.schema_docs_saved_inline', 'Automatisch gespeichert')}
                                    </span>
                                )}
                                {!isSelectedSystemTable && schemaDocSaveState === 'error' && (
                                    <button
                                        type="button"
                                        onClick={() => { void handleSaveSchemaDocumentation(); }}
                                        disabled={isSavingSchemaDocs}
                                        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
                                    >
                                        {t('datasource.schema_docs_retry_save', 'Erneut speichern')}
                                    </button>
                                )}
                                {!isSelectedSystemTable && !schemaDocsAutosave && schemaDocSnapshot !== schemaDocLastSavedSnapshotRef.current && schemaDocSaveState !== 'saving' && (
                                    <button
                                        type="button"
                                        onClick={() => { void handleSaveSchemaDocumentation(); }}
                                        disabled={isSavingSchemaDocs}
                                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {t('common.save', 'Speichern')}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/30">
                    <button
                        type="button"
                        onClick={() => toggleSchemaDocSection('relationships')}
                        className="flex w-full items-center justify-between gap-2 bg-slate-50/90 px-3 py-2.5 text-left text-xs font-black uppercase text-slate-500 transition-colors hover:bg-slate-100/90 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                        <span className="flex items-center gap-2"><Link2 className="w-3.5 h-3.5 text-blue-500" />{t('datasource.schema_relationships', 'Beziehungen')}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400">{selectedRelationshipDocs?.length || 0}</span>
                            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${schemaDocSections.relationships ? 'rotate-180' : ''}`} />
                        </div>
                    </button>
                    {schemaDocSections.relationships && (
                        <div className="space-y-3 px-3 pb-3 pt-3">
                            {(selectedRelationshipDocs || []).length > 0 && (
                                <div className="space-y-2">
                                    {(selectedRelationshipDocs || []).map((relationship) => {
                                        const isOutgoing = relationship.source_table === selectedTable;
                                        const relationshipCheckResult = relationshipCheckResults[relationship.id];
                                        const effectiveRelationshipStatus = relationshipCheckResult
                                            ? (
                                                relationshipCheckResult.kind_matches
                                                && relationshipCheckResult.missing_target_refs === 0
                                                    ? 'valid'
                                                    : 'needs_review'
                                            )
                                            : (relationship.status || 'valid');
                                        const statusMeta = getSchemaStatusMeta(effectiveRelationshipStatus, t);
                                        return (
                                            <div key={relationship.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 space-y-1">
                                                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400">
                                                            <span>{isOutgoing ? t('datasource.schema_relationship_direction_out', 'Ausgehend') : t('datasource.schema_relationship_direction_in', 'Eingehend')}</span>
                                                            <span>•</span>
                                                            <span>{relationship.join_type}</span>
                                                            <span>•</span>
                                                            <span>{relationship.relationship_kind}</span>
                                                            <span>•</span>
                                                            {renderSchemaStatusBadge(statusMeta, true)}
                                                        </div>
                                                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                                                            <span className="font-mono">{relationship.source_table}.{relationship.source_column}</span>
                                                            <span className="px-2 text-slate-400">→</span>
                                                            <span className="font-mono">{relationship.target_table}.{relationship.target_column}</span>
                                                        </div>
                                                        {relationship.display_name && (
                                                            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{relationship.display_name}</div>
                                                        )}
                                                        {relationship.description && (
                                                            <div className="text-[11px] text-slate-400 dark:text-slate-500">{relationship.description}</div>
                                                        )}
                                                        {relationshipCheckResult && (
                                                            <div className={`mt-2 rounded-lg border px-3 py-2 text-[11px] ${
                                                                relationshipCheckResult.kind_matches
                                                                    && relationshipCheckResult.missing_target_refs === 0
                                                                    ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300'
                                                                    : 'border-amber-200 bg-amber-50/80 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300'
                                                            }`}>
                                                                <div className="font-semibold">
                                                                    {relationshipCheckResult.kind_matches
                                                                        ? t('datasource.schema_relationship_check_kind_matches', 'Beziehungstyp wirkt plausibel.')
                                                                        : t('datasource.schema_relationship_check_kind_mismatch', 'Beziehungstyp bitte prüfen.')}
                                                                </div>
                                                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
                                                                    <span>{t('datasource.schema_relationship_check_declared', 'Deklariert')}: {relationshipCheckResult.declared_kind}</span>
                                                                    <span>{t('datasource.schema_relationship_check_suggested', 'Plausibel')}: {relationshipCheckResult.suggested_kind}</span>
                                                                    <span>{t('datasource.schema_relationship_check_source_unique', 'Quelle eindeutig')}: {relationshipCheckResult.source_unique ? t('common.yes', 'Ja') : t('common.no', 'Nein')}</span>
                                                                    <span>{t('datasource.schema_relationship_check_target_unique', 'Ziel eindeutig')}: {relationshipCheckResult.target_unique ? t('common.yes', 'Ja') : t('common.no', 'Nein')}</span>
                                                                    <span>{t('datasource.schema_relationship_check_missing_refs', 'Fehlende Treffer')}: {relationshipCheckResult.missing_target_refs}</span>
                                                                </div>
                                                                {relationshipCheckResult.missing_target_refs > 0 && (
                                                                    <div className="mt-1 text-[10px]">
                                                                        {t('datasource.schema_relationship_check_missing_refs_hint', 'Es gibt Quellwerte ohne passenden Zielwert.')}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {!isSelectedSystemTable && (
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => { handleEditRelationship(relationship); }}
                                                                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                                                title={t('datasource.schema_relationship_edit', 'Beziehung bearbeiten')}
                                                            >
                                                                <Pencil className="h-4 w-4" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => { void handleCheckRelationship(relationship.id); }}
                                                                disabled={isCheckingRelationshipId === relationship.id}
                                                                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-500 dark:hover:bg-blue-950/30 dark:hover:text-blue-400"
                                                                title={t('datasource.schema_relationship_check', 'Beziehung prüfen')}
                                                            >
                                                                {isCheckingRelationshipId === relationship.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => { void handleDeleteRelationship(relationship.id); }}
                                                                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                                                                title={t('common.delete')}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {!isSelectedSystemTable && (
                                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-900/30">
                                    <div className="mb-3 flex items-center justify-between gap-2">
                                        <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                            {editingRelationshipId
                                                ? t('datasource.schema_relationship_editing', 'Beziehung bearbeiten')
                                                : t('datasource.schema_relationship_add', 'Beziehung hinzufügen')}
                                        </div>
                                        {editingRelationshipId && (
                                            <button
                                                type="button"
                                                onClick={() => resetRelationshipDraft()}
                                                className="rounded-lg px-2.5 py-1 text-[11px] font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                            >
                                                {t('datasource.schema_relationship_cancel_edit', 'Abbrechen')}
                                            </button>
                                        )}
                                    </div>
                                    <div className="mb-3 space-y-3">
                                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                            <input
                                                value={selectedTable}
                                                readOnly
                                                className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] font-mono text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"
                                            />
                                            <span className="text-center text-[11px] font-bold text-slate-400">→</span>
                                            <select
                                                value={relationshipDraft.target_table}
                                                onChange={(e) => setRelationshipDraft((prev) => ({ ...prev, target_table: e.target.value, target_column: '' }))}
                                                className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[11px] font-medium text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                            >
                                                <option value="">{t('datasource.schema_relationship_target_table', 'Zieltabelle wählen')}</option>
                                                {relationshipTargetSources.map((source) => (
                                                    <option key={`${source.type}:${source.name}`} value={source.name}>
                                                        {source.name} {source.type === 'view' ? `(${t('datasource.object_type_view', 'View')})` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                            <select
                                                value={relationshipDraft.source_column}
                                                onChange={(e) => setRelationshipDraft((prev) => ({ ...prev, source_column: e.target.value }))}
                                                className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[11px] font-medium text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                            >
                                                <option value="">{t('datasource.schema_relationship_source_column', 'Quellspalte wählen')}</option>
                                                {selectedTableSchema.map((column) => (
                                                    <option key={column.name} value={column.name}>{column.name}</option>
                                                ))}
                                            </select>
                                            <span className="text-center text-[11px] font-bold text-slate-400">→</span>
                                            <select
                                                value={relationshipDraft.target_column}
                                                onChange={(e) => setRelationshipDraft((prev) => ({ ...prev, target_column: e.target.value }))}
                                                disabled={!relationshipDraft.target_table}
                                                className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[11px] font-medium text-slate-800 outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-900/60 dark:disabled:text-slate-500"
                                            >
                                                <option value="">{t('datasource.schema_relationship_target_column', 'Zielspalte wählen')}</option>
                                                {(relationshipTargetSchema || []).map((column) => (
                                                    <option key={column.name} value={column.name}>{column.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                        <div className="grid grid-cols-2 gap-2">
                                            <select
                                                value={relationshipDraft.relationship_kind}
                                                onChange={(e) => setRelationshipDraft((prev) => ({ ...prev, relationship_kind: e.target.value }))}
                                                className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[11px] font-medium text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                            >
                                                {['1:1', '1:n', 'n:1', 'n:m'].map((kind) => (
                                                    <option key={kind} value={kind}>{kind}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={relationshipDraft.join_type}
                                                onChange={(e) => setRelationshipDraft((prev) => ({ ...prev, join_type: e.target.value }))}
                                                className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[11px] font-medium text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                            >
                                                {['LEFT JOIN', 'INNER JOIN'].map((joinType) => (
                                                    <option key={joinType} value={joinType}>{joinType}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <input
                                            value={relationshipDraft.display_name}
                                            onChange={(e) => setRelationshipDraft((prev) => ({ ...prev, display_name: e.target.value }))}
                                            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[11px] font-medium text-slate-800 outline-none placeholder:text-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600"
                                            placeholder={t('datasource.schema_relationship_name_placeholder', 'Optionaler Anzeigename')}
                                        />
                                        <input
                                            value={relationshipDraft.description}
                                            onChange={(e) => setRelationshipDraft((prev) => ({ ...prev, description: e.target.value }))}
                                            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[11px] font-medium text-slate-800 outline-none placeholder:text-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600"
                                            placeholder={t('datasource.schema_relationship_description_placeholder', 'Kurze Beschreibung der Beziehung')}
                                        />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                            {t('datasource.schema_relationship_hint', 'Pflegen Sie fachliche Beziehungen auch dann, wenn in SQLite keine echten Foreign Keys angelegt sind.')}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => { void handleSaveRelationship(); }}
                                            disabled={isSavingRelationship}
                                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {isSavingRelationship ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                            {editingRelationshipId
                                                ? t('datasource.schema_relationship_update', 'Beziehung aktualisieren')
                                                : t('datasource.schema_relationship_add', 'Beziehung hinzufügen')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {(selectedRelationshipDocs || []).length === 0 && isSelectedSystemTable && (
                                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-4 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-400">
                                    {t('datasource.schema_relationships_empty', 'Für dieses Objekt sind noch keine Beziehungen dokumentiert.')}
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div>
        );
    };

    const renderSchemaToolsPanel = () => (
        <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/30">
                <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                    <h4 className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-300">
                        {t('datasource.schema_filter_title', 'Ansicht filtern')}
                    </h4>
                    <p className="mt-1 text-[11px] text-slate-400">
                        {t('datasource.schema_filter_hint', 'Blendet Tabellen und Views gezielt nach Dokumentations- und Prüfstatus ein.')}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 p-4">
                    {([
                        ['all', t('datasource.schema_filter_all', 'Alle')],
                        ['issues', t('datasource.schema_filter_issues', 'Mit Problemen')],
                        ['review', t('datasource.schema_filter_review', 'Nur prüfen')],
                        ['undocumented', t('datasource.schema_filter_undocumented', 'Undokumentiert')]
                    ] as const).map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setStructureSchemaFilter(value)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                                structureSchemaFilter === value
                                    ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300'
                                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-900'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/30">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                    <div>
                        <h4 className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-300">
                            {t('datasource.schema_validation_title', 'Schema-Validierung')}
                        </h4>
                        <p className="mt-1 text-[11px] text-slate-400">
                            {t('datasource.schema_validation_hint', 'Prüft, ob dokumentierte Tabellen, Spalten und Beziehungen noch zum aktuellen Datenbankschema passen.')}
                        </p>
                    </div>
                    {schemaValidationSummary && (
                        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold ${
                            schemaValidationSummary.issues > 0
                                ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300'
                        }`}>
                            {schemaValidationSummary.issues > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                            {schemaValidationSummary.issues > 0
                                ? t('datasource.schema_validation_result_warning', 'Validierung mit Hinweisen abgeschlossen')
                                : t('datasource.schema_validation_result_ok', 'Validierung erfolgreich abgeschlossen')}
                        </span>
                    )}
                </div>
                <div className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                        {hasRemovableSchemaIssues ? (
                            <button
                                type="button"
                                onClick={() => { void handleCleanupSchemaDocumentation(); }}
                                disabled={isCleaningSchemaDocs}
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300"
                            >
                                {isCleaningSchemaDocs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                {t('datasource.schema_cleanup_run', 'Bereinigen')}
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => { void handleValidateSchemaDocumentation(); }}
                            disabled={isValidatingSchemaDocs}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isValidatingSchemaDocs ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            {t('datasource.schema_validation_run', 'Schema prüfen')}
                        </button>
                    </div>
                    {schemaValidationSummary && (
                        <div className="space-y-2">
                            <InlineAlert
                                type={schemaValidationSummary.issues > 0 ? 'warning' : 'success'}
                                title={schemaValidationSummary.issues > 0
                                    ? t('datasource.schema_validation_result_warning', 'Validierung mit Hinweisen abgeschlossen')
                                    : t('datasource.schema_validation_result_ok', 'Validierung erfolgreich abgeschlossen')}
                                message={
                                    schemaValidationSummary.issues > 0
                                        ? t('datasource.schema_validation_summary_with_issues', '{{issues}} Problem(e) gefunden. Tabellen: {{tables}}, Spalten: {{columns}}, Beziehungen: {{relationships}}.', {
                                            issues: schemaValidationSummary.issues,
                                            technicalIssues: schemaTechnicalIssues,
                                            tables: schemaValidationSummary.checked_tables,
                                            columns: schemaValidationSummary.checked_columns,
                                            relationships: schemaValidationSummary.checked_relationships,
                                            relationshipReviews: schemaValidationSummary.relationships_needing_review
                                        })
                                        : t('datasource.schema_validation_summary_ok', 'Keine technischen Probleme gefunden. Tabellen: {{tables}}, Spalten: {{columns}}, Beziehungen: {{relationships}}.', {
                                            technicalIssues: schemaTechnicalIssues,
                                            tables: schemaValidationSummary.checked_tables,
                                            columns: schemaValidationSummary.checked_columns,
                                            relationships: schemaValidationSummary.checked_relationships,
                                            relationshipReviews: schemaValidationSummary.relationships_needing_review
                                        })
                                }
                            />
                            {schemaValidationSummary.issues > 0 && (
                                <div className="flex flex-wrap items-center gap-2">
                                    {schemaTechnicalIssues > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => jumpToSchemaFindings('issues')}
                                            className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300"
                                        >
                                            <AlertTriangle className="h-3.5 w-3.5" />
                                            {t('datasource.schema_validation_show_issues', 'Probleme anzeigen')}
                                        </button>
                                    )}
                                    {schemaValidationSummary.relationships_needing_review > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => jumpToSchemaFindings('review')}
                                            className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300"
                                        >
                                            <Search className="h-3.5 w-3.5" />
                                            {t('datasource.schema_validation_show_review', 'Prüffälle anzeigen')}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    {schemaCleanupSummary && schemaCleanupSummary.removed_total > 0 && (
                        <InlineAlert
                            type="success"
                            title={t('datasource.schema_cleanup_result_ok', 'Bereinigung abgeschlossen')}
                            message={t('datasource.schema_cleanup_summary', '{{count}} Eintrag/Einträge entfernt. Tabellen: {{tables}}, Spalten: {{columns}}, Beziehungen: {{relationships}}.', {
                                count: schemaCleanupSummary.removed_total,
                                tables: schemaCleanupSummary.removed_tables,
                                columns: schemaCleanupSummary.removed_columns,
                                relationships: schemaCleanupSummary.removed_relationships
                            })}
                        />
                    )}
                </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/30">
                <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                    <h4 className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-300">
                        {t('datasource.schema_exchange_title', 'Austausch')}
                    </h4>
                    <p className="mt-1 text-[11px] text-slate-400">
                        {t('datasource.schema_export_hint', 'Exportiert technisches Schema und Dokumentation als JSON, ohne Daten oder Beispielwerte.')}
                    </p>
                </div>
                <div className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => { void handleExportSchemaPackage(); }}
                            disabled={isExportingSchemaPackage}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-900"
                        >
                            {isExportingSchemaPackage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            {t('datasource.schema_export_run', 'Schema exportieren')}
                        </button>
                        <button
                            type="button"
                            onClick={() => schemaImportInputRef.current?.click()}
                            disabled={isAnalyzingSchemaImport}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-900"
                        >
                            {isAnalyzingSchemaImport ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                            {t(
                                schemaImportAnalysis || schemaImportMergeSummary
                                    ? 'datasource.schema_import_analyze_new_run'
                                    : 'datasource.schema_import_analyze_run',
                                schemaImportAnalysis || schemaImportMergeSummary
                                    ? 'Neue Datei analysieren'
                                    : 'Schema-Datei analysieren'
                            )}
                        </button>
                        <input
                            ref={schemaImportInputRef}
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) {
                                    void handleAnalyzeSchemaImport(file);
                                }
                            }}
                        />
                        {pendingSchemaImportPackage && schemaImportAnalysis && !schemaImportMergeSummary && schemaImportConflictCount === 0 && (
                            <button
                                type="button"
                                onClick={() => { void handleMergeSchemaImport(); }}
                                disabled={isMergingSchemaImport}
                                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isMergingSchemaImport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                {t('datasource.schema_import_merge_run', 'Fehlende Doku ergänzen')}
                            </button>
                        )}
                        {(schemaImportAnalysis || schemaImportMergeSummary) && (
                            <button
                                type="button"
                                onClick={resetSchemaImportWorkflow}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300 dark:hover:bg-slate-900"
                            >
                                <RefreshCw className="h-4 w-4" />
                                {t('datasource.schema_import_reset', 'Analyse zurücksetzen')}
                            </button>
                        )}
                    </div>
                    {schemaImportAnalysis && !schemaImportMergeSummary && (
                        <div className="space-y-3">
                            <InlineAlert
                                type="info"
                                title={t('datasource.schema_import_analysis_title', 'Importdatei analysiert')}
                                message={t('datasource.schema_import_analysis_summary', 'Objekte: {{objectMatches}} Treffer, {{objectMissingLocal}} nicht lokal, {{objectMissingImport}} nur lokal. Spalten: {{columnMatches}} Treffer, {{columnMissingLocal}} nicht lokal, {{columnMissingImport}} nur lokal. Beziehungen: {{relationshipMatches}} gültig, {{relationshipInvalid}} ungültig.', {
                                    objectMatches: schemaImportAnalysis.summary.objects_direct_match,
                                    objectMissingLocal: schemaImportAnalysis.summary.objects_missing_local,
                                    objectMissingImport: schemaImportAnalysis.summary.objects_missing_import,
                                    columnMatches: schemaImportAnalysis.summary.columns_direct_match,
                                    columnMissingLocal: schemaImportAnalysis.summary.columns_missing_local,
                                    columnMissingImport: schemaImportAnalysis.summary.columns_missing_import,
                                    relationshipMatches: schemaImportAnalysis.summary.relationships_direct_match,
                                    relationshipInvalid: schemaImportAnalysis.summary.relationships_invalid
                                })}
                            />

                            {schemaImportAnalysis.summary.conflicts > 0 && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                                        <div>
                                            <div className="text-[11px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">
                                                {t('datasource.schema_import_analysis_conflicts_title', 'Konflikte')}
                                            </div>
                                            <div className="mt-1 text-[10px] text-amber-700/80 dark:text-amber-300/80">
                                                {t('datasource.schema_import_conflict_review_hint', '{{selected}} von {{total}} Konflikten stehen auf Import und werden erst beim Merge übernommen.', {
                                                    selected: schemaImportUseImportCount,
                                                    total: schemaImportConflictCount
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <span className="inline-flex items-center rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[10px] font-bold text-blue-700 dark:border-blue-900/40 dark:bg-slate-950/40 dark:text-blue-300">
                                            {t('datasource.schema_import_conflicts_selected_short', 'Import: {{count}}', {
                                                count: schemaImportUseImportCount
                                            })}
                                        </span>
                                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                                            {t('datasource.schema_import_conflicts_kept_short', 'Lokal: {{count}}', {
                                                count: schemaImportConflictCount - schemaImportUseImportCount
                                            })}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={openSchemaImportConflictDialog}
                                            className="inline-flex items-center rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[10px] font-bold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-900/40 dark:bg-slate-950/40 dark:text-amber-300 dark:hover:bg-amber-950/30"
                                        >
                                            {t('datasource.schema_import_conflicts_open_dialog', 'Konflikte prüfen')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {schemaDocsShowImportDifferences && schemaImportObjectIssues.length > 0 && (
                                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                                    <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-300">
                                        {t('datasource.schema_import_analysis_objects_title', 'Weitere Unterschiede')}
                                    </div>
                                    <div className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                                        {schemaImportObjectIssues.map((entry, index) => (
                                                <div key={`${entry.object_type}:${entry.technical_name}:${entry.status}:${index}`} className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-950/40">
                                                    <span className="font-mono">{entry.technical_name}</span>
                                                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                                        {entry.status === 'missing_local'
                                                            ? t('datasource.schema_import_status_missing_local', 'Nicht lokal')
                                                            : t('datasource.schema_import_status_missing_import', 'Nur lokal')}
                                                    </span>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}

                            {schemaDocsShowImportDifferences && schemaImportColumnIssues.length > 0 && (
                                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                                    <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-300">
                                        {t('datasource.schema_import_analysis_columns_title', 'Spalten')}
                                    </div>
                                    <div className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                                        {schemaImportColumnIssues.slice(0, 24).map((entry, index) => (
                                                <div key={`${entry.table_name}:${entry.column_name}:${entry.status}:${index}`} className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-950/40">
                                                    <span className="font-mono">{entry.table_name}.{entry.column_name}</span>
                                                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                                        {entry.status === 'missing_local'
                                                            ? t('datasource.schema_import_status_missing_local', 'Nicht lokal')
                                                            : t('datasource.schema_import_status_missing_import', 'Nur lokal')}
                                                    </span>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}

                            {schemaDocsShowImportDifferences && schemaImportRelationshipIssues.length > 0 && (
                                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                                    <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-300">
                                        {t('datasource.schema_import_analysis_relationships_title', 'Beziehungen')}
                                    </div>
                                    <div className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                                        {schemaImportRelationshipIssues.map((entry, index) => (
                                                <div key={`${entry.id}:${entry.status}:${index}`} className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-950/40">
                                                    <span className="font-mono">{entry.id}</span>
                                                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                                        {entry.status === 'invalid_source'
                                                            ? t('datasource.schema_import_status_invalid_source', 'Quelle ungültig')
                                                            : t('datasource.schema_import_status_invalid_target', 'Ziel ungültig')}
                                                    </span>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {schemaImportMergeSummary && (
                        <div className="space-y-3">
                            {schemaImportConflictCount > 0 && (
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                                    <div className="text-[11px] font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                                        {t('datasource.schema_import_merge_conflicts_title', 'Konfliktauflösung')}
                                    </div>
                                    <div className="mt-1 text-[10px] text-emerald-700/80 dark:text-emerald-300/80">
                                        {t('datasource.schema_import_merge_conflicts_summary', '{{applied}} Konflikte per Import übernommen, {{kept}} lokal behalten.', {
                                            applied: schemaImportAppliedConflicts.length,
                                            kept: schemaImportKeptLocalConflicts.length
                                        })}
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:border-emerald-900/40 dark:bg-slate-950/40 dark:text-emerald-300">
                                            {t('datasource.schema_import_merge_conflicts_applied_short', 'Import: {{count}}', {
                                                count: schemaImportAppliedConflicts.length
                                            })}
                                        </span>
                                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                                            {t('datasource.schema_import_merge_conflicts_kept_short', 'Lokal: {{count}}', {
                                                count: schemaImportKeptLocalConflicts.length
                                            })}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={openSchemaImportConflictDialog}
                                            className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[10px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-slate-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                                        >
                                            {t('datasource.schema_import_conflicts_open_dialog', 'Konflikte prüfen')}
                                        </button>
                                    </div>
                                </div>
                            )}
                            {schemaImportConflictCount === 0 && (
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                                    <div className="text-[11px] font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                                        {t('datasource.schema_import_merge_conflicts_title', 'Konfliktauflösung')}
                                    </div>
                                    <div className="mt-1 text-[10px] text-emerald-700/80 dark:text-emerald-300/80">
                                        {t('datasource.schema_import_merge_no_conflicts', 'Die Dokumentation wurde übernommen. Es waren keine Konflikte zu prüfen.')}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const openSchemaDocumentation = (tableName: string) => {
        setSelectedTable(tableName);
        setIsSchemaToolsOpen(false);
        setIsSchemaDocsOpen(true);
    };

    const openSchemaTools = () => {
        setIsSchemaDocsOpen(false);
        setIsSchemaToolsOpen(true);
    };

    const openInTablesView = (tableName: string) => {
        setSelectedTable(tableName);
        navigate('/tables', { state: { initialTable: tableName } });
    };

    const closeSchemaDocumentation = () => {
        if (selectedTable && schemaDocDraftReady && schemaDocSnapshot !== schemaDocLastSavedSnapshotRef.current && !isSavingSchemaDocs) {
            void handleSaveSchemaDocumentation({ silent: true });
        }
        setIsSchemaDocsOpen(false);
    };

    const closeSchemaTools = () => {
        setIsSchemaToolsOpen(false);
    };

    const jumpToSchemaFindings = (filter: StructureSchemaFilter) => {
        setStructureSchemaFilter(filter);
        setVisibleUserTablesCount(STRUCTURE_META_BATCH_SIZE);
        setVisibleUserViewsCount(STRUCTURE_META_BATCH_SIZE);
        setIsSchemaToolsOpen(false);
    };

    const toggleSchemaDocSection = (key: keyof typeof schemaDocSections) => {
        setSchemaDocSections((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <PageLayout
            header={{
                title: t('sidebar.datasource'),
                subtitle: t('datasource.subtitle'),
                onBack: () => navigate(-1)
            }}
            footer={footerText}
            breadcrumbs={[{ label: t('sidebar.datasource') }]}
        >
            <div className={`max-w-6xl space-y-6 ${isReadOnly ? 'opacity-80' : ''}`}>
                <div className="border-b border-[rgb(var(--ui-border))] dark:border-slate-700">
                    <div className="flex items-center gap-6 px-1 overflow-x-auto whitespace-nowrap no-scrollbar">
                        <button
                            onClick={() => setActiveTab('import')}
                            className={`relative py-3 text-sm font-bold transition-colors ${activeTab === 'import' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            {t('datasource.tab_import')}
                            {activeTab === 'import' && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-blue-600 dark:bg-blue-400" />}
                        </button>
                        <button
                            onClick={() => setActiveTab('structure')}
                            className={`relative py-3 text-sm font-bold transition-colors ${activeTab === 'structure' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            {t('datasource.tab_structure')}
                            {activeTab === 'structure' && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-blue-600 dark:bg-blue-400" />}
                        </button>
                        <button
                            onClick={() => setActiveTab('system')}
                            className={`relative py-3 text-sm font-bold transition-colors ${activeTab === 'system' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            {t('datasource.tab_system')}
                            {activeTab === 'system' && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-blue-600 dark:bg-blue-400" />}
                        </button>
                        <button
                            onClick={() => setActiveTab('danger')}
                            className={`relative py-3 text-sm font-bold transition-colors ${activeTab === 'danger' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            {t('datasource.tab_danger_zone', 'Gefahrenzone')}
                            {activeTab === 'danger' && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-blue-600 dark:bg-blue-400" />}
                        </button>
                    </div>
                </div>

                {/* --- TAB: IMPORT (Smart & Generic) --- */}
                {activeTab === 'import' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                        {/* 1. Smart Import (New Tables) */}
                        <div className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm ${isReadOnly ? 'pointer-events-none opacity-60' : ''}`}>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600">
                                    <Plus className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">{t('datasource.smart_import_title')}</h3>
                                    <p className="text-xs text-slate-400">{t('datasource.smart_import_hint')}</p>
                                </div>
                            </div>
                            <SmartImport />
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1" />
                            <span className="text-xs font-bold text-slate-400 uppercase">{t('datasource.or_separator')}</span>
                            <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1" />
                        </div>

                        {/* 2. Generic Import (Append Data) */}
                        <div className={`bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm ${isReadOnly ? 'pointer-events-none opacity-60' : ''}`}>
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-white dark:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 shadow-sm">
                                        <Database className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">{t('datasource.append_data_title')}</h3>
                                        <p className="text-xs text-slate-400">{t('datasource.append_data_hint')}</p>
                                    </div>
                                </div>
                                <MappingManager />
                            </div>

                            <div className="mb-6">
                                <div className="flex items-center gap-2">
                                    <select
                                        value={selectedTable}
                                        onChange={e => setSelectedTable(e.target.value)}
                                        className="w-full md:w-1/2 p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="" disabled>{t('datasource.select_target_table')}</option>
                                        {tables?.filter((t: string) => !isSystemTable(t)).map((t: string) => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                    <button onClick={() => refreshTables()} className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg">
                                        <RefreshCw className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {selectedTable && (
                                <ExcelImport
                                    key={selectedTable}
                                    onImportComplete={onImportComplete}
                                    config={activeConfig}
                                />
                            )}
                        </div>
                    </div>
                )}

                {/* --- TAB: STRUCTURE (Schema & Tables) --- */}
                {activeTab === 'structure' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                                    <FileText className="h-4 w-4" /> {t('datasource.schema_documentation_title', 'Schema-Dokumentation')}
                                </h3>
                                <p className="mt-1 text-xs text-slate-400">
                                    {hasAnySchemaDocumentation
                                        ? t('datasource.schema_documentation_hint', 'Pflegen Sie sprechende Namen und kurze Beschreibungen fuer Tabellen und Spalten.')
                                        : t('datasource.schema_documentation_optional_hint', 'Optional: Ergänzen Sie sprechende Namen, Beschreibungen und Beziehungen für Ihr Schema.')}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {schemaValidationSummary && (
                                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold ${
                                        schemaValidationSummary.issues > 0
                                            ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300'
                                            : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300'
                                    }`}>
                                        {schemaValidationSummary.issues > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                                        {schemaValidationSummary.issues > 0
                                            ? t('datasource.schema_validation_result_warning', 'Validierung mit Hinweisen abgeschlossen')
                                            : t('datasource.schema_validation_result_ok', 'Validierung erfolgreich abgeschlossen')}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={openSchemaTools}
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-900"
                                >
                                    <Info className="h-4 w-4" />
                                    {t('datasource.schema_tools_title', 'Schema Tools')}
                                </button>
                            </div>
                        </div>

                        {/* Custom Tables Manager */}
                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        <TableIcon className="w-4 h-4" /> {t('datasource.user_tables')}
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-1">{t('datasource.user_tables_hint')}</p>
                                </div>
                                {!isReadOnly && (
                                    <button
                                        onClick={openCreateTableModal}
                                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                                    >
                                        <Plus className="w-4 h-4" /> {t('datasource.new_table')}
                                    </button>
                                )}
                            </div>

                            {userTables.length === 0 ? (
                                <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/40">
                                    <p className="text-slate-400 dark:text-slate-500 text-sm">{t('datasource.no_user_tables')}</p>
                                </div>
                            ) : filteredUserTables.length === 0 ? (
                                <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/40">
                                    <p className="text-slate-400 dark:text-slate-500 text-sm">{t('datasource.no_user_tables_filtered', 'Keine Tabellen passen zum aktuellen Filter.')}</p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {visibleUserTables.map((t_name: string) => {
                                            const tableDoc = schemaTableDocByKey[getSchemaDocKey(t_name, 'table')];
                                            const displayName = tableDoc?.display_name?.trim() || '';
                                            const description = tableDoc?.description?.trim() || '';
                                            const statusMeta = tableDoc ? getSchemaStatusMeta(tableDoc.status || 'valid', t) : null;

                                            return (
                                                <div
                                                    key={t_name}
                                                    className={`p-4 border rounded-xl flex items-center justify-between group transition-colors ${
                                                        selectedTable === t_name
                                                            ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                                                            : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700'
                                                    }`}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => { setSelectedTable(t_name); }}
                                                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                                    >
                                                        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm text-blue-600 dark:text-blue-400">
                                                            <TableIcon className="w-4 h-4" />
                                                        </div>
                                                        <div className="flex min-w-0 flex-col gap-0.5">
                                                            {renderSchemaObjectTitle(t_name, displayName)}
                                                            {description && (
                                                                <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                                                                    {description}
                                                                </span>
                                                            )}
                                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                                                {t('datasource.table_meta_rows', { count: tableMetaStats?.[t_name]?.rows ?? 0 })}
                                                                    {' • '}
                                                                    {t('datasource.table_meta_indexes', { count: tableMetaStats?.[t_name]?.indexes ?? 0 })}
                                                                </span>
                                                                {statusMeta && (
                                                                    renderSchemaStatusBadge(statusMeta, true)
                                                                )}
                                                            </div>
                                                        </div>
                                                    </button>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); openSchemaDocumentation(t_name); }}
                                                            className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded transition-colors"
                                                            title={t('datasource.schema_documentation_title', 'Schema-Dokumentation')}
                                                        >
                                                            <FileText className="w-4 h-4" />
                                                        </button>
                                                        {!isReadOnly && (
                                                            <>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); void openCreateIndexModal(t_name); }}
                                                                    className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition-colors"
                                                                    title={t('datasource.create_index_title', 'Index erstellen')}
                                                                >
                                                                    <ListPlus className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        openInTablesView(t_name);
                                                                    }}
                                                                    className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                                                                    title={t('datasource.open_in_tables_view', 'In Tabellenansicht öffnen')}
                                                                >
                                                                    <Upload className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); void handleDropTable(t_name); }}
                                                                    className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                                    title={t('common.delete')}
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {visibleUserTables.length < filteredUserTables.length && (
                                        <div className="mt-4 flex justify-center">
                                            <button
                                                type="button"
                                                onClick={() => setVisibleUserTablesCount((prev) => Math.min(prev + STRUCTURE_META_BATCH_SIZE, filteredUserTables.length))}
                                                className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                            >
                                                {t('common.load_more', 'Mehr laden')} ({visibleUserTables.length}/{filteredUserTables.length})
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Views Manager */}
                        {schemaDocsIncludeViews && (
                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        <TableIcon className="w-4 h-4" /> {t('datasource.user_views', 'Views')}
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-1">
                                        {t('datasource.user_views_hint', 'SQL views available in the local database.')}
                                    </p>
                                </div>
                            </div>

                            {userViews.length === 0 ? (
                                <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/40">
                                    <p className="text-slate-400 dark:text-slate-500 text-sm">{t('datasource.no_user_views', 'No views available.')}</p>
                                </div>
                            ) : filteredUserViews.length === 0 ? (
                                <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/40">
                                    <p className="text-slate-400 dark:text-slate-500 text-sm">{t('datasource.no_user_views_filtered', 'Keine Views passen zum aktuellen Filter.')}</p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {visibleUserViews.map((view) => {
                                            const viewDoc = schemaTableDocByKey[getSchemaDocKey(view.name, 'view')];
                                            const displayName = viewDoc?.display_name?.trim() || '';
                                            const description = viewDoc?.description?.trim() || '';
                                            const statusMeta = viewDoc ? getSchemaStatusMeta(viewDoc.status || 'valid', t) : null;

                                            return (
                                                <div
                                                    key={view.name}
                                                    className={`p-4 border rounded-xl flex items-center justify-between group transition-colors ${
                                                        selectedTable === view.name
                                                            ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                                                            : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700'
                                                    }`}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => { if (viewMetaStats?.[view.name]?.valid !== false) setSelectedTable(view.name); }}
                                                        disabled={viewMetaStats?.[view.name]?.valid === false}
                                                        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
                                                    >
                                                        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm text-indigo-600 dark:text-indigo-400">
                                                            <TableIcon className="w-4 h-4" />
                                                        </div>
                                                        <div className="min-w-0 flex flex-col gap-0.5">
                                                            {renderSchemaObjectTitle(view.name, displayName)}
                                                            {description && (
                                                                <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                                                                    {description}
                                                                </span>
                                                            )}
                                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                                {viewMetaStats?.[view.name]?.valid === false ? (
                                                                    <span
                                                                        className="text-[10px] text-rose-500"
                                                                        title={viewMetaStats?.[view.name]?.error}
                                                                    >
                                                                        {t('datasource.view_invalid', 'Defekter View')}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                                                        {t('datasource.table_meta_rows', { count: viewMetaStats?.[view.name]?.rows ?? 0 })}
                                                                    </span>
                                                                )}
                                                                {statusMeta && (
                                                                    renderSchemaStatusBadge(statusMeta, true)
                                                                )}
                                                            </div>
                                                        </div>
                                                    </button>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); openSchemaDocumentation(view.name); }}
                                                            disabled={viewMetaStats?.[view.name]?.valid === false}
                                                            className={`p-1.5 rounded transition-colors ${
                                                                viewMetaStats?.[view.name]?.valid === false
                                                                    ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                                                    : 'text-slate-400 dark:text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20'
                                                            }`}
                                                            title={t('datasource.schema_documentation_title', 'Schema-Dokumentation')}
                                                        >
                                                            <FileText className="w-4 h-4" />
                                                        </button>
                                                        {!isReadOnly && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); void handleDropView(view.name); }}
                                                                className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                                title={t('datasource.drop_view_title', 'Delete view')}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {visibleUserViews.length < filteredUserViews.length && (
                                        <div className="mt-4 flex justify-center">
                                            <button
                                                type="button"
                                                onClick={() => setVisibleUserViewsCount((prev) => Math.min(prev + STRUCTURE_META_BATCH_SIZE, filteredUserViews.length))}
                                                className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                            >
                                                {t('common.load_more', 'Mehr laden')} ({visibleUserViews.length}/{filteredUserViews.length})
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        )}

                        {/* System Tables Read-Only */}
                        {isAdminMode && (
                            <div className="bg-slate-100 dark:bg-slate-800/50 rounded-2xl p-6">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{t('datasource.system_tables')}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {systemTables.map((t_name: string) => {
                                        const meta = getSystemTableMeta(t_name);
                                        return (
                                            <div
                                                key={t_name}
                                                className={`p-4 border rounded-xl flex items-center justify-between group transition-colors ${
                                                    selectedTable === t_name
                                                        ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                                                        : 'bg-white/50 dark:bg-slate-800/60 border-slate-200/50 dark:border-slate-700'
                                                }`}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => { setSelectedTable(t_name); setIsSchemaDocsOpen(false); }}
                                                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                                    >
                                                    <div className="relative p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm text-blue-600 dark:text-blue-400">
                                                        <TableIcon className="w-4 h-4" />
                                                        <span className="absolute -right-1 -bottom-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900">
                                                            <Lock className="h-2 w-2" />
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        {renderSchemaObjectTitle(t_name, meta?.displayName)}
                                                        {schemaDocsShowSystemDescriptions && meta?.description && (
                                                            <span className="text-[10px] text-slate-400 dark:text-slate-500 line-clamp-2">{meta.description}</span>
                                                        )}
                                                    </div>
                                                </button>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); openInTablesView(t_name); }}
                                                        className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                                                        title={t('datasource.open_in_tables_view', 'In Tabellenansicht öffnen')}
                                                    >
                                                        <Upload className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); openSchemaDocumentation(t_name); }}
                                                        className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded transition-colors"
                                                        title={t('datasource.schema_documentation_title', 'Schema-Dokumentation')}
                                                    >
                                                        <FileText className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* --- TAB: SYSTEM (Maintenace & Backup) --- */}
                {(activeTab === 'system' || activeTab === 'danger') && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {activeTab === 'system' && (
                            <>
                        {/* Backup Section */}
                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">{t('datasource.backup_restore')}</h3>

                            {isBackupRecommended && (
                                <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 rounded-lg border border-amber-200 dark:border-amber-800/50 text-xs flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" />
                                    <span>{t('datasource.backup_recommended', { count: changeCount })}</span>
                                </div>
                            )}

                            <div className="space-y-4">
                                {/* Encryption Toggle */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setUseEncryption(!useEncryption)}
                                        className={`flex-1 p-3 rounded-xl border flex items-center gap-3 transition-all ${useEncryption ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 ring-1 ring-emerald-500/70 dark:ring-emerald-700/70' : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700'}`}
                                    >
                                        <div className={`p-2 rounded-lg ${useEncryption ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300'}`}>
                                            {useEncryption ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                                        </div>
                                        <div className="text-left">
                                            <div className={`text-sm font-bold ${useEncryption ? 'text-emerald-900 dark:text-emerald-200' : 'text-slate-600 dark:text-slate-200'}`}>
                                                {useEncryption ? t('datasource.encryption_active') : t('datasource.encryption_standard')}
                                            </div>
                                            <div className="text-xs text-slate-400 dark:text-slate-500">
                                                {useEncryption ? t('datasource.encryption_active_hint') : t('datasource.encryption_standard_hint')}
                                            </div>
                                        </div>
                                    </button>
                                </div>

                                {useEncryption && (
                                    <div className="animate-in fade-in slide-in-from-top-2">
                                        <input
                                            type="password"
                                            placeholder={t('datasource.backup_password_placeholder')}
                                            value={backupPassword}
                                            onChange={e => setBackupPassword(e.target.value)}
                                            className="w-full p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                                            autoFocus
                                        />
                                    </div>
                                )}

                                {restoreAlert && (
                                    <div className="mb-4">
                                        <InlineAlert
                                            type={restoreAlert.type}
                                            title={restoreAlert.title}
                                            message={restoreAlert.message}
                                            details={restoreAlert.details}
                                            onClose={() => setRestoreAlert(null)}
                                        />
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                    <button
                                        onClick={async () => {
                                            let fileName = '';
                                            let locationType: 'remembered_folder' | 'browser_download' | 'unknown' = 'unknown';
                                            let locationLabel = '';
                                            try {
                                                if (useEncryption) {
                                                    const password = backupPassword.trim();
                                                    if (!password) {
                                                        await appDialog.warning(t('datasource.backup_password_required'));
                                                        return;
                                                    }
                                                    if (isWeakBackupPassword(password)) {
                                                        const proceed = await appDialog.confirm(t('datasource.backup_password_weak_confirm'));
                                                        if (!proceed) return;
                                                    }
                                                }

                                                const bytes = await exportDatabase();
                                                const plainBuffer = new Uint8Array(bytes).buffer;
                                                let outputBuffer: ArrayBuffer = plainBuffer;

                                                if (useEncryption) {
                                                    outputBuffer = await encryptBuffer(plainBuffer, backupPassword.trim());
                                                }

                                                fileName = buildBackupFileName(backupNamePattern, useEncryption);
                                                let savedToRememberedLocation = false;
                                                if (backupUseSavedLocation && backupDirectorySupported) {
                                                    try {
                                                        savedToRememberedLocation = await saveBackupToRememberedDirectory(outputBuffer, fileName);
                                                    } catch {
                                                        savedToRememberedLocation = false;
                                                    }
                                                }

                                                if (!savedToRememberedLocation) {
                                                    const blob = new Blob([outputBuffer], { type: 'application/x-sqlite3' });
                                                    const url = URL.createObjectURL(blob);
                                                    const a = document.createElement('a');
                                                    a.href = url;
                                                    a.download = fileName;
                                                    a.click();
                                                }

                                                markBackupComplete();
                                                if (useEncryption) setBackupPassword('');
                                                const savedFolderLabel = getSavedBackupDirectoryLabel();
                                                const locationHint = savedToRememberedLocation
                                                    ? (savedFolderLabel
                                                        ? t('datasource.backup_saved_location_named', { folder: savedFolderLabel })
                                                        : t('datasource.backup_saved_location_remembered', 'Remembered backup folder'))
                                                    : t('datasource.backup_saved_location_downloads', 'Browser download folder');
                                                locationType = savedToRememberedLocation ? 'remembered_folder' : 'browser_download';
                                                locationLabel = savedToRememberedLocation ? (savedFolderLabel || '') : locationHint;
                                                await appendBackupHistorySafe({
                                                    action: 'backup',
                                                    status: 'success',
                                                    fileName,
                                                    locationType,
                                                    locationLabel,
                                                    encrypted: useEncryption,
                                                    message: locationHint
                                                });
                                                await appDialog.info(
                                                    t(
                                                        'datasource.backup_saved_success_details',
                                                        {
                                                            fileName,
                                                            location: locationHint
                                                        }
                                                    )
                                                );
                                            } catch (err: unknown) {
                                                await appendBackupHistorySafe({
                                                    action: 'backup',
                                                    status: 'error',
                                                    fileName: fileName || '-',
                                                    locationType,
                                                    locationLabel,
                                                    encrypted: useEncryption,
                                                    message: getErrorMessage(err)
                                                });
                                                await appDialog.error(
                                                    `${t('datasource.backup_save_failed', 'Backup could not be created.')}: ${getErrorMessage(err)}`
                                                );
                                            }
                                        }}
                                        className={`flex items-center justify-center gap-2 p-3 border rounded-lg text-sm font-bold transition-colors ${useEncryption ? 'bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700' : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                    >
                                        <Database className="w-4 h-4" />
                                        {useEncryption ? t('datasource.save_backup_secure') : t('datasource.save_backup_standard')}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => { void handleStartRestore(); }}
                                        className={`flex items-center justify-center gap-2 p-3 border rounded-lg text-sm font-bold transition-colors ${useEncryption ? 'bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700' : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                    >
                                        <Upload className="w-4 h-4 text-amber-500" /> {t('datasource.restore_backup')}
                                    </button>
                                    <input
                                        ref={restoreInputRef}
                                        type="file"
                                        accept=".sqlite3,.sqlite,.db"
                                        className="hidden"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            setRestoreAlert(null);
                                            await processRestoreFile(file, { type: 'file_picker' });
                                            e.currentTarget.value = '';
                                        }}
                                    />
                                </div>

                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                                    {t('datasource.backup_history_title', 'Backup-Verlauf')}
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => { void refreshBackupHistory(); }}
                                    className="text-xs font-semibold text-blue-600 dark:text-blue-300 hover:underline"
                                >
                                    {t('common.refresh', 'Aktualisieren')}
                                </button>
                            </div>
                            {backupHistoryEntries.length === 0 ? (
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    {t('datasource.backup_history_empty', 'Noch keine Backup-/Restore-Einträge vorhanden.')}
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {backupHistoryEntries.map((entry) => (
                                        <div
                                            key={entry.id}
                                            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 px-3 py-2"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                                                    {entry.action === 'backup'
                                                        ? t('datasource.backup_history_action_backup', 'Backup')
                                                        : t('datasource.backup_history_action_restore', 'Restore')}
                                                    {' · '}
                                                    {entry.fileName}
                                                </div>
                                                <div className={`text-[11px] font-bold uppercase ${entry.status === 'success'
                                                    ? 'text-emerald-600 dark:text-emerald-300'
                                                    : entry.status === 'warning'
                                                        ? 'text-amber-600 dark:text-amber-300'
                                                        : 'text-red-600 dark:text-red-300'
                                                    }`}>
                                                    {entry.status}
                                                </div>
                                            </div>
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                                {new Date(entry.timestamp).toLocaleString()} · {entry.locationLabel || entry.locationType}
                                                {entry.encrypted ? ` · ${t('datasource.backup_history_encrypted', 'verschlüsselt')}` : ''}
                                            </div>
                                            {entry.message ? (
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                                    {entry.message}
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                            </>
                        )}

                        {/* Danger Zone */}
                        {activeTab === 'danger' && (
                        <div className="bg-red-50/50 dark:bg-red-900/10 rounded-2xl border border-red-200 dark:border-red-900/50 p-6 shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-lg">
                                    <AlertTriangle className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col">
                                    <h3 className="text-sm font-bold text-red-900 dark:text-red-400 uppercase tracking-wider leading-none">
                                        {t('datasource.danger_zone')}
                                    </h3>
                                    <p className="text-xs text-red-700/70 dark:text-red-300/60 mt-1">
                                        {t('datasource.danger_zone_hint')}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                                {/* Clear Data Card */}
                                <div className="bg-white dark:bg-slate-900 border border-red-100 dark:border-red-900/20 rounded-xl p-4 shadow-sm">
                                    <h4 className="text-xs font-black text-slate-400 uppercase mb-3">{t('datasource.clear_reset')}</h4>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <select
                                                id="clear-table-select"
                                                className="flex-1 p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs outline-none"
                                                defaultValue=""
                                            >
                                                <option value="" disabled>{t('datasource.select_target_table')}</option>
                                                {(isAdminMode ? tables : userTables)?.map((table_n: string) => <option key={table_n} value={table_n}>{table_n}</option>)}
                                            </select>
                                            <button
                                                onClick={() => {
                                                    const select = document.getElementById('clear-table-select') as HTMLSelectElement;
                                                    if (select.value) handleClearTable(select.value);
                                                }}
                                                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-xs transition-colors"
                                            >
                                                {t('datasource.clear_btn')}
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-400 italic">{t('datasource.clear_reset_hint')}</p>
                                    </div>
                                </div>

                                {/* Drop Table Card */}
                                <div className="bg-white dark:bg-slate-900 border border-red-100 dark:border-red-900/20 rounded-xl p-4 shadow-sm">
                                    <h4 className="text-xs font-black text-slate-400 uppercase mb-3">{t('datasource.drop_table_title')}</h4>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <select
                                                id="drop-table-select"
                                                className="flex-1 p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs outline-none"
                                                defaultValue=""
                                            >
                                                <option value="" disabled>{t('datasource.select_target_table')}</option>
                                                {userTables.map((table_n: string) => <option key={`tbl-${table_n}`} value={`table:${table_n}`}>{table_n}</option>)}
                                                {userViews.map((view_n) => <option key={`view-${view_n.name}`} value={`view:${view_n.name}`}>{view_n.name} (view)</option>)}
                                            </select>
                                            <button
                                                onClick={() => {
                                                    const select = document.getElementById('drop-table-select') as HTMLSelectElement;
                                                    if (!select.value) return;
                                                    const [objType, objName] = select.value.split(':');
                                                    if (!objName) return;
                                                    if (objType === 'view') handleDropView(objName);
                                                    else handleDropTable(objName);
                                                }}
                                                disabled={userTables.length === 0 && userViews.length === 0}
                                                className="px-3 py-2 bg-red-900 hover:bg-black text-white rounded font-bold text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                {t('datasource.drop_btn')}
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-400 italic">{t('datasource.drop_table_hint')}</p>
                                    </div>
                                </div>

                                {/* SQL Manager Reset Card */}
                                <div className="bg-white dark:bg-slate-900 border border-red-100 dark:border-red-900/20 rounded-xl p-4 shadow-sm">
                                    <h4 className="text-xs font-black text-slate-400 uppercase mb-3">{t('datasource.sql_manager_reset_title', 'SQL Manager reset')}</h4>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <button
                                                disabled={isResettingSqlManager}
                                                onClick={() => { void handleResetSqlManager(); }}
                                                className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded font-bold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isResettingSqlManager && <Loader2 className="w-4 h-4 animate-spin" />}
                                                {t('datasource.sql_manager_reset_btn', 'Reset SQL Manager')}
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-400 italic">{t('datasource.sql_manager_reset_hint', 'Deletes all saved SQL statements in the SQL Manager, including favorites and usage counters.')}</p>
                                    </div>
                                </div>

                                {/* Factory Reset Card */}
                                <div className="bg-white dark:bg-slate-900 border border-red-100 dark:border-red-900/20 rounded-xl p-4 shadow-sm md:col-span-2">
                                    <h4 className="text-xs font-black text-slate-400 uppercase mb-3">{t('datasource.factory_reset_title', 'Werkseinstellungen')}</h4>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <button
                                                disabled={isResetting}
                                                onClick={async () => {
                                                    const confirmText = t('datasource.factory_reset_confirm', 'Bist du sicher? Alle Daten (inkl. Tabellen, Views und Indizes), Dashboards, Widgets und lokale Einstellungen werden endgueltig geloescht. Dies kann nicht rueckgaengig gemacht werden!');
                                                    if (await appDialog.confirm(confirmText)) {
                                                        const promptText = await appDialog.prompt(t('datasource.factory_reset_prompt', 'Bitte tippe "RESET" ein, um fortzufahren:'));
                                                        if (promptText === 'RESET') {
                                                            try {
                                                                setIsResetting(true);
                                                                await factoryResetDatabase();
                                                                await resetEnvironmentSettings();
                                                                await appDialog.info(t('datasource.factory_reset_success', 'Datenbank wurde auf Werkseinstellungen zurückgesetzt! Lade neu...'));
                                                                markBackupComplete();
                                                                navigate('/');
                                                                window.location.reload();
                                                            } catch (err: unknown) {
                                                                setIsResetting(false);
                                                                await appDialog.error(getErrorMessage(err));
                                                            }
                                                        } else if (promptText !== null) {
                                                            await appDialog.warning(t('datasource.factory_reset_aborted', 'Abgebrochen: Falsche Eingabe.'));
                                                        }
                                                    }
                                                }}
                                                className="flex items-center gap-2 px-4 py-2 bg-red-900 hover:bg-black text-white rounded font-bold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isResetting && <Loader2 className="w-4 h-4 animate-spin" />}
                                                {t('datasource.factory_reset_btn', 'Komplett zurücksetzen')}
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-400 italic">{t('datasource.factory_reset_hint', 'Loescht die gesamte Datenbank inklusive Tabellen, Views und Indizes, setzt lokale Einstellungen zurueck und erstellt ein frisches, leeres Schema der neuesten Version.')}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modals outside tabs */}
            <CreateTableModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                tableName={newTableName}
                onTableNameChange={setNewTableName}
                columns={createColumns}
                onColumnsChange={setCreateColumns}
                onSubmit={handleCreateTable}
            />

            <RightOverlayPanel
                isOpen={isSchemaToolsOpen}
                onClose={closeSchemaTools}
                title={t('datasource.schema_tools_title', 'Schema Tools')}
                width="md"
            >
                {renderSchemaToolsPanel()}
            </RightOverlayPanel>

            <RightOverlayPanel
                isOpen={isSchemaDocsOpen}
                onClose={closeSchemaDocumentation}
                title={selectedTable ? `${t('datasource.schema_documentation_title', 'Schema-Dokumentation')} - ${selectedTable}` : t('datasource.schema_documentation_title', 'Schema-Dokumentation')}
                width="lg"
            >
                <div className="space-y-4">
                    <p className="text-xs text-slate-400">
                        {t('datasource.schema_documentation_hint', 'Pflegen Sie sprechende Namen und kurze Beschreibungen fuer Tabellen und Spalten.')}
                    </p>
                    {renderSchemaDocumentationEditor()}
                </div>
            </RightOverlayPanel>

            <Modal
                isOpen={isSchemaImportConflictDialogOpen}
                onClose={closeSchemaImportConflictDialog}
                title={t('datasource.schema_import_conflict_dialog_title', 'Import-Konflikte prüfen')}
                noScroll
            >
                <div className="h-[36rem] max-h-[calc(90vh-11rem)] flex flex-col">
                    <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t('datasource.schema_import_conflict_dialog_hint', 'Prüfen Sie pro Konflikt, ob der lokale Wert erhalten bleiben oder der Importwert übernommen werden soll.')}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setAllSchemaImportConflictDraftResolutions('keep_local')}
                                disabled={Boolean(schemaImportMergeSummary)}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:bg-slate-900"
                            >
                                {t('datasource.schema_import_resolution_keep_local_all', 'Alle lokal behalten')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setAllSchemaImportConflictDraftResolutions('use_import')}
                                disabled={Boolean(schemaImportMergeSummary)}
                                className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50"
                            >
                                {t('datasource.schema_import_resolution_use_import_all', 'Alle Importwerte übernehmen')}
                            </button>
                        </div>
                        {isMergingSchemaImport && (
                            <div className="mt-4 space-y-2">
                                <div className="flex items-center justify-between gap-3 text-[11px] font-bold text-slate-500 dark:text-slate-300">
                                    <span>{schemaImportMergeProgressLabel || t('datasource.schema_import_progress_merging', 'Dokumentation wird übernommen...')}</span>
                                    <span>{schemaImportMergeProgress}%</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                                    <div
                                        className="h-full rounded-full bg-blue-600 transition-all duration-300"
                                        style={{ width: `${Math.max(schemaImportMergeProgress, 8)}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
                        <div className="space-y-3">
                            {schemaImportConflictEntries.map((entry, index) => {
                                const label = entry.column_name
                                    ? `${entry.table_name}.${entry.column_name}`
                                    : entry.technical_name || entry.id || '';
                                const conflictKey = entry.conflict_key || `${label}:${entry.field}:${index}`;
                                const resolution = schemaImportConflictDraftResolutions[conflictKey] || 'keep_local';
                                const resolutionBadge = schemaImportMergeSummary
                                    ? (
                                        resolution === 'use_import'
                                            ? {
                                                label: t('datasource.schema_import_resolution_applied', 'Übernommen'),
                                                className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300'
                                            }
                                            : {
                                                label: t('datasource.schema_import_resolution_kept', 'Lokal behalten'),
                                                className: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                                            }
                                    )
                                    : (
                                        resolution === 'use_import'
                                            ? {
                                                label: t('datasource.schema_import_resolution_selected_import', 'Import vorgemerkt'),
                                                className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300'
                                            }
                                            : {
                                                label: t('datasource.schema_import_resolution_selected_local', 'Lokal vorgemerkt'),
                                                className: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300'
                                            }
                                    );
                                return (
                                    <div key={`${label}:${entry.field}:${index}`} className="rounded-xl border border-slate-200 bg-white p-4 text-[11px] dark:border-slate-700 dark:bg-slate-950/40">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="font-mono text-sm font-bold text-slate-700 dark:text-slate-200">{label}</div>
                                                <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                    {getSchemaImportConflictFieldLabel(entry.field)}
                                                </div>
                                            </div>
                                            <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${resolutionBadge.className}`}>
                                                {resolutionBadge.label}
                                            </span>
                                        </div>
                                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                                            <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/70">
                                                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                    {t('datasource.schema_import_conflict_local', 'Lokal')}
                                                </div>
                                                <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">{entry.local_value || '-'}</div>
                                            </div>
                                            <div className="rounded-lg border border-blue-200 bg-blue-50/80 px-3 py-2 dark:border-blue-900/40 dark:bg-blue-950/20">
                                                <div className="text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                                                    {t('datasource.schema_import_conflict_import', 'Import')}
                                                </div>
                                                <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">{entry.import_value || '-'}</div>
                                            </div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setSchemaImportConflictDraftResolutions((prev) => ({ ...prev, [conflictKey]: 'keep_local' }))}
                                                disabled={Boolean(schemaImportMergeSummary)}
                                                className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                                                    resolution === 'keep_local'
                                                        ? 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
                                                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-900'
                                                }`}
                                            >
                                                {t('datasource.schema_import_resolution_keep_local', 'Lokal behalten')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSchemaImportConflictDraftResolutions((prev) => ({ ...prev, [conflictKey]: 'use_import' }))}
                                                disabled={Boolean(schemaImportMergeSummary)}
                                                className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                                                    resolution === 'use_import'
                                                        ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300'
                                                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-900'
                                                }`}
                                            >
                                                {t('datasource.schema_import_resolution_use_import', 'Import übernehmen')}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className="mt-2 px-5 py-4 ui-surface-footer flex items-center justify-end gap-3 shrink-0">
                        <div className="flex items-center justify-end gap-2">
                            {!schemaImportMergeSummary && (
                                <>
                                    <button
                                        type="button"
                                        onClick={closeSchemaImportConflictDialog}
                                        disabled={isMergingSchemaImport}
                                        className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700"
                                    >
                                        {t('common.cancel', 'Abbrechen')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { void applyAndMergeSchemaImportConflictDialog(); }}
                                        disabled={isMergingSchemaImport}
                                        className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isMergingSchemaImport
                                            ? t('datasource.schema_import_conflict_dialog_applying', 'Übernahme läuft...')
                                            : t('datasource.schema_import_conflict_dialog_apply', 'Übernehmen')}
                                    </button>
                                </>
                            )}
                            {schemaImportMergeSummary && (
                                <button
                                    type="button"
                                    onClick={closeSchemaImportConflictDialog}
                                    className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors"
                                >
                                    {t('common.close', 'Schließen')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isCreateIndexOpen}
                onClose={() => setIsCreateIndexOpen(false)}
                title={t('datasource.create_index_title', 'Index erstellen')}
                noScroll
            >
                <div className="h-[34rem] max-h-[calc(90vh-11rem)] flex flex-col">
                    <div className="flex-1 min-h-0 overflow-auto px-5 pt-4 space-y-4">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                            {t('datasource.index_create_for_table', 'Tabelle')}: <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{indexTableName}</span>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{t('datasource.index_name', 'Indexname')}</label>
                            <input
                                value={indexName}
                                onChange={(e) => setIndexName(e.target.value)}
                                className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-sm bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                                placeholder={`idx_${indexTableName}_...`}
                            />
                        </div>

                        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <input
                                type="checkbox"
                                checked={indexUnique}
                                onChange={() => setIndexUnique(!indexUnique)}
                                className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-blue-600 accent-blue-600 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]"
                            />
                            {t('datasource.index_unique', 'Unique Index')}
                        </label>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{t('datasource.index_columns', 'Spalten')}</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-auto border border-slate-200 dark:border-slate-700 rounded p-2 bg-slate-50 dark:bg-slate-900/40">
                                {availableIndexColumns.map((col) => (
                                    <label key={col} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                        <input
                                            type="checkbox"
                                            checked={indexColumns.includes(col)}
                                            onChange={() => toggleIndexColumn(col)}
                                            className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-blue-600 accent-blue-600 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]"
                                        />
                                        <span className="font-mono">{col}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {indexColumns.length > 0 && (
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{t('datasource.index_order', 'Spaltenreihenfolge')}</label>
                                <div className="space-y-1 border border-slate-200 dark:border-slate-700 rounded p-2 bg-white dark:bg-slate-900">
                                    {indexColumns.map((col, idx) => (
                                        <div key={col} className="flex items-center justify-between text-sm">
                                            <span className="font-mono text-slate-700 dark:text-slate-200">{idx + 1}. {col}</span>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => moveIndexColumn(col, 'up')}
                                                    disabled={idx === 0}
                                                    className="px-2 py-0.5 text-xs border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                                                >
                                                    â†‘
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => moveIndexColumn(col, 'down')}
                                                    disabled={idx === indexColumns.length - 1}
                                                    className="px-2 py-0.5 text-xs border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                                                >
                                                    â†“
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{t('datasource.index_where_optional', 'WHERE (optional)')}</label>
                            <input
                                value={indexWhere}
                                onChange={(e) => setIndexWhere(e.target.value)}
                                className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded text-sm font-mono bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                                placeholder="status = 'open'"
                            />
                        </div>
                    </div>

                    <div className="mt-2 px-5 py-4 ui-surface-footer flex items-center justify-end gap-3 shrink-0">
                        <button
                            onClick={() => setIsCreateIndexOpen(false)}
                            className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            onClick={() => { void handleCreateIndex(); }}
                            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700"
                        >
                            {t('datasource.create_index_btn', 'Index erstellen')}
                        </button>
                    </div>
                </div>
            </Modal>
        </PageLayout >
    );
};




