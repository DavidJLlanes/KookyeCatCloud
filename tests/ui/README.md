# Pruebas de interfaz (Playwright)

No van en `npm test`. Arranca una copia de la app con `DATA_DIR` y `ADMIN_PASSWORD` propios (nunca sobre el `users.json` real), luego:

`UI_URL=http://localhost:4733 UI_PASS=... node tests/ui/prompts.js`

Imprime una huella JSON; tras mover código debe coincidir con `prompts.huella.json`. `trocea.js` reparte un IIFE de navegador en archivos (ver CLAUDE.md).

`carpeta-grande.js` no imprime una huella: simula una carpeta de 5.000 archivos y comprueba que la interfaz no se congela (tareas largas) y que se pintan todos.

`dialogos.js` no imprime una huella: comprueba foco, Tab, Esc y flechas de diálogos y menús en escritorio y móvil táctil.
