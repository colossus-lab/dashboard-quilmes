import { Link } from 'react-router-dom';
import { useEffect, useRef, useState, useCallback } from 'react';
import { getPoblacionReports, getSectorialReports } from '../data/reportRegistry';
import { SectionReveal } from '../components/ui/SectionReveal';
import type { ReportEntry } from '../types/report';

// ─── Macro KPIs for the hero ───
const HERO_STATS = [
  { value: 633391, label: 'Habitantes', suffix: '' },
  { value: 92, label: 'km²', suffix: '' },
  { value: 6, label: 'Localidades', suffix: '' },
  { value: 10, label: 'Informes', suffix: '' },
];

// ─── Resumen del partido (Cuadro 1.2 bloque Gobierno Local, INDEC 2022) ───
// Valores espejados en public/data/resumen.json — fuente única de verdad.
// Se hardcodean acá para renderizar sin loading state en el primer fold.
const RESUMEN = {
  categoria: 'Municipio de única categoría',
  stats: [
    { value: '226.056', label: 'Viviendas totales', hint: '225.987 particulares · 69 colectivas' },
    { value: '631.774', label: 'Población en viviendas particulares' },
    { value: '1.574', label: 'Población en viviendas colectivas', hint: 'Geriátricos, hospitales, hogares de menores, cuarteles' },
    { value: '43', label: 'Personas en situación de calle' },
  ],
};

// ─── Stat ticker items per report (rotan cada 4s en cada card) ───
type TickerStat = { value: string; label: string };
const REPORT_STATS: Record<string, TickerStat[]> = {
  'poblacion-estructura':           [{ value: '633K', label: 'habitantes' }, { value: '+8,7%', label: 'vs 2010' }, { value: '6', label: 'localidades' }],
  'poblacion-viviendas':            [{ value: '226K', label: 'viviendas' }, { value: '69', label: 'colectivas' }, { value: '215K', label: 'hogares' }],
  'poblacion-hogares':              [{ value: '215K', label: 'hogares' }, { value: '2,9', label: 'pers/hogar' }, { value: '60%', label: 'gas de red' }],
  'poblacion-habitacional-personas':[{ value: '56%', label: 'gas de red' }, { value: '93%', label: 'agua por cañería' }, { value: '74%', label: 'cloacas' }],
  'poblacion-salud':                [{ value: '62%', label: 'obra social' }, { value: '36%', label: 'sin cobertura' }],
  'poblacion-prevision':            [{ value: '18%', label: 'percibe' }, { value: '82%', label: 'no percibe' }],
  'poblacion-actividad-economica':  [{ value: '57%', label: 'empleo' }, { value: '10,4%', label: 'desocupación' }, { value: '37%', label: 'inactivos' }],
  'poblacion-educacion':            [{ value: '7,2%', label: 'universitario' }, { value: '15%', label: 'superior completa' }],
  'seguridad-snic':                 [{ value: '18,6K', label: 'hechos 2024' }, { value: '25', label: 'años de serie' }],
  'seguridad-muertes-viales':       [{ value: '234', label: 'víctimas 2017-23' }, { value: '7', label: 'años SAT' }],
};

export function Landing() {
  const poblacion = getPoblacionReports();
  const sectoriales = getSectorialReports();

  return (
    <div className="landing-page">
      {/* ─── Animated Hero ─── */}
      <SectionReveal>
        <header className="landing-hero">
          {/* Floating particles */}
          <div className="hero-particles" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="hero-particle" style={{ '--i': i } as React.CSSProperties} />
            ))}
          </div>

          <div className="hero-content">
            <div className="hero-badge">
              <span className="hero-badge-dot" />
              Datos abiertos · Quilmes
            </div>
            <h1 className="hero-title">
              Quilmes en números
            </h1>
            <p className="hero-subtitle">
              Hecho desde{' '}
              <a href="https://colossuslab.org" target="_blank" rel="noopener noreferrer" className="hero-link">
                Colossus Lab
              </a>{' '}
              con datos abiertos vía{' '}
              <a href="https://www.openarg.org" target="_blank" rel="noopener noreferrer" className="hero-link hero-highlight">
                OpenArg
              </a>{' '}
              🇦🇷
            </p>

            {/* ─── Count-up Stats ─── */}
            <div className="hero-stats">
              {HERO_STATS.map((stat, i) => (
                <div key={stat.label}>
                  {i > 0 && <span className="hero-stat-divider" />}
                  <div className="hero-stat">
                    <CountUp target={stat.value} suffix={stat.suffix} />
                    <span className="hero-stat-label">{stat.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </header>
      </SectionReveal>

      {/* ─── Cuadro resumen — Gobierno local y viviendas colectivas ─── */}
      <SectionReveal>
        <section className="resumen-card" aria-labelledby="resumen-titulo">
          <div className="resumen-card-header">
            <span className="resumen-card-eyebrow">Resumen del partido</span>
            <h2 id="resumen-titulo" className="resumen-card-title">
              {RESUMEN.categoria}
            </h2>
            <p className="resumen-card-source">
              Censo Nacional 2022 (INDEC) — bloque Gobierno Local. Datos no cubiertos en los otros informes.
            </p>
          </div>
          <div className="resumen-card-grid">
            {RESUMEN.stats.map(stat => (
              <div key={stat.label} className="resumen-stat">
                <span className="resumen-stat-value">{stat.value}</span>
                <span className="resumen-stat-label">{stat.label}</span>
                {stat.hint && <span className="resumen-stat-hint">{stat.hint}</span>}
              </div>
            ))}
          </div>
        </section>
      </SectionReveal>

      {/* ─── Intro a categorías ─── */}
      <SectionReveal>
        <div className="categorias-intro">
          <h2 className="categorias-intro-title">Explorá las categorías</h2>
        </div>
      </SectionReveal>

      {/* ─── Población Grid ─── */}
      <SectionReveal>
        <section className="landing-section">
          <div className="section-header">
            <div className="section-number">01</div>
            <div>
              <h2 className="section-title">Quiénes somos en Quilmes</h2>
              <p className="section-desc">Cuántos somos, cómo vivimos, de dónde venimos. La foto del Censo 2022 del partido.</p>
            </div>
          </div>
          <div className="report-grid">
            {poblacion.map((report, i) => (
              <ReportCard key={report.id} report={report} index={i} />
            ))}
          </div>
        </section>
      </SectionReveal>

      {/* ─── Sectoriales Grid ─── */}
      <SectionReveal>
        <section className="landing-section">
          <div className="section-header">
            <div className="section-number">02</div>
            <div>
              <h2 className="section-title">Seguridad en el barrio</h2>
              <p className="section-desc">25 años de delitos y 7 años de víctimas viales. Lo que pasa en Quilmes, con números oficiales.</p>
            </div>
          </div>
          <div className="report-grid report-grid--compact">
            {sectoriales.map((report, i) => (
              <ReportCard key={report.id} report={report} index={i} />
            ))}
          </div>
        </section>
      </SectionReveal>


      {/* ─── Footer ─── */}
      <footer className="landing-footer">
        <div className="footer-rule" />
        <p>
          <a href="https://colossuslab.org" target="_blank" rel="noopener noreferrer" className="footer-link">
            ColossusLab.org
          </a>{' '}
          •{' '}
          <a href="https://www.openarg.org" target="_blank" rel="noopener noreferrer" className="footer-link">
            OpenArg.org
          </a>
        </p>
      </footer>
    </div>
  );
}

// ═══════ Components ═══════

function ReportCard({ report, index }: { report: ReportEntry; index: number }) {
  const stats = REPORT_STATS[report.id] || [];

  return (
    <Link
      to={`/${report.slug}`}
      className="report-card"
      style={{
        '--card-color': report.color,
        animationDelay: `${index * 80}ms`,
      } as React.CSSProperties}
    >
      <div className="report-card-header">
        <span className="report-card-number">{String(report.order).padStart(2, '0')}</span>
        <span className="report-card-arrow">→</span>
      </div>
      <div className="report-card-body">
        <span className="report-card-title">{report.shortTitle}</span>
        <span className="report-card-desc">{report.title}</span>
      </div>
      {stats.length > 0 && (
        <div className="report-card-stat">
          <StatTicker items={stats} />
        </div>
      )}
    </Link>
  );
}

// ─── StatTicker — cicla items con slide animation ───
function StatTicker({ items }: { items: TickerStat[] }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (items.length <= 1) return;
    const id = window.setInterval(() => {
      setIdx(i => (i + 1) % items.length);
    }, 4000);
    return () => window.clearInterval(id);
  }, [items.length]);

  const item = items[idx];
  return (
    <div className="report-card-ticker" aria-live="polite">
      <div key={idx} className="report-card-ticker-item">
        <span className="report-card-ticker-value">{item.value}</span>
        <span className="report-card-ticker-label">{item.label}</span>
      </div>
    </div>
  );
}

// ─── Count-up Animation ───
function CountUp({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  const animate = useCallback(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;
    const duration = 2000;
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) animate(); },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animate]);

  const formatted = value >= 1000000
    ? `${(value / 1000000).toFixed(1).replace('.', ',')}M`
    : value >= 1000
    ? value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    : `${value}`;

  return (
    <span ref={ref} className="hero-stat-value">
      {formatted}{suffix}
    </span>
  );
}
