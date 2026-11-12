# KookyeCatCloud: convenciones del repositorio

Node 20 + Express 4 + JS vanilla (PWA). Respuestas al usuario en español, breves. `npm run check` (sintaxis, persistencia y ESLint `no-undef`) y `npm test` (pruebas de humo en `tests/smoke.js`, arrancan la app en una copia temporal) antes de cada commit.

## Cada módulo nuevo (obligatorio)

1. **Su propio JSON.** Los datos viven en `<userRoot>/.kcc/<modulo>/` (un JSON por entidad, p. ej. `bases/<id>.json`, o uno por módulo si es pequeño). Si el módulo guarda archivos o binarios (p. ej. `codigo/<id>/objetos/<sha256>`), el JSON solo lleva metadatos y referencias; el contenido va aparte. Usa `lib/nucleo/store.js` (`readJson`, `writeJson`, `updateJson`, `newId`). Nunca mezcles datos de dos módulos en el mismo archivo. Los módulos grandes van en carpeta (`lib/<modulo>/index.js`, `public/js/<modulo>/*.js`) con archivos pequeños de una sola responsabilidad (modelo, resumen, red…), y sus pruebas en `tests/modulos/<modulo>.js`.
2. **Backend como fábrica:** `lib/<modulo>.js` exporta `create<Modulo>({express, userRoot, sendError, registrarActividad, alCambiar})` → `{router, core:{resumen(user)}}` y se monta en `server.js` con `auth`.
3. **Gamificación siempre incluida** (no se entrega un módulo sin ella):
   - `core.resumen(user)` devuelve contadores (`<prefijo>_xxx`) y el módulo se añade a `modulosConLogros` en `server.js`.
   - Tras cada mutación llama a `alCambiar(user)` (invalida la caché de recuentos de logros).
   - En `lib/game/` (`logros.js`: `FAMILIAS`, `ESPECIALES`; `retos.js`: `RETOS`; `cosmeticos.js`: `COSMETICOS`; `motor.js`: `metricas()` y `vista().recuentos`): familias en `FAMILIAS` (5 umbrales), `ESPECIALES`, `RETOS` (grupo `contenido`), un título en `COSMETICOS` con `logro:[familia,tramo]`, la métrica en `metricas()` y el recuento en `vista().recuentos`.
   - En `public/js/game.js`: grupo en el filtro de `pintaLogros`, copa en `COPAS`, color en `GRUPO_COL`, entrada en «Lo que has guardado». En `public/css/game.css`: `.gm-logro-ic[data-g=…]`.
   - En el cliente del módulo: tras guardar, `K.game.load()` con debounce para que salgan los avisos de logros.
4. **Cliente:** `public/js/<modulo>.js` + `public/css/<modulo>.css`; pestaña de escritorio y de móvil, `<main id="view-…">`, símbolo SVG `i-…`, `<link>`/`<script>` en `index.html`, entradas en `public/sw.js` (SHELL) y acción en `omni.js`, y `K.registerView`.
5. **Documentación y pruebas:** sección en `README.md`, línea en `pendiente.md`, prueba con Playwright en móvil (390 px) y escritorio, y commit con los trailers de atribución.
6. **Exportación:** si el módulo guarda datos nuevos, añade su sección en `lib/exportar/index.js` (`SECCIONES`) y en `public/js/exportar.js` (`SECCION` y `NOMBRES`) para que entre en el botón ⤓ y en el ZIP de administración.
7. **Valores repetibles:** los campos de texto que se repiten entre elementos (modelo, plataforma, empresa, etiqueta…) usan el servicio `lib/valores/index.js`: `valores.registra({…})` en la fábrica (con `uso` y `renombra`), `valores.aplica(user, modulo, obj)` antes de guardar, `K.campoValor()` en el formulario, `K.chipValor()` donde se muestre el valor y `K.filtros.<modulo>` para filtrar al pulsarlo. No aplica a nombres, notas, URLs, fechas ni cifras. Añade el módulo a `MODULOS` de `public/js/valores-pantalla.js`.
8. **Tipografía:** los tamaños de letra se escriben como `calc(Npx*var(--fs,1))` (ajuste «Tamaño del texto» de Cuenta), nunca `Npx` a pelo; los campos de texto usan `max(16px,calc(16px*var(--fs,1)))`.

## Persistencia (obligatorio; ver `docs/auditoria-errores.md`)

- Los datos se leen y escriben solo con `lib/nucleo/store.js`: `readJson`, `writeJson`, `updateJson` (y `leeJsonSync`/`escribeJsonSync` para configuración que se lee al arrancar). Nunca `JSON.parse(readFile…)` con `catch → []`, nunca un `.tmp` de nombre fijo, nunca `writeFile` directo sobre un `.json`. `npm run check` lo vigila (`tests/auditoria.js`).
- Un archivo que **existe pero no se puede leer** nunca equivale a «vacío»: se lanza el error (el cliente lo muestra) o se usa el `.bak`. Solo «no existe» es vacío.
- Todo leer-modificar-guardar sobre el mismo archivo va por `updateJson` o por una cola; el servidor no debe aceptar un guardado que deje vacío lo que antes tenía contenido sin dejar copia.
- Comprobar presencia con `in`/`has`, no con la veracidad del valor: `0`, `''` y `[]` son valores válidos.
- Todo módulo nuevo añade su prueba de humo de: lectura dañada, escritura concurrente y valor vacío.
- Ediciones desde varios dispositivos: los guardados de textos largos mandan la versión que abrieron (como `base` en notas) y el servidor no sobrescribe un cambio ajeno más nuevo; nunca reenviar al servidor partes que el usuario no ha tocado (p. ej. columnas al cambiar una vista).
- Borrar: nada de datos del usuario se elimina en el acto. Va a una papelera o se aparta con `store.guardaBorrado` (30 días). Los textos largos no se recortan en silencio (`store.textoLargo`): se rechazan con aviso, salvo en importaciones.

## Gamificación (regla permanente, pedida por el propietario)

> **Orden permanente del propietario (vale siempre):** la gamificación va en todos los módulos, incluidos los nuevos, y cada módulo o función nueva añade los logros y trofeos que correspondan (familias, especiales, retos, títulos y copas) cuando tenga sentido. Ver la lista de pasos en «Cada módulo nuevo», punto 3.

## Organización del código (regla permanente, pedida por el propietario)

> **Orden permanente del propietario (vale siempre, en todas las tareas):** crear una estructura de código perfecta, escalable y muy profesional, sin sobrecargar los archivos actuales con exceso de código. Crear archivos y carpetas nuevas siempre que haga falta.

- **Ningún archivo crece sin control.** Pasadas ~300 líneas en un archivo nuevo, o al tocar uno de más de ~500, se trocea en carpeta (`lib/<modulo>/index.js` + archivos de una sola responsabilidad; `public/js/<modulo>/`). `server.js` solo arranca, configura y monta: la lógica va en `lib/`.
- **Cada cambio deja el código mejor organizado que lo encontró:** si una función nueva no cabe con sensatez en un archivo pequeño, se crea el archivo adecuado en vez de añadirla al grande.
- **Se trocea con red:** antes de mover código sin pruebas, se añade su prueba de humo en `tests/modulos/`; un movimiento no cambia comportamiento y se verifica con `npm run check && npm test` (y, si toca la interfaz, con Playwright).
- Tras mover, revisar que cada archivo nuevo importa lo que usa (`fs`, `fsp`, `path`, `crypto`…): un identificador sin importar solo falla en tiempo de ejecución y puede quedar tragado por un `try/catch`.
- Al renombrar dependencias inyectadas con un reemplazo masivo (p. ej. `calendarMod.core.` → `calendar.`), comprobar que no quedan sombreadas por variables locales con el mismo nombre (`const { calendar } = req.body`): ya pasó y solo lo detectó una prueba.
- Al acabar una tanda, actualizar la sección «Estructura del proyecto» del README.
- Hecho: `server.js` (1.802 → ~600 líneas), `lib/prompts/`, `lib/calendar/`, `lib/archivos/`, `lib/explorador/`, `lib/analisis/`, `lib/web/`, `lib/transversal/`, `lib/game/`, `lib/codigo/`, `lib/vault/`, `lib/bases/`, `lib/sincronizados/`, `public/js/prompts/`, `public/js/calendar/`, `public/js/contacts/`, `public/js/codigo/`, `public/js/bases/`, `public/js/notes/` (marco `ricos.js` + un archivo por bloque rico), `public/js/games/`, `public/js/tetris/`, `public/js/arcade/`, `public/js/app/navegacion/`, `public/js/app/visores/`. Deuda pendiente de trocear: ningún archivo por encima de ~500 líneas salvo `server.js` (615, solo arranca y monta). Al tocar un archivo que se acerque a 300 líneas (nuevo) o 500, se trocea con el método de abajo. Servidor: `node tests/trocea-servidor.js <origen> <carpeta> <fábrica> <ini> <fin> sección:desde-hasta …` reparte una fábrica `createX` en `constantes.js` + secciones con `ctx` (después: ESLint, comparar rutas y `npm test`, también contra el código anterior). Método probado para el cliente: `tests/ui/trocea.js` (con `LETS=<obj>` convierte los `let` compartidos en propiedades) reparte un IIFE en archivos que comparten un espacio `K._xxx` (funciones por envoltorio perezoso, valores por desestructuración) y `tests/ui/<vista>.js` (Playwright, móvil y escritorio) da una huella que debe quedar idéntica (`<vista>.huella.json`). Método probado: dividir en secciones que comparten un contexto `ctx`, dejar que ESLint diga qué identificadores faltan en cada archivo, comparar la lista de rutas antes/después y ejecutar las pruebas también contra el código anterior (`git worktree`).
