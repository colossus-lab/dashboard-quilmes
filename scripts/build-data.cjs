/**
 * build-data.cjs
 *
 * Orquestador del pipeline de datos del Dashboard Quilmes.
 *
 * Estructura esperada (a medida que se sumen informes):
 *   1. process-<categoria>.cjs  → JSONs intermedios desde CSV/XLSX raw
 *   2. generate-report-data.cjs → data.json finales para scrollytelling + explorer
 *
 * Uso: node scripts/build-data.cjs
 *
 * Los processors aún no existen — se agregan a medida que se incorporan
 * fuentes de datos (ver CLAUDE.md § Pipeline de datos).
 */

const { execSync } = require("child_process");
const path = require("path");

const SCRIPTS_DIR = __dirname;

const PIPELINE = [
  "process-poblacion.cjs",
  "process-seguridad.cjs",
];

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║      Dashboard Quilmes — Data Build Pipeline              ║");
console.log("╚══════════════════════════════════════════════════════════╝");

if (PIPELINE.length === 0) {
  console.log("\n  ℹ  Pipeline vacío. Agregá processors en scripts/ y activalos en PIPELINE.\n");
  process.exit(0);
}

const start = Date.now();
let failed = 0;

for (const script of PIPELINE) {
  const scriptPath = path.join(SCRIPTS_DIR, script);
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Running: ${script}`);
  console.log("═".repeat(60));
  try {
    execSync(`node "${scriptPath}"`, { stdio: "inherit" });
  } catch (err) {
    console.error(`  ❌ FAILED: ${script}`);
    failed++;
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n${"═".repeat(60)}`);
if (failed === 0) {
  console.log(`  ✅ All ${PIPELINE.length} scripts completed in ${elapsed}s`);
} else {
  console.log(`  ⚠️  ${failed} script(s) failed out of ${PIPELINE.length} — ${elapsed}s`);
}
console.log("═".repeat(60));
