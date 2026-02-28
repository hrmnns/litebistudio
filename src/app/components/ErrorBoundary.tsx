import React from 'react';

interface ErrorBoundaryState {
    hasError: boolean;
    errorMessage: string;
}

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            errorMessage: ''
        };
    }

    static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
        return {
            hasError: true,
            errorMessage: error instanceof Error ? error.message : String(error)
        };
    }

    componentDidCatch(error: unknown, info: React.ErrorInfo): void {
        console.error('Unhandled UI error:', error, info);
    }

    private handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
                    <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-6">
                        <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 mb-2">Application Error</h1>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            A rendering error occurred. You can reload the app and continue working.
                        </p>
                        {this.state.errorMessage && (
                            <div className="mb-5 rounded-lg bg-slate-100 dark:bg-slate-800 p-3 text-xs text-slate-700 dark:text-slate-300 break-words">
                                {this.state.errorMessage}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={this.handleReload}
                            className="h-10 px-4 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
                        >
                            Reload
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
