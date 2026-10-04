// Lógica pura de la actualización de data.json (sin red ni disco, para poder testearla).
// Reglas heredadas de la tarea programada original de Claude; ver docs/RUNBOOK.md.

const DAY = 86400000;

export const toTs = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const toIso = (ts) => new Date(ts).toISOString().slice(0, 10);

export function isBusinessDay(iso, holidays) {
  const dow = new Date(toTs(iso)).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.has(iso);
}
export function nextBusinessDay(iso, holidays) {
  let t = toTs(iso) + DAY;
  while (!isBusinessDay(toIso(t), holidays)) t += DAY;
  return toIso(t);
}
export function prevBusinessDay(iso, holidays) {
  let t = toTs(iso) - DAY;
  while (!isBusinessDay(toIso(t), holidays)) t -= DAY;
  return toIso(t);
}

/** Fecha y hora actuales en Buenos Aires. */
export function baNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const g = (type) => parts.find((p) => p.type === type).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hour: Number(g('hour')) };
}

/** True si el mercado ya cerró en un día hábil (17:00 de Buenos Aires en adelante). */
export function marketClosedToday(now, holidays) {
  const { date, hour } = baNow(now);
  return hour >= 17 && isBusinessDay(date, holidays);
}

/** asOf = último día hábil con cierre; settle = siguiente día hábil (T+1); generated = hoy. */
export function computeDates(now, holidays) {
  const { date } = baNow(now);
  const asOf = marketClosedToday(now, holidays) ? date : prevBusinessDay(date, holidays);
  return { generated: date, asOf, settle: nextBusinessDay(asOf, holidays) };
}

/** Precio de una fila de data912: c; si es 0, punto medio bid/ask (o el lado que exista). */
export function pickPrice(row) {
  if (!row) return null;
  const c = Number(row.c);
  if (Number.isFinite(c) && c > 0) return c;
  const bid = Number(row.px_bid);
  const ask = Number(row.px_ask);
  if (bid > 0 && ask > 0) return Math.round(((bid + ask) / 2) * 10000) / 10000;
  if (bid > 0) return bid;
  if (ask > 0) return ask;
  return null;
}

const M = '[EFMAYJLGSOND]';
export const PATTERNS = [
  { re: new RegExp(`^S\\d{1,2}${M}\\d$`), fam: 'fixed', kind: 'LECAP' },
  { re: new RegExp(`^T\\d{1,2}${M}\\d$`), fam: 'fixed', kind: 'BONCAP' },
  { re: new RegExp(`^X\\d{1,2}${M}\\d$`), fam: 'cer', kind: 'LECER' },
  { re: new RegExp(`^TZX(${M}\\d|\\d{2})$`), fam: 'cer', kind: 'CER cero cupón' },
  { re: /^TM[A-Z]\d{2}$/, fam: 'var', kind: 'TAMAR' },
  { re: /^TT[A-Z]\d{2}$/, fam: 'var', kind: 'Dual' },
];

/** Clasifica un ticker según los patrones del alcance; null si no corresponde. */
export function classifyTicker(sym) {
  if (/[CD]$/.test(sym)) return null; // mismos bonos en dólares
  return PATTERNS.find((p) => p.re.test(sym)) ?? null;
}

/** Une los paneles notes y bonds en un Map symbol -> fila. */
export function buildPanel(notes, bonds) {
  if (!Array.isArray(notes) || !Array.isArray(bonds)) throw new Error('data912: respuesta que no es un array');
  const panel = new Map();
  for (const row of [...notes, ...bonds]) {
    if (row && typeof row.symbol === 'string' && !panel.has(row.symbol)) panel.set(row.symbol, row);
  }
  if (panel.size < 100) throw new Error(`data912: panel sospechosamente chico (${panel.size} símbolos)`);
  return panel;
}

/** Valida y ordena (más nueva primero) una serie de la API v4.0 del BCRA. */
export function parseBcra(json) {
  const det = json?.results?.[0]?.detalle;
  if (!Array.isArray(det) || det.length === 0) throw new Error('respuesta BCRA sin detalle');
  const rows = det.map((d) => ({ fecha: String(d.fecha), valor: Number(d.valor) }));
  if (rows.some((r) => !/^\d{4}-\d{2}-\d{2}$/.test(r.fecha) || !Number.isFinite(r.valor))) {
    throw new Error('respuesta BCRA con fechas o valores inválidos');
  }
  return rows.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
const MAX_JUMP = 0.15;

/**
 * Aplica la actualización mecánica. No agrega instrumentos nuevos ni toca supuestos de inflación:
 * eso requiere criterio y se reporta en report.review para que lo resuelva el agente.
 * @returns {{ next: object, changed: boolean, report: object }}
 */
export function updateData(prev, { panel, cer, badlar }, now, holidaysCfg) {
  const holidays = new Set(holidaysCfg.dates);
  const next = structuredClone(prev);
  const dates = computeDates(now, holidays);
  const report = { priceUpdates: 0, retired: [], warnings: [], review: [], newTickers: [], dates };

  // 1. Vencidos: vto <= settle
  const settle = dates.settle;
  next.instruments = next.instruments.filter((ins) => {
    if (ins.vto <= settle) {
      report.retired.push(ins.t);
      delete next.prices[ins.t];
      return false;
    }
    return true;
  });

  // 2. Precios
  let missing = 0;
  for (const ins of next.instruments) {
    const row = panel.get(ins.t);
    const p = pickPrice(row);
    const old = next.prices[ins.t];
    if (p == null) {
      missing++;
      report.warnings.push(`${ins.t}: sin precio en data912, se conserva el anterior`);
      continue;
    }
    if (old && Math.abs(p / old.p - 1) > MAX_JUMP) {
      report.warnings.push(`${ins.t}: variación mayor a 15% (${old.p} → ${p}), se conserva el anterior`);
      continue;
    }
    const chg = Number.isFinite(Number(row.pct_change)) ? Number(row.pct_change) : (old?.chg ?? 0);
    if (!old || old.p !== p || old.chg !== chg) report.priceUpdates++;
    next.prices[ins.t] = { p, chg };
  }
  if (next.instruments.length > 0 && missing / next.instruments.length > 0.3) {
    throw new Error(`faltan precios de ${missing} de ${next.instruments.length} instrumentos: panel incompleto, no se publica`);
  }

  // 3. Sin cambios de mercado (feriado no listado, mercado sin actualizar): no se publica nada.
  if (report.priceUpdates === 0 && report.retired.length === 0) {
    return { next: prev, changed: false, report };
  }

  // 4. Fechas, CER y BADLAR
  next.asOf = dates.asOf;
  next.settle = dates.settle;
  next.generated = dates.generated;
  // La página usa estos feriados para el rezago de 10 días hábiles del CER; basta desde 30 días antes de asOf.
  const since = toIso(toTs(dates.asOf) - 30 * DAY);
  next.feriados = holidaysCfg.dates.filter((d) => d >= since);
  if (cer && cer.length >= 2) {
    next.cer = {
      refDate: cer[0].fecha,
      refValue: cer[0].valor,
      dailyRate: round(cer[0].valor / cer[1].valor - 1, 8),
    };
  }
  if (badlar && badlar.length >= 1) {
    next.badlar = { tna: badlar[0].valor, fecha: badlar[0].fecha };
    next.assumptions.reinvTna = badlar[0].valor;
  }

  // 5. Cosas que requieren criterio: se reportan, no se resuelven acá.
  const known = new Set([...next.instruments.map((i) => i.t), ...(next.pendientes ?? []).map((p) => p.t)]);
  for (const [sym, row] of panel) {
    const cls = classifyTicker(sym);
    if (cls && !known.has(sym) && !report.retired.includes(sym)) {
      report.newTickers.push({ t: sym, fam: cls.fam, kind: cls.kind, p: pickPrice(row) });
    }
  }
  for (const n of report.newTickers) {
    report.review.push(`Instrumento nuevo sin cargar: ${n.t} (${n.kind}, precio ${n.p ?? 's/d'}). Resolver vto, VN o CER de emisión con fuentes oficiales.`);
  }
  for (const ins of next.instruments) {
    if (ins.fam === 'cer' && ins.emi == null) report.review.push(`${ins.t}: CER de emisión (emi) sin determinar.`);
  }
  const rem = /(\d{2})\/(\d{2})\/(\d{4})/.exec(next.assumptions?.inflFuente ?? '');
  if (rem) {
    const days = (toTs(dates.generated) - toTs(`${rem[3]}-${rem[2]}-${rem[1]}`)) / DAY;
    if (days > 35) report.review.push(`Inflación esperada desactualizada: REM del ${rem[0]} (${Math.round(days)} días). Buscar el REM más reciente.`);
  } else {
    report.review.push('assumptions.inflFuente no tiene fecha de REM reconocible.');
  }
  if (holidaysCfg.coverageThrough) {
    const left = (toTs(holidaysCfg.coverageThrough) - toTs(dates.generated)) / DAY;
    if (left < 45) report.review.push(`El calendario de feriados cubre hasta ${holidaysCfg.coverageThrough} (${Math.max(left, 0)} días): cargar los feriados siguientes desde fuente oficial.`);
  }
  if (!cer) report.warnings.push('CER del BCRA no disponible: se conserva el anterior');
  if (!badlar) report.warnings.push('BADLAR del BCRA no disponible: se conserva la anterior');

  return { next, changed: true, report };
}

export function renderReport(report, changed) {
  const L = [];
  L.push(`## Curva en Pesos: ${changed ? 'datos actualizados' : 'sin cambios'}`);
  L.push('');
  L.push(`- asOf ${report.dates.asOf}, settle ${report.dates.settle}`);
  L.push(`- Precios actualizados: ${report.priceUpdates}`);
  L.push(`- Retirados por vencimiento: ${report.retired.length ? report.retired.join(', ') : 'ninguno'}`);
  if (report.warnings.length) L.push('', '### Avisos', ...report.warnings.map((w) => `- ${w}`));
  if (report.review.length) L.push('', '### Requiere revisión', ...report.review.map((w) => `- ${w}`));
  return L.join('\n') + '\n';
}
