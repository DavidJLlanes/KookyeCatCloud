'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');
async function check(browser, mobile) {
  const page = await browser.newPage({ viewport: { width: mobile ? 390 : 1280, height: 844 }, isMobile: mobile, hasTouch: mobile });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://archivos.test/', route => route.fulfill({ contentType: 'text/html', body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="view-files"><button id="btn-file-columns"></button><div id="file-list"></div></main></body></html>' }));
  await page.goto('https://archivos.test/');
  await page.evaluate(() => { window.state = { view: 'grid' }; window.$ = id => document.getElementById(id); window.render = () => { document.getElementById('file-list').className = state.view; }; });
  await page.addScriptTag({ path: path.join(ROOT, 'public/js/app/navegacion/lista.js') });
  await page.evaluate(() => applyViewButtons());
  const max = mobile ? 3 : 5;
  for (let n = mobile ? 2 : 3; n < max; n++) {
    await page.evaluate(() => cycleFileColumns());
    assert.equal(await page.locator('#view-files').evaluate(el => el.style.getPropertyValue('--file-cols')), String(n + 1));
  }
  await page.evaluate(() => cycleFileColumns());
  assert.equal(await page.evaluate(() => state.view), 'list');
  await page.evaluate(() => cycleFileColumns());
  assert.equal(await page.evaluate(() => state.view), 'grid');
  assert.equal(await page.locator('#view-files').evaluate(el => el.style.getPropertyValue('--file-cols')), '1');
  assert.deepEqual(errors, []);
  await page.close();
}
(async () => { const browser = await chromium.launch({ args: ['--no-sandbox'] }); try { await check(browser, true); await check(browser, false); console.log('Archivos: columnas y lista móvil/escritorio OK'); } finally { await browser.close(); } })().catch(error => { console.error(error); process.exitCode = 1; });
