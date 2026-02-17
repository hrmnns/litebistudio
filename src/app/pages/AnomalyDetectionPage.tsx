import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AnomalyDetectionView } from '../views/AnomalyDetectionView';

export const AnomalyDetectionPage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <AnomalyDetectionView
            onBack={() => navigate('/')}
            onDrillDown={(invoiceId: string, period?: string) => {
                if (period) {
                    navigate(`/anomalies/${period}/${invoiceId}`);
                }
            }}
        />
    );
};
