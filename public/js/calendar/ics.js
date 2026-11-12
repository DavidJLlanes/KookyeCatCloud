'use strict';
/* ---------------------------------------------------------------
   Lector de archivos .ics (iCalendar). Se ejecuta en el navegador: así las horas en UTC
   o con zona horaria (Google, Outlook…) se pasan a la hora local de quien importa, que es
   como las guarda el calendario de la app.

   Admite: eventos y tareas, todo el día, UTC / TZID / flotantes, repetición (diaria, semanal
   con días, mensual y anual, con COUNT o UNTIL), EXDATE, instancias modificadas
   (RECURRENCE-ID), avisos (VALARM) y estado completado.
   No admite: repeticiones del tipo "el segundo martes de cada mes" (se aproximan al mismo
   día del mes) ni reglas con BYSETPOS/BYMONTHDAY múltiples.
--------------------------------------------------------------- */
(function () {
  const p2 = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const ymdhm = (d) => `${ymd(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}`;

  const desescapa = (s) => String(s || '').replace(/\\([nN,;\\])/g, (m, c) => (c === 'n' || c === 'N' ? '\n' : c));

  // Hora de pared en una zona (TZID) -> Date real, con Intl: sin tabla de zonas propia
  function enZona(y, mo, d, h, mi, tz) {
    try {
      const guess = Date.UTC(y, mo - 1, d, h, mi);
      const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
      const partes = Object.fromEntries(f.formatToParts(new Date(guess)).map(p => [p.type, +p.value]));
      const vista = Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour, partes.minute);
      return new Date(guess - (vista - guess));
    } catch { return new Date(y, mo - 1, d, h, mi); }
  }

  // '20261024T103000Z' | '20261024T103000' | '20261024' -> { date: Date, soloDia: bool }
  function fecha(valor, params) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/.exec(String(valor).trim());
    if (!m) return null;
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    const solo = (params.VALUE === 'DATE') || m[4] === undefined;
    if (solo) return { date: new Date(y, mo - 1, d), soloDia: true };
    const h = +m[4], mi = +m[5];
    if (m[7]) return { date: new Date(Date.UTC(y, mo - 1, d, h, mi)), soloDia: false };       // UTC -> hora local
    if (params.TZID) return { date: enZona(y, mo, d, h, mi, params.TZID), soloDia: false };
    return { date: new Date(y, mo - 1, d, h, mi), soloDia: false };                           // flotante
  }

  // 'PT1H30M', 'P1D', '-PT15M' -> minutos (valor absoluto) y signo
  function duracion(v) {
    const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v).trim());
    if (!m) return null;
    const min = (+(m[2] || 0)) * 10080 + (+(m[3] || 0)) * 1440 + (+(m[4] || 0)) * 60 + (+(m[5] || 0));
    return { min, antes: m[1] === '-' };
  }

  const DIAS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  function repeticion(valor, aviso) {
    const r = {};
    String(valor).split(';').forEach(kv => { const i = kv.indexOf('='); if (i > 0) r[kv.slice(0, i).toUpperCase()] = kv.slice(i + 1); });
    const freq = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[r.FREQ];
    if (!freq) { aviso('repetición no admitida (' + (r.FREQ || '?') + ')'); return null; }
    const out = { freq, interval: Math.max(1, parseInt(r.INTERVAL, 10) || 1) };
    if (r.BYDAY) {
      if (freq === 'weekly') {
        const dias = r.BYDAY.split(',').map(x => DIAS[x.replace(/^[+-]?\d+/, '')]).filter(x => x !== undefined);
        if (dias.length) out.byday = dias;
      } else aviso('repetición por día de la semana aproximada al mismo día del mes');
    }
    if (r.COUNT) out.count = Math.min(1000, parseInt(r.COUNT, 10) || 1);
    else if (r.UNTIL) { const f = fecha(r.UNTIL, {}); if (f) out.until = ymd(f.date); }
    return out;
  }

  function parse(texto) {
    const avisos = new Set();
    const aviso = (m) => avisos.add(m);
    const lineas = String(texto).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    const eventos = []; let nombre = '';
    let cur = null, alarma = null;

    for (const linea of lineas) {
      if (!linea) continue;
      const i = linea.indexOf(':');
      if (i < 0) continue;
      const cab = linea.slice(0, i), valor = linea.slice(i + 1);
      const partes = cab.split(';');
      const nom = partes[0].toUpperCase();
      const params = {};
      partes.slice(1).forEach(p => { const j = p.indexOf('='); if (j > 0) params[p.slice(0, j).toUpperCase()] = p.slice(j + 1).replace(/^"|"$/g, ''); });

      if (nom === 'BEGIN') {
        if (valor === 'VEVENT' || valor === 'VTODO') cur = { tipo: valor, props: [], alarmas: [] };
        else if (valor === 'VALARM' && cur) alarma = {};
        continue;
      }
      if (nom === 'END') {
        if (valor === 'VALARM') { if (cur && alarma && alarma.trigger !== undefined) cur.alarmas.push(alarma.trigger); alarma = null; }
        else if ((valor === 'VEVENT' || valor === 'VTODO') && cur) { eventos.push(cur); cur = null; }
        continue;
      }
      if (nom === 'X-WR-CALNAME' && !cur) { nombre = desescapa(valor); continue; }
      if (alarma) {
        if (nom === 'TRIGGER' && params.VALUE !== 'DATE-TIME') { const d = duracion(valor); if (d && d.antes !== undefined) alarma.trigger = d.antes || d.min === 0 ? d.min : undefined; }
        continue;
      }
      if (cur) cur.props.push({ nom, params, valor });
    }

    const get = (c, n) => c.props.find(p => p.nom === n);
    const todos = (c, n) => c.props.filter(p => p.nom === n);
    const salida = []; const maestros = new Map(); const sueltos = [];

    for (const c of eventos) {
      const ev = { title: '', description: '', location: '', kind: c.tipo === 'VTODO' ? 'task' : 'event', reminders: [] };
      ev.title = desescapa((get(c, 'SUMMARY') || {}).valor) || 'Sin título';
      ev.description = desescapa((get(c, 'DESCRIPTION') || {}).valor);
      ev.location = desescapa((get(c, 'LOCATION') || {}).valor);
      const uid = (get(c, 'UID') || {}).valor;
      if (uid) ev.uid = uid.slice(0, 180);
      if (c.tipo === 'VTODO' && /COMPLETED/i.test((get(c, 'STATUS') || {}).valor || '')) ev.done = true;

      const ini = get(c, 'DTSTART') || (c.tipo === 'VTODO' ? get(c, 'DUE') : null);
      const a = ini ? fecha(ini.valor, ini.params) : null;
      if (!a) {
        if (c.tipo === 'VTODO') { ev.start = ''; ev.end = ''; ev.allDay = false; salida.push(ev); continue; }
        aviso('eventos sin fecha de inicio omitidos'); continue;
      }
      ev.allDay = a.soloDia;
      const fin = get(c, 'DTEND') || (get(c, 'DTSTART') ? get(c, 'DUE') : null);
      const durProp = get(c, 'DURATION');
      let b = fin ? fecha(fin.valor, fin.params) : null;
      if (!b && durProp) { const d = duracion(durProp.valor); if (d) b = { date: new Date(a.date.getTime() + d.min * 60000), soloDia: a.soloDia }; }
      if (ev.allDay) {
        ev.start = ymd(a.date);
        let e = b ? new Date(b.date.getTime() - 86400000) : a.date;      // en iCal el fin de un día completo es exclusivo
        if (e < a.date) e = a.date;
        ev.end = ymd(e);
      } else {
        ev.start = ymdhm(a.date);
        ev.end = b ? ymdhm(b.date) : ymdhm(new Date(a.date.getTime() + (c.tipo === 'VTODO' ? 30 : 60) * 60000));
        if (ev.end < ev.start) ev.end = ev.start;
      }
      const rr = get(c, 'RRULE');
      if (rr) { const r = repeticion(rr.valor, aviso); if (r) ev.repeat = r; }
      const ex = [];
      todos(c, 'EXDATE').forEach(p => p.valor.split(',').forEach(v => { const f = fecha(v, p.params); if (f) ex.push(ymd(f.date)); }));
      if (ex.length) ev.exdates = ex;
      ev.reminders = [...new Set(c.alarmas)].filter(m => m <= 60 * 24 * 30).slice(0, 5);

      const rid = get(c, 'RECURRENCE-ID');
      if (rid) {
        // Una aparición modificada de una serie: pasa a evento suelto y se oculta en la serie
        const f = fecha(rid.valor, rid.params);
        sueltos.push({ ev, uid, dia: f ? ymd(f.date) : null });
        continue;
      }
      if (uid && ev.repeat) maestros.set(uid, ev);
      salida.push(ev);
    }
    for (const s of sueltos) {
      const m = s.uid && maestros.get(s.uid);
      if (m && s.dia) m.exdates = [...new Set([...(m.exdates || []), s.dia])];
      s.ev.uid = (s.uid || 'mod') + '#' + (s.dia || '');
      salida.push(s.ev);
    }
    return { events: salida, name: nombre, warnings: [...avisos] };
  }

  window.ICS = { parse };
})();
