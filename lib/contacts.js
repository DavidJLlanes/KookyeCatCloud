'use strict';
// Contactos al estilo Google Contacts: nombre, empresa, varios teléfonos, correos, direcciones,
// webs y fechas, notas, etiquetas de color (las mismas que usan notas, prompts y calendario)
// y favoritos. Todo vive en <usuario>/.kcc/contacts.json, igual que el resto de módulos.
// Importa y exporta vCard (.vcf), el formato que usan Google, iCloud y Android.
const path = require('path');
const { kccDir, readJson, updateJson, newId, HttpError, cleanStr, cleanIds } = require('./store');
const vcard = require('./vcard');

const MAX = Number(process.env.CONTACTS_LIMIT || 10000);
const MAX_ITEMS = 20;            // teléfonos, correos, direcciones… por contacto
const IMPORT_MAX_BYTES = '8mb';

const texto = (v, n) => cleanStr(v, n).trim();
const lista = (arr, mk) => (Array.isArray(arr) ? arr : []).slice(0, MAX_ITEMS).map(mk).filter(Boolean);

// Fecha completa (2024-03-15) o sin año (--03-15), comprobando que el día exista
function limpiaFecha(v) {
  const f = vcard.normalizaFecha(v);
  if (!f) return '';
  const m = /^(?:(\d{4})|-)-(\d{2})-(\d{2})$/.exec(f);
  const mes = Number(m[2]), dia = Number(m[3]);
  const anio = m[1] ? Number(m[1]) : 2000;               // 2000 es bisiesto: acepta el 29 de febrero
  return dia <= new Date(anio, mes, 0).getDate() ? f : '';
}

// Devuelve el contacto saneado; lo que el cuerpo no trae se conserva del anterior (si lo hay)
function limpia(b, previo) {
  b = b || {};
  const p = previo || {};
  const val = (k, def) => (b[k] !== undefined ? b[k] : (p[k] !== undefined ? p[k] : def));
  const c = {
    id: p.id,
    first: texto(val('first', ''), 80), middle: texto(val('middle', ''), 80), last: texto(val('last', ''), 80),
    nickname: texto(val('nickname', ''), 80),
    company: texto(val('company', ''), 120), department: texto(val('department', ''), 120), title: texto(val('title', ''), 120),
    phones: lista(val('phones', []), (x) => { const value = texto(x && x.value, 40); return value ? { label: texto(x.label, 30) || 'Móvil', value } : null; }),
    emails: lista(val('emails', []), (x) => { const value = texto(x && x.value, 160); return value ? { label: texto(x.label, 30) || 'Personal', value } : null; }),
    addresses: lista(val('addresses', []), (x) => {
      if (!x) return null;
      const a = { label: texto(x.label, 30) || 'Casa', street: texto(x.street, 160), city: texto(x.city, 80), region: texto(x.region, 80), zip: texto(x.zip, 20), country: texto(x.country, 80) };
      return a.street || a.city || a.region || a.zip || a.country ? a : null;
    }),
    websites: lista(val('websites', []), (x) => { const value = texto(x && x.value, 300); return value ? { label: texto(x.label, 30) || 'Personal', value } : null; }),
    dates: lista(val('dates', []), (x) => { const date = limpiaFecha(x && x.date); return date ? { label: texto(x.label, 30) || 'Cumpleaños', date } : null; }),
    notes: cleanStr(val('notes', ''), 5000).trim(),
    labels: cleanIds(val('labels', [])),
    favorite: !!val('favorite', false),
  };
  if (!c.first && !c.middle && !c.last && !c.company && !c.phones.length && !c.emails.length) {
    throw new HttpError(400, 'Añade al menos un nombre, una empresa, un teléfono o un correo');
  }
  return c;
}

const digitos = (s) => String(s || '').replace(/\D/g, '');
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Un contacto ya existente se considera el mismo si coincide el nombre y comparte algún teléfono
// o correo (o ninguno de los dos tiene datos de contacto): así volver a importar no duplica nada.
function esDuplicado(c, existentes) {
  const n = norm(vcard.nombreVisible(c));
  const tels = new Set(c.phones.map(p => digitos(p.value).slice(-9)).filter(Boolean));
  const mails = new Set(c.emails.map(e => norm(e.value)).filter(Boolean));
  return existentes.some((e) => {
    if (norm(vcard.nombreVisible(e)) !== n) return false;
    const et = e.phones.map(p => digitos(p.value).slice(-9)).filter(Boolean);
    const em = e.emails.map(x => norm(x.value)).filter(Boolean);
    if (!tels.size && !mails.size && !et.length && !em.length) return true;
    return et.some(t => tels.has(t)) || em.some(m => mails.has(m));
  });
}

function createContacts({ express, userRoot, sendError, registrarActividad, labels }) {
  const router = express.Router();
  const archivo = (user) => path.join(kccDir(userRoot(user)), 'contacts.json');
  const VACIO = () => ({ contacts: [] });
  const idOk = (id) => /^[a-f0-9]{16}$/.test(String(id));
  const log = (req, accion, detalle) => { if (registrarActividad) registrarActividad(req, accion, detalle); };

  router.get('/', async (req, res) => {
    try {
      const d = await readJson(archivo(req.user), VACIO);
      res.json({ contacts: d.contacts, total: d.contacts.length, max: MAX });
    } catch (err) { sendError(res, err); }
  });

  // Para el buscador global (Ctrl+K)
  router.get('/search', async (req, res) => {
    try {
      const q = norm(req.query.q);
      if (!q) return res.json({ items: [] });
      const qd = digitos(q);
      const d = await readJson(archivo(req.user), VACIO);
      const items = [];
      for (const c of d.contacts) {
        const hay = norm([vcard.nombreVisible(c), c.nickname, c.company, ...c.emails.map(e => e.value)].join(' '));
        const porTel = qd.length >= 3 && c.phones.some(p => digitos(p.value).includes(qd));
        if (!hay.includes(q) && !porTel) continue;
        items.push({ id: c.id, name: vcard.nombreVisible(c), sub: [c.company, (c.emails[0] || c.phones[0] || {}).value].filter(Boolean).join(' · ') });
        if (items.length >= 8) break;
      }
      res.json({ items });
    } catch (err) { sendError(res, err); }
  });

  // Exportar a vCard: todos o los de ?ids=a,b,c
  router.get('/export', async (req, res) => {
    try {
      const d = await readJson(archivo(req.user), VACIO);
      const etq = await readJson(path.join(kccDir(userRoot(req.user)), 'labels.json'), { labels: [] });
      const nombre = Object.fromEntries(etq.labels.map(l => [l.id, l.name]));
      const ids = req.query.ids ? new Set(String(req.query.ids).split(',')) : null;
      const sel = ids ? d.contacts.filter(c => ids.has(c.id)) : d.contacts;
      const cuerpo = sel.map(c => vcard.toVCard(c, (c.labels || []).map(l => nombre[l]).filter(Boolean))).join('');
      const unico = sel.length === 1 ? vcard.nombreVisible(sel[0]).replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) : 'contactos';
      res.set('Content-Disposition', `attachment; filename="${unico || 'contactos'}.vcf"`);
      res.type('text/vcard; charset=utf-8').send(cuerpo);
    } catch (err) { sendError(res, err); }
  });

  // Importar vCard: el cuerpo es el texto del .vcf
  router.post('/import', express.text({ type: () => true, limit: IMPORT_MAX_BYTES }), async (req, res) => {
    try {
      if (typeof req.body !== 'string' || !/BEGIN:VCARD/i.test(req.body)) throw new HttpError(400, 'El archivo no parece un .vcf de contactos');
      const leidos = vcard.parseVCards(req.body, MAX);
      // Las categorías pasan a etiquetas de color (se crean las que falten); "myContacts" es solo de Google
      const nombres = [...new Set(leidos.flatMap(c => c.categories))].filter(n => !/^(mycontacts|starred in android)$/i.test(n)).slice(0, 100);
      const idEtiqueta = {};
      for (const n of nombres) { const [id] = await labels.asegurar(req.user, [n]); if (id) idEtiqueta[n] = id; }

      const r = await updateJson(archivo(req.user), VACIO, (d) => {
        let creados = 0, duplicados = 0, invalidos = 0;
        for (const raw of leidos) {
          if (d.contacts.length >= MAX) throw new HttpError(400, `Has llegado al límite de ${MAX} contactos`);
          let c;
          try { c = limpia({ ...raw, labels: raw.categories.map(n => idEtiqueta[n]).filter(Boolean) }, null); }
          catch { invalidos++; continue; }
          if (esDuplicado(c, d.contacts)) { duplicados++; continue; }
          const ahora = Date.now();
          d.contacts.push({ ...c, id: newId(), createdAt: ahora, updatedAt: ahora });
          creados++;
        }
        return { creados, duplicados, invalidos, total: leidos.length };
      });
      log(req, 'contactos_importados', { creados: r.creados });
      res.json({ ok: true, ...r });
    } catch (err) { sendError(res, err); }
  });

  router.post('/', express.json(), async (req, res) => {
    try {
      const contact = await updateJson(archivo(req.user), VACIO, (d) => {
        if (d.contacts.length >= MAX) throw new HttpError(400, `Has llegado al límite de ${MAX} contactos`);
        const ahora = Date.now();
        const c = { ...limpia(req.body, null), id: newId(), createdAt: ahora, updatedAt: ahora };
        d.contacts.push(c);
        return c;
      });
      log(req, 'contacto_creado', { id: contact.id });
      res.json({ ok: true, contact });
    } catch (err) { sendError(res, err); }
  });

  router.put('/:id', express.json(), async (req, res) => {
    try {
      if (!idOk(req.params.id)) throw new HttpError(404, 'Contacto no encontrado');
      const contact = await updateJson(archivo(req.user), VACIO, (d) => {
        const i = d.contacts.findIndex(c => c.id === req.params.id);
        if (i < 0) throw new HttpError(404, 'Contacto no encontrado');
        const previo = d.contacts[i];
        d.contacts[i] = { ...limpia(req.body, previo), id: previo.id, createdAt: previo.createdAt, updatedAt: Date.now() };
        return d.contacts[i];
      });
      res.json({ ok: true, contact });
    } catch (err) { sendError(res, err); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      if (!idOk(req.params.id)) throw new HttpError(404, 'Contacto no encontrado');
      await updateJson(archivo(req.user), VACIO, (d) => {
        const n = d.contacts.length;
        d.contacts = d.contacts.filter(c => c.id !== req.params.id);
        if (d.contacts.length === n) throw new HttpError(404, 'Contacto no encontrado');
      });
      log(req, 'contacto_eliminado', { id: req.params.id });
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  // Etiquetas compartidas: cuántos contactos usa cada una y cómo se quita una borrada
  labels.registrarContador(async (user) => {
    const uso = {};
    const d = await readJson(archivo(user), VACIO);
    d.contacts.forEach(c => (c.labels || []).forEach(l => { uso[l] = (uso[l] || 0) + 1; }));
    return uso;
  });
  labels.registrarLimpieza(async (user, labelId) => {
    await updateJson(archivo(user), VACIO, (d) => {
      let tocado = false;
      d.contacts.forEach((c) => { if ((c.labels || []).includes(labelId)) { c.labels = c.labels.filter(l => l !== labelId); tocado = true; } });
      if (!tocado) return { __abort: true };
    });
  });

  return { router };
}

module.exports = createContacts;
