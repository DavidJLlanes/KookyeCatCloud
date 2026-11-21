'use strict';
// Prueba aislada del formato y guardado de Pizarra en escritorio y pantalla táctil.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

async function selecciona(page, inicio, fin) {
  await page.evaluate(([a, b]) => {
    const text = document.querySelector('.cr-e-content').firstChild;
    const range = document.createRange();
    range.setStart(text, a);
    range.setEnd(text, b);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, [inicio, fin]);
}

async function prueba(browser, mobile) {
  const page = await browser.newPage(mobile ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : {});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ path: path.join(__dirname, '../../public/js/creativos/pizarra-editor.js') });
  const sanitized = await page.evaluate(() => KCCPizarraEditor.clean('<p><span style="font-weight:700;text-decoration:line-through">Hola</span></p><img src=x onerror=alert(1)>'));
  assert.match(sanitized, /<strong>Hola<\/strong>/);
  assert.match(sanitized, /<s>/);
  assert.doesNotMatch(sanitized, /<img|onerror/);
  assert.equal(await page.evaluate(() => KCCPizarraEditor.clean('a'.repeat(100010)).length), 100010);
  await page.evaluate(() => {
    window.saved = [];
    window.K = {
      post: async (_, payload) => { saved.push(payload); return { item: { id: 'nota-1', ...payload } }; },
      put: async (_, payload) => { saved.push(payload); return { item: { id: 'nota-1', ...payload } }; },
      del: async () => {}, fail: error => { throw error; }
    };
    // Documentos usa CSS para su formato; Pizarra debe funcionar al volver de esa sección.
    document.execCommand('styleWithCSS', false, true);
    KCCPizarraEditor.open({ titulo: '', contenido: '', color: 'amarillo' }, () => {}, () => {});
  });
  await page.locator('.cr-e-title').fill('Idea');
  await page.locator('.cr-e-content').fill('Hola mundo');
  await selecciona(page, 5, 10);
  const bold = page.getByRole('button', { name: 'Negrita' });
  await page.evaluate((touch) => {
    const button = document.querySelector('[aria-label="Negrita"]');
    button.addEventListener(touch ? 'touchstart' : 'mousedown', () => getSelection().collapseToEnd(), { capture: true, once: true });
  }, mobile);
  if (mobile) await bold.tap(); else await bold.click();
  assert.match(await page.locator('.cr-e-content').evaluate(el => el.innerHTML), /<b>mundo<\/b>/);
  assert.equal(await bold.getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Tachado' }).click();
  await page.getByRole('button', { name: 'Guardar y cerrar' }).click();
  assert.equal(await page.locator('.cr-e-overlay').count(), 0);
  const payloads = await page.evaluate(() => saved);
  assert.equal(payloads.length, 1);
  assert.match(payloads[0].contenido, /<s>mundo<\/s>/);
  await page.evaluate(() => {
    KCCPizarraEditor.open({ id: 'nota-1', titulo: 'Idea', contenido: '<p>Hola mundo</p>', color: 'amarillo' }, () => {}, () => {});
    const text = document.querySelector('.cr-e-content p').firstChild;
    const range = document.createRange();
    range.setStart(text, 2);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.getByRole('button', { name: 'Título 2', exact: true }).click();
  await page.getByRole('button', { name: 'Centrar texto' }).click();
  await page.getByRole('button', { name: 'Guardar y cerrar' }).click();
  const updated = await page.evaluate(() => saved.at(-1));
  assert.match(updated.contenido, /<h2 style="text-align: center;">Hola mundo<\/h2>/);
  // La selección de la captura está en el título, no en el cuerpo.
  await page.evaluate(() => {
    KCCPizarraEditor.open({ id: 'nota-1', titulo: 'MRW', contenido: '<p>41800km máximos Peugeot renting</p>', color: 'crema' }, () => {}, () => {});
    const title = document.querySelector('.cr-e-title');
    title.focus();
    const range = document.createRange();
    range.selectNodeContents(title.querySelector('strong'));
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  const italic = page.getByRole('button', { name: 'Cursiva' });
  if (mobile) await italic.tap(); else await italic.click();
  assert.equal(await page.locator('.cr-e-title i').textContent(), 'MRW');
  assert.equal(await page.locator('.cr-e-content').innerHTML(), '<p>41800km máximos Peugeot renting</p>');
  await page.getByRole('button', { name: 'Título 2', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar y cerrar' }).click();
  const withTitle = await page.evaluate(() => saved.at(-1));
  assert.equal(withTitle.titulo, 'MRW');
  assert.match(withTitle.tituloHtml, /<h2>/);
  assert.match(withTitle.tituloHtml, /<i>MRW<\/i>/);
  await page.evaluate(item => KCCPizarraEditor.open({ id: 'nota-1', ...item }, () => {}, () => {}), withTitle);
  assert.equal(await page.locator('.cr-e-title h2 i').textContent(), 'MRW');
  await page.getByRole('button', { name: 'Guardar y cerrar' }).click();
  assert.deepEqual(errors, []);
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    await prueba(browser, false);
    await prueba(browser, true);
    console.log('pizarra-editor: formato y guardado correctos en escritorio y móvil');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
