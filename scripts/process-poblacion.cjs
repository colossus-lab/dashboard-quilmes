// ════════════════════════════════════════════════════════════════════
// process-poblacion.cjs
// Genera los 8 informes de Población del Dashboard Quilmes a partir de
// los cuadros del Censo 2022 publicados por INDEC.
//
// Outputs:
//   public/data/poblacion/estructura.json
//   public/data/poblacion/viviendas.json
//   public/data/poblacion/hogares.json
//   public/data/poblacion/habitacional-personas.json
//   public/data/poblacion/salud.json
//   public/data/poblacion/prevision.json
// ════════════════════════════════════════════════════════════════════

const path = require('path');
const XLSX = require('xlsx');
const {
  INDEC_BASE,
  QUILMES,
  GBA24,
  normalize,
  toNumber,
  readSheetMatrix,
  findPartidoRow,
  buildPartidoSheetIndex,
  findTotalRow,
  writeJson,
  fmtInt,
  fmtPct,
  fmtDec,
  buildFeatured,
} = require('./lib/indec-utils.cjs');

const CENSO_DIR = path.join(INDEC_BASE, 'poblacion', 'censo_2022');
const OUT_DIR = path.join(__dirname, '..', 'public', 'data', 'poblacion');
const SOURCE = 'INDEC — Censo Nacional de Población, Hogares y Viviendas 2022';
const DATE = '2026-04-23';

// ── Helpers ─────────────────────────────────────────────────────────
function loadCuadro(file, sheetHint) {
  const full = path.join(CENSO_DIR, file);
  const matrix = readSheetMatrix(full, sheetHint);
  return matrix;
}

function extractAllPartidosCol(matrix, colIndex) {
  // Para los 24 del GBA (+ todas las filas detectadas por código)
  const out = [];
  for (const p of GBA24) {
    const row = findPartidoRow(matrix, p.codigo, p.nombre);
    const v = row ? toNumber(row[colIndex]) : null;
    out.push({ codigo: p.codigo, nombre: p.nombre, value: v });
  }
  return out;
}

// (buildFeatured vive en ./lib/indec-utils.cjs — emite el KPI destacado
// que el ReportView renderiza como bloque "hero" en lugar de mapa.)

function rankGBA(rows, order = 'desc') {
  return [...rows]
    .filter(r => r.value != null)
    .sort((a, b) => (order === 'desc' ? b.value - a.value : a.value - b.value))
    .map(r => ({
      name: r.nombre,
      value: r.value,
      municipioId: r.codigo,
    }));
}

// ════════════════════════════════════════════════════════════════════
// 1. ESTRUCTURA POBLACIONAL
// ════════════════════════════════════════════════════════════════════
function processEstructura() {
  console.log('\n─── Estructura ───');

  // est_c1: Total población 2010 y 2022 + variación
  const c1 = loadCuadro('c2022_bsas_est_c1_2.xlsx', 'Cuadro1.2');
  const quilmesRow1 = findPartidoRow(c1, QUILMES.codigo, QUILMES.nombre);
  const pob2010 = toNumber(quilmesRow1[2]);
  const pob2022 = toNumber(quilmesRow1[3]);
  const varAbs = toNumber(quilmesRow1[4]);
  const varRel = toNumber(quilmesRow1[5]);

  // est_c2: Superficie + densidad
  const c2 = loadCuadro('c2022_bsas_est_c2_2.xlsx', 'Cuadro2.2');
  const quilmesRow2 = findPartidoRow(c2, QUILMES.codigo, QUILMES.nombre);
  const superficie = toNumber(quilmesRow2[2]);
  const densidad = toNumber(quilmesRow2[4]);

  // est_c6: Edad mediana
  const c6 = loadCuadro('c2022_bsas_est_c6_2.xlsx', 'Cuadro 6.2');
  const quilmesRow6 = findPartidoRow(c6, QUILMES.codigo, QUILMES.nombre);
  const edadMediana = toNumber(quilmesRow6[2]);
  const edadMedianaMuj = toNumber(quilmesRow6[3]);
  const edadMedianaVar = toNumber(quilmesRow6[4]);

  // est_c7: % 65+ (historical 1970-2022, column indices: 2..7)
  const c7 = loadCuadro('c2022_bsas_est_c7_2.xlsx', 'Cuadro 7.2');
  const quilmesRow7 = findPartidoRow(c7, QUILMES.codigo, QUILMES.nombre);
  const serie65 = ['1970', '1980', '1991', '2001', '2010', '2022'].map((year, i) => ({
    year,
    value: toNumber(quilmesRow7[2 + i]),
  })).filter(d => d.value != null);
  const pct65 = serie65[serie65.length - 1]?.value;

  // est_c8: Índice envejecimiento
  const c8 = loadCuadro('c2022_bsas_est_c8_2.xlsx', 'Cuadro 8.2');
  const quilmesRow8 = findPartidoRow(c8, QUILMES.codigo, QUILMES.nombre);
  const serieEnv = ['1970', '1980', '1991', '2001', '2010', '2022'].map((year, i) => ({
    year,
    value: toNumber(quilmesRow8[2 + i]),
  })).filter(d => d.value != null);
  const envIndex = serieEnv[serieEnv.length - 1]?.value;

  // est_c9: Dependencia
  const c9 = loadCuadro('c2022_bsas_est_c9_2.xlsx', 'Cuadro 9.2');
  const quilmesRow9 = findPartidoRow(c9, QUILMES.codigo, QUILMES.nombre);
  const serieDep = ['1970', '1980', '1991', '2001', '2010', '2022'].map((year, i) => ({
    year,
    value: toNumber(quilmesRow9[2 + i]),
  })).filter(d => d.value != null);

  // est_c5: pirámide por edad (hoja específica de Quilmes: 102)
  // Estructura: [Edad, Total, VivP, VivC]
  let piramide = [];
  try {
    const c5 = loadCuadro('c2022_bsas_est_c5_2.xlsx', 'Cuadro5.2.102');
    for (const r of c5) {
      if (!r || !r[0]) continue;
      const label = String(r[0]).trim();
      // Solo quinquenales (ej: "0-4", "5-9", ... "95-99", "100 y más")
      if (/^\d+[-\u2013]\d+$/.test(label) || /100\s*y\s*m[aá]s/i.test(label)) {
        const tot = toNumber(r[1]);
        if (tot != null) piramide.push({ grupo: label, total: tot });
      }
    }
  } catch (e) {
    console.warn('  ⚠ No se pudo leer pirámide:', e.message);
  }

  // est_c4: Sexo por edad (hoja 102)
  let piramideSexo = [];
  try {
    const c4 = loadCuadro('c2022_bsas_est_c4_2.xlsx', 'Cuadro4.2.102');
    for (const r of c4) {
      if (!r || !r[0]) continue;
      const label = String(r[0]).trim();
      if (/^\d+[-\u2013]\d+$/.test(label) || /100\s*y\s*m[aá]s/i.test(label)) {
        const muj = toNumber(r[2]);
        const var_ = toNumber(r[3]);
        if (muj != null && var_ != null) {
          piramideSexo.push({ grupo: label, mujeres: muj, varones: var_ });
        }
      }
    }
  } catch (e) {
    console.warn('  ⚠ No se pudo leer pirámide sexo:', e.message);
  }

  // Rankings GBA24: población, densidad, % 65+
  const gbaPob = extractAllPartidosCol(c1, 3);
  const gbaDens = extractAllPartidosCol(c2, 4);
  const gbaPct65 = extractAllPartidosCol(c7, 7); // columna 2022
  const gbaEdadMediana = extractAllPartidosCol(c6, 2);

  // Cálculos contextuales
  const gbaPobValues = gbaPob.filter(p => p.value != null).map(p => p.value);
  const totalGBA = gbaPobValues.reduce((a, b) => a + b, 0);
  const shareGBA = pob2022 / totalGBA;
  const rankingPob = rankGBA(gbaPob).findIndex(r => r.municipioId === QUILMES.codigo) + 1;
  const rankingDens = rankGBA(gbaDens).findIndex(r => r.municipioId === QUILMES.codigo) + 1;

  // ── Variación poblacional 2010-2022 vs promedio GBA ──
  let totPob2010 = 0, totPob2022 = 0;
  for (const p of GBA24) {
    const r = findPartidoRow(c1, p.codigo, p.nombre);
    if (!r) continue;
    totPob2010 += toNumber(r[2]) || 0;
    totPob2022 += toNumber(r[3]) || 0;
  }
  const varGBA = totPob2010 ? ((totPob2022 - totPob2010) / totPob2010) * 100 : null;
  const deltaVar = varRel - varGBA;

  // ── Fecundidad: cantidad de hijos por mujer + cohortes ──
  // c2_2.102 (Quilmes sub-hoja): Mujeres 14-49 por edad y cantidad de hijos
  let fecundidad = null;
  try {
    const fec = loadCuadro('c2022_bsas_fecundidad_c2_2.xlsx', 'Cuadro 2.2.102');
    const fecTotal = findTotalRow(fec);
    const muj14a49 = toNumber(fecTotal[1]);
    const sinHijos = toNumber(fecTotal[2]);
    const conHijos = muj14a49 - sinHijos;
    const promHijos = toNumber(fecTotal[8]) || 0;
    const cohortes = []; // tasa por edad
    for (const r of fec) {
      if (!r) continue;
      const lbl = String(r[0] || '').trim();
      if (/^\d{1,2}-\d{1,2}$/.test(lbl)) {
        cohortes.push({ grupo: lbl, mujeres: toNumber(r[1]), promHijos: toNumber(r[8]) });
      }
    }
    // Cohort completion: 40-44 promedio = "fecundidad casi terminada"
    const c40a44 = cohortes.find(c => c.grupo === '40-44')?.promHijos;
    const c45a49 = cohortes.find(c => c.grupo === '45-49')?.promHijos;
    fecundidad = {
      muj14a49, sinHijos, conHijos, promHijos,
      pctSinHijos: muj14a49 ? (sinHijos / muj14a49) * 100 : null,
      cohortes, c40a44, c45a49,
    };
  } catch (e) { console.warn('  ⚠ Fecundidad no disponible:', e.message); }

  // ── Migraciones: lugar de nacimiento en Quilmes ──
  let migraciones = null;
  try {
    const mig = loadCuadro('c2022_bsas_migraciones_c2_2.xlsx', 'Cuadro 2.2.102');
    const migTot = mig.find(r => r && String(r[0] || '').trim().toLowerCase() === 'total');
    if (migTot) {
      const totM = toNumber(migTot[2]);
      const enBSAS = toNumber(migTot[3]);
      const otraProv = toNumber(migTot[4]);
      const otroPais = toNumber(migTot[5]);
      migraciones = {
        total: totM, enBSAS, otraProv, otroPais,
        pctEnBSAS: totM ? (enBSAS / totM) * 100 : null,
        pctOtraProv: totM ? (otraProv / totM) * 100 : null,
        pctOtroPais: totM ? (otroPais / totM) * 100 : null,
      };
    }
  } catch (e) { console.warn('  ⚠ Migraciones no disponibles:', e.message); }

  // ── Razón de masculinidad agregada (por sexo total) ──
  const totVar = piramideSexo.reduce((a, b) => a + (b.varones || 0), 0);
  const totMuj = piramideSexo.reduce((a, b) => a + (b.mujeres || 0), 0);
  const razonMasc = totMuj ? (totVar / totMuj) * 100 : null;

  // ── Índice de dependencia desagregado ──
  // Necesitamos pob 0-14, 15-64 y 65+. Lo derivamos de la pirámide.
  function sumByGroup(piramide, agesList) {
    return piramide.filter(p => agesList.includes(p.grupo)).reduce((a, b) => a + (b.total || 0), 0);
  }
  const ages0a14 = ['0-4', '5-9', '10-14'];
  const ages15a64 = ['15-19', '20-24', '25-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60-64'];
  const ages65plus = ['65-69', '70-74', '75-79', '80-84', '85-89', '90-94', '95-99', '100 y más'];
  const pob0a14 = sumByGroup(piramide, ages0a14);
  const pob15a64 = sumByGroup(piramide, ages15a64);
  const pob65plus = sumByGroup(piramide, ages65plus);
  const idxDepenJuv = pob15a64 ? (pob0a14 / pob15a64) * 100 : null;
  const idxDepenVej = pob15a64 ? (pob65plus / pob15a64) * 100 : null;
  const idxDepenTot = pob15a64 ? ((pob0a14 + pob65plus) / pob15a64) * 100 : null;

  const data = {
    meta: {
      id: 'poblacion-estructura',
      title: 'Estructura por Sexo y Edad — Quilmes',
      category: 'Población',
      subcategory: 'Estructura',
      source: SOURCE,
      date: DATE,
    },
    kpis: [
      {
        id: 'poblacion-total',
        label: 'Población 2022',
        value: pob2022,
        formatted: fmtInt(pob2022),
        unit: 'hab',
        status: 'good',
        comparison: `${fmtPct(shareGBA * 100)} de los 24 GBA`,
      },
      {
        id: 'variacion',
        label: 'Variación 2010-2022',
        value: varRel,
        formatted: `+${fmtDec(varRel)}%`,
        status: varRel >= 5 ? 'good' : 'warning',
        comparison: `+${fmtInt(varAbs)} habitantes`,
      },
      {
        id: 'densidad',
        label: 'Densidad',
        value: densidad,
        formatted: fmtInt(densidad),
        unit: 'hab/km²',
        status: 'warning',
        comparison: `Ranking ${rankingDens}° en el GBA`,
      },
      {
        id: 'edad-mediana',
        label: 'Edad mediana',
        value: edadMediana,
        formatted: String(edadMediana),
        unit: 'años',
        comparison: `Mujeres: ${edadMedianaMuj} • Varones: ${edadMedianaVar}`,
      },
      {
        id: 'pct65',
        label: 'Población 65+',
        value: pct65,
        formatted: fmtPct(pct65),
        status: pct65 > 14 ? 'warning' : 'good',
        comparison: `Índice envejecimiento: ${envIndex}`,
      },
      {
        id: 'dependencia',
        label: 'Índice de dependencia total',
        value: idxDepenTot,
        formatted: idxDepenTot ? fmtDec(idxDepenTot) : '—',
        comparison: `Juvenil: ${fmtDec(idxDepenJuv)} · Vejez: ${fmtDec(idxDepenVej)}`,
      },
      {
        id: 'razon-masc',
        label: 'Razón de masculinidad',
        value: razonMasc,
        formatted: razonMasc ? fmtDec(razonMasc) : '—',
        comparison: `Varones por cada 100 mujeres`,
      },
      {
        id: 'fecundidad',
        label: 'Hijos promedio (mujeres 14-49)',
        value: fecundidad ? fecundidad.promHijos : null,
        formatted: fecundidad ? fmtDec(fecundidad.promHijos) : '—',
        comparison: fecundidad ? `Cohorte 40-44: ${fmtDec(fecundidad.c40a44)} hijos/mujer (fecundidad acumulada)` : '',
      },
      {
        id: 'migra-otro-pais',
        label: 'Nacida/o en otro país',
        value: migraciones ? migraciones.pctOtroPais : null,
        formatted: migraciones ? fmtPct(migraciones.pctOtroPais) : '—',
        comparison: migraciones ? `${fmtInt(migraciones.otroPais)} personas` : '',
      },
      {
        id: 'migra-otra-prov',
        label: 'Nacida/o en otra provincia',
        value: migraciones ? migraciones.pctOtraProv : null,
        formatted: migraciones ? fmtPct(migraciones.pctOtraProv) : '—',
        comparison: migraciones ? `${fmtInt(migraciones.otraProv)} personas` : '',
      },
    ],
    charts: [
      piramideSexo.length > 0 && {
        id: 'piramide',
        type: 'bar',
        title: 'Pirámide poblacional por sexo — Quilmes 2022',
        sectionId: 'piramide',
        data: piramideSexo.map(p => ({
          grupo: p.grupo,
          Mujeres: p.mujeres,
          Varones: -p.varones,
        })),
        config: { xAxis: 'grupo', layout: 'horizontal' },
      },
      {
        id: 'serie-65',
        type: 'line',
        title: '% de población 65 y más — Quilmes (1970-2022)',
        sectionId: 'envejecimiento',
        data: [{ id: 'Quilmes', data: serie65.map(d => ({ x: d.year, y: d.value })) }],
      },
      {
        id: 'serie-env',
        type: 'line',
        title: 'Índice de envejecimiento — Quilmes (1970-2022)',
        sectionId: 'envejecimiento',
        data: [{ id: 'Quilmes', data: serieEnv.map(d => ({ x: d.year, y: d.value })) }],
      },
      {
        id: 'pob-gba',
        type: 'bar',
        title: 'Población por partido — 24 partidos del GBA (2022)',
        sectionId: 'comparacion',
        data: rankGBA(gbaPob).map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
      {
        id: 'densidad-gba',
        type: 'bar',
        title: 'Densidad poblacional — 24 partidos del GBA (hab/km²)',
        sectionId: 'comparacion',
        data: rankGBA(gbaDens).map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
      fecundidad && {
        id: 'fec-cohorte',
        type: 'line',
        title: 'Hijos promedio por mujer según cohorte etaria — Quilmes',
        sectionId: 'fecundidad',
        data: [{
          id: 'Hijos por mujer',
          data: fecundidad.cohortes.map(c => ({ x: c.grupo, y: c.promHijos })),
        }],
      },
      migraciones && {
        id: 'migra',
        type: 'pie',
        title: 'Lugar de nacimiento de la población — Quilmes',
        sectionId: 'migracion',
        data: [
          { id: 'Provincia de Buenos Aires', label: 'Provincia de Buenos Aires', value: migraciones.enBSAS },
          { id: 'Otra provincia', label: 'Otra provincia', value: migraciones.otraProv },
          { id: 'Otro país', label: 'Otro país', value: migraciones.otroPais },
        ].filter(d => d.value > 0),
      },
    ].filter(Boolean),
    rankings: [
      {
        id: 'ranking-pob',
        title: 'Población total — 24 partidos GBA',
        sectionId: 'comparacion',
        items: rankGBA(gbaPob),
        order: 'desc',
      },
      {
        id: 'ranking-densidad',
        title: 'Densidad (hab/km²) — 24 partidos GBA',
        sectionId: 'comparacion',
        items: rankGBA(gbaDens),
        order: 'desc',
      },
      {
        id: 'ranking-65',
        title: '% de población 65 años y más — 24 partidos GBA',
        sectionId: 'envejecimiento',
        items: rankGBA(gbaPct65),
        order: 'desc',
      },
    ],
    mapData: buildFeatured(pob2022, fmtInt(pob2022), 'Habitantes en Quilmes (Censo 2022)'),
    extras: {
      estructura: {
        partido: {
          pob2010, pob2022, varAbs, varRel, superficie, densidad,
          edadMediana, edadMedianaMuj, edadMedianaVar,
          pct65, envIndex,
          serie65, serieEnv, serieDep,
          razonMasc, totVar, totMuj,
          pob0a14, pob15a64, pob65plus,
          idxDepenJuv, idxDepenVej, idxDepenTot,
        },
        gba: { rankingPob, rankingDens, totalGBA, shareGBA, varGBA, deltaVar },
        fecundidad,
        migraciones,
      },
    },
  };

  writeJson(path.join(OUT_DIR, 'estructura.json'), data);
  return { pob2022, varRel, superficie, densidad, edadMediana, pct65, envIndex, rankingPob };
}

// ════════════════════════════════════════════════════════════════════
// 2. VIVIENDAS
// Cuadros usados:
//   c1_2 — Stock total + condición de ocupación + viviendas colectivas
//   c2_2 — Cantidad de hogares por vivienda particular ocupada (multihogar)
//   c3_2 — Tipo de vivienda particular (casa, depto, etc.)
// ════════════════════════════════════════════════════════════════════
function processViviendas() {
  console.log('\n─── Viviendas ───');

  // ── c1_2: ocupación ──
  // cols: 0 cod, 1 partido, 2 total, 3 particulares, 4 hay personas presentes, 5 sin personas, 6-10 más detalle desocupación, 11 colectivas
  const c1 = loadCuadro('c2022_bsas_vivienda_c1_2.xlsx', 'Cuadro1.2');
  const quilmesRow1 = findPartidoRow(c1, QUILMES.codigo, QUILMES.nombre);
  const totalViv = toNumber(quilmesRow1[2]);
  const particulares = toNumber(quilmesRow1[3]);
  const ocupadas = toNumber(quilmesRow1[4]);
  const desocupadas = particulares - ocupadas;
  const colectivas = toNumber(quilmesRow1[11]) || (totalViv - particulares);

  const pctOcupadas = (ocupadas / particulares) * 100;
  const pctDesocupadas = (desocupadas / particulares) * 100;
  const pctColectivas = (colectivas / totalViv) * 100;

  // ── c3_2: tipo ──
  const c3 = loadCuadro('c2022_bsas_vivienda_c3_2.xlsx', 'Cuadro 3.2');
  const quilmesRow3 = findPartidoRow(c3, QUILMES.codigo, QUILMES.nombre);
  const totalParticulares = toNumber(quilmesRow3[2]);
  const tipos = [
    { label: 'Casa', value: toNumber(quilmesRow3[3]) },
    { label: 'Rancho', value: toNumber(quilmesRow3[4]) },
    { label: 'Casilla', value: toNumber(quilmesRow3[5]) },
    { label: 'Departamento', value: toNumber(quilmesRow3[6]) },
    { label: 'Pieza en inquilinato', value: toNumber(quilmesRow3[7]) },
    { label: 'Local no construido para habitar', value: toNumber(quilmesRow3[8]) },
    { label: 'Vivienda móvil', value: toNumber(quilmesRow3[9]) },
  ].filter(t => t.value != null && t.value > 0);

  const casa = tipos.find(t => t.label === 'Casa')?.value || 0;
  const depto = tipos.find(t => t.label === 'Departamento')?.value || 0;
  const pieza = tipos.find(t => t.label === 'Pieza en inquilinato')?.value || 0;
  const rancho = tipos.find(t => t.label === 'Rancho')?.value || 0;
  const casilla = tipos.find(t => t.label === 'Casilla')?.value || 0;
  const pctCasa = (casa / totalParticulares) * 100;
  const pctDepto = (depto / totalParticulares) * 100;
  const pctPieza = (pieza / totalParticulares) * 100;
  const pctPrecaria = ((rancho + casilla) / totalParticulares) * 100;

  // ── c2_2: hogares por vivienda (multihogar) ──
  const c2 = loadCuadro('c2022_bsas_vivienda_c2_2.xlsx', 'Cuadro2.2');
  const quilmesRow2 = findPartidoRow(c2, QUILMES.codigo, QUILMES.nombre);
  const vivOcup = toNumber(quilmesRow2[2]);
  const hogTotal = toNumber(quilmesRow2[3]);
  const unHog = toNumber(quilmesRow2[4]);
  const dosHog = toNumber(quilmesRow2[6]);
  const tresOMas = toNumber(quilmesRow2[8]);
  const pctUnHogar = (unHog / vivOcup) * 100;
  const pctMultiHogar = ((dosHog + tresOMas) / vivOcup) * 100;

  // ── Densidad de viviendas (viviendas/km² — necesita superficie de Estructura) ──
  let superficie = null;
  try {
    const cest = loadCuadro('c2022_bsas_est_c2_2.xlsx', 'Cuadro2.2');
    const sR = findPartidoRow(cest, QUILMES.codigo, QUILMES.nombre);
    superficie = toNumber(sR[2]);
  } catch (e) { /* no-op */ }
  const densidadViv = superficie ? totalViv / superficie : null;

  // ── GBA24 + promedios ponderados + posiciones ──
  const gbaTotal = extractAllPartidosCol(c1, 2);
  const gbaPart = extractAllPartidosCol(c1, 3);
  const gbaOcup = extractAllPartidosCol(c1, 4);
  const gbaDesoc = GBA24.map(p => {
    const r = findPartidoRow(c1, p.codigo, p.nombre);
    if (!r) return { codigo: p.codigo, nombre: p.nombre, value: null };
    const part = toNumber(r[3]); const oc = toNumber(r[4]);
    return { codigo: p.codigo, nombre: p.nombre, value: part ? ((part - oc) / part) * 100 : null };
  });
  const gbaDeptoPct = GBA24.map(p => {
    const r = findPartidoRow(c3, p.codigo, p.nombre);
    if (!r) return { codigo: p.codigo, nombre: p.nombre, value: null };
    const tot = toNumber(r[2]);
    const dept = toNumber(r[6]);
    return { codigo: p.codigo, nombre: p.nombre, value: tot ? (dept / tot) * 100 : null };
  });
  const gbaPrecaria = GBA24.map(p => {
    const r = findPartidoRow(c3, p.codigo, p.nombre);
    if (!r) return { codigo: p.codigo, nombre: p.nombre, value: null };
    const tot = toNumber(r[2]);
    const ranch = toNumber(r[4]) || 0;
    const cas = toNumber(r[5]) || 0;
    return { codigo: p.codigo, nombre: p.nombre, value: tot ? ((ranch + cas) / tot) * 100 : null };
  });
  const gbaMultiHog = GBA24.map(p => {
    const r = findPartidoRow(c2, p.codigo, p.nombre);
    if (!r) return { codigo: p.codigo, nombre: p.nombre, value: null };
    const ocup = toNumber(r[2]); const dos = toNumber(r[6]); const tres = toNumber(r[8]);
    return { codigo: p.codigo, nombre: p.nombre, value: ocup ? ((dos + tres) / ocup) * 100 : null };
  });

  // Promedios ponderados GBA
  let totPart = 0, totOc = 0, totDept = 0, totViv = 0, totPrec = 0;
  for (const p of GBA24) {
    const r1 = findPartidoRow(c1, p.codigo, p.nombre);
    const r3 = findPartidoRow(c3, p.codigo, p.nombre);
    if (r1) {
      totPart += toNumber(r1[3]) || 0;
      totOc += toNumber(r1[4]) || 0;
      totViv += toNumber(r1[2]) || 0;
    }
    if (r3) {
      const t = toNumber(r3[2]) || 0;
      totDept += toNumber(r3[6]) || 0;
      totPrec += (toNumber(r3[4]) || 0) + (toNumber(r3[5]) || 0);
    }
  }
  const promPondDesocGBA = totPart ? ((totPart - totOc) / totPart) * 100 : null;
  const promPondDeptoGBA = totViv ? (totDept / totViv) * 100 : null; // approx con totViv como denom
  // Mejor usar totalParticulares como denominador del depto%; reemplazar con sum part
  let totPart3 = 0;
  for (const p of GBA24) {
    const r3 = findPartidoRow(c3, p.codigo, p.nombre);
    if (r3) totPart3 += toNumber(r3[2]) || 0;
  }
  const promPondDeptoGBA2 = totPart3 ? (totDept / totPart3) * 100 : null;
  const promPondPrecGBA = totPart3 ? (totPrec / totPart3) * 100 : null;

  const rkTotal = rankGBA(gbaTotal);
  const rkDepto = rankGBA(gbaDeptoPct);
  const rkPrec = rankGBA(gbaPrecaria);
  const rkDesoc = rankGBA(gbaDesoc);
  const rkMultiHog = rankGBA(gbaMultiHog);
  const posTotal = rkTotal.findIndex(r => r.municipioId === QUILMES.codigo) + 1;
  const posDepto = rkDepto.findIndex(r => r.municipioId === QUILMES.codigo) + 1;
  const posPrec = rkPrec.findIndex(r => r.municipioId === QUILMES.codigo) + 1;
  const posDesoc = rkDesoc.findIndex(r => r.municipioId === QUILMES.codigo) + 1;

  const data = {
    meta: {
      id: 'poblacion-viviendas',
      title: 'Stock de Viviendas — Quilmes',
      category: 'Población',
      subcategory: 'Viviendas',
      source: SOURCE,
      date: DATE,
    },
    kpis: [
      { id: 'total-viv', label: 'Total de viviendas', value: totalViv, formatted: fmtInt(totalViv), unit: 'viv', comparison: `${fmtInt(particulares)} particulares + ${fmtInt(colectivas)} colectivas` },
      { id: 'densidad-viv', label: 'Densidad de viviendas', value: densidadViv, formatted: densidadViv ? fmtInt(Math.round(densidadViv)) : '—', unit: 'viv/km²', comparison: superficie ? `Superficie: ${fmtInt(superficie)} km²` : '' },
      { id: 'ocupadas', label: 'Viviendas ocupadas', value: pctOcupadas, formatted: fmtPct(pctOcupadas), status: 'good', comparison: `${fmtInt(ocupadas)} de ${fmtInt(particulares)}` },
      { id: 'desocupadas', label: 'Viviendas desocupadas', value: pctDesocupadas, formatted: fmtPct(pctDesocupadas), status: 'warning', comparison: `${fmtInt(desocupadas)} viv · vs prom. GBA: ${(pctDesocupadas - promPondDesocGBA) >= 0 ? '+' : ''}${fmtDec(pctDesocupadas - promPondDesocGBA)} pp` },
      { id: 'casa', label: '% Casas', value: pctCasa, formatted: fmtPct(pctCasa), comparison: `${fmtInt(casa)} viviendas` },
      { id: 'depto', label: '% Departamentos', value: pctDepto, formatted: fmtPct(pctDepto), comparison: `${fmtInt(depto)} viviendas · vs prom. GBA: ${(pctDepto - promPondDeptoGBA2) >= 0 ? '+' : ''}${fmtDec(pctDepto - promPondDeptoGBA2)} pp` },
      { id: 'precaria', label: '% Vivienda precaria', value: pctPrecaria, formatted: fmtPct(pctPrecaria, 2), status: pctPrecaria > 1 ? 'warning' : 'good', comparison: `Rancho + casilla: ${fmtInt(rancho + casilla)} viv` },
      { id: 'multihogar', label: '% Viv. con 2+ hogares', value: pctMultiHogar, formatted: fmtPct(pctMultiHogar), status: pctMultiHogar > 2 ? 'warning' : 'good', comparison: `${fmtInt(dosHog + tresOMas)} viv` },
    ],
    charts: [
      {
        id: 'tipos-viv',
        type: 'pie',
        title: 'Composición por tipo de vivienda particular — Quilmes',
        sectionId: 'tipos',
        data: tipos.map(t => ({ id: t.label, label: t.label, value: t.value })),
      },
      {
        id: 'ocupacion',
        type: 'pie',
        title: 'Condición de ocupación de viviendas particulares — Quilmes',
        sectionId: 'ocupacion',
        data: [
          { id: 'Ocupadas', label: 'Ocupadas', value: ocupadas },
          { id: 'Desocupadas', label: 'Desocupadas', value: desocupadas },
        ],
      },
      {
        id: 'gba-total',
        type: 'bar',
        title: 'Total de viviendas por partido — 24 GBA',
        sectionId: 'comparacion',
        data: rkTotal.map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
      {
        id: 'gba-depto',
        type: 'bar',
        title: '% de departamentos sobre total particular — 24 GBA',
        sectionId: 'comparacion',
        data: rkDepto.map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
      {
        id: 'gba-precaria',
        type: 'bar',
        title: '% de vivienda precaria (rancho/casilla) — 24 GBA',
        sectionId: 'comparacion',
        data: rkPrec.map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
      {
        id: 'gba-desoc',
        type: 'bar',
        title: '% de viviendas particulares desocupadas — 24 GBA',
        sectionId: 'comparacion',
        data: rkDesoc.map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
    ],
    rankings: [
      { id: 'rk-total', title: 'Viviendas totales — 24 GBA', sectionId: 'comparacion', items: rkTotal, order: 'desc' },
      { id: 'rk-depto', title: '% Departamentos — 24 GBA', sectionId: 'comparacion', items: rkDepto, order: 'desc' },
      { id: 'rk-precaria', title: '% Vivienda precaria — 24 GBA', sectionId: 'comparacion', items: rkPrec, order: 'desc' },
      { id: 'rk-desoc', title: '% Viviendas desocupadas — 24 GBA', sectionId: 'comparacion', items: rkDesoc, order: 'desc' },
    ],
    mapData: buildFeatured(totalViv, fmtInt(totalViv), 'Viviendas totales censadas en Quilmes'),
    extras: {
      viviendas: {
        partido: {
          totalViv, particulares, colectivas, ocupadas, desocupadas, pctOcupadas, pctDesocupadas, pctColectivas, densidadViv,
          tipos: { casa, depto, rancho, casilla, pieza, pctCasa, pctDepto, pctPieza, pctPrecaria },
          multihogar: { vivOcup, hogTotal, unHog, dosHog, tresOMas, pctUnHogar, pctMultiHogar },
          superficie,
        },
        gba: {
          posiciones: { total: posTotal, depto: posDepto, precaria: posPrec, desoc: posDesoc },
          promPond: { desoc: promPondDesocGBA, depto: promPondDeptoGBA2, precaria: promPondPrecGBA },
        },
      },
    },
  };

  writeJson(path.join(OUT_DIR, 'viviendas.json'), data);
  return { totalViv, pctCasa, pctDepto, pctMultiHogar, pctDesocupadas, pctPrecaria };
}

// ════════════════════════════════════════════════════════════════════
// 3. HOGARES
// Cuadros usados:
//   c4_2 — Combustible para cocinar (por partido)
//   c6_2 — Régimen de tenencia (por partido)
//   c5_2.102 — Habitaciones × baños (hacinamiento desde óptica del hogar)
//   c2_2.102 — Agua del hogar
//   c3_2.102 — Cloaca del hogar
//   c7_2.102 — Internet/computadora del hogar
// ════════════════════════════════════════════════════════════════════
function processHogares() {
  console.log('\n─── Hogares ───');

  // ── c4_2: combustible (partido) ──
  const c4 = loadCuadro('c2022_bsas_hogares_c4_2.xlsx', 'Cuadro4.2');
  const quilmesR4 = findPartidoRow(c4, QUILMES.codigo, QUILMES.nombre);
  const totalHog = toNumber(quilmesR4[2]);
  const combustibles = [
    { label: 'Gas de red', value: toNumber(quilmesR4[4]) },
    { label: 'Gas en garrafa', value: toNumber(quilmesR4[6]) },
    { label: 'Gas a granel', value: toNumber(quilmesR4[5]) },
    { label: 'Electricidad', value: toNumber(quilmesR4[3]) },
    { label: 'Leña/carbón', value: toNumber(quilmesR4[7]) },
    { label: 'Otro', value: toNumber(quilmesR4[8]) },
  ].filter(t => t.value != null && t.value > 0);
  const gasRed = combustibles.find(c => c.label === 'Gas de red')?.value || 0;
  const pctGasRed = (gasRed / totalHog) * 100;
  const garrafa = combustibles.find(c => c.label === 'Gas en garrafa')?.value || 0;
  const pctGarrafa = (garrafa / totalHog) * 100;

  // ── c6_2: tenencia (partido) ──
  const c6 = loadCuadro('c2022_bsas_hogares_c6_2.xlsx', 'Cuadro6.2');
  const quilmesR6 = findPartidoRow(c6, QUILMES.codigo, QUILMES.nombre);
  const totalH6 = toNumber(quilmesR6[2]);
  const propia = toNumber(quilmesR6[3]);
  const conEscritura = toNumber(quilmesR6[4]);
  const conBoleto = toNumber(quilmesR6[5]) || 0;
  const sinDoc = toNumber(quilmesR6[7]) || 0;
  const alquilada = toNumber(quilmesR6[8]);
  const cedidaTrabajo = toNumber(quilmesR6[9]) || 0;
  const cedidaPrestada = toNumber(quilmesR6[10]) || 0;
  const otra = toNumber(quilmesR6[11]) || 0;
  const propiaIrregular = propia - conEscritura;
  const pctPropia = (propia / totalH6) * 100;
  const pctEscritura = (conEscritura / totalH6) * 100;
  const pctPropiaIrregular = (propiaIrregular / totalH6) * 100;
  const pctAlquiler = (alquilada / totalH6) * 100;
  const pctCedida = ((cedidaTrabajo + cedidaPrestada) / totalH6) * 100;
  const pctOtra = (otra / totalH6) * 100;

  // ── c5_2.102: hacinamiento (hogares × habitaciones) ──
  const c5h = loadCuadro('c2022_bsas_hogares_c5_2.xlsx', 'Cuadro5.2.102');
  const c5tot = findTotalRow(c5h);
  const hogTot5 = toNumber(c5tot[1]);
  const habRows = []; // [{ habitaciones, hogares }]
  for (const r of c5h) {
    if (!r || !r[0]) continue;
    const lbl = String(r[0]).trim();
    if (/^[1-9](?:0)?\s*(o\s*m[aá]s)?$/i.test(lbl)) {
      const habs = lbl;
      const hg = toNumber(r[1]);
      if (hg != null) habRows.push({ habitaciones: habs, hogares: hg });
    }
  }
  const hg1 = habRows.find(r => r.habitaciones === '1')?.hogares || 0;
  const hg2 = habRows.find(r => r.habitaciones === '2')?.hogares || 0;
  const hg3 = habRows.find(r => r.habitaciones === '3')?.hogares || 0;
  const hg4 = habRows.find(r => r.habitaciones === '4')?.hogares || 0;
  const hg5plus = habRows.filter(r => /^([5-9]|10|10\s*o\s*m[aá]s)$/i.test(r.habitaciones)).reduce((a, b) => a + b.hogares, 0);
  const pctHogUni = (hg1 / hogTot5) * 100;
  const pctHog2hab = (hg2 / hogTot5) * 100;

  // Tamaño medio del hogar (personas/hogar)
  // Necesitamos pob viv part de Quilmes — la sacamos del cuadro c5 personas (que ya leímos antes en habitacional, pero acá es independiente).
  // Para no acoplar, leemos desde el cuadro de salud o estructura. Salud c1 col 2 = pob viv part.
  let pobVivPart = null;
  try {
    const csalud = loadCuadro('c2022_bsas_salud_c1_2.xlsx', 'Cobertura de Salud N°1.2');
    const sR = findPartidoRow(csalud, QUILMES.codigo, QUILMES.nombre);
    pobVivPart = toNumber(sR[2]);
  } catch (e) { /* no-op */ }
  const tamanoMedio = (pobVivPart && totalHog) ? pobVivPart / totalHog : null;

  // Hacinamiento aproximado: relación personas/habitación a nivel agregado
  // Se usa como proxy: (pobVivPart) / (suma de habitaciones declaradas)
  // Como no tenemos suma directa de habitaciones, computamos un proxy alternativo:
  // (% hogares de 1-2 habitaciones) → universo donde el hacinamiento es posible.
  const pctHog1o2 = ((hg1 + hg2) / hogTot5) * 100;

  // ── c2_2.102: agua del hogar ──
  const c2h = loadCuadro('c2022_bsas_hogares_c2_2.xlsx', 'Cuadro2.2.102');
  const c2htot = findTotalRow(c2h);
  const hogConAguaDentro = toNumber(c2htot[2]);
  const pctHogAguaDentro = (hogConAguaDentro / totalHog) * 100;
  const c2hRed = c2h.find(r => r && /^Red\s+p[uú]blica/i.test(String(r[0] || '').trim()));
  const hogConAguaRedPub = c2hRed ? toNumber(c2hRed[1]) : null;
  const pctHogAguaRedPub = hogConAguaRedPub != null ? (hogConAguaRedPub / totalHog) * 100 : null;

  // ── c3_2.102: cloaca del hogar ──
  const c3h = loadCuadro('c2022_bsas_hogares_c3_2.xlsx', 'Cuadro3.2.102');
  let hogCloaca = null;
  for (let i = 0; i < c3h.length; i++) {
    const r = c3h[i];
    if (!r) continue;
    if (/cloaca/i.test(String(r[0] || ''))) {
      for (let j = i; j < Math.min(i + 4, c3h.length); j++) {
        const rr = c3h[j];
        if (rr && String(rr[1] || '').trim().toLowerCase() === 'total') {
          hogCloaca = toNumber(rr[2]); break;
        }
      }
      if (hogCloaca != null) break;
    }
  }
  const pctHogCloaca = hogCloaca != null ? (hogCloaca / totalHog) * 100 : null;

  // ── c7_2.102: internet/PC del hogar ──
  const c7h = loadCuadro('c2022_bsas_hogares_c7_2.xlsx', 'Cuadro 7.2.102');
  const c7htot = findTotalRow(c7h);
  const hogInternetViv = toNumber(c7htot[2]);
  const hogConPC = toNumber(c7htot[3]);
  const hogSinInternetViv = toNumber(c7htot[5]);
  const pctHogInternet = (hogInternetViv / totalHog) * 100;
  const pctHogConPC = ((hogConPC + (toNumber(c7htot[6]) || 0)) / totalHog) * 100;
  const pctHogSinInternet = (hogSinInternetViv / totalHog) * 100;

  // ── GBA rankings ──
  const gbaGasRed = GBA24.map(p => {
    const r = findPartidoRow(c4, p.codigo, p.nombre);
    if (!r) return { codigo: p.codigo, nombre: p.nombre, value: null };
    const tot = toNumber(r[2]); const gr = toNumber(r[4]);
    return { codigo: p.codigo, nombre: p.nombre, value: tot ? (gr / tot) * 100 : null };
  });
  const gbaAlq = GBA24.map(p => {
    const r = findPartidoRow(c6, p.codigo, p.nombre);
    if (!r) return { codigo: p.codigo, nombre: p.nombre, value: null };
    const tot = toNumber(r[2]); const alq = toNumber(r[8]);
    return { codigo: p.codigo, nombre: p.nombre, value: tot ? (alq / tot) * 100 : null };
  });
  const gbaPropiaIrreg = GBA24.map(p => {
    const r = findPartidoRow(c6, p.codigo, p.nombre);
    if (!r) return { codigo: p.codigo, nombre: p.nombre, value: null };
    const tot = toNumber(r[2]); const prop = toNumber(r[3]); const esc = toNumber(r[4]);
    return { codigo: p.codigo, nombre: p.nombre, value: tot ? ((prop - esc) / tot) * 100 : null };
  });

  // Promedio ponderado GBA (alquiler, irregular)
  let totH = 0, totAlq = 0, totIrreg = 0;
  for (const p of GBA24) {
    const r = findPartidoRow(c6, p.codigo, p.nombre);
    if (!r) continue;
    const t = toNumber(r[2]) || 0;
    const a = toNumber(r[8]) || 0;
    const prop = toNumber(r[3]) || 0;
    const esc = toNumber(r[4]) || 0;
    totH += t; totAlq += a; totIrreg += (prop - esc);
  }
  const promPondAlqGBA = totH ? (totAlq / totH) * 100 : null;
  const promPondPropIrregGBA = totH ? (totIrreg / totH) * 100 : null;

  const rkAlq = rankGBA(gbaAlq);
  const rkPropIrreg = rankGBA(gbaPropiaIrreg);
  const posAlq = rkAlq.findIndex(r => r.municipioId === QUILMES.codigo) + 1;
  const posPropIrreg = rkPropIrreg.findIndex(r => r.municipioId === QUILMES.codigo) + 1;

  const data = {
    meta: {
      id: 'poblacion-hogares',
      title: 'Hogares de Quilmes',
      category: 'Población',
      subcategory: 'Hogares',
      source: SOURCE,
      date: DATE,
    },
    kpis: [
      { id: 'total-hog', label: 'Total de hogares', value: totalHog, formatted: fmtInt(totalHog), unit: 'hogares' },
      { id: 'tamano-medio', label: 'Tamaño medio del hogar', value: tamanoMedio, formatted: tamanoMedio ? fmtDec(tamanoMedio) : '—', unit: 'personas/hogar' },
      { id: 'propia', label: 'Vivienda propia', value: pctPropia, formatted: fmtPct(pctPropia), status: 'good', comparison: `${fmtInt(propia)} hogares` },
      { id: 'escritura', label: 'Propia con escritura', value: pctEscritura, formatted: fmtPct(pctEscritura), comparison: `${fmtInt(conEscritura)} hogares` },
      { id: 'propia-irregular', label: 'Propia sin escritura', value: pctPropiaIrregular, formatted: fmtPct(pctPropiaIrregular), status: 'warning', comparison: `${fmtInt(propiaIrregular)} hogares (boleto, otra doc., sin doc.)` },
      { id: 'alquiler', label: 'Alquilada', value: pctAlquiler, formatted: fmtPct(pctAlquiler), comparison: `${fmtInt(alquilada)} hogares · vs prom. GBA: ${(pctAlquiler - promPondAlqGBA) >= 0 ? '+' : ''}${fmtDec(pctAlquiler - promPondAlqGBA)} pp` },
      { id: 'gas-red', label: 'Cocina con gas de red', value: pctGasRed, formatted: fmtPct(pctGasRed), status: 'good', comparison: `${fmtInt(gasRed)} hogares` },
      { id: 'hog-unipersonal-hab', label: 'Hogar de 1 sola habitación', value: pctHogUni, formatted: fmtPct(pctHogUni), status: 'warning', comparison: `${fmtInt(hg1)} hogares` },
    ],
    charts: [
      {
        id: 'tenencia',
        type: 'pie',
        title: 'Régimen de tenencia del hogar — Quilmes',
        sectionId: 'tenencia',
        data: [
          { id: 'Propia con escritura', label: 'Propia con escritura', value: conEscritura },
          { id: 'Propia sin escritura', label: 'Propia sin escritura', value: propiaIrregular },
          { id: 'Alquilada', label: 'Alquilada', value: alquilada },
          { id: 'Cedida o prestada', label: 'Cedida o prestada', value: cedidaTrabajo + cedidaPrestada },
          { id: 'Otra', label: 'Otra', value: otra },
        ].filter(d => d.value > 0),
      },
      {
        id: 'habitaciones',
        type: 'bar',
        title: 'Hogares por cantidad de habitaciones — Quilmes',
        sectionId: 'tamano',
        data: habRows.slice(0, 8).map(r => ({ habitaciones: r.habitaciones + (parseInt(r.habitaciones) === 1 ? ' habitación' : ' habitaciones'), value: r.hogares })),
        config: { xAxis: 'habitaciones' },
      },
      {
        id: 'combustible',
        type: 'pie',
        title: 'Combustible para cocinar — Hogares de Quilmes',
        sectionId: 'servicios',
        data: combustibles.map(c => ({ id: c.label, label: c.label, value: c.value })),
      },
      {
        id: 'gba-alq',
        type: 'bar',
        title: '% Hogares alquilados — 24 partidos del GBA',
        sectionId: 'comparacion',
        data: rkAlq.map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
      {
        id: 'gba-prop-irreg',
        type: 'bar',
        title: '% Hogares con vivienda propia sin escritura — 24 GBA',
        sectionId: 'comparacion',
        data: rkPropIrreg.map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
      {
        id: 'gba-gasred',
        type: 'bar',
        title: '% Hogares con gas de red — 24 GBA',
        sectionId: 'comparacion',
        data: rankGBA(gbaGasRed).map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
    ],
    rankings: [
      { id: 'rk-alq', title: '% Hogares alquilados — 24 GBA', sectionId: 'comparacion', items: rkAlq, order: 'desc' },
      { id: 'rk-prop-irreg', title: '% Vivienda propia sin escritura — 24 GBA', sectionId: 'comparacion', items: rkPropIrreg, order: 'desc' },
      { id: 'rk-gasred', title: '% Gas de red — 24 GBA', sectionId: 'comparacion', items: rankGBA(gbaGasRed), order: 'desc' },
    ],
    mapData: buildFeatured(totalHog, fmtInt(totalHog), 'Hogares censados en Quilmes'),
    extras: {
      hogares: {
        partido: {
          totalHog, tamanoMedio, pobVivPart,
          tenencia: { propia, conEscritura, propiaIrregular, conBoleto, sinDoc, alquilada, cedidaTrabajo, cedidaPrestada, otra, pctPropia, pctEscritura, pctPropiaIrregular, pctAlquiler, pctCedida, pctOtra },
          combustible: { gasRed, garrafa, pctGasRed, pctGarrafa },
          habitaciones: { hg1, hg2, hg3, hg4, hg5plus, pctHogUni, pctHog2hab, pctHog1o2 },
          agua: { hogConAguaDentro, hogConAguaRedPub, pctHogAguaDentro, pctHogAguaRedPub },
          cloaca: { hogCloaca, pctHogCloaca },
          digital: { hogInternetViv, hogSinInternetViv, hogConPC, pctHogInternet, pctHogConPC, pctHogSinInternet },
        },
        gba: { promPondAlqGBA, promPondPropIrregGBA, posAlq, posPropIrreg },
      },
    },
  };

  writeJson(path.join(OUT_DIR, 'hogares.json'), data);
  return { totalHog, tamanoMedio, pctPropia, pctAlquiler, pctPropiaIrregular };
}

// ════════════════════════════════════════════════════════════════════
// 4. HABITACIONAL (PERSONAS) — Calidad habitacional desde la óptica de
// la población (no del hogar). Cuadros usados:
//   c1_2 — Material techo + piso (calidad constructiva)
//   c2_2 — Provisión y procedencia del agua
//   c3_2 — Desagüe y ubicación del baño / inodoro
//   c4_2 — Combustible para cocinar
//   c5_2 — Habitaciones × baños (hacinamiento)
//   c7_2 — Internet + computadora + celular (brecha digital)
// Las sub-hojas de Quilmes están numeradas (Cuadro X.2.102).
// ════════════════════════════════════════════════════════════════════
function processHabitacionalPersonas() {
  console.log('\n─── Habitacional (personas) ───');

  // ── c4_2: combustible (compatibilidad — la pieza original) ──
  // cols: 0 cod, 1 partido, 2 pob, 3 elec, 4 gas red, 5 granel, 6 garrafa, 7 leña, 8 otro
  const c4 = loadCuadro('c2022_bsas_pob_c4_2.xlsx', 'Cuadro4.2');
  const quilmesR = findPartidoRow(c4, QUILMES.codigo, QUILMES.nombre);
  const pobViv = toNumber(quilmesR[2]);
  const elec = toNumber(quilmesR[3]);
  const gasRed = toNumber(quilmesR[4]);
  const granel = toNumber(quilmesR[5]);
  const garrafa = toNumber(quilmesR[6]);
  const lena = toNumber(quilmesR[7]);
  const pctGasRed = (gasRed / pobViv) * 100;
  const pctGarrafa = (garrafa / pobViv) * 100;
  const pctElec = (elec / pobViv) * 100;

  // ── c2_2: agua por cañería dentro de la vivienda + procedencia red ──
  // En la sub-hoja Quilmes (Cuadro2.2.102): fila Total tiene cols [..., pob, dentro, dentroTerreno, fueraTerreno]
  // y cada fila siguiente desglosa por procedencia (red pública, perforación, etc.)
  const c2 = loadCuadro('c2022_bsas_pob_c2_2.xlsx', 'Cuadro2.2.102');
  const c2tot = findTotalRow(c2);
  const aguaTot = toNumber(c2tot[1]);
  const aguaCañeriaDentro = toNumber(c2tot[2]);
  const aguaFueraVivienda = toNumber(c2tot[3]);
  const aguaFueraTerreno = toNumber(c2tot[4]);
  const pctAguaDentro = (aguaCañeriaDentro / aguaTot) * 100;
  // Procedencia: buscar fila "Red pública" en c2
  const c2red = c2.find(r => r && /^Red\s+p[uú]blica/i.test(String(r[0] || '').trim()));
  const aguaRedPub = c2red ? toNumber(c2red[1]) : null;
  const pctAguaRedPub = (aguaRedPub != null && aguaTot) ? (aguaRedPub / aguaTot) * 100 : null;

  // ── c3_2: desagüe inodoro (cloaca) ──
  // En la sub-hoja Cuadro3.2.102: fila "A red pública (cloaca)" → "Total" tiene la cifra
  const c3 = loadCuadro('c2022_bsas_pob_c3_2.xlsx', 'Cuadro3.2.102');
  const c3tot = findTotalRow(c3);
  const sanitTot = toNumber(c3tot[2]);
  // Buscar "A red pública (cloaca)"  → primera ocurrencia con label "Total" en col 1
  let cloaca = null;
  for (let i = 0; i < c3.length; i++) {
    const r = c3[i];
    if (!r) continue;
    if (/cloaca/i.test(String(r[0] || ''))) {
      // Esta fila o la siguiente con "Total" en col 1
      const c1lbl = String(r[1] || '').trim().toLowerCase();
      if (c1lbl === 'total') { cloaca = toNumber(r[2]); break; }
      // Buscar siguiente fila Total
      for (let j = i; j < Math.min(i + 4, c3.length); j++) {
        const rr = c3[j];
        if (rr && String(rr[1] || '').trim().toLowerCase() === 'total') {
          cloaca = toNumber(rr[2]);
          break;
        }
      }
      if (cloaca != null) break;
    }
  }
  const pctCloaca = (cloaca != null && sanitTot) ? (cloaca / sanitTot) * 100 : null;

  // ── c1_2: piso de cerámica/mosaico/etc (calidad de piso) ──
  // En la sub-hoja Cuadro 1.2.102: row Total → cols [pob, ceramica, carpeta, tierra, otro]
  const c1 = loadCuadro('c2022_bsas_pob_c1_2.xlsx', 'Cuadro 1.2.102');
  const c1tot = findTotalRow(c1);
  const pisoPob = toNumber(c1tot[1]);
  const pisoCeramica = toNumber(c1tot[2]);
  const pisoCarpeta = toNumber(c1tot[3]);
  const pisoTierra = toNumber(c1tot[4]);
  const pisoOtro = toNumber(c1tot[5]);
  const pctPisoCeramica = (pisoCeramica / pisoPob) * 100;
  const pctPisoTierraOtro = ((pisoTierra + pisoOtro) / pisoPob) * 100;

  // ── c5_2: habitaciones × baños (hacinamiento + dotación de baños) ──
  // En la sub-hoja Cuadro5.2.102: filas por cantidad habitaciones; col 1=pob, 2=1baño, 3=2baños, 4=3+, 5=no tiene
  const c5 = loadCuadro('c2022_bsas_pob_c5_2.xlsx', 'Cuadro5.2.102');
  const c5tot = findTotalRow(c5);
  const habitTotal = toNumber(c5tot[1]);
  const baño1 = toNumber(c5tot[2]);
  const baño2 = toNumber(c5tot[3]);
  const baño3plus = toNumber(c5tot[4]);
  const sinBaño = toNumber(c5tot[5]);
  const pctSinBaño = (sinBaño / habitTotal) * 100;

  // Cantidad habitaciones: filas individuales 1, 2, 3, 4, 5...
  const habRows = []; // [{ habitaciones, pob }]
  for (const r of c5) {
    if (!r || !r[0]) continue;
    const lbl = String(r[0]).trim();
    if (/^[1-9](?:0)?\s*(o\s*m[aá]s)?$/i.test(lbl) || /^Total$/i.test(lbl)) {
      const habs = /^Total$/i.test(lbl) ? null : lbl;
      const pop = toNumber(r[1]);
      if (pop != null) habRows.push({ habitaciones: habs, pob: pop });
    }
  }

  // Hacinamiento aproximado: personas con vivienda de 1 sola habitación (sobre el total)
  const hab1 = habRows.find(r => r.habitaciones === '1')?.pob || 0;
  const hab2 = habRows.find(r => r.habitaciones === '2')?.pob || 0;
  const pctHab1 = (hab1 / habitTotal) * 100;
  const pctHab1o2 = ((hab1 + hab2) / habitTotal) * 100;

  // ── c7_2: internet, computadora, celular ──
  // Sub-hoja Cuadro 7.2.102
  // Cols (row 4 = Total general): [pob, internet vivienda total, +pc, sin pc, sin internet vivienda total, +pc, sin pc]
  const c7 = loadCuadro('c2022_bsas_pob_c7_2.xlsx', 'Cuadro 7.2.102');
  const c7tot = findTotalRow(c7);
  const digTotal = toNumber(c7tot[1]);
  const internetVivTotal = toNumber(c7tot[2]);
  const internetVivConPC = toNumber(c7tot[3]);
  const internetVivSinPC = toNumber(c7tot[4]);
  const sinInternetVivTotal = toNumber(c7tot[5]);
  const sinInternetVivConPC = toNumber(c7tot[6]);
  const sinInternetVivSinPC = toNumber(c7tot[7]);
  const pctInternetViv = (internetVivTotal / digTotal) * 100;
  const pctConPC = ((internetVivConPC + sinInternetVivConPC) / digTotal) * 100;
  const pctSinInternetVivienda = (sinInternetVivTotal / digTotal) * 100;
  const pctSinPC = ((internetVivSinPC + sinInternetVivSinPC) / digTotal) * 100;

  // Celular con internet: fila "Tiene celular con internet" → pob (col 1)
  const c7Cell = c7.find(r => r && /^Tiene\s+celular/i.test(String(r[0] || '').trim()));
  const conCelInternet = c7Cell ? toNumber(c7Cell[1]) : null;
  const pctConCelInternet = (conCelInternet != null && digTotal) ? (conCelInternet / digTotal) * 100 : null;

  // ── GBA24 — % gas red, % agua red, % cloaca, % internet vivienda ──
  // Para los rankings, se necesita iterar las sub-hojas de cada cuadro por partido
  function pctByPartidoFromSheet(workbook, prefix, totalCellTot, totalCellNum) {
    const sheetIndex = buildPartidoSheetIndex(workbook, prefix);
    return GBA24.map(p => {
      const sheetName = sheetIndex[normalize(p.nombre)];
      if (!sheetName) return { codigo: p.codigo, nombre: p.nombre, value: null };
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, blankrows: false });
      const tRow = findTotalRow(rows);
      if (!tRow) return { codigo: p.codigo, nombre: p.nombre, value: null };
      const tot = toNumber(tRow[totalCellTot]);
      const num = toNumber(tRow[totalCellNum]);
      return { codigo: p.codigo, nombre: p.nombre, value: tot ? (num / tot) * 100 : null };
    });
  }

  const wb2 = XLSX.readFile(path.join(CENSO_DIR, 'c2022_bsas_pob_c2_2.xlsx'));
  const gbaAguaDentro = pctByPartidoFromSheet(wb2, 'Cuadro2.2', 1, 2);

  const wb3wb = XLSX.readFile(path.join(CENSO_DIR, 'c2022_bsas_pob_c3_2.xlsx'));
  // Para cloaca: hay que buscar la fila "A red pública (cloaca)" + Total dentro de cada hoja
  const gbaCloaca = (function() {
    const idx = buildPartidoSheetIndex(wb3wb, 'Cuadro3.2');
    return GBA24.map(p => {
      const sheetName = idx[normalize(p.nombre)];
      if (!sheetName) return { codigo: p.codigo, nombre: p.nombre, value: null };
      const rows = XLSX.utils.sheet_to_json(wb3wb.Sheets[sheetName], { header: 1, defval: null, blankrows: false });
      const tRow = findTotalRow(rows);
      const tot = tRow ? toNumber(tRow[2]) : null;
      let cloacaPob = null;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r) continue;
        if (/cloaca/i.test(String(r[0] || ''))) {
          for (let j = i; j < Math.min(i + 4, rows.length); j++) {
            const rr = rows[j];
            if (rr && String(rr[1] || '').trim().toLowerCase() === 'total') {
              cloacaPob = toNumber(rr[2]); break;
            }
          }
          if (cloacaPob != null) break;
        }
      }
      return { codigo: p.codigo, nombre: p.nombre, value: tot && cloacaPob != null ? (cloacaPob / tot) * 100 : null };
    });
  })();

  const wb7 = XLSX.readFile(path.join(CENSO_DIR, 'c2022_bsas_pob_c7_2.xlsx'));
  const gbaInternet = pctByPartidoFromSheet(wb7, 'Cuadro 7.2', 1, 2);

  const gbaGasRed = GBA24.map(p => {
    const r = findPartidoRow(c4, p.codigo, p.nombre);
    if (!r) return { codigo: p.codigo, nombre: p.nombre, value: null };
    const pob = toNumber(r[2]); const gr = toNumber(r[4]);
    return { codigo: p.codigo, nombre: p.nombre, value: pob ? (gr / pob) * 100 : null };
  });

  // Posición de Quilmes en cada ranking (orden desc: mayor cobertura = mejor = posición 1)
  function quilmesRank(gbaList) {
    const rk = rankGBA(gbaList);
    return rk.findIndex(r => r.municipioId === QUILMES.codigo) + 1;
  }
  const posGasRed = quilmesRank(gbaGasRed);
  const posAgua = quilmesRank(gbaAguaDentro);
  const posCloaca = quilmesRank(gbaCloaca);
  const posInternet = quilmesRank(gbaInternet);

  // Promedio ponderado GBA (por población) para servicios clave
  function promPondGBAFromSheet(workbook, prefix, totalCellTot, totalCellNum) {
    const sheetIndex = buildPartidoSheetIndex(workbook, prefix);
    let totPob = 0, totNum = 0;
    for (const p of GBA24) {
      const sheetName = sheetIndex[normalize(p.nombre)];
      if (!sheetName) continue;
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, blankrows: false });
      const tRow = findTotalRow(rows);
      if (!tRow) continue;
      totPob += toNumber(tRow[totalCellTot]) || 0;
      totNum += toNumber(tRow[totalCellNum]) || 0;
    }
    return totPob ? (totNum / totPob) * 100 : null;
  }
  const promPondAguaGBA = promPondGBAFromSheet(wb2, 'Cuadro2.2', 1, 2);
  const promPondInternetGBA = promPondGBAFromSheet(wb7, 'Cuadro 7.2', 1, 2);
  // Promedio ponderado gas red + cloaca (calculados directamente)
  let totPob_GR = 0, totGR = 0;
  for (const p of GBA24) {
    const r = findPartidoRow(c4, p.codigo, p.nombre);
    if (r) { totPob_GR += toNumber(r[2]) || 0; totGR += toNumber(r[4]) || 0; }
  }
  const promPondGasRedGBA = totPob_GR ? (totGR / totPob_GR) * 100 : null;

  const data = {
    meta: {
      id: 'poblacion-habitacional-personas',
      title: 'Condiciones Habitacionales de la Población — Quilmes',
      category: 'Población',
      subcategory: 'Habitacional Personas',
      source: SOURCE,
      date: DATE,
    },
    kpis: [
      { id: 'pob-viv', label: 'Población en viv. particulares', value: pobViv, formatted: fmtInt(pobViv), unit: 'hab' },
      { id: 'agua-dentro', label: 'Agua por cañería dentro de la vivienda', value: pctAguaDentro, formatted: fmtPct(pctAguaDentro), status: 'good', comparison: `Brecha vs prom. GBA: ${(pctAguaDentro - promPondAguaGBA) >= 0 ? '+' : ''}${fmtDec(pctAguaDentro - promPondAguaGBA)} pp` },
      { id: 'cloaca', label: 'Conectado a red cloacal', value: pctCloaca, formatted: fmtPct(pctCloaca), status: pctCloaca > 70 ? 'good' : 'warning', comparison: `${fmtInt(cloaca)} personas` },
      { id: 'gas-red', label: 'Cocina con gas de red', value: pctGasRed, formatted: fmtPct(pctGasRed), status: 'good', comparison: `Brecha vs prom. GBA: ${(pctGasRed - promPondGasRedGBA) >= 0 ? '+' : ''}${fmtDec(pctGasRed - promPondGasRedGBA)} pp` },
      { id: 'internet-viv', label: 'Internet en la vivienda', value: pctInternetViv, formatted: fmtPct(pctInternetViv), status: 'good', comparison: `${fmtInt(internetVivTotal)} personas` },
      { id: 'sin-pc', label: 'Sin computadora ni tablet', value: pctSinPC, formatted: fmtPct(pctSinPC), status: 'warning', comparison: `${fmtInt(internetVivSinPC + sinInternetVivSinPC)} personas` },
      { id: 'piso-precario', label: 'Piso de tierra u otro material', value: pctPisoTierraOtro, formatted: fmtPct(pctPisoTierraOtro, 2), comparison: `${fmtInt(pisoTierra + pisoOtro)} personas` },
      { id: 'sin-baño', label: 'Sin baño', value: pctSinBaño, formatted: fmtPct(pctSinBaño, 2), comparison: `${fmtInt(sinBaño)} personas` },
    ],
    charts: [
      {
        id: 'agua-prov',
        type: 'pie',
        title: 'Provisión del agua a la vivienda — Quilmes',
        sectionId: 'agua',
        data: [
          { id: 'Cañería dentro de la vivienda', label: 'Cañería dentro de la vivienda', value: aguaCañeriaDentro },
          { id: 'Fuera de la vivienda, dentro del terreno', label: 'Fuera de la vivienda, dentro del terreno', value: aguaFueraVivienda },
          { id: 'Fuera del terreno', label: 'Fuera del terreno', value: aguaFueraTerreno },
        ].filter(d => d.value > 0),
      },
      {
        id: 'sanit',
        type: 'pie',
        title: 'Población según tipo de desagüe del inodoro — Quilmes',
        sectionId: 'cloaca',
        data: [
          { id: 'A red pública (cloaca)', label: 'A red pública (cloaca)', value: cloaca || 0 },
          { id: 'A cámara séptica / pozo / otro', label: 'A cámara séptica / pozo / otro', value: (sanitTot - (cloaca || 0) - (toNumber(c3tot[5]) || 0)) },
          { id: 'No tiene baño', label: 'No tiene baño', value: toNumber(c3tot[5]) || 0 },
        ].filter(d => d.value > 0),
      },
      {
        id: 'combustible-personas',
        type: 'pie',
        title: 'Combustible para cocinar — Población Quilmes',
        sectionId: 'energia',
        data: [
          { id: 'Gas de red', label: 'Gas de red', value: gasRed },
          { id: 'Gas en garrafa', label: 'Gas en garrafa', value: garrafa },
          { id: 'Gas a granel', label: 'Gas a granel', value: granel },
          { id: 'Electricidad', label: 'Electricidad', value: elec },
          { id: 'Leña/carbón', label: 'Leña/carbón', value: lena },
        ].filter(d => d.value != null && d.value > 0),
      },
      {
        id: 'digital',
        type: 'pie',
        title: 'Acceso digital en la vivienda — Población Quilmes',
        sectionId: 'digital',
        data: [
          { id: 'Internet en vivienda + computadora', label: 'Internet en vivienda + computadora', value: internetVivConPC },
          { id: 'Internet en vivienda sin computadora', label: 'Internet en vivienda sin computadora', value: internetVivSinPC },
          { id: 'Sin internet en vivienda', label: 'Sin internet en vivienda', value: sinInternetVivTotal },
        ].filter(d => d.value > 0),
      },
      {
        id: 'gba-cloaca',
        type: 'bar',
        title: '% Conectada a red cloacal — 24 partidos del GBA',
        sectionId: 'comparacion',
        data: rankGBA(gbaCloaca).map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
      {
        id: 'gba-gasred',
        type: 'bar',
        title: '% Cocina con gas de red — 24 partidos del GBA',
        sectionId: 'comparacion',
        data: rankGBA(gbaGasRed).map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
      {
        id: 'gba-internet',
        type: 'bar',
        title: '% con internet en la vivienda — 24 partidos del GBA',
        sectionId: 'comparacion',
        data: rankGBA(gbaInternet).map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
    ],
    rankings: [
      { id: 'rk-cloaca', title: '% con cloaca — 24 GBA', sectionId: 'comparacion', items: rankGBA(gbaCloaca), order: 'desc' },
      { id: 'rk-gasred', title: '% con gas de red — 24 GBA', sectionId: 'comparacion', items: rankGBA(gbaGasRed), order: 'desc' },
      { id: 'rk-internet', title: '% con internet vivienda — 24 GBA', sectionId: 'comparacion', items: rankGBA(gbaInternet), order: 'desc' },
      { id: 'rk-agua', title: '% con agua por cañería dentro de la vivienda — 24 GBA', sectionId: 'comparacion', items: rankGBA(gbaAguaDentro), order: 'desc' },
    ],
    mapData: buildFeatured(pctCloaca, fmtPct(pctCloaca), 'De la población de Quilmes vive en viviendas conectadas a red cloacal'),
    extras: {
      habitacional: {
        partido: {
          pob: pobViv,
          agua: { cañeriaDentro: aguaCañeriaDentro, fueraVivienda: aguaFueraVivienda, fueraTerreno: aguaFueraTerreno, redPub: aguaRedPub, pctDentro: pctAguaDentro, pctRedPub: pctAguaRedPub },
          cloaca: { cloacaPersonas: cloaca, pctCloaca },
          combustible: { gasRed, garrafa, granel, elec, lena, pctGasRed, pctGarrafa, pctElec },
          piso: { ceramica: pisoCeramica, carpeta: pisoCarpeta, tierra: pisoTierra, otro: pisoOtro, pctCeramica: pctPisoCeramica, pctTierraOtro: pctPisoTierraOtro },
          baños: { baño1, baño2, baño3plus, sinBaño, pctSinBaño, pctMultiBaño: ((baño2 + baño3plus) / habitTotal) * 100 },
          habitaciones: { hab1, hab2, pctHab1, pctHab1o2 },
          digital: { internetVivTotal, internetVivConPC, internetVivSinPC, sinInternetVivTotal, sinInternetVivConPC, sinInternetVivSinPC, conCelInternet, pctInternetViv, pctConPC, pctSinPC, pctSinInternetVivienda, pctConCelInternet },
        },
        gba: {
          posiciones: { gasRed: posGasRed, agua: posAgua, cloaca: posCloaca, internet: posInternet },
          promPond: { gasRed: promPondGasRedGBA, agua: promPondAguaGBA, internet: promPondInternetGBA },
        },
      },
    },
  };

  writeJson(path.join(OUT_DIR, 'habitacional-personas.json'), data);
  return { pctCloaca, pctGasRed, pctInternetViv };
}

// ════════════════════════════════════════════════════════════════════
// 5. SALUD
// Cuadros usados:
//   c1_2 — Cobertura de salud por partido (3 categorías)
//   c2_2 — Cobertura por sexo y grupo etario, nivel provincial BSAS
//          (no hay desagregación por partido en este cuadro: sirve como
//          contexto provincial sobre cómo varía la cobertura por edad)
// ════════════════════════════════════════════════════════════════════
function processSalud() {
  console.log('\n─── Salud ───');

  // ── c1_2: Cobertura partido ──
  // cols: 0 cod, 1 depto, 2 pob total, 3 OS/prepaga, 4 plan estatal, 5 No tiene
  const c1 = loadCuadro('c2022_bsas_salud_c1_2.xlsx', 'Cobertura de Salud N°1.2');
  const quilmesR = findPartidoRow(c1, QUILMES.codigo, QUILMES.nombre);
  const pob = toNumber(quilmesR[2]);
  const obraSocial = toNumber(quilmesR[3]);
  const planEstatal = toNumber(quilmesR[4]);
  const sinCobertura = toNumber(quilmesR[5]);
  const pctOS = (obraSocial / pob) * 100;
  const pctEstatal = (planEstatal / pob) * 100;
  const pctSin = (sinCobertura / pob) * 100;

  // Indicadores derivados a nivel partido
  const sinOSPrepaga = sinCobertura + planEstatal; // depende exclusivamente del público
  const pctSinOSPrepaga = (sinOSPrepaga / pob) * 100;
  const razonOSsin = obraSocial / sinCobertura;

  // ── GBA24 (rankings + promedio ponderado por población) ──
  const gbaSin = GBA24.map(p => {
    const r = findPartidoRow(c1, p.codigo, p.nombre);
    if (!r) return { codigo: p.codigo, nombre: p.nombre, value: null };
    const po = toNumber(r[2]); const sin_ = toNumber(r[5]);
    return { codigo: p.codigo, nombre: p.nombre, value: po ? (sin_ / po) * 100 : null };
  });
  const gbaOS = GBA24.map(p => {
    const r = findPartidoRow(c1, p.codigo, p.nombre);
    if (!r) return { codigo: p.codigo, nombre: p.nombre, value: null };
    const po = toNumber(r[2]); const o = toNumber(r[3]);
    return { codigo: p.codigo, nombre: p.nombre, value: po ? (o / po) * 100 : null };
  });

  let totPobGBA = 0, totSinGBA = 0, totOSGBA = 0;
  for (const p of GBA24) {
    const r = findPartidoRow(c1, p.codigo, p.nombre);
    if (!r) continue;
    const po = toNumber(r[2]) || 0;
    const sn = toNumber(r[5]) || 0;
    const os = toNumber(r[3]) || 0;
    totPobGBA += po;
    totSinGBA += sn;
    totOSGBA += os;
  }
  const promPondSinGBA = totPobGBA ? (totSinGBA / totPobGBA) * 100 : null;
  const promPondOSGBA = totPobGBA ? (totOSGBA / totPobGBA) * 100 : null;
  const deltaSin = pctSin - promPondSinGBA;

  const rkSin = rankGBA(gbaSin); // mayor sin cobertura = peor → orden desc para que el más alto quede 1°
  const posSin = rkSin.findIndex(r => r.municipioId === QUILMES.codigo) + 1; // posición desde el peor
  const posSinDesdeMejor = (rkSin.length + 1) - posSin; // posición desde el de menor sin cobertura

  // ── c2_2: Cobertura provincial por sexo + edad (contexto, no Quilmes) ──
  // Estructura del archivo:
  //   filas con label = "Total" / "0-4" / ... / "Mujeres / femenino" / "Varones / masculino"
  //   cols: 0 edad, 1 pob, 2 OS/prepaga, 3 plan estatal, 4 sin cobertura
  const c2raw = loadCuadro('c2022_bsas_salud_c2_2.xlsx', 'Cuadro 2.2');
  const ageRowsTotal = [];
  const ageRowsMuj = [];
  const ageRowsVar = [];
  let mode = 'total';
  for (const r of c2raw) {
    if (!r) continue;
    const lbl = String(r[0] || '').trim();
    if (/^Mujeres/i.test(lbl)) { mode = 'muj'; continue; }
    if (/^Varones/i.test(lbl)) { mode = 'var'; continue; }
    const isQuinq = /^\d+\s*[-\u2013]\s*\d+$/.test(lbl);
    const is100 = /^100\s*y\s*m[aá]s/i.test(lbl);
    if (!isQuinq && !is100) continue;
    const grupo = lbl.replace(/\s+/g, '');
    const po = toNumber(r[1]);
    const os_ = toNumber(r[2]);
    const pe = toNumber(r[3]);
    const sn = toNumber(r[4]);
    if (po == null) continue;
    const obj = {
      grupo,
      pob: po,
      os: os_,
      planEstatal: pe,
      sin: sn,
      pctOS: po ? (os_ / po) * 100 : null,
      pctEstatal: po ? (pe / po) * 100 : null,
      pctSin: po ? (sn / po) * 100 : null,
    };
    if (mode === 'total') ageRowsTotal.push(obj);
    else if (mode === 'muj') ageRowsMuj.push(obj);
    else ageRowsVar.push(obj);
  }

  // Tasas provinciales por agrupamiento (contexto interpretativo)
  function aggPctOS(rows, ageList) {
    const sel = rows.filter(r => ageList.includes(r.grupo));
    const tp = sel.reduce((a, b) => a + (b.pob || 0), 0);
    const to = sel.reduce((a, b) => a + (b.os || 0), 0);
    return tp ? (to / tp) * 100 : null;
  }
  function aggPctSin(rows, ageList) {
    const sel = rows.filter(r => ageList.includes(r.grupo));
    const tp = sel.reduce((a, b) => a + (b.pob || 0), 0);
    const ts = sel.reduce((a, b) => a + (b.sin || 0), 0);
    return tp ? (ts / tp) * 100 : null;
  }

  const ages0a14 = ['0-4', '5-9', '10-14'];
  const ages15a29 = ['15-19', '20-24', '25-29'];
  const ages30a64 = ['30-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60-64'];
  const ages65plus = ['65-69', '70-74', '75-79', '80-84', '85-89', '90-94', '95-99', '100ymás'];

  const provPctOS_0a14 = aggPctOS(ageRowsTotal, ages0a14);
  const provPctOS_15a29 = aggPctOS(ageRowsTotal, ages15a29);
  const provPctOS_30a64 = aggPctOS(ageRowsTotal, ages30a64);
  const provPctOS_65plus = aggPctOS(ageRowsTotal, ages65plus);

  const provPctSin_0a14 = aggPctSin(ageRowsTotal, ages0a14);
  const provPctSin_15a29 = aggPctSin(ageRowsTotal, ages15a29);
  const provPctSin_30a64 = aggPctSin(ageRowsTotal, ages30a64);
  const provPctSin_65plus = aggPctSin(ageRowsTotal, ages65plus);

  // Brecha de género provincial (cobertura formal)
  const totMuj = ageRowsMuj.reduce((a, b) => a + (b.pob || 0), 0);
  const totVar = ageRowsVar.reduce((a, b) => a + (b.pob || 0), 0);
  const osMuj = ageRowsMuj.reduce((a, b) => a + (b.os || 0), 0);
  const osVar = ageRowsVar.reduce((a, b) => a + (b.os || 0), 0);
  const sinMuj = ageRowsMuj.reduce((a, b) => a + (b.sin || 0), 0);
  const sinVar = ageRowsVar.reduce((a, b) => a + (b.sin || 0), 0);
  const provPctOSMuj = totMuj ? (osMuj / totMuj) * 100 : null;
  const provPctOSVar = totVar ? (osVar / totVar) * 100 : null;
  const provPctSinMuj = totMuj ? (sinMuj / totMuj) * 100 : null;
  const provPctSinVar = totVar ? (sinVar / totVar) * 100 : null;

  // ── Estimación de cohortes en Quilmes aplicando tasas provinciales ──
  // (estimación, no observación: el cuadro c2_2 no se desagrega por partido)
  // Se usa la estructura demográfica de Quilmes (Censo 2022, Estructura)
  let quilmesPobByAge = []; // [{grupo, total}]
  try {
    const c5 = loadCuadro('c2022_bsas_est_c5_2.xlsx', 'Cuadro5.2.102');
    for (const r of c5) {
      if (!r || !r[0]) continue;
      const label = String(r[0]).trim();
      if (/^\d+\s*[-\u2013]\s*\d+$/.test(label) || /100\s*y\s*m[aá]s/i.test(label)) {
        const grupo = label.replace(/\s+/g, '');
        const tot = toNumber(r[1]);
        if (tot != null) quilmesPobByAge.push({ grupo, total: tot });
      }
    }
  } catch (e) {
    console.warn('  ⚠ No se pudo leer Estructura para estimación etaria:', e.message);
  }

  function quilmesEstSin(ageList) {
    let pop = 0, est = 0;
    for (const ag of ageList) {
      const m = quilmesPobByAge.find(a => a.grupo === ag);
      const pr = ageRowsTotal.find(r => r.grupo === ag);
      if (!m || !pr || pr.pctSin == null) continue;
      pop += m.total;
      est += m.total * (pr.pctSin / 100);
    }
    return { pop, est };
  }

  const quilmesEst65 = quilmesEstSin(ages65plus);
  const quilmesEst15a29 = quilmesEstSin(ages15a29);
  const quilmesEst30a64 = quilmesEstSin(ages30a64);
  const quilmesEst0a14 = quilmesEstSin(ages0a14);

  // Suma total de población 65+ en Quilmes (para reportar la cohorte)
  const quilmesPob65plus = ages65plus.reduce((a, ag) => {
    const m = quilmesPobByAge.find(p => p.grupo === ag);
    return a + (m ? m.total : 0);
  }, 0);

  const data = {
    meta: {
      id: 'poblacion-salud',
      title: 'Cobertura de Salud — Quilmes',
      category: 'Población',
      subcategory: 'Salud',
      source: SOURCE,
      date: DATE,
    },
    kpis: [
      { id: 'obra-social', label: 'Con obra social, prepaga o PAMI', value: pctOS, formatted: fmtPct(pctOS), status: 'good', comparison: `${fmtInt(obraSocial)} personas` },
      { id: 'sin-cobertura', label: 'Sin cobertura', value: pctSin, formatted: fmtPct(pctSin), status: pctSin > 25 ? 'critical' : 'warning', comparison: `${fmtInt(sinCobertura)} personas` },
      { id: 'plan-estatal', label: 'Plan estatal de salud', value: pctEstatal, formatted: fmtPct(pctEstatal), comparison: `${fmtInt(planEstatal)} personas` },
      { id: 'dependencia-publica', label: 'Sin OS ni prepaga', value: pctSinOSPrepaga, formatted: fmtPct(pctSinOSPrepaga), status: 'warning', comparison: `${fmtInt(sinOSPrepaga)} personas dependen del sector público` },
      { id: 'razon-os-sin', label: 'Razón cobertura/sin cobertura', value: razonOSsin, formatted: fmtDec(razonOSsin), comparison: `${fmtDec(razonOSsin)} cubiertos por cada uno sin cobertura` },
      { id: 'delta-gba', label: 'Brecha vs promedio GBA (sin cobertura)', value: deltaSin, formatted: `${deltaSin >= 0 ? '+' : ''}${fmtDec(deltaSin)} pp`, status: deltaSin <= 0 ? 'good' : 'warning', comparison: `Prom. GBA24: ${fmtPct(promPondSinGBA)}` },
      { id: 'pos-gba', label: 'Posición en el GBA (sin cobertura)', value: posSinDesdeMejor, formatted: `${posSinDesdeMejor}° de 24`, comparison: 'Ranking ascendente: 1° = menor % sin cobertura' },
      { id: 'pob-total', label: 'Población censada (viv. particulares)', value: pob, formatted: fmtInt(pob), unit: 'hab' },
    ],
    charts: [
      {
        id: 'cobertura',
        type: 'pie',
        title: 'Tipo de cobertura de salud — Quilmes',
        sectionId: 'foto',
        data: [
          { id: 'Obra social, prepaga o PAMI', label: 'Obra social, prepaga o PAMI', value: obraSocial },
          { id: 'Plan estatal de salud', label: 'Plan estatal de salud', value: planEstatal },
          { id: 'Sin cobertura', label: 'Sin cobertura', value: sinCobertura },
        ],
      },
      {
        id: 'cob-edad-bsas',
        type: 'line',
        title: '% con obra social, prepaga o PAMI por edad — Provincia de Buenos Aires',
        sectionId: 'edad',
        data: [{
          id: 'Cobertura formal',
          data: ageRowsTotal.map(r => ({ x: r.grupo, y: Number((r.pctOS).toFixed(1)) })),
        }],
      },
      {
        id: 'sin-edad-bsas',
        type: 'line',
        title: '% sin cobertura por edad — Provincia de Buenos Aires',
        sectionId: 'edad',
        data: [{
          id: 'Sin cobertura',
          data: ageRowsTotal.map(r => ({ x: r.grupo, y: Number((r.pctSin).toFixed(1)) })),
        }],
      },
      {
        id: 'genero-bsas',
        type: 'bar',
        title: 'Cobertura formal por sexo registrado al nacer — Provincia BSAS',
        sectionId: 'brecha',
        data: [
          { categoria: 'Mujeres', value: Number(provPctOSMuj.toFixed(1)) },
          { categoria: 'Varones', value: Number(provPctOSVar.toFixed(1)) },
        ],
        config: { xAxis: 'categoria' },
      },
      {
        id: 'sin-genero-bsas',
        type: 'bar',
        title: '% sin cobertura por sexo registrado al nacer — Provincia BSAS',
        sectionId: 'brecha',
        data: [
          { categoria: 'Mujeres', value: Number(provPctSinMuj.toFixed(1)) },
          { categoria: 'Varones', value: Number(provPctSinVar.toFixed(1)) },
        ],
        config: { xAxis: 'categoria' },
      },
      {
        id: 'gba-sin',
        type: 'bar',
        title: '% sin cobertura — 24 partidos del GBA',
        sectionId: 'comparacion',
        data: rankGBA(gbaSin).map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
      {
        id: 'gba-os',
        type: 'bar',
        title: '% con obra social, prepaga o PAMI — 24 partidos del GBA',
        sectionId: 'comparacion',
        data: rankGBA(gbaOS).map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
    ],
    rankings: [
      { id: 'rk-os', title: '% con obra social, prepaga o PAMI — 24 GBA', sectionId: 'comparacion', items: rankGBA(gbaOS), order: 'desc' },
      { id: 'rk-sin', title: '% sin cobertura — 24 GBA', sectionId: 'comparacion', items: rankGBA(gbaSin), order: 'desc' },
    ],
    mapData: buildFeatured(pctSin, fmtPct(pctSin), 'De la población de Quilmes no tiene obra social, prepaga ni plan estatal'),
    extras: {
      cobertura: {
        partido: { pctOS, pctEstatal, pctSin, pctSinOSPrepaga, razonOSsin, sinOSPrepaga, obraSocial, planEstatal, sinCobertura, pob },
        gba: { promPondSinGBA, promPondOSGBA, deltaSin, posSinDesdeMejor, posSin },
        provBSASporEdad: ageRowsTotal,
        provBSASporGenero: { mujeres: { pctOS: provPctOSMuj, pctSin: provPctSinMuj }, varones: { pctOS: provPctOSVar, pctSin: provPctSinVar } },
        provBSASporCohorte: {
          ninez_0a14: { pctOS: provPctOS_0a14, pctSin: provPctSin_0a14 },
          jovenes_15a29: { pctOS: provPctOS_15a29, pctSin: provPctSin_15a29 },
          activos_30a64: { pctOS: provPctOS_30a64, pctSin: provPctSin_30a64 },
          mayores_65plus: { pctOS: provPctOS_65plus, pctSin: provPctSin_65plus },
        },
        quilmesEstimaciones: {
          pob65plus: quilmesPob65plus,
          estSinCobertura_0a14: { pop: quilmesEst0a14.pop, estimadas: Math.round(quilmesEst0a14.est) },
          estSinCobertura_15a29: { pop: quilmesEst15a29.pop, estimadas: Math.round(quilmesEst15a29.est) },
          estSinCobertura_30a64: { pop: quilmesEst30a64.pop, estimadas: Math.round(quilmesEst30a64.est) },
          estSinCobertura_65plus: { pop: quilmesEst65.pop, estimadas: Math.round(quilmesEst65.est) },
        },
      },
    },
  };

  writeJson(path.join(OUT_DIR, 'salud.json'), data);
  return { pctOS, pctSin, pctSinOSPrepaga, deltaSin, promPondSinGBA, posSinDesdeMejor };
}

// ════════════════════════════════════════════════════════════════════
// 6. PREVISIÓN SOCIAL
// Cuadros usados:
//   c3_2 — % percibe jubilación/pensión por partido (con descomposición)
//   c4_2 — Cobertura previsional por sexo + grupo etario (nivel provincial)
// ════════════════════════════════════════════════════════════════════
function processPrevision() {
  console.log('\n─── Previsión social ───');

  // c3_2: cobertura previsional por partido
  // cols: 0 cod, 1 depto, 2 pob, 3 percibe total, 4 solo jub, 5 solo pensión, 6 jub+pensión, 7 otra pensión, 8 No percibe
  const c3 = loadCuadro('c2022_bsas_prevision_c3_2.xlsx', 'Previsión social N°3.2');
  const quilmesR = findPartidoRow(c3, QUILMES.codigo, QUILMES.nombre);
  const pob = toNumber(quilmesR[2]);
  const percibe = toNumber(quilmesR[3]);
  const soloJub = toNumber(quilmesR[4]);
  const soloPension = toNumber(quilmesR[5]);
  const jubYpension = toNumber(quilmesR[6]) || 0;
  const otraPension = toNumber(quilmesR[7]) || 0;
  const noPercibe = toNumber(quilmesR[8]) != null ? toNumber(quilmesR[8]) : (pob - percibe);

  const pctPercibe = (percibe / pob) * 100;
  const pctJub = (soloJub / pob) * 100;
  const pctSoloPension = (soloPension / pob) * 100;
  const pctJubYpension = (jubYpension / pob) * 100;
  const pctOtraPension = (otraPension / pob) * 100;
  const pctNoPercibe = (noPercibe / pob) * 100;

  // Razón cobertura/no cobertura
  const razonCob = noPercibe ? percibe / noPercibe : null;

  // GBA24: rankings + promedio ponderado
  const gbaRows = GBA24.map(p => {
    const r = findPartidoRow(c3, p.codigo, p.nombre);
    if (!r) return { codigo: p.codigo, nombre: p.nombre, value: null, pob: null, percibe: null };
    const po = toNumber(r[2]); const pe = toNumber(r[3]);
    return { codigo: p.codigo, nombre: p.nombre, value: po ? (pe / po) * 100 : null, pob: po, percibe: pe };
  });
  const totPobGBA = gbaRows.reduce((a, b) => a + (b.pob || 0), 0);
  const totPercibeGBA = gbaRows.reduce((a, b) => a + (b.percibe || 0), 0);
  const promPondPercibeGBA = totPobGBA ? (totPercibeGBA / totPobGBA) * 100 : null;
  const deltaPercibe = pctPercibe - promPondPercibeGBA;
  const rkPercibe = rankGBA(gbaRows.map(r => ({ codigo: r.codigo, nombre: r.nombre, value: r.value })));
  const posPercibe = rkPercibe.findIndex(r => r.municipioId === QUILMES.codigo) + 1;

  // c4_2: cobertura previsional provincial por sexo+edad
  const c4 = loadCuadro('c2022_bsas_prevision_c4_2.xlsx', 'Cuadro 4.2');
  const ageRowsTotal = []; const ageRowsMuj = []; const ageRowsVar = [];
  let mode = 'total';
  for (const r of c4) {
    if (!r) continue;
    const c0 = String(r[0] || '').trim();
    if (/^Mujer\b|^Mujeres\b|Femenino/i.test(c0)) { mode = 'muj'; continue; }
    if (/^Var[oó]n\b|^Varones\b|Masculino/i.test(c0)) { mode = 'var'; continue; }
    const isQ = /^\d+\s*[-\u2013]\s*\d+$/.test(c0);
    const is100 = /^100\s*y\s*m[aá]s/i.test(c0);
    if (!isQ && !is100) continue;
    const grupo = c0.replace(/\s+/g, '');
    const po = toNumber(r[1]);
    const pe = toNumber(r[2]);
    if (po == null || pe == null) continue;
    const obj = { grupo, pob: po, percibe: pe, pctPercibe: po ? (pe / po) * 100 : null };
    if (mode === 'total') ageRowsTotal.push(obj);
    else if (mode === 'muj') ageRowsMuj.push(obj);
    else ageRowsVar.push(obj);
  }

  function aggPctPer(rows, ageList) {
    const sel = rows.filter(r => ageList.includes(r.grupo));
    const tp = sel.reduce((a, b) => a + (b.pob || 0), 0);
    const tpe = sel.reduce((a, b) => a + (b.percibe || 0), 0);
    return tp ? (tpe / tp) * 100 : null;
  }

  const ages60a64 = ['60-64'];
  const ages65a69 = ['65-69'];
  const ages70a74 = ['70-74'];
  const ages65plus = ['65-69', '70-74', '75-79', '80-84', '85-89', '90-94', '95-99', '100ymás'];

  const provPct60a64 = aggPctPer(ageRowsTotal, ages60a64);
  const provPct65a69 = aggPctPer(ageRowsTotal, ages65a69);
  const provPct70a74 = aggPctPer(ageRowsTotal, ages70a74);
  const provPct65plus = aggPctPer(ageRowsTotal, ages65plus);

  // Brecha por sexo (provincial 65+)
  const provPct65plusMuj = aggPctPer(ageRowsMuj, ages65plus);
  const provPct65plusVar = aggPctPer(ageRowsVar, ages65plus);

  // Estimación Quilmes: vejez sin previsión, aplicando tasas provinciales 65+ a Quilmes
  // Lectura: Quilmes tiene ~56.886 personas 65+. Si ~95% percibe (provincial), ~5% no percibe.
  // Esto es estimación de la "vejez sin previsión" en Quilmes.
  let quilmesPob65plus = 0;
  try {
    const c5 = loadCuadro('c2022_bsas_est_c5_2.xlsx', 'Cuadro5.2.102');
    for (const r of c5) {
      if (!r || !r[0]) continue;
      const label = String(r[0]).trim();
      if (/^\d+\s*[-\u2013]\s*\d+$/.test(label) || /100\s*y\s*m[aá]s/i.test(label)) {
        const grupo = label.replace(/\s+/g, '');
        if (ages65plus.includes(grupo)) {
          quilmesPob65plus += toNumber(r[1]) || 0;
        }
      }
    }
  } catch (e) { console.warn('  ⚠ No se pudo leer Estructura para 65+:', e.message); }

  const quilmesEst65PlusSinPrev = quilmesPob65plus * (1 - (provPct65plus || 0) / 100);

  const data = {
    meta: {
      id: 'poblacion-prevision',
      title: 'Previsión Social — Quilmes',
      category: 'Población',
      subcategory: 'Previsión',
      source: SOURCE,
      date: DATE,
    },
    kpis: [
      { id: 'pct-percibe', label: 'Percibe jubilación o pensión', value: pctPercibe, formatted: fmtPct(pctPercibe), comparison: `${fmtInt(percibe)} personas` },
      { id: 'jub', label: 'Solo jubilación', value: pctJub, formatted: fmtPct(pctJub), comparison: `${fmtInt(soloJub)} personas` },
      { id: 'jub-pension', label: 'Jubilación + pensión', value: pctJubYpension, formatted: fmtPct(pctJubYpension), comparison: `${fmtInt(jubYpension)} personas` },
      { id: 'pension', label: 'Solo pensión por fallecimiento', value: pctSoloPension, formatted: fmtPct(pctSoloPension), comparison: `${fmtInt(soloPension)} personas` },
      { id: 'no-percibe', label: 'No percibe', value: pctNoPercibe, formatted: fmtPct(pctNoPercibe), comparison: `${fmtInt(noPercibe)} personas` },
      { id: 'cob-65plus', label: 'Cobertura 65+ (estimación)', value: provPct65plus, formatted: fmtPct(provPct65plus), status: 'good', comparison: `Aplica tasa provincial 65+ a Quilmes · ~${fmtInt(Math.round(quilmesEst65PlusSinPrev))} mayores sin previsión` },
      { id: 'delta-gba', label: 'Brecha vs promedio GBA (percibe)', value: deltaPercibe, formatted: `${deltaPercibe >= 0 ? '+' : ''}${fmtDec(deltaPercibe)} pp`, status: deltaPercibe >= 0 ? 'good' : 'warning', comparison: `Prom. GBA24: ${fmtPct(promPondPercibeGBA)}` },
      { id: 'pos-gba', label: 'Posición en el GBA (percibe)', value: posPercibe, formatted: `${posPercibe}° de 24`, comparison: 'Mayor cobertura previsional = posiciones más altas' },
    ],
    charts: [
      {
        id: 'percibe',
        type: 'pie',
        title: 'Composición de la cobertura previsional — Quilmes',
        sectionId: 'composicion',
        data: [
          { id: 'Solo jubilación', label: 'Solo jubilación', value: soloJub },
          { id: 'Solo pensión por fallecimiento', label: 'Solo pensión por fallecimiento', value: soloPension },
          { id: 'Jubilación + pensión', label: 'Jubilación + pensión', value: jubYpension },
          { id: 'Otra pensión', label: 'Otra pensión', value: otraPension },
          { id: 'No percibe', label: 'No percibe', value: noPercibe },
        ].filter(d => d.value > 0),
      },
      {
        id: 'percibe-edad-bsas',
        type: 'line',
        title: '% Percibe jubilación o pensión por edad — Provincia BSAS',
        sectionId: 'edad',
        data: [{
          id: 'Cobertura previsional',
          data: ageRowsTotal.map(r => ({ x: r.grupo, y: Number(r.pctPercibe.toFixed(1)) })),
        }],
      },
      {
        id: 'percibe-sexo-bsas',
        type: 'bar',
        title: '% 65+ que percibe jubilación o pensión, por sexo — Provincia BSAS',
        sectionId: 'brecha',
        data: [
          { categoria: 'Mujeres 65+', value: Number((provPct65plusMuj || 0).toFixed(1)) },
          { categoria: 'Varones 65+', value: Number((provPct65plusVar || 0).toFixed(1)) },
        ],
        config: { xAxis: 'categoria' },
      },
      {
        id: 'gba-percibe',
        type: 'bar',
        title: '% Percibe jubilación o pensión — 24 partidos del GBA',
        sectionId: 'comparacion',
        data: rkPercibe.map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
    ],
    rankings: [
      { id: 'rk-percibe', title: '% Percibe jubilación/pensión — 24 GBA', sectionId: 'comparacion', items: rkPercibe, order: 'desc' },
    ],
    mapData: buildFeatured(pctPercibe, fmtPct(pctPercibe), 'De la población total de Quilmes percibe jubilación o pensión'),
    extras: {
      prevision: {
        partido: { pctPercibe, pctJub, pctSoloPension, pctJubYpension, pctOtraPension, pctNoPercibe, razonCob, percibe, noPercibe, pob },
        gba: { promPondPercibeGBA, deltaPercibe, posPercibe },
        provBSASporCohorte: {
          c60a64: provPct60a64,
          c65a69: provPct65a69,
          c70a74: provPct70a74,
          c65plus: provPct65plus,
          c65plusMuj: provPct65plusMuj,
          c65plusVar: provPct65plusVar,
        },
        quilmesEstimaciones: {
          pob65plus: quilmesPob65plus,
          estSinPrev65plus: Math.round(quilmesEst65PlusSinPrev),
        },
        provBSASporEdad: ageRowsTotal,
      },
    },
  };

  writeJson(path.join(OUT_DIR, 'prevision.json'), data);
  return { pctPercibe, pctNoPercibe, deltaPercibe, posPercibe, provPct65plus };
}

// ════════════════════════════════════════════════════════════════════
// 7. ACTIVIDAD ECONÓMICA
// Cuadros usados:
//   c1_2 — Tasas de actividad/empleo/desempleo por partido
//   c2_2 — Condición de actividad por sexo + edad (provincial)
//   c5_2 — Aporte jubilatorio de empleados/obreros y servicio doméstico
//          (provincial; medida de informalidad laboral)
// ════════════════════════════════════════════════════════════════════
function processActividadEconomica() {
  console.log('\n─── Actividad Económica ───');

  // ── c1_2: tasas por partido ──
  const c1 = loadCuadro('c2022_bsas_actividad_economica_c1_2.xlsx', 'Cuadro 1. 2');
  const quilmesRow = findPartidoRow(c1, QUILMES.codigo, QUILMES.nombre);
  const pob14 = toNumber(quilmesRow[2]);
  const pea = toNumber(quilmesRow[3]);
  const ocupada = toNumber(quilmesRow[4]);
  const desocupada = toNumber(quilmesRow[5]);
  const pnea = toNumber(quilmesRow[6]);

  const tasaActividad = (pea / pob14) * 100;
  const tasaEmpleo = (ocupada / pob14) * 100;
  const tasaDesempleo = (desocupada / pea) * 100;

  // ── c2_2: condición de actividad provincial por sexo + edad ──
  const c2 = loadCuadro('c2022_bsas_actividad_economica_c2_2.xlsx', 'Cuadro 2.2');
  const ageRowsTotal = []; const ageRowsMuj = []; const ageRowsVar = [];
  let mode = 'total';
  for (const r of c2) {
    if (!r) continue;
    const c0 = String(r[0] || '').trim();
    if (/^Mujer\b|^Mujeres\b|Femenino/i.test(c0)) { mode = 'muj'; }
    else if (/^Var[oó]n\b|^Varones\b|Masculino/i.test(c0)) { mode = 'var'; }
    const c1lbl = String(r[1] || '').trim();
    const isQ = /^\d+\s*[-\u2013]\s*\d+$/.test(c1lbl);
    const is14 = c1lbl === '14';
    const is100 = /^100\s*y\s*m[aá]s/i.test(c1lbl);
    if (!isQ && !is14 && !is100) continue;
    const grupo = c1lbl.replace(/\s+/g, '');
    const p14 = toNumber(r[2]);
    const peaP = toNumber(r[3]);
    const ocP = toNumber(r[4]);
    const desP = toNumber(r[5]);
    const inactP = toNumber(r[6]);
    if (p14 == null) continue;
    const obj = {
      grupo, pob14: p14, pea: peaP, ocupada: ocP, desocupada: desP, pnea: inactP,
      tActividad: p14 ? (peaP / p14) * 100 : null,
      tEmpleo: p14 ? (ocP / p14) * 100 : null,
      tDesempleo: peaP ? (desP / peaP) * 100 : null,
    };
    if (mode === 'total') ageRowsTotal.push(obj);
    else if (mode === 'muj') ageRowsMuj.push(obj);
    else ageRowsVar.push(obj);
  }

  // Tasas provinciales globales por sexo (Mujeres / Varones)
  const aggSex = (rows) => {
    const tp = rows.reduce((a, b) => a + (b.pob14 || 0), 0);
    const tpea = rows.reduce((a, b) => a + (b.pea || 0), 0);
    const toc = rows.reduce((a, b) => a + (b.ocupada || 0), 0);
    const tdes = rows.reduce((a, b) => a + (b.desocupada || 0), 0);
    return {
      tActividad: tp ? (tpea / tp) * 100 : null,
      tEmpleo: tp ? (toc / tp) * 100 : null,
      tDesempleo: tpea ? (tdes / tpea) * 100 : null,
    };
  };
  const provMuj = aggSex(ageRowsMuj);
  const provVar = aggSex(ageRowsVar);
  const brechaActividad = provVar.tActividad - provMuj.tActividad;
  const brechaEmpleo = provVar.tEmpleo - provMuj.tEmpleo;

  // ── c5_2: aporte jubilatorio empleados/obreros (informalidad provincial) ──
  // cols: 0/1 sexo+edad, 2 total ocupados (sd+empleados+familiar), 3-7 servicio doméstico, 8-12 empleados/obreros, 13-17 trab. familiar
  // Para informalidad: empleados/obreros con "Ni aporta ni le descuentan" → col 11
  const c5 = loadCuadro('c2022_bsas_actividad_economica_c5_2.xlsx', 'Cuadro 5.2');
  // Tomar solo la fila Total general (primera fila Total)
  let c5tot = null;
  for (const r of c5) {
    if (!r) continue;
    const c0 = String(r[0] || '').trim().toLowerCase();
    if (c0 === 'total') { c5tot = r; break; }
  }
  let pctEmpleadoSinAporte = null;
  let pctSDSinAporte = null;
  if (c5tot) {
    // Empleados/obreros: total col 8, le descuentan col 9, aporta col 10, ni-ni col 11
    const empTot = toNumber(c5tot[8]);
    const empNiNi = toNumber(c5tot[11]);
    pctEmpleadoSinAporte = empTot ? (empNiNi / empTot) * 100 : null;
    // Servicio doméstico: total col 3, le descuentan col 4, aporta col 5, ni-ni col 6
    const sdTot = toNumber(c5tot[3]);
    const sdNiNi = toNumber(c5tot[6]);
    pctSDSinAporte = sdTot ? (sdNiNi / sdTot) * 100 : null;
  }

  // ── GBA24 + posiciones + promedios ponderados ──
  const gbaRows = GBA24.map(p => {
    const r = findPartidoRow(c1, p.codigo, p.nombre);
    if (!r) return { codigo: p.codigo, nombre: p.nombre, actividad: null, empleo: null, desempleo: null };
    const p14 = toNumber(r[2]);
    const peaP = toNumber(r[3]);
    const ocP = toNumber(r[4]);
    const desP = toNumber(r[5]);
    return {
      codigo: p.codigo,
      nombre: p.nombre,
      actividad: p14 ? (peaP / p14) * 100 : null,
      empleo: p14 ? (ocP / p14) * 100 : null,
      desempleo: peaP ? (desP / peaP) * 100 : null,
    };
  });

  let totP14 = 0, totPea = 0, totOc = 0, totDes = 0;
  for (const p of GBA24) {
    const r = findPartidoRow(c1, p.codigo, p.nombre);
    if (!r) continue;
    totP14 += toNumber(r[2]) || 0;
    totPea += toNumber(r[3]) || 0;
    totOc += toNumber(r[4]) || 0;
    totDes += toNumber(r[5]) || 0;
  }
  const promPondActGBA = totP14 ? (totPea / totP14) * 100 : null;
  const promPondEmpGBA = totP14 ? (totOc / totP14) * 100 : null;
  const promPondDesGBA = totPea ? (totDes / totPea) * 100 : null;
  const deltaEmpleo = tasaEmpleo - promPondEmpGBA;
  const deltaDesempleo = tasaDesempleo - promPondDesGBA;

  const rkActividad = rankGBA(gbaRows.map(r => ({ codigo: r.codigo, nombre: r.nombre, value: r.actividad })));
  const rkEmpleo = rankGBA(gbaRows.map(r => ({ codigo: r.codigo, nombre: r.nombre, value: r.empleo })));
  const rkDesempleo = rankGBA(gbaRows.map(r => ({ codigo: r.codigo, nombre: r.nombre, value: r.desempleo })));
  const posActividad = rkActividad.findIndex(r => r.municipioId === QUILMES.codigo) + 1;
  const posEmpleo = rkEmpleo.findIndex(r => r.municipioId === QUILMES.codigo) + 1;
  const posDesempleo = rkDesempleo.findIndex(r => r.municipioId === QUILMES.codigo) + 1;

  const data = {
    meta: {
      id: 'poblacion-actividad-economica',
      title: 'Actividad Económica — Quilmes',
      category: 'Población',
      subcategory: 'Actividad Económica',
      source: SOURCE,
      date: DATE,
    },
    kpis: [
      { id: 'pob14', label: 'Población 14+', value: pob14, formatted: fmtInt(pob14), unit: 'personas' },
      { id: 'tasa-actividad', label: 'Tasa de actividad', value: tasaActividad, formatted: fmtPct(tasaActividad), comparison: `PEA / Pob 14+ · vs prom. GBA: ${(tasaActividad - promPondActGBA) >= 0 ? '+' : ''}${fmtDec(tasaActividad - promPondActGBA)} pp` },
      { id: 'tasa-empleo', label: 'Tasa de empleo', value: tasaEmpleo, formatted: fmtPct(tasaEmpleo), status: 'good', comparison: `Ocupada / Pob 14+ · vs prom. GBA: ${deltaEmpleo >= 0 ? '+' : ''}${fmtDec(deltaEmpleo)} pp` },
      { id: 'tasa-desempleo', label: 'Tasa de desempleo', value: tasaDesempleo, formatted: fmtPct(tasaDesempleo), status: tasaDesempleo > 10 ? 'warning' : 'good', comparison: `Desocupada / PEA · vs prom. GBA: ${deltaDesempleo >= 0 ? '+' : ''}${fmtDec(deltaDesempleo)} pp` },
      { id: 'pea', label: 'Población económicamente activa', value: pea, formatted: fmtInt(pea), unit: 'personas' },
      { id: 'pnea', label: 'No económicamente activa', value: pnea, formatted: fmtInt(pnea), unit: 'personas' },
      { id: 'brecha-empleo', label: 'Brecha de empleo por sexo (BSAS)', value: brechaEmpleo, formatted: `${brechaEmpleo >= 0 ? '+' : ''}${fmtDec(brechaEmpleo)} pp`, status: 'warning', comparison: 'Varones − Mujeres · datos provinciales' },
      { id: 'pos-gba', label: 'Posición empleo en el GBA', value: posEmpleo, formatted: `${posEmpleo}° de 24`, comparison: 'Mayor tasa de empleo = posiciones más altas' },
    ],
    charts: [
      {
        id: 'composicion',
        type: 'pie',
        title: 'Composición de la población de 14 años y más — Quilmes',
        sectionId: 'composicion',
        data: [
          { id: 'Ocupada', label: 'Ocupada', value: ocupada },
          { id: 'Desocupada', label: 'Desocupada', value: desocupada },
          { id: 'No económicamente activa', label: 'No económicamente activa', value: pnea },
        ],
      },
      {
        id: 'tasa-edad',
        type: 'line',
        title: 'Tasa de actividad por grupo etario — Provincia BSAS',
        sectionId: 'edad',
        data: [{
          id: 'Tasa de actividad',
          data: ageRowsTotal
            .filter(r => /^\d+-\d+/.test(r.grupo))
            .map(r => ({ x: r.grupo, y: Number(r.tActividad.toFixed(1)) })),
        }],
      },
      {
        id: 'tasa-empleo-edad',
        type: 'line',
        title: 'Tasa de empleo por grupo etario — Provincia BSAS',
        sectionId: 'edad',
        data: [{
          id: 'Tasa de empleo',
          data: ageRowsTotal
            .filter(r => /^\d+-\d+/.test(r.grupo))
            .map(r => ({ x: r.grupo, y: Number(r.tEmpleo.toFixed(1)) })),
        }],
      },
      {
        id: 'sexo',
        type: 'bar',
        title: 'Tasa de actividad y empleo por sexo — Provincia BSAS',
        sectionId: 'brecha',
        data: [
          { categoria: 'Mujeres act.', value: Number((provMuj.tActividad || 0).toFixed(1)) },
          { categoria: 'Varones act.', value: Number((provVar.tActividad || 0).toFixed(1)) },
          { categoria: 'Mujeres emp.', value: Number((provMuj.tEmpleo || 0).toFixed(1)) },
          { categoria: 'Varones emp.', value: Number((provVar.tEmpleo || 0).toFixed(1)) },
        ],
        config: { xAxis: 'categoria' },
      },
      {
        id: 'gba-empleo',
        type: 'bar',
        title: 'Tasa de empleo — 24 partidos GBA',
        sectionId: 'comparacion',
        data: rkEmpleo.map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
      {
        id: 'gba-desempleo',
        type: 'bar',
        title: 'Tasa de desempleo — 24 partidos GBA',
        sectionId: 'comparacion',
        data: rkDesempleo.map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
    ],
    rankings: [
      { id: 'rk-actividad', title: 'Tasa de actividad — 24 GBA', sectionId: 'comparacion', items: rkActividad, order: 'desc' },
      { id: 'rk-empleo', title: 'Tasa de empleo — 24 GBA', sectionId: 'comparacion', items: rkEmpleo, order: 'desc' },
      { id: 'rk-desempleo', title: 'Tasa de desempleo — 24 GBA', sectionId: 'comparacion', items: rkDesempleo, order: 'desc' },
    ],
    mapData: buildFeatured(tasaEmpleo, fmtPct(tasaEmpleo), 'De la población de 14+ de Quilmes está ocupada'),
    extras: {
      actividad: {
        partido: { pob14, pea, ocupada, desocupada, pnea, tasaActividad, tasaEmpleo, tasaDesempleo },
        gba: { promPondActGBA, promPondEmpGBA, promPondDesGBA, deltaEmpleo, deltaDesempleo, posActividad, posEmpleo, posDesempleo },
        provBSAS: {
          mujeres: provMuj,
          varones: provVar,
          brechaActividad, brechaEmpleo,
          informalidad: { pctEmpleadoSinAporte, pctSDSinAporte },
          porEdad: ageRowsTotal,
        },
      },
    },
  };

  writeJson(path.join(OUT_DIR, 'actividad-economica.json'), data);
  return { tasaEmpleo, tasaDesempleo, brechaEmpleo, posEmpleo };
}

// ════════════════════════════════════════════════════════════════════
// 8. EDUCACIÓN
// Fuentes:
//   c1_2 — Asistencia escolar por edad simple (sub-hoja 102 = Quilmes)
//   c2_2 — Asistencia por sexo + edad quinquennial + nivel asistido (sub-hoja 102)
//   c3_2 — Máximo nivel educativo alcanzado (sub-hoja 102, con sex breakdown)
// ════════════════════════════════════════════════════════════════════
function processEducacion() {
  console.log('\n─── Educación ───');

  // ── c1_2: Asistencia por edad simple (Quilmes, sub-hoja 102) ──
  // cols: 0 sexo, 1 edad, 2 pob, 3 asiste, 4 asistió, 5 nunca asistió
  const c1 = loadCuadro('c2022_bsas_educacion_c1_2.xlsx', 'Cuadro 1.2.102');
  const totalR1 = findTotalRow(c1);
  const popTotal = toNumber(totalR1[2]);
  const asisteAct = toNumber(totalR1[3]);
  const asistio = toNumber(totalR1[4]);
  const nuncaAsis = toNumber(totalR1[5]);

  const pctAsisteAct = (asisteAct / popTotal) * 100;
  const pctAlfabetizado = ((asisteAct + asistio) / popTotal) * 100;
  const pctNuncaAsis = (nuncaAsis / popTotal) * 100;

  // Edades simples (5 a 24): tasa de asistencia escolar año por año
  const tasaPorEdadSimple = []; // [{ edad, pob, asiste, pctAsiste }]
  for (const r of c1) {
    if (!r) continue;
    const edad = String(r[1] || '').trim();
    if (!/^\d{1,2}$/.test(edad)) continue; // solo edades simples
    const e = parseInt(edad, 10);
    if (e < 4 || e > 30) continue;
    const pob = toNumber(r[2]);
    const asi = toNumber(r[3]);
    if (pob == null || asi == null) continue;
    tasaPorEdadSimple.push({ edad: e, pob, asiste: asi, pctAsiste: pob ? (asi / pob) * 100 : null });
  }
  // Solo la primera ocurrencia de cada edad (dentro de Total). Después aparecen otras secciones
  // (Mujeres, Varones, etc.) con la misma edad — descartar duplicados.
  const tasaPorEdadDedup = [];
  const seenEdad = new Set();
  for (const r of tasaPorEdadSimple) {
    if (seenEdad.has(r.edad)) continue;
    seenEdad.add(r.edad);
    tasaPorEdadDedup.push(r);
  }
  tasaPorEdadDedup.sort((a, b) => a.edad - b.edad);

  // Indicadores derivados
  function tasaCohorte(rows, ageList) {
    const sel = rows.filter(r => ageList.includes(r.edad));
    const tp = sel.reduce((a, b) => a + (b.pob || 0), 0);
    const ta = sel.reduce((a, b) => a + (b.asiste || 0), 0);
    return tp ? (ta / tp) * 100 : null;
  }
  const ages5a12 = [5, 6, 7, 8, 9, 10, 11, 12];
  const ages13a17 = [13, 14, 15, 16, 17];
  const ages18a24 = [18, 19, 20, 21, 22, 23, 24];

  const tasaPrimaria = tasaCohorte(tasaPorEdadDedup, ages5a12);
  const tasaSecundaria = tasaCohorte(tasaPorEdadDedup, ages13a17);
  const tasaSuperior = tasaCohorte(tasaPorEdadDedup, ages18a24);

  // No-asistencia en cohortes obligatorias
  const pob13a17 = ages13a17.reduce((a, e) => {
    const r = tasaPorEdadDedup.find(x => x.edad === e); return a + (r ? r.pob : 0);
  }, 0);
  const noAsiste13a17 = pob13a17 * (1 - (tasaSecundaria || 0) / 100);

  // ── c2_2: Asistencia por sexo + edad quinquennial (Quilmes, sub-hoja 102) ──
  // cols: 0 sexo, 1 edad, 2 pob, 3 asiste, 4 jardín, 5 sala, 6 primario, 7 secundario, 8 terciario, 9 univ, 10 posgrado
  const c2 = loadCuadro('c2022_bsas_educacion_c2_2.xlsx', 'Cuadro 2.2.102');

  function parseSexQuinq(rows) {
    const out = { total: [], mujeres: [], varones: [] };
    let mode = null;
    for (const r of rows) {
      if (!r) continue;
      const c0 = String(r[0] || '').trim();
      if (/^Total\b/i.test(c0)) { mode = 'total'; continue; }
      if (/^Mujer/i.test(c0)) { mode = 'mujeres'; continue; }
      if (/^Var[oó]n/i.test(c0)) { mode = 'varones'; continue; }
      if (!mode) continue;
      const edad = String(r[1] || '').trim();
      const isQ = /^\d+\s*[-\u2013]\s*\d+$/.test(edad);
      if (!isQ) continue;
      const pob = toNumber(r[2]);
      const asi = toNumber(r[3]);
      if (pob == null || asi == null) continue;
      out[mode].push({ grupo: edad.replace(/\s+/g, ''), pob, asiste: asi, pctAsiste: pob ? (asi / pob) * 100 : null });
    }
    return out;
  }
  const asistSexEdad = parseSexQuinq(c2);

  // Brecha por sexo en asistencia 18-29 (post-secundario)
  function aggPctAsiste(rows, ageList) {
    const sel = rows.filter(r => ageList.includes(r.grupo));
    const tp = sel.reduce((a, b) => a + (b.pob || 0), 0);
    const ta = sel.reduce((a, b) => a + (b.asiste || 0), 0);
    return tp ? (ta / tp) * 100 : null;
  }
  const ages15a19q = ['15-19'];
  const ages20a24q = ['20-24'];
  const ages25a29q = ['25-29'];

  const tasaMuj_15a19 = aggPctAsiste(asistSexEdad.mujeres, ages15a19q);
  const tasaVar_15a19 = aggPctAsiste(asistSexEdad.varones, ages15a19q);
  const tasaMuj_20a24 = aggPctAsiste(asistSexEdad.mujeres, ages20a24q);
  const tasaVar_20a24 = aggPctAsiste(asistSexEdad.varones, ages20a24q);
  const tasaMuj_25a29 = aggPctAsiste(asistSexEdad.mujeres, ages25a29q);
  const tasaVar_25a29 = aggPctAsiste(asistSexEdad.varones, ages25a29q);

  // ── c3_2: Máximo nivel educativo (Quilmes, sub-hoja 102) — con sex breakdown ──
  const c3 = loadCuadro('c2022_bsas_educacion_c3_2.xlsx', 'Cuadro 3.2.102');
  const totalR3 = findTotalRow(c3);
  const pob5Mas = toNumber(totalR3[2]);
  const sinInst = toNumber(totalR3[4]);
  const primarioCompleto = toNumber(totalR3[7]);
  const secundarioCompleto = toNumber(totalR3[13]);
  const terciarioNoUniv = toNumber(totalR3[17]);
  const universitario = toNumber(totalR3[20]);
  const posgrado = toNumber(totalR3[23]);

  // Buscar filas de Mujer/Varón en c3
  const mujRow3 = c3.find(r => r && /^Mujer/i.test(String(r[0] || '').trim()));
  const varRow3 = c3.find(r => r && /^Var[oó]n/i.test(String(r[0] || '').trim()));
  const mujPob = mujRow3 ? toNumber(mujRow3[2]) : null;
  const mujUniv = mujRow3 ? toNumber(mujRow3[20]) : null;
  const mujPosgrado = mujRow3 ? toNumber(mujRow3[23]) : null;
  const mujSecCompl = mujRow3 ? toNumber(mujRow3[13]) : null;
  const varPob = varRow3 ? toNumber(varRow3[2]) : null;
  const varUniv = varRow3 ? toNumber(varRow3[20]) : null;
  const varPosgrado = varRow3 ? toNumber(varRow3[23]) : null;
  const varSecCompl = varRow3 ? toNumber(varRow3[13]) : null;
  const pctUnivMuj = mujPob ? (mujUniv / mujPob) * 100 : null;
  const pctUnivVar = varPob ? (varUniv / varPob) * 100 : null;
  const pctSecComplMuj = mujPob ? (mujSecCompl / mujPob) * 100 : null;
  const pctSecComplVar = varPob ? (varSecCompl / varPob) * 100 : null;
  const pctPosgradoMuj = mujPob ? (mujPosgrado / mujPob) * 100 : null;
  const pctPosgradoVar = varPob ? (varPosgrado / varPob) * 100 : null;

  const pctSecCompleto = (secundarioCompleto / pob5Mas) * 100;
  const pctUniversitario = (universitario / pob5Mas) * 100;
  const pctSinInst = (sinInst / pob5Mas) * 100;
  const pctTerciario = (terciarioNoUniv / pob5Mas) * 100;
  const pctPosgrado = (posgrado / pob5Mas) * 100;
  const pctSuperior = ((terciarioNoUniv + universitario + posgrado) / pob5Mas) * 100;

  // ── GBA24 ranking ──
  const wb3 = XLSX.readFile(path.join(CENSO_DIR, 'c2022_bsas_educacion_c3_2.xlsx'));
  const sheetIndex = buildPartidoSheetIndex(wb3, 'Cuadro 3.2');

  const gbaRows = GBA24.map(p => {
    const sheetName = sheetIndex[normalize(p.nombre)];
    if (!sheetName) return { codigo: p.codigo, nombre: p.nombre, pctUniv: null, pctSec: null, pctSinInst: null, pctSuperior: null };
    const sheet = wb3.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
    const tRow = findTotalRow(rows);
    if (!tRow) return { codigo: p.codigo, nombre: p.nombre, pctUniv: null, pctSec: null, pctSinInst: null, pctSuperior: null };
    const pob = toNumber(tRow[2]);
    const univ = toNumber(tRow[20]);
    const ter = toNumber(tRow[17]);
    const pos = toNumber(tRow[23]);
    const secCompl = toNumber(tRow[13]);
    const sinI = toNumber(tRow[4]);
    return {
      codigo: p.codigo,
      nombre: p.nombre,
      pctUniv: pob ? (univ / pob) * 100 : null,
      pctSec: pob ? (secCompl / pob) * 100 : null,
      pctSinInst: pob ? (sinI / pob) * 100 : null,
      pctSuperior: pob ? ((ter + univ + pos) / pob) * 100 : null,
    };
  });

  const rkUniv = rankGBA(gbaRows.map(r => ({ codigo: r.codigo, nombre: r.nombre, value: r.pctUniv })));
  const rkSec = rankGBA(gbaRows.map(r => ({ codigo: r.codigo, nombre: r.nombre, value: r.pctSec })));
  const rkSinInst = rankGBA(gbaRows.map(r => ({ codigo: r.codigo, nombre: r.nombre, value: r.pctSinInst })));
  const rkSup = rankGBA(gbaRows.map(r => ({ codigo: r.codigo, nombre: r.nombre, value: r.pctSuperior })));

  // Promedio ponderado del GBA24 (universitario)
  let totPobGBA = 0, totUnivGBA = 0;
  for (const p of GBA24) {
    const sheetName = sheetIndex[normalize(p.nombre)];
    if (!sheetName) continue;
    const rs = XLSX.utils.sheet_to_json(wb3.Sheets[sheetName], { header: 1, defval: null, blankrows: false });
    const tRow = findTotalRow(rs);
    if (!tRow) continue;
    totPobGBA += toNumber(tRow[2]) || 0;
    totUnivGBA += toNumber(tRow[20]) || 0;
  }
  const promPondUnivGBA = totPobGBA ? (totUnivGBA / totPobGBA) * 100 : null;
  const deltaUniv = pctUniversitario - promPondUnivGBA;
  const posUniv = rkUniv.findIndex(r => r.municipioId === QUILMES.codigo) + 1;

  const data = {
    meta: {
      id: 'poblacion-educacion',
      title: 'Educación — Quilmes',
      category: 'Población',
      subcategory: 'Educación',
      source: SOURCE,
      date: DATE,
    },
    kpis: [
      { id: 'asiste-actual', label: 'Asiste actualmente', value: pctAsisteAct, formatted: fmtPct(pctAsisteAct), status: 'good', comparison: `${fmtInt(asisteAct)} personas` },
      { id: 'tasa-primaria', label: 'Asistencia 5-12 años', value: tasaPrimaria, formatted: fmtPct(tasaPrimaria), status: tasaPrimaria > 98 ? 'good' : 'warning', comparison: 'Cohorte de primaria' },
      { id: 'tasa-secundaria', label: 'Asistencia 13-17 años', value: tasaSecundaria, formatted: fmtPct(tasaSecundaria), status: tasaSecundaria > 95 ? 'good' : 'warning', comparison: `Cohorte de secundario obligatorio · ~${fmtInt(Math.round(noAsiste13a17))} fuera del sistema` },
      { id: 'tasa-superior', label: 'Asistencia 18-24 años', value: tasaSuperior, formatted: fmtPct(tasaSuperior), comparison: 'Edad típica de educación superior' },
      { id: 'sec-completo', label: 'Secundario completo (5+)', value: pctSecCompleto, formatted: fmtPct(pctSecCompleto) },
      { id: 'universitario', label: 'Universitario completo (5+)', value: pctUniversitario, formatted: fmtPct(pctUniversitario), status: 'good', comparison: `Brecha vs prom. GBA: ${deltaUniv >= 0 ? '+' : ''}${fmtDec(deltaUniv)} pp` },
      { id: 'superior', label: 'Educación superior completa', value: pctSuperior, formatted: fmtPct(pctSuperior), comparison: 'Terciario + Universitario + Posgrado' },
      { id: 'sin-instruccion', label: 'Sin instrucción', value: pctSinInst, formatted: fmtPct(pctSinInst, 2), comparison: `${fmtInt(sinInst)} personas de 5+` },
    ],
    charts: [
      {
        id: 'tasa-edad',
        type: 'line',
        title: 'Tasa de asistencia escolar por edad (5 a 24 años) — Quilmes',
        sectionId: 'edad',
        data: [{
          id: 'Asistencia',
          data: tasaPorEdadDedup
            .filter(r => r.edad >= 5 && r.edad <= 24)
            .map(r => ({ x: String(r.edad), y: Number(r.pctAsiste.toFixed(1)) })),
        }],
      },
      {
        id: 'asistencia-sexo-15a19',
        type: 'bar',
        title: 'Asistencia escolar por sexo registrado al nacer (15-19 y 20-24) — Quilmes',
        sectionId: 'brecha',
        data: [
          { categoria: 'Mujeres 15-19', value: Number((tasaMuj_15a19 || 0).toFixed(1)) },
          { categoria: 'Varones 15-19', value: Number((tasaVar_15a19 || 0).toFixed(1)) },
          { categoria: 'Mujeres 20-24', value: Number((tasaMuj_20a24 || 0).toFixed(1)) },
          { categoria: 'Varones 20-24', value: Number((tasaVar_20a24 || 0).toFixed(1)) },
        ],
        config: { xAxis: 'categoria' },
      },
      {
        id: 'nivel',
        type: 'pie',
        title: 'Máximo nivel educativo alcanzado — Quilmes',
        sectionId: 'nivel',
        data: [
          { id: 'Sin instrucción', label: 'Sin instrucción', value: sinInst },
          { id: 'Primario completo', label: 'Primario completo', value: primarioCompleto },
          { id: 'Secundario completo', label: 'Secundario completo', value: secundarioCompleto },
          { id: 'Terciario', label: 'Terciario no universitario', value: terciarioNoUniv },
          { id: 'Universitario', label: 'Universitario completo', value: universitario },
          { id: 'Posgrado', label: 'Posgrado', value: posgrado },
        ].filter(d => d.value > 0),
      },
      {
        id: 'univ-sexo',
        type: 'bar',
        title: '% con universitario completo y posgrado por sexo — Quilmes',
        sectionId: 'brecha',
        data: [
          { categoria: 'Mujeres univ.', value: Number((pctUnivMuj || 0).toFixed(1)) },
          { categoria: 'Varones univ.', value: Number((pctUnivVar || 0).toFixed(1)) },
          { categoria: 'Mujeres posg.', value: Number((pctPosgradoMuj || 0).toFixed(1)) },
          { categoria: 'Varones posg.', value: Number((pctPosgradoVar || 0).toFixed(1)) },
        ],
        config: { xAxis: 'categoria' },
      },
      {
        id: 'gba-univ',
        type: 'bar',
        title: '% con universitario completo — 24 partidos del GBA',
        sectionId: 'comparacion',
        data: rkUniv.map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
      {
        id: 'gba-superior',
        type: 'bar',
        title: '% con educación superior (terciaria/universitaria/posgrado) — 24 GBA',
        sectionId: 'comparacion',
        data: rkSup.map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
    ],
    rankings: [
      { id: 'rk-univ', title: '% con universitario completo — 24 GBA', sectionId: 'comparacion', items: rkUniv, order: 'desc' },
      { id: 'rk-superior', title: '% con educación superior — 24 GBA', sectionId: 'comparacion', items: rkSup, order: 'desc' },
      { id: 'rk-sec', title: '% con secundario completo — 24 GBA', sectionId: 'comparacion', items: rkSec, order: 'desc' },
      { id: 'rk-sin-inst', title: '% sin instrucción — 24 GBA', sectionId: 'comparacion', items: rkSinInst, order: 'asc' },
    ],
    mapData: buildFeatured(pctUniversitario, fmtPct(pctUniversitario), 'De la población de 5+ de Quilmes completó estudios universitarios'),
    extras: {
      educacion: {
        partido: { popTotal, asisteAct, asistio, nuncaAsis, pob5Mas, sinInst, primarioCompleto, secundarioCompleto, terciarioNoUniv, universitario, posgrado, pctSecCompleto, pctUniversitario, pctSuperior, pctSinInst },
        cohortes: {
          primaria_5a12: tasaPrimaria,
          secundaria_13a17: tasaSecundaria,
          superior_18a24: tasaSuperior,
          noAsiste13a17_estim: Math.round(noAsiste13a17),
        },
        sexoQuilmes: {
          tasaMuj_15a19, tasaVar_15a19,
          tasaMuj_20a24, tasaVar_20a24,
          tasaMuj_25a29, tasaVar_25a29,
          pctUnivMuj, pctUnivVar,
          pctSecComplMuj, pctSecComplVar,
          pctPosgradoMuj, pctPosgradoVar,
        },
        gba: { promPondUnivGBA, deltaUniv, posUniv },
        tasaPorEdadSimple: tasaPorEdadDedup,
      },
    },
  };

  writeJson(path.join(OUT_DIR, 'educacion.json'), data);
  return { pctSecCompleto, pctUniversitario, tasaSecundaria, tasaSuperior };
}

// ════════════════════════════════════════════════════════════════════
// RESUMEN — Gobierno local y viviendas colectivas
// Cuadro chico pero con datos únicos: categoría del municipio, viviendas
// colectivas, población en situación de calle. Se emite para consumo de
// la Landing (cuadro resumen debajo del hero).
// ════════════════════════════════════════════════════════════════════
function processResumenGobierno() {
  console.log('\n─── Resumen gobierno local ───');

  const rows = loadCuadro('c2022_bsas_gobierno_local_c1.xlsx', 'Cuadro 1.2');
  // Formato: col 4 = nombre del gobierno local. Quilmes se matchea por nombre.
  const quilmes = rows.find(r => r && /^\s*quilmes\s*$/i.test(String(r[4] || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
  if (!quilmes) throw new Error('No se encontró fila de Quilmes en gobierno_local');

  const categoria = String(quilmes[3] || '').trim();  // 'MU'
  const totalViv = toNumber(quilmes[5]);
  const pobTotal = toNumber(quilmes[6]);
  const vivPart = toNumber(quilmes[7]);
  const pobPart = toNumber(quilmes[8]);
  const vivCol = toNumber(quilmes[9]);
  const pobCol = toNumber(quilmes[10]);
  const pobCalle = toNumber(quilmes[11]) ?? 0;

  const categoriaFull = ({
    'MU': 'Municipio de única categoría',
    'M1': 'Municipio de 1° categoría',
    'M2': 'Municipio de 2° categoría',
    'M3': 'Municipio de 3° categoría',
  })[categoria] || categoria;

  const resumen = {
    source: SOURCE,
    date: DATE,
    categoriaCod: categoria,
    categoria: categoriaFull,
    totalViviendas: totalViv,
    viviendasParticulares: vivPart,
    viviendasColectivas: vivCol,
    poblacionTotal: pobTotal,
    poblacionEnViviendasParticulares: pobPart,
    poblacionEnViviendasColectivas: pobCol,
    poblacionEnSituacionDeCalle: pobCalle,
  };

  writeJson(path.join(__dirname, '..', 'public', 'data', 'resumen.json'), resumen);
  return resumen;
}

// ════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════
function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Procesando POBLACIÓN — Censo 2022 (Quilmes)     ║');
  console.log('╚══════════════════════════════════════════════════╝');
  processEstructura();
  processViviendas();
  processHogares();
  processHabitacionalPersonas();
  processSalud();
  processPrevision();
  processActividadEconomica();
  processEducacion();
  processResumenGobierno();
  console.log('\n✅ Done.');
}

if (require.main === module) {
  main();
}

module.exports = { main };
