'use strict';
// Carpeta con 5.000 archivos simulados (sin tocar datos): la primera fila debe salir enseguida, la interfaz no debe congelarse
// (tareas largas) y al final deben estar todos los nodos. Guía modern-web-guidance «break-up-long-tasks» y «defer-rendering».
// UI_URL=http://localhost:4733 UI_PASS=... node tests/ui/carpeta-grande.js   (sobre una COPIA de la app, ver README)
const { chromium } = require('playwright');
const URL_ = process.env.UI_URL || 'http://localhost:4733', PASS = process.env.UI_PASS, N = 5000;
(async () => {
  let fallos = 0;
  for (const [nombre, ancho] of [['móvil', 390], ['escritorio', 1280]]) {
    const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: ancho, height: 800 } })).newPage();
    const items = Array.from({ length: N }, (_, i) => ({ name: `foto-${i}.${i % 3 ? 'jpg' : 'pdf'}`, isDir: false, size: 1000 + i, modified: Date.now() - i * 3600e3 }));
    await p.route('**/api/files?*', r => r.fulfill({ json: { items, perm: null } }));
    await p.route('**/api/thumb*', r => r.abort());
    await p.addInitScript(() => { window.__lt = []; window.__t0 = 0;
      new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ entryTypes: ['longtask'] });
      new MutationObserver(() => { if (!window.__f && document.querySelector('#file-list .row,#file-list .tile')) window.__f = performance.now(); }).observe(document, { subtree: true, childList: true }); });
    await p.goto(URL_); await p.fill('#login-user', 'admin'); await p.fill('#login-pass', PASS);
    const t0 = await p.evaluate(() => performance.now()); await p.keyboard.press('Enter');
    await p.waitForSelector('#file-list .row,#file-list .tile'); await p.waitForTimeout(6000);
    const r = await p.evaluate(() => ({ f: window.__f, lt: window.__lt, nodos: document.querySelectorAll('#file-list .row,#file-list .tile').length }));
    const despues = r.lt.filter(x => x[0] > r.f), total = despues.reduce((a, x) => a + x[1], 0), max = Math.max(0, ...despues.map(x => x[1]));
    const ok = r.nodos === N && r.f - t0 < 3000 && max < 600 && total < 2500;
    if (!ok) fallos++;
    console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}: primera fila ${Math.round(r.f - t0)} ms, nodos ${r.nodos}/${N}, tareas largas ${Math.round(total)} ms (máx ${Math.round(max)} ms)`);
    await b.close();
  }
  process.exit(fallos ? 1 : 0);
})();
