'use strict';
// Pruebas de humo de Pagos: validación, periodos, deshacer, valores reutilizables, calendario, conflictos,
// escritura concurrente, lectura dañada, valores vacíos, borrado con copia y logros.
const fs = require('fs'), path = require('path');

module.exports = async ({ req, prueba, igual, cierto, DATA }) => {
  const nuevo = (extra = {}) => req('POST', '/api/pagos', { nombre: 'Seguro hogar', compania: 'Mapfre', categoria: 'Seguros', importe: '12,50', frecuencia: 'mensual', fechaProxima: '2026-01-31', ...extra });
  let id, v0;

  await prueba('pagos: validación (nombre, importe, fecha, frecuencia)', async () => {
    igual((await nuevo({ nombre: '  ' })).s, 400, 'sin nombre');
    igual((await nuevo({ importe: 'abc' })).s, 400, 'importe no numérico');
    igual((await nuevo({ importe: '-3' })).s, 400, 'importe negativo');
    igual((await nuevo({ fechaProxima: '2026-02-30' })).s, 400, 'fecha imposible');
    igual((await nuevo({ fechaProxima: '' })).s, 400, 'sin fecha');
    igual((await nuevo({ frecuencia: 'quincenal' })).s, 400, 'frecuencia');
    for (const f of ['toString', 'constructor', '__proto__']) igual((await nuevo({ frecuencia: f })).s, 400, 'frecuencia heredada del prototipo: ' + f);
    igual((await nuevo({ web: 'javascript:alert(1)' })).s, 400, 'web no http');
    igual((await nuevo({ nombre: 'x'.repeat(121) })).s, 400, 'nombre demasiado largo (no se recorta en silencio)');
  });

  await prueba('pagos: crear, importe con coma y valores reutilizables sin duplicar variantes', async () => {
    const r = await nuevo(); igual(r.s, 200); id = r.j.pago.id; v0 = r.j.pago.updatedAt;
    igual(r.j.pago.importe, 12.5, 'importe'); igual(r.j.pago.compania, 'Mapfre');
    const r2 = await nuevo({ nombre: 'Otro', compania: 'MAPFRE' }); igual(r2.j.pago.compania, 'Mapfre', 'MAPFRE se unifica con Mapfre');
    await req('DELETE', '/api/pagos/' + r2.j.pago.id);
  });

  await prueba('pagos: banco de pago (valor reutilizable, vacío válido, sin recortar en silencio)', async () => {
    let r = await req('PUT', '/api/pagos/' + id, { banco: 'caixabank' }); igual(r.s, 200); igual(r.j.pago.banco, 'CaixaBank', 'se unifica con la lista de bancos');
    r = await req('PUT', '/api/pagos/' + id, { banco: 'Mi cooperativa' }); igual(r.j.pago.banco, 'Mi cooperativa', 'admite bancos nuevos');
    r = await req('PUT', '/api/pagos/' + id, { banco: '' }); igual(r.s, 200); igual(r.j.pago.banco, '', 'vacío es válido');
    igual((await req('PUT', '/api/pagos/' + id, { banco: 'x'.repeat(121) })).s, 400, 'demasiado largo');
    igual((await nuevo({ nombre: 'Sin banco' })).j.pago.banco, '', 'por defecto vacío');
    r = await req('PUT', '/api/pagos/' + id, { banco: 'BBVA' }); igual(r.j.pago.banco, 'BBVA');
    v0 = r.j.pago.updatedAt;
  });

  await prueba('pagos: marcar como pagado avanza el periodo conservando el día de cobro; deshacer lo recupera', async () => {
    let r = await req('POST', `/api/pagos/${id}/pagado`, { fecha: '2026-01-30' }); igual(r.j.pago.fechaProxima, '2026-02-28', 'enero 31 → febrero 28');
    r = await req('POST', `/api/pagos/${id}/pagado`, {}); igual(r.j.pago.fechaProxima, '2026-03-31', 'vuelve al 31');
    igual(r.j.pago.nPagos, 2); igual(r.j.pago.historial.length, 2);
    r = await req('POST', `/api/pagos/${id}/deshacer`); igual(r.j.pago.fechaProxima, '2026-02-28'); igual(r.j.pago.nPagos, 1);
    const u = await nuevo({ nombre: 'Único', frecuencia: 'unico' }); const pu = await req('POST', `/api/pagos/${u.j.pago.id}/pagado`, {});
    igual(pu.j.pago.activo, false, 'un pago único queda finalizado');
    igual((await req('POST', `/api/pagos/${u.j.pago.id}/deshacer`)).j.pago.activo, true, 'deshacer lo reactiva');
    await req('DELETE', '/api/pagos/' + u.j.pago.id);
  });

  await prueba('pagos: valor vacío es válido (importe vacío, notas vacías) y el 0 no se confunde con vacío', async () => {
    let r = await req('PUT', '/api/pagos/' + id, { importe: '' }); igual(r.s, 200); igual(r.j.pago.importe, null);
    r = await req('PUT', '/api/pagos/' + id, { importe: '0' }); igual(r.j.pago.importe, 0, 'el 0 se conserva');
    r = await req('PUT', '/api/pagos/' + id, { notas: '' }); igual(r.j.pago.notas, '');
  });

  await prueba('pagos: el vencimiento está en el calendario «Pagos» y desaparece al borrar', async () => {
    const ev = async () => (await req('GET', '/api/calendar/events?from=2025-12-01&to=2026-12-31')).j.events.filter(e => e.source && e.source.type === 'pago' && e.source.ref === id);
    cierto((await ev()).length === 1, 'un evento de este pago');
    const c = await nuevo({ nombre: 'Para borrar' });
    igual((await req('DELETE', '/api/pagos/' + c.j.pago.id)).s, 200);
    igual((await req('GET', '/api/pagos')).j.pagos.some(p => p.id === c.j.pago.id), false, 'ya no está');
    const dir = path.join(DATA, '.kcc', 'borrados', 'pagos');
    cierto(fs.existsSync(dir) && fs.readdirSync(dir).some(n => /\.json$/.test(n)), 'queda copia 30 días');
  });

  await prueba('pagos: otro dispositivo cambió la ficha → 409 y no se pisa', async () => {
    const o = await req('PUT', '/api/pagos/' + id, { nombre: 'Cambiado fuera' }, { headers: { 'X-KCC-Client': 'otro' } }); igual(o.s, 200);
    const r = await req('PUT', '/api/pagos/' + id, { nombre: 'Versión vieja', base: v0 }); igual(r.s, 409);
    igual((await req('GET', '/api/pagos')).j.pagos.find(p => p.id === id).nombre, 'Cambiado fuera');
  });

  await prueba('pagos: 15 altas a la vez no se pisan', async () => {
    const antes = (await req('GET', '/api/pagos')).j.pagos.length;
    const rs = await Promise.all(Array.from({ length: 15 }, (_, i) => nuevo({ nombre: 'Conc ' + i })));
    cierto(rs.every(r => r.s === 200), 'todas 200');
    igual((await req('GET', '/api/pagos')).j.pagos.length, antes + 15);
  });

  await prueba('pagos: archivo dañado no equivale a vacío (se repone de la copia)', async () => {
    const f = path.join(DATA, '.kcc', 'pagos', 'data.json'); const antes = (await req('GET', '/api/pagos')).j.pagos.length;
    cierto(antes > 0 && fs.existsSync(f), 'hay datos');
    fs.writeFileSync(f, '{roto');
    const r = await req('GET', '/api/pagos'); igual(r.s, 200);
    cierto(r.j.pagos.length > 0, 'no se queda vacío');
    cierto(fs.readdirSync(path.dirname(f)).some(n => n.includes('.dañado-')), 'el dañado queda apartado');
  });

  await prueba('pagos: logros (recuento y contadores en la gamificación)', async () => {
    const g = (await req('GET', '/api/game')).j;
    cierto(g.recuentos.pagos >= 1, 'recuento de pagos'); cierto(g.logros.familias.some(f => f.id === 'pg_total' && f.valor >= 1), 'familia pg_total');
    cierto(g.logros.familias.some(f => f.id === 'pg_pagados'), 'familia pg_pagados');
  });
};
