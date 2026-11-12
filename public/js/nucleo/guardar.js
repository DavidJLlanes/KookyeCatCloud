'use strict';
/* Guardar archivos: toda exportación y descarga de la app pasa por aquí para que SIEMPRE se pregunte dónde guardar.
     · PC (Chrome, Edge, Opera…): cuadro «Guardar como» del sistema (showSaveFilePicker), con carpeta y nombre a elegir.
     · iPhone y iPad: hoja de compartir con el archivo → «Guardar en Archivos» y la carpeta que se quiera.
     · Android: menú de compartir con el archivo → Archivos, Drive u otra app (el navegador no permite un «Guardar como»).
     · Resto (Firefox, Safari de escritorio…): descarga normal; el navegador la deja en su carpeta de descargas.
   Primero se prepara el archivo (con aviso «Preparando…» y botón de cancelar si tarda) y después se enseña un cuadro con
   el nombre, el tamaño y el botón de guardar: los navegadores solo dejan abrir el selector o la hoja de compartir con un
   toque RECIENTE del usuario y una exportación larga lo caducaría; por eso el último paso es siempre un toque nuevo.
   API:
     K.guardar({ nombre, blob | texto, tipo })       → 'guardado' | 'descargado' | 'cancelado'
     K.guardarDe(async (signal) => ({ blob, nombre })) → prepara con «Preparando…» y luego guarda
     K.guardarUrl(url, { nombre, opciones })         → baja una URL de la API (con sesión) y la guarda
     K.guardarPeticion(url, cuerpo, { nombre })      → igual, con POST y cuerpo JSON (p. ej. el PDF) */
(function () {
  if (!window.K) return;

  const UA = navigator.userAgent || '';
  const IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || ''));
  const ANDROID = /Android/i.test(UA);
  const MOVIL = IOS || ANDROID;
  // En el móvil el archivo se guarda en memoria para compartirlo: por encima de esto se deja que lo descargue el navegador
  const LIMITE_MEMORIA = (MOVIL ? 150 : 600) * 1024 * 1024;

  const TIPOS = {
    pdf: 'application/pdf', zip: 'application/zip', json: 'application/json', csv: 'text/csv', md: 'text/markdown',
    txt: 'text/plain', vcf: 'text/vcard', ics: 'text/calendar', html: 'text/html', png: 'image/png', jpg: 'image/jpeg',
    jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  };
  const extDe = (n) => { const m = /\.([A-Za-z0-9]{1,8})$/.exec(n || ''); return m ? m[1].toLowerCase() : ''; };
  const tipoDe = (n) => TIPOS[extDe(n)] || 'application/octet-stream';
  const limpiaNombre = (n) => String(n || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').trim().slice(0, 150) || 'archivo';
  const tam = (n) => n < 1024 ? n + ' B' : n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';

  // Las URLs de la API llegan con o sin la ruta base de la app (/cloud)
  const absoluta = (u) => (/^https?:/.test(u) || (BASE && u.startsWith(BASE + '/')) ? u : BASE + u);

  const puedeSelector = () => typeof window.showSaveFilePicker === 'function' && window.isSecureContext && !MOVIL;
  function puedeCompartir(file) {
    try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); } catch { return false; }
  }

  // Descarga normal: el navegador la deja en su carpeta de descargas
  function descargaClasica(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  // Para archivos demasiado grandes para tenerlos en memoria: el navegador baja la URL directamente
  function descargaDirecta(url) {
    const a = document.createElement('a');
    a.href = url; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function nombreDeCabecera(res) {
    const cd = res.headers.get('Content-Disposition') || '';
    let m = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(cd);
    if (m) { try { return decodeURIComponent(m[1].trim()); } catch { /* sigue */ } }
    m = /filename\s*=\s*"?([^";]+)"?/i.exec(cd);
    return m ? m[1].trim() : '';
  }

  function ayuda(nombre) {
    if (IOS) return 'Se abrirá la hoja de compartir: elige «Guardar en Archivos» y la carpeta donde lo quieras.';
    if (ANDROID) return 'Se abrirá el menú de compartir: elige «Archivos», «Drive» u otra app para guardarlo donde quieras. «Descargar» lo deja en la carpeta Descargas.';
    if (puedeSelector()) return 'Se abrirá el cuadro de guardado de tu sistema para elegir la carpeta y el nombre.';
    return 'Tu navegador lo guardará en su carpeta de descargas. Para que pregunte la carpeta, activa «Preguntar dónde guardar cada archivo» en sus ajustes.';
  }

  /* ---------- Guardar un archivo ya preparado ---------- */
  K.guardar = function (o) {
    const nombre = limpiaNombre(o.nombre);
    const tipo = o.tipo || (o.blob && o.blob.type) || tipoDe(nombre);
    const blob = o.blob ? (o.blob.type === tipo ? o.blob : new Blob([o.blob], { type: tipo })) : new Blob([o.texto == null ? '' : o.texto], { type: tipo });
    const file = new File([blob], nombre, { type: tipo });
    return new Promise((resolve) => {
      let resultado = 'cancelado';
      const cuerpo = el('div', 'gd');
      const fila = el('div', 'gd-fila');
      fila.appendChild(icon('i-doc'));
      const info = el('div', 'gd-info');
      info.append(el('b', 'gd-nombre', nombre), el('span', 'gd-meta', `${(extDe(nombre) || 'archivo').toUpperCase()} · ${tam(blob.size)}`));
      fila.appendChild(info);
      cuerpo.append(fila, el('p', 'gd-ayuda', ayuda(nombre)));

      const acciones = [];
      if (puedeSelector()) {
        acciones.push({
          label: 'Elegir dónde guardar…', primary: true, id: 'elegir',
          onClick: async (m) => {
            try {
              const opts = { suggestedName: nombre };
              if (extDe(nombre) && tipo !== 'application/octet-stream') opts.types = [{ description: extDe(nombre).toUpperCase(), accept: { [tipo.split(';')[0]]: ['.' + extDe(nombre)] } }];
              const h = await window.showSaveFilePicker(opts);
              const w = await h.createWritable();
              await w.write(blob); await w.close();
              resultado = 'guardado'; K.toast('Guardado: ' + h.name);
            } catch (e) {
              if (e && e.name === 'AbortError') return false;            // cerró el cuadro: se queda el nuestro abierto
              K.toast('No se pudo abrir el cuadro de guardado; se descarga normal'); descargaClasica(blob, nombre); resultado = 'descargado';
            }
          },
        });
      } else if (puedeCompartir(file)) {
        acciones.push({
          label: IOS ? 'Guardar en Archivos…' : 'Guardar o compartir…', primary: true, id: 'elegir',
          onClick: async () => {
            try { await navigator.share({ files: [file], title: nombre }); resultado = 'guardado'; }
            catch (e) {
              if (e && e.name === 'AbortError') return false;
              if (e && e.name === 'NotAllowedError') { K.toast('Pulsa otra vez para guardar'); return false; }
              K.toast('No se pudo abrir el menú de compartir; se descarga normal'); descargaClasica(blob, nombre); resultado = 'descargado';
            }
          },
        });
      }
      const primario = acciones.length > 0;
      acciones.push({ label: 'Descargar', primary: !primario, onClick: () => { descargaClasica(blob, nombre); resultado = 'descargado'; K.toast('Descargando ' + nombre); } });
      acciones.push({ label: 'Cancelar' });
      K.modal({ title: 'Guardar archivo', content: cuerpo, cls: 'gd-modal', actions: acciones, onClose: () => resolve(resultado) });
    });
  };

  /* ---------- Preparar (con «Preparando…») y guardar ---------- */
  // preparar(signal) devuelve { blob, nombre }; si tarda más de ~0,6 s se enseña «Preparando…» con botón de cancelar
  K.guardarDe = async function (preparar, o = {}) {
    const ctl = new AbortController();
    let espera = null, aviso = null, cancelado = false;
    espera = setTimeout(() => {
      aviso = K.modal({
        title: o.titulo || 'Preparando el archivo…', cls: 'gd-modal', dismiss: false,
        content: el('p', 'gd-ayuda', 'Puede tardar unos segundos. Puedes cancelar si quieres.'),
        actions: [{ label: 'Cancelar', onClick: () => { cancelado = true; ctl.abort(); } }],
      });
    }, 600);
    let listo = null;
    try { listo = await preparar(ctl.signal); }
    catch (e) { if (!cancelado && !(e && e.name === 'AbortError')) K.fail(e); }
    finally { clearTimeout(espera); if (aviso) aviso.close(); }
    if (!listo || cancelado) return 'cancelado';
    if (listo.directa) return 'descargado';
    return K.guardar({ nombre: listo.nombre || o.nombre, blob: listo.blob, tipo: o.tipo });
  };

  // Lee la respuesta (con control de errores y de tamaño) y devuelve { blob, nombre } o { directa: true }
  async function aArchivo(res, o, urlDirecta) {
    if (!res.ok) {
      let m = 'No se pudo preparar el archivo';
      try { m = (await res.json()).error || m; } catch { /* sin cuerpo JSON */ }
      throw new Error(m);
    }
    const largo = Number(res.headers.get('Content-Length') || 0);
    if (urlDirecta && largo > LIMITE_MEMORIA) {
      try { res.body && res.body.cancel(); } catch { /* ya cerrado */ }
      K.toast(`Archivo grande (${tam(largo)}): se descarga directamente`);
      descargaDirecta(urlDirecta);
      return { directa: true };
    }
    return { blob: await res.blob(), nombre: o.nombre || nombreDeCabecera(res) || o.respaldo || 'archivo' };
  }

  K.guardarUrl = function (url, o = {}) {
    const abs = absoluta(url);
    return K.guardarDe(async (signal) => aArchivo(await api(abs, { signal, ...(o.opciones || {}) }), o, abs), o);
  };

  K.guardarPeticion = function (url, cuerpo, o = {}) {
    const abs = absoluta(url);
    return K.guardarDe(async (signal) => aArchivo(await api(abs, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), signal, timeout: 120000,
    }), o, null), o);
  };

  K.plataforma = { ios: IOS, android: ANDROID, movil: MOVIL, selector: puedeSelector() };
})();
