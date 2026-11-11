'use strict';
// Búsqueda global: notas, prompts y eventos (los archivos ya tienen /api/search).
const fsp = require('fs').promises;

function montaOmni({ app, auth, sendError, readNotes, notaFile, promptsCore, calendarCore }) {
  app.get('/api/omni', auth, async (req, res) => {
    try {
      const q = String(req.query.q || '').toLowerCase().trim().slice(0, 100);
      if (q.length < 2) return res.json({ notes: [], prompts: [], events: [] });
      const data = await readNotes(req.user);
      const notes = [];
      for (const it of data.items) {
        if (notes.length >= 20) break;
        if (it.title.toLowerCase().includes(q)) { notes.push({ id: it.id, title: it.title, type: it.type }); continue; }
        if (it.type === 'note') {
          try {
            const body = await fsp.readFile(notaFile(req.user, it.id), 'utf8');
            if (body.toLowerCase().includes(q)) notes.push({ id: it.id, title: it.title, type: it.type });
          } catch {}
        }
      }
      const [prompts, events] = await Promise.all([
        promptsCore.buscar(req.user, q),
        calendarCore.buscar(req.user, q),
      ]);
      res.json({ notes, prompts, events: events.map(e => ({ id: e.id, title: e.title, start: e.start, allDay: e.allDay, calendarId: e.calendarId })) });
    } catch (err) { sendError(res, err); }
  });
}

module.exports = { montaOmni };
