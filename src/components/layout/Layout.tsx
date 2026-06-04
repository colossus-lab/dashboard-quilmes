import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ThemeToggle } from '../ui/ThemeToggle';
import { useStore } from '../../store/useStore';
import { REPORTS, getPoblacionReports, getSectorialReports } from '../../data/reportRegistry';
import { useScrollProgress } from '../../hooks/useIntersectionObserver';
import { PersistentSidebar, useIsReportRoute } from './PersistentSidebar';

export function Layout({ children }: { children: React.ReactNode }) {
  const { theme, sidebarOpen } = useStore();
  const progress = useScrollProgress();
  const isReportRoute = useIsReportRoute();

  // Apply theme when it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Progress bar */}
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ height: `${progress * 100}%` }} />
      </div>

      {/* TopBar */}
      <TopBar />

      {/* Sidebar mobile — rendered at root level */}
      {sidebarOpen && <Sidebar />}

      {/* Persistent sidebar — solo en rutas de informe ≥1024px */}
      {isReportRoute && <PersistentSidebar />}

      {/* Main content */}
      <main className="main-content max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        {children}
      </main>
    </div>
  );
}

function TopBar() {
  const location = useLocation();
  const { toggleSidebar } = useStore();
  const isHome = location.pathname === '/';

  return (
    <header
      className="topbar"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-glass)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {(
            <button
              onClick={toggleSidebar}
              aria-label="Menú de navegación"
              className="p-2 rounded-lg hover:opacity-80 transition-opacity lg:hidden"
              style={{ color: 'var(--text-secondary)' }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
            </button>
          )}
          <Link to="/" className="flex items-center no-underline shrink-0" aria-label="Inicio">
            <h1 className="text-lg font-bold" style={{
              fontFamily: 'var(--font-heading)',
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
            }}>
              Dashboard Quilmes
            </h1>
          </Link>

          {/* Breadcrumb */}
          {!isHome && <Breadcrumb />}
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function Breadcrumb() {
  const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean);
  const report = REPORTS.find(r => r.slug === parts.join('/'));

  return (
    <nav className="hidden sm:flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-tertiary)' }}>
      <span className="mx-1 opacity-50">›</span>
      {report?.category && (
        <>
          <span>{report.category}</span>
          {report.subcategory && (
            <>
              <span className="mx-1 opacity-50">›</span>
              <span style={{ color: 'var(--text-accent)' }}>{report.subcategory}</span>
            </>
          )}
        </>
      )}
    </nav>
  );
}

function Sidebar() {
  const { setSidebarOpen } = useStore();
  const poblacion = getPoblacionReports();
  const sectoriales = getSectorialReports();

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setSidebarOpen(false)}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 998,
          background: 'rgba(0,0,0,0.5)',
        }}
      />
      {/* Panel */}
      <aside
        className="slide-in-left"
        style={{
          position: 'fixed',
          top: '4rem',
          left: 0,
          bottom: 0,
          width: '18rem',
          zIndex: 999,
          overflowY: 'auto',
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border-glass)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <nav className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
            Población
          </h3>
          {poblacion.map(r => (
            <Link
              key={r.id}
              to={`/${r.slug}`}
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm no-underline mb-1 transition-colors hover:opacity-90"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--accent-orange)', minWidth: '1.5rem' }}>
                {String(r.order).padStart(2, '0')}
              </span>
              <span>{r.shortTitle}</span>
            </Link>
          ))}

          <hr className="my-4" style={{ borderColor: 'var(--border-glass)' }} />

          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
            Sectorial
          </h3>
          {sectoriales.map(r => (
            <Link
              key={r.id}
              to={`/${r.slug}`}
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm no-underline mb-1 transition-colors hover:opacity-90"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--accent-orange)', minWidth: '1.5rem' }}>
                {String(r.order).padStart(2, '0')}
              </span>
              <span>{r.shortTitle}</span>
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}

