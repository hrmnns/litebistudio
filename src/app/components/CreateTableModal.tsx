import React from 'react';
import { useTranslation } from 'react-i18next';
import CodeMirror from '@uiw/react-codemirror';
import { sql as sqlLang } from '@codemirror/lang-sql';
import { EditorView } from '@codemirror/view';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from './Modal';

interface CreateTableColumn {
    name: string;
    type: string;
}

interface CreateTableModalProps {
    isOpen: boolean;
    onClose: () => void;
    tableName: string;
    onTableNameChange: (value: string) => void;
    columns: CreateTableColumn[];
    onColumnsChange: (next: CreateTableColumn[]) => void;
    onSubmit: () => void;
}

const quoteIdentifier = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

const buildCreateTablePreviewSql = (tableName: string, columns: CreateTableColumn[], t: (key: string, fallback?: string) => string): string => {
    const trimmedTableName = tableName.trim();
    const validColumns = columns
        .map((col) => ({ name: col.name.trim(), type: col.type.trim() }))
        .filter((col) => col.name.length > 0 && col.type.length > 0);

    if (!trimmedTableName) {
        return `-- ${t('datasource.invalid_table_name', 'Invalid table name. Use letters, numbers and underscore only.')}`;
    }
    if (validColumns.length === 0) {
        return `-- ${t('datasource.invalid_columns', 'Please provide at least one valid column.')}`;
    }

    const cols = validColumns.map((col) => `${quoteIdentifier(col.name)} ${col.type}`).join(',\n    ');
    return `CREATE TABLE ${quoteIdentifier(trimmedTableName)} (\n    ${cols}\n);`;
};

export const CreateTableModal: React.FC<CreateTableModalProps> = ({
    isOpen,
    onClose,
    tableName,
    onTableNameChange,
    columns,
    onColumnsChange,
    onSubmit
}) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = React.useState<'manual' | 'sql'>('manual');
    const [isDarkEditor, setIsDarkEditor] = React.useState(
        typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    );

    React.useEffect(() => {
        if (!isOpen) return;
        setActiveTab('manual');
    }, [isOpen]);

    React.useEffect(() => {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        const sync = () => setIsDarkEditor(root.classList.contains('dark'));
        sync();
        const observer = new MutationObserver(sync);
        observer.observe(root, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    const previewSql = React.useMemo(
        () => buildCreateTablePreviewSql(tableName, columns, t),
        [columns, tableName, t]
    );

    const readOnlyTheme = React.useMemo(
        () => EditorView.theme({
            '&': { height: '100%' },
            '.cm-editor': {
                backgroundColor: isDarkEditor ? '#0b1220' : '#f8fafc',
                color: isDarkEditor ? '#e2e8f0' : '#0f172a'
            },
            '.cm-scroller': {
                overflow: 'auto',
                backgroundColor: isDarkEditor ? '#0b1220' : '#f8fafc',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
            },
            '.cm-content': {
                padding: '0.75rem',
                caretColor: isDarkEditor ? '#60a5fa' : '#2563eb'
            },
            '.cm-focused': {
                outline: 'none'
            },
            '.cm-gutters': {
                backgroundColor: 'transparent',
                border: 'none',
                color: isDarkEditor ? '#94a3b8' : '#64748b'
            }
        }, { dark: isDarkEditor }),
        [isDarkEditor]
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('datasource.create_table_title')}
            headerActions={(
                <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
                    <button
                        type="button"
                        onClick={() => setActiveTab('manual')}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${activeTab === 'manual' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                    >
                        {t('datasource.assistant')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('sql')}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${activeTab === 'sql' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                    >
                        SQL
                    </button>
                </div>
            )}
        >
            <div className="h-[32rem] max-h-[calc(90vh-11rem)] flex flex-col gap-4">
                <div className="flex-1 min-h-0 overflow-auto pr-1">
                    {activeTab === 'manual' ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                                    {t('datasource.name_label', 'Name')}
                                </label>
                                <input
                                    value={tableName}
                                    onChange={(e) => onTableNameChange(e.target.value)}
                                    className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="usr_table"
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{t('datasource.columns_label', 'Columns')}</label>
                                    <button
                                        type="button"
                                        onClick={() => onColumnsChange([...columns, { name: '', type: 'TEXT' }])}
                                        className="px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-300 font-bold flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-700"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        {t('datasource.add_column')}
                                    </button>
                                </div>
                                <div className="max-h-48 overflow-auto space-y-2">
                                    {columns.map((col, idx) => (
                                        <div key={`create-table-col-${idx}`} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                                            <input
                                                value={col.name}
                                                onChange={(e) => {
                                                    const next = [...columns];
                                                    next[idx] = { ...next[idx], name: e.target.value };
                                                    onColumnsChange(next);
                                                }}
                                                className="p-2 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-sm"
                                                placeholder={t('datasource.name_label', 'Name')}
                                            />
                                            <input
                                                value={col.type}
                                                onChange={(e) => {
                                                    const next = [...columns];
                                                    next[idx] = { ...next[idx], type: e.target.value };
                                                    onColumnsChange(next);
                                                }}
                                                className="p-2 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-sm"
                                                placeholder={t('datainspector.type', 'Type')}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => onColumnsChange(columns.filter((_, colIndex) => colIndex !== idx))}
                                                disabled={columns.length === 1}
                                                className="h-9 w-9 inline-flex items-center justify-center rounded border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/30 disabled:opacity-40"
                                                title={t('common.remove')}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2 h-full min-h-0 flex flex-col">
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
                                {t('datainspector.index_preview_sql', 'SQL Preview')}
                            </label>
                            <div className="flex-1 min-h-0 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                                <CodeMirror
                                    value={previewSql}
                                    height="100%"
                                    editable={false}
                                    basicSetup={{
                                        lineNumbers: true,
                                        foldGutter: false,
                                        highlightActiveLine: false,
                                        highlightActiveLineGutter: false
                                    }}
                                    extensions={[sqlLang(), readOnlyTheme]}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={onSubmit}
                        disabled={activeTab !== 'manual'}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-40"
                    >
                        {t('datasource.create_btn', 'Create')}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

