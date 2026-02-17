import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ItCostsYearView } from '../views/ItCostsYearView';

export const ItCostsYearPage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <ItCostsYearView
            onBack={() => navigate('/')}
            onDrillDown={(period: string) => navigate(`/costs/${period}`)}
        />
    );
};
