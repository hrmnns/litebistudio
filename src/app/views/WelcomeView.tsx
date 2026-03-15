import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    ArrowRight,
    BookOpen,
    Code2,
    Database,
    ExternalLink,
    FileSpreadsheet,
    LayoutDashboard,
    Play,
    ShieldCheck,
    Sparkles,
    Search
} from 'lucide-react';
import AppBrandIcon from '../components/ui/AppBrandIcon';
import { Button } from '../components/ui/Button';
import { PageLayout } from '../components/ui/PageLayout';
import { usePageFooterStatus } from '../hooks/usePageFooterStatus';
import { setWelcomeScreenSeen } from '../../lib/onboarding';

const WIKI_BASE_URL = 'https://github.com/hrmnns/litebistudio/wiki';

interface WorkflowStepCardProps {
    index: number;
    title: string;
    description: string;
    icon: React.ReactNode;
    accentClassName: string;
    onOpen: () => void;
    onOpenWiki: () => void;
    openLabel: string;
    wikiLabel: string;
}

const WorkflowStepCard: React.FC<WorkflowStepCardProps> = ({
    index,
    title,
    description,
    icon,
    accentClassName,
    onOpen,
    onOpenWiki,
    openLabel,
    wikiLabel
}) => (
    <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
        <div className={`absolute inset-x-0 top-0 h-1 ${accentClassName}`} />
        <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${accentClassName} bg-opacity-10 text-white shadow-inner`}>
                <div className="text-white">{icon}</div>
            </div>
            <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                        {String(index).padStart(2, '0')}
                    </span>
                </div>
                <h3 className="text-base font-black tracking-tight text-slate-900 dark:text-white">{title}</h3>
                <p className="mt-1.5 text-sm leading-5 text-slate-600 dark:text-slate-400">{description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="primary" className="min-w-0 px-3 py-1.5 text-xs" onClick={onOpen}>
                        {openLabel}
                        <ArrowRight className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" className="min-w-0 px-3 py-1.5 text-xs" onClick={onOpenWiki}>
                        {wikiLabel}
                        <ExternalLink className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    </section>
);

export const WelcomeView: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const footerText = usePageFooterStatus();
    const returnTo = (location.state as { from?: string } | null)?.from || '/';

    const openWikiPath = React.useCallback((path: string) => {
        window.open(`${WIKI_BASE_URL}/${path}`, '_blank', 'noopener,noreferrer');
    }, []);

    const markSeenAndNavigate = React.useCallback((to: string) => {
        setWelcomeScreenSeen(true);
        navigate(to);
    }, [navigate]);

    const markSeenAndReturn = React.useCallback(() => {
        setWelcomeScreenSeen(true);
        navigate(returnTo, { replace: true });
    }, [navigate, returnTo]);

    const workflowSteps = [
        {
            title: t('welcome.steps.import.title', 'Daten importieren'),
            description: t('welcome.steps.import.description', 'Importiere Excel- oder CSV-Dateien, lege neue Tabellen an oder lade Daten in bestehende Tabellen.'),
            icon: <FileSpreadsheet className="h-5 w-5" />,
            accentClassName: 'bg-blue-600',
            to: '/datasource?tab=import',
            wikiPath: 'Page-Data-Management'
        },
        {
            title: t('welcome.steps.structure.title', 'Schema und Tabellen prüfen'),
            description: t('welcome.steps.structure.description', 'Kontrolliere Tabellen, Spalten, Views und Indizes, damit die Datenbasis sauber für Analyse und Dashboard vorbereitet ist.'),
            icon: <Search className="h-5 w-5" />,
            accentClassName: 'bg-cyan-600',
            to: '/datasource?tab=structure',
            wikiPath: 'Page-Data-Management'
        },
        {
            title: t('welcome.steps.sql.title', 'SQL und Views aufbauen'),
            description: t('welcome.steps.sql.description', 'Validiere Daten mit Abfragen, entwickle Views und bereite die fachliche Logik für Widgets und Reports vor.'),
            icon: <Code2 className="h-5 w-5" />,
            accentClassName: 'bg-indigo-600',
            to: '/sql-workspace',
            wikiPath: 'Page-SQL-Workspace'
        },
        {
            title: t('welcome.steps.widgets.title', 'Widgets konfigurieren'),
            description: t('welcome.steps.widgets.description', 'Baue Kennzahlen, Tabellen und Visualisierungen auf und richte die Präsentation deiner Inhalte aus.'),
            icon: <Play className="h-5 w-5" />,
            accentClassName: 'bg-emerald-600',
            to: '/widgets',
            wikiPath: 'Page-Widgets'
        },
        {
            title: t('welcome.steps.dashboard.title', 'Dashboard und Reports nutzen'),
            description: t('welcome.steps.dashboard.description', 'Bringe Widgets auf das Dashboard, arbeite mit den Ergebnissen weiter und erstelle bei Bedarf Berichte.'),
            icon: <LayoutDashboard className="h-5 w-5" />,
            accentClassName: 'bg-amber-500',
            to: '/',
            wikiPath: 'Page-Dashboard'
        }
    ];

    return (
        <PageLayout
            header={{
                title: t('welcome.title', 'Erste Schritte'),
                subtitle: t('welcome.subtitle', 'Gefuehrter Einstieg von Datenimport bis Dashboard'),
                onBack: () => navigate(-1),
                help: {
                    href: `${WIKI_BASE_URL}/Getting-Started`,
                    title: t('welcome.header_help', 'Getting Started im Wiki')
                }
            }}
            breadcrumbs={[
                { label: t('welcome.breadcrumb', 'Erste Schritte') }
            ]}
            footer={footerText}
        >
            <div className="max-w-6xl space-y-8 pb-12">
                <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white shadow-xl md:p-10">
                    <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-col items-center gap-6 md:flex-row md:items-center">
                            <div className="group transition-transform hover:scale-105">
                                <AppBrandIcon size={72} />
                            </div>
                            <div className="max-w-2xl text-center md:text-left">
                                <h2 className="text-3xl tracking-tight md:text-4xl">
                                    <span className="font-semibold">{t('welcome.hero_prefix', 'Welcome to')} </span>
                                    <span className="font-normal">Lite</span><span className="font-black">BI Studio</span>
                                </h2>
                                <p className="mt-3 max-w-2xl text-base font-medium leading-7 text-blue-50/90 md:text-lg">
                                    {t('welcome.hero_text', 'Diese Startseite fuehrt dich Schritt fuer Schritt vom Datenimport ueber Struktur und SQL bis hin zu Widgets, Dashboard und Dokumentation.')}
                                </p>
                                <div className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start">
                                    <span className="rounded-full border border-white/30 bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-50">
                                        {t('welcome.badge_local', 'Lokal')}
                                    </span>
                                    <span className="rounded-full border border-white/30 bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-50">
                                        {t('welcome.badge_private', 'Datenschutz zuerst')}
                                    </span>
                                    <span className="rounded-full border border-white/30 bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-50">
                                        {t('welcome.badge_workflow', 'Gefuehrter Workflow')}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col gap-3 md:min-w-[260px]">
                            <Button variant="primary" className="justify-between border-white/10 bg-white text-blue-700 hover:bg-blue-50" onClick={() => markSeenAndNavigate('/datasource?tab=import')}>
                                {t('welcome.start_import_cta', 'Mit Datenimport starten')}
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" className="justify-between border-white/30 bg-white/10 text-white hover:bg-white/15" onClick={markSeenAndReturn}>
                                {t('welcome.open_workspace_cta', 'Arbeitsbereich oeffnen')}
                                <LayoutDashboard className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                    <div className="absolute right-0 top-0 h-72 w-72 translate-x-16 -translate-y-20 rounded-full bg-white/10 blur-3xl" />
                    <div className="absolute bottom-0 left-0 h-72 w-72 -translate-x-16 translate-y-20 rounded-full bg-blue-950/25 blur-3xl" />
                </section>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="space-y-6 lg:col-span-2">
                        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                            <div className="mb-5 flex items-center gap-3">
                                <div className="rounded-2xl bg-slate-100 p-2 text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                                    <Sparkles className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
                                        {t('welcome.workflow_title', 'Empfohlener Workflow')}
                                    </h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        {t('welcome.workflow_hint', 'Nutze diese Reihenfolge als sicheren Einstieg von der ersten Datei bis zum fertigen Ergebnis.')}
                                    </p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {workflowSteps.map((step, index) => (
                                    <WorkflowStepCard
                                        key={step.title}
                                        index={index + 1}
                                        title={step.title}
                                        description={step.description}
                                        icon={step.icon}
                                        accentClassName={step.accentClassName}
                                        onOpen={() => markSeenAndNavigate(step.to)}
                                        onOpenWiki={() => openWikiPath(step.wikiPath)}
                                        openLabel={t('welcome.open_page_cta', 'Zur Funktion')}
                                        wikiLabel={t('welcome.open_wiki_cta', 'Wiki oeffnen')}
                                    />
                                ))}
                            </div>
                        </section>
                    </div>

                    <div className="space-y-6">
                        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-900/10">
                            <h3 className="flex items-center gap-2 text-lg font-black tracking-tight text-emerald-900 dark:text-emerald-200">
                                <ShieldCheck className="h-5 w-5" />
                                {t('welcome.safe_start_title', 'Sicher starten')}
                            </h3>
                            <p className="mt-3 text-sm leading-6 text-emerald-800 dark:text-emerald-300">
                                {t('welcome.safe_start_text', 'Lege vor groesseren Importen oder strukturellen Aenderungen ein Backup an und pruefe neue Daten erst in Tabellen oder SQL Workspace.')}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Button variant="primary" className="min-w-0 px-3 py-2 text-sm" onClick={() => markSeenAndNavigate('/datasource?tab=system')}>
                                    {t('welcome.safe_start_backup_cta', 'Zu Wartung und Backup')}
                                </Button>
                            </div>
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                            <h3 className="flex items-center gap-2 text-lg font-black tracking-tight text-slate-900 dark:text-white">
                                <Database className="h-5 w-5 text-blue-600" />
                                {t('welcome.quick_links_title', 'Schnellzugriffe')}
                            </h3>
                            <div className="mt-4 space-y-2">
                                <Button variant="ghost" className="w-full justify-between px-3 py-2 text-sm" onClick={() => markSeenAndNavigate('/')}>
                                    {t('welcome.quick_link_dashboard', 'Dashboard')}
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" className="w-full justify-between px-3 py-2 text-sm" onClick={() => markSeenAndNavigate('/reports')}>
                                    {t('welcome.quick_link_reports', 'Reports')}
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" className="w-full justify-between px-3 py-2 text-sm" onClick={() => markSeenAndNavigate('/settings')}>
                                    {t('welcome.quick_link_settings', 'Einstellungen')}
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                            <h3 className="flex items-center gap-2 text-lg font-black tracking-tight text-slate-900 dark:text-white">
                                <BookOpen className="h-5 w-5 text-indigo-600" />
                                {t('welcome.docs_title', 'Wichtige Dokumentation')}
                            </h3>
                            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
                                {t('welcome.docs_text', 'Die wichtigsten Wiki-Seiten stehen dir direkt aus dem Workflow heraus zur Verfuegung. Fuer tiefergehende Informationen kannst du hier gezielt abspringen.')}
                            </p>
                            <div className="mt-4 space-y-2">
                                <Button variant="ghost" className="w-full justify-between px-3 py-2 text-sm" onClick={() => openWikiPath('Getting-Started')}>
                                    {t('welcome.docs_getting_started', 'Getting Started')}
                                    <ExternalLink className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" className="w-full justify-between px-3 py-2 text-sm" onClick={() => openWikiPath('Page-Data-Management')}>
                                    {t('welcome.docs_data_management', 'Data Management')}
                                    <ExternalLink className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" className="w-full justify-between px-3 py-2 text-sm" onClick={() => openWikiPath('Page-Widgets')}>
                                    {t('welcome.docs_widgets', 'Widgets')}
                                    <ExternalLink className="h-4 w-4" />
                                </Button>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </PageLayout>
    );
};
