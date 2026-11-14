'use strict';
// Arranque · en qué interfaz escucha el servidor y aviso si la carpeta de datos es legible por otros usuarios del sistema.
const fs = require('fs');

// Por defecto solo en local: la app va detrás de Nginx y se fía de su cabecera X-Forwarded-For (`trust proxy`). Si el puerto
// de Node fuera accesible desde fuera, cualquiera podría saltarse el proxy, inventarse esa cabecera y con ella el límite de
// intentos de acceso. Para Docker o un proxy en otra máquina: LISTEN_HOST=0.0.0.0 (y cerrar el puerto en el cortafuegos).
function anfitrion(env = process.env) {
  const h = String(env.LISTEN_HOST || '').trim();
  return h || '127.0.0.1';
}

// La carpeta de datos nueva nace 700. A una que ya existe no se le cambian los permisos (puede haber copias de seguridad o
// un SFTP que dependan de ellos): solo se avisa si «otros» pueden entrar.
function creaDatos(dir) {
  const existia = fs.existsSync(dir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!existia) return;
  try {
    if (fs.statSync(dir).mode & 0o007) console.warn(`[seguridad] La carpeta de datos ${dir} es accesible para otros usuarios del sistema. Recomendado: chmod 700 "${dir}"`);
  } catch { /* sin permisos para consultarlo */ }
}

module.exports = { anfitrion, creaDatos };
