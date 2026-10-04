// Prueba de humo en navegador real: abre la página, recorre las pestañas y falla ante cualquier error de JS.
// No es dependencia del repo: la usa el agente (o una persona) con Playwright instalado.
//   node scripts/smoke.mjs                 # extras activados (como en producción)
//   node scripts/smoke.mjs --sin-extras    # bloquea extras/: el tablero tiene que andar igual
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sinExtras = process.argv.includes('--sin-extras');
const TYPES = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };

const server = createServer(async (req, res) => {
  try {
    const path = req.url.split('?')[0];
    const body = await readFile(join(ROOT, path === '/' ? 'index.html' : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path === '/' ? 'index.html' : path)] ?? 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const { chromium } = await import('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route(/fonts\.g|cafecito\.app/, (r) => r.abort());
if (sinExtras) await page.route('**/extras/**', (r) => r.abort());
await page.goto(url);
await page.waitForSelector('#tb-fija table');
for (const [tab, sel] of [['#tab-cer', '#tb-cer table'], ['#tab-tamar', '#tb-var table'], ['#tab-rank', '#rank-top table']]) {
  await page.click(tab);
  await page.waitForSelector(sel);
}
const rows = await page.locator('#tb-cer tbody tr').count();
await browser.close();
server.close();
if (errors.length || rows === 0) {
  console.error('Smoke FALLÓ', { errors, filasCER: rows });
  process.exit(1);
}
console.log(`Smoke OK (${sinExtras ? 'sin extras' : 'con extras'}): ${rows} filas CER, sin errores de JS.`);
