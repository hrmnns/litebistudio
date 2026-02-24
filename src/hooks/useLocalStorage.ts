import { useState, useEffect, useCallback } from 'react';
import { createLogger } from '../lib/logger';

const logger = createLogger('useLocalStorage');

/**
 * A hook to persist state in localStorage.
 * 
 * @param key The key to store the value under in localStorage.
 * @param initialValue The initial value to use if no value is found in localStorage.
 * @returns A stateful value, and a function to update it.
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
    // Get from local storage then
    // parse stored json or if none return initialValue
    const [storedValue, setStoredValue] = useState<T>(() => {
        if (typeof window === 'undefined') {
            return initialValue;
        }
        try {
            const item = window.localStorage.getItem(key);
            if (item === null) return initialValue;
            try {
                return JSON.parse(item);
            } catch {
                return item as unknown as T;
            }
        } catch (error) {
            logger.error('Initial read error:', error);
            return initialValue;
        }
    });

    // Cross-tab synchronization
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === key && e.newValue !== null) {
                try {
                    const nextValue = JSON.parse(e.newValue);
                    setStoredValue(nextValue);
                    logger.debug(`Synced ${key} from other tab:`, nextValue);
                } catch {
                    setStoredValue(e.newValue as unknown as T);
                }
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [key]);

    const setValue = useCallback((value: T | ((val: T) => T)) => {
        setStoredValue((currentStoredValue) => {
            try {
                const valueToStore = value instanceof Function ? value(currentStoredValue) : value;

                if (typeof window !== 'undefined') {
                    const serializedValue = typeof valueToStore === 'string' ? valueToStore : JSON.stringify(valueToStore);
                    window.localStorage.setItem(key, serializedValue);
                }
                return valueToStore;
            } catch (error) {
                logger.error('Write error:', error);
                return currentStoredValue;
            }
        });
    }, [key]);

    return [storedValue, setValue] as const;
}
