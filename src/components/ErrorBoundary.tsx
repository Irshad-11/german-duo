import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('UI error', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="login" id="main"><div className="login-card" role="alert">
        <h1>Something broke</h1>
        <p className="muted">The page hit an unexpected error. Your data is safe — it lives in the database.</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload the app</button>
      </div></main>
    );
  }
}
