/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useLocalStorage } from '../../hooks/useLocalStorage';

export type ThemeMode = 'light' | 'dark' | 'system';
export type LightThemeVariant = 'classic' | 'ocean' | 'aurora';

interface ThemeContextType {
    theme: ThemeMode;
    setTheme: (theme: ThemeMode) => void;
    lightThemeVariant: LightThemeVariant;
    setLightThemeVariant: (variant: LightThemeVariant) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useLocalStorage<ThemeMode>('theme', 'system');
    const [lightThemeVariant, setLightThemeVariant] = useLocalStorage<LightThemeVariant>('ui_light_theme_variant', 'classic');

    useEffect(() => {
        const root = window.document.documentElement;
        const lightVariantClasses = ['light-variant-classic', 'light-variant-ocean', 'light-variant-aurora', 'light-variant-slate'];
        const effectiveLightVariant = lightThemeVariant;

        const removeOldTheme = () => {
            root.classList.remove('light', 'dark');
        };

        const applyTheme = (t: ThemeMode) => {
            removeOldTheme();
            if (t === 'system') {
                const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                root.classList.add(systemTheme);
            } else {
                root.classList.add(t);
            }

            root.classList.remove(...lightVariantClasses);
            root.classList.add(`light-variant-${effectiveLightVariant}`);
        };

        applyTheme(theme);

        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = () => applyTheme('system');
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        }
    }, [theme, lightThemeVariant]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, lightThemeVariant, setLightThemeVariant }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useThemeContext = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useThemeContext must be used within a ThemeProvider');
    }
    return context;
};
