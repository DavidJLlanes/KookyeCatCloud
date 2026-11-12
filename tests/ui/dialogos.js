'use strict';
// Foco y teclado de diálogos (K.modal) y menús (K.menu, menú contextual): nombre accesible, foco inicial, Tab atrapado, foco de
// vuelta al cerrar, flechas en menús y que Esc siga cerrando diálogos. Sobre una COPIA de la app (ver README):
// UI_URL=http://localhost:4733 UI_PASS=... node tests/ui/dialogos.js
const { chromium } = require('playwright');
const URL_ = process.env.UI_URL || 'http://localhost:4733', PASS = process.env.UI_PASS;
let fallos = 0;
const ok = (c, msg) => { if (!c) fallos++; console.log(`${c ? 'OK   ' : 'FALLA'} ${msg}`); };

async function ejecuta(nombre, opciones) {
  const b = await chromium.launch(); const ctx = await b.newContext(opciones); const p = await ctx.newPage();
  const errores = []; p.on('pageerror', (e) => errores.push(e.message));
  const items = Array.from({ length: 6 }, (_, i) => ({ name: `doc-${i}.txt`, isDir: false, size: 100 + i, modified: Date.now() - i * 3600e3 }));
  await p.route('**/api/files?*', (r) => r.fulfill({ json: { items, perm: null } }));
  await p.goto(URL_); await p.fill('#login-user', 'admin'); await p.fill('#login-pass', PASS); await p.keyboard.press('Enter');
  await p.waitForSelector('#file-list .row,#file-list .tile'); await p.waitForTimeout(600);
  const tactil = !!opciones.hasTouch;
  const activo = () => p.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.className || a.tagName) + '|' + (a.textContent || '').trim().slice(0, 20) : ''; });

  // --- Confirmación destructiva
  await p.evaluate(() => { const b = document.createElement('button'); b.id = 'abridor'; b.textContent = 'abrir'; document.body.prepend(b); b.focus(); });
  await p.evaluate(() => { window.__r = 'pendiente'; K.confirm('¿Borrar para siempre?', { ok: 'Borrar', danger: true }).then((v) => { window.__r = v; }); });
  await p.waitForSelector('.overlay:not([hidden]) .modal');
  const m = await p.evaluate(() => { const e = document.querySelector('.overlay:not([hidden]) .modal'); return { rol: e.getAttribute('role'), nombre: !!document.getElementById(e.getAttribute('aria-labelledby') || '_'), desc: !!document.getElementById(e.getAttribute('aria-describedby') || '_') }; });
  ok(m.rol === 'dialog' && m.nombre && m.desc, `${nombre}: el diálogo tiene rol, nombre y descripción`);
  ok((await activo()).includes('Cancelar'), `${nombre}: la confirmación destructiva enfoca Cancelar (${await activo()})`);
  let dentro = true;
  for (let i = 0; i < 5; i++) { await p.keyboard.press('Tab'); dentro = dentro && await p.evaluate(() => !!document.activeElement.closest('.overlay')); }
  await p.keyboard.press('Shift+Tab'); dentro = dentro && await p.evaluate(() => !!document.activeElement.closest('.overlay'));
  ok(dentro, `${nombre}: el Tab no se escapa del diálogo`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok(!(await p.$('.overlay:not([hidden]) .modal')) && await p.evaluate(() => window.__r) === false, `${nombre}: Esc cierra el diálogo y devuelve false`);
  ok((await activo()).startsWith('abridor'), `${nombre}: el foco vuelve a quien lo abrió (${await activo()})`);

  // --- Formulario con campo
  await p.evaluate(() => { K.ask('Nombre', { value: 'hola' }); });
  await p.waitForSelector('.overlay:not([hidden]) .modal input'); await p.waitForTimeout(150);
  const enCampo = await p.evaluate(() => document.activeElement.tagName === 'INPUT');
  ok(enCampo, `${nombre}: K.ask enfoca su campo (lo hace él mismo, también en táctil)`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);

  // --- Diálogo con campo SIN enfoque propio: en táctil no debe abrir el teclado
  await p.evaluate(() => { const i = document.createElement('input'); i.id = 'campo-x'; K.modal({ title: 'Ficha', content: i, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true }] }); });
  await p.waitForSelector('.overlay:not([hidden]) .modal'); await p.waitForTimeout(100);
  const foco2 = await p.evaluate(() => document.activeElement.id === 'campo-x' ? 'campo' : document.activeElement.classList.contains('modal') ? 'dialogo' : 'otro');
  ok(tactil ? foco2 === 'dialogo' : foco2 === 'campo', `${nombre}: foco inicial del formulario = ${foco2} (${tactil ? 'táctil: el diálogo, sin teclado' : 'ratón: el primer campo'})`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);

  // --- Menú desplegable
  await p.evaluate(() => { window.__m = ''; const b = document.getElementById('abridor'); b.focus();
    K.menu(b, [{ label: 'Uno', onClick: () => { window.__m = 'uno'; } }, '-', { label: 'Dos' }, { label: 'Tres' }]); });
  await p.waitForSelector('.k-pop'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => document.querySelector('.k-pop').getAttribute('role') === 'menu' && document.querySelectorAll('.k-pop [role=menuitem]').length === 3), `${nombre}: el menú tiene role=menu y 3 menuitem`);
  ok((await activo()).includes('Uno'), `${nombre}: el menú enfoca su primera opción`);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown');
  ok((await activo()).includes('Tres'), `${nombre}: las flechas mueven el foco (${await activo()})`);
  await p.keyboard.press('ArrowDown');
  ok((await activo()).includes('Uno'), `${nombre}: da la vuelta al llegar al final`);
  await p.keyboard.press('End'); ok((await activo()).includes('Tres'), `${nombre}: Fin va a la última`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  ok(!(await p.$('.k-pop')) && (await activo()).startsWith('abridor'), `${nombre}: Esc cierra el menú y devuelve el foco (${await activo()})`);
  // Esc no debe quedar atascado en un menú ya cerrado: un diálogo posterior se cierra con Esc
  await p.evaluate(() => { K.modal({ title: 'Prueba', actions: [{ label: 'Cerrar' }] }); }); await p.waitForSelector('.overlay:not([hidden]) .modal');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok(!(await p.$('.overlay:not([hidden]) .modal')), `${nombre}: tras cerrar un menú, Esc sigue cerrando diálogos`);
  await p.evaluate(() => { const b = document.getElementById('abridor'); b.focus(); K.menu(b, [{ label: 'Uno', onClick: () => { window.__m = 'uno'; } }]); });
  await p.waitForSelector('.k-pop'); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => window.__m) === 'uno', `${nombre}: Intro activa la opción`);

  // --- Menú contextual de archivos
  const fila = await p.$('#file-list .row,#file-list .tile');
  await fila.click({ button: 'right' }); await p.waitForSelector('#ctxmenu:not([hidden])'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => document.getElementById('ctxmenu').getAttribute('role') === 'menu' && document.querySelectorAll('#ctxmenu [role=menuitem]').length > 3), `${nombre}: el menú contextual tiene roles`);
  const primera = await activo();
  await p.keyboard.press('ArrowDown'); ok(await activo() !== primera, `${nombre}: el menú contextual se recorre con flechas`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => document.getElementById('ctxmenu').hidden), `${nombre}: Esc cierra el menú contextual`);
  await fila.click({ button: 'right' }); await p.waitForTimeout(100); await p.keyboard.press('Escape');
  await fila.click({ button: 'right' }); await p.waitForTimeout(100);
  ok(await p.evaluate(() => document.querySelectorAll('#ctxmenu [role=menuitem]').length) === await p.evaluate(() => document.querySelectorAll('#ctxmenu button').length), `${nombre}: reabrir el menú contextual no duplica nada`);

  // --- Menú contextual de Notas (misma capa, otras opciones)
  await p.evaluate(() => { menuNota(60, 60, { id: 'x1', title: 'Nota de prueba', type: 'note', parent: '' }); });
  await p.waitForTimeout(100);
  ok(await p.evaluate(() => document.getElementById('ctxmenu').getAttribute('role') === 'menu' && document.querySelectorAll('#ctxmenu [role=menuitem]').length >= 2 && document.activeElement.getAttribute('role') === 'menuitem'), `${nombre}: el menú contextual de Notas tiene roles y foco`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);

  // --- Gesto «atrás» (botón atrás del móvil): cierra el diálogo y no saca de la app
  const url0 = p.url();
  const atras = async () => { await p.goBack({ waitUntil: 'commit', timeout: 5000 }).catch(() => {}); await p.waitForTimeout(250); };
  const abiertos = () => p.evaluate(() => document.querySelectorAll('.overlay:not([hidden]) .modal').length);
  const estado = () => p.evaluate(() => !!(history.state && history.state.kccModal));
  await p.evaluate(() => { K.modal({ title: 'Ficha A', actions: [{ label: 'Cerrar' }] }); });
  await p.waitForSelector('.overlay:not([hidden]) .modal');
  ok(await estado(), `${nombre}: abrir un diálogo añade una entrada de historial`);
  await atras();
  ok(await abiertos() === 0 && p.url() === url0, `${nombre}: «atrás» cierra el diálogo y se queda en la app (${p.url() === url0 ? 'misma URL' : p.url()})`);
  await p.evaluate(() => { K.modal({ title: 'Ficha B', actions: [{ label: 'Cerrar' }] }); });
  await p.waitForSelector('.overlay:not([hidden]) .modal'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok(await abiertos() === 0 && !(await estado()), `${nombre}: cerrar con Esc libera la entrada del historial`);

  // Anidados: confirmación encima de una ficha; cada «atrás» cierra uno
  await p.evaluate(() => { K.modal({ title: 'Ficha C', actions: [{ label: 'Cerrar' }] }); K.confirm('¿Seguro?'); });
  await p.waitForFunction(() => document.querySelectorAll('.overlay:not([hidden]) .modal').length === 2);
  await atras(); ok(await abiertos() === 1, `${nombre}: con dos diálogos, el primer «atrás» cierra solo el de encima`);
  ok(await estado(), `${nombre}: la entrada se mantiene mientras quede uno`);
  await atras(); ok(await abiertos() === 0 && p.url() === url0, `${nombre}: el segundo «atrás» cierra el otro`);

  // Con cambios sin guardar: «atrás» pregunta; cancelar mantiene el diálogo (y repone la entrada)
  await p.evaluate(() => { const t = document.createElement('textarea'); t.id = 'texto-largo'; K.modal({ title: 'Redacta', content: t, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true }] }); });
  await p.waitForSelector('#texto-largo'); await p.fill('#texto-largo', 'Esto es un texto bastante largo que no quiero perder');
  await atras(); await p.waitForSelector('.overlay:not([hidden]) .modal-actions .btn.danger', { timeout: 3000 }).catch(() => {});
  ok(await abiertos() === 2, `${nombre}: con cambios sin guardar, «atrás» pregunta antes de descartar`);
  await p.locator('.overlay:not([hidden]) .modal').last().locator('.btn', { hasText: 'Cancelar' }).click(); await p.waitForTimeout(200);
  ok(await abiertos() === 1 && await estado(), `${nombre}: al cancelar, el diálogo sigue abierto y «atrás» sigue protegido`);
  await atras(); await p.waitForTimeout(100);
  ok(await abiertos() === 2, `${nombre}: el segundo «atrás» vuelve a preguntar`);
  await p.click('.overlay:not([hidden]) .modal-actions .btn.danger'); await p.waitForTimeout(400);
  ok(await abiertos() === 0 && p.url() === url0, `${nombre}: tras descartar se cierra todo sin salir de la app`);
  ok(errores.length === 0, `${nombre}: sin errores de JavaScript ${errores.join(' | ').slice(0, 120)}`);
  await b.close();
}
(async () => {
  await ejecuta('escritorio', { viewport: { width: 1280, height: 800 } });
  await ejecuta('móvil', { viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  process.exit(fallos ? 1 : 0);
})();
