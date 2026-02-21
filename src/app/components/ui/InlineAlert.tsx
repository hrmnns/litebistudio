import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

interface InlineAlertProps {
    type: AlertType;
    title?: string;
    message: string;
    details?: string;
    onClose?: () => void;
    className?: string;
}

export const InlineAlert: React.FC<InlineAlertProps> = ({
    type,
    title,
    message,
    details,
    onClose,
    className = ""
}) => {
    const styles = {
        success: {
            bg: 'bg-emerald-50 dark:bg-emerald-900/20',
            border: 'border-emerald-100 dark:border-emerald-800/50',
            text: 'text-emerald-800 dark:text-emerald-200',
            icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />
        },
        error: {
            bg: 'bg-red-50 dark:bg-red-900/20',
            border: 'border-red-100 dark:border-red-800/50',
            text: 'text-red-800 dark:text-red-200',
            icon: <AlertCircle className="w-5 h-5 text-red-500" />
        },
        warning: {
            bg: 'bg-amber-50 dark:bg-amber-900/20',
            border: 'border-amber-100 dark:border-amber-800/50',
            text: 'text-amber-800 dark:text-amber-200',
            icon: <AlertTriangle className="w-5 h-5 text-amber-500" />
        },
        info: {
            bg: 'bg-blue-50 dark:bg-blue-900/20',
            border: 'border-blue-100 dark:border-blue-800/50',
            text: 'text-blue-800 dark:text-blue-200',
            icon: <Info className="w-5 h-5 text-blue-500" />
        }
    };

    const currentStyle = styles[type];

    return (
        <div className={`p-4 rounded-2xl border-2 ${currentStyle.bg} ${currentStyle.border} flex items-start gap-4 animate-in slide-in-from-top-2 duration-300 ${className}`}>
            <div className="shrink-0 mt-0.5">
                {currentStyle.icon}
            </div>
            <div className="flex-1 min-w-0">
                {title && (
                    <h5 className={`text-sm font-black uppercase tracking-wider mb-1 ${currentStyle.text}`}>
                        {title}
                    </h5>
                )}
                <p className={`text-sm font-medium leading-relaxed ${currentStyle.text}`}>
                    {message}
                </p>
                {details && (
                    <div className="mt-3 p-3 bg-white/50 dark:bg-black/20 rounded-xl border border-white/50 dark:border-white/5">
                        <pre className="text-[10px] font-mono whitespace-pre-wrap break-all opacity-80">
                            {details}
                        </pre>
                    </div>
                )}
            </div>
            {onClose && (
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors shrink-0"
                >
                    <X className="w-4 h-4 opacity-50" />
                </button>
            )}
        </div>
    );
};
