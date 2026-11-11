// Prueba de interfaz del editor de notas (bloques): móvil y escritorio. La huella debe coincidir con notas.huella.json.
const { chromium } = require('playwright');
const B = process.env.UI_URL || 'http://localhost:4733';
const MD = '# Título UI\n\nPárrafo con **negrita**, *cursiva* y `código`.\n\n- uno\n- dos\n\n1. primero\n2. segundo\n\n- [ ] tarea\n- [x] hecha\n\n> cita\n\n> [!TIP]\n> consejo\n\n```js\nconst a = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---\n\nFin.\n';
(async () => {
  const br = await chromium.launch(); const out = {};
  for (const [nombre, vp] of [['pc', { width: 1280, height: 900 }], ['movil', { width: 390, height: 800 }]]) {
    const ctx = await br.newContext({ viewport: vp });
    const r = await ctx.request.post(B + '/api/login', { data: { username: 'admin', password: process.env.UI_PASS || 'ui-test-pass-1' } });
    if (!r.ok()) throw new Error('login ' + r.status());
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('console ' + m.text()); });
    await page.goto(B + '/'); await page.waitForFunction(() => typeof switchTab === 'function' && window.K && window.NB);
    const f = {};
    const id = await page.evaluate(async (md) => {
      const r = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'note', title: 'UI nota', body: md }) });
      const j = await r.json(); return (j.item || j).id;
    }, MD);
    await page.evaluate(() => switchTab('notes')); await page.waitForTimeout(800);
    await page.evaluate((i) => K.openers.note(i), id); await page.waitForSelector('#nb .nb-block', { timeout: 8000 }); await page.waitForTimeout(400);
    const tipos = () => page.evaluate(() => { const o = {}; document.querySelectorAll('#nb .nb-block').forEach(b => { o[b.dataset.t] = (o[b.dataset.t] || 0) + 1; }); return o; });
    const md = () => page.evaluate(() => { NB.flush(); return document.getElementById('note-body').value; });
    f.tipos = await tipos(); f.mdIgual = (await md()).trim() === MD.trim(); f.mdLen = (await md()).length;
    f.props = await page.locator('.note-props button').count();
    // escribir al final
    await page.locator('#nb .nb-block').last().locator('.nb-c').click(); await page.keyboard.press('End');
    await page.keyboard.press('Enter'); await page.keyboard.type('Escrito UI'); await page.waitForTimeout(300);
    f.tras = await tipos();
    // menú "/"
    await page.keyboard.press('Enter'); await page.keyboard.type('/'); await page.waitForTimeout(400);
    f.slash = await page.locator('.nb-slash, [class*=slash]').count(); f.slashItems = await page.locator('.nb-slash > *, [class*=slash] [class*=item]').count();
    await page.keyboard.type('tarea'); await page.waitForTimeout(300); f.slashFiltrado = await page.locator('.nb-slash > *, [class*=slash] [class*=item]').count();
    await page.keyboard.press('Enter'); await page.waitForTimeout(300); await page.keyboard.type('Hacer algo'); await page.waitForTimeout(300);
    f.trasSlash = await tipos();
    // barra de formato: seleccionar con teclado
    await page.keyboard.press('Shift+Home'); await page.waitForTimeout(400); f.barra = await page.locator('.nb-bar, [class*=nb-bar], [class*=fmtbar]').count();
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200);
    // menciones
    await page.keyboard.press('Enter'); await page.keyboard.type('@UI'); await page.waitForTimeout(900); f.mencion = await page.locator('.nb-mention, [class*=mention]').count();
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    // deshacer
    await page.keyboard.press('Control+z'); await page.waitForTimeout(400); await page.keyboard.press('Control+z'); await page.waitForTimeout(400);
    f.trasDeshacer = await tipos();
    await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(400);
    f.trasRehacer = await tipos();
    // markdown final, normalizado
    const fin = await md(); f.finTiene = ['Escrito UI', 'Hacer algo'].map(s => fin.includes(s)); f.finLen = fin.length;
    // tabla: operaciones y marcadores
    f.celdas = await page.locator('#nb table.nb-table td, #nb table.nb-table th').count();
    f.api = await page.evaluate(() => Object.keys(NB).sort().join(','));
    f.errores = errs; out[nombre] = f; await ctx.close();
  }
  await br.close(); console.log(JSON.stringify(out, null, 1));
  if (Object.values(out).some(o => o.errores.length)) process.exit(1);
})().catch(e => { console.error(e); process.exit(2); });
