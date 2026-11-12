'use strict';
// Búsqueda · archivos de texto del usuario (nombre y contenido). Se salta .kcc y carpetas ocultas; el contenido se relee solo
// si el archivo cambió (tamaño y fecha). Tope de archivos y de tamaño para que un directorio enorme no frene el índice.
const { fsp, path } = require('./ayudas');

const EXT = new Set(['.md', '.txt', '.csv', '.json', '.html', '.htm', '.xml', '.yml', '.yaml', '.js', '.ts', '.css', '.py', '.sh', '.log', '.ini', '.conf', '.tex', '.rtf', '.srt', '.vcf', '.ics']);
const MAX_ARCHIVOS = 4000, MAX_BYTES = 256 * 1024, MAX_PROF = 8;
const cache = new Map();    // ruta absoluta -> { firma, texto }

async function recorre(dir, rel, prof, out) {
  if (prof > MAX_PROF || out.length >= MAX_ARCHIVOS) return;
  let ents; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (out.length >= MAX_ARCHIVOS) return;
    if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
    const abs = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) await recorre(abs, r, prof + 1, out);
    else if (e.isFile() && EXT.has(path.extname(e.name).toLowerCase())) out.push({ abs, rel: r });
  }
}

module.exports = {
  id: 'archivos', nombre: 'Archivos',
  async documentos(ctx, user) {
    const raiz = ctx.userRoot(user);
    const lista = []; await recorre(raiz, '', 0, lista);
    const vivos = new Set(), out = [];
    for (const f of lista) {
      let st; try { st = await fsp.stat(f.abs); } catch { continue; }
      let texto = '';
      if (st.size <= MAX_BYTES) {
        const firma = `${st.size}:${st.mtimeMs}`; vivos.add(f.abs);
        const c = cache.get(f.abs);
        if (c && c.firma === firma) texto = c.texto;
        else { try { texto = (await fsp.readFile(f.abs, 'utf8')).slice(0, 60000); } catch { /* ilegible */ } cache.set(f.abs, { firma, texto }); }
      }
      out.push({ fuente: 'archivos', id: f.rel, titulo: path.basename(f.rel), texto: `${f.rel}\n${texto}`, fecha: Math.round(st.mtimeMs) });
    }
    for (const k of [...cache.keys()]) if (k.startsWith(raiz) && !vivos.has(k)) cache.delete(k);
    return out;
  },
};
