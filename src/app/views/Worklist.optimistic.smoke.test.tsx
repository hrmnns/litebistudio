import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorklistView } from './WorklistView';

type MockItem = {
    id: number;
    source_table: string;
    source_id: string | number;
    display_label: string | null;
    comment: string | null;
    status: 'open' | 'in_progress' | 'done' | 'closed';
    priority?: 'low' | 'normal' | 'high' | 'critical';
    due_at?: string | null;
    updated_at?: string;
    created_at: string;
};

let mockItems: MockItem[] = [];
const getWorklistMock = vi.fn(async () => mockItems);
const updateWorklistItemMock = vi.fn(async () => undefined);

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallbackOrVars?: string | Record<string, unknown>, maybeVars?: Record<string, unknown>) => {
            const fallback = typeof fallbackOrVars === 'string' ? fallbackOrVars : undefined;
            const vars = (typeof fallbackOrVars === 'object' ? fallbackOrVars : maybeVars) as Record<string, unknown> | undefined;
            if (fallback) return fallback;
            if (key === 'worklist.found_count' && vars?.count !== undefined) return `${vars.count} gefunden`;
            if (key === 'worklist.tools_selected_count' && vars?.count !== undefined) return `${vars.count} ausgewaehlt`;
            return key;
        }
    })
}));

vi.mock('../../lib/context/DashboardContext', () => ({
    useDashboard: () => ({
        isReadOnly: false
    })
}));

vi.mock('../components/ui/PageLayout', () => ({
    PageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

vi.mock('../components/RecordDetailModal', () => ({
    RecordDetailModal: () => null
}));

vi.mock('../../lib/repositories/SystemRepository', () => ({
    SystemRepository: {
        getWorklist: (...args: unknown[]) => getWorklistMock(...args),
        getTableSchema: vi.fn(async () => [{ name: 'id', pk: 1 }]),
        executeRaw: vi.fn(async () => []),
        checkRecordExists: vi.fn(async () => true),
        updateWorklistItem: (...args: unknown[]) => updateWorklistItemMock(...args),
        removeWorklistItemById: vi.fn(async () => undefined)
    }
}));

const renderView = () => render(
    <MemoryRouter>
        <WorklistView />
    </MemoryRouter>
);

describe('Worklist optimistic smoke', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
        vi.clearAllMocks();
        mockItems = [
            {
                id: 1,
                source_table: 'usr_tasks',
                source_id: '1',
                display_label: 'Task A',
                comment: 'first',
                status: 'open',
                priority: 'normal',
                due_at: null,
                created_at: '2026-01-01T10:00:00.000Z',
                updated_at: '2026-01-01T10:00:00.000Z'
            }
        ];
    });

    it('updates status in UI optimistically without triggering loading placeholder again', async () => {
        renderView();

        await screen.findByText('Task A');
        expect(screen.queryByText('Task A')).toBeInTheDocument();

        const statusSelect = screen.getByDisplayValue('Neu / Offen');
        fireEvent.change(statusSelect, { target: { value: 'done' } });

        await waitFor(() => {
            expect(screen.getByDisplayValue('Erledigt')).toBeInTheDocument();
        });

        expect(updateWorklistItemMock).toHaveBeenCalledWith(1, { status: 'done' });
        expect(screen.queryByText('Task A')).toBeInTheDocument();
        expect(screen.queryByText('worklist.empty_msg')).not.toBeInTheDocument();
    });
});
