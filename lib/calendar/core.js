'use strict';
// API interna para los demás módulos.
const path = require('path');
const holidays = require('./festivos');
const ical = require('./icalendar');
const store = require('../nucleo/store');
const { readJson, newId, HttpError, cleanStr } = store;
const { DAY, RE_DIA, msDe, diaDe } = require('./fechas');
const { CAL_POR_ORIGEN, limpiaEvento } = require('./evento');
const { expande } = require('./recurrencia');

function montaCore(ctx) {
  const { calExiste, crearEvento, ganchos, hashToken, icalIndexFile, leer, mutar } = ctx;
  let vinculos = {};   // lo registra Recordatorios: qué hacer cuando se borra o se renombra la nota o el contacto al que apuntan

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
    registraVinculos(fns) { vinculos = fns || {}; },
    // Recordatorios y tareas que antes colgaban de una nota o un contacto (ahora viven en Recordatorios; sirve para migrarlos)
    async eventosVinculados(user) { return (await leer(user)).events.filter(e => e.link && e.link.ref); },
    async quitaEvento(user, id) {
      await mutar(user, (d) => { const n = d.events.length; d.events = d.events.filter(e => e.id !== id); if (d.events.length === n) return { __abort: true }; });
    },
    // Para los avisos push: recordatorios (minutos antes) de eventos y tareas cuyo momento cae en (desdeMs, hastaMs].
    // Las horas son de reloj sin zona, como el resto del calendario. Un evento de día completo avisa a `horaDia` (HH:MM) de su día.
    async recordatorios(user, desdeMs, hastaMs, horaDia = '09:00') {
      const d = await leer(user), out = [];
      const [hh, mm] = String(horaDia).split(':').map(Number), minDia = (hh * 60 + mm) * 60000;
      for (const ev of d.events) {
        if (!ev.start || !(ev.reminders || []).length || ev.done || (ev.source && ev.source.type === 'pago')) continue;
        for (const o of expande(ev, diaDe(desdeMs), diaDe(hastaMs + 31 * DAY))) {
          const inicio = o.allDay ? msDe(o.start.slice(0, 10)) + minDia : msDe(o.start);
          for (const m of o.reminders || []) {
            const t = inicio - m * 60000;
            if (t > desdeMs && t <= hastaMs) out.push({ id: ev.id, ocurrencia: o.occurrence, titulo: o.title, start: o.start, minutos: m, t, diaCompleto: !!o.allDay, tarea: ev.kind === 'task' });
          }
        }
      }
      return out;
    },
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
          __recorta: true,   // viene de otra sección (nota, juego, prompt…): se adapta
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
      if (vinculos.quita) await vinculos.quita(user, tipo, ref);
    },
    async renombraVinculos(user, tipo, ref, titulo) {
      await mutar(user, (d) => {
        let tocado = false;
        d.events.forEach(e => { if (e.link && e.link.type === tipo && e.link.ref === ref && e.link.title !== titulo) { e.link.title = cleanStr(titulo, 200); tocado = true; } });
        if (!tocado) return { __abort: true };
      });
      if (vinculos.renombra) await vinculos.renombra(user, tipo, ref, titulo);
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

  return { core };
}

module.exports = { montaCore };
