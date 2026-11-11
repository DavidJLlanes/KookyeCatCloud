'use strict';
// Contadores de Pagos para la gamificación (pg_*). Se calculan sobre todos los pagos del usuario.
const { hoy, diasHasta } = require('./fechas');

const clave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function resumenPagos(pagos) {
  const h = hoy();
  const activos = pagos.filter(p => p.activo !== false);
  const vencidos = activos.filter(p => p.fechaProxima && diasHasta(p.fechaProxima, h) < 0).length;
  const companias = new Set(pagos.map(p => clave(p.compania)).filter(Boolean));
  return {
    pagos: pagos.length,
    pg_total: pagos.length,
    pg_pagados: pagos.reduce((a, p) => a + (p.nPagos || 0), 0),
    pg_companias: companias.size,
    pg_aldia: activos.length >= 3 && vencidos === 0 ? 1 : 0,
    pg_polizas: pagos.filter(p => (p.adjuntos || []).length > 0).length,
    pg_meses: new Set(pagos.flatMap(p => (p.historial || []).map(h => String(h.fecha || '').slice(0, 7))).filter(m => /^\d{4}-\d{2}$/.test(m))).size,
    pg_seguros: activos.filter(p => /seguro/.test(clave(p.categoria))).length,
  };
}

module.exports = { resumenPagos };
