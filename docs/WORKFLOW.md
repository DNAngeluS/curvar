# Flujo de trabajo

Cómo se prueba y se cambia este repo sin poner en riesgo el tablero económico. Complementa a [`RUNBOOK.md`](RUNBOOK.md), que cubre la operación diaria de los datos.

## Dos carriles

| Carril | Qué es | Archivos | Rama | Riesgo |
|---|---|---|---|---|
| **Tablero** (`core`) | Cálculos, datos, fuentes, script y workflow de actualización | `index.html`, `data.json`, `scripts/`, `config/`, `test/`, `.github/workflows/`, `.github/rulesets/`, `.github/ISSUE_TEMPLATE/`, `package.json`, `docs/RUNBOOK.md` | `fix/…`, `feat/…`, `data/…` | Alto: lo que ve quien decide con la curva |
| **Sitio** (`site`) | Estética, donaciones, textos de presentación, SEO, íconos | `extras/`, `assets/`, `README.md`, `LICENSE` | `site/…` | Bajo: no toca cálculos ni datos |

`index.html` solo tiene tres puntos de enganche para el carril de sitio: `extras/extras.css`, `extras/extras.js` y el contenedor `#extras` del pie. Todo lo demás de la estética se hace desde esos archivos, con clases propias (prefijo `x-`) y dentro de `try/catch`. Si `extras/` falla o no carga, el tablero anda igual (`npm run smoke:sin-extras` lo comprueba).

Si un cambio estético necesita tocar `index.html` (por ejemplo, reordenar el encabezado), no es del carril de sitio: va en una rama `feat/…` con PR propio y pasa por el control del tablero.

## Reglas

1. **`main` es lo publicado.** Cada commit a `main` se despliega. Con `main-con-pr.json` activo nada se pushea directo: el bot de Actions publica `data.json` por PR (rama `data/auto`) y lo mergea solo; a mano, también por PR (RUNBOOK, "Si falló una fuente", punto 6).
2. **Todo cambio entra por PR**, de a un carril por PR. La guarda de CI (`scripts/check-lanes.mjs`) rechaza una rama `site/…` que toque archivos del tablero.
3. **CI debe estar en verde**: `npm test` (script, forma de `data.json`, carriles) y el armado del sitio.
4. **Antes de pedir el merge**, quien cambia el tablero corre la prueba de humo en navegador (`npm run smoke`) y compara contra comparatasas.ar según el RUNBOOK. El PR resume qué cambió y qué evidencia hay.
5. **Cambios en `index.html` que alteren un número** (cálculo, convención, fórmula) llevan explicación en el PR de qué cambia y por qué, y un caso verificable contra una fuente externa.
6. **Los extras no pueden ensuciar el tablero**: sin scripts de terceros que lean datos, sin pop-ups encima de la tabla, sin analítica que no esté descripta en el README. Los botones de donación quedan en el pie.
7. **`update.yml` es el pipeline de publicación**: los cambios van siempre por PR, se prueban con una corrida manual desde la rama y nunca se pushean directo a `main`.

## Ciclo de un cambio

```
git switch -c <carril>/<tema>      # fix/fuente-bcra · feat/tean-cer · site/boton-donar
… cambios …
npm test                           # obligatorio
npm run smoke                      # si tocó index.html, data.json o extras/
git push -u origin <rama> → PR a main
CI verde + revisión → merge → update.yml despliega solo
```

### Probar

| Qué | Cómo |
|---|---|
| Lógica del script | `npm test` (sin red) y `npm run update:dry` (con red, no escribe) |
| Forma de `data.json` | `npm test` (`test/data.test.mjs`) |
| Página completa en navegador | `npm run smoke` (necesita Playwright instalado; no es dependencia del repo) |
| Que el tablero no dependa de los extras | `npm run smoke:sin-extras` |
| Vista a ojo | `npx serve .` y abrir `http://localhost:3000` |

### Incorporar funcionalidad nueva

- **Económica** (una pestaña, una métrica, un instrumento): `feat/…`, con test en `test/` si toca el script y con la fuente anotada en `data.json.sources`.
- **De presentación** (tema, botón, página de "acerca de"): `site/…`. Si hace falta un nuevo punto de enganche, se agrega primero en un PR `feat/…` mínimo y después se usa.
- **Ideas que aún no se sabe dónde caen**: abrir un issue con la etiqueta `idea`; el agente propone el carril antes de implementar.

## Quién hace qué

| | Actions | Agente de Claude | Persona (dueño) |
|---|---|---|---|
| Precios, CER, BADLAR, fechas, vencidos | ✔ diario | controla | |
| Instrumentos nuevos, REM, feriados | reporta en issue | ✔ resuelve (RUNBOOK) | |
| Reparar una fuente caída | abre `curva-fallo` | ✔ PR `fix/…` y merge | |
| Funcionalidad nueva | | ✔ PR `feat/…` / `site/…` | decide; mergea el agente salvo que se desarrolle en conjunto |
| `.github/workflows/` | | ✔ PR, prueba y merge | |
| Publicar / revertir | despliega al mergear | | ✔ `git revert` del commit en `main` |

## Revertir

Si algo malo llegó a `main`: `git revert <commit>` y push. `update.yml` redespliega. Un fallo en `extras/` se resuelve con revertir ese único commit del carril de sitio, sin tocar datos.

## Protección de `main` (rulesets)

En `.github/rulesets/` hay dos reglas listas para importar en **Settings → Rules → Rulesets → New ruleset → Import a ruleset**:

| Archivo | Qué hace | Cuándo |
|---|---|---|
| `main-basico.json` | Impide borrar `main` y el force-push. | Redundante si está activo `main-con-pr.json` (incluye lo mismo). |
| `main-con-pr.json` | Exige PR y el check `tablero` de CI; el rol admin puede saltearlo. | **Activo desde el 04/10/2026.** La primera prueba del bot por PR es la corrida programada del lunes 05/10 (la manual del 04/10 no tuvo cambios de precios y salteó ese paso). |

**Cómo publica el bot con `main-con-pr.json` activo:** `update.yml` sube `data.json` a la rama `data/auto`, abre un PR y mergea con squash. Los PR creados con `GITHUB_TOKEN` no disparan `ci.yml`, así que el job reporta él mismo el estado `tablero` en verde, después de correr los tests y de que el script validó los datos. Requisitos en **Settings → Actions → General**: *Workflow permissions* en lectura y escritura, y tildado *Allow GitHub Actions to create and approve pull requests*. Si una actualización queda sin mergear, el PR `data/auto` queda abierto y la siguiente corrida lo reutiliza. El automerge vale solo para el `data.json` que genera el script; código, página y workflows nunca se automergean.
