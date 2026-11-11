'use strict';
// Errores del sistema (disco, permisos…) y fallos de programación nunca enseñan su texto: llevaría rutas del servidor.
// Se cuentan en el registro y el cliente recibe un mensaje general.
const ERRORES_SISTEMA = {
  ENOENT: [404, 'No se ha encontrado'], ENOTDIR: [404, 'No se ha encontrado'], EACCES: [403, 'El servidor no tiene permiso para hacerlo'], EPERM: [403, 'El servidor no tiene permiso para hacerlo'],
  ENOSPC: [507, 'No queda espacio en el disco del servidor'], EEXIST: [409, 'Ya existe'], EISDIR: [400, 'Eso es una carpeta'], EMFILE: [503, 'El servidor está ocupado: inténtalo de nuevo'], ENAMETOOLONG: [400, 'El nombre es demasiado largo'],
};
function sendError(res, err) {
  const sistema = err && typeof err.code === 'string' && err.syscall && /^E[A-Z0-9]+$/.test(err.code);
  const fallo = err instanceof TypeError || err instanceof RangeError || err instanceof ReferenceError;
  if (sistema || fallo) {
    const [estado, mensaje] = (sistema && ERRORES_SISTEMA[err.code]) || [500, 'Error interno del servidor'];
    if (estado >= 500 || fallo) console.error('Error al responder:', err && err.stack || err);
    return res.status(estado).json({ error: mensaje });
  }
  res.status(err.status || 400).json({ error: err.message });
}

module.exports = { sendError, ERRORES_SISTEMA };
