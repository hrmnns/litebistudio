import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ItCostsMonthView } from '../views/ItCostsMonthView';

export const ItCostsMonthPage: React.FC = () => {
    const { period } = useParams<{ period: string }>();
    const navigate = useNavigate();

    if (!period) return null;

    return (
        <ItCostsMonthView
            period={period}
            onBack={() => navigate('/costs')}
            onDrillDown={(invoiceId: string) => navigate(`/costs/${period}/${invoiceId}`)}
        />
    );
};
