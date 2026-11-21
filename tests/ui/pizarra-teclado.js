'use strict';
// Simula el viewport visual de Safari al abrir y cerrar el teclado sin reducir el de diseño.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await page.setContent('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div style="height:2000px">Pizarra</div></body></html>');
    for (const file of ['public/css/app/tokens.css', 'public/css/app/base.css', 'public/css/creativos.css']) await page.addStyleTag({ path: path.join(ROOT, file) });
    await page.addScriptTag({ path: path.join(ROOT, 'public/js/creativos/pizarra-editor.js') });
    await page.evaluate(() => {
      window.scrollTo(0, 300);
      window.keyboardViewport = Object.assign(new EventTarget(), { width: 390, height: 844, offsetTop: 0, offsetLeft: 0 });
      Object.defineProperty(window, 'visualViewport', { value: keyboardViewport, configurable: true });
      window.K = { put: async (_, data) => ({ item: { id: 'nota', ...data } }), fail: error => { throw error; } };
      KCCPizarraEditor.open({ id: 'nota', titulo: 'Idea', contenido: '<p>Primera línea</p>'.repeat(40), color: 'amarillo' }, () => {}, () => {});
    });
    assert.equal(await page.locator('.cr-e-dialog').evaluate(el => el === document.activeElement), true, 'abrir en móvil no enfoca un campo');
    await page.evaluate(() => {
      const field = document.querySelector('.cr-e-content');
      field.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(field.lastChild);
      range.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      Object.assign(keyboardViewport, { height: 420, offsetTop: 90 });
      keyboardViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(() => document.querySelector('.cr-e-overlay').style.height === '420px');
    const geometry = await page.evaluate(() => {
      const rect = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
      return {
        overlay: rect(document.querySelector('.cr-e-overlay')),
        header: rect(document.querySelector('.cr-e-header')),
        toolbar: rect(document.querySelector('.cr-e-toolbar')),
        body: rect(document.querySelector('.cr-e-body')),
        caret: rect(document.querySelector('.cr-e-content p:last-child')),
        locked: document.body.style.position,
        colorsVisible: getComputedStyle(document.querySelector('.cr-e-palette')).display !== 'none'
      };
    });
    assert.equal(geometry.overlay.top, 90);
    assert.equal(geometry.overlay.bottom, 510);
    assert.ok(geometry.header.top >= 90 && geometry.toolbar.bottom <= 510, 'barra visible sobre el teclado');
    assert.ok(geometry.caret.top >= geometry.body.top && geometry.caret.bottom <= geometry.body.bottom, 'cursor visible en el área de texto');
    assert.equal(geometry.locked, 'fixed');
    assert.equal(geometry.colorsVisible, false);
    await page.evaluate(() => {
      Object.assign(keyboardViewport, { height: 844, offsetTop: 0 });
      keyboardViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(() => !document.querySelector('.cr-e-overlay').classList.contains('cr-e-keyboard'));
    await page.getByRole('button', { name: 'Guardar y cerrar' }).click();
    assert.equal(await page.evaluate(() => document.body.style.position), '');
    assert.equal(await page.evaluate(() => window.scrollY), 300, 'posición de la pizarra restaurada');
    await page.evaluate(() => keyboardViewport.dispatchEvent(new Event('resize')));
    assert.equal(await page.locator('.cr-e-overlay').count(), 0);
    console.log('pizarra-teclado: barra y cursor visibles, fondo bloqueado y posición restaurada');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
