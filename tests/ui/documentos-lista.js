'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');

async function check(browser, mobile) {
  const page = await browser.newPage({ viewport: { width: mobile ? 390 : 1280, height: 844 }, isMobile: mobile, hasTouch: mobile });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="view-documentos"></main></body></html>');
  for (const file of ['public/css/app/tokens.css', 'public/css/app/base.css', 'public/css/documentos.css']) await page.addStyleTag({ path: path.join(ROOT, file) });
  await page.evaluate(() => {
    window.el = (tag, cls, content) => { const node = document.createElement(tag); if (cls) node.className = cls; if (content !== undefined) node.textContent = content; return node; };
    window.K = { documentos: { S: { busca: '', lista: Array.from({ length: 8 }, (_, i) => ({ id: String(i), title: `Documento ${i}`, extracto: `Contenido de prueba ${i}`, palabras: i * 10, updatedAt: Date.now() - i * 1000, favorito: false })), plantillas: [] }, fecha: () => 'hoy', pintaEditor: (_, id) => { window.opened = id; } } };
  });
  await page.addScriptTag({ path: path.join(ROOT, 'public/js/documentos/lista.js') });
  await page.evaluate(() => K.documentos.pintaLista(document.querySelector('#view-documentos')));
  assert.equal(await page.locator('.dc-view-toggle svg rect').count(), 4);
  assert.equal(await page.locator('.dc-tarjeta').count(), 8);
  const max = mobile ? 3 : 5;
  let n = Number(await page.locator('.dc-rejilla').getAttribute('data-columns'));
  for (let i = 0; i < max; i++) {
    await page.locator('.dc-view-toggle').click(); n = n % max + 1;
    assert.equal(await page.locator('.dc-rejilla').getAttribute('data-columns'), String(n));
    assert.equal(await page.locator('.dc-rejilla').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), n);
    assert.ok(await page.locator('.dc-tarjeta').first().evaluate(el => el.getBoundingClientRect().right <= innerWidth + 1));
  }
  await page.locator('.dc-busca').fill('Documento 3');
  assert.equal(await page.locator('.dc-tarjeta').count(), 1);
  await page.locator('.dc-tarjeta').click();
  assert.equal(await page.evaluate(() => opened), '3');
  assert.deepEqual(errors, []);
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try { await check(browser, true); await check(browser, false); console.log('Documentos: móvil y escritorio OK'); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
