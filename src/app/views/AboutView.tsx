import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '../components/ui/PageLayout';
import { ShieldCheck, Github, BookOpen, Heart, Globe, Mail, ExternalLink } from 'lucide-react';

const LINKS = {
    github: 'https://github.com/hrmnns/litebistudio',
    docs: 'https://github.com/hrmnns/litebistudio/wiki',
    website: 'https://hrmnns.github.io/litebistudio/',
    contact: 'https://www.cherware.de/contact/'
};

export const AboutView: React.FC = () => {
    const { t } = useTranslation();

    const techStack = [
        { name: 'React', description: 'UI Framework' },
        { name: 'SQLite (WASM)', description: 'Local Database' },
        { name: 'Tailwind CSS', description: 'Styling' },
        { name: 'Lucide', description: 'Icon System' },
        { name: 'Vite', description: 'Build Tool' },
        { name: 'TypeScript', description: 'Language' },
    ];

    return (
        <PageLayout
            header={{
                title: t('about.title', 'Über LiteBI Studio'),
                subtitle: t('about.subtitle', 'Informationen zum Projekt und System'),
                onBack: () => window.history.back(),
            }}
            breadcrumbs={[
                { label: t('sidebar.settings', 'Einstellungen'), onClick: () => window.location.hash = '#/settings' },
                { label: t('about.title', 'Über') }
            ]}
        >
            <div className="max-w-4xl space-y-8 pb-12">

                {/* Hero Section */}
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-8 md:p-12 text-white shadow-xl relative overflow-hidden">
                    <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                        <div className="p-4 bg-white/20 backdrop-blur-md rounded-2xl shadow-inner group transition-transform hover:scale-105">
                            <ShieldCheck className="w-16 h-16 md:w-20 md:h-20 text-white" />
                        </div>
                        <div className="text-center md:text-left">
                            <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-2">LiteBI Studio</h2>
                            <p className="text-blue-100 text-lg md:text-xl font-medium max-w-xl">
                                {t('about.tagline', 'Die leichtgewichtige Business Intelligence Plattform direkt im Browser.')}
                            </p>
                            <div className="mt-6 flex flex-wrap justify-center md:justify-start gap-3">
                                <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider border border-white/30">
                                    Version 1.0.0
                                </span>
                                <span className="px-3 py-1 bg-emerald-500/20 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider border border-emerald-500/20 text-emerald-100">
                                    {t('about.status_stable', 'Stabil (Lokal)')}
                                </span>
                            </div>
                        </div>
                    </div>
                    {/* Decorative Elements */}
                    <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                    <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-blue-900/20 rounded-full blur-3xl"></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Project Mission */}
                    <div className="md:col-span-2 space-y-6">
                        <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <Heart className="w-5 h-5 text-rose-500" />
                                {t('about.philosophy_title', 'Unsere Philosophie')}
                            </h3>
                            <div className="prose dark:prose-invert max-w-none text-slate-600 dark:text-slate-400 space-y-4">
                                <p>
                                    {t('about.philosophy_description')}
                                </p>
                                <ul className="list-disc pl-5 space-y-2">
                                    <li><strong>{t('about.point_privacy_title')}:</strong> {t('about.point_privacy_desc')}</li>
                                    <li><strong>{t('about.point_speed_title')}:</strong> {t('about.point_speed_desc')}</li>
                                    <li><strong>{t('about.point_offline_title')}:</strong> {t('about.point_offline_desc')}</li>
                                </ul>
                            </div>
                        </section>

                        {/* Tech Stack */}
                        <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                                {t('about.tech_stack_title', 'Technologie-Stack')}
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {techStack.map((tech) => (
                                    <div key={tech.name} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 transition-colors hover:border-blue-500 group">
                                        <div className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors">{tech.name}</div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400">{tech.description}</div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    {/* Links & Contact */}
                    <div className="space-y-6">
                        <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Links</h3>
                            <div className="space-y-3">
                                <a
                                    href={LINKS.github}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <Github className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                                        <span className="text-sm font-medium">GitHub Repository</span>
                                    </div>
                                    <ExternalLink className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </a>
                                <a
                                    href={LINKS.docs}
                                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <BookOpen className="w-5 h-5 text-blue-500" />
                                        <span className="text-sm font-medium">Dokumentation</span>
                                    </div>
                                    <ExternalLink className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </a>
                                <a
                                    href={LINKS.website}
                                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <Globe className="w-5 h-5 text-emerald-500" />
                                        <span className="text-sm font-medium">Webseite</span>
                                    </div>
                                    <ExternalLink className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </a>
                            </div>
                        </section>

                        <section className="bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30 p-6">
                            <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                                <Mail className="w-4 h-4" />
                                Support
                            </h3>
                            <p className="text-sm text-blue-700 dark:text-blue-300 mb-4 font-medium">
                                Haben Sie Fragen oder Feedback? Wir freuen uns über Ihre Nachricht.
                            </p>
                            <a
                                href={LINKS.contact}
                                className="w-full inline-block text-center py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm shadow-lg shadow-blue-200 dark:shadow-none hover:bg-blue-700 transition-all active:scale-95"
                            >
                                Kontakt aufnehmen
                            </a>
                        </section>

                        <div className="px-2">
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold">
                                © {new Date().getFullYear()} LiteBI Studio Projekt. Released under MIT License.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </PageLayout>
    );
};
