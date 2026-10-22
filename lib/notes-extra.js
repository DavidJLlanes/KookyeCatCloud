'use strict';
// Extras de las notas: enlaces entre elementos (backlinks), exportación a Markdown/ZIP y
// plantillas propias. Las notas siguen siendo un .md por nota; los enlaces internos son
// enlaces Markdown con el esquema kcc:
//     [texto](kcc:note/<id>)   [texto](kcc:prompt/<id>)   [texto](kcc:file/<ruta codificada>)
//     ![pie](kcc:file/<ruta codificada>)                  <- imagen de tu nube
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { kccDir, readJson, updateJson, newId, HttpError, cleanStr } = require('./store');

const RE_LINK = /\]\(kcc:(note|prompt|file)\/([^)\s]+)\)/g;
const RE_IMG = /!\[([^\]]*)\]\(kcc:file\/([^)\s]+)\)/g;
const RE_ENLACE = /\[([^\]]*)\]\(kcc:(note|prompt|file)\/([^)\s]+)\)/g;
const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg|heic|heif)$/i;

function decodifica(enc) { try { return decodeURIComponent(enc); } catch { return enc; } }

// A qué apunta un texto: { note: [ids], prompt: [ids], file: [rutas] }
function extraeLinks(body) {
  const out = { note: new Set(), prompt: new Set(), file: new Set() };
  for (const m of String(body || '').matchAll(RE_LINK)) {
    if (out[m[1]].size >= 200) continue;
    out[m[1]].add(m[1] === 'file' ? decodifica(m[2]) : m[2]);
  }
  const r = {};
  for (const k of Object.keys(out)) if (out[k].size) r[k] = [...out[k]];
  return r;
}

const nombreSeguro = (t) => String(t || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').trim().slice(0, 100) || 'sin título';

function createNotesExtra({ express, auth, userRoot, sendError, readNotes, writeNotes, notaFile, descendientes, resolveFor, ZipArchive }) {
  const router = express.Router();
  const plantillasFile = (user) => path.join(kccDir(userRoot(user)), 'note-templates.json');

  /* ---------- Backlinks ---------- */
  // Las notas guardadas antes de existir esto no tienen el campo links: se indexan al vuelo, una vez
  async function aseguraLinks(user, data) {
    let tocado = false;
    for (const it of data.items) {
      if (it.type !== 'note' || it.links) continue;
      let body = '';
      try { body = await fsp.readFile(notaFile(user, it.id), 'utf8'); } catch {}
      it.links = extraeLinks(body); tocado = true;
    }
    if (tocado) await writeNotes(user, data);
    return data;
  }
  router.get('/backlinks', auth, async (req, res) => {
    try {
      const tipo = String(req.query.type || ''); const ref = String(req.query.ref || '');
      if (!['note', 'prompt', 'file'].includes(tipo) || !ref) throw new HttpError(400, 'Consulta no válida');
      const data = await aseguraLinks(req.user, await readNotes(req.user));
      const items = data.items
        .filter(i => i.type === 'note' && i.id !== ref && ((i.links || {})[tipo] || []).includes(ref))
        .map(i => ({ id: i.id, title: i.title, icon: i.icon || '', color: i.color || '' }));
      res.json({ items });
    } catch (err) { sendError(res, err); }
  });

  /* ---------- Exportar a Markdown / ZIP ---------- */
  // Reescribe los enlaces internos para que el .md se entienda fuera de la app:
  // las imágenes de tu nube se empaquetan en Adjuntos/ y los demás enlaces quedan como texto
  async function convierte(user, body, profundidad, imagenes) {
    let out = String(body);
    const trozos = [...out.matchAll(RE_IMG)];
    for (const m of trozos) {
      const ruta = decodifica(m[2]);
      let destino = null;
      try {
        const abs = resolveFor(user, ruta);
        await fsp.access(abs);
        if (!imagenes.has(abs)) {
          let nombre = nombreSeguro(path.basename(ruta)); let n = 1;
          const usados = new Set([...imagenes.values()]);
          while (usados.has(nombre)) nombre = `${path.basename(ruta, path.extname(ruta))}_${n++}${path.extname(ruta)}`;
          imagenes.set(abs, nombre);
        }
        destino = `${'../'.repeat(profundidad)}Adjuntos/${encodeURI(imagenes.get(abs))}`;
      } catch { /* la imagen ya no existe */ }
      out = out.replace(m[0], destino ? `![${m[1]}](${destino})` : `*(imagen no disponible: ${m[1] || ruta})*`);
    }
    return out.replace(RE_ENLACE, (m, txt) => txt);
  }

  router.get('/notes/:id/export', auth, async (req, res) => {
    try {
      const data = await readNotes(req.user);
      const raiz = data.items.find(i => i.id === req.params.id);
      if (!raiz) throw new HttpError(404, 'No encontrada');
      const carpeta = raiz.type === 'folder';
      const notas = carpeta ? descendientes(data.items, raiz.id).filter(i => i.type === 'note') : [raiz];

      // Ruta de cada nota dentro del ZIP: la de sus carpetas, relativa a la exportada
      const rutaDe = (it) => {
        const trozos = [];
        let cur = it;
        while (cur && cur.id !== raiz.id) { trozos.unshift(cur); cur = data.items.find(x => x.id === cur.parent); }
        return trozos;
      };
      const usadas = new Set();
      const unica = (dir, base) => {
        let nombre = `${dir}${base}.md`; let n = 1;
        while (usadas.has(nombre.toLowerCase())) nombre = `${dir}${base} (${n++}).md`;
        usadas.add(nombre.toLowerCase());
        return nombre;
      };

      const imagenes = new Map();
      const archivos = [];
      for (const it of notas) {
        let body = '';
        try { body = await fsp.readFile(notaFile(req.user, it.id), 'utf8'); } catch {}
        const trozos = carpeta ? rutaDe(it) : [it];
        const dir = trozos.slice(0, -1).map(t => nombreSeguro(t.title) + '/').join('');
        const md = await convierte(req.user, body, trozos.length - 1, imagenes);
        archivos.push({ name: unica(dir, nombreSeguro(it.title)), md: `# ${it.title}\n\n${md}\n` });
      }

      const ascii = (n) => n.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
      const envia = (nombre, tipo) => {
        res.setHeader('Content-Type', tipo);
        res.setHeader('Content-Disposition', `attachment; filename="${ascii(nombre)}"; filename*=UTF-8''${encodeURIComponent(nombre)}`);
      };
      // Una sola nota sin imágenes: el .md directo
      if (!carpeta && !imagenes.size) {
        envia(nombreSeguro(raiz.title) + '.md', 'text/markdown; charset=utf-8');
        return res.send(archivos[0].md);
      }
      envia(nombreSeguro(raiz.title) + '.zip', 'application/zip');
      const zip = new ZipArchive({ zlib: { level: 6 } });
      zip.on('error', () => res.destroy());
      zip.pipe(res);
      for (const a of archivos) zip.append(a.md, { name: a.name });
      for (const [abs, nombre] of imagenes) zip.file(abs, { name: 'Adjuntos/' + nombre });
      await zip.finalize();
    } catch (err) { if (!res.headersSent) sendError(res, err); else res.destroy(); }
  });

  /* ---------- Plantillas propias ---------- */
  router.get('/note-templates', auth, async (req, res) => {
    try { res.json(await readJson(plantillasFile(req.user), { templates: [] })); }
    catch (err) { sendError(res, err); }
  });
  router.post('/note-templates', auth, express.json({ limit: '1mb' }), async (req, res) => {
    try {
      const name = cleanStr(req.body.name, 80).trim();
      if (!name) throw new HttpError(400, 'Ponle un nombre a la plantilla');
      const t = await updateJson(plantillasFile(req.user), { templates: [] }, (d) => {
        if (d.templates.length >= 100) throw new HttpError(400, 'Demasiadas plantillas');
        const x = { id: newId(), name, icon: cleanStr(req.body.icon, 8), body: cleanStr(req.body.body, 200000), createdAt: Date.now() };
        d.templates.push(x);
        return x;
      });
      res.json({ ok: true, template: t });
    } catch (err) { sendError(res, err); }
  });
  router.delete('/note-templates/:id', auth, async (req, res) => {
    try {
      await updateJson(plantillasFile(req.user), { templates: [] }, (d) => { d.templates = d.templates.filter(t => t.id !== req.params.id); });
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  return { router, extraeLinks, nombreSeguro, IMG_EXT };
}

module.exports = createNotesExtra;
module.exports.extraeLinks = extraeLinks;
