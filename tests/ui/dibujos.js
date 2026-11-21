'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');

async function check(browser, mobile) {
  const page = await browser.newPage({ viewport: { width: mobile ? 390 : 1280, height: 844 }, hasTouch: mobile, isMobile: mobile });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main class="wrap" id="view-dibujos"></main></body></html>');
  for (const file of ['public/css/app/tokens.css', 'public/css/app/base.css', 'public/css/creativos.css']) await page.addStyleTag({ path: path.join(ROOT, file) });
  await page.evaluate(() => {
    window.data = [
      { id: '1', titulo: 'Montañas', contenido: [{ color: '#4e83dc', grosor: 18, puntos: [[0.1, 0.8], [0.5, 0.1], [0.9, 0.8]] }] },
      { id: '2', titulo: 'Un punto', contenido: [{ color: '#df5368', grosor: 40, puntos: [[0.5, 0.5]] }] }
    ];
    window.calls = []; window.failSave = false;
    async function save(url, payload) {
      calls.push({ url, payload });
      if (failSave) throw new Error('Prueba de error de guardado');
      const id = url.split('/').length > 4 ? url.split('/').at(-1) : 'nuevo';
      const item = { id, ...payload };
      data = data.filter(other => other.id !== id); data.unshift(item);
      return { item };
    }
    window.K = {
      registerView: (_, view) => { window.drawingView = view; view.open(); },
      get: async () => ({ items: data }), post: save, put: save,
      del: async url => { data = data.filter(item => item.id !== url.split('/').at(-1)); },
      toast: () => {}, fail: () => {}
    };
  });
  await page.addScriptTag({ path: path.join(ROOT, 'public/js/creativos/dibujos.js') });
  await page.locator('.cr-d-card').first().waitFor();
  assert.equal(await page.locator('.cr-d-editor-overlay').count(), 0, 'la galería no abre el editor automáticamente');
  assert.equal(await page.locator('#cr-d-view-toggle svg rect').count(), 4);
  const max = mobile ? 3 : 5;
  let count = Number(await page.locator('.cr-d-gallery').getAttribute('data-columns'));
  for (let i = 0; i < max; i++) {
    await page.locator('#cr-d-view-toggle').click(); count = count % max + 1;
    assert.equal(await page.locator('.cr-d-gallery').getAttribute('data-columns'), String(count));
  }
  const pixel = await page.locator('.cr-d-card').nth(1).locator('canvas').evaluate(canvas => [...canvas.getContext('2d').getImageData(240, 150, 1, 1).data]);
  assert.deepEqual(pixel.slice(0, 3), [223, 83, 104], 'la miniatura representa el dibujo guardado');
  await page.locator('#cr-d-new').click();
  await page.locator('#cr-d-title').fill('Prueba creativa');
  await page.locator('#cr-d-title').press('Tab');
  const box = await page.locator('#cr-d-canvas').boundingBox();
  assert.ok(Math.abs(box.width / box.height - 1.6) < 0.02, 'lienzo sin deformación ni márgenes internos');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, { steps: 10 });
  await page.mouse.up();
  await page.locator('#cr-d-undo').click();
  assert.equal(await page.locator('#cr-d-undo').isDisabled(), true);
  await page.locator('#cr-d-redo').click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#cr-d-close').click();
  assert.equal(await page.locator('.cr-d-editor-overlay').count(), 1, 'cerrar permite conservar un dibujo sin guardar');
  await page.evaluate(() => { failSave = true; });
  await page.locator('#cr-d-save').click();
  await page.waitForFunction(() => document.querySelector('#cr-d-status').textContent.includes('No se pudo guardar'));
  assert.equal(await page.locator('.cr-d-editor-overlay').count(), 1, 'error de guardado conserva el dibujo');
  await page.evaluate(() => { failSave = false; });
  await page.locator('#cr-d-save').click();
  await page.waitForFunction(() => !document.querySelector('.cr-d-editor-overlay'));
  assert.equal(await page.locator('.cr-d-card').count(), 3);
  const saved = await page.evaluate(() => data.find(item => item.id === 'nuevo'));
  assert.equal(saved.titulo, 'Prueba creativa');
  assert.equal(saved.contenido.length, 1);
  assert.ok(Math.abs(saved.contenido[0].puntos[0][0] - 0.2) < 0.01, 'coordenadas normalizadas correctas');
  await page.getByRole('button', { name: 'Editar dibujo Prueba creativa' }).click();
  await page.locator('#cr-d-eraser').click();
  assert.equal(await page.locator('#cr-d-eraser').getAttribute('aria-pressed'), 'true');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#cr-d-export').click();
  assert.equal((await downloadPromise).suggestedFilename(), 'Prueba creativa.png');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#cr-d-delete').click();
  await page.waitForFunction(() => !document.querySelector('.cr-d-editor-overlay'));
  assert.equal(await page.locator('.cr-d-card').count(), 2);
  assert.deepEqual(errors, []);
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    await check(browser, false);
    await check(browser, true);
    console.log('dibujos: galería, columnas, trazos, deshacer, guardado, recuperación de error, exportación y borrado correctos');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
