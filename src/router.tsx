import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './app/Layout';
// import { ComponentGridPage } from './app/pages/ComponentGridPage';
import { SettingsPage } from './app/pages/SettingsPage';
import { DatasourceView } from './app/views/DatasourceView';
import { DataInspector } from './app/views/DataInspector';
import { QueryBuilderView } from './app/views/QueryBuilderView';
import { CustomDashboardView } from './app/views/CustomDashboardView';
import { WorklistView } from './app/views/WorklistView';

export const AppRouter: React.FC = () => (
    <HashRouter>
        <Routes>
            <Route element={<Layout />}>
                <Route index element={<CustomDashboardView />} />
                <Route path="datasource" element={
                    <DatasourceView onImportComplete={() => { window.location.hash = '#/'; }} />
                } />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="inspector" element={
                    <DataInspector onBack={() => window.history.back()} />
                } />
                <Route path="query" element={
                    <QueryBuilderView />
                } />
                <Route path="worklist" element={
                    <WorklistView />
                } />
            </Route>
        </Routes>
    </HashRouter>
);
