'use strict';
// Número de elementos de cada sección de «Datos de la app» (además de lo que ocupa): 45 prompts, 120 contactos…
// Los recuentos salen de `contar(user)` (los mismos que usa la gamificación) y de la papelera. Lo que no tiene
// un recuento con sentido (ajustes, caja fuerte cifrada, transferencias) se deja sin número.
const POR_SECCION = {
  notes: [['notas', 'nota', 'notas']],
  prompts: [['prompts', 'prompt', 'prompts']],
  contacts: [['contactos', 'contacto', 'contactos']],
  codigo: [['cod_snips', 'proyecto', 'proyectos'], ['cod_archivos', 'archivo', 'archivos']],
  bases: [['db_bases', 'base', 'bases'], ['db_filas', 'fila', 'filas']],
  pagos: [['pg_total', 'pago', 'pagos']],
  marcadores: [['marcadores', 'marcador', 'marcadores']],
  recordatorios: [['rc_total', 'recordatorio', 'recordatorios']],
  albums: [['albumes', 'álbum', 'álbumes']],
  juegos: [['juegos', 'juego', 'juegos']],
  calendar: [['eventos', 'evento', 'eventos']],
};
const fmt = (n) => Number(n).toLocaleString('es-ES');

/** { seccion: '45 prompts' | '3 bases · 120 filas' } */
async function elementosDe(user, { contar, papelera }) {
  const out = {};
  let c = null;
  try { c = contar ? await contar(user) : null; } catch { c = null; }
  if (c) {
    for (const [id, partes] of Object.entries(POR_SECCION)) {
      const txt = partes.filter(([k]) => k in c).map(([k, uno, varios]) => `${fmt(c[k] || 0)} ${Number(c[k]) === 1 ? uno : varios}`);
      if (txt.length) out[id] = txt.join(' · ');
    }
  }
  try { if (papelera) { const n = (await papelera(user)).length; out.trash = `${fmt(n)} ${n === 1 ? 'elemento' : 'elementos'}`; } } catch { /* papelera ilegible: sin número */ }
  return out;
}

module.exports = { elementosDe };
