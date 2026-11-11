# Pruebas de interfaz (Playwright)

No van en `npm test`. Arranca una copia de la app con `DATA_DIR` y `ADMIN_PASSWORD` propios (nunca sobre el `users.json` real), luego:

`UI_URL=http://localhost:4733 UI_PASS=... node tests/ui/prompts.js`

Imprime una huella JSON; tras mover código debe coincidir con `prompts.huella.json`. `trocea.js` reparte un IIFE de navegador en archivos (ver CLAUDE.md).
