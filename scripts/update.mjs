#!/usr/bin/env node
// Actualiza data.json con precios de data912 y CER/BADLAR del BCRA.
// Uso: node scripts/update.mjs [--dry-run] [--force]
//   --dry-run  calcula y muestra el reporte sin escribir data.json
//   --force    ignora el chequeo de horario (por defecto solo actualiza después de las 17:00 de Buenos Aires)
// Variables para pruebas offline: FIXTURE_DIR (lee <name>.json en vez de la red), NOW (fecha ISO simulada).

import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baNow, buildPanel, marketClosedToday, parseBcra, renderReport, updateData } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = {
  notes: 'https://data912.com/live/arg_notes',
  bonds: 'https://data912.com/live/arg_bonds',
  cer: 'https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/30?limit=3',
  badlar: 'https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/7?limit=1',
};

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run') || process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const force = args.has('--force') || process.env.FORCE === '1' || process.env.FORCE === 'true';

async function getJson(name, tries = 5) {
  if (process.env.FIXTURE_DIR) {
    return JSON.parse(await readFile(join(process.env.FIXTURE_DIR, `${name}.json`), 'utf8'));
  }
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(SOURCES[name], {
        signal: AbortSignal.timeout(20000),
        headers: { accept: 'application/json', 'user-agent': 'curvar (github.com/DNAngeluS/curvar)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      last = e;
      if (i < tries) await new Promise((r) => setTimeout(r, 5000 * i));
    }
  }
  throw new Error(`${name}: ${last?.cause?.code ?? last?.message ?? 'error desconocido'}`);
}

async function setOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

const prev = JSON.parse(await readFile(join(ROOT, 'data.json'), 'utf8'));
const holidaysCfg = JSON.parse(await readFile(join(ROOT, 'config/holidays.json'), 'utf8'));
const now = process.env.NOW ? new Date(process.env.NOW) : new Date();

if (!force && !marketClosedToday(now, new Set(holidaysCfg.dates))) {
  const { date, hour } = baNow(now);
  console.log(`Fuera de ventana: ${date} ${hour}:xx en Buenos Aires (solo se actualiza en día hábil después de las 17:00). Usar --force para saltearlo.`);
  await setOutput('changed', 'false');
  await setOutput('needs_review', 'false');
  process.exit(0);
}

// data912 es obligatorio: sin precios no hay nada que publicar (updateData lanza si el panel viene incompleto).
const [notes, bonds] = await Promise.all([getJson('notes'), getJson('bonds')]);
const panel = buildPanel(notes, bonds);

// BCRA es opcional: si falla se conservan CER y BADLAR anteriores y queda un aviso.
const bcraWarnings = [];
let cer = null;
let badlar = null;
try { cer = parseBcra(await getJson('cer')); } catch (e) { bcraWarnings.push(`CER BCRA: ${e.message}`); }
try { badlar = parseBcra(await getJson('badlar')); } catch (e) { bcraWarnings.push(`BADLAR BCRA: ${e.message}`); }

const { next, changed, report } = updateData(prev, { panel, cer, badlar }, now, holidaysCfg);
report.warnings.unshift(...bcraWarnings);

const text = renderReport(report, changed);
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text);

if (changed && !dryRun) {
  await writeFile(join(ROOT, 'data.json'), JSON.stringify(next, null, 2) + '\n');
}
const needsReview = report.review.length > 0 || report.warnings.length > 0;
if (needsReview) await writeFile(join(process.cwd(), 'review.md'), text);

await setOutput('changed', String(changed && !dryRun));
await setOutput('needs_review', String(needsReview));
