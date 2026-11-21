'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');

async function check(browser, mobile) {
  const page = await browser.newPage({ viewport: { width: mobile ? 390 : 1280, height: 844 }, isMobile: mobile, hasTouch: mobile });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://columnas.test/', route => route.fulfill({ contentType: 'text/html', body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main><div id="actions"><button id="new">Nuevo</button></div><div id="grid" style="display:grid"><article>Uno</article><article>Dos</article><article>Tres</article></div></main></body></html>' }));
  await page.goto('https://columnas.test/');
  await page.addStyleTag({ path: path.join(ROOT, 'public/css/modules.css') });
  await page.evaluate(() => { window.isList = false; });
  await page.addScriptTag({ path: path.join(ROOT, 'public/js/nucleo/columnas-vista.js') });
  await page.evaluate(() => { window.mount = () => KCCColumnasVista({ id: 'test', actions: document.querySelector('#actions'), primary: document.querySelector('#new'), grid: document.querySelector('#grid'), list: { active: () => window.isList, set: value => { window.isList = value; document.querySelector('.kcc-columns-toggle').remove(); mount(); } } }); mount(); });
  const max = mobile ? 3 : 5;
  let n = mobile ? 2 : 3;
  for (; n < max; n++) {
    await page.locator('.kcc-columns-toggle').first().click();
    assert.equal(await page.locator('#grid').getAttribute('data-columns'), String(n + 1));
  }
  await page.locator('.kcc-columns-toggle').first().click();
  assert.equal(await page.evaluate(() => isList), true);
  assert.equal(await page.locator('#grid').getAttribute('data-columns'), 'lista');
  await page.locator('.kcc-columns-toggle').click();
  assert.equal(await page.evaluate(() => isList), false);
  assert.equal(await page.locator('#grid').getAttribute('data-columns'), '1');
  assert.deepEqual(errors, []);
  await page.close();
}

(async () => { const browser = await chromium.launch({ args: ['--no-sandbox'] }); try { await check(browser, true); await check(browser, false); console.log('Selector compartido: móvil y escritorio OK'); } finally { await browser.close(); } })().catch(error => { console.error(error); process.exitCode = 1; });
