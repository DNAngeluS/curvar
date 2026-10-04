import { test } from 'node:test';
import assert from 'node:assert/strict';
import { laneViolations } from '../scripts/check-lanes.mjs';

test('carriles: site/* solo puede tocar archivos de sitio', () => {
  assert.deepEqual(laneViolations('site/boton-donar', ['extras/extras.css', 'extras/extras.js', 'README.md']), []);
  assert.deepEqual(laneViolations('site/boton-donar', ['extras/extras.js', 'index.html', 'data.json']), ['index.html', 'data.json']);
  assert.deepEqual(laneViolations('site/x', ['scripts/lib.mjs', '.github/workflows/update.yml']), ['scripts/lib.mjs', '.github/workflows/update.yml']);
});
test('carriles: las demás ramas no tienen restricción de la guarda', () => {
  assert.deepEqual(laneViolations('fix/fuente-bcra', ['scripts/lib.mjs', 'index.html']), []);
});
