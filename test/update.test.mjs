import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildPanel, classifyTicker, computeDates, parseBcra, pickPrice, updateData } from '../scripts/lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const prev = JSON.parse(readFileSync(join(ROOT, 'data.json'), 'utf8'));
const hol = JSON.parse(readFileSync(join(ROOT, 'config/holidays.json'), 'utf8'));
const holSet = new Set(hol.dates);

const CER = [
  { fecha: '2026-10-16', valor: 855 },
  { fecha: '2026-10-15', valor: 854.45861540882 },
];
const BADLAR = [{ fecha: '2026-10-01', valor: 23.1875 }];

// Filas con la forma real de data912 para cada instrumento, más relleno para pasar el chequeo de tamaño.
function rows(data, f = (ins, old) => ({ c: old.p * 1.001, pct_change: 0.1 })) {
  const out = [];
  for (const ins of data.instruments) {
    out.push({ symbol: ins.t, px_bid: 0, px_ask: 0, ...f(ins, data.prices[ins.t]) });
  }
  for (let i = 0; i < 120; i++) out.push({ symbol: `ZZ${i}`, c: 100, px_bid: 99, px_ask: 101, pct_change: 0 });
  return out;
}
const panelOf = (r) => buildPanel(r, []);
const FRI_CLOSE = new Date('2026-10-02T21:30:00Z'); // viernes 18:30 en Buenos Aires

test('fechas: viernes después del cierre', () => {
  assert.deepEqual(computeDates(FRI_CLOSE, holSet), { generated: '2026-10-02', asOf: '2026-10-02', settle: '2026-10-05' });
});
test('fechas: lunes antes del cierre usa el viernes', () => {
  const d = computeDates(new Date('2026-10-05T17:00:00Z'), holSet);
  assert.equal(d.asOf, '2026-10-02');
  assert.equal(d.settle, '2026-10-05');
});
test('fechas: el feriado del 12/10 se saltea en settle', () => {
  const d = computeDates(new Date('2026-10-09T21:30:00Z'), holSet);
  assert.equal(d.asOf, '2026-10-09');
  assert.equal(d.settle, '2026-10-13');
});
test('fechas: corrida en feriado no cuenta como cierre', () => {
  const d = computeDates(new Date('2026-10-12T21:30:00Z'), holSet);
  assert.equal(d.asOf, '2026-10-09');
  assert.equal(d.settle, '2026-10-13');
});

test('pickPrice', () => {
  assert.equal(pickPrice({ c: 5.5, px_bid: 1, px_ask: 2 }), 5.5);
  assert.equal(pickPrice({ c: 0, px_bid: 100, px_ask: 102 }), 101);
  assert.equal(pickPrice({ c: 0, px_bid: 100, px_ask: 0 }), 100);
  assert.equal(pickPrice({ c: 0, px_bid: 0, px_ask: 0 }), null);
  assert.equal(pickPrice(undefined), null);
});

test('classifyTicker: patrones del alcance y exclusiones', () => {
  const k = (s) => classifyTicker(s)?.kind ?? null;
  assert.equal(k('S29E7'), 'LECAP');
  assert.equal(k('T30J7'), 'BONCAP');
  assert.equal(k('X29E7'), 'LECER');
  assert.equal(k('TZXS7'), 'CER cero cupón');
  assert.equal(k('TZX27'), 'CER cero cupón');
  assert.equal(k('TMF27'), 'TAMAR');
  assert.equal(k('TTD26'), 'Dual');
  for (const s of ['AE38', 'AL30D', 'S29E7D', 'TXMJ8', 'TMVE8', 'GD30C']) assert.equal(k(s), null, s);
});

test('buildPanel rechaza paneles chicos o que no son arrays', () => {
  assert.throws(() => buildPanel([{ symbol: 'A' }], []), /chico/);
  assert.throws(() => buildPanel({}, []), /array/);
});

test('parseBcra ordena y valida', () => {
  const r = parseBcra({ results: [{ detalle: [{ fecha: '2026-10-13', valor: 1 }, { fecha: '2026-10-15', valor: 3 }] }] });
  assert.equal(r[0].fecha, '2026-10-15');
  assert.throws(() => parseBcra({ results: [] }), /sin detalle/);
  assert.throws(() => parseBcra({ results: [{ detalle: [{ fecha: 'x', valor: 1 }] }] }), /inválidos/);
});

test('updateData: actualización normal', () => {
  const { next, changed, report } = updateData(prev, { panel: panelOf(rows(prev)), cer: CER, badlar: BADLAR }, FRI_CLOSE, hol);
  assert.equal(changed, true);
  assert.equal(report.priceUpdates, prev.instruments.length);
  assert.equal(next.asOf, '2026-10-02');
  assert.equal(next.settle, '2026-10-05');
  assert.equal(next.cer.refDate, '2026-10-16');
  assert.equal(next.cer.dailyRate, Math.round((855 / 854.45861540882 - 1) * 1e8) / 1e8);
  assert.equal(next.badlar.tna, 23.1875);
  assert.equal(next.assumptions.reinvTna, 23.1875);
  assert.deepEqual(Object.keys(next), Object.keys(prev), 'conserva el orden de claves');
  assert.equal(next.prices.S30O6.p, prev.prices.S30O6.p * 1.001);
  assert.deepEqual(prev, JSON.parse(readFileSync(join(ROOT, 'data.json'), 'utf8')), 'no muta la entrada');
});

test('updateData: retira vencidos (vto <= settle)', () => {
  const now = new Date('2026-10-16T21:30:00Z'); // settle 2026-10-19
  const { next, report } = updateData(prev, { panel: panelOf(rows(prev)), cer: CER, badlar: BADLAR }, now, hol);
  assert.ok(report.retired.includes('S16O6'));
  assert.ok(!next.instruments.some((i) => i.t === 'S16O6'));
  assert.equal(next.prices.S16O6, undefined);
});

test('updateData: salto mayor a 15% conserva el precio anterior', () => {
  const r = rows(prev, (ins, old) => (ins.t === 'S30O6' ? { c: old.p * 1.5, pct_change: 50 } : { c: old.p * 1.001, pct_change: 0.1 }));
  const { next, report } = updateData(prev, { panel: panelOf(r), cer: CER, badlar: BADLAR }, FRI_CLOSE, hol);
  assert.equal(next.prices.S30O6.p, prev.prices.S30O6.p);
  assert.ok(report.warnings.some((w) => w.startsWith('S30O6')));
});

test('updateData: precios iguales a los publicados no generan cambios', () => {
  const r = rows(prev, (ins, old) => ({ c: old.p, pct_change: old.chg }));
  const { next, changed } = updateData(prev, { panel: panelOf(r), cer: CER, badlar: BADLAR }, FRI_CLOSE, hol);
  assert.equal(changed, false);
  assert.deepEqual(next, prev);
});

test('updateData: detecta tickers nuevos y los deja para revisión', () => {
  const r = rows(prev);
  r.push({ symbol: 'S27F7', c: 101, px_bid: 100, px_ask: 102, pct_change: 0.2 });
  r.push({ symbol: 'S27F7D', c: 0.9, px_bid: 0, px_ask: 0, pct_change: 0 });
  const { next, report } = updateData(prev, { panel: panelOf(r), cer: CER, badlar: BADLAR }, FRI_CLOSE, hol);
  assert.deepEqual(report.newTickers.map((n) => n.t), ['S27F7']);
  assert.ok(report.review.some((m) => m.includes('S27F7')));
  assert.ok(!next.instruments.some((i) => i.t === 'S27F7'), 'no lo agrega solo');
});

test('updateData: panel incompleto aborta', () => {
  const half = rows(prev).filter((r, i) => i % 2 === 0 || r.symbol.startsWith('ZZ'));
  assert.throws(() => updateData(prev, { panel: panelOf(half), cer: CER, badlar: BADLAR }, FRI_CLOSE, hol), /panel incompleto/);
});

test('updateData: BCRA caído conserva CER y BADLAR y avisa', () => {
  const { next, report } = updateData(prev, { panel: panelOf(rows(prev)), cer: null, badlar: null }, FRI_CLOSE, hol);
  assert.deepEqual(next.cer, prev.cer);
  assert.deepEqual(next.badlar, prev.badlar);
  assert.ok(report.warnings.some((w) => w.includes('CER')));
});

test('script de punta a punta con fixtures (dry-run)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'curva-'));
  const bcra = (id, detalle) => ({ status: 200, metadata: { resultset: { count: 1, offset: 0, limit: 3 } }, results: [{ idVariable: id, detalle }] });
  writeFileSync(join(dir, 'notes.json'), JSON.stringify(rows(prev)));
  writeFileSync(join(dir, 'bonds.json'), JSON.stringify([]));
  writeFileSync(join(dir, 'cer.json'), JSON.stringify(bcra(30, CER)));
  writeFileSync(join(dir, 'badlar.json'), JSON.stringify(bcra(7, BADLAR)));
  const run = (extra, now) => spawnSync('node', [join(ROOT, 'scripts/update.mjs'), ...extra], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, FIXTURE_DIR: dir, NOW: now },
  });
  const ok = run(['--dry-run'], FRI_CLOSE.toISOString());
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /datos actualizados/);
  const early = run(['--dry-run'], '2026-10-05T17:00:00Z');
  assert.equal(early.status, 0, early.stderr);
  assert.match(early.stdout, /Fuera de ventana/);
  assert.deepEqual(prev, JSON.parse(readFileSync(join(ROOT, 'data.json'), 'utf8')), 'dry-run no escribe');
});
