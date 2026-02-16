import { runQuery } from '../db';


export const SettingsRepository = {
    async get(key: string): Promise<string | null> {
        const result = await runQuery('SELECT value FROM settings WHERE key = ?', [key]);
        return result.length > 0 ? (result[0].value as string) : null;
    },

    async set(key: string, value: string): Promise<void> {
        await runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
};
