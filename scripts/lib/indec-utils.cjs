// ════════════════════════════════════════════════════════════════════
// Utilidades compartidas para el pipeline del Dashboard Quilmes.
// Fuentes: INDEC Censo 2022 (xlsx por cuadro, una fila por partido),
//          SNIC departamental y Muertes Viales (CSV panel).
// ════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const INDEC_BASE =
  'C:/Users/dante/Desktop/Laboratorio Colossus/Pipeline OpenArg/datos_indec';
const SEG_BASE =
  'C:/Users/dante/Desktop/Laboratorio Colossus/Pipeline OpenArg/datos_abiertos/datasets/seguridad';

// ── Identidad del partido ────────────────────────────────────────────
const QUILMES = {
  codigo: '06658',
  codigoShort: '6658',
  id: null, // id del topojson — TODO: setear si se vuelve a usar mapData como mapa
  nombre: 'Quilmes',
  nombreUpper: 'QUILMES',
};

// ── Los 24 partidos del GBA (códigos INDEC completos, con 0 inicial) ─
const GBA24 = [
  { codigo: '06028', nombre: 'Almirante Brown' },
  { codigo: '06035', nombre: 'Avellaneda' },
  { codigo: '06091', nombre: 'Berazategui' },
  { codigo: '06260', nombre: 'Esteban Echeverría' },
  { codigo: '06270', nombre: 'Ezeiza' },
  { codigo: '06274', nombre: 'Florencio Varela' },
  { codigo: '06371', nombre: 'General San Martín' },
  { codigo: '06408', nombre: 'Hurlingham' },
  { codigo: '06410', nombre: 'Ituzaingó' },
  { codigo: '06412', nombre: 'José C. Paz' },
  { codigo: '06427', nombre: 'La Matanza' },
  { codigo: '06434', nombre: 'Lanús' },
  { codigo: '06490', nombre: 'Lomas de Zamora' },
  { codigo: '06515', nombre: 'Malvinas Argentinas' },
  { codigo: '06539', nombre: 'Merlo' },
  { codigo: '06560', nombre: 'Moreno' },
  { codigo: '06568', nombre: 'Morón' },
  { codigo: '06658', nombre: 'Quilmes' },
  { codigo: '06749', nombre: 'San Fernando' },
  { codigo: '06756', nombre: 'San Isidro' },
  { codigo: '06760', nombre: 'San Miguel' },
  { codigo: '06805', nombre: 'Tigre' },
  { codigo: '06840', nombre: 'Tres de Febrero' },
  { codigo: '06861', nombre: 'Vicente López' },
];

const GBA24_CODIGOS = new Set(GBA24.map(p => p.codigo));
const GBA24_CODIGOS_SHORT = new Set(GBA24.map(p => p.codigo.replace(/^0+/, '')));

// ── Normalización de strings (match nombres sin acentos ni puntuación) ─
function normalize(s) {
  return (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ── Parse de números con formato INDEC (puede venir "331,183" o "331183") ─
function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/\s/g, '').replace(/,/g, '');
  if (!/^-?[\d.]+$/.test(cleaned)) return null;
  return Number(cleaned);
}

// ── Lectura de una hoja de cuadro como matriz de celdas ────────────────
// El sheetName puede ser exacto o un fragmento: se busca en SheetNames por
// match exacto, luego por "normalizado sin espacios" y finalmente fallback
// a la primera hoja que incluya "cuadro" en el nombre.
function readSheetMatrix(file, sheetName) {
  const wb = XLSX.readFile(file);
  let resolved;
  if (sheetName && wb.Sheets[sheetName]) {
    resolved = sheetName;
  } else if (sheetName) {
    const target = sheetName.replace(/\s+/g, '').toLowerCase();
    resolved = wb.SheetNames.find(n => n.replace(/\s+/g, '').toLowerCase() === target);
  }
  if (!resolved) {
    resolved = wb.SheetNames.find(n => /cuadro/i.test(n)) || wb.SheetNames[0];
  }
  const sheet = wb.Sheets[resolved];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
}

// ── Busca la fila de un partido en un cuadro (por código o por nombre) ─
// Maneja dos formatos de cuadro INDEC:
//   1. "estándar": col 0 = código, col 1 = partido
//   2. "combinado": col 0 = "06658               Quilmes" (como en fecundidad)
function findPartidoRow(matrix, codigo, nombreAlt) {
  const needleCod = codigo;
  const needleCodShort = codigo.replace(/^0+/, '');
  const needleNom = normalize(nombreAlt || '');
  for (const row of matrix) {
    if (!row || row.length === 0) continue;
    const c0 = row[0] == null ? '' : String(row[0]).trim();
    const c1 = row[1] == null ? '' : String(row[1]).trim();
    if (c0 === needleCod || c0 === needleCodShort) return row;
    if (needleNom && normalize(c1) === needleNom) return row;
    // Formato combinado: "06658     Quilmes" → extraer código al principio
    const combinedMatch = c0.match(/^(\d{4,6})\s+(.+)$/);
    if (combinedMatch) {
      const [, cod, nom] = combinedMatch;
      if (cod === needleCod || cod === needleCodShort) return row;
      if (needleNom && normalize(nom) === needleNom) return row;
    }
  }
  return null;
}

// ── Escaneo de sub-hojas por partido ──────────────────────────────────
// Algunos cuadros INDEC publican una sub-hoja por partido (ej. educación
// c1_2 tiene 'Cuadro 1.2.1' a 'Cuadro 1.2.135', ordenadas alfabéticamente).
// Esta función escanea esas sub-hojas y devuelve un mapa { nombreNormalizado → nombreHoja }
// basándose en el título "Cuadro X.Y.N. ... partido <nombre>. ..."
function buildPartidoSheetIndex(workbook, cuadroPrefix) {
  const index = {};
  // Algunas hojas del INDEC vienen con espacios no separables (U+00A0) entre
  // "Cuadro" y el número. Reemplazamos cualquier espacio del prefijo por
  // \s+ y \. para los puntos.
  const reSrc = '^' + cuadroPrefix
    .replace(/\./g, '\\.')
    .replace(/\s+/g, '\\s+') + '\\.\\d+$';
  const re = new RegExp(reSrc);
  // Listado completo de partidos de Buenos Aires que pueden aparecer (todos los GBA24
  // más el resto del interior provincial — el sub-índice cubre 135 partidos).
  // Para cada hoja escaneamos las primeras 4 filas y buscamos cuál de los nombres
  // de GBA24 aparece después de "partido". El nombre puede contener puntos (ej.
  // "José C. Paz") por lo que un regex simple ".+?\." truncaría el nombre.
  const partidosCandidates = GBA24.map(p => p.nombre);
  for (const sheetName of workbook.SheetNames) {
    if (!re.test(sheetName)) continue;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
    let titleText = '';
    for (let i = 0; i < Math.min(rows.length, 4); i++) {
      const cell = String(rows[i]?.[0] || '');
      if (/partido/i.test(cell)) { titleText = cell; break; }
    }
    if (!titleText) continue;
    const titleNorm = normalize(titleText);
    // Match: el nombre normalizado del partido aparece como sub-cadena en el título
    // luego de la palabra "partido". Como GBA24 nombres tienen alta especificidad
    // (no hay solapamientos), basta con includes.
    for (const candidate of partidosCandidates) {
      const candNorm = normalize(candidate);
      if (titleNorm.includes(' partido ' + candNorm + ' ') || titleNorm.includes(' partido ' + candNorm + '.')) {
        index[candNorm] = sheetName;
        break;
      }
    }
  }
  return index;
}

// ── Lee la fila "Total" de una sub-hoja de partido ────────────────────
// En las sub-hojas, la primera fila de datos suele tener el literal "Total"
// en col A y los totales del partido en las columnas siguientes.
function findTotalRow(matrix) {
  for (const row of matrix) {
    if (!row || row.length === 0) continue;
    const c0 = row[0] == null ? '' : String(row[0]).trim().toLowerCase();
    if (c0 === 'total') return row;
  }
  return null;
}

// ── Extrae todas las filas de los 24 GBA desde un cuadro ───────────────
function extractGBA24Rows(matrix) {
  const rows = [];
  for (const row of matrix) {
    if (!row || row.length === 0) continue;
    const c0 = row[0] == null ? '' : String(row[0]).trim();
    if (GBA24_CODIGOS.has(c0) || GBA24_CODIGOS_SHORT.has(c0)) {
      rows.push(row);
    }
  }
  return rows;
}

// ── Escritura de JSON indentado (para `dist` pesa, para `public/data/` queda) ─
function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  const sizeKb = (fs.statSync(filePath).size / 1024).toFixed(1);
  console.log(`  ✓ ${path.relative(process.cwd(), filePath)} (${sizeKb} KB)`);
}

// ── Lectura de CSV simple (split por delimiter, sin escaping de quotes) ─
function readCsvSimple(file, delimiter = ';') {
  const content = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/).filter(l => l.length > 0);
  const header = lines.shift().split(delimiter);
  return {
    header,
    rows: lines.map(l => {
      const vals = l.split(delimiter);
      const o = {};
      header.forEach((h, i) => { o[h] = vals[i]; });
      return o;
    }),
  };
}

// ── Formato de números para UI ─────────────────────────────────────────
function fmtInt(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('es-AR').format(Math.round(n));
}
function fmtPct(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toFixed(digits).replace('.', ',')}%`;
}
function fmtDec(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(digits).replace('.', ',');
}

// ── KPI principal del informe (reemplaza al mapa interno) ──────────────
// Los datos del Censo y SNIC vienen agregados a nivel partido. En lugar
// de mostrar un choropleth ficticio por barrio, cada informe destaca el
// dato más representativo en un "hero" tipográfico: número grande con un
// caption arriba. El campo se serializa bajo `mapData` para mantener el
// schema, pero el renderer lo lee como bloque destacado.
function buildFeatured(value, formatted, caption) {
  if (value == null) return [];
  return [{
    municipioId: '06658',
    municipioNombre: 'Quilmes',
    value,
    formatted,
    caption,
    label: `${formatted} · ${caption}`,
  }];
}

module.exports = {
  INDEC_BASE,
  SEG_BASE,
  QUILMES,
  GBA24,
  GBA24_CODIGOS,
  normalize,
  toNumber,
  readSheetMatrix,
  findPartidoRow,
  extractGBA24Rows,
  buildPartidoSheetIndex,
  findTotalRow,
  readCsvSimple,
  writeJson,
  fmtInt,
  fmtPct,
  fmtDec,
  buildFeatured,
};
