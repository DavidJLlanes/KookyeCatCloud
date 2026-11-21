'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><button class="ia-acceso" id="btn-ia"><svg class="ico"></svg><span class="ia-txt">IA</span></button></body></html>');
      for (const file of ['public/css/buscar.css', 'public/css/app/tokens.css', 'public/css/app/base.css', 'public/css/app/responsive.css']) {
        await page.addStyleTag({ path: path.join(ROOT, file) });
      }
      await page.addScriptTag({ path: path.join(ROOT, 'public/js/app/tema.js') });
      for (const tema of ['grafito', 'oscuro', 'claro', 'monocromo-oscuro', 'monocromo-claro']) {
        for (const acento of ['azul', 'esmeralda', 'violeta', 'ambar', 'coral', 'grafito']) {
          const result = await page.evaluate(({ tema, acento }) => {
            document.documentElement.dataset.theme = tema;
            applyAccent(acento, false);
            const hex = ACENTOS.find(a => a.id === acento).b1;
            const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ');
            const style = getComputedStyle(document.getElementById('btn-ia'));
            return { expected: `rgb(${rgb})`, actual: style.backgroundColor, color: style.color };
          }, { tema, acento });
          assert.equal(result.actual, result.expected, `${width}px, ${tema}, ${acento}`);
          assert.ok(['rgb(255, 255, 255)', 'rgb(0, 0, 0)'].includes(result.color), `Contraste de ${acento}`);
        }
      }
      assert.equal(await page.locator('.ia-txt').evaluate(e => getComputedStyle(e).display === 'none'), width === 390);
      await page.close();
    }
    console.log('Botón IA: seis acentos en móvil y escritorio, con todos los temas OK');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
