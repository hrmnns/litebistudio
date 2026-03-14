import React from 'react';
import { useTranslation } from 'react-i18next';

interface UsePageFooterStatusOptions {
    loading?: boolean;
}

export const usePageFooterStatus = (options?: UsePageFooterStatusOptions): string => {
    const { t, i18n } = useTranslation();
    const [lastRefreshedAt, setLastRefreshedAt] = React.useState(() => new Date());
    const loading = Boolean(options?.loading);
    const isFirstRenderRef = React.useRef(true);

    React.useEffect(() => {
        if (isFirstRenderRef.current) {
            isFirstRenderRef.current = false;
            return;
        }
        if (!loading) {
            setLastRefreshedAt(new Date());
        }
    }, [loading]);

    if (loading) {
        return t('common.loading', 'Loading...');
    }

    const locale = i18n?.language?.startsWith('de') ? 'de-DE' : 'en-US';
    const date = lastRefreshedAt.toLocaleDateString(locale);
    const time = lastRefreshedAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const template = t('settings.last_update', 'Last update: {{date}}, {{time}}');
    if (typeof template === 'string') {
        return template
            .replace('{{date}}', date)
            .replace('{{time}}', time);
    }
    return `Last update: ${date}, ${time}`;
};
