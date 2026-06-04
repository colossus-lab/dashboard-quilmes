import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Landing } from './pages/Landing';
import { ReportView } from './pages/ReportView';
import { IntroHero } from './components/ui/IntroHero';
import { useFirstVisit } from './hooks/useFirstVisit';
import React from 'react';
import { Analytics } from '@vercel/analytics/react';

// Solo mostramos el intro en la home. En rutas profundas (alguien
// compartió un link a un informe) se muestra directo el contenido.
function FirstVisitIntro() {
  const { isFirst, dismiss } = useFirstVisit();
  const location = useLocation();
  if (!isFirst || location.pathname !== '/') return null;
  return <IntroHero onDismiss={dismiss} />;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#f1f5f9',
          background: '#0a0f1c',
          minHeight: '100vh',
        }}>
          <h1 style={{ color: '#ef4444', fontSize: '2rem' }}>⚠️ Error de renderizado</h1>
          <pre style={{
            background: '#1e293b',
            padding: '20px',
            borderRadius: '12px',
            textAlign: 'left',
            overflowX: 'auto',
            marginTop: '20px',
            fontSize: '0.85rem',
            color: '#f59e0b',
          }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/'; }}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              background: '#00d4ff',
              color: '#0a0f1c',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Volver al Dashboard
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <FirstVisitIntro />
        <Layout>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/*" element={<ReportView />} />
          </Routes>
        </Layout>
      </BrowserRouter>
      <Analytics />
    </ErrorBoundary>
  );
}
