'use strict';
// Caja fuerte: carpeta cifrada con una contraseña distinta a la de la cuenta.
//
// Modelo de claves
//   contraseña --scrypt(sal)--> KEK --AES-256-GCM--> envuelve una clave de datos aleatoria (DEK)
//   DEK cifra el índice (nombres, carpetas, tamaños) y cada archivo.
//   Cambiar la contraseña solo vuelve a envolver la DEK: no hay que recifrar los archivos.
//


function createVault({ express, auth, multer, sharp, userRoot, resolveFor, sendError, registrarActividad, alRetirar, maxUpload }) {
  const ctx = { express, auth, multer, sharp, userRoot, resolveFor, sendError, registrarActividad, alRetirar, maxUpload };
  // El orden de montaje es el del archivo original
  Object.assign(ctx, require('./base')(ctx));
  Object.assign(ctx, require('./estado')(ctx));
  Object.assign(ctx, require('./contenido')(ctx));
  Object.assign(ctx, require('./subida')(ctx));
  Object.assign(ctx, require('./lectura')(ctx));
  Object.assign(ctx, require('./mover')(ctx));

  const { abiertas, router } = ctx;
  return {
    router,
    cierraSesion: (jti) => abiertas.delete(jti),
    // Solo pruebas / diagnóstico
    estaAbierta: (jti) => abiertas.has(jti),
  };
}

module.exports = createVault;
