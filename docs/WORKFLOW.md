# Flujo de trabajo

Cómo se prueba y se cambia este repo sin poner en riesgo el tablero económico. Complementa a [`RUNBOOK.md`](RUNBOOK.md), que cubre la operación diaria de los datos.

## Dos carriles

| Carril | Qué es | Archivos | Rama | Riesgo |
|---|---|---|---|---|
| **Tablero** (`core`) | Cálculos, datos, fuentes, script y workflow de actualización | `index.html`, `data.json`, `scripts/`, `config/`, `test/`, `.github/workflows/`, `.github/rulesets/`, `package.json`, `docs/RUNBOOK.md` | `fix/…`, `feat/…`, `data/…` | Alto: lo que ve quien decide con la curva |
| **Sitio** (`site`) | Estética, donaciones, textos de presentación, SEO, íconos | `extras/`, `assets/`, `README.md`, `LICENSE` | `site/…` | Bajo: no toca cálculos ni datos |

`index.html` solo tiene tres puntos de enganche para el carril de sitio: `extras/extras.css`, `extras/extras.js` y el contenedor `#extras` del pie. Todo lo demás de la estética se hace desde esos archivos, con clases propias (prefijo `x-`) y dentro de `try/catch`. Si `extras/` falla o no carga, el tablero anda igual (`npm run smoke:sin-extras` lo comprueba).

Si un cambio estético necesita tocar `index.html` (por ejemplo, reordenar el encabezado), no es del carril de sitio: va en una rama `feat/…` con PR propio y pasa por el control del tablero.

## Reglas

1. **`main` es lo publicado.** Cada commit a `main` se despliega. Nada se pushea directo salvo `data.json` por el bot de Actions o a mano (RUNBOOK, "Si falló una fuente", punto 6).
2. **Todo cambio entra por PR**, de a un carril por PR. La guarda de CI (`scripts/check-lanes.mjs`) rechaza una rama `site/…` que toque archivos del tablero.
3. **CI debe estar en verde**: `npm test` (script, forma de `data.json`, carriles) y el armado del sitio.
4. **Antes de pedir el merge**, quien cambia el tablero corre la prueba de humo en navegador (`npm run smoke`) y compara contra comparatasas.ar según el RUNBOOK. El PR resume qué cambió y qué evidencia hay.
5. **Cambios en `index.html` que alteren un número** (cálculo, convención, fórmula) llevan explicación en el PR de qué cambia y por qué, y un caso verificable contra una fuente externa.
6. **Los extras no pueden ensuciar el tablero**: sin scripts de terceros que lean datos, sin pop-ups encima de la tabla, sin analítica que no esté descripta en el README. Los botones de donación quedan en el pie.
7. **`update.yml` es el pipeline de publicación**: el agente puede proponer cambios, pero van siempre por PR y los mergea el dueño; nunca se pushean directo a `main`.

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
| Reparar una fuente caída | abre `curva-fallo` | ✔ PR `fix/…` | revisa y mergea |
| Funcionalidad nueva | | ✔ PR `feat/…` / `site/…` | decide y mergea |
| `.github/workflows/update.yml` | | ✔ PR con el cambio | revisa y mergea |
| Publicar / revertir | despliega al mergear | | ✔ `git revert` del commit en `main` |

## Revertir

Si algo malo llegó a `main`: `git revert <commit>` y push. `update.yml` redespliega. Un fallo en `extras/` se resuelve con revertir ese único commit del carril de sitio, sin tocar datos.

## Protección de `main` (rulesets)

En `.github/rulesets/` hay dos reglas listas para importar en **Settings → Rules → Rulesets → New ruleset → Import a ruleset**:

| Archivo | Qué hace | Cuándo |
|---|---|---|
| `main-basico.json` | Impide borrar `main` y el force-push. No afecta al bot diario. | Ya. |
| `main-con-pr.json` | Exige PR y el check `tablero` de CI; el rol admin puede saltearlo. | Solo después de resolver el bot (abajo). |

**Por qué no va todo junto:** `update.yml` hace `git push` a `main` con el `GITHUB_TOKEN` de Actions, que no se puede poner como excepción de un ruleset. Con `main-con-pr.json` activo, la actualización diaria fallaría. Hay dos salidas: (a) que el job use un token de un administrador (secreto con un PAT de alcance mínimo en este repo) o una GitHub App con bypass, o (b) que el bot publique `data.json` por PR con auto-merge. Cualquiera es un cambio a `update.yml`, por PR.
