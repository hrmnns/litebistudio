export type AppLogLevel = 'off' | 'error' | 'warn' | 'info' | 'debug';

export const LOG_LEVEL_STORAGE_KEY = 'app_log_level';
export const DEFAULT_LOG_LEVEL: AppLogLevel = 'error';

const LOG_LEVEL_WEIGHT: Record<AppLogLevel, number> = {
    off: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4
};

export function normalizeLogLevel(value: string | null | undefined): AppLogLevel {
    if (!value) return DEFAULT_LOG_LEVEL;
    if (value === 'off' || value === 'error' || value === 'warn' || value === 'info' || value === 'debug') {
        return value;
    }
    return DEFAULT_LOG_LEVEL;
}

export function shouldLog(activeLevel: AppLogLevel, messageLevel: Exclude<AppLogLevel, 'off'>): boolean {
    return LOG_LEVEL_WEIGHT[activeLevel] >= LOG_LEVEL_WEIGHT[messageLevel];
}
