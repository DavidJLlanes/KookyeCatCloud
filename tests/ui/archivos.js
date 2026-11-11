// Prueba de interfaz de Archivos (lista, agrupación, menú contextual, búsqueda, selección, mover) y visores. Huella en archivos.huella.json.
const { chromium } = require('playwright');
const B = process.env.UI_URL || 'http://localhost:4733';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
(async () => {
  const br = await chromium.launch(); const out = {};
  for (const [nombre, vp] of [['pc', { width: 1280, height: 850 }], ['movil', { width: 390, height: 800 }]]) {
    const ctx = await br.newContext({ viewport: vp });
    const r = await ctx.request.post(B + '/api/login', { data: { username: 'admin', password: process.env.UI_PASS || 'ui-test-pass-1' } });
    if (!r.ok()) throw new Error('login ' + r.status());
    if (nombre === 'pc') {
      await ctx.request.post(B + '/api/mkdir', { data: { path: '', name: 'UI carpeta' } });
      await ctx.request.post(B + '/api/mkdir', { data: { path: '', name: 'UI destino' } });
      for (const [n, mime, buf] of [['ui-foto.png', 'image/png', PNG], ['ui-texto.txt', 'text/plain', Buffer.from('hola\nmundo\n')], ['ui-datos.csv', 'text/csv', Buffer.from('a,b\n1,2\n3,4\n')], ['ui-nota.md', 'text/markdown', Buffer.from('# Título\n\ntexto')]])
        await ctx.request.post(B + '/api/upload', { multipart: { files: { name: n, mimeType: mime, buffer: buf } } });
    }
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('console ' + m.text()); });
    await page.goto(B + '/'); await page.waitForFunction(() => typeof switchTab === 'function' && window.K && typeof render === 'function');
    const f = {}; const n = (sel) => page.locator(sel).count();
    await page.evaluate(() => switchTab('files')); await page.waitForSelector('#file-list .row, #file-list .tile', { timeout: 8000 }); await page.waitForTimeout(600);
    f.elementos = await n('#file-list .row, #file-list .tile'); f.carpetas = await page.evaluate(() => state.items.filter(i => i.isDir).length);
    f.migas = await n('#breadcrumb button, #breadcrumb a, #breadcrumb span');
    // vistas
    f.vistaBtns = await n('[data-view-btn], #btn-view-grid, #btn-view-list, .viewbtn');
    for (const v of ['list', 'grid']) { await page.evaluate((x) => setView(x), v); await page.waitForTimeout(300); f['vista_' + v] = { filas: await n('#file-list .row'), tiles: await n('#file-list .tile') }; }
    // agrupar por meses
    f.agrupar = await page.evaluate(() => typeof aplicarBotonAgrupar + typeof pintarAgrupado);
    // búsqueda
    await page.fill('#search-input', 'texto'); await page.waitForTimeout(900); f.busqueda = await n('#file-list .row, #file-list .tile'); await page.fill('#search-input', ''); await page.waitForTimeout(900);
    // selección múltiple
    await page.locator('#btn-select').click(); await page.waitForTimeout(300);
    await page.locator('#file-list .row, #file-list .tile').first().click(); await page.waitForTimeout(200);
    f.seleccion = await page.evaluate(() => state.selection.size); f.selbar = await page.locator('#selbar').isVisible();
    await page.evaluate(() => exitSelectMode()); await page.waitForTimeout(200);
    // menú contextual
    await page.locator('#file-list .row, #file-list .tile').first().click({ button: 'right' }); await page.waitForTimeout(400);
    f.ctx = await n('#ctxmenu button'); await page.keyboard.press('Escape'); await page.mouse.click(5, 5); await page.waitForTimeout(200);
    // abrir carpeta y volver con migas
    await page.evaluate(() => goTo('UI carpeta')); await page.waitForTimeout(600); f.dentro = await page.evaluate(() => state.path); f.migasDentro = await n('#breadcrumb button, #breadcrumb a');
    await page.evaluate(() => goTo('')); await page.waitForTimeout(600);
    // mover a… (diálogo)
    await page.evaluate(() => openMove(['ui-texto.txt'])); await page.waitForTimeout(600); f.mover = await n('#picker-list > *'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // visor de fotos
    const idx = await page.evaluate(() => { const i = visibleItems().findIndex(x => x.name === 'ui-foto.png'); return i; });
    const abrir = async (nombre) => { await page.evaluate((nm) => { const it = state.items.find(x => x.name === nm); if (typeof openItem === 'function') openItem(it); else onItemClick(it, {}); }, nombre); await page.waitForTimeout(900); };
    await abrir('ui-foto.png'); f.visorFoto = await page.locator('#lightbox:not([hidden])').count(); await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    for (const nm of ['ui-texto.txt', 'ui-datos.csv', 'ui-nota.md']) { await abrir(nm); f['visor_' + nm] = await page.evaluate(() => { const l = document.getElementById('lightbox'); return [!l.hidden, l.innerText.replace(/\s+/g, ' ').slice(0, 140), l.querySelectorAll('button').length]; }); await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
    f.funciones = await page.evaluate(() => ['renderBreadcrumb', 'goTo', 'setView', 'visibleItems', 'pintarAgrupado', 'abrirCtx', 'buildRow', 'buildTile', 'onSearchInput', 'enterSelectMode', 'toggleSelect', 'openMove', 'openFolderForLink', 'bulkDownload', 'openLightbox', 'closeLightbox', 'vaciarVisor', 'paintLightbox', 'estadoDoc', 'marcoDocumento', 'letraColumna', 'renderHoja', 'pintarDocumento', 'alternarEdicion', 'guardarEdicion', 'pintarLbFav', 'alternarSlideshow', 'pararSlideshow', 'loadMap', 'pedirFotosMapa', 'pintarPuntos', 'popupFoto', 'abrirDesdeMapa', 'fmtExposicion', 'filaExif', 'alternarExif', 'lbStep', 'openActions', 'downloadConvertido', 'renameSelected', 'deleteSelected'].map(x => typeof window[x]).join(','));
    f.errores = errs; out[nombre] = f; await ctx.close();
  }
  await br.close(); console.log(JSON.stringify(out, null, 1));
  if (Object.values(out).some(o => o.errores.length)) process.exit(1);
})().catch(e => { console.error(e); process.exit(2); });
