import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary caught an error]:', error, info);
    this.setState({ info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px 20px', maxWidth: 640, margin: '60px auto', textAlign: 'center' }} className="animate-fade-in">
          <div className="card" style={{ borderColor: 'var(--danger-weak-bd)', background: 'var(--danger-weak)', padding: 32 }}>
            <AlertTriangle size={44} style={{ color: 'var(--danger)', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Something went wrong</h3>
            <p className="muted" style={{ fontSize: 13.5, marginBottom: 20 }}>
              {this.state.error?.message || 'An unexpected rendering error occurred in this view.'}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                className="btn btn-primary"
                onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              >
                <RefreshCw size={15} /> Reload page
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => { this.setState({ hasError: false, error: null }); }}
              >
                Dismiss &amp; continue
              </button>
            </div>
            {this.state.error?.stack && (
              <details style={{ marginTop: 24, textAlign: 'left' }}>
                <summary className="eyebrow" style={{ cursor: 'pointer', color: 'var(--danger)' }}>Technical details</summary>
                <pre style={{ fontSize: 11, background: 'var(--surface-3)', padding: 12, borderRadius: 8, overflowX: 'auto', marginTop: 8 }}>
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
