'use strict';
// Forma de un recordatorio y su validación (se rechaza con aviso; con `recortar`, en importaciones, se adapta).
//   fecha: 'YYYY-MM-DD' o '' (sin fecha: un pendiente suelto)  ·  hora: 'HH:MM' o '' (todo el día)
//   antes: minutos de antelación del aviso (-1: sin aviso)  ·  calendario: ¿se muestra también en el calendario?
//   repite: ver repeticion.js (null: no se repite)  ·  vueltas: cuántas veces se ha cumplido uno que se repite
//   vinculo: { tipo, ref, titulo } con la nota, el contacto, el archivo… al que apunta
const { newId, HttpError, corto, textoLargo, cleanStr } = require('../store');
const { limpiaRepite } = require('./repeticion');

const MAX_RECORDATORIOS = 3000;
const RE_ID = /^[a-f0-9]{16}$/;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const ANTES = [-1, 0, 10, 60, 1440];
const TIPOS_VINCULO = ['note', 'contact', 'file', 'prompt', 'marcador'];

const diaValido = (s) => RE_DIA.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

function limpiaVinculo(v) {
  if (v === null || v === '') return null;
  if (!v || typeof v !== 'object' || !TIPOS_VINCULO.includes(v.tipo) || !v.ref) throw new HttpError(400, 'El vínculo del recordatorio no es válido');
  return { tipo: v.tipo, ref: cleanStr(v.ref, 600), titulo: cleanStr(v.titulo, 200) };
}

function limpia(b, prev, recortar) {
  const r = prev ? { ...prev } : { id: newId(), fecha: '', hora: '', antes: 0, calendario: false, vinculo: null, notas: '', hecho: false, hechoEn: 0, repite: null, vueltas: 0, createdAt: Date.now() };
  const tiene = (k) => b && Object.prototype.hasOwnProperty.call(b, k);
  if (tiene('titulo')) r.titulo = corto(b.titulo, 200, 'El título', recortar);
  if (!r.titulo) throw new HttpError(400, 'Escribe qué quieres recordar');
  if (tiene('notas')) r.notas = textoLargo(b.notas, 2000, 'Las notas', recortar);
  if (tiene('fecha')) {
    const f = String(b.fecha || '');
    if (f && !diaValido(f)) throw new HttpError(400, 'La fecha no es válida');
    r.fecha = f;
  }
  if (tiene('hora')) {
    const h = String(b.hora || '');
    if (h && !RE_HORA.test(h)) throw new HttpError(400, 'La hora no es válida (HH:MM)');
    r.hora = h;
  }
  if (!r.fecha) { r.hora = ''; r.calendario = false; }
  if (tiene('antes')) {
    const a = Number(b.antes);
    if (!ANTES.includes(a)) throw new HttpError(400, 'El aviso no es válido');
    r.antes = a;
  }
  if (tiene('calendario')) r.calendario = !!r.fecha && (b.calendario === true || b.calendario === 'true');
  // La repetición necesita fecha; si se quita la fecha, se quita también (y una fecha nueva reinicia el día de partida)
  if (tiene('repite') || tiene('fecha')) r.repite = r.fecha || (tiene('repite') && b.repite) ? limpiaRepite(tiene('repite') ? b.repite : r.repite, r.fecha) : null;   // sin fecha: se pierde la repetición, salvo que se pida expresamente (400)
  if (tiene('vinculo')) r.vinculo = limpiaVinculo(b.vinculo);
  if (tiene('hecho')) { const h = b.hecho === true || b.hecho === 'true'; if (h !== r.hecho) r.hechoEn = h ? Date.now() : 0; r.hecho = h; }
  r.updatedAt = Date.now();
  return r;
}

module.exports = { MAX_RECORDATORIOS, RE_ID, ANTES, TIPOS_VINCULO, limpia };
