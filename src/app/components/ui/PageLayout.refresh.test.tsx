import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PageLayout } from './PageLayout';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: string) => fallback || _key
    })
}));

vi.mock('../../../lib/context/DashboardContext', () => ({
    useDashboard: () => ({
        isAdminMode: false,
        isReadOnly: false
    })
}));

vi.mock('../../../hooks/useAsync', () => ({
    useAsync: () => ({
        data: null
    })
}));

vi.mock('../../../lib/repositories/SystemRepository', () => ({
    SystemRepository: {
        getStorageStatus: vi.fn(async () => ({ mode: 'persistent' })),
        abortActiveQueries: vi.fn(async () => undefined)
    }
}));

describe('PageLayout header refresh placement', () => {
    it('renders refresh button directly before right-panel toggle', () => {
        const onRefresh = vi.fn();

        render(
            <PageLayout
                header={{
                    title: 'Test',
                    refresh: {
                        onClick: onRefresh,
                        title: 'Aktualisieren'
                    }
                }}
                rightPanel={{
                    title: 'Panel',
                    content: <div>Panel content</div>,
                    enabled: true,
                    triggerTitle: 'Konfiguration öffnen'
                }}
            >
                <div>Body</div>
            </PageLayout>
        );

        const refreshButton = screen.getByRole('button', { name: 'Aktualisieren' });
        const rightPanelButton = screen.getByRole('button', { name: 'Konfiguration öffnen' });

        fireEvent.click(refreshButton);
        expect(onRefresh).toHaveBeenCalledTimes(1);

        const followsRefresh =
            Boolean(refreshButton.compareDocumentPosition(rightPanelButton) & Node.DOCUMENT_POSITION_FOLLOWING);
        expect(followsRefresh).toBe(true);
    });
});

