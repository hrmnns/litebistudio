import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './app/Layout';
import { ComponentGridPage } from './app/pages/ComponentGridPage';
import { SettingsPage } from './app/pages/SettingsPage';
import { ItCostsYearPage } from './app/pages/ItCostsYearPage';
import { ItCostsMonthPage } from './app/pages/ItCostsMonthPage';
import { ItCostsInvoicePage } from './app/pages/ItCostsInvoicePage';
import { ItCostsItemHistoryPage } from './app/pages/ItCostsItemHistoryPage';
import { AnomalyDetectionPage } from './app/pages/AnomalyDetectionPage';
import { AnomalyDetailPage } from './app/pages/AnomalyDetailPage';
import { SimplePage } from './app/pages/SimplePage';
import { DatasourceView } from './app/views/DatasourceView';
import { DataInspector } from './app/views/DataInspector';
import { SystemsManagementView } from './app/views/SystemsManagementView';
import { WorklistView } from './app/views/WorklistView';

export const AppRouter: React.FC = () => (
    <HashRouter>
        <Routes>
            <Route element={<Layout />}>
                <Route index element={<ComponentGridPage />} />
                <Route path="datasource" element={
                    <DatasourceView onImportComplete={() => { window.location.hash = '#/'; }} />
                } />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="worklist" element={
                    <SimplePage animation="slide"><WorklistView onBack={() => window.history.back()} /></SimplePage>
                } />
                <Route path="costs" element={<ItCostsYearPage />} />
                <Route path="costs/:period" element={<ItCostsMonthPage />} />
                <Route path="costs/:period/:invoiceId" element={<ItCostsInvoicePage />} />
                <Route path="costs/:period/:invoiceId/history" element={<ItCostsItemHistoryPage />} />
                <Route path="inspector" element={
                    <SimplePage animation="slide"><DataInspector onBack={() => window.history.back()} /></SimplePage>
                } />
                <Route path="systems" element={
                    <SimplePage animation="slide" className="p-6 md:p-8"><SystemsManagementView onBack={() => window.history.back()} /></SimplePage>
                } />
                <Route path="anomalies" element={<AnomalyDetectionPage />} />
                <Route path="anomalies/:period/:anomalyId" element={<AnomalyDetailPage />} />
            </Route>
        </Routes>
    </HashRouter>
);
