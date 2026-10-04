import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(ROOT, 'data.json'), 'utf8'));
const iso = /^\d{4}-\d{2}-\d{2}$/;

test('data.json: forma que espera index.html', () => {
  for (const k of ['asOf', 'settle', 'generated']) assert.match(data[k], iso, k);
  assert.ok(data.badlar.tna > 0 && iso.test(data.badlar.fecha));
  assert.ok(data.cer.refValue > 0 && data.cer.dailyRate > 0 && iso.test(data.cer.refDate));
  assert.ok(data.assumptions.inflMensual > 0 && data.assumptions.reinvTna > 0 && data.assumptions.inflFuente);
  assert.ok(Array.isArray(data.feriados) && data.feriados.every((f) => iso.test(f)), 'feriados (rezago del CER)');
  assert.ok(Array.isArray(data.sources) && data.sources.every((s) => s.n && s.u && s.uso));
});

test('data.json: cada instrumento tiene precio y los campos de su familia', () => {
  const seen = new Set();
  for (const i of data.instruments) {
    assert.ok(!seen.has(i.t), `duplicado ${i.t}`);
    seen.add(i.t);
    assert.match(i.vto, iso, i.t);
    assert.ok(data.prices[i.t]?.p > 0, `${i.t} sin precio`);
    assert.ok(['fixed', 'cer', 'var'].includes(i.fam), `${i.t}: fam ${i.fam}`);
    if (i.fam === 'fixed') assert.ok(i.vn > 0, `${i.t} sin vn`);
    if (i.fam === 'cer' && i.emi != null) assert.ok(i.emi > 0, `${i.t} emi inválido`);
  }
  for (const t of Object.keys(data.prices)) assert.ok(seen.has(t), `precio huérfano ${t}`);
});
