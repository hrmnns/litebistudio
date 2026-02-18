import React, { useState } from 'react';
import { Lock, Unlock, AlertCircle } from 'lucide-react';
import { useDashboard } from '../../lib/context/DashboardContext';
import { hashPin } from '../../lib/utils/crypto';

export const LockScreen: React.FC = () => {
    const { isLocked, unlockApp } = useDashboard();
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [shake, setShake] = useState(false);

    // If not locked, don't render anything
    if (!isLocked) return null;

    const handleUnlock = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        const storedHash = localStorage.getItem('litebistudio_app_pin');
        if (!storedHash) {
            // Should not happen if isLocked is true, but safe fallback
            unlockApp();
            return;
        }

        const inputHash = await hashPin(pin);
        if (inputHash === storedHash) {
            unlockApp();
            setPin('');
            setError('');
        } else {
            setError('Falsche PIN');
            setShake(true);
            setTimeout(() => setShake(false), 500);
            setPin('');
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-4">
            <div className={`w-full max-w-sm bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-6 ${shake ? 'animate-shake' : ''}`}>
                <div className="p-4 bg-slate-700/50 rounded-full ring-4 ring-slate-800">
                    <Lock className="w-8 h-8 text-blue-500" />
                </div>

                <div className="text-center space-y-2">
                    <h2 className="text-2xl font-bold text-white">System gesperrt</h2>
                    <p className="text-slate-400">Bitte geben Sie Ihre PIN ein, um fortzufahren.</p>
                </div>

                <form onSubmit={handleUnlock} className="w-full space-y-4">
                    <div className="relative">
                        <input
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoFocus
                            maxLength={6}
                            value={pin}
                            onChange={(e) => {
                                setError('');
                                setPin(e.target.value);
                            }}
                            className="w-full bg-slate-900 border border-slate-700 text-white text-center text-3xl tracking-[1em] py-4 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:tracking-normal font-mono"
                            placeholder="••••"
                        />
                    </div>

                    {error && (
                        <div className="flex items-center justify-center gap-2 text-red-400 text-sm animate-fade-in">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={pin.length < 4}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <Unlock className="w-4 h-4" />
                        Entsperren
                    </button>

                </form>

                <div className="text-xs text-slate-500 mt-4">
                    LiteBI Studio Protected
                </div>
            </div>

            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                .animate-shake {
                    animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
                }
            `}</style>
        </div>
    );
};
