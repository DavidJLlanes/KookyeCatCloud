'use strict';
// Importar · CSV con asignación de columnas: a una base nueva, a una base existente o a contactos.
// `ajuste` (del cliente): { tabla, destino: 'nueva'|'base'|'contactos', nombre?, baseId?, columnas: [{ col, nombre, tipo, ignora? }], destinoCols?: [índiceDeColumnaDeLaBase|-1], campos?: [clave|''] }
const csv = require('./csv');
const contactosCsv = require('./contactos-csv');
const { HttpError } = require('../store');

const MAX_OPCIONES = 40;
const TIPOS = ['text', 'number', 'date', 'checkbox', 'select', 'multiselect', 'url', 'email', 'phone'];
const trozos = (v) => String(v || '').split(/\s*[,;|]\s*/).map(x => x.trim()).filter(Boolean);

// Convierte la columna k de la tabla al tipo pedido. Devuelve { tipo, opciones?, valores, vacios } (lo que no se entiende queda vacío y se cuenta)
function tipa(filas, k, tipo) {
  let malos = 0; const crudo = filas.map(f => String(f[k] == null ? '' : f[k]).trim());
  if (tipo === 'number') { const valores = crudo.map(v => { if (!v) return ''; const n = csv.numero(v); if (n === null) { malos++; return ''; } return n; }); return { tipo, malos, valores }; }
  if (tipo === 'date') { const valores = crudo.map(v => { if (!v) return ''; const d = csv.fecha(v); if (d === null) { malos++; return ''; } return d; }); return { tipo, valores, malos }; }
  if (tipo === 'checkbox') return { tipo, valores: crudo.map(v => csv.casilla(v) === true), malos };
  if (tipo === 'select' || tipo === 'multiselect') {
    const opc = [...new Set(crudo.flatMap(v => (tipo === 'select' ? [v] : trozos(v))).filter(Boolean).map(v => v.slice(0, 40)))];
    if (opc.length > MAX_OPCIONES) return { tipo: 'text', valores: crudo, malos, nota: `tenía más de ${MAX_OPCIONES} valores distintos y se deja como texto` };
    return { tipo, opciones: opc, malos, valores: crudo.map(v => (tipo === 'select' ? v.slice(0, 40) : trozos(v).map(x => x.slice(0, 40)))) };
  }
  return { tipo: TIPOS.includes(tipo) ? tipo : 'text', valores: crudo, malos };
}

async function ejecutaTabla({ user, tabla, ajuste, bases, contactos }) {
  const r = { destino: ajuste.destino, nombre: tabla.nombre, filas: 0, avisos: [] };
  if (ajuste.destino === 'contactos') {
    const campos = (ajuste.campos || []).slice(0, tabla.cabecera.length).map(c => (contactosCsv.CAMPOS.some(([k]) => k === c) ? c : ''));
    if (!campos.some(Boolean)) throw new HttpError(400, 'Asigna al menos una columna a un campo del contacto');
    const res = await contactos.importaLeidos(user, contactosCsv.aContactos(tabla, campos));
    return { ...r, filas: res.creados, duplicados: res.duplicados, invalidos: res.invalidos };
  }
  const usadas = (ajuste.columnas || []).filter(c => c && !c.ignora && Number.isInteger(c.col) && c.col >= 0 && c.col < tabla.cabecera.length);
  if (ajuste.destino === 'base') {
    const destino = tabla.cabecera.map(() => -1);
    const base = (await bases.lista(user)).find(b => b.id === ajuste.baseId);
    if (!base) throw new HttpError(400, 'La base de destino no existe');
    (ajuste.destinoCols || []).forEach((d, k) => { if (k < destino.length && Number.isInteger(d)) destino[k] = d; });
    if (!destino.some(d => d >= 0)) throw new HttpError(400, 'Asigna al menos una columna a una columna de la base');
    const a = await bases.anadeFilas(user, base.id, tabla.filas, destino);
    if (a.omitidas) r.avisos.push(`${a.omitidas} fila(s) no caben: la base llegó a su máximo`);
    return { ...r, nombre: base.name, filas: a.anadidas, baseId: base.id };
  }
  if (!usadas.length) throw new HttpError(400, 'Deja al menos una columna para crear la base');
  const nombres = new Set(), columnas = [], tipadas = [];
  for (const u of usadas) {
    let nombre = String(u.nombre || tabla.cabecera[u.col]).trim().slice(0, 60) || `Columna ${u.col + 1}`, n = nombre, i = 2;
    while (nombres.has(n.toLocaleLowerCase('es'))) n = `${nombre} ${i++}`;
    nombres.add(n.toLocaleLowerCase('es'));
    const t = tipa(tabla.filas, u.col, u.tipo);
    if (t.nota) r.avisos.push(`«${n}» ${t.nota}`);
    if (t.malos) r.avisos.push(`«${n}»: ${t.malos} valor(es) no se entendieron como ${t.tipo === 'number' ? 'número' : 'fecha'} y quedan vacíos`);
    columnas.push({ nombre: n, tipo: t.tipo, opciones: t.opciones }); tipadas.push(t.valores);
  }
  const filas = tabla.filas.map((_, i) => tipadas.map(v => v[i]));
  const b = await bases.importaTabla(user, { nombre: String(ajuste.nombre || tabla.nombre).trim() || 'Base importada', columnas, filas });
  return { ...r, nombre: b.nombre, filas: b.filas, baseId: b.id };
}

module.exports = { ejecutaTabla, tipa };
