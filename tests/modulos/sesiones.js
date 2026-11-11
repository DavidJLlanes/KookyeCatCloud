'use strict';
// Pruebas de humo de sesiones y registro de actividad: el cierre remoto invalida el token y la actividad queda registrada.
module.exports = async ({ req, prueba, igual, cierto, BASE }) => {
  const entra = async () => {
    const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'smoke-test-1' }) });
    const set = r.headers.get('set-cookie'); return { s: r.status, cookie: set && /token=/.test(set) ? set.split(';')[0] : '' };
  };
  const con = (cookie, ruta, m = 'GET') => fetch(BASE + ruta, { method: m, headers: { Cookie: cookie } });
  await prueba('sesiones: cerrar una sesión en remoto invalida su token', async () => {
    const otra = await entra(); igual(otra.s, 200, 'segundo inicio de sesión');
    igual((await con(otra.cookie, '/api/files')).status, 200);
    const lista = await req('GET', '/api/sessions'); igual(lista.s, 200);
    cierto(lista.j.length >= 2, 'aparecen las dos sesiones');
    const items = lista.j;
    const ajena = items.find(x => !x.current);
    cierto(ajena, 'hay una sesión que no es la actual');
    igual((await req('DELETE', '/api/sessions/' + ajena.jti)).s, 200);
    igual((await con(otra.cookie, '/api/files')).status, 401, 'el token cerrado ya no entra');
    igual((await req('GET', '/api/files')).s, 200, 'la sesión propia sigue');
  });
  await prueba('sesiones: la actividad registra acciones y respeta el límite', async () => {
    await req('POST', '/api/mkdir', { path: '', name: 'act-prueba' });
    await new Promise(r => setTimeout(r, 300));
    const r = await req('GET', '/api/activity?limit=5'); igual(r.s, 200);
    cierto(r.j.items.length > 0 && r.j.items.length <= 5, 'devuelve entradas y respeta el límite');
    cierto(r.j.items[0].t >= r.j.items[r.j.items.length - 1].t, 'la más reciente primero');
    await req('DELETE', '/api/files', { path: 'act-prueba' }).catch(() => {});
  });
};
