import React from 'react';
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { Layout } from './app/Layout';
// import { ComponentGridPage } from './app/pages/ComponentGridPage';
import { SettingsPage } from './app/pages/SettingsPage';
import { DatasourceView } from './app/views/DatasourceView';
import { DataInspector } from './app/views/DataInspector';
import { QueryBuilderView } from './app/views/QueryBuilderView';
import { CustomDashboardView } from './app/views/CustomDashboardView';
import { WorklistView } from './app/views/WorklistView';
import { AboutView } from './app/views/AboutView';
import ReportPackView from './app/views/ReportPackView';

const AppRoutes: React.FC = () => {
    const navigate = useNavigate();
    return (
        <Routes>
            <Route element={<Layout />}>
                <Route index element={<CustomDashboardView />} />
                <Route path="datasource" element={
                    <DatasourceView onImportComplete={() => { navigate('/'); }} />
                } />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="inspector" element={
                    <DataInspector
                        onBack={() => navigate(-1)}
                        fixedMode="table"
                        titleKey="sidebar.data_inspector"
                        breadcrumbKey="sidebar.data_inspector"
                    />
                } />
                <Route path="sql-workspace" element={
                    <DataInspector
                        onBack={() => navigate(-1)}
                        fixedMode="sql"
                        titleKey="sidebar.sql_workspace"
                        breadcrumbKey="sidebar.sql_workspace"
                    />
                } />
                <Route path="query" element={
                    <QueryBuilderView />
                } />
                <Route path="worklist" element={
                    <WorklistView />
                } />
                <Route path="about" element={<AboutView />} />
                <Route path="reports" element={<ReportPackView />} />
            </Route>
        </Routes>
    );
};

export const AppRouter: React.FC = () => (
    <HashRouter>
        <AppRoutes />
    </HashRouter>
);
