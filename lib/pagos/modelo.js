'use strict';
// Forma de un pago y su validación. Lo que no cabe o no es válido se RECHAZA con aviso (nunca se recorta en silencio);
// con `recortar` (importaciones) se adapta.
const { newId, HttpError, corto, textoLargo } = require('../nucleo/store');
const { esDia, sumaMeses } = require('./fechas');

const FRECUENCIAS = Object.assign(Object.create(null), { unico: 0, mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 });
const METODOS = ['', 'domiciliacion', 'tarjeta', 'transferencia', 'efectivo', 'otro'];
const MAX_PAGOS = 2000, MAX_HISTORIAL = 60;
const SEMILLA_CATEGORIAS = ['Seguros', 'Suministros', 'Suscripciones', 'Impuestos', 'Préstamos y financiación', 'Comunidad y alquiler', 'Telefonía e internet', 'Otros'];

const SEMILLA_BANCOS = ['CaixaBank', 'BBVA', 'Santander', 'Sabadell', 'Bankinter', 'ING', 'Openbank', 'Unicaja', 'Abanca', 'Ibercaja', 'Kutxabank', 'EVO Banco', 'Cajamar', 'Revolut', 'N26', 'PayPal'];

const urlOk = (v) => { const s = String(v || '').trim(); return /^https?:\/\/[^\s]+$/i.test(s) ? s : ''; };

function numero(v, nombre, recortar) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) { if (recortar) return null; throw new HttpError(400, `${nombre}: escribe un número igual o mayor que 0`); }
  if (n > 1e9) { if (recortar) return 1e9; throw new HttpError(400, `${nombre}: la cantidad es demasiado grande`); }
  return Math.round(n * 100) / 100;
}

// Valida lo que llega en `b` y lo aplica sobre `prev` (o sobre un pago nuevo). Solo toca los campos presentes.
function limpia(b, prev, recortar) {
  const p = prev ? { ...prev } : { id: newId(), activo: true, recordar: true, avisoDias: 3, frecuencia: 'mensual', metodo: '', historial: [], nPagos: 0, createdAt: Date.now() };
  const tiene = (k) => b && Object.prototype.hasOwnProperty.call(b, k);
  if (tiene('nombre')) p.nombre = corto(b.nombre, 120, 'El nombre', recortar);
  if (!p.nombre) throw new HttpError(400, 'Escribe el nombre del pago (por ejemplo «Seguro del hogar»)');
  if (tiene('compania')) p.compania = corto(b.compania, 120, 'La compañía', recortar);
  if (tiene('banco')) p.banco = corto(b.banco, 120, 'El banco', recortar);
  if (tiene('categoria')) p.categoria = corto(b.categoria, 80, 'La categoría', recortar);
  if (tiene('importe')) p.importe = numero(b.importe, 'Importe', recortar);
  if (tiene('frecuencia')) { if (!Object.prototype.hasOwnProperty.call(FRECUENCIAS, b.frecuencia)) { if (!recortar) throw new HttpError(400, 'Frecuencia no válida'); } else p.frecuencia = b.frecuencia; }
  if (tiene('metodo')) p.metodo = METODOS.includes(b.metodo) ? b.metodo : '';
  if (tiene('referencia')) p.referencia = corto(b.referencia, 120, 'La referencia', recortar);
  if (tiene('web')) {
    const u = urlOk(b.web);
    if (!u && String(b.web || '').trim() && !recortar) throw new HttpError(400, 'La web debe empezar por http:// o https://');
    p.web = u.slice(0, 500);
  }
  if (tiene('notas')) p.notas = textoLargo(b.notas, 5000, 'Las notas', recortar);
  if (tiene('avisoDias')) { const n = Math.round(Number(b.avisoDias)); p.avisoDias = Number.isFinite(n) ? Math.max(0, Math.min(60, n)) : 3; }
  if (tiene('activo')) p.activo = b.activo === true || b.activo === 'true';
  if (tiene('recordar')) p.recordar = b.recordar === true || b.recordar === 'true';
  if (tiene('fechaProxima')) {
    if (!esDia(b.fechaProxima)) { if (!recortar) throw new HttpError(400, 'La fecha del próximo pago no es válida (AAAA-MM-DD)'); }
    else { p.fechaProxima = b.fechaProxima; p.dia = Number(b.fechaProxima.slice(8)); }
  }
  if (p.activo !== false && !p.fechaProxima) throw new HttpError(400, 'Indica la fecha del próximo pago');
  for (const k of ['compania', 'categoria', 'banco', 'referencia', 'web', 'notas']) if (p[k] === undefined) p[k] = '';
  if (p.importe === undefined) p.importe = null;
  p.updatedAt = Date.now();
  return p;
}

// Marca un pago como pagado: lo anota en el historial y pasa la fecha al siguiente periodo (los únicos se desactivan)
function registraPago(p, { fecha, importe }, hoy) {
  const f = esDia(fecha) ? fecha : hoy;
  const imp = importe === undefined || importe === null || importe === '' ? p.importe : numero(importe, 'Importe');
  const anterior = p.fechaProxima || '';
  p.historial = [{ id: newId(), fecha: f, importe: imp, anterior, activoAntes: p.activo !== false }, ...(p.historial || [])].slice(0, MAX_HISTORIAL);
  p.nPagos = (p.nPagos || 0) + 1;
  const meses = FRECUENCIAS[p.frecuencia] || 0;
  if (!meses) p.activo = false;
  else if (anterior) p.fechaProxima = sumaMeses(anterior, meses, p.dia);
  p.updatedAt = Date.now();
  return p;
}

// Deshace el último pago anotado (por si se pulsó sin querer): recupera la fecha y el estado de antes
function deshacePago(p) {
  const h = (p.historial || [])[0];
  if (!h) throw new HttpError(400, 'No hay ningún pago que deshacer');
  p.historial = p.historial.slice(1);
  p.nPagos = Math.max(0, (p.nPagos || 1) - 1);
  if (h.anterior) { p.fechaProxima = h.anterior; p.dia = Number(h.anterior.slice(8)); }
  p.activo = h.activoAntes !== false;
  p.updatedAt = Date.now();
  return p;
}

module.exports = { FRECUENCIAS, METODOS, MAX_PAGOS, SEMILLA_CATEGORIAS, SEMILLA_BANCOS, limpia, registraPago, deshacePago };
