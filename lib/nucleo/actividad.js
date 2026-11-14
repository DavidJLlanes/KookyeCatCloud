'use strict';
/* ---------------- Registro de actividad ----------------
   Un evento por línea (JSONL), fácil de seguir con tail -f. Se recorta solo
   para que nadie tenga que acordarse de vaciarlo. */
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');

function createActividad({ express, auth, sendError, ACTIVITY_FILE, ACTIVITY_MAX, ACTIVITY_DIAS }) {
  // El registro lleva usuarios, IP y nombres de archivo: solo lo lee quien ejecuta la app (los registros antiguos nacieron 644)
  try { fs.chmodSync(ACTIVITY_FILE, 0o600); } catch { /* aún no existe */ }
  const router = express.Router();
  function registrarActividad(req, accion, detalle) {
    try {
      const entry = {
        t: Date.now(),
        user: (req.user && req.user.username) || (detalle && detalle.username) || null,
        accion,
        ip: req.ip,
        detalle: detalle || {},
      };
      actividadEnVuelo++;
      fs.appendFile(ACTIVITY_FILE, JSON.stringify(entry) + '\n', { mode: 0o600 }, () => { actividadEnVuelo--; });
    } catch { /* un fallo aquí no debe tumbar la petición real */ }
  }
  let actividadEnVuelo = 0;   // escrituras pendientes: la poda espera a que terminen para no perder ninguna línea
  // Poda el registro: quita lo que supera ACTIVITY_DIAS de antigüedad y recorta a ACTIVITY_MAX líneas
  // Síncrona y atómica: mientras corre no puede llegar ninguna línea nueva (el bucle está ocupado) y antes espera a que
  // terminen las que estaban escribiéndose; antes una línea registrada durante la poda podía perderse.
  function podarActividad() {
    if (actividadEnVuelo) { setTimeout(podarActividad, 250).unref(); return; }
    try {
      let data; try { data = fs.readFileSync(ACTIVITY_FILE, 'utf8'); } catch { return; }
      const desde = Date.now() - ACTIVITY_DIAS * 86400000;
      const todas = data.split('\n').filter(Boolean);
      let lineas = todas.filter((l) => { try { return JSON.parse(l).t >= desde; } catch { return false; } });
      if (lineas.length > ACTIVITY_MAX) lineas = lineas.slice(-ACTIVITY_MAX);
      if (lineas.length === todas.length) return;
      const tmp = `${ACTIVITY_FILE}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(tmp, lineas.length ? lineas.join('\n') + '\n' : '', { mode: 0o600 });
      fs.renameSync(tmp, ACTIVITY_FILE);
    } catch (e) { console.warn('[actividad] no se pudo podar el registro:', e.message); }
  }

  setTimeout(podarActividad, 5000).unref();
  setInterval(podarActividad, 10 * 60 * 1000).unref();

  router.get('/api/activity', auth, async (req, res) => {
    try {
      const limite = Math.min(Number(req.query.limit) || 100, 500);
      let datos = '';
      try { datos = await fsp.readFile(ACTIVITY_FILE, 'utf8'); } catch { /* aún no hay actividad registrada */ }
      let entradas = datos.split('\n').filter(Boolean)
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
      if (req.user.role !== 'admin') entradas = entradas.filter(e => e.user === req.user.username);
      entradas.reverse();
      res.json({ items: entradas.slice(0, limite) });
    } catch (err) { sendError(res, err); }
  });

  return { router, registrarActividad };
}

module.exports = createActividad;
