'use strict';
// Búsqueda · enlaces de compartir y de subida creados por el usuario (nombre, ruta o álbum, tipo). Nunca la contraseña ni el identificador público.
const path = require('path');
const { leeSeguro, lista } = require('./ayudas');

module.exports = { id: 'enlaces', nombre: 'Enlaces',
  async documentos(ctx, u) {
    if (!ctx.appDir) return [];
    const todos = lista(await leeSeguro(path.join(ctx.appDir, 'uploadlinks.json'), () => []));
    return todos.filter(l => l && l.id && l.owner === u.username).map(l => {
      const tipo = (l.kind || 'upload') === 'upload' ? 'Enlace para que otros me suban archivos' : 'Enlace para compartir (descarga)';
      const destino = l.album ? 'álbum' : l.path ? `carpeta o archivo ${l.path}` : '';
      const caduca = l.expiresAt ? `caduca el ${new Date(l.expiresAt).toLocaleDateString('es-ES')}` : 'sin caducidad';
      return { fuente: 'enlaces', id: l.id, titulo: String(l.label || l.path || 'Enlace').slice(0, 200),
        texto: [`${tipo}: ${l.label || ''}`, destino, caduca, l.password ? 'con contraseña' : ''].filter(Boolean).join('\n'), fecha: Number(l.createdAt) || 0 };
    });
  } };
