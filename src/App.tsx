import React from 'react';
import { AppRouter } from './router';
import { AppDialogHost } from './app/components/ui/AppDialogHost';
import { SystemRepository } from './lib/repositories/SystemRepository';
import AppBrandIcon from './app/components/ui/AppBrandIcon';
import { ErrorBoundary } from './app/components/ErrorBoundary';

const APP_READY_EVENT = 'litebi:app-ready';
const MIN_SPLASH_MS = 3000;

const StartupSplash: React.FC = () => {
  const [visible, setVisible] = React.useState(true);
  const [minElapsed, setMinElapsed] = React.useState(false);
  const [appReady, setAppReady] = React.useState<boolean>(() => Boolean((window as Window & { __LITEBI_READY__?: boolean }).__LITEBI_READY__));
  const [progress, setProgress] = React.useState(8);

  React.useEffect(() => {
    const handleReady = () => setAppReady(true);
    window.addEventListener(APP_READY_EVENT, handleReady);
    const minTimer = window.setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    // Fallback: ensure splash can close even when dashboard-ready event is not emitted
    // (e.g. direct route entry or partial initialization path).
    const bootstrapProbe = async () => {
      try {
        await SystemRepository.getStorageStatus();
      } catch {
        // Ignore probe errors here; splash should still unblock.
      } finally {
        setAppReady(true);
      }
    };
    void bootstrapProbe();
    return () => {
      window.removeEventListener(APP_READY_EVENT, handleReady);
      window.clearTimeout(minTimer);
    };
  }, []);

  React.useEffect(() => {
    if (!visible) return;
    const tick = window.setInterval(() => {
      setProgress((prev) => {
        const cap = appReady ? 100 : 92;
        const step = appReady ? 6 : 2;
        return Math.min(cap, prev + step);
      });
    }, 120);
    return () => window.clearInterval(tick);
  }, [visible, appReady]);

  React.useEffect(() => {
    if (!(minElapsed && appReady)) return;
    setProgress(100);
    const closeTimer = window.setTimeout(() => setVisible(false), 180);
    return () => window.clearTimeout(closeTimer);
  }, [minElapsed, appReady]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-100/96 dark:bg-slate-950/96 backdrop-blur-sm">
      <div className="w-[min(92vw,520px)] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 shadow-2xl p-7">
        <div className="flex items-center gap-3">
          <AppBrandIcon size={40} />
          <div>
            <h1 className="text-base font-black tracking-tight text-slate-800 dark:text-slate-100">LiteBI Studio</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Preparing your workspace...</p>
          </div>
        </div>
        <div className="mt-6">
          <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-[width] duration-150 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>{appReady ? 'Finalizing...' : 'Loading modules...'}</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <AppRouter />
      <AppDialogHost />
      <StartupSplash />
    </ErrorBoundary>
  );
}

export default App;
