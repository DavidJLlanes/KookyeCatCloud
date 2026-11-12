'use strict';
// Forma de un marcador y de una carpeta, y su validación (se rechaza con aviso; con `recortar`, en importaciones, se adapta).
const { newId, HttpError, corto, textoLargo, cleanColor } = require('../nucleo/store');

const MAX_MARCADORES = 5000, MAX_CARPETAS = 200;
const RE_ID = /^[a-f0-9]{16}$/;

const urlOk = (v) => { const s = String(v || '').trim(); return /^https?:\/\/[^\s]+$/i.test(s) && s.length <= 2000 ? s : ''; };
// Si falta el esquema se asume https (se pega «ejemplo.com» y funciona)
const conEsquema = (v) => { const s = String(v || '').trim(); return s && !/^[a-z][a-z0-9+.-]*:/i.test(s) ? `https://${s}` : s; };
const anfitrion = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

function limpiaMarcador(b, prev, carpetas, recortar) {
  const m = prev ? { ...prev } : { id: newId(), carpeta: '', color: '', icono: null, visitas: 0, createdAt: Date.now() };
  const tiene = (k) => b && Object.prototype.hasOwnProperty.call(b, k);
  if (tiene('url')) {
    const u = urlOk(conEsquema(b.url));
    if (!u) throw new HttpError(400, String(b.url || '').length > 2000 ? 'La dirección es demasiado larga (máximo 2000)' : 'Escribe una dirección web válida (http:// o https://)');
    if (prev && anfitrion(u) !== anfitrion(prev.url)) { m.icono = null; delete m.iconoIntento; }       // otra web: el icono viejo ya no vale
    m.url = u;
  }
  if (!m.url) throw new HttpError(400, 'Escribe la dirección de la web');
  if (tiene('nombre')) m.nombre = corto(b.nombre, 120, 'El nombre', recortar);
  if (!m.nombre) m.nombre = anfitrion(m.url) || 'Sin nombre';
  if (tiene('descripcion')) m.descripcion = textoLargo(b.descripcion, 2000, 'La descripción', recortar);
  if (tiene('color')) m.color = cleanColor(b.color, '');
  if (tiene('carpeta')) m.carpeta = RE_ID.test(String(b.carpeta)) && carpetas.some(c => c.id === b.carpeta) ? b.carpeta : '';
  if (m.descripcion === undefined) m.descripcion = '';
  m.updatedAt = Date.now();
  return m;
}

function limpiaCarpeta(b, prev, existentes) {
  const c = prev ? { ...prev } : { id: newId(), createdAt: Date.now() };
  if (!prev || (b && 'nombre' in b)) c.nombre = corto(b && b.nombre, 60, 'El nombre de la carpeta');
  if (!c.nombre) throw new HttpError(400, 'Escribe el nombre de la carpeta');
  const clave = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (existentes.some(x => x.id !== c.id && clave(x.nombre) === clave(c.nombre))) throw new HttpError(409, 'Ya tienes una carpeta con ese nombre');
  if (!prev || (b && 'color' in b)) c.color = cleanColor(b && b.color, '');
  c.color = c.color || '';
  return c;
}

module.exports = { MAX_MARCADORES, MAX_CARPETAS, RE_ID, limpiaMarcador, limpiaCarpeta, anfitrion };
