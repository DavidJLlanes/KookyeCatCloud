'use strict';
// Cableado entre módulos: el calendario y las etiquetas necesitan saber qué hacer con lo de notas, prompts y juegos
// sin importarlos (así cada módulo sigue siendo independiente).
function conectaModulos({ labels, calendar, prompts, games, readNotes, writeNotes }) {
  calendar.registraOrigen('prompt', (user, id, ev) => prompts.setCal(user, id, ev));
  calendar.registraOrigen('game', (user, id, ev) => games.setCal(user, id, ev));
  calendar.registraOrigen('note', async (user, id, ev) => {
    const data = await readNotes(user);
    const it = data.items.find(i => i.id === id);
    if (!it) return;
    if (ev) it.cal = { date: ev.start.slice(0, 10), time: ev.allDay ? '' : ev.start.slice(11, 16) };
    else delete it.cal;
    await writeNotes(user, data);
  });
  labels.registrarContador((user) => calendar.usoEtiquetas(user));
  labels.registrarLimpieza((user, id) => calendar.quitaEtiqueta(user, id));
  labels.registrarContador(async (user) => {
    const uso = {};
    (await readNotes(user)).items.forEach(i => (i.labels || []).forEach(l => { uso[l] = (uso[l] || 0) + 1; }));
    return uso;
  });
  labels.registrarLimpieza(async (user, id) => {
    const data = await readNotes(user);
    let tocado = false;
    data.items.forEach(i => { if ((i.labels || []).includes(id)) { i.labels = i.labels.filter(l => l !== id); tocado = true; } });
    if (tocado) await writeNotes(user, data);
  });
}

module.exports = { conectaModulos };
