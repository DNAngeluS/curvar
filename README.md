# Curva en Pesos

Curva de rendimientos de instrumentos en pesos del Tesoro argentino: LECAP, BONCAP, bonos CER, TAMAR y duales. Incluye una pestaña "Mejor por plazo" que compara qué instrumento rinde más a 1, 2, 3 y 6 meses con supuestos editables.

Página: https://dnangelus.ar/curvar/

> Material informativo. No es una recomendación de inversión.

## Cómo funciona

```
GitHub Actions (lun a vie, 18:30 Buenos Aires)
  └─ scripts/update.mjs ── data912 (precios) + API del BCRA (CER, BADLAR)
       └─ data.json  ──►  PR automático  ──►  GitHub Pages (index.html + data.json)
```

- `index.html` es una página estática sin build. Al abrirse lee `data.json` y calcula TIR, TNA, TEA y TEM en el navegador.
- `data.json` es lo único que cambia día a día: precios, CER, BADLAR, instrumentos vigentes, fechas y supuestos.
- `scripts/update.mjs` (Node 20 o más, sin dependencias) actualiza lo mecánico. Solo corre después de las 17:00 de Buenos Aires en día hábil, y si los precios no cambiaron no hace commit.
- Lo que requiere criterio (instrumentos nuevos, inflación esperada del REM, feriados) lo reporta en un issue con la etiqueta `curva-revision`. Lo resuelve el agente de Claude siguiendo [`docs/RUNBOOK.md`](docs/RUNBOOK.md).
- Si una fuente falla, el script no publica datos dudosos: conserva el último `data.json` bueno y abre un issue `curva-fallo`.

## Validaciones del script

- Un precio que cambia más de 15% o llega en cero se descarta y se conserva el anterior.
- Si faltan precios de más del 30% de los instrumentos, la corrida falla sin publicar.
- Si el BCRA no responde, se conservan CER y BADLAR anteriores y queda un aviso.
- Los vencidos (`vto` menor o igual a la fecha de liquidación T+1) se retiran solos.

## Uso local

```bash
npm test                 # sin red: script, forma de data.json y guarda de carriles
npm run update:dry       # calcula y muestra el reporte sin escribir data.json (requiere red)
node scripts/update.mjs --force   # actualiza data.json fuera de horario
npx serve .              # ver la página en local (o cualquier servidor estático)
```

Para probar offline: `FIXTURE_DIR=<carpeta con notes.json, bonds.json, cer.json, badlar.json> NOW=2026-10-02T21:30:00Z node scripts/update.mjs --dry-run`.

## Cómo se trabaja

El tablero económico y lo cosmético (estética, donaciones) van en carriles separados, con ramas y controles distintos: ver [`docs/WORKFLOW.md`](docs/WORKFLOW.md).

## Puesta en marcha (una vez)

1. En GitHub: **Settings → Pages → Source: GitHub Actions**.
2. En **Actions**, correr "Actualizar datos y publicar" a mano con `dry_run` para validar las fuentes desde un runner de GitHub, y después una vez sin `dry_run` (con `force` si es fuera de horario).
3. No hacen falta secretos: data912 y la API del BCRA no piden clave, y la actualización diaria usa el `GITHUB_TOKEN` automático del workflow (publica `data.json` por PR; ver `docs/WORKFLOW.md`).

## Fuentes

Precios: [data912](https://data912.com) (panel BYMA). CER y BADLAR: [API de Estadísticas del BCRA](https://www.bcra.gob.ar/en/central-bank-api-catalog/). Vencimientos y fechas de emisión: Secretaría de Finanzas. Inflación esperada: REM del BCRA. La lista completa con su uso está en `data.json` (`sources`) y se muestra al pie de la página.

## Licencia

[MIT](LICENSE). Los datos de mercado pertenecen a sus fuentes (BYMA vía data912, BCRA, Secretaría de Finanzas).
