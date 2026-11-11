// Prueba de interfaz del Calendario: móvil y escritorio. Imprime una huella que debe coincidir con calendario.huella.json.
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
      const hoy = new Date(); const p = (n) => String(n).padStart(2, '0'); const d = `${hoy.getFullYear()}-${p(hoy.getMonth() + 1)}-${p(hoy.getDate())}`;
      for (const o of [{ title: 'UI cita', start: d + 'T09:00', end: d + 'T10:30' }, { title: 'UI todo el día', start: d, end: d, allDay: true },
        { title: 'UI semanal', start: d + 'T16:00', end: d + 'T17:00', repeat: { freq: 'weekly', interval: 1 } }, { title: 'UI tarea', task: true }])
        await fetch('/api/calendar/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
    });
    await page.evaluate(() => switchTab('calendar')); await page.waitForSelector('#view-calendar .cal-bar', { timeout: 8000 }); await page.waitForTimeout(800);
    const cuenta = (sel) => page.locator('#view-calendar ' + sel).count();
    f.botones = await cuenta('button'); f.tarjetasLaterales = await cuenta('.cal-card'); f.mes = await cuenta('.cal-month'); f.celdas = await cuenta('.cal-weeks > *');
    f.titulo = (await page.locator('#view-calendar .cal-title').innerText()).length > 3;
    // cambiar de vista
    const vistas = page.locator('#view-calendar .seg button'); f.vistas = await vistas.count();
    for (let i = 0; i < f.vistas; i++) { await vistas.nth(i).click(); await page.waitForTimeout(400); f['vista' + i] = { activa: await cuenta('.seg .is-active'), uis: ((await page.locator('#view-calendar .cal-body').innerText()).match(/UI /g) || []).length, nodos: await page.locator('#view-calendar .cal-body *').count() }; }
    await vistas.nth(0).click(); await page.waitForTimeout(300);
    // navegar
    const t0 = await page.locator('#view-calendar .cal-title').innerText();
    await page.locator('#view-calendar button[aria-label=Siguiente]').click(); await page.waitForTimeout(400); f.siguienteCambia = (await page.locator('#view-calendar .cal-title').innerText()) !== t0;
    await page.locator('#view-calendar button[aria-label=Anterior]').click(); await page.waitForTimeout(300);
    await page.locator('#view-calendar button', { hasText: 'Hoy' }).first().click(); await page.waitForTimeout(300); f.hoyVuelve = (await page.locator('#view-calendar .cal-title').innerText()) === t0;
    // búsqueda
    const si = page.locator('#view-calendar input[type=search], #view-calendar input[type=text]').first();
    if (await si.isVisible()) { await si.fill('semanal'); await page.waitForTimeout(500); f.busqueda = ((await page.locator('#view-calendar .cal-body').innerText()).match(/UI /g) || []).length; await si.fill(''); await page.waitForTimeout(400); }
    // abrir evento nuevo y existente
    await page.evaluate(() => K.calendar.newEvent({})); await page.waitForTimeout(600); f.modalNuevo = await page.locator('.modal input, .modal textarea, .modal select').count(); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const pill = page.locator('#view-calendar .cal-body :text("UI cita")').first();
    if (await pill.count()) { await pill.click(); await page.waitForTimeout(600); f.modalEvento = await page.locator('.modal input, .modal textarea, .modal select').count(); await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
    // menú ⋯ y popups
    await page.locator('#view-calendar button[title="Importar, exportar y más"], #view-calendar button[title="Importar, suscribirse y festivos"]').first().click(); await page.waitForTimeout(300);
    f.menu = await page.locator('.menu button, [role=menu] button, .popmenu button, .dropdown button').count(); await page.keyboard.press('Escape'); await page.mouse.click(5, 5);
    // API pública
    f.api = await page.evaluate(() => Object.keys(K.calendar).sort().join(','));
    f.errores = errs; out[nombre] = f; await ctx.close();
  }
  await br.close(); console.log(JSON.stringify(out, null, 1));
  if (Object.values(out).some(o => o.errores.length)) process.exit(1);
})().catch(e => { console.error(e); process.exit(2); });
