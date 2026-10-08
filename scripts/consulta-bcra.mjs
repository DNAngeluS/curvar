#!/usr/bin/env node
// Consulta una serie de la API de estadísticas del BCRA y la muestra en el log, en el resumen del job y como
// anotaciones (legibles por API). Sirve para que el agente obtenga valores del BCRA desde GitHub Actions,
// donde la API responde, en lugar de depender de su propia red.
// Uso: node scripts/consulta-bcra.mjs <cer|badlar|id> <desde YYYY-MM-DD> <hasta YYYY-MM-DD>
import { appendFile } from 'node:fs/promises';
import { annotation, parseBcra } from './lib.mjs';

const IDS = { cer: 30, badlar: 7 };
const [variable, desde, hasta] = process.argv.slice(2);
const id = IDS[String(variable).toLowerCase()] ?? Number(variable);
const iso = /^\d{4}-\d{2}-\d{2}$/;
if (!Number.isInteger(id) || id <= 0 || !iso.test(desde ?? '') || !iso.test(hasta ?? '') || desde > hasta) {
  console.error('Uso: node scripts/consulta-bcra.mjs <cer|badlar|id> <desde YYYY-MM-DD> <hasta YYYY-MM-DD>');
  process.exit(2);
}

const url = `https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/${id}?desde=${desde}&hasta=${hasta}&limit=1000`;
let json;
for (let i = 1; i <= 5; i++) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json', 'user-agent': 'curvar (github.com/DNAngeluS/curvar)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
    break;
  } catch (e) {
    if (i === 5) { console.error(`BCRA: ${e.message}`); process.exit(1); }
    await new Promise((r) => setTimeout(r, 5000 * i));
  }
}
const rows = parseBcra(json).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
const lines = rows.map((r) => `${r.fecha} ${r.valor}`);
console.log(`Variable ${id}, ${desde} a ${hasta}: ${rows.length} filas\n${lines.join('\n')}`);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### BCRA variable ${id}\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`);
if (process.env.GITHUB_ACTIONS === 'true') {
  const per = 8; // GitHub muestra hasta 10 anotaciones por tipo y por paso
  for (let i = 0; i < Math.min(lines.length, per * 10); i += per) {
    console.log(annotation('notice', `BCRA ${id} filas ${i + 1}-${Math.min(i + per, lines.length)} de ${lines.length}`, lines.slice(i, i + per).join(' | ')));
  }
  if (lines.length > per * 10) console.log(annotation('warning', 'BCRA', `Se muestran ${per * 10} de ${lines.length} filas: acotar el rango.`));
}
