'use strict';
// Cabeceras de seguridad globales (CSP, permisos, aislamiento de ventanas) en la página y en la API.
module.exports = async ({ prueba, igual, cierto, BASE }) => {
  await prueba('cabeceras: CSP estricta, Permissions-Policy y COOP en todas las respuestas', async () => {
    for (const ruta of ['/', '/api/auth/me']) {
      const r = await fetch(BASE + ruta);
      const csp = r.headers.get('content-security-policy') || '';
      cierto(/script-src 'self';/.test(csp) && /base-uri 'none'/.test(csp) && /form-action 'self'/.test(csp) && /frame-ancestors 'self'/.test(csp), 'CSP en ' + ruta + ': ' + csp);
      cierto(!/script-src[^;]*unsafe/.test(csp), 'sin unsafe en script-src');
      cierto(/microphone=\(\)/.test(r.headers.get('permissions-policy') || '') && /geolocation=\(\)/.test(r.headers.get('permissions-policy') || ''), 'Permissions-Policy en ' + ruta);
      igual(r.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
      igual(r.headers.get('x-content-type-options'), 'nosniff');
    }
  });
};
