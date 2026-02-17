import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ItCostsInvoiceItemsView } from '../views/ItCostsInvoiceItemsView';
import type { InvoiceItem } from '../../types';

export const ItCostsInvoicePage: React.FC = () => {
    const { period, invoiceId } = useParams<{ period: string; invoiceId: string }>();
    const navigate = useNavigate();

    if (!period || !invoiceId) return null;

    return (
        <ItCostsInvoiceItemsView
            invoiceId={invoiceId}
            period={period}
            onBack={() => navigate(`/costs/${period}`)}
            onViewHistory={(item: InvoiceItem) => navigate(`/costs/${period}/${invoiceId}/history`, { state: { item } })}
        />
    );
};
