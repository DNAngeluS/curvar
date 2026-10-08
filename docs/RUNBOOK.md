# Runbook del agente

Guía para el agente de Claude (o cualquier persona) que mantiene este repo. La parte mecánica la hace el script en GitHub Actions; acá está lo que requiere criterio.

## Reparto de trabajo

| Quién | Qué |
|---|---|
| `scripts/update.mjs` (Actions, lun a vie 18:07 Buenos Aires; GitHub puede demorarla horas) | Precios de data912, CER y BADLAR del BCRA, fechas `asOf` / `settle`, retiro de vencidos, detección de tickers nuevos, validaciones (incluye contrastar cada `emi` con el CER oficial del BCRA). Publica `data.json` por PR y despliega. |
| Agente de Claude (tarea programada, lun a vie 23:30 Buenos Aires) | Controla que la corrida haya salido bien (si no, la dispara), lee lo que reportó el script, resuelve lo que requiere criterio (instrumentos nuevos, pendientes, `emi`, REM, feriados, fuentes caídas), contrasta contra comparatasas, abre y mergea los PR necesarios y deja la bitácora. |

El script **no** agrega instrumentos ni toca la inflación esperada: los reporta en el issue `curva-revision`.

## Rutina diaria del agente

La sesión del agente puede no tener salida de red a data912 ni al BCRA. Todo lo que necesite de esas fuentes lo trae GitHub Actions (ver "BCRA desde Actions"). Los comandos `gh issue list` y `gh pr list` usan GraphQL y no andan en la sesión: usar `gh api repos/DNAngeluS/curvar/...`.

0. Preparar: adjuntar el repo con `add_repo` (acceso push), clonar en `/home/claude/curvar`, leer `CLAUDE.md` y este runbook.
1. Estado de la corrida: `gh run list -R DNAngeluS/curvar --workflow update.yml --limit 3`. Si en un día hábil no hay una corrida `success` posterior a las 17:00 de Buenos Aires, dispararla con `gh workflow run update.yml -R DNAngeluS/curvar` y esperarla (hasta 10 minutos). Si falla, ir a "Si falló una fuente". Si el workflow está deshabilitado (GitHub desactiva los programados tras 60 días sin actividad), `gh workflow enable update.yml`.
2. Leer lo que reportó el script: las anotaciones del job `update` (`gh api repos/DNAngeluS/curvar/actions/runs/<run>/jobs` para el id del job y `gh api repos/DNAngeluS/curvar/check-runs/<id>/annotations`; los logs no se pueden bajar desde la sesión) y los issues abiertos con etiqueta `curva-revision` y `curva-fallo` (`gh api 'repos/DNAngeluS/curvar/issues?labels=curva-revision&state=open'`).
3. Resolver cada punto con la jerarquía de fuentes (instrumentos nuevos, `pendientes`, `emi` que no coincide, precios conservados, REM, feriados). Contrastar la TIR real de los bonos CER con comparatasas.ar/bonos-cer: hasta ~0,15 puntos es normal; más de 0,5 puntos implica revisar precio, `emi` y fecha de emisión.
4. Aplicar los cambios en una rama (`data/<tema>` si solo cambia `data.json` o `config/`, `fix/<tema>` si cambia el script o los workflows), con `npm test` en verde. Abrir el PR con `gh api repos/DNAngeluS/curvar/pulls`, esperar el check `tablero` y mergear con squash (`gh api -X PUT repos/DNAngeluS/curvar/pulls/<n>/merge -f merge_method=squash`). Los merges los hace el agente salvo que se esté desarrollando algo en conjunto con el dueño. Un cambio en `.github/workflows/` se prueba antes con una corrida manual desde la rama (`gh workflow run update.yml --ref <rama> -f dry_run=true -f force=true`) y, después del merge, con una corrida real en `main` para comprobar el deploy.
5. Cerrar con un comentario en los issues de `curva-revision` o `curva-fallo` que se resolvieron (qué se hizo y con qué fuente) y cerrarlos.
6. Bitácora: un comentario de tres líneas en el issue con etiqueta `bitacora` (`gh api 'repos/DNAngeluS/curvar/issues?labels=bitacora'`): qué se revisó, qué cambió (PR) y qué quedó sin resolver y por qué. Si algo no se pudo resolver o la sesión no pudo operar el repo, dejarlo escrito igual.

## BCRA desde Actions

La API del BCRA responde desde los runners de GitHub, pero no necesariamente desde la sesión del agente (el proxy de salida de la sesión la rechaza) ni desde `WebFetch` en corridas sin supervisión (rechaza URLs que no estaban en el pedido). No depender de ninguna de las dos.

- **Diario**: `update.mjs` trae CER y BADLAR y verifica cada `emi` contra la serie oficial. Si el BCRA falla, queda un aviso en las anotaciones y se conservan los valores anteriores.
- **A pedido**: el workflow `Consulta BCRA` (`consulta-bcra.yml`) trae cualquier serie en un rango de fechas. Ejemplo: `gh workflow run consulta-bcra.yml -R DNAngeluS/curvar -f variable=cer -f desde=2026-03-10 -f hasta=2026-03-20`. Los valores quedan en las anotaciones del job (ocho filas por anotación) y en el resumen del job.
- Un BADLAR cuya `fecha` tiene más de 3 días hábiles de atraso respecto de `asOf` es una señal de que algo falla: investigarlo.

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
4. Abrir un PR en una rama (`git switch -c fix/<tema>`) con la causa y la evidencia. No pushear a `main` cambios al script. Los cambios a `.github/workflows/update.yml` también van por PR; los mergea el agente después de probarlos (ver la rutina diaria, punto 4).
5. Nunca desactivar la verificación TLS. Si una fuente tiene un problema de certificado, documentarlo en el issue y buscar una fuente alternativa.
6. Mientras el script no funcione, el agente puede actualizar `data.json` a mano siguiendo las reglas de arriba, en una rama `data/<tema>` que cambie solo ese archivo, por PR. No hay push directo a `main`: lo bloquea el ruleset.

## Límites

- Cualquier cambio de código o de la página sigue el flujo de [`WORKFLOW.md`](WORKFLOW.md) (PR, carriles, CI).

- No modificar los cálculos de `index.html` sin un PR y una explicación. La página es informativa, no una recomendación de inversión.
- No poner tokens, claves ni datos personales en el repo (es público).
