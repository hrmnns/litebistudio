import React from 'react';
import { cn } from '../../../lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'toggle';
type ButtonSize = 'sm' | 'md' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    active?: boolean;
}

const baseClasses = 'inline-flex items-center justify-center gap-1 rounded-md border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed';

const variantClasses: Record<ButtonVariant, string> = {
    primary: 'border-transparent bg-[rgb(var(--ui-primary))] hover:bg-[rgb(var(--ui-primary-hover))] text-white',
    secondary: 'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700',
    ghost: 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
    toggle: 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
};

const sizeClasses: Record<ButtonSize, string> = {
    sm: 'h-7 px-2 text-[11px]',
    md: 'px-4 py-2 text-sm min-w-[128px]',
    icon: 'h-7 w-7 p-0 text-[11px]'
};

const activeClasses = 'border-[rgb(var(--ui-primary))/0.45] dark:border-blue-700 bg-[rgb(var(--ui-primary))/0.12] dark:bg-blue-900/30 text-[rgb(var(--ui-primary-hover))] dark:text-blue-200';

export const Button: React.FC<ButtonProps> = ({
    className,
    variant = 'secondary',
    size = 'md',
    active = false,
    type = 'button',
    ...props
}) => (
    <button
        type={type}
        className={cn(
            baseClasses,
            sizeClasses[size],
            variantClasses[variant],
            active && variant === 'toggle' && activeClasses,
            className
        )}
        {...props}
    />
);
