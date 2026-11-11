'use strict';
// Páginas HTML y manifest con las rutas absolutas reescritas al prefijo de despliegue (BASE_PATH).
const fs = require('fs');
const path = require('path');

function creaPlantillas({ PUBLIC_DIR, BASE_PATH }) {
  const plantillas = new Map();
  function enviaPlantilla(res, nombre, tipo) {
    // Se cachea la plantilla ya reescrita, pero se vuelve a generar si el archivo cambia
    const archivo = path.join(PUBLIC_DIR, nombre);
    const mtime = fs.statSync(archivo).mtimeMs;
    let hit = plantillas.get(nombre);
    let texto = hit && hit.mtime === mtime ? hit.texto : undefined;
    if (texto === undefined) {
      texto = fs.readFileSync(archivo, 'utf8');
      if (BASE_PATH) {
        texto = nombre.endsWith('.json')
          ? texto.replace(/("(?:id|start_url|scope|src|action|url)": ")\//g, `$1${BASE_PATH}/`)
          : texto.replace(/((?:href|src)=")\/(?!\/)/g, `$1${BASE_PATH}/`);
      }
      if (nombre.endsWith('.html')) {
        texto = texto.replace('<head>', `<head>
  <meta name="kcc-base" content="${BASE_PATH}">`);
      }
      plantillas.set(nombre, { texto, mtime });
    }
    // Las imágenes OG necesitan URL absoluta y el prefijo real de despliegue.
    if (nombre === 'index.html') {
      const proto = (res.req.headers['x-forwarded-proto'] || res.req.protocol || 'https').toString().split(',')[0].trim();
      const host = res.req.get('host');
      const origin = proto + '://' + host;
      texto = texto.replaceAll('__KCC_OG_URL__', origin + BASE_PATH + '/og-image.jpg')
        .replaceAll('__KCC_PAGE_URL__', origin + BASE_PATH + '/');
    }
    res.type(tipo).send(texto);
  }
  return { enviaPlantilla };
}

module.exports = { creaPlantillas };
