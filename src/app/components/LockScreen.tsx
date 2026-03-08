import React, { useEffect, useState } from 'react';
import { Lock, Unlock, AlertCircle } from 'lucide-react';
import { useDashboard } from '../../lib/context/DashboardContext';
import { hashPin } from '../../lib/utils/crypto';

const PIN_ATTEMPTS_KEY = 'litebistudio_pin_failed_attempts';
const PIN_LOCK_UNTIL_KEY = 'litebistudio_pin_lock_until';
const PIN_MAX_ATTEMPTS = 5;
const PIN_BASE_LOCK_MS = 15_000;

export const LockScreen: React.FC = () => {
    const { isLocked, unlockApp } = useDashboard();
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [shake, setShake] = useState(false);
    const [failedAttempts, setFailedAttempts] = useState<number>(() => {
        const raw = localStorage.getItem(PIN_ATTEMPTS_KEY);
        const parsed = Number(raw || '0');
        return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    });
    const [lockedUntil, setLockedUntil] = useState<number>(() => {
        const raw = localStorage.getItem(PIN_LOCK_UNTIL_KEY);
        const parsed = Number(raw || '0');
        return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    });
    const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
        const raw = localStorage.getItem(PIN_LOCK_UNTIL_KEY);
        const parsed = Number(raw || '0');
        if (!Number.isFinite(parsed) || parsed <= 0) return 0;
        return Math.max(0, Math.ceil((parsed - Date.now()) / 1000));
    });
    const isTemporarilyLocked = lockedUntil > 0 && remainingSeconds > 0;

    const handleUnlock = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (isTemporarilyLocked) {
            setError(`Zu viele Fehlversuche. Bitte in ${remainingSeconds}s erneut versuchen.`);
            return;
        }

        const storedHash = localStorage.getItem('litebistudio_app_pin');
        const salt = localStorage.getItem('litebistudio_app_pin_salt') || '';

        if (!storedHash) {
            unlockApp();
            return;
        }

        const inputHash = await hashPin(pin, salt);
        if (inputHash === storedHash) {
            unlockApp();
            setPin('');
            setError('');
            setFailedAttempts(0);
            setLockedUntil(0);
            setRemainingSeconds(0);
            localStorage.removeItem(PIN_ATTEMPTS_KEY);
            localStorage.removeItem(PIN_LOCK_UNTIL_KEY);
            return;
        }

        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);
        localStorage.setItem(PIN_ATTEMPTS_KEY, String(nextAttempts));
        if (nextAttempts >= PIN_MAX_ATTEMPTS) {
            const multiplier = Math.max(1, nextAttempts - PIN_MAX_ATTEMPTS + 1);
            const lockUntilTs = Date.now() + (PIN_BASE_LOCK_MS * multiplier);
            setLockedUntil(lockUntilTs);
            setRemainingSeconds(Math.max(1, Math.ceil((lockUntilTs - Date.now()) / 1000)));
            localStorage.setItem(PIN_LOCK_UNTIL_KEY, String(lockUntilTs));
            setError(`Zu viele Fehlversuche. Bitte in ${Math.ceil((lockUntilTs - Date.now()) / 1000)}s erneut versuchen.`);
        } else {
            const remaining = PIN_MAX_ATTEMPTS - nextAttempts;
            setError(`Falsche PIN. Verbleibende Versuche: ${remaining}`);
        }
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setPin('');
    };

    useEffect(() => {
        if (lockedUntil <= 0) return;
        const timer = window.setInterval(() => {
            const next = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
            setRemainingSeconds(next);
            if (next <= 0) {
                setLockedUntil(0);
                localStorage.removeItem(PIN_LOCK_UNTIL_KEY);
                window.clearInterval(timer);
            }
        }, 250);
        return () => window.clearInterval(timer);
    }, [lockedUntil]);

    if (!isLocked) return null;

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
                            disabled={isTemporarilyLocked}
                            onChange={(e) => {
                                setError('');
                                setPin(e.target.value);
                            }}
                            className="w-full bg-slate-900 border border-slate-700 text-white text-center text-3xl tracking-[1em] py-4 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:tracking-normal font-mono"
                            placeholder="****"
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
                        disabled={pin.length < 4 || isTemporarilyLocked}
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
