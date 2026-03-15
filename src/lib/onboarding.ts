const WELCOME_SEEN_STORAGE_KEY = 'litebistudio_welcome_seen';

export const hasSeenWelcomeScreen = (): boolean => {
    if (typeof window === 'undefined') return true;
    try {
        return window.localStorage.getItem(WELCOME_SEEN_STORAGE_KEY) === 'true';
    } catch {
        return true;
    }
};

export const setWelcomeScreenSeen = (seen: boolean): void => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(WELCOME_SEEN_STORAGE_KEY, seen ? 'true' : 'false');
    } catch {
        // ignore
    }
};

export const getWelcomeScreenSeenStorageKey = (): string => WELCOME_SEEN_STORAGE_KEY;
