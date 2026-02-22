import React from 'react';
import { AlertTriangle, XCircle, ExternalLink, Eye } from 'lucide-react';
import { setReadOnlyMode } from '../../lib/db';

export const MultiTabModal: React.FC = () => {
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-8">
                    <div className="flex items-center justify-center w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-2xl mb-6 mx-auto">
                        <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-500" />
                    </div>

                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white text-center mb-3">
                        Zweite Instanz erkannt
                    </h2>

                    <p className="text-slate-600 dark:text-slate-400 text-center mb-8 leading-relaxed">
                        LiteBI Studio ist bereits in einem anderen Tab geöffnet. Um Datenverlust zu vermeiden, ist der Zugriff auf <span className="font-semibold text-slate-900 dark:text-white">einen aktiven Tab</span> beschränkt.
                    </p>

                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-4 flex gap-3 items-start mb-6">
                        <XCircle className="w-5 h-5 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-sm text-amber-800 dark:text-amber-400">
                            Bitte schließen Sie diesen Tab manuell und nutzen Sie die bereits geöffnete Instanz.
                        </p>
                    </div>

                    <button
                        onClick={() => setReadOnlyMode()}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-medium rounded-xl transition-colors mb-2"
                    >
                        <Eye className="w-5 h-5 flex-shrink-0" />
                        Weiter im Lese-Modus
                    </button>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 border-t border-slate-100 dark:border-slate-800 flex justify-center">
                    <a
                        href="https://github.com/hrmnns/litebistudio/blob/48f73003fb415174711f4e77baaf1433637d76ff/docs/Single-Instance-Policy.md"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1 transition-colors"
                    >
                        Warum ist das so? <ExternalLink className="w-3 h-3" />
                    </a>
                </div>
            </div>
        </div>
    );
};
