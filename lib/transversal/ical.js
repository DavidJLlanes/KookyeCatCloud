'use strict';
// Suscripción iCal: sin cookie ni sesión (Google/Apple/Outlook no pueden enviarlas); el acceso
// lo da un token de 256 bits en la URL, que el usuario puede regenerar o apagar cuando quiera.
function montaIcal({ app, calendar, BASE_PATH }) {
  app.get(/^\/ical\/([a-f0-9]{64})\.ics$/, async (req, res) => {
    try {
      const user = await calendar.userPorToken(req.params[0]);
      const feed = user && await calendar.icsFeed(user, `${req.protocol}://${req.get('host')}${BASE_PATH}/`);
      if (!feed) return res.status(404).type('text/plain').send('No encontrado');
      res.set({ 'Cache-Control': 'private, max-age=300', 'Content-Disposition': 'inline; filename="calendario.ics"' });
      res.type('text/calendar; charset=utf-8').send(feed);
    } catch (err) { res.status(500).type('text/plain').send('Error'); }
  });
}

module.exports = { montaIcal };
