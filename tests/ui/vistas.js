// Barrido de interfaz de una vista: pulsa todos los botones visibles no destructivos y anota qué abre cada uno.
// Uso: VISTA=contacts|games|codigo node tests/ui/vistas.js  (huella en vistas-<vista>.huella.json)
const { chromium } = require('playwright');
const B = process.env.UI_URL || 'http://localhost:4733';
const VISTA = process.env.VISTA;
const SEMILLAS = {
  contacts: async (page) => page.evaluate(async () => { for (const c of [{ first: 'UIAna', last: 'Prueba', emails: [{ value: 'ana@ui.es' }], phones: [{ value: '600111222' }], org: 'UI SL' }, { first: 'UIBea', last: 'Dos', emails: [{ value: 'bea@ui.es' }] }]) await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }); }),
  games: async (page) => page.evaluate(async () => { for (const g of [{ title: 'UI Juego A', status: 'jugado', platforms: ['PC'], rating: 4 }, { title: 'UI Juego B', status: 'pendiente', platforms: ['PS5'] }, { title: 'UI Juego C', status: 'jugando' }]) await fetch('/api/games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(g) }); }),
  codigo: async (page) => page.evaluate(async () => { const j = async (m, u, b) => (await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json(); const c = await j('POST', '/api/codigo', { nombre: 'UI proyecto' }); await j('PUT', `/api/codigo/${c.id}/archivo`, { ruta: 'index.html', contenido: '<h1>hola</h1>' }); await j('PUT', `/api/codigo/${c.id}/archivo`, { ruta: 'src/a.js', contenido: 'let a = 1;\n' }); await j('POST', `/api/codigo/${c.id}/versiones`, { mensaje: 'v1' }); }),
};
const ABRIR = {
  codigo: async (page) => page.evaluate(async () => { const j = await (await fetch('/api/codigo')).json(); const p = j.items.find(x => x.nombre === 'UI proyecto'); await K.openers.codigo(p.id); }),
};
const ITEM = { contacts: 'UIAna', games: 'UI Juego A' };
const ABRIR_ITEM = {
  contacts: (page) => page.evaluate(async () => { const j = await (await fetch('/api/contacts')).json(); const c = (j.items || j.contacts || j).find(x => (x.first || '') === 'UIAna'); await K.openers.contact(c.id); }),
  games: (page) => page.evaluate(async () => { const j = await (await fetch('/api/games')).json(); const g = (j.items || j.games || j).find(x => x.title === 'UI Juego A'); await K.openers.game(g.id); }),
};
const PELIGRO = /tarjeta|carátula|borrar|eliminar|papelera|vaciar|quitar|cerrar sesi|delete/i;
async function barrido(page, vista) {
  const res = []; const sel = `#view-${vista} button:visible`;
  const n = Math.min(await page.locator(sel).count(), 40);
  for (let i = 0; i < n; i++) {
    const b = page.locator(sel).nth(i); if (!(await b.count())) break;
    const lbl = ((await b.getAttribute('title')) || (await b.getAttribute('aria-label')) || (await b.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (PELIGRO.test(lbl)) { res.push([lbl, 'omitido']); continue; }
    try { await b.click({ timeout: 1500 }); } catch { res.push([lbl, 'sin-clic']); continue; }
    await page.waitForTimeout(/tarjeta|perfil|compart|exportar|buscar|estad/i.test(lbl) ? 3000 : 700);
    const m = await page.evaluate((v) => { const o = [...document.querySelectorAll('.overlay:not([hidden]), .modal, .popover, .menu')].filter(e => e.offsetParent !== null); const top = o[o.length - 1];
      return [o.length, top ? top.querySelectorAll('input,textarea,select').length : 0, top ? top.innerText.replace(/\s+/g, ' ').length : 0, document.getElementById('view-' + v).innerText.length]; }, vista);
    res.push([lbl, ...m]);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.mouse.click(2, 2); await page.waitForTimeout(150);
    await page.evaluate((v) => { document.querySelectorAll('.overlay').forEach(o => { if (!o.hidden) o.querySelector('[data-close], .close, button')?.click?.(); }); }, vista).catch(() => {});
  }
  return res;
}
(async () => {
  if (!SEMILLAS[VISTA]) throw new Error('VISTA=contacts|games|codigo');
  const br = await chromium.launch(); const out = {};
  for (const [nombre, vp] of [['pc', { width: 1280, height: 850 }], ['movil', { width: 390, height: 800 }]]) {
    const ctx = await br.newContext({ viewport: vp });
    const r = await ctx.request.post(B + '/api/login', { data: { username: 'admin', password: process.env.UI_PASS || 'ui-test-pass-1' } });
    if (!r.ok()) throw new Error('login ' + r.status());
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('console ' + m.text()); });
    await page.goto(B + '/'); await page.waitForFunction(() => typeof switchTab === 'function' && window.K);
    if (nombre === 'pc') await SEMILLAS[VISTA](page);
    const f = {};
    await page.evaluate((v) => switchTab(v), VISTA); await page.waitForTimeout(1200);
    f.texto = await page.evaluate((v) => document.getElementById('view-' + v).innerText.replace(/\s+/g, ' ').replace(/\d{1,2}:\d{2}/g, 'HH:MM').slice(0, 200), VISTA);
    f.UIs = await page.evaluate((v) => (document.getElementById('view-' + v).innerText.match(/UI/g) || []).length, VISTA);
    f.lista = await barrido(page, VISTA);
    if (ITEM[VISTA]) {
      await page.evaluate((v) => switchTab(v), VISTA); await page.waitForTimeout(500);
      await ABRIR_ITEM[VISTA](page); await page.waitForTimeout(1000);
      f.fichaTexto = await page.evaluate(() => [...document.querySelectorAll('.overlay:not([hidden]), .modal, .drawer, [class*=detail], [class*=ficha]')].filter(e => e.offsetParent !== null).map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 120)).join('|'));
      f.ficha = await page.evaluate(async () => { const r = []; const bs = [...document.querySelectorAll('.overlay:not([hidden]) button, .modal button, [class*=detail] button, [class*=ficha] button')].filter(b => b.offsetParent !== null); return bs.map(b => (b.title || b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim().slice(0, 40)); });
      for (let i = 0; i < Math.min(f.ficha.length, 12); i++) {
        if (PELIGRO.test(f.ficha[i])) continue;
        await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
        await ABRIR_ITEM[VISTA](page); await page.waitForTimeout(900);
        const b = page.locator('.overlay:not([hidden]) button:visible, .modal button:visible, [class*=detail] button:visible, [class*=ficha] button:visible').nth(i);
        try { await b.click({ timeout: 1200 }); } catch { continue; }
        await page.waitForTimeout(400);
        (f.ficha_clics = f.ficha_clics || []).push([f.ficha[i], await page.evaluate(() => [...document.querySelectorAll('.overlay:not([hidden]), .modal')].filter(e => e.offsetParent !== null).length)]);
        await page.keyboard.press('Escape'); await page.waitForTimeout(250);
      }
      await page.keyboard.press('Escape'); await page.mouse.click(2, 2); await page.waitForTimeout(300);
    }
    if (ABRIR[VISTA]) { await page.evaluate((v) => switchTab(v), VISTA); await ABRIR[VISTA](page); await page.waitForTimeout(1200); f.proyectoTexto = await page.evaluate((v) => document.getElementById('view-' + v).innerText.replace(/\s+/g, ' ').replace(/\d{1,2}:\d{2}/g, 'HH:MM').slice(0, 200), VISTA); f.proyecto = await barrido(page, VISTA); }
    f.errores = errs; out[nombre] = f; await ctx.close();
  }
  await br.close(); console.log(JSON.stringify(out, null, 1));
  if (Object.values(out).some(o => o.errores.length)) process.exit(1);
})().catch(e => { console.error(e); process.exit(2); });
