'use strict';
// Recordatorios: lo que quieres que te recuerde la app, suelto o ligado a una nota, un contacto, un archivo, un prompt o un marcador.
// Pueden mostrarse también en el calendario (opcional) y avisan por push (lib/push/fuentes/recordatorios.js) y dentro de la app.
// Datos: <raíz>/.kcc/recordatorios/data.json  { recordatorios: [ … ], migrado: true }
// Piezas: modelo.js (forma y validación), avisos.js (cuándo avisa cada uno), migracion.js (los antiguos del calendario), resumen.js (logros).
const path = require('path');
const store = require('../store');
const { kccDir, readJson, updateJson, HttpError } = store;
const modelo = require('./modelo');
const { pendientesDeAviso } = require('./avisos');
const { migra } = require('./migracion');
const { resumenRecordatorios } = require('./resumen');
const { ahora, sumaDias } = require('../push/tiempo');

const ORIGEN = 'recordatorio';   // tipo del evento del calendario que lo representa

function createRecordatorios({ express, userRoot, sendError, registrarActividad, alCambiar, calendar }) {
  const router = express.Router();
  const json = express.json({ limit: '32kb' });
  const archivo = (user) => path.join(kccDir(userRoot(user), 'recordatorios'), 'data.json');
  const VACIO = () => ({ recordatorios: [], migrado: false });
  const normaliza = (d) => { d.recordatorios = Array.isArray(d.recordatorios) ? d.recordatorios : []; return d; };
  const lee = async (user) => normaliza(await readJson(archivo(user), VACIO));
  const muta = (user, fn) => updateJson(archivo(user), VACIO, (d) => fn(normaliza(d)));
  const cambio = (user) => { try { if (alCambiar) alCambiar(user); } catch { /* la gamificación no debe romper nada */ } };
  const log = (req, accion, detalle) => { if (registrarActividad) registrarActividad(req, 'recordatorios', { accion, ...detalle }); };
  const en = (d, id) => { const r = modelo.RE_ID.test(String(id)) ? d.recordatorios.find(x => x.id === id) : null; if (!r) throw new HttpError(404, 'No existe ese recordatorio'); return r; };

  // El evento del calendario sigue al recordatorio: se crea, se mueve o se quita según `calendario` y la fecha
  const sincroniza = (user, r) => calendar.sincronizaOrigen(user, ORIGEN, r.id, r.titulo, r.calendario && r.fecha ? { date: r.fecha, time: r.hora } : null);
  const conCalendario = async (user, r, res, extra = {}) => {
    let calendarioFallo = false;
    try { await sincroniza(user, r); } catch { calendarioFallo = true; }
    cambio(user);
    res.json({ recordatorio: r, ...(calendarioFallo ? { calendarioFallo } : {}), ...extra });
  };

  router.get('/', async (req, res) => {
    try {
      let d = await lee(req.user);
      if (!d.migrado) { await migra({ user: req.user, calendar, muta: (fn) => muta(req.user, fn) }); d = await lee(req.user); }
      res.json({ recordatorios: d.recordatorios, ahora: ahora() });
    } catch (e) { sendError(res, e); }
  });

  router.post('/', json, async (req, res) => {
    try {
      let creado;
      await muta(req.user, (d) => {
        if (d.recordatorios.length >= modelo.MAX_RECORDATORIOS) throw new HttpError(400, 'Has llegado al máximo de recordatorios: borra algunos ya hechos');
        creado = store.marcaEdicion(modelo.limpia(req.body, null), req);
        d.recordatorios.push(creado);
      });
      log(req, 'crear', { titulo: creado.titulo });
      await conCalendario(req.user, creado, res);
    } catch (e) { sendError(res, e); }
  });

  router.put('/:id', json, async (req, res) => {
    try {
      let guardado;
      await muta(req.user, (d) => {
        const r = en(d, req.params.id);
        store.compruebaBase(r, req);
        guardado = store.marcaEdicion(modelo.limpia(req.body, r), req);
        d.recordatorios[d.recordatorios.indexOf(r)] = guardado;
      });
      await conCalendario(req.user, guardado, res);
    } catch (e) { sendError(res, e); }
  });

  router.post('/:id/hecho', json, async (req, res) => {
    try {
      let guardado;
      await muta(req.user, (d) => { guardado = modelo.limpia({ hecho: !(req.body && req.body.hecho === false) }, en(d, req.params.id)); d.recordatorios[d.recordatorios.findIndex(x => x.id === guardado.id)] = guardado; });
      if (guardado.hecho) log(req, 'hecho', { titulo: guardado.titulo });
      cambio(req.user);
      res.json({ recordatorio: guardado });
    } catch (e) { sendError(res, e); }
  });

  // Pospone: «minutos» a partir de ahora (hora de reloj de la app) o «manana» (mañana a la misma hora, o a las 9:00 si no tenía)
  router.post('/:id/posponer', json, async (req, res) => {
    try {
      const min = Number((req.body || {}).minutos), manana = (req.body || {}).hasta === 'manana';
      if (!manana && !(min >= 1 && min <= 7 * 1440)) throw new HttpError(400, 'Elige cuánto posponer');
      const ya = ahora();
      let guardado;
      await muta(req.user, (d) => {
        const r = en(d, req.params.id);
        let fecha, hora;
        if (manana) { fecha = sumaDias(ya.dia, 1); hora = r.hora || '09:00'; }
        else { const t = new Date(ya.ms + min * 60000); fecha = t.toISOString().slice(0, 10); hora = t.toISOString().slice(11, 16); }
        guardado = modelo.limpia({ fecha, hora, hecho: false, antes: 0 }, r);   // avisa a la nueva hora (no «10 min antes»: ya habría pasado)
        d.recordatorios[d.recordatorios.indexOf(r)] = guardado;
      });
      await conCalendario(req.user, guardado, res);
    } catch (e) { sendError(res, e); }
  });

  // Se aparta 30 días en .kcc/borrados/recordatorios/ (lib/store.js, guardaBorrado)
  router.delete('/:id', async (req, res) => {
    try {
      let quitado;
      await muta(req.user, async (d) => {
        const r = en(d, req.params.id);
        await store.guardaBorrado(userRoot(req.user), 'recordatorios', r.id, r);
        quitado = r; d.recordatorios.splice(d.recordatorios.indexOf(r), 1);
      });
      await calendar.quitaOrigen(req.user, ORIGEN, quitado.id).catch(() => {});
      log(req, 'borrar', { titulo: quitado.titulo });
      cambio(req.user);
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  // Lo que pasa fuera de aquí: el calendario mueve o borra el evento, o se borra/renombra la nota o el contacto al que apuntan
  calendar.registraOrigen(ORIGEN, (user, id, ev) => muta(user, (d) => {
    const r = d.recordatorios.find(x => x.id === id); if (!r) return { __abort: true };
    if (ev) { r.fecha = ev.start.slice(0, 10); r.hora = ev.allDay ? '' : ev.start.slice(11, 16); } else r.calendario = false;
    r.updatedAt = Date.now();
  }));
  calendar.registraVinculos({
    quita: (user, tipo, ref) => muta(user, async (d) => {
      const fuera = d.recordatorios.filter(r => r.vinculo && r.vinculo.tipo === tipo && r.vinculo.ref === ref);
      if (!fuera.length) return { __abort: true };
      for (const r of fuera) await store.guardaBorrado(userRoot(user), 'recordatorios', r.id, r);
      d.recordatorios = d.recordatorios.filter(r => !fuera.includes(r));
      for (const r of fuera) await calendar.quitaOrigen(user, ORIGEN, r.id).catch(() => {});
    }),
    renombra: (user, tipo, ref, titulo) => muta(user, (d) => {
      let tocado = false;
      d.recordatorios.forEach(r => { if (r.vinculo && r.vinculo.tipo === tipo && r.vinculo.ref === ref && r.vinculo.titulo !== titulo) { r.vinculo.titulo = String(titulo).slice(0, 200); tocado = true; } });
      if (!tocado) return { __abort: true };
    }),
  });

  const core = {
    resumen: async (user) => resumenRecordatorios(await lee(user)),
    // Para los avisos push: los que tocan avisar en (desdeMs, hastaMs]
    async avisos(user, desdeMs, hastaMs, horaDia) { return pendientesDeAviso((await lee(user)).recordatorios, desdeMs, hastaMs, horaDia); },
  };
  return { router, core };
}

module.exports = createRecordatorios;
