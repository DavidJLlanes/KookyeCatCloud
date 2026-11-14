'use strict';
// Suscripción iCal: sin cookie ni sesión (Google/Apple/Outlook no pueden enviarlas); el acceso
// lo da un token de 256 bits en la URL, que el usuario puede regenerar o apagar cuando quiera.
function montaIcal({ app, calendar, BASE_PATH, loadUsers }) {
  app.get(/^\/ical\/([a-f0-9]{64})\.ics$/, async (req, res) => {
    try {
      const guardado = await calendar.userPorToken(req.params[0]);
      // El índice de tokens guarda el usuario y el rol de cuando se creó el enlace: se contrasta con las cuentas de ahora
      // (una cuenta borrada no debe seguir publicando su calendario, ni un rol antiguo abrir otro espacio de datos)
      const vivo = guardado && loadUsers().find(u => u.username === guardado.username);
      const user = vivo ? { username: vivo.username, role: vivo.role } : null;
      const feed = user && await calendar.icsFeed(user, `${req.protocol}://${req.get('host')}${BASE_PATH}/`);
      if (!feed) return res.status(404).type('text/plain').send('No encontrado');
      res.set({ 'Cache-Control': 'private, max-age=300', 'Content-Disposition': 'inline; filename="calendario.ics"' });
      res.type('text/calendar; charset=utf-8').send(feed);
    } catch (err) { res.status(500).type('text/plain').send('Error'); }
  });
}

module.exports = { montaIcal };
