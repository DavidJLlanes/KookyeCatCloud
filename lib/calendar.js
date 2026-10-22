'use strict';
// Calendario. Las fechas se guardan "ingenuas" (sin zona horaria), como las ve el usuario:
//   día completo  -> 'YYYY-MM-DD'  (el fin es inclusivo: el último día)
//   con hora      -> 'YYYY-MM-DDTHH:mm'
// Así un evento "a las 9:00" sigue siendo a las 9:00 aunque cambie el horario de verano.
const path = require('path');
const crypto = require('crypto');
const holidays = require('./holidays');
const ical = require('./ical');
const { kccDir, updateJson, readJson, newId, HttpError, cleanColor, cleanStr, cleanIds } = require('./store');

const DAY = 86400000;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const msDe = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(s);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
};
const p2 = (n) => String(n).padStart(2, '0');
const diaDe = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`; };
const fechaDe = (ms) => { const d = new Date(ms); return `${diaDe(ms)}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };
const validaFecha = (s) => {
  if (!(RE_DIA.test(s) || RE_HORA.test(s))) return false;
  const ms = msDe(s);
  return diaDe(ms) === s.slice(0, 10);
};

const CALENDARIOS_BASE = [
  { id: 'personal', name: 'Personal', color: '#3b82f6', visible: true, system: false },
  { id: 'prompts', name: 'Prompts', color: '#8b5cf6', visible: true, system: true },
  { id: 'notas', name: 'Notas', color: '#f59e0b', visible: true, system: true },
  { id: 'archivos', name: 'Archivos', color: '#22c55e', visible: true, system: true },
];
const CAL_POR_ORIGEN = { prompt: 'prompts', note: 'notas', file: 'archivos' };
const TIPOS_ORIGEN = Object.keys(CAL_POR_ORIGEN);
// Recordatorios y tareas "colgados" de una nota o un contacto. A diferencia del origen (un único evento que
// es la fecha de la nota), una nota o un contacto puede tener tantos como haga falta.
const TIPOS_VINCULO = ['note', 'contact'];
function limpiaVinculo(l) {
  if (!l || typeof l !== 'object' || !TIPOS_VINCULO.includes(l.type) || !l.ref) return null;
  return { type: l.type, ref: cleanStr(l.ref, 200), title: cleanStr(l.title, 200) };
}

function limpiaRepeticion(r) {
  if (!r || typeof r !== 'object') return null;
  const freq = ['daily', 'weekly', 'monthly', 'yearly'].includes(r.freq) ? r.freq : null;
  if (!freq) return null;
  const out = { freq, interval: Math.min(Math.max(parseInt(r.interval, 10) || 1, 1), 99) };
  if (freq === 'weekly' && Array.isArray(r.byday)) {
    out.byday = [...new Set(r.byday.map(Number).filter(n => n >= 0 && n <= 6))].sort();
    if (!out.byday.length) delete out.byday;
  }
  if (r.until && RE_DIA.test(r.until)) out.until = r.until;
  else if (r.count) out.count = Math.min(Math.max(parseInt(r.count, 10) || 1, 1), 1000);
  return out;
}

function limpiaEvento(b, prev) {
  const o = { ...(prev || {}) };
  if (b.title !== undefined || !prev) o.title = cleanStr(b.title, 200).trim() || 'Sin título';
  if (b.description !== undefined) o.description = cleanStr(b.description, 5000);
  if (b.location !== undefined) o.location = cleanStr(b.location, 200);
  if (b.calendarId !== undefined) o.calendarId = cleanStr(b.calendarId, 40) || 'personal';
  if (b.color !== undefined) o.color = cleanColor(b.color, '');
  if (b.labels !== undefined) o.labels = cleanIds(b.labels);
  if (b.kind !== undefined) o.kind = b.kind === 'task' ? 'task' : 'event';
  if (b.link !== undefined) { const l = limpiaVinculo(b.link); if (l) o.link = l; else delete o.link; }
  if (b.done !== undefined) o.done = !!b.done;
  if (b.reminders !== undefined) {
    o.reminders = [...new Set((Array.isArray(b.reminders) ? b.reminders : [])
      .map(Number).filter(n => Number.isFinite(n) && n >= 0 && n <= 60 * 24 * 30))].slice(0, 5);
  }
  if (b.allDay !== undefined) o.allDay = !!b.allDay;
  if (b.start !== undefined) o.start = b.start;
  if (b.end !== undefined) o.end = b.end;
  if (b.repeat !== undefined) o.repeat = limpiaRepeticion(b.repeat);
  if (b.exdates !== undefined) {
    o.exdates = [...new Set((Array.isArray(b.exdates) ? b.exdates : []).filter(x => RE_DIA.test(String(x))))].slice(0, 500);
  }

  o.allDay = !!o.allDay;
  if (b.uid !== undefined) o.uid = cleanStr(b.uid, 200);
  // Una tarea puede no tener fecha: vive en la lista "Tareas sin fecha" hasta que se arrastra a un hueco
  if (!o.start && o.kind === 'task') {
    o.start = ''; o.end = ''; o.allDay = false; o.repeat = null; o.exdates = [];
    if (!o.reminders) o.reminders = [];
    if (!o.labels) o.labels = [];
    if (!o.calendarId) o.calendarId = 'personal';
    return o;
  }
  if (!validaFecha(o.start || '')) throw new HttpError(400, 'Fecha de inicio no válida');
  // El tipo de la fecha debe cuadrar con allDay: se normaliza en vez de rechazar
  if (o.allDay) {
    o.start = o.start.slice(0, 10);
    if (!o.end) o.end = o.start;
    o.end = o.end.slice(0, 10);
    if (!validaFecha(o.end)) throw new HttpError(400, 'Fecha de fin no válida');
  } else {
    if (o.start.length === 10) o.start += 'T09:00';
    if (!o.end) o.end = fechaDe(msDe(o.start) + 60 * 60000);
    if (o.end.length === 10) o.end += 'T10:00';
    if (!validaFecha(o.end)) throw new HttpError(400, 'Fecha de fin no válida');
  }
  if (msDe(o.end) < msDe(o.start)) o.end = o.allDay ? o.start : fechaDe(msDe(o.start) + 60 * 60000);
  if (!o.reminders) o.reminders = [];
  if (!o.labels) o.labels = [];
  if (!o.calendarId) o.calendarId = 'personal';
  if (!o.kind) o.kind = 'event';
  return o;
}

// Ocurrencias de un evento dentro de [desde, hasta] (días 'YYYY-MM-DD', ambos inclusive)
function expande(ev, desde, hasta) {
  if (!ev.start) return [];                     // tarea sin fecha: no ocupa ningún día
  const ini = msDe(ev.start);
  const dur = msDe(ev.end) - ini;
  const extra = ev.allDay ? DAY : 0;            // el último día de un evento de día completo cuenta entero
  const finVentana = msDe(hasta) + DAY;         // exclusivo
  const iniVentana = msDe(desde);
  const solapa = (ms) => ms < finVentana && ms + dur + extra > iniVentana;
  const mk = (ms) => {
    const s = ev.allDay ? diaDe(ms) : fechaDe(ms);
    const e = ev.allDay ? diaDe(ms + dur) : fechaDe(ms + dur);
    return { ...ev, start: s, end: e, occurrence: diaDe(ms), recurring: !!ev.repeat };
  };
  if (!ev.repeat) return solapa(ini) ? [mk(ini)] : [];

  const r = ev.repeat;
  const salida = [];
  const ex = new Set(ev.exdates || []);
  const tope = r.until ? Math.min(finVentana, msDe(r.until) + DAY) : finVentana;
  const horaMs = ini - Math.floor(ini / DAY) * DAY;
  const dia0 = ini - horaMs;
  let n = 0;                                    // ocurrencias contadas desde el origen
  const emite = (diaMs) => {
    const ms = diaMs + horaMs;
    n++;
    if (r.count && n > r.count) return false;
    if (ms >= tope) return false;
    if (!ex.has(diaDe(ms)) && solapa(ms)) salida.push(mk(ms));
    return salida.length < 1000;
  };

  if (r.freq === 'daily') {
    let k = 0;
    if (!r.count) k = Math.max(0, Math.floor((iniVentana - dur - extra - dia0) / DAY / r.interval));
    n = k;
    for (; ; k++) if (!emite(dia0 + k * r.interval * DAY)) break;
  } else if (r.freq === 'weekly') {
    const dow0 = new Date(ini).getUTCDay();
    const dows = (r.byday && r.byday.length) ? r.byday : [dow0];
    const domingo0 = dia0 - dow0 * DAY;
    let dia = dia0;
    if (!r.count) dia = Math.max(dia0, Math.floor((iniVentana - dur - extra) / DAY) * DAY);
    for (; dia < tope; dia += DAY) {
      const sem = Math.floor((dia - domingo0) / (7 * DAY));
      if (sem % r.interval !== 0 || !dows.includes(new Date(dia).getUTCDay())) continue;
      if (!emite(dia)) break;
    }
  } else {
    const f0 = new Date(dia0);
    const paso = r.freq === 'yearly' ? 12 * r.interval : r.interval;
    let k = 0;
    if (!r.count) {
      const f = new Date(iniVentana - dur - extra);
      const meses = (f.getUTCFullYear() - f0.getUTCFullYear()) * 12 + f.getUTCMonth() - f0.getUTCMonth();
      k = Math.max(0, Math.floor(meses / paso) - 1);
    }
    n = k;
    for (; k < 100000; k++) {
      const mes = f0.getUTCMonth() + k * paso;
      const y = f0.getUTCFullYear() + Math.floor(mes / 12);
      const m = ((mes % 12) + 12) % 12;
      const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      if (!emite(Date.UTC(y, m, Math.min(f0.getUTCDate(), ultimo)))) break;
    }
  }
  return salida;
}

function createCalendar({ express, userRoot, sendError, registrarActividad, icalIndexFile }) {
  const router = express.Router();
  const archivo = (user) => path.join(kccDir(userRoot(user)), 'calendar.json');
  const base = () => ({ calendars: CALENDARIOS_BASE.map(c => ({ ...c })), events: [] });

  // Garantiza que existan los calendarios del sistema aunque el archivo sea antiguo
  const normaliza = (d) => {
    if (!Array.isArray(d.calendars)) d.calendars = [];
    if (!Array.isArray(d.events)) d.events = [];
    if (!d.holidays) d.holidays = { enabled: false, region: '', visible: true, color: '#ef4444' };
    if (!d.ical) d.ical = {};
    for (const c of CALENDARIOS_BASE) if (!d.calendars.some(x => x.id === c.id)) d.calendars.push({ ...c });
    return d;
  };
  const leer = async (user) => normaliza(await readJson(archivo(user), base));
  const mutar = (user, fn) => updateJson(archivo(user), base, (d) => fn(normaliza(d)));
  const calExiste = (d, id) => d.calendars.some(c => c.id === id);
  const rangoOk = (desde, hasta) => {
    if (!RE_DIA.test(desde || '') || !RE_DIA.test(hasta || '')) throw new HttpError(400, 'Rango no válido');
    if (msDe(hasta) - msDe(desde) > 400 * DAY) throw new HttpError(400, 'Rango demasiado grande');
  };

  // El calendario de festivos es virtual: no guarda eventos, se calcula al pedir un rango
  const calFestivos = (d) => ({
    id: 'festivos', name: `Festivos · ${(holidays.REGIONES[d.holidays.region] || {}).name || 'España'}`,
    color: d.holidays.color || '#ef4444', visible: d.holidays.visible !== false, system: true, virtual: true,
  });
  const listaCalendarios = (d) => [...d.calendars, ...(d.holidays.enabled ? [calFestivos(d)] : [])];
  const eventosFestivos = (d, desde, hasta) => (!d.holidays.enabled ? [] : holidays.entre(desde, hasta, d.holidays.region).map(h => ({
    id: 'hol:' + h.date, title: h.title, start: h.date, end: h.date, allDay: true, calendarId: 'festivos', kind: 'event',
    holiday: true, readonly: true, scope: h.scope, occurrence: h.date, recurring: false, labels: [], reminders: [],
  })));

  router.get('/', async (req, res) => {
    try {
      const d = await leer(req.user);
      res.json({ calendars: listaCalendarios(d) });
    } catch (err) { sendError(res, err); }
  });

  router.post('/calendars', express.json(), async (req, res) => {
    try {
      const name = cleanStr(req.body.name, 60).trim();
      if (!name) throw new HttpError(400, 'Falta el nombre');
      const cal = await mutar(req.user, (d) => {
        if (d.calendars.length >= 40) throw new HttpError(400, 'Demasiados calendarios');
        const c = { id: newId(), name, color: cleanColor(req.body.color, '#14b8a6'), visible: true, system: false };
        d.calendars.push(c);
        return c;
      });
      res.json({ ok: true, calendar: cal });
    } catch (err) { sendError(res, err); }
  });

  router.put('/calendars/:id', express.json(), async (req, res) => {
    try {
      const cal = await mutar(req.user, (d) => {
        if (req.params.id === 'festivos') {        // el calendario virtual solo guarda color y visibilidad
          if (req.body.color !== undefined) d.holidays.color = cleanColor(req.body.color, d.holidays.color);
          if (req.body.visible !== undefined) d.holidays.visible = !!req.body.visible;
          return calFestivos(d);
        }
        const c = d.calendars.find(x => x.id === req.params.id);
        if (!c) throw new HttpError(404, 'Calendario no encontrado');
        if (req.body.name !== undefined) c.name = cleanStr(req.body.name, 60).trim() || c.name;
        if (req.body.color !== undefined) c.color = cleanColor(req.body.color, c.color);
        if (req.body.visible !== undefined) c.visible = !!req.body.visible;
        return c;
      });
      res.json({ ok: true, calendar: cal });
    } catch (err) { sendError(res, err); }
  });

  router.delete('/calendars/:id', async (req, res) => {
    try {
      await mutar(req.user, (d) => {
        const c = d.calendars.find(x => x.id === req.params.id);
        if (!c) throw new HttpError(404, 'Calendario no encontrado');
        if (c.system || c.id === 'personal') throw new HttpError(400, 'Este calendario no se puede borrar');
        d.calendars = d.calendars.filter(x => x.id !== c.id);
        // Sus eventos pasan a Personal, no se pierden
        d.events.forEach(e => { if (e.calendarId === c.id) e.calendarId = 'personal'; });
      });
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  router.get('/events', async (req, res) => {
    try {
      const { from, to } = req.query;
      rangoOk(from, to);
      const d = await leer(req.user);
      const out = [];
      for (const ev of d.events) out.push(...expande(ev, from, to));
      out.push(...eventosFestivos(d, from, to));
      out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
      res.json({ events: out });
    } catch (err) { sendError(res, err); }
  });

  /* ---------- Tareas sin fecha ---------- */
  router.get('/tasks', async (req, res) => {
    try {
      const d = await leer(req.user);
      const tasks = d.events.filter(e => e.kind === 'task' && !e.start).sort((a, b) => a.createdAt - b.createdAt);
      res.json({ tasks });
    } catch (err) { sendError(res, err); }
  });

  /* ---------- Festivos ---------- */
  router.get('/holidays', async (req, res) => {
    try {
      const d = await leer(req.user);
      res.json({ enabled: !!d.holidays.enabled, region: d.holidays.region || '', regions: holidays.lista() });
    } catch (err) { sendError(res, err); }
  });
  router.put('/holidays', express.json(), async (req, res) => {
    try {
      const out = await mutar(req.user, (d) => {
        if (req.body.region !== undefined) d.holidays.region = holidays.regionValida(String(req.body.region));
        if (req.body.enabled !== undefined) d.holidays.enabled = !!req.body.enabled && !!d.holidays.region;
        return { enabled: d.holidays.enabled, region: d.holidays.region };
      });
      res.json({ ok: true, ...out });
    } catch (err) { sendError(res, err); }
  });

  /* ---------- Importar (los eventos llegan ya interpretados desde un .ics) ---------- */
  router.post('/import', express.json({ limit: '5mb' }), async (req, res) => {
    try {
      const { calendar, events } = req.body || {};
      if (!Array.isArray(events) || events.length > 1000) throw new HttpError(400, 'Importa como máximo 1000 eventos por petición');
      const r = await mutar(req.user, (d) => {
        let calId = 'personal';
        if (calendar && calendar.id && calExiste(d, calendar.id)) calId = calendar.id;
        else if (calendar && calendar.name) {
          if (d.calendars.length >= 40) throw new HttpError(400, 'Demasiados calendarios');
          const c = { id: newId(), name: cleanStr(calendar.name, 60).trim() || 'Importado', color: cleanColor(calendar.color, '#14b8a6'), visible: true, system: false };
          d.calendars.push(c); calId = c.id;
        }
        // Reimportar el mismo archivo no duplica: los eventos con el mismo UID se saltan
        const uids = new Set(d.events.filter(e => e.calendarId === calId && e.uid).map(e => e.uid));
        let creados = 0, omitidos = 0, errores = 0;
        for (const raw of events) {
          if (d.events.length >= 50000) break;
          try {
            if (raw.uid && uids.has(raw.uid)) { omitidos++; continue; }
            const ev = limpiaEvento({ ...raw, calendarId: calId }, null);
            ev.id = newId(); ev.createdAt = ev.updatedAt = Date.now();
            d.events.push(ev); if (ev.uid) uids.add(ev.uid); creados++;
          } catch { errores++; }
        }
        return { calendarId: calId, creados, omitidos, errores };
      });
      registrarActividad(req, 'calendario_importado', { creados: r.creados });
      res.json({ ok: true, ...r });
    } catch (err) { sendError(res, err); }
  });

  /* ---------- Suscripción iCal de solo lectura ---------- */
  const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
  const indiceToken = (fn) => updateJson(icalIndexFile, {}, fn);
  const estadoIcal = (d) => ({ enabled: !!d.ical.token, token: d.ical.token || '', exclude: d.ical.exclude || [], holidays: d.ical.holidays !== false });

  router.get('/ical', async (req, res) => {
    try { res.json(estadoIcal((await leer(req.user)))); }
    catch (err) { sendError(res, err); }
  });
  router.post('/ical', express.json(), async (req, res) => {
    try {
      if (!icalIndexFile) throw new HttpError(501, 'La suscripción no está disponible');
      const accion = String(req.body.action || '');
      const out = await mutar(req.user, async (d) => {
        const quitar = d.ical.token ? hashToken(d.ical.token) : null;
        if (accion === 'enable' || accion === 'rotate') {
          const token = crypto.randomBytes(32).toString('hex');
          await indiceToken((idx) => { if (quitar) delete idx[quitar]; idx[hashToken(token)] = { username: req.user.username, role: req.user.role }; });
          d.ical.token = token;
        } else if (accion === 'disable') {
          if (quitar) await indiceToken((idx) => { delete idx[quitar]; });
          delete d.ical.token;
        } else if (accion === 'settings') {
          if (Array.isArray(req.body.exclude)) d.ical.exclude = cleanIds(req.body.exclude, 60);
          if (req.body.holidays !== undefined) d.ical.holidays = !!req.body.holidays;
        } else throw new HttpError(400, 'Acción no válida');
        return estadoIcal(d);
      });
      res.json({ ok: true, ...out });
    } catch (err) { sendError(res, err); }
  });

  router.get('/search', async (req, res) => {
    try {
      const q = cleanStr(req.query.q, 100).toLowerCase().trim();
      if (!q) return res.json({ events: [] });
      const d = await leer(req.user);
      const events = d.events
        .filter(e => (e.title + ' ' + (e.description || '') + ' ' + (e.location || '')).toLowerCase().includes(q))
        .sort((a, b) => (a.start < b.start ? 1 : -1)).slice(0, 100);
      res.json({ events });
    } catch (err) { sendError(res, err); }
  });

  // Eventos de un origen (para enseñar "en el calendario: 3 mar" en la ficha de un prompt)
  router.get('/by-source', async (req, res) => {
    try {
      const d = await leer(req.user);
      res.json({ events: d.events.filter(e => e.source && e.source.type === req.query.type && e.source.ref === req.query.ref) });
    } catch (err) { sendError(res, err); }
  });

  // Recordatorios y tareas vinculados a una nota o a un contacto
  router.get('/by-link', async (req, res) => {
    try {
      if (!TIPOS_VINCULO.includes(req.query.type) || !req.query.ref) throw new HttpError(400, 'Vínculo no válido');
      const d = await leer(req.user);
      const events = d.events.filter(e => e.link && e.link.type === req.query.type && e.link.ref === req.query.ref)
        .sort((a, b) => (a.done - b.done) || ((a.start || '9999') < (b.start || '9999') ? -1 : 1));
      res.json({ events });
    } catch (err) { sendError(res, err); }
  });

  // Cada módulo con eventos propios (prompts, notas) se entera cuando se mueve o borra el
  // evento desde el calendario, para que su ficha enseñe siempre la fecha buena.
  const ganchos = {};
  const avisaOrigen = async (user, ev, nuevoEv) => {
    const g = ev && ev.source && ganchos[ev.source.type];
    if (g) { try { await g(user, ev.source.ref, nuevoEv); } catch { /* el origen ya no existe */ } }
  };

  async function crearEvento(user, body) {
    return mutar(user, (d) => {
      if (d.events.length >= 50000) throw new HttpError(400, 'Demasiados eventos');
      const ev = limpiaEvento(body, null);
      if (!calExiste(d, ev.calendarId)) ev.calendarId = 'personal';
      const s = body.source;
      if (s && TIPOS_ORIGEN.includes(s.type) && s.ref) {
        ev.source = { type: s.type, ref: cleanStr(s.ref, 600), title: cleanStr(s.title, 200) };
        if (!body.calendarId) ev.calendarId = CAL_POR_ORIGEN[s.type];
      }
      ev.id = newId();
      ev.createdAt = ev.updatedAt = Date.now();
      d.events.push(ev);
      return ev;
    });
  }

  router.get('/events/:id', async (req, res) => {
    try {
      const ev = (await leer(req.user)).events.find(e => e.id === req.params.id);
      if (!ev) throw new HttpError(404, 'Evento no encontrado');
      res.json({ event: ev });
    } catch (err) { sendError(res, err); }
  });

  router.post('/events', express.json({ limit: '200kb' }), async (req, res) => {
    try {
      const ev = await crearEvento(req.user, req.body || {});
      registrarActividad(req, 'evento_creado', { id: ev.id });
      res.json({ ok: true, event: ev });
    } catch (err) { sendError(res, err); }
  });

  router.put('/events/:id', express.json({ limit: '200kb' }), async (req, res) => {
    try {
      const scope = req.query.scope === 'one' ? 'one' : 'all';
      const ev = await mutar(req.user, (d) => {
        const i = d.events.findIndex(e => e.id === req.params.id);
        if (i < 0) throw new HttpError(404, 'Evento no encontrado');
        const orig = d.events[i];
        if (scope === 'one' && orig.repeat) {
          // Solo esta aparición: se oculta del original y nace un evento suelto con los cambios
          const fecha = RE_DIA.test(req.query.date || '') ? req.query.date : orig.start.slice(0, 10);
          orig.exdates = [...new Set([...(orig.exdates || []), fecha])];
          const suelto = { ...orig, repeat: null };
          delete suelto.exdates;
          const copia = limpiaEvento({ ...req.body, repeat: null }, suelto);
          if (copia.source) delete copia.source;
          copia.id = newId();
          copia.createdAt = copia.updatedAt = Date.now();
          d.events.push(copia);
          return copia;
        }
        const nuevo = limpiaEvento(req.body || {}, orig);
        if (!calExiste(d, nuevo.calendarId)) nuevo.calendarId = 'personal';
        nuevo.updatedAt = Date.now();
        d.events[i] = nuevo;
        return nuevo;
      });
      await avisaOrigen(req.user, ev, ev);
      res.json({ ok: true, event: ev });
    } catch (err) { sendError(res, err); }
  });

  router.delete('/events/:id', async (req, res) => {
    try {
      const quitado = await mutar(req.user, (d) => {
        const i = d.events.findIndex(e => e.id === req.params.id);
        if (i < 0) return null;
        const ev = d.events[i];
        if (req.query.scope === 'one' && ev.repeat && RE_DIA.test(req.query.date || '')) {
          ev.exdates = [...new Set([...(ev.exdates || []), req.query.date])];
          return null;
        }
        d.events.splice(i, 1);
        return ev;
      });
      if (quitado) await avisaOrigen(req.user, quitado, null);
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  // --- API interna para los demás módulos ---
  const core = {
    crearEvento,
    // Para la ruta pública /ical/<token>.ics: de qué usuario es ese token
    async userPorToken(token) {
      if (!icalIndexFile || !/^[a-f0-9]{64}$/.test(token)) return null;
      const idx = await readJson(icalIndexFile, {});
      return idx[hashToken(token)] || null;
    },
    async icsFeed(user, urlBase) {
      const d = await leer(user);
      if (!d.ical.token) return null;
      const excluidos = new Set(d.ical.exclude || []);
      const eventos = d.events.filter(e => !excluidos.has(e.calendarId));
      let festivos = [];
      if (d.holidays.enabled && d.ical.holidays !== false && !excluidos.has('festivos')) {
        const y = new Date().getFullYear();
        festivos = holidays.entre(`${y - 1}-01-01`, `${y + 2}-12-31`, d.holidays.region);
      }
      return ical.construir({ nombre: `KookyeCatCloud · ${user.username}`, eventos, calendarios: d.calendars, festivos, urlBase });
    },
    registraOrigen(tipo, fn) { ganchos[tipo] = fn; },
    // Mantiene el evento de un origen: lo crea, lo mueve o lo quita según `cal`
    //   cal === undefined -> no se toca;  null/false/sin fecha -> se quita;  { date, time?, calendarId? } -> upsert
    async sincronizaOrigen(user, tipo, ref, titulo, cal) {
      if (cal === undefined) return;
      await mutar(user, (d) => {
        const i = d.events.findIndex(e => e.source && e.source.type === tipo && e.source.ref === ref);
        if (!cal || !cal.date) {
          if (i < 0) return { __abort: true };
          d.events.splice(i, 1);
          return;
        }
        if (!RE_DIA.test(cal.date) || (cal.time && !/^\d{2}:\d{2}$/.test(cal.time))) {
          throw new HttpError(400, 'Fecha del calendario no válida');
        }
        const allDay = !cal.time;
        const campos = {
          title: titulo, allDay,
          start: allDay ? cal.date : `${cal.date}T${cal.time}`,
          calendarId: cal.calendarId || (i >= 0 ? d.events[i].calendarId : CAL_POR_ORIGEN[tipo]),
        };
        if (allDay) campos.end = cal.date;
        if (i >= 0) {
          const prev = { ...d.events[i] };
          if (allDay !== prev.allDay) delete prev.end;
          d.events[i] = limpiaEvento(campos, prev);
          if (!calExiste(d, d.events[i].calendarId)) d.events[i].calendarId = 'personal';
          d.events[i].updatedAt = Date.now();
        } else {
          const ev = limpiaEvento(campos, null);
          if (!calExiste(d, ev.calendarId)) ev.calendarId = CAL_POR_ORIGEN[tipo];
          ev.source = { type: tipo, ref: cleanStr(ref, 600), title: cleanStr(titulo, 200) };
          ev.id = newId();
          ev.createdAt = ev.updatedAt = Date.now();
          d.events.push(ev);
        }
      });
    },
    quitaOrigen(user, tipo, ref) { return core.sincronizaOrigen(user, tipo, ref, '', null); },
    // Se borró del todo la nota o el contacto: sus recordatorios y tareas ya no tienen a qué apuntar
    async quitaVinculos(user, tipo, ref) {
      await mutar(user, (d) => {
        const antes = d.events.length;
        d.events = d.events.filter(e => !(e.link && e.link.type === tipo && e.link.ref === ref));
        if (d.events.length === antes) return { __abort: true };
      });
    },
    async renombraVinculos(user, tipo, ref, titulo) {
      await mutar(user, (d) => {
        let tocado = false;
        d.events.forEach(e => { if (e.link && e.link.type === tipo && e.link.ref === ref && e.link.title !== titulo) { e.link.title = cleanStr(titulo, 200); tocado = true; } });
        if (!tocado) return { __abort: true };
      });
    },
    // El título del origen cambió: se refleja en su evento
    async renombraOrigen(user, tipo, ref, titulo) {
      await mutar(user, (d) => {
        const e = d.events.find(x => x.source && x.source.type === tipo && x.source.ref === ref);
        if (!e) return { __abort: true };
        e.title = cleanStr(titulo, 200) || e.title;
        e.source.title = cleanStr(titulo, 200);
      });
    },
    // Una ruta de archivo cambió (renombrado o movimiento): el evento sigue apuntando al archivo
    async mueveOrigenArchivo(user, desde, hacia) {
      await mutar(user, (d) => {
        let tocado = false;
        d.events.forEach(e => {
          if (!e.source || e.source.type !== 'file') return;
          if (e.source.ref === desde || e.source.ref.startsWith(desde + '/')) {
            e.source.ref = hacia + e.source.ref.slice(desde.length);
            if (e.source.ref === hacia) { e.source.title = path.basename(hacia); e.title = e.source.title; }
            tocado = true;
          }
        });
        if (!tocado) return { __abort: true };
      });
    },
    // Un archivo o carpeta fue a la papelera: fuera sus eventos (y los de lo que contenía)
    async quitaOrigenArchivo(user, rel) {
      await mutar(user, (d) => {
        const antes = d.events.length;
        d.events = d.events.filter(e => !(e.source && e.source.type === 'file' &&
          (e.source.ref === rel || e.source.ref.startsWith(rel + '/'))));
        if (d.events.length === antes) return { __abort: true };
      });
    },
    async eventoDeOrigen(user, tipo, ref) {
      const d = await leer(user);
      return d.events.find(e => e.source && e.source.type === tipo && e.source.ref === ref) || null;
    },
    async quitaEtiqueta(user, labelId) {
      await mutar(user, (d) => {
        let tocado = false;
        d.events.forEach(e => {
          if ((e.labels || []).includes(labelId)) { e.labels = e.labels.filter(l => l !== labelId); tocado = true; }
        });
        if (!tocado) return { __abort: true };
      });
    },
    async usoEtiquetas(user) {
      const d = await leer(user);
      const uso = {};
      d.events.forEach(e => (e.labels || []).forEach(l => { uso[l] = (uso[l] || 0) + 1; }));
      return uso;
    },
    async buscar(user, q) {
      const d = await leer(user);
      return d.events.filter(e => (e.title + ' ' + (e.description || '')).toLowerCase().includes(q)).slice(0, 20);
    },
  };

  return { router, core };
}

module.exports = createCalendar;
module.exports.expande = expande;
module.exports.limpiaEvento = limpiaEvento;
