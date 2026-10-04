# Curva en Pesos

Página estática (`index.html` + `data.json`) con la curva de rendimientos de instrumentos en pesos, publicada en GitHub Pages. `data.json` lo actualiza `scripts/update.mjs` desde GitHub Actions.

Antes de tocar nada, leer `docs/RUNBOOK.md`: define qué hace el script, qué hace el agente, la jerarquía de fuentes y cómo reparar una fuente caída por PR.

- Flujo de cambios, carriles (tablero vs. sitio) y pruebas: `docs/WORKFLOW.md`. Estética y donaciones solo en `extras/`, ramas `site/…`.
- Tests: `npm test` (Node 20 o más, sin dependencias).
- Prueba en seco: `npm run update:dry`.
- `index.html` no se edita para actualizar datos; todo lo que cambia vive en `data.json`.
- Prueba en navegador: `npm run smoke` (y `npm run smoke:sin-extras`); requiere Playwright instalado aparte.
