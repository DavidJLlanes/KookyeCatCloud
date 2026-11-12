'use strict';
// Programador de la copia diaria. Revisa la hora de Madrid cada minuto dentro del propio proceso de la app:
// no hay cron, ni servicio, ni nada nuevo en el sistema. Intenta la copia a las 3:00 y reintenta a las 4:00 y a las 5:00
// mientras ese día no haya ninguna correcta. Si la app estaba parada a las 3:00 y arranca dentro de esa franja, la hace al arrancar.
const ZONA = 'Europe/Madrid';
const HORAS = [3, 4, 5];
const MINUTO = 60 * 1000;

// Fecha (AAAA-MM-DD) y hora (0-23) de Madrid para un instante dado
function ahoraMadrid(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) };
}

// ¿Toca intentar la copia ahora? Solo en las horas programadas, una vez por hora, y no si ese día ya hay una correcta
function debeIntentar(ahora, { ultimoIntento, ultimaOkFecha }) {
  const clave = `${ahora.fecha}T${ahora.hora}`;
  const toca = HORAS.includes(ahora.hora) && clave !== ultimoIntento && ultimaOkFecha !== ahora.fecha;
  return { toca, clave };
}

// `copia()` hace la copia; `ultimaOk()` devuelve la fecha de Madrid de la última correcta (o null);
// `enMarcha()` indica si ya hay una copia en curso (manual o programada)
function arrancaPrograma({ copia, ultimaOk, enMarcha }) {
  let ultimoIntento = null;
  const tick = async () => {
    if (enMarcha()) return;
    const { toca, clave } = debeIntentar(ahoraMadrid(), { ultimoIntento, ultimaOkFecha: await ultimaOk() });
    if (!toca) return;
    ultimoIntento = clave;
    await copia();
  };
  const timer = setInterval(() => { tick().catch(() => {}); }, MINUTO);
  timer.unref();
  return { tick, parar: () => clearInterval(timer) };
}

module.exports = { ahoraMadrid, debeIntentar, arrancaPrograma, HORAS };
