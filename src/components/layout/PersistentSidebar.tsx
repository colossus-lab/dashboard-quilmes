import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getPoblacionReports, getSectorialReports } from '../../data/reportRegistry';

const STORAGE_KEY = 'quilmes-sidebar-collapsed';

export function useIsReportRoute() {
  const { pathname } = useLocation();
  return pathname !== '/';
}

export function PersistentSidebar() {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    document.documentElement.classList.toggle('psidebar-collapsed', collapsed);
  }, [collapsed]);

  useEffect(() => {
    document.documentElement.classList.add('has-psidebar');
    return () => {
      document.documentElement.classList.remove('has-psidebar', 'psidebar-collapsed');
    };
  }, []);

  const poblacion = getPoblacionReports();
  const sectoriales = getSectorialReports();

  const renderLink = (r: { id: string; slug: string; shortTitle: string; order: number }) => {
    const isActive = pathname === `/${r.slug}`;
    return (
      <Link
        key={r.id}
        to={`/${r.slug}`}
        className={`psidebar-link${isActive ? ' is-active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
        title={r.shortTitle}
      >
        <span className="psidebar-link-num">{String(r.order).padStart(2, '0')}</span>
        <span className="psidebar-link-label">{r.shortTitle}</span>
      </Link>
    );
  };

  return (
    <aside className={`psidebar${collapsed ? ' is-collapsed' : ''}`} aria-label="Navegación de informes">
      <button
        type="button"
        className="psidebar-toggle"
        onClick={() => setCollapsed(c => !c)}
        aria-label={collapsed ? 'Expandir navegación' : 'Colapsar navegación'}
        title={collapsed ? 'Expandir' : 'Colapsar'}
      >
        {collapsed ? '»' : '«'}
      </button>

      <h3 className="psidebar-section-title">Población</h3>
      {poblacion.map(renderLink)}

      <h3 className="psidebar-section-title">Sectorial</h3>
      {sectoriales.map(renderLink)}
    </aside>
  );
}
