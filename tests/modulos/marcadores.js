'use strict';
// Pruebas de humo de Marcadores: validación, carpetas, favicon (con un servidor local), defensa SSRF, conflictos,
// escritura concurrente, lectura dañada, borrado con copia y logros.
const fs = require('fs'), path = require('path'), http = require('http');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

module.exports = async ({ req, prueba, igual, cierto, DATA }) => {
  const nuevo = (extra = {}) => req('POST', '/api/marcadores', { url: 'https://ejemplo.com/pagina', nombre: 'Ejemplo', descripcion: 'Una web', ...extra });
  let id, carp, v0;

  // Web de prueba con favicon declarado, una sin icono y una que declara un SVG (no debe aceptarse)
  const web = http.createServer((q, r) => {
    if (q.url === '/') { r.setHeader('Content-Type', 'text/html'); r.end('<html><head><title>Hola</title><link rel="icon" href="/icono.png"></head></html>'); }
    else if (q.url === '/icono.png') { r.setHeader('Content-Type', 'image/png'); r.end(PNG); }
    else if (q.url === '/svg') { r.setHeader('Content-Type', 'text/html'); r.end('<link rel="icon" href="/x.svg">'); }
    else if (q.url === '/x.svg') { r.setHeader('Content-Type', 'image/svg+xml'); r.end('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'); }
    else if (q.url === '/redir') { r.statusCode = 302; r.setHeader('Location', '/'); r.end(); }
    else { r.statusCode = 404; r.end(); }
  });
  await new Promise(ok => web.listen(0, '127.0.0.1', ok));
  const local = `http://127.0.0.1:${web.address().port}`;

  try {
    await prueba('marcadores: validación (dirección, nombre, descripción)', async () => {
      igual((await nuevo({ url: '' })).s, 400, 'sin url');
      igual((await nuevo({ url: 'javascript:alert(1)' })).s, 400, 'esquema no permitido');
      igual((await nuevo({ url: 'ftp://x.es/a' })).s, 400, 'ftp');
      igual((await nuevo({ url: 'https://x.es/' + 'a'.repeat(2000) })).s, 400, 'url larguísima');
      igual((await nuevo({ nombre: 'x'.repeat(121) })).s, 400, 'nombre largo (no se recorta)');
      igual((await nuevo({ descripcion: 'x'.repeat(2001) })).s, 400, 'descripción larga (no se recorta)');
    });

    await prueba('marcadores: crear (sin esquema asume https; sin nombre usa la web) y carpetas', async () => {
      const a = await req('POST', '/api/marcadores', { url: 'www.ejemplo.org/x' }); igual(a.s, 200);
      igual(a.j.marcador.url, 'https://www.ejemplo.org/x'); igual(a.j.marcador.nombre, 'ejemplo.org');
      await req('DELETE', '/api/marcadores/' + a.j.marcador.id);
      const c = await req('POST', '/api/marcadores/carpetas', { nombre: 'Trabajo', color: '#3b82f6' }); igual(c.s, 200); carp = c.j.carpeta.id;
      igual((await req('POST', '/api/marcadores/carpetas', { nombre: 'TRABAJO' })).s, 409, 'carpeta repetida (sin distinguir mayúsculas)');
      igual((await req('POST', '/api/marcadores/carpetas', { nombre: '' })).s, 400);
      const r = await nuevo({ carpeta: carp, color: '#ef4444' }); igual(r.s, 200); id = r.j.marcador.id; v0 = r.j.marcador.updatedAt;
      igual(r.j.marcador.carpeta, carp); igual(r.j.marcador.color, '#ef4444');
      igual((await nuevo({ carpeta: 'noexiste', color: 'rojo' })).j.marcador.carpeta, '', 'carpeta inexistente → sin carpeta');
    });

    await prueba('marcadores: favicon extraído de la web y servido; el SVG se rechaza; sin icono no es error', async () => {
      const m = await nuevo({ url: local + '/', nombre: 'Local' });
      const r = await req('POST', `/api/marcadores/${m.j.marcador.id}/icono`); igual(r.s, 200); igual(r.j.encontrado, true);
      cierto(r.j.marcador.icono && r.j.marcador.icono.ext, 'guarda el icono');
      const img = await fetch(`${process.env.__KCC_BASE}/api/marcadores/${m.j.marcador.id}/icono`, { headers: { Cookie: process.env.__KCC_COOKIE } });
      igual(img.status, 200); cierto(/^image\//.test(img.headers.get('content-type')), 'es una imagen');
      const s = await nuevo({ url: local + '/svg', nombre: 'Con SVG' }); const rs = await req('POST', `/api/marcadores/${s.j.marcador.id}/icono`);
      igual(rs.j.encontrado, false, 'un SVG no se acepta'); cierto(rs.j.marcador.iconoIntento > 0, 'se anota el intento');
      const n = await nuevo({ url: local + '/404', nombre: 'Sin icono' }); igual((await req('POST', `/api/marcadores/${n.j.marcador.id}/icono`)).j.encontrado, false);
      const rd = await nuevo({ url: local + '/redir', nombre: 'Redirige' }); igual((await req('POST', `/api/marcadores/${rd.j.marcador.id}/icono`)).j.encontrado, true, 'sigue la redirección');
    });

    await prueba('marcadores: defensa SSRF (direcciones privadas, locales y redes internas)', async () => {
      const { esPrivada, descarga } = require('../../lib/marcadores/red');
      for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::ffff:127.0.0.1', 'fd00::1', 'fe80::1', '::127.0.0.1', '::ffff:7f00:1', '2002:7f00:1::1']) cierto(esPrivada(ip), ip + ' debe bloquearse');
      for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) cierto(!esPrivada(ip), ip + ' es pública');
      for (const u of ['http://127.0.0.1:1/', 'http://localhost/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/', 'http://usuario:clave@ejemplo.com/', 'file:///etc/passwd']) {
        let error = null; try { await descarga(u, { permiteLocal: false }); } catch (e) { error = e; }
        cierto(error, u + ' debe rechazarse');
      }
    });

    await prueba('marcadores: visitas, edición y otro dispositivo (409)', async () => {
      igual((await req('POST', `/api/marcadores/${id}/visita`)).s, 200);
      const o = await req('PUT', '/api/marcadores/' + id, { nombre: 'Cambiado fuera' }, { headers: { 'X-KCC-Client': 'otro' } }); igual(o.s, 200);
      igual((await req('PUT', '/api/marcadores/' + id, { nombre: 'Vieja', base: v0 })).s, 409);
      const l = (await req('GET', '/api/marcadores')).j; const m = l.marcadores.find(x => x.id === id);
      igual(m.nombre, 'Cambiado fuera'); igual(m.visitas, 1);
      const r = await req('PUT', '/api/marcadores/' + id, { descripcion: '' }); igual(r.j.marcador.descripcion, '', 'descripción vacía es válida');
    });

    await prueba('marcadores: borrar carpeta no borra sus marcadores; borrar un marcador deja copia 30 días', async () => {
      const d = await req('DELETE', '/api/marcadores/carpetas/' + carp); igual(d.s, 200); cierto(d.j.movidos >= 1, 'movidos');
      igual((await req('GET', '/api/marcadores')).j.marcadores.find(x => x.id === id).carpeta, '', 'pasa a sin carpeta');
      igual((await req('DELETE', '/api/marcadores/' + id)).s, 200);
      const dir = path.join(DATA, '.kcc', 'borrados', 'marcadores');
      cierto(fs.existsSync(dir) && fs.readdirSync(dir).length >= 2, 'copias del marcador y de la carpeta');
      igual((await req('DELETE', '/api/marcadores/' + id)).s, 404, 'ya no existe');
    });

    await prueba('marcadores: 15 altas a la vez no se pisan y un archivo dañado no equivale a vacío', async () => {
      const antes = (await req('GET', '/api/marcadores')).j.marcadores.length;
      const rs = await Promise.all(Array.from({ length: 15 }, (_, i) => nuevo({ nombre: 'Conc ' + i, url: `https://conc${i}.es/` })));
      cierto(rs.every(r => r.s === 200), 'todas 200');
      igual((await req('GET', '/api/marcadores')).j.marcadores.length, antes + 15);
      const f = path.join(DATA, '.kcc', 'marcadores', 'data.json'); fs.writeFileSync(f, '{roto');
      const r = await req('GET', '/api/marcadores'); igual(r.s, 200); cierto(r.j.marcadores.length > 0, 'se repone de la copia');
      cierto(fs.readdirSync(path.dirname(f)).some(n => n.includes('.dañado-')), 'el dañado queda apartado');
    });

    await prueba('marcadores: logros (recuentos y familias)', async () => {
      const g = (await req('GET', '/api/game')).j;
      cierto(g.recuentos.marcadores >= 1, 'recuento'); cierto(g.logros.familias.some(f => f.id === 'mk_total' && f.valor >= 1), 'familia mk_total');
    });
  } finally { web.close(); }
};
