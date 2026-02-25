import React from 'react';
import { AlertTriangle, CircleAlert, Database, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../Modal';
import { registerDialogPresenter, type AppDialogRequest, type AppDialogResponse } from '../../../lib/appDialog';

interface ActiveDialog extends AppDialogRequest {
    resolve: (response: AppDialogResponse) => void;
}

export const AppDialogHost: React.FC = () => {
    const { t } = useTranslation();
    const [active, setActive] = React.useState<ActiveDialog | null>(null);
    const [inputValue, setInputValue] = React.useState('');

    React.useEffect(() => {
        return registerDialogPresenter((request) => new Promise<AppDialogResponse>((resolve) => {
            setInputValue(request.defaultValue || '');
            setActive({ ...request, resolve });
        }));
    }, []);

    if (!active) return null;

    const onCancel = () => {
        if (active.kind === 'prompt') {
            active.resolve({ confirmed: false, value: undefined });
        } else if (active.kind === 'confirm') {
            active.resolve({ confirmed: false });
        } else {
            active.resolve({ confirmed: true });
        }
        setActive(null);
    };

    const onConfirm = () => {
        if (active.kind === 'prompt') {
            active.resolve({ confirmed: true, value: inputValue });
        } else {
            active.resolve({ confirmed: true });
        }
        setActive(null);
    };

    const title =
        active.title ||
        (active.kind === 'error'
            ? t('common.error')
            : active.kind === 'warning'
                ? t('common.warning', 'Warning')
                : active.kind === 'confirm'
                    ? t('common.confirm_title')
                    : active.kind === 'prompt'
                        ? t('common.input', 'Input')
                        : t('common.info', 'Information'));

    const Icon = active.kind === 'error'
        ? CircleAlert
        : active.kind === 'warning'
            ? AlertTriangle
            : active.kind === 'info'
                ? Database
                : Info;

    const iconColors = active.kind === 'error'
        ? 'text-rose-700 bg-rose-50 ring-rose-200 dark:text-rose-300 dark:bg-rose-500/15 dark:ring-rose-400/30'
        : active.kind === 'warning'
            ? 'text-amber-700 bg-amber-50 ring-amber-200 dark:text-amber-300 dark:bg-amber-500/15 dark:ring-amber-400/30'
            : 'text-blue-700 bg-blue-50 ring-blue-200 dark:text-blue-300 dark:bg-blue-500/15 dark:ring-blue-400/30';

    return (
        <Modal isOpen={true} onClose={onCancel} title={title}>
            <div className="space-y-4">
                <div className="flex items-start gap-3">
                    <span className={`mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${iconColors}`}>
                        <Icon className="w-5 h-5" />
                    </span>
                    <p className="pt-1 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{active.message}</p>
                </div>

                {active.kind === 'prompt' && (
                    <input
                        autoFocus
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={active.placeholder}
                        className="w-full p-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:border-blue-300"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') onConfirm();
                            if (e.key === 'Escape') onCancel();
                        }}
                    />
                )}

                <div className="flex justify-end gap-2 pt-2">
                    {(active.kind === 'confirm' || active.kind === 'prompt') && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
                        >
                            {t('common.cancel')}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
                    >
                        {t('common.ok', 'OK')}
                    </button>
                </div>
            </div>
        </Modal>
    );
};
