import React from 'react';
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { Layout } from './app/Layout';
// import { ComponentGridPage } from './app/pages/ComponentGridPage';
import { SettingsPage } from './app/pages/SettingsPage';

const DatasourceView = React.lazy(() => import('./app/views/DatasourceView').then(m => ({ default: m.DatasourceView })));
const DataInspector = React.lazy(() => import('./app/views/DataInspector').then(m => ({ default: m.DataInspector })));
const QueryBuilderView = React.lazy(() => import('./app/views/QueryBuilderView').then(m => ({ default: m.QueryBuilderView })));
const CustomDashboardView = React.lazy(() => import('./app/views/CustomDashboardView').then(m => ({ default: m.CustomDashboardView })));
const WorklistView = React.lazy(() => import('./app/views/WorklistView').then(m => ({ default: m.WorklistView })));
const AboutView = React.lazy(() => import('./app/views/AboutView').then(m => ({ default: m.AboutView })));
const ReportPackView = React.lazy(() => import('./app/views/ReportPackView'));

const AppRoutes: React.FC = () => {
    const navigate = useNavigate();
    return (
        <React.Suspense fallback={<div className="h-screen w-full bg-slate-50 dark:bg-slate-900" />}>
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
        </React.Suspense>
    );
};

export const AppRouter: React.FC = () => (
    <HashRouter>
        <AppRoutes />
    </HashRouter>
);
