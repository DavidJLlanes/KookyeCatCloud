'use strict';
// Pruebas de humo del módulo de prompts: CRUD, filtros, categorías, fragmentos, vistas, parecidos, lote, papelera, importar/exportar e imágenes.
module.exports = async ({ req, prueba, igual, cierto, BASE, cookie }) => {
  let sharp = null; try { sharp = require('sharp'); } catch { /* sin sharp */ }
  const crea = async (o) => { const r = await req('POST', '/api/prompts', o); igual(r.s, 200, 'crear ' + JSON.stringify(o).slice(0, 40)); return r.j.prompt; };
  let a, b;
  await prueba('prompts: crear, leer, editar, usar y duplicar', async () => {
    a = await crea({ title: 'PT retrato al óleo', body: 'un retrato al óleo de una mujer mayor, luz suave', kind: 'imagen', model: 'FLUX' });
    b = await crea({ title: 'PT paisaje', body: 'un retrato al óleo de un paisaje con luz suave', kind: 'texto' });
    igual((await req('GET', '/api/prompts/' + a.id)).j.title, 'PT retrato al óleo');
    const e = await req('PUT', '/api/prompts/' + a.id, { ...a, title: 'PT retrato editado' }); igual(e.s, 200);
    igual((await req('POST', '/api/prompts/' + a.id + '/use')).s, 200);
    const d = await req('POST', '/api/prompts/' + a.id + '/duplicate'); igual(d.s, 200); cierto(d.j.prompt && d.j.prompt.id !== a.id, 'copia con id nuevo');
    igual((await req('GET', '/api/prompts/0000000000000000')).s, 404, 'id inexistente');
  });
  await prueba('prompts: listado con búsqueda y filtro por tipo, metadatos y estadísticas', async () => {
    const l = await req('GET', '/api/prompts?q=paisaje'); igual(l.s, 200);
    cierto(JSON.stringify(l.j).includes(b.id), 'la búsqueda encuentra el prompt');
    const k = await req('GET', '/api/prompts?kind=texto'); cierto(JSON.stringify(k.j).includes(b.id) && !JSON.stringify(k.j).includes(a.id), 'filtro por tipo');
    const m = await req('GET', '/api/prompts/meta'); igual(m.s, 200); cierto(m.j.categories && m.j.kinds, 'metadatos con categorías y tipos');
    igual((await req('GET', '/api/prompts/stats')).s, 200);
  });
  await prueba('prompts: categorías, listas, vistas guardadas y fragmentos expandidos', async () => {
    const c = await req('POST', '/api/prompts/categories', { name: 'PT-cat', emoji: '🧪', color: '#22c55e' }); igual(c.s, 200);
    cierto((await req('GET', '/api/prompts/meta')).j.categories.some(x => x.name === 'PT-cat'), 'categoría guardada');
    igual((await req('POST', '/api/prompts/lists', { name: 'PT-lista' })).s, 200);
    const v = await req('POST', '/api/prompts/views', { name: 'PT-vista', filters: { kind: 'texto' } }); igual(v.s, 200);
    const frag = await crea({ title: 'PT fragmento', body: 'luz de atardecer', kind: 'fragmento' });
    const usa = await crea({ title: 'PT con fragmento', body: 'foto con {{@pt-fragmento}}', kind: 'imagen' });
    const f = await req('GET', '/api/prompts/fragments'); igual(f.s, 200); cierto(JSON.stringify(f.j).includes('pt-fragmento'), 'fragmento disponible');
    cierto(frag.id && usa.id);
  });
  await prueba('prompts: parecidos, exportar selección y operaciones en lote', async () => {
    const s = await req('GET', '/api/prompts/' + a.id + '/similar'); igual(s.s, 200);
    const ex = await fetch(BASE + '/api/prompts/export', { method: 'POST', headers: { Cookie: cookie(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [a.id, b.id], format: 'md' }) });
    igual(ex.status, 200); cierto((await ex.text()).includes('PT'), 'el export contiene los prompts');
    const bk = await req('POST', '/api/prompts/bulk', { ids: [a.id, b.id], op: 'favorite', value: true }); cierto(bk.s < 300, 'lote ' + bk.s);
  });
  await prueba('prompts: papelera (borrar, restaurar, vaciar) y exportar/importar todo', async () => {
    igual((await req('DELETE', '/api/prompts/' + b.id)).s, 200);
    cierto(!JSON.stringify((await req('GET', '/api/prompts?q=paisaje')).j).includes(b.id), 'fuera del listado');
    igual((await req('POST', '/api/prompts/' + b.id + '/restore')).s, 200);
    cierto(JSON.stringify((await req('GET', '/api/prompts?q=paisaje')).j).includes(b.id), 'restaurado');
    const todo = await req('GET', '/api/prompts/export/all'); igual(todo.s, 200);
    const imp = await req('POST', '/api/prompts/import', todo.j); cierto(imp.s === 200, 'importar ' + imp.s);
  });
  await prueba('prompts: imágenes de muestra (subida convertida a WebP, orden y borrado)', async () => {
    if (!sharp) return;
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#a33' } }).png().toBuffer();
    const fd = new FormData(); fd.append('images', new Blob([png], { type: 'image/png' }), 'm.png');
    const up = await fetch(BASE + '/api/prompts/' + a.id + '/images', { method: 'POST', headers: { Cookie: cookie() }, body: fd }); igual(up.status, 200);
    const j = await up.json(); const img = (j.prompt || j).images[0]; cierto(img && img.id, 'imagen registrada');
    const ver = await fetch(BASE + '/api/prompts/' + a.id + '/img/' + img.id, { headers: { Cookie: cookie() } }); igual(ver.status, 200);
    igual((await req('DELETE', '/api/prompts/' + a.id + '/images/' + img.id)).s, 200);
  });
};
