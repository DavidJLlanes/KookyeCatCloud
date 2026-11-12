'use strict';
// Pruebas de humo de la capa de IA con un proveedor falso local (compatible con OpenAI): claves cifradas que nunca vuelven al
// cliente, consentimiento, listado de modelos, preguntar con fuentes, resumir, errores del proveedor, SSRF y logros.
const fs = require('fs'), path = require('path'), http = require('http');

module.exports = async ({ req, prueba, igual, cierto, DATA, BASE, cookie }) => {
  const vistos = [];
  let modo = 'ok';
  const falso = http.createServer((q, r) => {
    let cuerpo = ''; q.on('data', c => { cuerpo += c; });
    q.on('end', () => {
      vistos.push({ url: q.url, auth: q.headers.authorization || '', cuerpo });
      if (modo === 'clave') { r.writeHead(401, { 'Content-Type': 'application/json' }); return r.end('{"error":{"message":"bad key sk-secreto-1234"}}'); }
      if (q.url.endsWith('/models')) { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end(JSON.stringify({ data: [{ id: 'modelo-a' }, { id: 'modelo-b:free' }] })); }
      r.writeHead(200, { 'Content-Type': 'application/json' });
      r.end(JSON.stringify({ choices: [{ message: { content: 'Según tus notas, el servidor está en IONOS [1].' } }], usage: { total_tokens: 9 } }));
    });
  });
  await new Promise(r => falso.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${falso.address().port}/v1`;
  const CLAVE = 'sk-secreto-1234567890';
  const marca = 'ionosia' + Date.now().toString(36);

  try {
    await prueba('ia: ajustes, clave cifrada y que nunca vuelve al cliente', async () => {
      const c0 = (await req('GET', '/api/ia/config')).j;
      cierto(['openrouter', 'opencode', 'openai', 'anthropic', 'google', 'ollama', 'personalizado'].every(id => c0.proveedores.some(p => p.id === id)), 'catálogo de proveedores');
      igual((await req('PUT', '/api/ia/proveedores/inventado', { clave: 'x' })).s, 404);
      igual((await req('PUT', '/api/ia/proveedores/personalizado', { clave: 'con espacios dentro' })).s, 400, 'clave con espacios');
      igual((await req('PUT', '/api/ia/proveedores/personalizado', { modelo: 'mal modelo!' })).s, 400, 'modelo con símbolos raros');
      igual((await req('PUT', '/api/ia/proveedores/personalizado', { base: 'ftp://x' })).s, 400, 'dirección no http');
      igual((await req('PUT', '/api/ia/proveedores/personalizado', { clave: CLAVE, base, modelo: 'modelo-a' })).s, 200);
      const c1 = (await req('GET', '/api/ia/config')).j;
      const p = c1.proveedores.find(x => x.id === 'personalizado');
      cierto(p.tieneClave && p.listo && p.pista === '…' + CLAVE.slice(-4), 'configurado');
      cierto(!JSON.stringify(c1).includes(CLAVE), 'la clave no sale en la configuración');
      const f = path.join(DATA, '.kcc', 'ia', 'config.json');
      cierto(fs.existsSync(f) && !fs.readFileSync(f, 'utf8').includes(CLAVE), 'en disco está cifrada');
      igual(c1.activo, 'personalizado', 'el primero configurado queda activo');
    });

    await prueba('ia: sin consentimiento no se envía nada; con él, probar y listar modelos', async () => {
      vistos.length = 0;
      const sin = await req('POST', '/api/ia/preguntar', { pregunta: '¿dónde está mi servidor?' });
      igual(sin.s, 403, JSON.stringify(sin.j)); igual(vistos.length, 0, 'nada salió hacia el proveedor');
      igual((await req('PUT', '/api/ia/consentimiento', { ok: true })).s, 200);
      const t = await req('POST', '/api/ia/probar', {}); igual(t.s, 200, JSON.stringify(t.j)); cierto(t.j.ok, 'prueba de conexión');
      cierto(vistos.some(v => v.auth === 'Bearer ' + CLAVE), 'la clave viaja solo en la cabecera Authorization');
      const m = await req('POST', '/api/ia/proveedores/personalizado/modelos', {});
      igual(m.s, 200, JSON.stringify(m.j));
      cierto(m.j.modelos.length === 2 && m.j.modelos[0].gratis && m.j.modelos[0].id === 'modelo-b:free', 'los gratuitos van primero');
    });

    await prueba('ia: preguntar usa solo los fragmentos encontrados y devuelve las fuentes', async () => {
      await req('POST', '/api/notes', { type: 'note', title: 'VPS ' + marca, body: 'El servidor de producción está en IONOS, contrato ' + marca });
      vistos.length = 0;
      const r = await req('POST', '/api/ia/preguntar', { pregunta: `¿dónde está el servidor ${marca}?` });
      igual(r.s, 200, JSON.stringify(r.j));
      cierto(r.j.respuesta.includes('IONOS') && r.j.fuentes.length >= 1 && r.j.fuentes[0].n === 1, 'respuesta con fuentes');
      const enviado = vistos.find(v => v.url.endsWith('/chat/completions'));
      cierto(enviado && enviado.cuerpo.includes(marca) && enviado.cuerpo.includes('<fragmento'), 'el modelo recibe los fragmentos');
      const sin = await req('POST', '/api/ia/preguntar', { pregunta: 'tema inexistente xqzwv' + Date.now() });
      igual(sin.s, 200); igual(sin.j.fuentes.length, 0, 'sin coincidencias no se llama al modelo');
      igual((await req('POST', '/api/ia/preguntar', { pregunta: 'a' })).s, 400, 'pregunta demasiado corta');
    });

    await prueba('ia: resumir, errores del proveedor sin filtrar la clave y SSRF', async () => {
      const b = (await req('GET', `/api/busqueda?q=${marca}&m=notas`)).j.resultados[0];
      const r = await req('POST', '/api/ia/resumir', { fuente: b.fuente, id: b.id });
      igual(r.s, 200, JSON.stringify(r.j)); cierto(r.j.resumen.length > 5, 'resumen');
      igual((await req('POST', '/api/ia/resumir', { fuente: 'notas', id: 'noexiste' })).s, 404);
      modo = 'clave';
      const e = await req('POST', '/api/ia/probar', {});
      cierto(e.s >= 400 && e.s < 600, 'error propagado: ' + e.s); cierto(/clave no es válida/.test(e.j.error || ''), 'mensaje claro: ' + e.j.error);
      modo = 'ok';
      // una dirección privada que no es la permitida por KCC_IA_PERMITE_LOCAL (aquí activada) sigue exigiendo http(s) y sin credenciales
      igual((await req('PUT', '/api/ia/proveedores/personalizado', { base: 'http://usuario:clave@127.0.0.1:1/v1' })).s, 400, 'sin usuario ni contraseña en la dirección');
    });

    await prueba('ia: quitar la clave, sin sesión y logros', async () => {
      igual((await req('DELETE', '/api/ia/proveedores/personalizado/clave')).s, 200);
      igual((await req('POST', '/api/ia/probar', {})).s, 400, 'sin clave no se llama');
      for (const [m, u] of [['GET', '/api/ia/config'], ['PUT', '/api/ia/proveedores/openai'], ['POST', '/api/ia/preguntar'], ['POST', '/api/ia/resumir']]) {
        igual((await fetch(BASE + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: m === 'GET' ? undefined : '{}' })).status, 401, 'sin sesión ' + u);
      }
      await new Promise(r => setTimeout(r, 300));
      const g = (await req('GET', '/api/game')).j;
      cierto(g.logros.familias.find(x => x.id === 'ia_preguntas').valor >= 1, 'logro Oráculo');
      cierto(g.logros.familias.find(x => x.id === 'ia_proveedores').valor >= 1, 'logro Políglota');
      cierto(g.logros.especiales.find(x => x.id === 'conectado').cuando, 'logro especial Cerebro conectado');
      const f = path.join(DATA, '.kcc', 'ia', 'config.json');
      fs.writeFileSync(f + '.bak', 'x'); fs.writeFileSync(f, '{roto');
      igual((await req('GET', '/api/ia/config')).s, 200, 'configuración dañada: arranca vacía en vez de romper');
    });
  } finally { falso.close(); }
};
