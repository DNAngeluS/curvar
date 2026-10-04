// Guarda de carriles: una rama `site/*` solo puede tocar archivos del carril de sitio.
// Uso: node scripts/check-lanes.mjs <rama> <ref-base>   (en CI: la rama del PR y origin/main)
import { execFileSync } from 'node:child_process';

export const SITE_PATHS = ['extras/', 'assets/', 'README.md', 'LICENSE'];

export function laneViolations(branch, files) {
  if (!branch.startsWith('site/')) return [];
  return files.filter((f) => !SITE_PATHS.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [branch, base] = process.argv.slice(2);
  if (!branch || !base) {
    console.error('Uso: node scripts/check-lanes.mjs <rama> <ref-base>');
    process.exit(2);
  }
  const files = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const bad = laneViolations(branch, files);
  if (bad.length) {
    console.error(`La rama ${branch} es del carril "site" pero toca archivos del tablero:\n${bad.map((f) => `  - ${f}`).join('\n')}\nMové esos cambios a una rama fix/ o feat/ con PR propio.`);
    process.exit(1);
  }
  console.log(`Carriles OK (${files.length} archivos, rama ${branch}).`);
}
