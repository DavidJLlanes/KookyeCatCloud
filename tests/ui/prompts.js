// Prueba de interfaz de Prompts: móvil y escritorio. Imprime una huella; debe ser idéntica antes y después de trocear.
const { chromium } = require('playwright');
const B = process.env.UI_URL || 'http://localhost:4733';
(async () => {
  const br = await chromium.launch(); const out = {};
  for (const [nombre, vp] of [['pc', { width: 1280, height: 800 }], ['movil', { width: 390, height: 800 }]]) {
    const ctx = await br.newContext({ viewport: vp });
    const r = await ctx.request.post(B + '/api/login', { data: { username: 'admin', password: process.env.UI_PASS || 'ui-test-pass-1' } });
    if (!r.ok()) throw new Error('login ' + r.status());
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('console ' + m.text()); });
    await page.goto(B + '/'); await page.waitForFunction(() => typeof switchTab === 'function' && window.K);
    const f = {};
    if (nombre === 'pc') await page.evaluate(async () => {
      for (const [t, b, k] of [['UI Retrato {{tema}}', 'retrato de {{tema}} al óleo', 'imagen'], ['UI Resumen', 'resume el texto', 'texto'], ['UI Script', 'console.log(1)', 'codigo']])
        await fetch('/api/prompts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t, body: b, kind: k, favorite: t.includes('Resumen') }) });
    });
    await page.evaluate(() => switchTab('prompts')); await page.waitForSelector('#view-prompts .pr-card, #view-prompts .pr-row', { timeout: 8000 });
    const cuenta = (sel) => page.locator('#view-prompts ' + sel).count();
    f.tarjetas = await cuenta('.pr-card'); f.botones = await cuenta('button'); f.rail = await cuenta('.pr-rail, [class*=rail]');
    // vista lista / cuadrícula
    const vistas = page.locator('#view-prompts [data-v]'); f.vistas = await vistas.count();
    if (f.vistas > 1) { await vistas.nth(1).click(); await page.waitForTimeout(200); f.filas = await cuenta('.pr-row'); await vistas.nth(0).click(); await page.waitForTimeout(200); }
    // búsqueda
    const si = page.locator('#view-prompts input[type=search], #view-prompts input[type=text]').first();
    await si.fill('Retrato'); await page.waitForTimeout(700); f.busqueda = await cuenta('.pr-card'); await si.fill(''); await page.waitForTimeout(700);
    // filtros avanzados
    await page.locator('#view-prompts button', { hasText: 'Filtros' }).first().click(); await page.waitForTimeout(300);
    f.filtrosAbierto = await page.locator('.popover, .pop, [class*=popover], [class*=filters]').count() > 0; await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    // selección múltiple
    await page.locator('#view-prompts button', { hasText: 'Seleccionar' }).first().click(); await page.waitForTimeout(300);
    f.selbar = await cuenta('.pr-selbar, [class*=selbar]'); await page.locator('#view-prompts button', { hasText: 'Seleccionar' }).first().click().catch(() => {}); await page.waitForTimeout(200);
    // menú ⋯
    await page.locator('#view-prompts button[title="Importar, exportar y más"]').click(); await page.waitForTimeout(300);
    f.menu = await page.locator('.menu button, .ctx button, [role=menu] button, .popmenu button, .dropdown button').count(); await page.keyboard.press('Escape'); await page.mouse.click(5, 5);
    // detalle
    await page.locator('#view-prompts .pr-card, #view-prompts .pr-row').first().click(); await page.waitForTimeout(600);
    f.detalle = await page.locator('.modal, dialog, [class*=modal]').count() > 0; f.detalleTexto = (await page.locator('.modal, [class*=modal]').first().innerText().catch(() => '')).length > 20;
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // copiar con variables → pide valores
    await page.evaluate(() => K.prompts.copiar && fetch('/api/prompts?q=UI+Retrato').then(r => r.json()).then(j => K.prompts.copiar(j.items[0].id)));
    await page.waitForTimeout(600); f.variables = await page.locator('input').count(); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // editor nuevo
    await page.locator('#view-prompts button', { hasText: 'Nuevo prompt' }).first().click(); await page.waitForTimeout(600);
    f.editor = await page.locator('.modal input, .modal textarea').count();
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // categorías en móvil / barra lateral
    const rb = page.locator('#view-prompts .pr-railbtn'); if (await rb.isVisible()) { await rb.click(); await page.waitForTimeout(300); f.railMovil = true; await page.keyboard.press('Escape'); }
    // API pública que usan otros módulos
    f.api = await page.evaluate(() => Object.keys(K.prompts).sort().join(','));
    f.errores = errs; out[nombre] = f; await ctx.close();
  }
  await br.close(); console.log(JSON.stringify(out, null, 1));
  if (Object.values(out).some(o => o.errores.length)) process.exit(1);
})().catch(e => { console.error(e); process.exit(2); });
