# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Contexto

Dashboard de datos abiertos del **Municipio de Quilmes** (Provincia de Buenos Aires, Argentina). SPA estática pensada para habitantes del partido: 10 informes (8 de Población sobre Censo 2022 + 2 de Seguridad sobre SNIC y SAT muertes viales), más un cuadro resumen en la Landing derivado del cuadro "Gobierno Local" del Censo. Comparaciones contra los 24 partidos del GBA. Prosa narrativa en tercera persona (sin voseo militante, sin interpretación sin respaldo del dato, sin secciones prescriptivas de política pública). El voseo queda reservado para el copy de la UI y el hero.

## Comandos

```bash
npm install            # ATENCIÓN: ver nota de .npmrc + Rollup más abajo
npm run dev            # Vite dev server en :5173
npm run build          # tsc -b && vite build
npm run preview        # Sirve dist/
npm run build-data     # Orquestador del pipeline (process-poblacion + process-seguridad)
```

No hay test runner, linter ni formatter. No los inventes.

Para re-generar un solo informe sin correr todo el pipeline:
```bash
node scripts/process-poblacion.cjs   # regenera los 6 JSONs de /data/poblacion/
node scripts/process-seguridad.cjs   # regenera snic.json y muertes-viales.json
```

### Footguns de instalación

1. **`.npmrc` fija `legacy-peer-deps=true`** — Nivo 0.88 declara peer `react <19` y el proyecto usa React 19. No sacar este flag.

2. **`npm install` puede omitir el binario nativo de Rollup** (bug npm#4828, especialmente en Windows ARM64). Síntoma: `vite` falla al arrancar con `Cannot find module '@rollup/rollup-win32-arm64-msvc'`. Fix:
   ```bash
   npm install --legacy-peer-deps --no-save @rollup/rollup-win32-arm64-msvc
   ```
   (o el binario correspondiente al host). Hacer esto después de cada `npm install` si el arranque falla.

## Arquitectura

### SPA 100 % estática

React 19 + Vite 6, deploy a Vercel como estáticos en `dist/`. **No hay funciones serverless** — los datos son JSONs commiteados en `public/data/` y los informes son markdown en `public/reports/`. `vercel.json` reescribe todo excepto `assets|data|reports|.well-known` a `index.html`.

### Routing (src/App.tsx)

- `/` → `Landing` (hero + grid de 8 cards + footer)
- `/*` → `ReportView` — catch-all intencional, resuelve el slug en el registry vía `getReportBySlug(params['*'])`. **No convertir a rutas nombradas**: los slugs tienen barras (`poblacion/estructura`) y el matching vive en el registry.

`FirstVisitIntro` muestra un overlay `IntroHero` con efecto typewriter la primera vez que alguien carga `/`. Se descarta al click; persiste en `localStorage` bajo `quilmes-intro-seen`. En rutas profundas (links compartidos a informes) no aparece.

### Pipeline de datos

```
Fuentes externas en C:/Users/dante/Desktop/Laboratorio Colossus/Pipeline OpenArg/…
  ├─ datos_indec/poblacion/censo_2022/c2022_bsas_*.xlsx  (INDEC Censo 2022)
  └─ datos_abiertos/datasets/seguridad/…                 (SNIC + SAT muertes viales)
        ↓  scripts/process-poblacion.cjs   →  public/data/poblacion/*.json
        ↓  scripts/process-seguridad.cjs   →  public/data/seguridad/*.json
        ↓  ChartRenderer + KPI hero        →  SPA
```

- `scripts/lib/indec-utils.cjs` tiene las utilidades comunes: códigos `GBA24`, identidad `QUILMES` (código INDEC `06658`), lectores de xlsx/csv, formateadores (`fmtInt` / `fmtPct` / `fmtDec`) y `buildFeatured(value, formatted, caption)` que emite el KPI hero.
- Las rutas a las fuentes externas están **hardcodeadas en valor absoluto** en `indec-utils.cjs` (`INDEC_BASE`, `SEG_BASE`). Si cambia el layout del pipeline, editar ahí.
- `scripts/build-data.cjs` es el orquestador. No hay hook `prebuild`: el build de Vercel no regenera datos, así que los JSON finales **deben estar commiteados**.

### Sistema de reportes

`src/data/reportRegistry.ts` es la única fuente de verdad: 8 entradas con `slug`, `mdPath`, `dataPath`, `order`. Agregar un informe = (a) sumar entrada al registry, (b) crear su `.md` en `public/reports/`, (c) emitir su `.json` en `public/data/` desde un processor, (d) sumar mini-stat en `MINI_STATS` del Landing.

### Schema `ReportData` (src/types/report.ts)

- `meta` — título, categoría, subcategoría, fuente, fecha.
- `kpis[]` — tarjetas de arriba del informe.
- `charts[]` — bar/line/pie/pyramid renderizados por `ChartRenderer`. El tipo `map` es no-op (devuelve `null`).
- `rankings[]` — listas ordenadas contra los 24 GBA.
- `mapData[]` — **pese al nombre histórico, hoy almacena el KPI hero** que reemplazó al mapa. Contiene una única entrada `{ value, formatted, caption, label, municipioId: '06658' }` que renderiza `ReportView` como bloque tipográfico grande. `MapDataItem.formatted` y `.caption` son opcionales para compatibilidad hacia atrás.

**No hay mapa territorial** porque los datos del Censo y SNIC vienen agregados a nivel partido — INDEC no publica cuadros desagregados por barrio/radio en estos informes. Si alguna vez se suman datos por radio censal (vía REDATAM) + GeoJSON barrial del municipio, el schema soporta volver a un choropleth con múltiples entradas en `mapData[]`.

### Chart Renderer (src/components/charts/ChartRenderer.tsx)

`LineChartView` **detecta dos formatos de datos**:
- **Nivo nativo**: `[{ id, data: [{x, y}, …] }]` — es lo que emiten los processors actuales.
- **Plano**: `[{ <xKey>: …, <serieKey>: … }]` — compatibilidad con el patrón del Dashboard PBA original.

El detector es `isNivoFormat = Array.isArray(first.data) && 'id' in first`. Si algún día los processors emiten líneas en formato plano, el LineChartView los acepta también.

### Comparaciones vs. 24 GBA

El producto se centra en Quilmes pero usa los **24 partidos del Gran Buenos Aires** como marco de referencia en **charts y rankings** (no en el mapa ni en los stats del hero). La lista canónica y los códigos INDEC viven en `GBA24` dentro de `indec-utils.cjs`. Si se agrega un informe nuevo, usar `extractAllPartidosCol(matrix, colIndex)` para extraer la columna del GBA24 de un cuadro.

### Styling

Vanilla CSS. Todo el design system, tokens y theme switching viven en `src/index.css` (~70 KB single file, se expande al final cuando se suma algo). Theme state en `src/store/useStore.ts` (Zustand persistido en `localStorage` con la key **`pba-theme`** — heredada del clon de origen; no renombrarla sin migración porque rompe la preferencia de usuarios existentes).

Los charts leen el theme vía `useChartTheme` en `ChartRenderer.tsx`. **No introducir Tailwind, styled-components ni CSS modules**: los classnames tipo `text-center` / `py-20` están definidos a mano en `index.css`.

## Convenciones

- Scripts son `.cjs` (CommonJS) porque `package.json` declara `"type": "module"`.
- UI y markdown en español rioplatense (voseo: "podés", "explorá"). Evitar lenguaje estigmatizante tipo "típico del primer cordón", "asentamientos informales como ubicación probable", "problemas estructurales más graves que…". Hablar con datos directos, no con categorías territoriales cargadas.
- Alias `@/*` → `src/*` configurado en `tsconfig.json` y `vite.config.ts`.
- Deploy target: Vercel. CORS / rewrites / CSP están en `vercel.json` (sin `/api/` — la SPA es estática).
