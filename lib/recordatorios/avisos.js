'use strict';
// Cuándo avisa un recordatorio. Las horas son de reloj sin zona (como el calendario). Un recordatorio de todo el día avisa a
// `horaDia` de su día; uno con hora, `antes` minutos antes. Sin fecha o con «Sin aviso» (antes < 0) no avisa nunca.
const MIN = 60000;
const msDe = (dia, hm) => { const [y, m, d] = dia.split('-').map(Number), [h, n] = String(hm || '00:00').split(':').map(Number); return Date.UTC(y, m - 1, d, h, n); };

function momentoAviso(r, horaDia = '09:00') {
  if (!r.fecha || r.antes < 0) return null;
  return msDe(r.fecha, r.hora || horaDia) - r.antes * MIN;
}

// Los pendientes de aviso cuyo momento cae en (desdeMs, hastaMs]; los hechos no avisan.
// La clave incluye fecha, hora y antelación: si se cambia o se pospone el recordatorio, vuelve a avisar.
function pendientesDeAviso(items, desdeMs, hastaMs, horaDia) {
  const out = [];
  for (const r of items) {
    if (r.hecho) continue;
    const t = momentoAviso(r, horaDia);
    if (t !== null && t > desdeMs && t <= hastaMs) out.push({ id: r.id, clave: `rec:${r.id}:${r.fecha}:${r.hora}:${r.antes}`, titulo: r.titulo, hora: r.hora, antes: r.antes, t });
  }
  return out.sort((a, b) => a.t - b.t);
}

module.exports = { momentoAviso, pendientesDeAviso, msDe };
