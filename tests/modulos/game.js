'use strict';
// Pruebas de humo de la gamificación: estado, ping (racha y bono), partidas, tienda, eventos y validaciones.
module.exports = async ({ req, prueba, igual, cierto }) => {
  const hoy = new Date().toISOString().slice(0, 10);
  await prueba('game: estado inicial con rangos, logros, retos y cosméticos', async () => {
    const r = await req('GET', '/api/game?day=' + hoy); igual(r.s, 200);
    cierto(r.j.nivel >= 1 && r.j.rangos.length > 5, 'nivel y rangos');
    cierto(r.j.logros.familias.length > 20 && r.j.logros.especiales.length > 10, 'logros');
    cierto(r.j.cosmeticos.length > 10 && r.j.equipado, 'cosméticos');
    cierto(Array.isArray(r.j.semana.retos) && r.j.semana.retos.length === 3, 'tres retos semanales');
  });
  await prueba('game: ping da bono diario una sola vez y rechaza fechas absurdas', async () => {
    const a = await req('POST', '/api/game/ping', { seconds: 30, day: hoy, hour: 12, dow: 3 }); igual(a.s, 200);
    cierto(a.j.nuevos.some(n => n.tipo === 'diario') || a.j.dias >= 1, 'bono diario');
    const b = await req('POST', '/api/game/ping', { seconds: 30, day: hoy, hour: 12, dow: 3 });
    igual(b.j.nuevos.filter(n => n.tipo === 'diario').length, 0, 'sin segundo bono');
    igual((await req('POST', '/api/game/ping', { seconds: 30, day: '1999-01-01' })).s, 400);
    igual((await req('POST', '/api/game/ping', { seconds: 30, day: 'x' })).s, 400);
  });
  await prueba('game: tetris cuenta la partida, valida topes y exige tiempo entre partidas', async () => {
    igual((await req('POST', '/api/game/tetris', { duration: 2, score: 10 })).s, 400, 'demasiado corta');
    igual((await req('POST', '/api/game/tetris', { duration: 10, score: 999999 })).s, 400, 'puntos imposibles');
    const r = await req('POST', '/api/game/tetris', { duration: 10, score: 500, lines: 4, day: hoy }); igual(r.s, 200);
    cierto(r.j.record === true && r.j.ganado.xp > 0, 'récord y XP'); igual(r.j.tetris.partidas, 1);
    igual((await req('POST', '/api/game/tetris', { duration: 10, score: 500, lines: 4 })).s, 429, 'demasiado rápido');
  });
  await prueba('game: arcade (2048 y breakout) valida y cuenta', async () => {
    igual((await req('POST', '/api/game/arcade/otro', { duration: 10, score: 5 })).s, 404);
    igual((await req('POST', '/api/game/arcade/g2048', { duration: 10, score: 200, moves: 40, maxTile: 100, merges: 20 })).s, 400, 'ficha no potencia de 2');
    const g = await req('POST', '/api/game/arcade/g2048', { duration: 20, score: 600, moves: 80, maxTile: 64, merges: 40, day: hoy }); igual(g.s, 200);
    igual(g.j.arcade.g2048.partidas, 1);
    const b = await req('POST', '/api/game/arcade/breakout', { duration: 20, score: 300, bricks: 20, level: 2, perfect: 1, perfectRun: 1, day: hoy }); igual(b.s, 200);
    igual(b.j.arcade.breakout.partidas, 1);
    igual((await req('POST', '/api/game/arcade/breakout', { duration: 20, score: 300, bricks: 20, level: 2 })).s, 429);
  });
  await prueba('game: tienda — comprar sin monedas falla, equipar lo no comprado falla, equipar lo gratis funciona', async () => {
    const e = (await req('GET', '/api/game')).j;
    const caro = e.cosmeticos.find(c => c.precio > e.monedas && !c.propio);
    if (caro) igual((await req('POST', '/api/game/buy', { id: caro.id })).s, 400, 'sin monedas');
    if (caro) igual((await req('POST', '/api/game/equip', { id: caro.id })).s, 400, 'no es tuyo');
    igual((await req('POST', '/api/game/buy', { id: 'no-existe' })).s, 404);
    const gratis = e.cosmeticos.find(c => c.propio); cierto(gratis, 'hay uno propio por defecto');
    const q = await req('POST', '/api/game/equip', { id: gratis.id }); igual(q.s, 200); igual(q.j.equipado[gratis.tipo], gratis.id);
  });
  await prueba('game: eventos del navegador (tarjeta) suman y los desconocidos se rechazan', async () => {
    igual((await req('POST', '/api/game/event', { type: 'otro' })).s, 400);
    const a = (await req('GET', '/api/game')).j.tarjetas;
    const r = await req('POST', '/api/game/event', { type: 'tarjeta' }); igual(r.s, 200); igual(r.j.tarjetas, a + 1);
  });
};
