'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');

async function check(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: width < 700, hasTouch: width < 700 });
  await page.setContent('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="view-games"><section class="gms-page"><header class="gms-head kcc-section-head"><div><h1>Juegos</h1></div><div class="gms-actions"><button class="kcc-columns-toggle" aria-label="Cambiar columnas">▦</button><button class="btn primary">＋ Añadir</button></div></header><div class="kcc-section-secondary"><button class="btn">Mi perfil</button><button class="btn">Estadísticas</button><button class="btn">Más opciones</button></div><div class="kcc-section-secondary kcc-search-actions"><div class="kv-search"><input type="search" placeholder="Buscar eventos…"></div><button class="btn ghost icon" aria-label="Más opciones">⋮</button></div><div class="gms-tabs">Próximos · Deseados · Pendientes</div></section></main></body></html>');
  for (const file of ['public/css/app/tokens.css', 'public/css/app/base.css', 'public/css/modules.css', 'public/css/games.css', 'public/css/creativos.css']) await page.addStyleTag({ path: path.join(ROOT, file) });
  const boxes = await page.evaluate(() => Object.fromEntries([['title', 'h1'], ['icon', '.kcc-columns-toggle'], ['add', '.primary'], ['extra', '.kcc-section-secondary']].map(([name, selector]) => { const r = document.querySelector(selector).getBoundingClientRect(); return [name, { top: r.top, right: r.right, bottom: r.bottom }]; })));
  assert.ok(Math.abs(boxes.title.top - boxes.icon.top) < 14 && Math.abs(boxes.title.top - boxes.add.top) < 14, 'título, vista y acción principal en la misma fila');
  assert.ok(boxes.extra.top >= Math.max(boxes.title.bottom, boxes.icon.bottom, boxes.add.bottom), 'acciones secundarias debajo');
  assert.ok(boxes.add.right <= width && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sin desbordamiento horizontal');
  const searchRow = await page.locator('.kcc-search-actions').evaluate(row => { const field = row.querySelector('.kv-search').getBoundingClientRect(), menu = row.querySelector('button').getBoundingClientRect(); return { field: { top: field.top, right: field.right }, menu: { top: menu.top, left: menu.left, right: menu.right, width: menu.width } }; });
  assert.ok(Math.abs(searchRow.field.top - searchRow.menu.top) < 8 && searchRow.menu.left > searchRow.field.right, 'menú inmediatamente después de buscar');
  assert.ok(searchRow.menu.right <= width && searchRow.menu.width >= 40, 'menú visible y pulsable');
  await page.close();
}
(async () => { const browser = await chromium.launch({ args: ['--no-sandbox'] }); try { await check(browser, 390); await check(browser, 1280); console.log('Cabeceras: jerarquía móvil y escritorio OK'); } finally { await browser.close(); } })().catch(error => { console.error(error); process.exitCode = 1; });
