import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] p-6 dark:bg-slate-950">
        <div className="fx2-card fx2-outline max-w-md p-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7 text-red-500">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-[#111827] dark:text-white">
            화면 오류가 발생했습니다
          </h2>
          <p className="mt-2 text-sm text-[#6B7280] dark:text-slate-400">
            측정 데이터는 브라우저 메모리에 보존됩니다. 다시 시도하거나 새로고침해 주세요.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-slate-50 p-3 text-left text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {this.state.error.message}
          </pre>
          <div className="mt-5 flex justify-center gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              다시 시도
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-xl bg-[#EAF0F8] px-4 py-2 text-xs font-semibold text-[#6B7280] hover:bg-[#111827] hover:text-white dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              새로고침
            </button>
          </div>
        </div>
      </div>
    );
  }
}
