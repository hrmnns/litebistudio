import { DEFAULT_LOG_LEVEL, LOG_LEVEL_STORAGE_KEY, normalizeLogLevel, shouldLog, type AppLogLevel } from './logging';

export function getActiveLogLevel(): AppLogLevel {
    if (typeof window === 'undefined') return DEFAULT_LOG_LEVEL;
    return normalizeLogLevel(window.localStorage.getItem(LOG_LEVEL_STORAGE_KEY));
}

function canLog(level: 'error' | 'warn' | 'info' | 'debug'): boolean {
    return shouldLog(getActiveLogLevel(), level);
}

export function createLogger(scope: string) {
    return {
        error: (...args: unknown[]) => {
            if (canLog('error')) console.error(`[${scope}]`, ...args);
        },
        warn: (...args: unknown[]) => {
            if (canLog('warn')) console.warn(`[${scope}]`, ...args);
        },
        info: (...args: unknown[]) => {
            if (canLog('info')) console.info(`[${scope}]`, ...args);
        },
        debug: (...args: unknown[]) => {
            if (canLog('debug')) console.debug(`[${scope}]`, ...args);
        }
    };
}
