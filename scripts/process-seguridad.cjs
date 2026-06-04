// ════════════════════════════════════════════════════════════════════
// process-seguridad.cjs
// Procesa SNIC departamental (2000-2024) y Muertes Viales (2017-2023)
// del Ministerio de Seguridad de la Nación → 2 informes del dashboard.
//
// Outputs:
//   public/data/seguridad/snic.json
//   public/data/seguridad/muertes-viales.json
// ════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const {
  SEG_BASE,
  QUILMES,
  GBA24,
  writeJson,
  fmtInt,
  fmtPct,
  fmtDec,
} = require('./lib/indec-utils.cjs');

const SNIC_FILE = path.join(
  SEG_BASE,
  'seguridad-snic-departamental-estadisticas-criminales-republica-argentina-por-departamentos',
  'estadísticas-criminales-en-la-república-argentina-por-departamentos-(panel)-(.csv).csv'
);
const VIALES_FILE = path.join(
  SEG_BASE,
  'seguridad-muertes-viales-sistema-alerta-temprana-estadisticas-criminales-republica-argentina',
  'hechos-y-víctimas-de-muertes-viales-en-la-república-argentina.-total-nacional-(panel)-(.csv).csv'
);
const OUT_DIR = path.join(__dirname, '..', 'public', 'data', 'seguridad');
const DATE = '2026-04-23';

// ── Parser CSV simple (sin soporte de quoted commas, pero funciona con estos datasets) ──
function* readCsvStream(file, delimiter = ';') {
  const content = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/);
  const header = lines[0].split(delimiter);
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    const vals = l.split(delimiter);
    const o = {};
    header.forEach((h, k) => { o[h] = vals[k]; });
    yield o;
  }
}

function num(v) {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ════════════════════════════════════════════════════════════════════
// SNIC — DELITOS 2000-2024
// ════════════════════════════════════════════════════════════════════
function processSNIC() {
  console.log('\n─── SNIC Departamental (2000-2024) ───');

  const gbaCodes = new Set(GBA24.map(p => p.codigo));
  const gbaByCode = Object.fromEntries(GBA24.map(p => [p.codigo, p.nombre]));

  // quilmes: por año → por delito → {hechos, victimas, masc, fem, tasa}
  const quilmesByYear = {};
  // gba: por partido (codigo) → por año → {hechos total}
  const gbaByPartido = {};
  for (const p of GBA24) gbaByPartido[p.codigo] = { nombre: p.nombre };

  // El SNIC codifica a Quilmes con DOS departamento_id distintos: 06658
  // cubre 2000-2022 y 06058 (error de tipeo de la fuente: 058 en vez de 658)
  // cubre 2023-2024. Los unificamos al código canónico INDEC para no perder
  // los años recientes ni la tasa por 100k.
  const QUILMES_SNIC_ALIAS = '06058';
  const canonDep = d => (d === QUILMES_SNIC_ALIAS ? QUILMES.codigo : d);

  let rowCount = 0;
  for (const r of readCsvStream(SNIC_FILE)) {
    rowCount++;
    const dep = canonDep(r['departamento_id']);
    if (!dep) continue;
    const year = parseInt(r['anio'], 10);
    if (!year) continue;
    const delito = r['codigo_delito_snic_nombre'];
    const hechos = num(r['cantidad_hechos']);
    const victimas = num(r['cantidad_victimas']);
    const masc = num(r['cantidad_victimas_masc']);
    const fem = num(r['cantidad_victimas_fem']);
    const tasaHechos = num(r['tasa_hechos']);

    if (dep === QUILMES.codigo) {
      if (!quilmesByYear[year]) quilmesByYear[year] = { hechos: 0, victimas: 0, masc: 0, fem: 0, delitos: {}, tasaTotalSum: 0 };
      quilmesByYear[year].hechos += hechos;
      quilmesByYear[year].victimas += victimas;
      quilmesByYear[year].masc += masc;
      quilmesByYear[year].fem += fem;
      // Sumar tasas individuales para reconstruir tasa total (todos los delitos / 100K)
      quilmesByYear[year].tasaTotalSum += tasaHechos;
      quilmesByYear[year].delitos[delito] = (quilmesByYear[year].delitos[delito] || 0) + hechos;
      if (/^Homicidios dolosos$/.test(delito)) {
        quilmesByYear[year].homicidiosTasa = tasaHechos;
        quilmesByYear[year].homicidios = hechos;
      }
      if (/^Robos \(excluye/.test(delito)) {
        quilmesByYear[year].robos = (quilmesByYear[year].robos || 0) + hechos;
        quilmesByYear[year].robosTasa = tasaHechos;
      }
    }
    if (gbaCodes.has(dep)) {
      const part = gbaByPartido[dep];
      if (!part[year]) part[year] = { hechos: 0, victimas: 0, homicidios: 0, tasaTotalSum: 0, homicidiosTasa: 0 };
      part[year].hechos += hechos;
      part[year].victimas += victimas;
      part[year].tasaTotalSum += tasaHechos;
      if (/^Homicidios dolosos$/.test(delito)) {
        part[year].homicidios += hechos;
        part[year].homicidiosTasa = tasaHechos;
      }
      if (/^Robos \(excluye/.test(delito)) part[year].robos = (part[year].robos || 0) + hechos;
      if (/^Hurtos$/.test(delito)) part[year].hurtos = (part[year].hurtos || 0) + hechos;
    }
  }
  console.log(`  Procesadas ${rowCount} filas SNIC.`);

  // Serie temporal Quilmes (2000-2024)
  const years = Object.keys(quilmesByYear).map(Number).sort((a, b) => a - b);
  const serieHechos = years.map(y => ({ x: String(y), y: quilmesByYear[y].hechos }));
  const serieVictimas = years.map(y => ({ x: String(y), y: quilmesByYear[y].victimas }));
  const serieHomicidios = years.map(y => ({ x: String(y), y: quilmesByYear[y].homicidios || 0 }));
  const serieTasaHechos = years.map(y => ({ x: String(y), y: Number((quilmesByYear[y].tasaTotalSum || 0).toFixed(1)) }));
  const serieTasaHomicidios = years.map(y => ({ x: String(y), y: Number((quilmesByYear[y].homicidiosTasa || 0).toFixed(2)) }));
  const serieRobos = years.map(y => ({ x: String(y), y: quilmesByYear[y].robos || 0 }));

  const last = years[years.length - 1];
  const prev = last - 1;
  const hechos2024 = quilmesByYear[last].hechos;
  const hechosPrev = quilmesByYear[prev].hechos;
  const varAnual = ((hechos2024 - hechosPrev) / hechosPrev) * 100;

  const hechos2019 = quilmesByYear[2019]?.hechos || 1;
  const var5y = ((hechos2024 - hechos2019) / hechos2019) * 100;

  // Top delitos 2024 Quilmes
  const delitosUlt = quilmesByYear[last].delitos;
  const topDelitos = Object.entries(delitosUlt)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const topDelito = topDelitos[0];

  const victimasFem2024 = quilmesByYear[last].fem;
  const victimasMasc2024 = quilmesByYear[last].masc;

  // Homicidios dolosos
  const hom2024 = quilmesByYear[last].homicidios || 0;
  const homPrev = quilmesByYear[prev].homicidios || 0;
  const homTasa = quilmesByYear[last].homicidiosTasa;

  // Evolución de principales delitos Quilmes
  const topDelitoIds = topDelitos.map(d => d[0]).slice(0, 5);
  const serieTopDelitos = topDelitoIds.map(id => ({
    id,
    data: years.map(y => ({ x: String(y), y: quilmesByYear[y].delitos[id] || 0 })),
  }));

  // GBA rankings: hechos 2024, tasa homicidios 2024
  const gbaHechos24 = GBA24.map(p => ({
    codigo: p.codigo,
    nombre: p.nombre,
    value: gbaByPartido[p.codigo][last]?.hechos || null,
  }));
  const gbaTasa24 = GBA24.map(p => ({
    codigo: p.codigo,
    nombre: p.nombre,
    value: gbaByPartido[p.codigo][last]?.tasaTotalSum ? Number(gbaByPartido[p.codigo][last].tasaTotalSum.toFixed(1)) : null,
  }));
  const gbaHomicidios24 = GBA24.map(p => ({
    codigo: p.codigo,
    nombre: p.nombre,
    value: gbaByPartido[p.codigo][last]?.homicidios ?? null,
  }));
  const gbaTasaHomicidios24 = GBA24.map(p => ({
    codigo: p.codigo,
    nombre: p.nombre,
    value: gbaByPartido[p.codigo][last]?.homicidiosTasa ? Number(gbaByPartido[p.codigo][last].homicidiosTasa.toFixed(2)) : null,
  }));
  const gbaRobos24 = GBA24.map(p => ({
    codigo: p.codigo,
    nombre: p.nombre,
    value: gbaByPartido[p.codigo][last]?.robos || null,
  }));

  function rank(rows, order = 'desc') {
    return [...rows]
      .filter(r => r.value != null)
      .sort((a, b) => (order === 'desc' ? b.value - a.value : a.value - b.value))
      .map(r => ({ name: r.nombre, value: r.value, municipioId: r.codigo }));
  }
  function mapData(rows, labelFn) {
    return rows.filter(r => r.value != null).map(r => ({
      municipioId: r.codigo, municipioNombre: r.nombre, value: r.value, label: labelFn(r.value),
    }));
  }

  // Posiciones Quilmes en rankings GBA (ordenado descendente: 1° = más alta)
  const rkTasa = rank(gbaTasa24);
  const rkTasaHom = rank(gbaTasaHomicidios24);
  const posTasaHechos = rkTasa.findIndex(r => r.municipioId === QUILMES.codigo) + 1;
  const posTasaHom = rkTasaHom.findIndex(r => r.municipioId === QUILMES.codigo) + 1;

  // Promedio simple GBA de tasa de homicidios (no es ponderado, pero es comparable)
  const validTasasHom = gbaTasaHomicidios24.filter(p => p.value != null).map(p => p.value);
  const promGBAtasaHom = validTasasHom.length ? validTasasHom.reduce((a, b) => a + b, 0) / validTasasHom.length : null;
  const validTasas = gbaTasa24.filter(p => p.value != null).map(p => p.value);
  const promGBAtasaTot = validTasas.length ? validTasas.reduce((a, b) => a + b, 0) / validTasas.length : null;

  // Composición patrimonial vs no patrimonial 2024
  // Helper: busca la cifra de un delito por regex sobre las llaves
  function findDelito(year, regex) {
    const dels = quilmesByYear[year]?.delitos || {};
    let total = 0;
    for (const [name, val] of Object.entries(dels)) {
      if (regex.test(name)) total += val;
    }
    return total;
  }
  const robos2024 = findDelito(last, /^Robos\b.*excluye los agravados/i);
  const robosAgrav = findDelito(last, /^Robos agravados/i);
  const hurtos2024 = findDelito(last, /^Hurtos$/i);
  const tentRobos = findDelito(last, /^Tentativas de robo/i);
  const patrimoniales = robos2024 + robosAgrav + hurtos2024 + tentRobos;
  const pctPatrimoniales = (patrimoniales / hechos2024) * 100;

  // Estafas virtuales evolución (delito incorporado al SNIC en 2023)
  // Ojo: el SNIC tiene DOS categorías que contienen "virtual": las estafas
  // "asistidas virtualmente" (las que queremos) y "(no incluye virtuales) y
  // usura". Matcheamos solo las virtuales reales con /virtualmente/i.
  const estafasVirt2023 = findDelito(2023, /virtualmente/i);
  const estafasVirt2024 = findDelito(last, /virtualmente/i);
  const lesionesViales2024 = findDelito(last, /Lesiones culposas en Accidentes Viales/i);
  const amenazas2024 = findDelito(last, /^Amenazas/i);
  const lesionesDolosas2024 = findDelito(last, /^Lesiones dolosas/i);

  // Top delitos 2024 bar data
  const topBar = topDelitos.map(([name, value]) => ({
    delito: name.length > 40 ? name.slice(0, 37) + '…' : name,
    value,
  }));

  const data = {
    meta: {
      id: 'seguridad-snic',
      title: 'Seguridad Ciudadana — Quilmes (SNIC 2000-2024)',
      category: 'Seguridad',
      subcategory: 'SNIC Departamental',
      source: 'Sistema Nacional de Información Criminal (SNIC) — Ministerio de Seguridad de la Nación',
      date: DATE,
    },
    kpis: [
      {
        id: 'hechos-ult',
        label: `Hechos delictivos ${last}`,
        value: hechos2024,
        formatted: fmtInt(hechos2024),
        status: varAnual > 0 ? 'warning' : 'good',
        comparison: `${varAnual >= 0 ? '+' : ''}${fmtDec(varAnual)}% vs ${prev}`,
      },
      {
        id: 'tasa-hechos',
        label: `Tasa total de hechos ${last}`,
        value: quilmesByYear[last].tasaTotalSum,
        formatted: `${fmtDec(quilmesByYear[last].tasaTotalSum)} / 100K`,
        comparison: `Promedio simple GBA24: ${fmtDec(promGBAtasaTot)} / 100K`,
      },
      {
        id: 'var-5y',
        label: `Variación 5 años (2019→${last})`,
        value: var5y,
        formatted: `${var5y >= 0 ? '+' : ''}${fmtDec(var5y)}%`,
        status: var5y > 0 ? 'warning' : 'good',
        comparison: `${fmtInt(hechos2019)} → ${fmtInt(hechos2024)} hechos`,
      },
      {
        id: 'patrimoniales',
        label: 'Delitos patrimoniales',
        value: pctPatrimoniales,
        formatted: fmtPct(pctPatrimoniales),
        comparison: `${fmtInt(patrimoniales)} hechos · robos + hurtos + tentativas`,
      },
      {
        id: 'homicidios',
        label: `Homicidios dolosos ${last}`,
        value: hom2024,
        formatted: fmtInt(hom2024),
        status: hom2024 > homPrev ? 'critical' : 'good',
        comparison: `Tasa: ${fmtDec(homTasa, 2)} / 100K · Prom. GBA: ${fmtDec(promGBAtasaHom, 2)} / 100K`,
      },
      {
        id: 'pos-gba-hom',
        label: `Posición GBA — tasa homicidios ${last}`,
        value: posTasaHom,
        formatted: `${posTasaHom}° de 24`,
        comparison: 'Mayor tasa de homicidios = posiciones más altas',
      },
      {
        id: 'victimas-fem',
        label: `Víctimas mujeres ${last}`,
        value: victimasFem2024,
        formatted: fmtInt(victimasFem2024),
        comparison: `${fmtInt(victimasMasc2024)} varones · ${fmtInt(victimasFem2024)} mujeres de ${fmtInt(quilmesByYear[last].victimas)} víctimas`,
      },
      {
        id: 'estafas-virt',
        label: `Estafas virtuales ${last}`,
        value: estafasVirt2024,
        formatted: fmtInt(estafasVirt2024),
        status: 'warning',
        comparison: `2023: ${fmtInt(estafasVirt2023)} · ${estafasVirt2023 > 0 ? '+' + fmtDec(((estafasVirt2024 - estafasVirt2023) / estafasVirt2023) * 100) + '% interanual' : 'nuevo registro'}`,
      },
    ],
    charts: [
      {
        id: 'serie-hechos',
        type: 'line',
        title: 'Evolución de hechos delictivos totales — Quilmes (2000-2024)',
        sectionId: 'panorama',
        data: [{ id: 'Hechos', data: serieHechos }],
      },
      {
        id: 'serie-victimas',
        type: 'line',
        title: 'Víctimas registradas — Quilmes (2000-2024)',
        sectionId: 'panorama',
        data: [{ id: 'Víctimas', data: serieVictimas }],
      },
      {
        id: 'serie-homicidios',
        type: 'line',
        title: 'Homicidios dolosos — Quilmes (2000-2024)',
        sectionId: 'homicidios',
        data: [{ id: 'Homicidios', data: serieHomicidios }],
      },
      {
        id: 'serie-tasa-hom',
        type: 'line',
        title: 'Tasa de homicidios dolosos por 100.000 habitantes — Quilmes',
        sectionId: 'homicidios',
        data: [{ id: 'Tasa /100K', data: serieTasaHomicidios }],
      },
      {
        id: 'serie-tasa-hechos',
        type: 'line',
        title: 'Tasa total de hechos delictivos por 100.000 habitantes — Quilmes',
        sectionId: 'panorama',
        data: [{ id: 'Tasa /100K', data: serieTasaHechos }],
      },
      {
        id: 'top-delitos',
        type: 'bar',
        title: `Top 10 delitos en Quilmes — ${last}`,
        sectionId: 'delitos',
        data: topBar,
        config: { xAxis: 'delito', layout: 'horizontal' },
      },
      {
        id: 'serie-top',
        type: 'line',
        title: 'Evolución de los 5 delitos principales — Quilmes',
        sectionId: 'delitos',
        data: serieTopDelitos.map(s => ({
          id: s.id.length > 30 ? s.id.slice(0, 28) + '…' : s.id,
          data: s.data,
        })),
      },
      {
        id: 'gba-hechos',
        type: 'bar',
        title: `Hechos delictivos absolutos — 24 GBA (${last})`,
        sectionId: 'comparacion',
        data: rank(gbaHechos24).map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
      {
        id: 'gba-tasa',
        type: 'bar',
        title: `Tasa total de hechos por 100.000 hab. — 24 GBA (${last})`,
        sectionId: 'comparacion',
        data: rkTasa.map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
      {
        id: 'gba-homicidios',
        type: 'bar',
        title: `Homicidios dolosos absolutos — 24 GBA (${last})`,
        sectionId: 'comparacion',
        data: rank(gbaHomicidios24).map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
      {
        id: 'gba-tasa-hom',
        type: 'bar',
        title: `Tasa de homicidios por 100.000 hab. — 24 GBA (${last})`,
        sectionId: 'comparacion',
        data: rkTasaHom.map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
    ],
    rankings: [
      { id: 'rk-hechos', title: `Hechos absolutos ${last} — 24 GBA`, sectionId: 'comparacion', items: rank(gbaHechos24), order: 'desc' },
      { id: 'rk-tasa', title: `Tasa total /100K ${last} — 24 GBA`, sectionId: 'comparacion', items: rkTasa, order: 'desc' },
      { id: 'rk-homicidios', title: `Homicidios absolutos ${last} — 24 GBA`, sectionId: 'comparacion', items: rank(gbaHomicidios24), order: 'desc' },
      { id: 'rk-tasa-hom', title: `Tasa homicidios /100K ${last} — 24 GBA`, sectionId: 'comparacion', items: rkTasaHom, order: 'desc' },
      { id: 'rk-robos', title: `Robos ${last} — 24 GBA`, sectionId: 'comparacion', items: rank(gbaRobos24), order: 'desc' },
    ],
    mapData: [{
      municipioId: '06658',
      municipioNombre: 'Quilmes',
      value: hechos2024,
      formatted: fmtInt(hechos2024),
      caption: `Hechos delictivos registrados en Quilmes — ${last}`,
      label: `${fmtInt(hechos2024)} hechos delictivos en ${last}`,
    }],
    extras: {
      snic: {
        quilmes: {
          last, prev, hechos2024, hechosPrev, hechos2019, varAnual, var5y,
          tasaTotal2024: quilmesByYear[last].tasaTotalSum,
          tasa2000: quilmesByYear[2000]?.tasaTotalSum,
          hom2024, homTasa, homPrev,
          robos2024, robosAgrav, hurtos2024, tentRobos, patrimoniales, pctPatrimoniales,
          estafasVirt2023, estafasVirt2024,
          lesionesViales2024, amenazas2024, lesionesDolosas2024,
          victimasFem2024, victimasMasc2024, totalVic: quilmesByYear[last].victimas,
        },
        gba: {
          posTasaHechos, posTasaHom,
          promGBAtasaHom, promGBAtasaTot,
        },
        topDelitos2024: topDelitos.map(([name, value]) => ({ name, value })),
      },
    },
  };

  writeJson(path.join(OUT_DIR, 'snic.json'), data);
  return data.kpis;
}

// ════════════════════════════════════════════════════════════════════
// MUERTES VIALES 2017-2023
// ════════════════════════════════════════════════════════════════════
function processVialesQuilmes() {
  console.log('\n─── Muertes Viales (2017-2023) ───');

  const quilmesCodeShort = parseInt(QUILMES.codigoShort, 10); // 6568

  const victimas = [];
  const allRowsByPartido = {}; // para rankings GBA — conteo por codigoShort
  let total = 0;

  for (const r of readCsvStream(VIALES_FILE)) {
    total++;
    const provId = parseInt(r['provincia_id'], 10);
    const depId = parseInt(r['departamento_id'], 10);
    if (provId !== 6) continue;
    const tipo = r['tipo_persona'];
    if (tipo !== 'Víctima') continue;
    // Acumular por partido GBA
    const codigoFull = String(depId).padStart(5, '0').replace(/^0+/, '0');
    // codigoFull tipo "06658"
    const codigo5 = String(depId).padStart(5, '0'); // "06658"
    const codigo24 = '0' + codigo5.replace(/^0+/, ''); // ajustamos: "06658"
    // Mejor comparar con codigoShort
    const match = GBA24.find(p => p.codigoShort === String(depId));
    // Fallback: los códigos tienen 0 a la izquierda. Corremos sin 0:
    const gbaPartido = GBA24.find(p => String(parseInt(p.codigo, 10)) === String(depId));
    if (gbaPartido) {
      allRowsByPartido[gbaPartido.codigo] = (allRowsByPartido[gbaPartido.codigo] || 0) + 1;
    }
    if (depId !== quilmesCodeShort) continue;
    victimas.push({
      anio: parseInt(r['anio'], 10),
      mes: parseInt(r['mes'], 10),
      calle: r['calle_nombre'],
      inter: r['calle_interseccion_nombre'],
      tipo_lugar: r['tipo_lugar'],
      modo_prod: r['modo_produccion_hecho'],
      modo_prod_amp: r['modo_produccion_hecho_ampliada'],
      clima: r['clima_condicion'],
      sexo: r['victima_sexo'],
      edad: r['victima_tr_edad'],
      clase: r['victima_clase'],
      vehiculo: r['victima_vehiculo'],
      vehiculo_amp: r['victima_vehiculo_ampliado'],
    });
  }
  console.log(`  Procesadas ${total} filas Muertes Viales (${victimas.length} víctimas Quilmes).`);

  // Por año
  const porAnio = {};
  victimas.forEach(v => { porAnio[v.anio] = (porAnio[v.anio] || 0) + 1; });
  const years = Object.keys(porAnio).map(Number).sort((a, b) => a - b);
  const serieAnual = years.map(y => ({ x: String(y), y: porAnio[y] }));
  const totalVic = victimas.length;
  const promedioAnual = totalVic / years.length;

  // Por vehículo
  const porVehiculo = {};
  victimas.forEach(v => {
    const k = v.vehiculo || 'Sin dato';
    porVehiculo[k] = (porVehiculo[k] || 0) + 1;
  });
  const vehiculosPie = Object.entries(porVehiculo)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ id: k, label: k, value: v }));
  const vehiculoTop = vehiculosPie[0];

  // Por edad
  const porEdad = {};
  victimas.forEach(v => {
    const k = v.edad || 'Sin dato';
    porEdad[k] = (porEdad[k] || 0) + 1;
  });
  const edadOrder = ['0-4','5-9','10-14','15-17','18-24','25-29','30-34','35-39','40-44','45-49','50-54','55-59','60-64','65-69','70-74','75-79','80+','Sin dato','Sin determinar'];
  const edadBar = edadOrder
    .filter(k => porEdad[k])
    .map(k => ({ edad: k, value: porEdad[k] }));
  // Incluir las que no entraron en edadOrder
  Object.entries(porEdad).forEach(([k, v]) => {
    if (!edadOrder.includes(k) && v > 0) edadBar.push({ edad: k, value: v });
  });

  // Por modo de producción
  const porModo = {};
  victimas.forEach(v => {
    const k = v.modo_prod || 'Sin dato';
    porModo[k] = (porModo[k] || 0) + 1;
  });
  const modoPie = Object.entries(porModo)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ id: k, label: k, value: v }));

  // Por sexo
  const porSexo = {};
  victimas.forEach(v => {
    const k = v.sexo || 'Sin dato';
    porSexo[k] = (porSexo[k] || 0) + 1;
  });

  // Calles más frecuentes
  const porCalle = {};
  victimas.forEach(v => {
    const k = (v.calle || '').trim();
    if (!k) return;
    porCalle[k] = (porCalle[k] || 0) + 1;
  });
  const callesTop = Object.entries(porCalle)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([k, v]) => ({ name: k, value: v }));

  // Estacionalidad mensual
  const porMes = Array(12).fill(0);
  victimas.forEach(v => { if (v.mes >= 1 && v.mes <= 12) porMes[v.mes - 1]++; });
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const mesBar = porMes.map((v, i) => ({ mes: meses[i], value: v }));
  const mesPico = mesBar.reduce((a, b) => (b.value > a.value ? b : a), mesBar[0]);

  // Tasa por 100.000 habitantes — pobl. Quilmes Censo 2022 (cuadro 1 INDEC).
  const POBL_QUILMES = 633391;
  const tasaPor100K = (totalVic / POBL_QUILMES) * 100000;
  const tasaAnualPor100K = tasaPor100K / years.length;

  // Conteos por categorías
  const motos = victimas.filter(v => /moto/i.test(v.vehiculo || '')).length;
  const autos = victimas.filter(v => /^Auto/i.test(v.vehiculo || '')).length;
  const peatones = victimas.filter(v => /peat[oó]n/i.test(v.clase || '') || /peat[oó]n/i.test(v.vehiculo || '')).length;
  const bicis = victimas.filter(v => /bici/i.test(v.vehiculo || '')).length;
  const utilitarios = victimas.filter(v => /utilitario|cami[oó]n|camioneta/i.test(v.vehiculo || '')).length;

  // Por sexo (data: "Masculino" / "Femenino" / "Sin determinar")
  const vicVarones = victimas.filter(v => /^Mascul/i.test(v.sexo || '')).length;
  const vicMujeres = victimas.filter(v => /^Femen/i.test(v.sexo || '')).length;
  const vicSinDato = victimas.filter(v => !/^(Mascul|Femen)/i.test(v.sexo || '')).length;

  // Rankings GBA
  const gbaRanking = GBA24.map(p => ({
    codigo: p.codigo,
    nombre: p.nombre,
    value: allRowsByPartido[p.codigo] || 0,
  }));

  // Posición Quilmes en ranking GBA absoluto
  const rkGBA = [...gbaRanking].sort((a, b) => b.value - a.value);
  const posGBA = rkGBA.findIndex(r => r.codigo === QUILMES.codigo) + 1;
  // Promedio simple GBA
  const promGBA = gbaRanking.reduce((a, b) => a + b.value, 0) / gbaRanking.length;
  function rank(rows) {
    return [...rows].sort((a, b) => b.value - a.value).map(r => ({ name: r.nombre, value: r.value, municipioId: r.codigo }));
  }

  const data = {
    meta: {
      id: 'seguridad-muertes-viales',
      title: 'Muertes Viales — Quilmes (SAT 2017-2023)',
      category: 'Seguridad',
      subcategory: 'Muertes Viales',
      source: 'Sistema de Alerta Temprana de Muertes Viales — Ministerio de Seguridad de la Nación',
      date: DATE,
    },
    kpis: [
      {
        id: 'total-victimas',
        label: 'Víctimas totales (2017-2023)',
        value: totalVic,
        formatted: fmtInt(totalVic),
        status: 'critical',
        comparison: `${years.length} años de cobertura`,
      },
      {
        id: 'promedio',
        label: 'Promedio anual',
        value: promedioAnual,
        formatted: fmtDec(promedioAnual, 1),
        unit: 'víctimas/año',
      },
      {
        id: 'tasa',
        label: 'Tasa anual por 100.000 hab.',
        value: tasaAnualPor100K,
        formatted: fmtDec(tasaAnualPor100K, 2),
        unit: 'víctimas/100K/año',
        comparison: `Acumulado 7 años: ${fmtDec(tasaPor100K, 1)} / 100K`,
      },
      {
        id: 'motos',
        label: 'Víctimas en moto',
        value: motos,
        formatted: fmtInt(motos),
        status: 'warning',
        comparison: `${fmtPct((motos / totalVic) * 100)} del total`,
      },
      {
        id: 'peatones',
        label: 'Víctimas peatonas',
        value: peatones,
        formatted: fmtInt(peatones),
        comparison: `${fmtPct((peatones / totalVic) * 100)} del total`,
      },
      {
        id: 'mes-pico',
        label: 'Mes con más víctimas',
        value: mesPico.value,
        formatted: mesPico.mes,
        comparison: `${fmtInt(mesPico.value)} víctimas en ${mesPico.mes} (acumulado 7 años)`,
      },
      {
        id: 'sexo',
        label: 'Distribución por sexo',
        value: vicVarones,
        formatted: `${fmtPct((vicVarones / totalVic) * 100)} V`,
        comparison: `${fmtInt(vicVarones)} varones · ${fmtInt(vicMujeres)} mujeres`,
      },
      {
        id: 'pos-gba',
        label: 'Posición GBA — víctimas absolutas',
        value: posGBA,
        formatted: `${posGBA}° de 24`,
        comparison: `Mayor cantidad de víctimas = posiciones más altas · prom. GBA: ${fmtDec(promGBA, 0)}`,
      },
    ],
    charts: [
      {
        id: 'serie-anual',
        type: 'line',
        title: 'Víctimas fatales por año — Quilmes',
        sectionId: 'evolucion',
        data: [{ id: 'Víctimas', data: serieAnual }],
      },
      {
        id: 'vehiculos',
        type: 'pie',
        title: 'Víctimas por tipo de vehículo',
        sectionId: 'vehiculos',
        data: vehiculosPie,
      },
      {
        id: 'edades',
        type: 'bar',
        title: 'Víctimas por grupo etario',
        sectionId: 'perfil',
        data: edadBar,
        config: { xAxis: 'edad' },
      },
      {
        id: 'modo',
        type: 'pie',
        title: 'Modo de producción del hecho',
        sectionId: 'circunstancias',
        data: modoPie,
      },
      {
        id: 'calles',
        type: 'bar',
        title: 'Top 15 calles/rutas con más víctimas — Quilmes',
        sectionId: 'rutas',
        data: callesTop.map(c => ({ calle: c.name, value: c.value })),
        config: { xAxis: 'calle', layout: 'horizontal' },
      },
      {
        id: 'estacionalidad',
        type: 'bar',
        title: 'Víctimas viales por mes (acumulado 2017-2023) — Quilmes',
        sectionId: 'estacionalidad',
        data: mesBar,
        config: { xAxis: 'mes' },
      },
      {
        id: 'gba-total',
        type: 'bar',
        title: 'Víctimas fatales viales absolutas — 24 GBA (2017-2023)',
        sectionId: 'comparacion',
        data: rank(gbaRanking).map(r => ({ partido: r.name, value: r.value })),
        config: { xAxis: 'partido', layout: 'horizontal' },
      },
    ],
    rankings: [
      { id: 'rk-calles', title: 'Calles más críticas — Quilmes', sectionId: 'rutas', items: callesTop.map(c => ({ name: c.name, value: c.value })), order: 'desc' },
      { id: 'rk-gba', title: 'Víctimas fatales viales — 24 GBA', sectionId: 'comparacion', items: rank(gbaRanking), order: 'desc' },
    ],
    mapData: [{
      municipioId: '06658',
      municipioNombre: 'Quilmes',
      value: totalVic,
      formatted: fmtInt(totalVic),
      caption: 'Víctimas fatales en siniestros viales (2017-2023)',
      label: `${fmtInt(totalVic)} víctimas fatales (2017-2023)`,
    }],
    extras: {
      muertesViales: {
        quilmes: {
          totalVic, promedioAnual, tasaPor100K, tasaAnualPor100K, years: years.length,
          motos, autos, peatones, bicis, utilitarios,
          vicVarones, vicMujeres,
          mesPico,
          callesTop,
        },
        gba: { posGBA, promGBA },
        porModo,
      },
    },
  };

  writeJson(path.join(OUT_DIR, 'muertes-viales.json'), data);
  return data.kpis;
}

// ════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════
function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Procesando SEGURIDAD — Quilmes                   ║');
  console.log('╚══════════════════════════════════════════════════╝');
  processSNIC();
  processVialesQuilmes();
  console.log('\n✅ Done.');
}

if (require.main === module) {
  main();
}

module.exports = { main };
