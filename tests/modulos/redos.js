'use strict';
// Pruebas de humo contra la denegación de servicio por expresiones regulares (auditoría 17): entradas grandes y retorcidas en
// rutas, notas, PDF, documentos e importadores deben responder en poco tiempo (antes tardaban de segundos a minutos).
module.exports = async ({ req, prueba, igual, cierto, BASE, cookie }) => {
  const rapido = async (nombre, fn, max = 3000) => { const t0 = Date.now(); const r = await fn(); const ms = Date.now() - t0; cierto(ms < max, `${nombre}: ${ms} ms`); return r; };

  await prueba('redos: rutas con miles de barras (cuerpo y URL)', async () => {
    const r = await rapido('cuerpo de 90 kB de barras', () => req('POST', '/api/sharelinks', { path: 'a' + '/'.repeat(90000) + 'a' }));
    cierto(r.s < 500, 'sin error interno: ' + r.s);
    const u = await rapido('URL con 12.000 barras', () => fetch(BASE + '/api/files?path=a' + '/'.repeat(12000) + 'a', { headers: { Cookie: cookie() } }));
    cierto(u.status < 500, 'sin error interno: ' + u.status);
  });

  await prueba('redos: nota con 400.000 «[» y enlaces sin cerrar, y su exportación', async () => {
    const body = '['.repeat(200000) + '[](kcc:note/'.repeat(15000) + '![x](kcc:file/' + 'a'.repeat(100000);
    const n = await rapido('crear nota', () => req('POST', '/api/notes', { type: 'note', title: 'ReDoS', body }));
    igual(n.s, 200, JSON.stringify(n.j).slice(0, 120));
    await rapido('guardar otra vez', () => req('PUT', '/api/notes/' + n.j.item.id, { body: body + ' fin' }));
  });

  await prueba('redos: PDF con líneas larguísimas de espacios y separadores de tabla', async () => {
    const md = '# ' + ' '.repeat(200000) + ' \n|' + ' '.repeat(200000) + 'x\n- ' + ' '.repeat(200000) + ' \n[!NOTE]' + ' '.repeat(100000) + ' ';
    const r = await rapido('PDF', () => req('POST', '/api/pdf', { titulo: 'x', md }), 8000);
    cierto(r.s < 500, 'sin error interno: ' + r.s);
  });

  await prueba('redos: documento con espacios antes de saltos y estilos con !important enormes', async () => {
    const id = (await req('POST', '/api/documentos', { title: 'Espacios' })).j.documento.id;
    const html = '<p>' + ' '.repeat(600000) + 'x</p><p style="color:red' + ' '.repeat(300000) + 'x">y</p>';
    const r = await rapido('guardar', () => req('PUT', '/api/documentos/' + id, { html }));
    igual(r.s, 200);
  });
};
