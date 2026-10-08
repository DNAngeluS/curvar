# Runbook del agente

Guía para el agente de Claude (o cualquier persona) que mantiene este repo. La parte mecánica la hace el script en GitHub Actions; acá está lo que requiere criterio.

## Reparto de trabajo

| Quién | Qué |
|---|---|
| `scripts/update.mjs` (Actions, lun a vie 18:07 Buenos Aires; GitHub puede demorarla horas) | Precios de data912, CER y BADLAR del BCRA, fechas `asOf` / `settle`, retiro de vencidos, detección de tickers nuevos, validaciones. |
| Agente | Instrumentos nuevos, REM mensual, feriados, reparar el script si una fuente cambió, controlar que la corrida diaria haya salido bien. |

El script **no** agrega instrumentos ni toca la inflación esperada: los reporta en el issue `curva-revision`.

## Rutina diaria (después de la corrida de Actions; si no salió, dispararla con `gh workflow run update.yml`)

1. `gh run list --workflow update.yml --limit 3`. Si la última corrida de hoy no está en `success`, ir a "Si falló una fuente".
2. `gh issue list --label curva-revision --state open` y `--label curva-fallo`. Resolver lo que haya y cerrar el issue con un comentario de lo hecho.
3. Si la corrida está en `success` pero `data.json` no cambió en `main`, mirar `gh pr list --head data/auto`: el bot publica por PR y un PR abierto significa que no se pudo mergear (ver el log del paso "Publicar data.json por PR").
4. Si el workflow aparece deshabilitado (GitHub desactiva los programados tras 60 días sin actividad en repos públicos), reactivarlo con `gh workflow enable update.yml`.

## Reglas de trabajo

- Los datos los busca el agente, siempre. Nunca dejar un dato "para que lo complete el dueño". Solo si después de buscar en al menos tres fuentes distintas no aparece, va a `pendientes` en `data.json` con el detalle de dónde se buscó.
- Jerarquía de fuentes, de más a menos confiable:
  1. Oficiales: Secretaría de Finanzas / Ministerio de Economía (argentina.gob.ar: llamados y resultados de licitación, Resoluciones Conjuntas, Boletín Oficial), BCRA (API de Estadísticas, REM).
  2. Mercado regulado: BYMA, MAE, data912 (replica BYMA).
  3. Portales y agentes reconocidos: bonistas.com, comparatasas.ar, compararbonos.com.ar, IAMC, Boston Asset Management, Docta, Rava, casas de bolsa.
- Un dato de oficio (fecha de emisión, vencimiento, VN) se toma de (1) y se contrasta con (3). Si solo hay una fuente de nivel 3, buscar una segunda independiente. Si dos fuentes discrepan, prevalece la oficial.
- Una fuente nueva debe ser un organismo oficial, un mercado regulado o una entidad reconocida (no blogs, foros ni sitios sin datos verificables) y se agrega a `data.json.sources` como `{n, u, uso}`.
- Los resúmenes automáticos de WebFetch pueden equivocarse: para fechas y valores clave pedir la cita textual y contrastar con otra fuente.

## Instrumentos nuevos (issue "Instrumento nuevo sin cargar")

Resolver los parámetros siguiendo la jerarquía de fuentes (resolución y licitación en argentina.gob.ar; después `bonistas.com/bono-cotizacion-rendimiento-precio-hoy/<TICKER>`, `comparatasas.ar`, `compararbonos.com.ar/bonos/<TICKER>`) y agregarlo a `instruments` y `prices` de `data.json`.

- **LECAP / BONCAP** (`fam: "fixed"`): `t`, `kind`, `vto`, `vn` (valor al vencimiento por 100 VN). Si de verdad no aparece, estimarlo desde la TIR publicada: `vn = precio × (1 + TIR)^(días hasta vto desde settle / 365)` y marcar `est: true`.
- **Bonos CER** (`fam: "cer"`): `emiIssue` = fecha de emisión oficial; `emiCerDate` = `emiIssue` menos 10 días hábiles (sin sábados, domingos, feriados ni días no laborables; usar `config/holidays.json`); `emi` = CER (variable 30 de la API del BCRA) en `emiCerDate`. Si es una reapertura, usar el `emi` de la emisión original. Traer el CER de una fecha con `https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/30?desde=<fecha-3d>&hasta=<fecha+3d>&limit=10` y verificar que las fechas devueltas coincidan.
- **TAMAR y duales** (`fam: "var"`): alcanza con `t`, `kind`, `vto`.
- No se agregan los bonos CER con cupón (prefijos TXM, TX26, TX28, TX31) ni los dólar linked (TZV). Si algo no encaja, investigar qué es y, si está fuera de alcance, ponerlo en `pendientes` con motivo.
- Revisar también los `pendientes` existentes: si ahora se pueden resolver, pasarlos a `instruments`.

Control de calidad antes de mergear: para al menos tres bonos CER nuevos o con `emi` recién cargado, comparar la TIR real de la página con la de comparatasas.ar/bonos-cer. Hasta ~0,3 puntos en letras cortas es normal por convenciones de liquidación; más de 1 punto implica revisar `emi` y fecha de emisión.

## Mensual: inflación esperada

Después de la publicación del REM del BCRA (primeros días hábiles del mes), buscar la mediana de inflación mensual esperada para el mes siguiente y actualizar `assumptions.inflMensual` (número, en %) y `assumptions.inflFuente` (texto corto con fuente y fecha, formato `dd/mm/aaaa`; el script usa esa fecha para avisar cuando pasan 35 días).

## Anual: feriados

`config/holidays.json` tiene `coverageThrough`; el script abre un issue 45 días antes. Cargar los feriados nacionales y los días no laborables con fines turísticos desde fuente oficial (Boletín Oficial o argentina.gob.ar). Quedan pendientes de confirmar los feriados trasladables de junio a noviembre de 2027.

## Si falló una fuente

1. Leer el log: `gh run view <id> --log-failed`.
2. Reproducir en local: `npm run update:dry` (necesita red a data912 y BCRA).
3. Corregir `scripts/lib.mjs` o `scripts/update.mjs`, agregar un test que cubra el caso y correr `npm test`.
4. Abrir un PR en una rama (`git switch -c fix/<tema>`) con la causa y la evidencia. No pushear a `main` cambios al script. Los cambios a `.github/workflows/update.yml` también van por PR y los mergea el dueño.
5. Nunca desactivar la verificación TLS. Si una fuente tiene un problema de certificado, documentarlo en el issue y buscar una fuente alternativa.
6. Mientras el script no funcione, el agente puede actualizar `data.json` a mano siguiendo las reglas de arriba, en una rama `data/<tema>` que cambie solo ese archivo, y pedir el merge por PR. No hay push directo a `main`: lo bloquea el ruleset.

## Límites

- Cualquier cambio de código o de la página sigue el flujo de [`WORKFLOW.md`](WORKFLOW.md) (PR, carriles, CI).

- No modificar los cálculos de `index.html` sin un PR y una explicación. La página es informativa, no una recomendación de inversión.
- No poner tokens, claves ni datos personales en el repo (es público).
