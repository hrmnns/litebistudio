import React from 'react';
import { HashRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Layout } from './app/Layout';
import { hasSeenWelcomeScreen, setWelcomeScreenSeen } from './lib/onboarding';
// import { ComponentGridPage } from './app/pages/ComponentGridPage';
const SettingsPage = React.lazy(() => import('./app/pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const DatasourceView = React.lazy(() => import('./app/views/DatasourceView').then(m => ({ default: m.DatasourceView })));
const TablesView = React.lazy(() => import('./app/views/TablesView').then(m => ({ default: m.TablesView })));
const WidgetsView = React.lazy(() => import('./app/views/WidgetsView').then(m => ({ default: m.WidgetsView })));
const CustomDashboardView = React.lazy(() => import('./app/views/CustomDashboardView').then(m => ({ default: m.CustomDashboardView })));
const WorklistView = React.lazy(() => import('./app/views/WorklistView').then(m => ({ default: m.WorklistView })));
const AboutView = React.lazy(() => import('./app/views/AboutView').then(m => ({ default: m.AboutView })));
const WelcomeView = React.lazy(() => import('./app/views/WelcomeView').then(m => ({ default: m.WelcomeView })));
const ReportPackView = React.lazy(() => import('./app/views/ReportPackView'));

const FirstRunRedirect: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const previousPathRef = React.useRef(location.pathname);

    React.useEffect(() => {
        const previousPath = previousPathRef.current;
        if (
            previousPath === '/welcome'
            && location.pathname !== '/welcome'
            && !hasSeenWelcomeScreen()
        ) {
            setWelcomeScreenSeen(true);
        }
        previousPathRef.current = location.pathname;

        if (location.pathname === '/welcome') return;
        if (hasSeenWelcomeScreen()) return;
        navigate('/welcome', {
            replace: true,
            state: {
                from: `${location.pathname}${location.search || ''}`
            }
        });
    }, [location.pathname, location.search, navigate]);

    return null;
};

const AppRoutes: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    return (
        <React.Suspense fallback={<div className="h-screen w-full bg-slate-50 dark:bg-slate-900" />}>
            <FirstRunRedirect />
            <Routes>
                <Route element={<Layout />}>
                    <Route index element={<CustomDashboardView />} />
                    <Route path="welcome" element={<WelcomeView />} />
                    <Route path="datasource" element={
                        <DatasourceView onImportComplete={() => { navigate('/'); }} />
                    } />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="tables" element={
                        <TablesView
                            key={`tables-${location.key}`}
                            onBack={() => navigate(-1)}
                            fixedMode="table"
                            titleKey="sidebar.data_inspector"
                            breadcrumbKey="sidebar.data_inspector"
                        />
                    } />
                    <Route path="sql-workspace" element={
                        <TablesView
                            key={`sql-workspace-${location.key}`}
                            onBack={() => navigate(-1)}
                            fixedMode="sql"
                            titleKey="sidebar.sql_workspace"
                            breadcrumbKey="sidebar.sql_workspace"
                        />
                    } />
                    <Route path="widgets" element={
                        <WidgetsView />
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


