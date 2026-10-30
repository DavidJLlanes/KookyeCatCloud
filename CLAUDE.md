# KookyeCatCloud: convenciones del repositorio

Node 20 + Express 4 + JS vanilla (PWA). Respuestas al usuario en español, breves. `npm run check` y `npm test` (pruebas de humo en `tests/smoke.js`, arrancan la app en una copia temporal) antes de cada commit.

## Cada módulo nuevo (obligatorio)

1. **Su propio JSON.** Los datos viven en `<userRoot>/.kcc/<modulo>/` (un JSON por entidad, p. ej. `bases/<id>.json`, o uno por módulo si es pequeño). Si el módulo guarda archivos o binarios (p. ej. `codigo/<id>/objetos/<sha256>`), el JSON solo lleva metadatos y referencias; el contenido va aparte. Usa `lib/store.js` (`readJson`, `writeJson`, `updateJson`, `newId`). Nunca mezcles datos de dos módulos en el mismo archivo.
2. **Backend como fábrica:** `lib/<modulo>.js` exporta `create<Modulo>({express, userRoot, sendError, registrarActividad, alCambiar})` → `{router, core:{resumen(user)}}` y se monta en `server.js` con `auth`.
3. **Gamificación siempre incluida** (no se entrega un módulo sin ella):
   - `core.resumen(user)` devuelve contadores (`<prefijo>_xxx`) y el módulo se añade a `modulosConLogros` en `server.js`.
   - Tras cada mutación llama a `alCambiar(user)` (invalida la caché de recuentos de logros).
   - En `lib/game.js`: familias en `FAMILIAS` (5 umbrales), `ESPECIALES`, `RETOS` (grupo `contenido`), un título en `COSMETICOS` con `logro:[familia,tramo]`, la métrica en `metricas()` y el recuento en `vista().recuentos`.
   - En `public/js/game.js`: grupo en el filtro de `pintaLogros`, copa en `COPAS`, color en `GRUPO_COL`, entrada en «Lo que has guardado». En `public/css/game.css`: `.gm-logro-ic[data-g=…]`.
   - En el cliente del módulo: tras guardar, `K.game.load()` con debounce para que salgan los avisos de logros.
4. **Cliente:** `public/js/<modulo>.js` + `public/css/<modulo>.css`; pestaña de escritorio y de móvil, `<main id="view-…">`, símbolo SVG `i-…`, `<link>`/`<script>` en `index.html`, entradas en `public/sw.js` (SHELL) y acción en `omni.js`, y `K.registerView`.
5. **Documentación y pruebas:** sección en `README.md`, línea en `pendiente.md`, prueba con Playwright en móvil (390 px) y escritorio, y commit con los trailers de atribución.
6. **Exportación:** si el módulo guarda datos nuevos, añade su sección en `lib/exportar.js` (`SECCIONES`) y en `public/js/exportar.js` (`SECCION` y `NOMBRES`) para que entre en el botón ⤓ y en el ZIP de administración.
7. **Tipografía:** los tamaños de letra se escriben como `calc(Npx*var(--fs,1))` (ajuste «Tamaño del texto» de Cuenta), nunca `Npx` a pelo; los campos de texto usan `max(16px,calc(16px*var(--fs,1)))`.
