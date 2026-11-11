'use strict';
// Reparto de espacio del panel de administración: archivos por tipo y datos internos de cada módulo.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

// Categorías para el reparto de espacio del panel de administración
const TYPE_RE = [
  ['image', /\.(jpe?g|png|gif|webp|bmp|avif|heic|heif|svg|tiff?)$/i],
  ['video', /\.(mp4|mov|avi|mkv|webm|m4v|mpe?g|wmv|flv)$/i],
  ['audio', /\.(mp3|wav|flac|aac|ogg|m4a|wma|opus)$/i],
  ['doc',   /\.(pdf|docx?|txt|rtf|odt|md|pages|xlsx?|csv|ods|pptx?|odp|epub)$/i],
];
const typeOf = (name) => (TYPE_RE.find(([, re]) => re.test(name)) || ['other'])[0];

/* Datos de la propia app que viven en carpetas ocultas de cada usuario (papelera, notas, prompts,
   contactos y sus fotos, versiones, caja fuerte, calendario y etiquetas). El recorrido de archivos
   de arriba las salta a propósito, pero ocupan disco y deben contar en el total. */
const DATOS_APP = [
  { id: 'trash',    nombre: 'Papelera' },
  { id: 'notes',    nombre: 'Notas' },
  { id: 'prompts',  nombre: 'Prompts' },
  { id: 'contacts', nombre: 'Contactos' },
  { id: 'codigo',   nombre: 'Código' },
  { id: 'bases',    nombre: 'Bases' },
  { id: 'pagos',    nombre: 'Pagos' },
  { id: 'marcadores', nombre: 'Marcadores' },
  { id: 'recordatorios', nombre: 'Recordatorios' },
  { id: 'albums',   nombre: 'Álbumes' },
  { id: 'perfil',   nombre: 'Foto de perfil' },
  { id: 'juegos',   nombre: 'Juegos y logros' },
  { id: 'transfer', nombre: 'Transferencias' },
  { id: 'versions', nombre: 'Versiones' },
  { id: 'clip',     nombre: 'Portapapeles' },
  { id: 'vault',    nombre: 'Caja fuerte' },
  { id: 'calendar', nombre: 'Calendario' },
  { id: 'datos',    nombre: 'Ajustes y otros' },
];
// Carpeta o archivo dentro de .kcc -> categoría (lo no listado cae en «Ajustes y otros»)
const KCC_A_DATOS = {
  prompts: 'prompts', 'contacts.json': 'contacts', 'contact-photos': 'contacts', codigo: 'codigo', bases: 'bases',
  pagos: 'pagos', marcadores: 'marcadores', recordatorios: 'recordatorios', perfil: 'perfil', games: 'juegos', 'game.json': 'juegos', 'game.json.bak': 'juegos',
  transferencias: 'transfer', versions: 'versions', clip: 'clip', 'calendar.json': 'calendar', 'calendar.json.bak': 'calendar',
};
async function tamanoTodo(p) {
  let bytes = 0, count = 0, st;
  try { st = await fsp.lstat(p); } catch { return { bytes, count }; }
  if (!st.isDirectory()) return { bytes: st.size, count: 1 };
  let entradas;
  try { entradas = await fsp.readdir(p, { withFileTypes: true }); } catch { return { bytes, count }; }
  for (const e of entradas) {
    const r = await tamanoTodo(path.join(p, e.name));
    bytes += r.bytes; count += r.count;
  }
  return { bytes, count };
}

function crea({ userRoot, isHidden, TRASH_DIR, NOTES_DIR }) {
  async function datosApp(user) {
    const raiz = userRoot(user);
    const acum = Object.fromEntries(DATOS_APP.map(d => [d.id, { bytes: 0, count: 0 }]));
    const suma = async (id, ruta) => { const r = await tamanoTodo(ruta); acum[id].bytes += r.bytes; acum[id].count += r.count; };
    let ocultos = [];
    try { ocultos = (await fsp.readdir(raiz, { withFileTypes: true })).filter(e => isHidden(e.name)); } catch { /* sin carpeta */ }
    for (const e of ocultos) {
      const ruta = path.join(raiz, e.name);
      if (e.name === TRASH_DIR) await suma('trash', ruta);
      else if (e.name === NOTES_DIR) await suma('notes', ruta);
      else if (e.name === '.vault') await suma('vault', ruta);
      else if (e.name === '.albums') await suma('albums', ruta);
      else if (e.name === '.kcc' && e.isDirectory()) {
        for (const h of await fsp.readdir(ruta, { withFileTypes: true }).catch(() => [])) {
          const hp = path.join(ruta, h.name);
          await suma(KCC_A_DATOS[h.name] || 'datos', hp);
        }
      } else await suma('datos', ruta);
    }
    return DATOS_APP.map(d => ({ ...d, ...acum[d.id] }));
  }

  return { datosApp };
}

function monta({ router, auth, userRoot, isHidden, sendError, DATA_ROOT, datosApp }) {
  router.get('/api/stats', auth, async (req, res) => {
    try {
      // Recorrido asíncrono: con readdirSync el panel de admin bloqueaba el proceso entero
      const byType = { image: { bytes: 0, count: 0 }, video: { bytes: 0, count: 0 },
                       audio: { bytes: 0, count: 0 }, doc: { bytes: 0, count: 0 },
                       other: { bytes: 0, count: 0 } };
      async function walk(dir) {
        let total = 0, count = 0;
        const entries = await fsp.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          if (isHidden(e.name)) continue; // la papelera se contabiliza aparte
          const full = path.join(dir, e.name);
          try {
            if (e.isDirectory()) {
              const r = await walk(full);
              total += r.total; count += r.count;
            } else {
              const size = (await fsp.stat(full)).size;
              total += size; count++;
              const t = byType[typeOf(e.name)];
              t.bytes += size; t.count++;
            }
          } catch { /* archivo desaparecido a mitad del recorrido */ }
        }
        return { total, count };
      }
      const { total, count } = await walk(userRoot(req.user));
      const app = await datosApp(req.user);
      const appBytes = app.reduce((n, d) => n + d.bytes, 0);
      // totalBytes incluye ahora TODO lo que el usuario guarda; filesBytes son solo sus archivos
      const payload = { totalBytes: total + appBytes, filesBytes: total, appBytes, fileCount: count, byType, app };
      try {
        if (fsp.statfs) {
          const disk = await fsp.statfs(DATA_ROOT);
          payload.diskTotal = disk.blocks * disk.bsize;
          payload.diskFree = disk.bavail * disk.bsize;
        }
      } catch { /* statfs no disponible en este Node */ }
      res.json(payload);
    } catch (err) {
      sendError(res, err);
    }
  });
}

module.exports = { crea, monta };
