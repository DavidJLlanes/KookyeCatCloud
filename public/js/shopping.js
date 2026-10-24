'use strict';
(function () {
  const root = document.getElementById('view-shopping');
  if (!root) return;
  const S = { data: { products: [], entries: [], categories: [] }, tab: 'pending', query: '', layouts: { pending: 'list', bought: 'list', catalog: 'grid' }, built: false, loading: false };
  try { S.layouts = { ...S.layouts, ...JSON.parse(localStorage.getItem('kcc-shop-layouts') || '{}') }; } catch {}
  const imageUrl = id => `${BASE}/api/shopping/products/${id}/image?v=${(S.data.products.find(p => p.id === id) || {}).updatedAt || 0}`;
  const esc = s => String(s || '');
  const byId = id => S.data.products.find(p => p.id === id);
  const matching = (p) => !S.query || `${p.name} ${p.category} ${p.unit}`.toLocaleLowerCase('es').includes(S.query.toLocaleLowerCase('es'));
  const fmt = n => Number(n) === Math.floor(Number(n)) ? String(Number(n)) : String(Number(n)).replace('.', ',');
  function boughtGroups() {
    const groups = new Map();
    S.data.entries.filter(e => e.status === 'bought' && byId(e.productId)).forEach(entry => {
      const group = groups.get(entry.productId) || { productId: entry.productId, quantity: 0, boughtAt: 0, entries: [] };
      group.quantity = Math.round((group.quantity + (Number(entry.quantity) || 0)) * 1000) / 1000; group.boughtAt = Math.max(group.boughtAt, entry.boughtAt || 0); group.entries.push(entry); groups.set(entry.productId, group);
    });
    return [...groups.values()].sort((a, b) => b.boughtAt - a.boughtAt);
  }
  function setLayout(layout) {
    S.layouts[S.tab] = layout;
    try { localStorage.setItem('kcc-shop-layouts', JSON.stringify(S.layouts)); } catch {}
    paint();
  }
  function load() {
    if (S.loading) return S.loading;
    S.loading = K.get('/api/shopping').then(data => { S.data = data; S.data.products ||= []; S.data.entries ||= []; S.data.categories ||= []; S.built = true; paint(); }).catch(K.fail).finally(() => { S.loading = false; });
    return S.loading;
  }
  function button(label, iconName, fn, cls = 'btn') {
    const b = el('button', cls); b.type = 'button'; if (iconName) b.appendChild(icon(iconName)); b.appendChild(el('span', null, label)); b.addEventListener('click', fn); return b;
  }
  function paint() {
    if (!S.built) return;
    root.textContent = '';
    const page = el('section', 'shop-page');
    const head = el('header', 'shop-head');
    const title = el('div'); title.append(el('h1', null, 'Lista de la compra'), el('p', 'k-muted', 'Compartida entre las cuentas de esta instalación'));
    const actions = el('div', 'shop-head-actions');
    actions.append(button('Categorías', 'i-tag', manageCategories, 'btn'), button('Nuevo producto', 'i-plus', () => editProduct(null), 'btn primary'));
    head.append(title, actions); page.appendChild(head);

    const bar = el('div', 'shop-toolbar');
    const search = el('label', 'search shop-search'); search.append(icon('i-search'));
    const input = el('input'); input.type = 'search'; input.placeholder = 'Buscar productos…'; input.value = S.query; input.setAttribute('aria-label', 'Buscar productos');
    input.addEventListener('input', () => { S.query = input.value; paint(); const next = root.querySelector('.shop-search input'); if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); } });
    search.appendChild(input); bar.appendChild(search);
    const tabs = el('div', 'shop-tabs', null); tabs.setAttribute('role', 'tablist');
    [['pending', 'Pendientes', S.data.entries.filter(e => e.status === 'pending').length], ['bought', 'Comprados', boughtGroups().length], ['catalog', 'Productos', S.data.products.length]].forEach(([key, label, count]) => {
      const b = el('button', S.tab === key ? 'is-active' : '', `${label} · ${count}`); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', S.tab === key ? 'true' : 'false'); b.addEventListener('click', () => { S.tab = key; paint(); }); tabs.appendChild(b);
    });
    bar.appendChild(tabs);
    const switcher = el('div', 'shop-view-switch'); switcher.setAttribute('role', 'group'); switcher.setAttribute('aria-label', 'Formato de visualización');
    [['list', 'i-list', 'Lista'], ['grid', 'i-grid', 'Cuadrícula']].forEach(([layout, iconName, label]) => {
      const b = el('button', S.layouts[S.tab] === layout ? 'is-active' : ''); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', S.layouts[S.tab] === layout ? 'true' : 'false'); b.appendChild(icon(iconName)); b.addEventListener('click', () => setLayout(layout)); switcher.appendChild(b);
    });
    bar.appendChild(switcher); page.appendChild(bar);
    const content = el('div', 'shop-content');
    if (S.tab === 'catalog') paintCatalog(content); else paintEntries(content, S.tab);
    page.appendChild(content); root.appendChild(page);
  }
  function emptyState(parent, title, sub, action) {
    const box = el('div', 'shop-empty'); box.append(el('div', 'shop-empty-icon', '🛒'), el('h2', null, title), el('p', 'k-muted', sub));
    if (action) box.appendChild(button('Añadir producto', 'i-plus', () => editProduct(null), 'btn primary'));
    parent.appendChild(box);
  }
  function productVisual(p, large = false) {
    const box = el('div', 'shop-product-image' + (large ? ' large' : ''));
    const showInitial = () => {
      box.classList.add('no-image'); box.textContent = '';
      const initial = Array.from(String(p.name || '').trim())[0]?.toLocaleUpperCase('es') || '?';
      box.appendChild(el('span', 'shop-product-initial', initial));
    };
    if (p.hasImage) { const img = el('img'); img.src = imageUrl(p.id); img.alt = `Imagen de ${p.name}`; img.loading = 'lazy'; img.addEventListener('error', showInitial); box.appendChild(img); }
    else showInitial();
    return box;
  }
  function productMeta(p) { return [p.category, p.unit].filter(Boolean).join(' · '); }
  function paintEntries(parent, status) {
    const entries = (status === 'bought' ? boughtGroups() : S.data.entries.filter(e => e.status === status && byId(e.productId)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)))
      .filter(entry => matching(byId(entry.productId)));
    if (!entries.length) return emptyState(parent, status === 'pending' ? 'Todo al día' : 'Aún no hay compras guardadas', status === 'pending' ? 'Añade productos o recupera algo de los comprados.' : 'Cuando marques algo como comprado, lo encontrarás aquí para repetirlo.', status === 'pending');
    const layout = S.layouts[status];
    const list = el('div', `shop-entry-list ${layout === 'grid' ? 'is-grid' : 'is-list'}`);
    entries.forEach(entry => {
      const p = byId(entry.productId); const row = el('article', `shop-entry ${status === 'bought' ? 'is-bought' : ''}`);
      const check = el('button', 'shop-check' + (status === 'bought' ? ' checked' : '')); check.type = 'button'; check.title = status === 'pending' ? 'Marcar como comprado' : 'Compra guardada'; check.setAttribute('aria-label', check.title); check.appendChild(icon('i-check'));
      if (status === 'pending') check.addEventListener('click', async () => { try { await K.put('/api/shopping/entries/' + entry.id, { status: 'bought' }); await load(); } catch (e) { K.fail(e); } }); else check.disabled = true;
      const main = el('div', 'shop-entry-main'); main.append(check, productVisual(p));
      const info = el('div', 'shop-entry-info'); const name = el('strong', null, p.name); const meta = productMeta(p); info.append(name); if (meta) info.appendChild(el('small', 'k-muted', meta));
      main.appendChild(info); row.appendChild(main);
      const actions = el('div', 'shop-entry-actions');
      if (status === 'pending') {
        const qty = el('input', 'shop-quantity'); qty.type = 'number'; qty.min = '0.001'; qty.step = 'any'; qty.max = '100000'; qty.value = entry.quantity; qty.setAttribute('aria-label', `Cantidad de ${p.name}`);
        qty.addEventListener('change', async () => { try { await K.put('/api/shopping/entries/' + entry.id, { quantity: qty.value }); await load(); } catch (e) { K.fail(e); } }); actions.appendChild(qty);
      } else {
        const qtyLabel = `${fmt(entry.quantity)}${p.unit ? ' ' + p.unit : ''}`;
        const qty = el('span', 'shop-bought-qty', entry.entries.length > 1 ? `${qtyLabel} · ${entry.entries.length} compras` : qtyLabel); qty.title = entry.entries.length > 1 ? `Total de ${entry.entries.length} compras guardadas` : 'Cantidad comprada'; actions.appendChild(qty);
        const again = button('Añadir otra vez', 'i-restore', async () => { try { await K.post('/api/shopping/entries', { productId: p.id, quantity: p.defaultQuantity || entry.quantity }); S.tab = 'pending'; await load(); } catch (e) { K.fail(e); } }, 'btn sm shop-again'); again.setAttribute('aria-label', `Añadir ${p.name} otra vez`); actions.appendChild(again);
      }
      const remove = el('button', 'icon-btn shop-remove'); remove.type = 'button'; remove.title = 'Quitar de esta lista'; remove.setAttribute('aria-label', 'Quitar de esta lista'); remove.appendChild(icon('i-x'));
      if (status === 'bought') { remove.title = `Quitar todas las compras guardadas de ${p.name}`; remove.setAttribute('aria-label', remove.title); }
      remove.addEventListener('click', async () => {
        try {
          if (status === 'bought') {
            if (!await K.confirm(`Se eliminarán todas las compras guardadas de “${p.name}”.`, { ok: 'Eliminar compras', danger: true })) return;
            await K.del(`/api/shopping/products/${p.id}/purchases`);
          }
          else await K.del('/api/shopping/entries/' + entry.id);
          await load();
        } catch (e) { K.fail(e); }
      }); actions.appendChild(remove); row.appendChild(actions);
      list.appendChild(row);
    });
    parent.appendChild(list);
  }
  function paintCatalog(parent) {
    const products = S.data.products.filter(matching).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (!products.length) return emptyState(parent, 'Tu catálogo está vacío', 'Guarda productos para reutilizarlos con sus cantidades, unidades e imágenes.', true);
    const layout = S.layouts.catalog;
    const grid = el('div', `shop-product-grid ${layout === 'list' ? 'is-list' : 'is-grid'}`);
    products.forEach(p => {
      const card = el('article', 'shop-product-card'); card.appendChild(productVisual(p, true));
      const body = el('div', 'shop-card-body'); const h = el('h3', null, p.name); body.appendChild(h);
      const meta = productMeta(p); if (meta) body.appendChild(el('p', 'k-muted', meta));
      body.appendChild(el('small', 'shop-default-qty', `Cantidad habitual: ${fmt(p.defaultQuantity)}${p.unit ? ' ' + p.unit : ''}`));
      const actions = el('div', 'shop-card-actions');
      actions.append(button('Añadir', 'i-plus', async () => { try { await K.post('/api/shopping/entries', { productId: p.id, quantity: p.defaultQuantity }); S.tab = 'pending'; await load(); } catch (e) { K.fail(e); } }, 'btn primary sm'));
      actions.append(button('Editar', 'i-pencil', () => editProduct(p), 'btn sm'));
      const del = el('button', 'icon-btn shop-remove'); del.type = 'button'; del.title = 'Eliminar producto del catálogo y de todas las listas'; del.appendChild(icon('i-trash'));
      del.addEventListener('click', async () => { if (!await K.confirm(`Se eliminará “${p.name}” del catálogo y también sus registros de compra.`, { ok: 'Eliminar', danger: true })) return; try { await K.del('/api/shopping/products/' + p.id); await load(); } catch (e) { K.fail(e); } }); actions.appendChild(del);
      body.appendChild(actions); card.appendChild(body); grid.appendChild(card);
    });
    parent.appendChild(grid);
  }

  function field(label, node, hint) { const l = el('label', 'shop-field'); l.append(el('span', null, label), node); if (hint) l.appendChild(el('small', 'k-muted', hint)); return l; }
  function editProduct(product) {
    const data = product || { name: '', unit: 'ud', defaultQuantity: 1, category: '', hasImage: false };
    const form = el('div', 'shop-product-form');
    const name = el('input'); name.type = 'text'; name.maxLength = 120; name.placeholder = 'Ej. Leche entera'; name.value = data.name;
    const quantity = el('input'); quantity.type = 'number'; quantity.min = '.001'; quantity.max = '100000'; quantity.step = 'any'; quantity.value = data.defaultQuantity || 1;
    const unit = el('select'); [['ud','Unidad'],['kg','kg'],['g','g'],['l','l'],['ml','ml'],['paquete','Paquete'],['caja','Caja'],['docena','Docena'],['','Sin unidad']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; unit.appendChild(o); }); unit.value = data.unit || '';
    const category = el('select'); const noCat = el('option', null, 'Sin categoría'); noCat.value = ''; category.appendChild(noCat); S.data.categories.forEach(c => { const o = el('option', null, c.name); o.value = c.name; category.appendChild(o); });
    if (data.category && !S.data.categories.some(c => c.name === data.category)) { const o = el('option', null, data.category); o.value = data.category; category.appendChild(o); } category.value = data.category || '';
    form.append(field('Producto', name), el('div', 'shop-form-row', null)); form.lastChild.append(field('Cantidad habitual', quantity), field('Unidad', unit)); form.append(field('Categoría', category));
    let pendingCheck = null;
    if (!product) { pendingCheck = el('input'); pendingCheck.type = 'checkbox'; pendingCheck.checked = true; const label = el('label', 'shop-add-check'); label.append(pendingCheck, el('span', null, 'Añadir también a pendientes')); form.appendChild(label); }
    const imageArea = el('div', 'shop-image-editor');
    if (product?.hasImage) imageArea.append(productVisual(product, true));
    const pick = el('input'); pick.type = 'file'; pick.accept = 'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,image/tiff'; pick.hidden = true;
    const camera = el('input'); camera.type = 'file'; camera.accept = 'image/*'; camera.setAttribute('capture', 'environment'); camera.hidden = true;
    const pickBtn = button('Elegir imagen', 'i-image', () => pick.click(), 'btn sm'); const cameraBtn = button('Usar cámara', 'i-image', () => camera.click(), 'btn sm');
    let imageBlob = null, removeImage = false;
    function chosen(file) { if (!file) return; cropImage(file).then(blob => { if (!blob) return; imageBlob = blob; removeImage = false; imageArea.textContent = ''; const preview = el('img'); preview.src = URL.createObjectURL(blob); preview.alt = 'Recorte cuadrado del producto'; imageArea.appendChild(preview); }).catch(e => K.fail(e)); }
    pick.addEventListener('change', () => { chosen(pick.files[0]); pick.value = ''; }); camera.addEventListener('change', () => { chosen(camera.files[0]); camera.value = ''; });
    imageArea.append(pick, camera, pickBtn, cameraBtn);
    if (product?.hasImage) imageArea.appendChild(button('Quitar imagen', 'i-trash', () => { imageBlob = null; removeImage = true; imageArea.textContent = ''; imageArea.append(pick, camera, pickBtn, cameraBtn); }, 'btn ghost sm'));
    form.append(field('Imagen del producto', imageArea, 'JPG, PNG, WebP, AVIF o HEIC · recorte cuadrado · se guarda como WebP de 300 × 300'));
    let persistedId = product?.id || null;
    K.modal({ title: product ? 'Editar producto' : 'Nuevo producto', sub: 'Los productos comprados siguen guardados para volver a elegirlos.', content: form, cls: 'shop-modal', actions: [
      { label: 'Cancelar' },
      { label: 'Guardar', primary: true, onClick: async () => {
        if (!name.value.trim()) { name.focus(); K.toast('Escribe el nombre del producto'); return false; }
        try {
          const payload = { name: name.value, unit: unit.value, quantity: quantity.value, category: category.value };
          let id = persistedId;
          if (id) await K.put('/api/shopping/products/' + id, payload);
          else { const r = await K.post('/api/shopping/products', { ...payload, addToList: pendingCheck.checked }); id = r.product.id; persistedId = id; }
          if (imageBlob) { const fd = new FormData(); fd.append('image', imageBlob, 'producto.webp'); const response = await api(`${BASE}/api/shopping/products/${id}/image`, { method: 'POST', body: fd }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo guardar la imagen'); }
          else if (product && removeImage) await K.del('/api/shopping/products/' + product.id + '/image');
          await load(); K.toast(product ? 'Producto actualizado' : 'Producto guardado');
        } catch (e) { K.fail(e); return false; }
      } },
    ] });
  }

  function cropImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file); const image = new Image();
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir esta imagen')); };
      image.onload = () => {
        const w = image.naturalWidth, h = image.naturalHeight; if (!w || !h || w * h > 40000000) { URL.revokeObjectURL(url); return reject(new Error('La imagen es demasiado grande')); }
        const content = el('div', 'shop-cropper'); const canvas = el('canvas'); canvas.width = 300; canvas.height = 300; canvas.setAttribute('aria-label', 'Recorte cuadrado. Arrastra la imagen para encuadrarla.');
        const zoom = el('input'); zoom.type = 'range'; zoom.min = '1'; zoom.max = '3'; zoom.step = '.01'; zoom.value = '1';
        content.append(canvas, el('p', 'k-muted', 'Arrastra la imagen para encuadrarla. Ajusta el zoom y guarda el recorte cuadrado.'), field('Zoom', zoom));
        const ctx = canvas.getContext('2d'); let z = 1, cx = w / 2, cy = h / 2, down = null;
        function paintCrop() {
          const side = Math.min(w, h) / z; cx = Math.max(side / 2, Math.min(w - side / 2, cx)); cy = Math.max(side / 2, Math.min(h - side / 2, cy));
          ctx.clearRect(0, 0, 300, 300); ctx.drawImage(image, cx - side / 2, cy - side / 2, side, side, 0, 0, 300, 300);
        }
        canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, cx, cy }; canvas.setPointerCapture(e.pointerId); });
        canvas.addEventListener('pointermove', e => { if (!down) return; const scale = Math.min(w, h) / z / 300; cx = down.cx - (e.clientX - down.x) * scale; cy = down.cy - (e.clientY - down.y) * scale; paintCrop(); });
        canvas.addEventListener('pointerup', () => { down = null; });
        zoom.addEventListener('input', () => { z = Number(zoom.value); paintCrop(); }); paintCrop(); URL.revokeObjectURL(url);
        let settled = false;
        K.modal({ title: 'Recortar imagen', sub: 'El producto conservará este encuadre cuadrado.', content, cls: 'shop-crop-modal', actions: [
          { label: 'Cancelar' }, { label: 'Usar recorte', primary: true, onClick: async () => { try { const blob = await new Promise((ok, no) => canvas.toBlob(b => b ? ok(b) : no(new Error('No se pudo procesar la imagen')), 'image/webp', .86)); settled = true; resolve(blob); } catch (e) { reject(e); } } },
        ], onClose: () => { if (!settled) { settled = true; resolve(null); } } });
      };
      image.src = url;
    });
  }
  function manageCategories() {
    const box = el('div', 'shop-categories'); const add = el('div', 'shop-category-add'); const input = el('input'); input.placeholder = 'Nueva categoría'; input.maxLength = 60; let modal;
    add.append(input, button('Añadir', 'i-plus', async () => { if (!input.value.trim()) return; try { await K.post('/api/shopping/categories', { name: input.value }); modal.close(); await load(); manageCategories(); } catch (e) { K.fail(e); } }, 'btn primary sm')); box.appendChild(add);
    if (!S.data.categories.length) box.appendChild(el('p', 'k-muted', 'No hay categorías todavía. Son opcionales.'));
    S.data.categories.forEach(c => { const row = el('div', 'shop-category-row'); const name = el('input'); name.value = c.name; name.maxLength = 60;
      const save = button('Guardar', 'i-check', async () => { try { await K.put('/api/shopping/categories/' + c.id, { name: name.value }); modal.close(); await load(); manageCategories(); } catch (e) { K.fail(e); } }, 'btn sm');
      const del = el('button', 'icon-btn shop-remove'); del.type = 'button'; del.title = 'Eliminar categoría'; del.appendChild(icon('i-trash')); del.addEventListener('click', async () => { try { await K.del('/api/shopping/categories/' + c.id); modal.close(); await load(); manageCategories(); } catch (e) { K.fail(e); } }); row.append(name, save, del); box.appendChild(row); });
    modal = K.modal({ title: 'Categorías', sub: 'Opcionales y compartidas con todas las cuentas.', content: box, cls: 'shop-modal', actions: [{ label: 'Cerrar', primary: true }] });
  }
  K.registerView('shopping', { open() { load(); }, close() {} });
})();
