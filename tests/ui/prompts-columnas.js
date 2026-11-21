'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');

async function check(browser, mobile) {
  const page = await browser.newPage({ viewport: { width: mobile ? 390 : 1280, height: 844 }, isMobile: mobile, hasTouch: mobile });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://prompts.test/', route => route.fulfill({ contentType: 'text/html', body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="view-prompts"></main></body></html>' }));
  await page.goto('https://prompts.test/');
  for (const file of ['public/css/app/tokens.css', 'public/css/app/base.css', 'public/css/modules.css', 'public/css/prompts.css']) await page.addStyleTag({ path: path.join(ROOT, file) });
  await page.evaluate(() => {
    window.$ = id => document.getElementById(id);
    window.el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
    window.icon = () => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add('ico'); return svg; };
    window.K = { debounce: fn => fn, _prompts: { R: {}, S: { q: { sort: 'updated' }, columns: { mobile: 2, desktop: 3 }, view: 'grid' }, SORTS: [['updated', 'Recientes']], mobileColumns: matchMedia('(max-width:700px)'), columnKeys: { mobile: 'test-prompt-mobile', desktop: 'test-prompt-desktop' } } };
    K._prompts.render = () => { K._prompts.R.content.innerHTML = '<div class="pr-grid"><article class="pr-card">Uno</article><article class="pr-card">Dos</article><article class="pr-card">Tres</article></div>'; K._prompts.R.updateColumns(); };
  });
  await page.addScriptTag({ path: path.join(ROOT, 'public/js/prompts/estructura.js') });
  await page.evaluate(() => { K._prompts.build(); K._prompts.render(); });
  assert.equal(await page.locator('.pr-view-toggle svg rect').count(), 4);
  const max = mobile ? 3 : 5;
  let n = mobile ? 2 : 3;
  for (let i = 0; i < max; i++) {
    await page.locator('.pr-view-toggle').click(); n = n % max + 1;
    assert.equal(await page.locator('.pr-grid').getAttribute('data-columns'), String(n));
    assert.equal(await page.locator('.pr-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), n);
    assert.ok(await page.locator('.pr-grid .pr-card').last().evaluate(el => el.getBoundingClientRect().right <= innerWidth + 1));
  }
  assert.equal(await page.evaluate(mode => localStorage.getItem(K._prompts.columnKeys[mode]), mobile ? 'mobile' : 'desktop'), String(n));
  await page.evaluate(() => { K._prompts.S.view = 'list'; });
  await page.locator('.pr-view-toggle').click();
  assert.equal(await page.evaluate(() => K._prompts.S.view), 'grid');
  assert.deepEqual(errors, []);
  await page.close();
}

(async () => { const browser = await chromium.launch({ args: ['--no-sandbox'] }); try { await check(browser, true); await check(browser, false); console.log('Prompts: columnas móvil y escritorio OK'); } finally { await browser.close(); } })().catch(error => { console.error(error); process.exitCode = 1; });
