'use strict';
// Verifica el mosaico de Pizarra con distintas alturas y números de columnas.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const NOTES = [
  ['Primera', '<p>Breve</p>'],
  ['Segunda', '<p>Una nota más larga.</p><p>Otra línea.</p><p>Y otra.</p>'],
  ['Tercera', '<p>Una idea</p>'],
  ['Cuarta', '<p>Un texto de tamaño intermedio.</p>'],
  ['Quinta', '<p>Otra idea</p>'],
  ['Sexta', '<p>El último apunte.</p>']
].map(([titulo, contenido], index) => ({ id: String(index), titulo, contenido, color: 'amarillo' }));

async function check(browser, width, max) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.setContent('<html><body><main class="wrap" id="view-pizarra"></main></body></html>');
  for (const file of ['public/css/app/tokens.css', 'public/css/app/base.css', 'public/css/creativos.css']) {
    await page.addStyleTag({ path: path.join(ROOT, file) });
  }
  await page.evaluate(items => {
    window.KCCPizarraEditor = {
      open: (item, onSaved) => { item.contenido += '<p>Una línea adicional.</p>'.repeat(5); onSaved(item); },
      clean: html => html
    };
    window.K = { registerView: (_, view) => view.open(), get: async () => ({ items }), fail: error => { throw error; } };
  }, NOTES);
  await page.addScriptTag({ path: path.join(ROOT, 'public/js/creativos/pizarra.js') });
  await page.locator('.cr-p-preview').first().waitFor();
  assert.equal(await page.locator('.cr-p-density').count(), 0);
  for (let count = 1; count <= max; count++) {
    await page.getByRole('button', { name: 'Cambiar columnas' }).click();
    await page.getByRole('button', { name: count + (count === 1 ? ' columna' : ' columnas') }).click();
    assert.equal(await page.locator('.cr-p-column').count(), count);
    assert.equal(await page.locator('.cr-p-preview').count(), NOTES.length);
    assert.equal(await page.locator('#cr-p-view-toggle').getAttribute('aria-expanded'), 'false');
    const layout = await page.evaluate(() => [...document.querySelectorAll('.cr-p-column')].map(column =>
      [...column.querySelectorAll('.cr-p-preview')].map(card => {
        const box = card.getBoundingClientRect();
        return { title: card.querySelector('strong').textContent, x: box.x, y: box.y, right: box.right, bottom: box.bottom };
      })));
    for (let i = 0; i < Math.min(count, NOTES.length); i++) assert.equal(layout[i][0].title, NOTES[i].titulo);
    for (const column of layout) {
      for (let i = 1; i < column.length; i++) assert.ok(column[i].y >= column[i - 1].bottom, 'notas superpuestas');
      for (const card of column) assert.ok(card.right <= width + 1, 'nota fuera de pantalla');
    }
  }
  await page.getByRole('button', { name: 'Editar nota Primera' }).click();
  assert.equal(await page.locator('.cr-p-preview').count(), NOTES.length);
  const positions = await page.evaluate(() => [...document.querySelectorAll('.cr-p-column')].map(column =>
    [...column.children].map(card => ({ top: card.getBoundingClientRect().top, bottom: card.getBoundingClientRect().bottom }))));
  for (const column of positions) for (let i = 1; i < column.length; i++) assert.ok(column[i].top >= column[i - 1].bottom);
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    await check(browser, 390, 3);
    await check(browser, 1280, 5);
    console.log('pizarra-layout: notas ordenadas sin solaparse en todas las disposiciones');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
