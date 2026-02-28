import React from 'react';
import { AlertTriangle, XCircle, ExternalLink, Eye } from 'lucide-react';
import { locateMasterTab, setReadOnlyMode } from '../../lib/db';

export const MultiTabModal: React.FC = () => {
    const [isLocating, setIsLocating] = React.useState(false);
    const [locateMessage, setLocateMessage] = React.useState<string | null>(null);

    const handleLocateMaster = async () => {
        setIsLocating(true);
        setLocateMessage(null);
        try {
            const info = await locateMasterTab(2200);
            if (!info) {
                setLocateMessage('Kein Master-Tab hat geantwortet. Bitte pruefen Sie geoeffnete LiteBI-Fenster oder Hintergrundprozesse.');
                return;
            }
            const since = new Date(info.startedAt).toLocaleTimeString();
            setLocateMessage(`Master-Tab hat geantwortet (gestartet um ${since}, Ansicht ${info.hash}).`);
        } finally {
            setIsLocating(false);
        }
    };

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
                        LiteBI Studio ist bereits in einem anderen Tab geoeffnet. Um Datenverlust zu vermeiden, ist der Zugriff auf <span className="font-semibold text-slate-900 dark:text-white">einen aktiven Tab</span> beschraenkt.
                    </p>

                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-4 flex gap-3 items-start mb-6">
                        <XCircle className="w-5 h-5 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-sm text-amber-800 dark:text-amber-400">
                            Vermutlich haelt ein anderer sichtbarer oder versteckter Browserprozess die Master-Rolle.
                        </p>
                    </div>

                    <button
                        onClick={handleLocateMaster}
                        disabled={isLocating}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-xl transition-colors mb-2"
                    >
                        {isLocating ? 'Master wird gesucht...' : 'Master-Tab finden'}
                    </button>

                    <div className="mb-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3 text-xs text-slate-600 dark:text-slate-300">
                        <p className="font-semibold mb-1">Wenn keine sichtbare Instanz gefunden wird:</p>
                        <p>1. Alle LiteBI-Tabs/Fenster schliessen.</p>
                        <p>2. Browser-Hintergrundprozesse im Task-Manager beenden.</p>
                        <p>3. Browser neu starten und nur einen Tab oeffnen.</p>
                    </div>

                    <button
                        onClick={() => setReadOnlyMode()}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-medium rounded-xl transition-colors mb-2"
                    >
                        <Eye className="w-5 h-5 flex-shrink-0" />
                        Weiter im Lese-Modus
                    </button>

                    {locateMessage && (
                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{locateMessage}</p>
                    )}
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
