'use strict';
/* Regresiones de selección y cargas cruzadas antes de borrar archivos. Ejecutar con node tests/ui/archivos-borrado.js. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent('<main id="view-files"><button id="btn-file-columns"></button><div id="file-list"></div><div id="search-info"></div></main>');
    await page.evaluate(() => {
      Object.defineProperty(window, 'localStorage', { value: { getItem: () => null, setItem() {} } });
      window.state = { path: 'CarpetaA', query: '', items: [], selection: new Set(), filter: 'all', sort: 'name-asc', view: 'grid', selectMode: false, lastIndex: -1, agrupar: false, tab: 'files' };
      window.BASE = ''; window.$ = id => document.getElementById(id); window.qs = encodeURIComponent;
      window.joinPath = (dir, name) => (dir ? dir + '/' : '') + name;
      window.catOf = () => 'other';
      window.pending = [];
      window.api = () => new Promise(resolve => { (window.pending ||= []).push(resolve); });
      window.updateSelbar = () => {}; window.render = () => {}; window.cargarMetaFotos = () => {};
      window.anulaTandas = () => {}; window.renderBreadcrumb = () => {}; window.renderSkeleton = () => {};
      window.KCC = {};
    });
    const root = path.resolve(__dirname, '../..');
    await page.addScriptTag({ path: path.join(root, 'public/js/app/navegacion/lista.js') });
    await page.addScriptTag({ path: path.join(root, 'public/js/app/navegacion/busqueda-seleccion.js') });
    await page.addScriptTag({ path: path.join(root, 'public/js/app/navegacion/agrupacion.js') });
    await page.evaluate(() => { render = () => {}; updateSelbar = () => {}; });
    const result = await page.evaluate(async () => {
      const first = refresh({ silent: true });
      state.path = '';
      const second = refresh({ silent: true });
      if (pending.length !== 2) throw new Error(`Solo se iniciaron ${pending.length} cargas`);
      pending[1]({ ok: true, json: async () => ({ items: [{ name: 'Conservar.txt', isDir: false, modified: '2026-01-01' }] }) });
      await second;
      pending[0]({ ok: true, json: async () => ({ items: [{ name: 'Oculto.txt', isDir: false, modified: '2026-01-01' }] }) });
      await first;
      const afterRace = state.items.map(i => i.rel);
      state.items = [
        { name: 'CarpetaA', rel: 'CarpetaA', isDir: true, modified: '2026-01-01' },
        { name: 'CarpetaB', rel: 'CarpetaB', isDir: true, modified: '2026-01-01' },
        { name: 'Oculto.txt', rel: 'Oculto.txt', isDir: false, modified: '2026-01-01' },
      ];
      state.selection = new Set(['CarpetaA', 'CarpetaB', 'Oculto.txt']);
      state.filter = 'image';
      const selected = selectedItems().map(i => i.rel);
      state.filter = 'all'; state.agrupar = true; state.selection.clear();
      seleccionarRango(0, 1);
      const range = [...state.selection];
      return { afterRace, selected, range };
    });
    assert.deepEqual(result.afterRace, ['Conservar.txt']);
    assert.deepEqual(result.selected, ['CarpetaA', 'CarpetaB']);
    assert.deepEqual(result.range.sort(), ['CarpetaA', 'CarpetaB']);
    console.log('Archivos: cargas cruzadas y selección segura antes del borrado OK');
    await page.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
