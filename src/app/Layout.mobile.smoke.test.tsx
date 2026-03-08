import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback || key,
        i18n: {
            language: 'de',
            changeLanguage: vi.fn()
        }
    })
}));

vi.mock('../lib/db', () => ({
    onTabConflict: () => () => undefined
}));

vi.mock('./components/MultiTabModal', () => ({
    MultiTabModal: () => null
}));

vi.mock('./components/LockScreen', () => ({
    LockScreen: () => null
}));

vi.mock('./components/SystemStatus', () => ({
    SystemStatus: () => null
}));

vi.mock('../lib/context/DashboardContext', () => ({
    useDashboard: () => ({
        isSidebarCollapsed: false,
        setSidebarCollapsed: vi.fn(),
        isPresentationMode: false,
        togglePresentationMode: vi.fn(),
        isReadOnly: false,
        setIsReadOnly: vi.fn(),
        visibleSidebarComponentIds: [],
        lockApp: vi.fn()
    })
}));

describe('Layout mobile sidebar smoke', () => {
    it('opens sidebar on mobile menu and closes it via overlay click', async () => {
        const { container } = render(
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route element={<Layout />}>
                        <Route index element={<div>content</div>} />
                    </Route>
                </Routes>
            </MemoryRouter>
        );

        const sidebar = container.querySelector('aside');
        expect(sidebar).toBeInTheDocument();
        expect(sidebar?.className).toContain('z-[80]');
        expect(sidebar?.className).toContain('-translate-x-full');

        const mobileMenuButton = container.querySelector('header button');
        expect(mobileMenuButton).toBeInTheDocument();
        fireEvent.click(mobileMenuButton);

        await waitFor(() => {
            expect(sidebar?.className).toContain('translate-x-0');
        });

        const overlay = container.querySelector('div.overlay-backdrop-subtle');

        expect(overlay).toBeInTheDocument();
        fireEvent.click(overlay!);

        await waitFor(() => {
            expect(sidebar?.className).toContain('-translate-x-full');
        });
    });
});
