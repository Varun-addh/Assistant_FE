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

  render() {
    if (!this.state.hasError) return this.props.children;

    const title = this.props.title ?? "Something went wrong";

    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-xl border border-border/60 bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The app hit an unexpected error while rendering. You can reload the page to recover.
          </p>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Reload
            </button>
          </div>

          {import.meta.env.DEV && this.state.error && (
            <pre className="mt-4 max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs">
              {String(this.state.error.stack || this.state.error.message)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
