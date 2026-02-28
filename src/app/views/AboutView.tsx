import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '../components/ui/PageLayout';
import { Github, BookOpen, FileText, Heart, Globe, Mail, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AppBrandIcon from '../components/ui/AppBrandIcon';

const LINKS = {
    github: 'https://github.com/hrmnns/litebistudio',
    readme: 'https://github.com/hrmnns/litebistudio/blob/main/README.md',
    changelog: 'https://github.com/hrmnns/litebistudio/blob/main/CHANGELOG.md',
    docs: 'https://github.com/hrmnns/litebistudio/wiki',
    website: 'https://hrmnns.github.io/litebistudio/',
    contact: 'https://www.cherware.de/contact/'
};

export const AboutView: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const version = __APP_VERSION__;
    const buildNumber = __BUILD_NUMBER__;

    const techStack = [
        { name: 'React', description: t('about.tech_ui_framework') },
        { name: 'TypeScript', description: t('about.tech_language') },
        { name: 'Vite', description: t('about.tech_build_tool') },
        { name: 'Tailwind CSS', description: t('about.tech_styling') },
        { name: 'SQLite (WASM) + OPFS', description: t('about.tech_local_database') },
        { name: 'Recharts', description: t('about.tech_visualization') },
        { name: 'i18next + react-i18next', description: t('about.tech_i18n') },
        { name: 'html2canvas + jsPDF', description: t('about.tech_pdf_export') },
        { name: 'Lucide', description: t('about.tech_icon_system') },
    ];

    return (
        <PageLayout
            header={{
                title: t('about.title', 'About LiteBI Studio'),
                subtitle: t('about.subtitle', 'Information about the project and system'),
                onBack: () => navigate(-1),
            }}
            breadcrumbs={[
                { label: t('sidebar.settings', 'Settings'), onClick: () => navigate('/settings') },
                { label: t('about.title', 'About') }
            ]}
        >
            <div className="max-w-4xl space-y-8 pb-12">
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-8 md:p-12 text-white shadow-xl relative overflow-hidden">
                    <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                        <div className="p-4 bg-white/20 backdrop-blur-md rounded-2xl shadow-inner group transition-transform hover:scale-105">
                            <AppBrandIcon size={80} />
                        </div>
                        <div className="text-center md:text-left">
                            <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-2">LiteBI Studio</h2>
                            <p className="text-blue-100 text-lg md:text-xl font-medium max-w-xl">
                                {t('about.tagline', 'The lightweight business intelligence platform directly in your browser.')}
                            </p>
                            <div className="mt-6 flex flex-wrap justify-center md:justify-start gap-3">
                                <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider border border-white/30">
                                    Version {version}
                                </span>
                                <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider border border-white/30">
                                    Build {buildNumber}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
                    <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-blue-900/20 rounded-full blur-3xl" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-6">
                        <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <Heart className="w-5 h-5 text-rose-500" />
                                {t('about.philosophy_title', 'Our Philosophy')}
                            </h3>
                            <div className="prose dark:prose-invert max-w-none text-slate-600 dark:text-slate-400 space-y-4">
                                <p>{t('about.philosophy_description')}</p>
                                <ul className="list-disc pl-5 space-y-2">
                                    <li><strong>{t('about.point_privacy_title')}:</strong> {t('about.point_privacy_desc')}</li>
                                    <li><strong>{t('about.point_speed_title')}:</strong> {t('about.point_speed_desc')}</li>
                                    <li><strong>{t('about.point_offline_title')}:</strong> {t('about.point_offline_desc')}</li>
                                </ul>
                            </div>
                        </section>

                        <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                                {t('about.tech_stack_title', 'Tech Stack')}
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

                    <div className="space-y-6">
                        <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{t('about.links_title', 'Links')}</h3>
                            <div className="space-y-3">
                                <a
                                    href={LINKS.github}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <Github className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                                        <span className="text-sm font-medium">{t('about.link_github', 'GitHub Repository')}</span>
                                    </div>
                                    <ExternalLink className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </a>
                                <a
                                    href={LINKS.readme}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <BookOpen className="w-5 h-5 text-indigo-500" />
                                        <span className="text-sm font-medium">{t('about.link_readme', 'README')}</span>
                                    </div>
                                    <ExternalLink className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </a>
                                <a
                                    href={LINKS.changelog}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <FileText className="w-5 h-5 text-amber-500" />
                                        <span className="text-sm font-medium">{t('about.link_changelog', 'Changelog')}</span>
                                    </div>
                                    <ExternalLink className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </a>
                                <a
                                    href={LINKS.docs}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <BookOpen className="w-5 h-5 text-blue-500" />
                                        <span className="text-sm font-medium">{t('about.link_docs', 'Documentation')}</span>
                                    </div>
                                    <ExternalLink className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </a>
                                <a
                                    href={LINKS.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <Globe className="w-5 h-5 text-emerald-500" />
                                        <span className="text-sm font-medium">{t('about.link_website', 'Website')}</span>
                                    </div>
                                    <ExternalLink className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </a>
                            </div>
                        </section>

                        <section className="bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30 p-6">
                            <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                                <Mail className="w-4 h-4" />
                                {t('about.support_title', 'Support')}
                            </h3>
                            <p className="text-sm text-blue-700 dark:text-blue-300 mb-4 font-medium">
                                {t('about.support_text', 'Do you have questions or feedback? We look forward to your message.')}
                            </p>
                            <a
                                href={LINKS.contact}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full inline-block text-center py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm shadow-lg shadow-blue-200 dark:shadow-none hover:bg-blue-700 transition-all active:scale-95"
                            >
                                {t('about.contact_cta', 'Contact us')}
                            </a>
                        </section>

                        <div className="px-2">
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold">
                                {t('about.copyright_prefix', '© {{year}} LiteBI Studio Project. Released under ', { year: new Date().getFullYear() })}
                                <a href="LICENSE" target="_blank" rel="noopener noreferrer">MIT License</a>.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </PageLayout>
    );
};
