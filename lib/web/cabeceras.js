'use strict';
// Cabeceras de seguridad de todas las respuestas (CSP, HSTS, nosniff, marcos…).
// tileOrigin es una función porque el servidor de mapas se resuelve después de crear este módulo.
function cabeceras({ SECURE_COOKIES, tileOrigin }) {
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Solo con HTTPS de verdad (cookies seguras) y sin includeSubDomains: otros subdominios del dominio pueden no tener HTTPS
    if (SECURE_COOKIES) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    // SAMEORIGIN y no DENY: el visor de PDF va dentro de un marco de la propia web.
    // Otro sitio sigue sin poder enmarcarnos, que es de lo que protege esto.
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    // Funciones del dispositivo que la app no usa: apagadas también para los marcos (guía modern-web-guidance «security»).
    // La cámara va sin tocar: las fotos se suben con el selector del sistema.
    res.setHeader('Permissions-Policy', 'microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), focus-without-user-activation=()');
    // Una ventana que nos abra no puede mirar la nuestra; las que abrimos nosotros (enlaces con noopener) siguen funcionando.
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    // object-src 'self' y no 'none': para enseñar un PDF dentro de un marco, Chrome lo
    // trata como contenido de complemento y mira esta directiva del documento que lo
    // enmarca. Con 'none' sale el recuadro gris de "no se pudo cargar". Sigue limitado
    // al propio dominio, y todo se sirve con nosniff y con el tipo declarado.
    // frame-src incluye youtube-nocookie.com solo para los vídeos incrustados en notas (bloque ::embed).
    // img-src incluye el servidor de tiles del mapa: es lo ÚNICO externo de toda la app.
    // blob: es solo para la vista previa local de las imágenes que se están a punto de subir.
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; img-src 'self' data: blob: ${tileOrigin()}; style-src 'self' 'unsafe-inline'; ` +
      "script-src 'self'; object-src 'self'; frame-src 'self' https://www.youtube-nocookie.com; base-uri 'none'; form-action 'self'; frame-ancestors 'self'"
    );
    next();
  };
}

module.exports = { cabeceras };
