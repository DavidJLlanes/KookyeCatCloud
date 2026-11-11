// Administración: la lista de usuarios muestra la foto y el nombre visible de cada uno.
const { chromium } = require('playwright'); const B = process.env.UI_URL || 'http://localhost:4733';
(async () => {
  const br = await chromium.launch(); const out = {};
  for (const [nombre, vp] of [['pc', { width: 1280, height: 850 }], ['movil', { width: 390, height: 800 }]]) {
    const ctx = await br.newContext({ viewport: vp });
    const r = await ctx.request.post(B + '/api/login', { data: { username: 'admin', password: process.env.UI_PASS || 'ui-test-pass-1' } }); if (!r.ok()) throw new Error('login');
    if (nombre === 'pc') {
      const png = require('sharp') ? await require('sharp')({ create: { width: 200, height: 200, channels: 3, background: '#e11d48' } }).png().toBuffer() : null;
      const u = await ctx.request.put(B + '/api/perfil/avatar', { multipart: { foto: { name: 'f.png', mimeType: 'image/png', buffer: png } } }); if (!u.ok()) throw new Error('avatar ' + u.status());
      await ctx.request.put(B + '/api/perfil', { data: { nombre: 'David UI' } });
    }
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(B + '/'); await page.waitForFunction(() => typeof switchTab === 'function' && window.K);
    await page.evaluate(() => switchTab('admin')); await page.waitForSelector('#user-list .urow', { timeout: 8000 }); await page.waitForTimeout(1500);
    out[nombre] = await page.evaluate(() => ({ fotos: document.querySelectorAll('#user-list .av img').length, nombre: document.querySelector('#user-list .un').innerText.replace(/\s+/g, ' '), errores: 0 }));
    out[nombre].errores = errs.length; await ctx.close();
  }
  await br.close(); console.log(JSON.stringify(out));
})().catch(e => { console.error(e); process.exit(2); });
