# Dashboard Quilmes

> Dashboard interactivo de datos abiertos del **Municipio de Quilmes** (Provincia de Buenos Aires, Argentina). 10 informes sobre el Censo Nacional 2022 (INDEC) y estadísticas de seguridad (SNIC, SAT), comparados contra los 24 partidos del Gran Buenos Aires.

Hecho por [Colossus Lab](https://colossuslab.org) con datos abiertos vía [OpenArg](https://www.openarg.org).

---

## Tabla de contenidos

- [Qué muestra el dashboard](#qué-muestra-el-dashboard)
- [Cómo usarlo](#cómo-usarlo)
- [Catálogo de informes](#catálogo-de-informes)
- [Fuentes de datos](#fuentes-de-datos)
- [Correr en local](#correr-en-local)
- [Regenerar los datos](#regenerar-los-datos)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Stack técnico](#stack-técnico)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

---

## Qué muestra el dashboard

Quilmes es el 3° partido más poblado del Gran Buenos Aires (633.391 habitantes en 2022) y el 6° en densidad poblacional, un gran centro urbano del primer cordón sur del conurbano. Este dashboard presenta **10 informes** que cubren:

- **Demografía** — estructura por sexo y edad, pirámide poblacional, serie histórica 1970-2022.
- **Vivienda y hogares** — stock habitacional, condiciones habitacionales por hogar y por persona.
- **Salud y previsión** — cobertura de salud, beneficios previsionales.
- **Trabajo y educación** — actividad económica, máximo nivel educativo, asistencia escolar.
- **Seguridad** — delitos SNIC (2000-2024), víctimas fatales de siniestros viales (2017-2023).

Cada informe incluye: KPIs principales del partido, gráficos de Quilmes, rankings comparativos contra los 24 partidos del GBA y tablas descriptivas. Los datos se actualizan al regenerar el pipeline desde las fuentes oficiales.

---

## Cómo usarlo

### Navegación básica

1. **Landing** (`/`) — hero con los 10 informes + un cuadro resumen del partido (categoría administrativa, viviendas totales, población en viviendas colectivas, personas en situación de calle).
2. **Grid de categorías** — los informes están agrupados en **Población** (8) y **Seguridad** (2). Hacé click en cualquier card para abrir el informe completo.
3. **Informe** (`/<categoría>/<slug>`) — cada informe tiene:
   - **Hero** con 4-6 KPIs animados.
   - **Dato destacado** en formato grande (ej. "633.391 habitantes en Quilmes según el Censo 2022").
   - **Secciones de scrollytelling** con texto + gráficos + rankings GBA24 intercalados.
   - **Navegación anterior/siguiente** al final para saltar entre informes.

### Cambiar tema

Botón de tema en la barra superior → alterna entre modo claro y oscuro. La preferencia persiste en `localStorage` (clave `pba-theme`).

### Compartir un informe

Los slugs son públicos y comparten URL limpia. Ejemplo:
`https://dashboard-quilmes.vercel.app/poblacion/estructura`

---

## Catálogo de informes

### Población (8)

| # | Informe | Slug | Fuente |
|---|---|---|---|
| 1 | Estructura por Sexo y Edad | `poblacion/estructura` | Censo 2022 — Cuadros Estructura |
| 2 | Stock Habitacional y Viviendas | `poblacion/viviendas` | Censo 2022 — Cuadros Vivienda |
| 3 | Condiciones Habitacionales de los Hogares | `poblacion/hogares` | Censo 2022 — Cuadros Hogares |
| 4 | Condiciones Habitacionales de la Población | `poblacion/habitacional-personas` | Censo 2022 — Cuadros Población |
| 5 | Cobertura de Salud | `poblacion/salud` | Censo 2022 — Cuadros Salud |
| 6 | Previsión Social | `poblacion/prevision` | Censo 2022 — Cuadros Previsión |
| 7 | Actividad Económica | `poblacion/actividad-economica` | Censo 2022 — Cuadros Actividad Económica |
| 8 | Educación | `poblacion/educacion` | Censo 2022 — Cuadros Educación |

### Seguridad (2)

| # | Informe | Slug | Fuente |
|---|---|---|---|
| 9 | Seguridad Ciudadana — SNIC 2000-2024 | `seguridad/snic` | Sistema Nacional de Información Criminal — Ministerio de Seguridad de la Nación |
| 10 | Muertes Viales — SAT 2017-2023 | `seguridad/muertes-viales` | Sistema de Alerta Temprana de Muertes Viales — Ministerio de Seguridad de la Nación |

---

## Fuentes de datos

Todos los datos provienen de fuentes públicas oficiales:

- **INDEC — Censo Nacional de Población, Hogares y Viviendas 2022** (Cuadros provinciales por partido, Buenos Aires). Datos abiertos publicados por el Instituto Nacional de Estadística y Censos.
- **SNIC — Sistema Nacional de Información Criminal** (datasets departamentales 2000-2024) publicado por el Ministerio de Seguridad de la Nación.
- **SAT — Sistema de Alerta Temprana de Muertes Viales** (microdatos 2017-2023) publicado por el Ministerio de Seguridad de la Nación.

Los JSONs procesados viven en `public/data/` y están commiteados al repo. No es necesario ejecutar el pipeline para ver el dashboard — alcanza con `npm install && npm run dev`.

---

## Correr en local

### Requisitos

- Node.js 18+ (testeado con Node 24)
- npm 10+

### Pasos

```bash
git clone https://github.com/colossus-lab/Dashboard-Quilmes.git
cd Dashboard-Quilmes
npm install
npm run dev
```

El servidor abre en `http://localhost:5173`.

### Footguns de instalación

1. **`.npmrc` fija `legacy-peer-deps=true`** — Nivo 0.88 declara peer `react <19` y el proyecto usa React 19. No sacar este flag.

2. **`npm install` puede omitir el binario nativo de Rollup** (bug npm#4828, especialmente en Windows ARM64). Síntoma: `vite` falla con `Cannot find module '@rollup/rollup-win32-arm64-msvc'`. Fix:

   ```bash
   npm install --legacy-peer-deps --no-save @rollup/rollup-win32-arm64-msvc
   ```

   (o el binario correspondiente al host).

### Scripts disponibles

```bash
npm run dev         # Vite dev server en :5173
npm run build       # tsc -b && vite build → dist/
npm run preview     # Sirve dist/ en :4173
npm run build-data  # Orquestador del pipeline (procesa todo desde xlsx/csv crudos)
```

---

## Regenerar los datos

El pipeline toma los archivos crudos de INDEC/SNIC/SAT y emite los JSONs en `public/data/`. **No es obligatorio correrlo** para ver el dashboard: los JSONs finales están commiteados.

### Requisito: archivos fuente

El pipeline lee desde rutas absolutas hardcodeadas en [`scripts/lib/indec-utils.cjs`](scripts/lib/indec-utils.cjs):

```js
const INDEC_BASE = '<ruta al directorio con los xlsx del Censo 2022>';
const SEG_BASE   = '<ruta al directorio con los datasets de seguridad>';
```

Editá esas rutas al layout de tu sistema antes de correr el pipeline.

### Comandos

```bash
node scripts/process-poblacion.cjs   # Regenera los 8 JSONs de public/data/poblacion/ + public/data/resumen.json
node scripts/process-seguridad.cjs   # Regenera snic.json y muertes-viales.json
npm run build-data                   # Corre ambos en secuencia
```

### Agregar un informe nuevo

1. Emitir su JSON desde un processor (nuevo o extendiendo uno existente).
2. Sumar entrada al registry en [`src/data/reportRegistry.ts`](src/data/reportRegistry.ts).
3. Crear el markdown en `public/reports/<categoría>/<slug>.md`.
4. Sumar una mini-stat en `MINI_STATS` de [`src/pages/Landing.tsx`](src/pages/Landing.tsx).

Detalles del schema `ReportData` en [`src/types/report.ts`](src/types/report.ts).

---

## Estructura del proyecto

```
Dashboard-Quilmes/
├── public/
│   ├── data/                      # JSONs consumidos por el SPA (commiteados)
│   │   ├── poblacion/             #   8 informes de población
│   │   ├── seguridad/             #   2 informes de seguridad
│   │   └── resumen.json           #   Cuadro resumen de la Landing
│   └── reports/                   # Markdown narrativos por informe
│       ├── poblacion/
│       └── seguridad/
├── scripts/
│   ├── lib/indec-utils.cjs        # Helpers comunes (GBA24, lectura xlsx, formato)
│   ├── process-poblacion.cjs      # Pipeline de población (8 informes + resumen)
│   ├── process-seguridad.cjs      # Pipeline de seguridad (SNIC + SAT)
│   └── build-data.cjs             # Orquestador que llama a ambos
├── src/
│   ├── pages/
│   │   ├── Landing.tsx            # Hero + cuadro resumen + grids
│   │   └── ReportView.tsx         # Scrollytelling de cada informe
│   ├── components/
│   │   ├── charts/ChartRenderer.tsx     # Bar/line/pie/pyramid con Nivo
│   │   └── ui/                    # KPICounter, SectionReveal, IntroHero, ThemeToggle
│   ├── data/reportRegistry.ts     # Fuente de verdad: 10 informes
│   ├── types/report.ts            # Schema ReportData
│   ├── hooks/useReportData.ts     # Fetch + cache de JSONs
│   ├── store/useStore.ts          # Zustand — tema, sección activa
│   └── index.css                  # Design tokens + todos los estilos
├── CLAUDE.md                      # Convenciones para trabajar con Claude Code
├── LICENSE                        # MIT
├── README.md
├── package.json
├── tsconfig.json
├── vercel.json                    # SPA rewrites
└── vite.config.ts
```

---

## Stack técnico

- **Frontend**: React 19 + Vite 6 + TypeScript 5.7
- **Visualización**: Nivo 0.88 (bar/line/pie)
- **Routing**: React Router 7 (catch-all `/*` resuelto en el registry)
- **Estado**: Zustand (persistido en `localStorage`)
- **Markdown**: react-markdown + remark-gfm
- **Data pipeline**: Node CommonJS + SheetJS (`xlsx`) + papaparse
- **Deploy**: Vercel (SPA estática, sin funciones serverless)

---

## Contribuir

Issues y pull requests son bienvenidos. Para cambios grandes, abrí primero un issue para discutir la dirección.

### Convenciones

- Scripts del pipeline en CommonJS (`.cjs`), porque `package.json` declara `"type": "module"`.
- Prosa narrativa de los informes: tercera persona, sin interpretación sin respaldo del dato, sin secciones prescriptivas de política pública.
- Sin Tailwind, sin styled-components, sin CSS modules — todo el estilado vive en `src/index.css`.
- Alias `@/*` → `src/*` configurado en `tsconfig.json` y `vite.config.ts`.

Más detalles en [CLAUDE.md](CLAUDE.md).

### Reporte de issues

- **Dato incorrecto**: incluir fuente oficial + cuadro + fila donde el dato difiere.
- **Bug de UI**: navegador, sistema operativo, pasos para reproducir.
- **Sugerencia de informe nuevo**: describir el cuadro INDEC o dataset fuente, y el público al que sumaría valor.

---

## Licencia

[MIT](LICENSE) © 2026 Laboratorio Colossus.

Los datos subyacentes son de dominio público (INDEC, Ministerio de Seguridad de la Nación) y se pueden reutilizar según los términos de cada fuente.

---

## Créditos

- **Datos**: INDEC y Ministerio de Seguridad de la Nación.
- **Desarrollo**: [Colossus Lab](https://colossuslab.org).
- **Acceso a datos abiertos argentinos**: [OpenArg](https://www.openarg.org).
