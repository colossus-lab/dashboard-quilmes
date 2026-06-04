import type { ReportEntry } from '../types/report';

// ═══════════════════════════════════════════════════════════════
// Report Registry — Dashboard Quilmes
// 10 informes: 8 de Población (Censo 2022) + 2 de Seguridad
// ═══════════════════════════════════════════════════════════════

export const REPORTS: ReportEntry[] = [
  // ─── Grupo 1: Población — Censo 2022 INDEC ───
  {
    id: 'poblacion-estructura',
    slug: 'poblacion/estructura',
    title: 'Estructura por Sexo y Edad',
    shortTitle: 'Estructura',
    category: 'Población',
    subcategory: 'Estructura',
    icon: '👥',
    color: '#74ACDF',
    mdPath: '/reports/poblacion/estructura.md',
    dataPath: '/data/poblacion/estructura.json',
    order: 1,
  },
  {
    id: 'poblacion-viviendas',
    slug: 'poblacion/viviendas',
    title: 'Stock Habitacional y Viviendas',
    shortTitle: 'Viviendas',
    category: 'Población',
    subcategory: 'Viviendas',
    icon: '🏘️',
    color: '#93C5F8',
    mdPath: '/reports/poblacion/viviendas.md',
    dataPath: '/data/poblacion/viviendas.json',
    order: 2,
  },
  {
    id: 'poblacion-hogares',
    slug: 'poblacion/hogares',
    title: 'Condiciones Habitacionales de los Hogares',
    shortTitle: 'Hogares',
    category: 'Población',
    subcategory: 'Hogares',
    icon: '🏗️',
    color: '#F6B40E',
    mdPath: '/reports/poblacion/hogares.md',
    dataPath: '/data/poblacion/hogares.json',
    order: 3,
  },
  {
    id: 'poblacion-habitacional-personas',
    slug: 'poblacion/habitacional-personas',
    title: 'Condiciones Habitacionales de la Población',
    shortTitle: 'Hábitat Personas',
    category: 'Población',
    subcategory: 'Habitacional Personas',
    icon: '🏠',
    color: '#FFD04A',
    mdPath: '/reports/poblacion/habitacional-personas.md',
    dataPath: '/data/poblacion/habitacional-personas.json',
    order: 4,
  },
  {
    id: 'poblacion-salud',
    slug: 'poblacion/salud',
    title: 'Cobertura de Salud',
    shortTitle: 'Salud',
    category: 'Población',
    subcategory: 'Salud',
    icon: '🏥',
    color: '#6BBF59',
    mdPath: '/reports/poblacion/salud.md',
    dataPath: '/data/poblacion/salud.json',
    order: 5,
  },
  {
    id: 'poblacion-prevision',
    slug: 'poblacion/prevision',
    title: 'Previsión Social',
    shortTitle: 'Previsión',
    category: 'Población',
    subcategory: 'Previsión',
    icon: '👴',
    color: '#D9A20E',
    mdPath: '/reports/poblacion/prevision.md',
    dataPath: '/data/poblacion/prevision.json',
    order: 6,
  },
  {
    id: 'poblacion-actividad-economica',
    slug: 'poblacion/actividad-economica',
    title: 'Actividad Económica',
    shortTitle: 'Actividad',
    category: 'Población',
    subcategory: 'Actividad Económica',
    icon: '💼',
    color: '#4A8ABF',
    mdPath: '/reports/poblacion/actividad-economica.md',
    dataPath: '/data/poblacion/actividad-economica.json',
    order: 7,
  },
  {
    id: 'poblacion-educacion',
    slug: 'poblacion/educacion',
    title: 'Educación',
    shortTitle: 'Educación',
    category: 'Población',
    subcategory: 'Educación',
    icon: '🎓',
    color: '#C03A18',
    mdPath: '/reports/poblacion/educacion.md',
    dataPath: '/data/poblacion/educacion.json',
    order: 8,
  },
  // ─── Grupo 2: Seguridad ───
  {
    id: 'seguridad-snic',
    slug: 'seguridad/snic',
    title: 'Seguridad Ciudadana — SNIC 2000-2024',
    shortTitle: 'Delitos SNIC',
    category: 'Seguridad',
    subcategory: 'SNIC',
    icon: '🛡️',
    color: '#1F4E89',
    mdPath: '/reports/seguridad/snic.md',
    dataPath: '/data/seguridad/snic.json',
    order: 9,
  },
  {
    id: 'seguridad-muertes-viales',
    slug: 'seguridad/muertes-viales',
    title: 'Muertes Viales — SAT 2017-2023',
    shortTitle: 'Muertes Viales',
    category: 'Seguridad',
    subcategory: 'Viales',
    icon: '🚦',
    color: '#D9534F',
    mdPath: '/reports/seguridad/muertes-viales.md',
    dataPath: '/data/seguridad/muertes-viales.json',
    order: 10,
  },
];

export function getReportBySlug(slug: string): ReportEntry | undefined {
  return REPORTS.find(r => r.slug === slug);
}

export function getReportsByCategory(category: string): ReportEntry[] {
  return REPORTS.filter(r => r.category === category);
}

export function getPoblacionReports(): ReportEntry[] {
  return REPORTS.filter(r => r.category === 'Población');
}

export function getSectorialReports(): ReportEntry[] {
  return REPORTS.filter(r => r.category !== 'Población');
}
