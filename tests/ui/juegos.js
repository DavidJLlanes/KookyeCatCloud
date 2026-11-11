// Prueba de interfaz de los juegos de la recreativa (Tetris, 2048, Breakout): abren, empiezan, aceptan teclas, pausan y no dan errores.
// La partida es aleatoria, así que la huella solo recoge lo estructural (botones, pantallas, lienzo con contenido, HUD presente).
const { chromium } = require('playwright');
const B = process.env.UI_URL || 'http://localhost:4733';
const JUEGOS = { tetris: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'], g2048: ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'], breakout: ['ArrowLeft', 'ArrowRight', 'Space'] };
(async () => {
  const br = await chromium.launch(); const out = {};
  for (const [nombre, vp] of [['pc', { width: 1280, height: 850 }], ['movil', { width: 390, height: 800 }]]) {
    const ctx = await br.newContext({ viewport: vp });
    const r = await ctx.request.post(B + '/api/login', { data: { username: 'admin', password: process.env.UI_PASS || 'ui-test-pass-1' } });
    if (!r.ok()) throw new Error('login ' + r.status());
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('console ' + m.text()); });
    await page.goto(B + '/'); await page.waitForFunction(() => typeof switchTab === 'function' && window.K && K.game);
    const f = {};
    for (const [v, teclas] of Object.entries(JUEGOS)) {
      const g = {}; await page.evaluate((x) => switchTab(x), v); await page.waitForTimeout(1200);
      const vista = `#view-${v}`;
      g.botones = await page.locator(`${vista} button:visible`).count();
      g.pantalla = (await page.locator(vista).innerText()).replace(/\s+/g, ' ').replace(/\d+/g, 'N').slice(0, 160);
      g.lienzos = await page.locator(`${vista} canvas`).count();
      // empezar: el primer botón principal visible que diga Jugar/Empezar/Comenzar
      const jugar = page.locator(`${vista} button:visible`, { hasText: /jugar|empezar|comenzar|partida/i }).first();
      g.hayJugar = await jugar.count() > 0;
      if (g.hayJugar) { await jugar.click(); await page.waitForTimeout(800); }
      for (const t of teclas) { await page.keyboard.press(t); await page.waitForTimeout(120); }
      await page.waitForTimeout(600);
      g.lienzoPintado = await page.evaluate((s) => { const cv = document.querySelector(s + ' canvas'); if (!cv) return null; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i]) n++; return n > 5; }, vista);
      g.hudPresente = await page.evaluate((s) => document.querySelector(s).innerText.length > 20, vista);
      await page.keyboard.press('p'); await page.waitForTimeout(400);
      g.tras_p = (await page.locator(vista).innerText()).replace(/\s+/g, ' ').replace(/\d+/g, 'N').slice(0, 120);
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      f[v] = g;
    }
    f.errores = errs; out[nombre] = f; await ctx.close();
  }
  await br.close(); console.log(JSON.stringify(out, null, 1));
  if (Object.values(out).some(o => o.errores.length)) process.exit(1);
})().catch(e => { console.error(e); process.exit(2); });
