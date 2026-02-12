import React from "react";

type ErrorBoundaryProps = {
  children: React.ReactNode;
  title?: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Keep this as console.error so we don't hide crash details during debugging.
    console.error("[ErrorBoundary] Unhandled render error", error, errorInfo);
  }

  private handleReload = () => {
    try {
      window.location.reload();
    } catch {
      // ignore
    }
  };

  private handleGoHome = () => {
    try {
      window.location.href = '/';
    } catch {
      // ignore
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const title = this.props.title ?? "Something went wrong";

    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          {/* Illustration */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="h-20 w-20 rounded-2xl bg-red-500/10 dark:bg-red-500/5 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 text-red-500/70">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-red-500/20 animate-ping" />
            </div>
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm p-8 shadow-xl shadow-black/5">
            <h1 className="text-xl font-semibold text-center">{title}</h1>
            <p className="mt-3 text-sm text-muted-foreground text-center leading-relaxed">
              The app hit an unexpected error. This is usually temporary — reloading the page should fix things.
              If it keeps happening, try clearing your browser cache.
            </p>

            <div className="mt-6 flex gap-3 justify-center">
              <button
                type="button"
                onClick={this.handleGoHome}
                className="inline-flex items-center justify-center rounded-lg border border-border/60 bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Go home
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
              >
                Reload page
              </button>
            </div>

            {/* Error ID for support (always shown, non-technical) */}
            <p className="mt-6 text-center text-xs text-muted-foreground/60">
              Error ID: {Date.now().toString(36).toUpperCase()}
            </p>
          </div>

          {/* Dev-only stack trace */}
          {import.meta.env.DEV && this.state.error && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                Developer details
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-muted/50 border border-border/30 p-4 text-xs font-mono leading-relaxed">
                {String(this.state.error.stack || this.state.error.message)}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
