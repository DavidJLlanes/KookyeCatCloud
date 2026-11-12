// Pulsar un icono de la barra inferior lleva siempre al inicio de su sección (raíz de Archivos, listado de Notas...).
// Uso: UI_URL=http://localhost:4733 UI_PASS=... node tests/ui/barra-inferior.js   (sobre una copia de la app, nunca sobre datos reales)
const { chromium } = require('playwright'); const B = process.env.UI_URL || 'http://localhost:4733';
(async () => {
  const br = await chromium.launch(); const fallos = [];
  const cierto = (c, m) => { if (!c) fallos.push(m); };
  const ctx = await br.newContext({ viewport: { width: 390, height: 800 } });
  const r = await ctx.request.post(B + '/api/login', { data: { username: 'admin', password: process.env.UI_PASS || 'ui-test-pass-1' } });
  if (!r.ok()) { console.error('sin login'); process.exit(2); }
  await ctx.request.post(B + '/api/mkdir', { data: { path: '', name: 'Adjuntos' } });
  const nota = await (await ctx.request.post(B + '/api/notes', { data: { type: 'note', title: 'Nota de prueba', body: 'hola' } })).json();
  const page = await ctx.newPage(); page.on('pageerror', e => fallos.push('pageerror ' + e.message));
  await page.goto(B + '/'); await page.waitForFunction(() => typeof switchTab === 'function' && window.K); await page.waitForTimeout(800);
  const pulsa = async (v) => { await page.locator(`.mobilenav button[data-view="${v}"]`).click(); await page.waitForTimeout(900); };

  // Archivos: dentro de una subcarpeta, pulsar Archivos (estando ya en Archivos) vuelve a Inicio
  await page.evaluate(() => { goTo('Adjuntos'); }); await page.waitForTimeout(700);
  cierto(await page.evaluate(() => state.path) === 'Adjuntos', 'no entró en la subcarpeta');
  await pulsa('files'); cierto(await page.evaluate(() => state.path) === '', 'Archivos desde Archivos no vuelve a Inicio');
  // …y desde otra sección
  await page.evaluate(() => { goTo('Adjuntos'); }); await page.waitForTimeout(600);
  await pulsa('buscar'); await pulsa('files'); cierto(await page.evaluate(() => state.path) === '', 'Archivos desde Buscar no vuelve a Inicio');

  // Notas: con una nota abierta, pulsar Notas vuelve al listado
  await pulsa('notes'); await page.evaluate((id) => { abrirNota(id); }, nota.item ? nota.item.id : nota.id).catch(() => {}); await page.waitForTimeout(500);
  if (await page.evaluate(() => !!NT.abierta)) { await pulsa('notes'); cierto(await page.evaluate(() => !NT.abierta), 'Notas no cierra la nota abierta'); }
  // Nota con cambios sin guardar: no se cierra
  if (await page.evaluate(() => { const i = NT.items.find(x => x.type === 'note'); if (!i) return false; abrirNota(i.id); return true; })) {
    await page.waitForTimeout(400); await page.evaluate(() => { NT.sucia = true; NT.guardando = null; $('note-saved').textContent = 'Escribiendo…'; });
    await page.route('**/api/notes/*', rt => rt.request().method() === 'PUT' ? rt.abort() : rt.continue());
    await pulsa('notes'); cierto(await page.evaluate(() => !!NT.abierta), 'Notas cerró una nota con cambios sin guardar');
    await page.unroute('**/api/notes/*'); await page.evaluate(() => { NT.sucia = false; NT.pendientes && NT.pendientes.clear(); });
  }

  // Buscar: con texto y resultados, pulsar Buscar la deja vacía
  await pulsa('buscar'); await page.evaluate(() => { K.buscar.S.q = 'algo'; K.buscar.S.res = { grupos: [] }; });
  await pulsa('buscar'); cierto(await page.evaluate(() => K.buscar.S.q === '' && !K.buscar.S.res), 'Buscar no se reinicia');

  await br.close();
  if (fallos.length) { console.error(fallos.join('\n')); process.exit(1); }
  console.log('barra inferior: ok');
})().catch(e => { console.error(e); process.exit(2); });
