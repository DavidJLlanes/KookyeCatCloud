// Recorre todas las vistas de la app (admin y usuario normal, móvil y escritorio) y falla si hay errores de JavaScript o de consola.
const { chromium } = require('playwright'); const B = process.env.UI_URL || 'http://localhost:4733';
(async () => {
  const br = await chromium.launch(); const out = {};
  for (const [quien, user, pass] of [['admin', 'admin', process.env.UI_PASS || 'ui-test-pass-1'], ['usuario', 'bob', 'bob-password-1']]) for (const [nombre, vp] of [['pc', { width: 1280, height: 850 }], ['movil', { width: 390, height: 800 }]]) {
    const ctx = await br.newContext({ viewport: vp }); const r = await ctx.request.post(B + '/api/login', { data: { username: user, password: pass } }); if (!r.ok()) { console.log('sin login', quien); await ctx.close(); continue; }
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('console ' + m.text().slice(0, 150)); });
    page.on('response', rs => { if (rs.status() >= 500) errs.push('HTTP ' + rs.status() + ' ' + rs.url()); });
    await page.goto(B + '/'); await page.waitForFunction(() => typeof switchTab === 'function' && window.K); await page.waitForTimeout(800);
    const vistas = await page.evaluate(() => [...document.querySelectorAll('main[id^=view-]')].map(m => m.id.slice(5)));
    for (const v of vistas) { await page.evaluate((x) => { try { switchTab(x); } catch (e) { console.error('switchTab ' + x + ': ' + e.message); } }, v); await page.waitForTimeout(700); }
    out[quien + '/' + nombre] = { vistas: vistas.length, errores: errs };
    await ctx.close();
  }
  await br.close(); console.log(JSON.stringify(out, null, 1)); if (Object.values(out).some(o => o.errores.length)) process.exit(1);
})().catch(e => { console.error(e); process.exit(2); });
