'use strict';
/* codigo/vistaweb.js: parte del módulo (se carga con el resto de codigo/ en index.html). Comparte el espacio K._codigo. */
(function () {
  const C = (K._codigo = K._codigo || {});
  const { AVISO_JS, S } = C;
  const accionPrev = (...a) => C.accionPrev(...a);
  const btn = (...a) => C.btn(...a);
  const colorea = (...a) => C.colorea(...a);
  const esc = (...a) => C.esc(...a);
  const guardaYa = (...a) => C.guardaYa(...a);
  const interruptorJs = (...a) => C.interruptorJs(...a);
  const url = (...a) => C.url(...a);

  /* ---------- Vista web ---------- */
  async function pintaWeb(cont) {
    const p = S.p; const htmls = Object.keys(p.archivos).filter(r => /\.html?$/i.test(r)).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b, 'es')));
    if (!htmls.length) { const e = el('div', 'cd-empty'); e.append(el('div', 'cd-empty-i', '🌐'), el('p', 'k-muted', 'Este proyecto no tiene archivos HTML. Añade un index.html o sube tu web en un ZIP.')); cont.appendChild(e); return; }
    const bar = el('div', 'cd-webbar'); const sa = el('select'); sa.setAttribute('aria-label', 'Página'); htmls.forEach(r => { const o = el('option', null, r); o.value = r; sa.appendChild(o); });
    const sv = el('select'); sv.setAttribute('aria-label', 'Versión'); const o0 = el('option', null, 'Trabajo actual'); o0.value = ''; sv.appendChild(o0); p.versiones.forEach(v => { const o = el('option', null, `v${v.n} · ${v.mensaje}`); o.value = v.id; sv.appendChild(o); }); sv.value = S.webVer && p.versiones.some(v => v.id === S.webVer) ? S.webVer : '';
    const marco = el('div', 'cd-webmarco'); const nota = el('small', 'k-faint cd-nota'); const pintaNota = () => { nota.textContent = S.js ? AVISO_JS : 'Vista aislada: se ven HTML, CSS, imágenes y fuentes; los scripts de la web no se ejecutan y los enlaces no navegan.'; }; pintaNota();
    const carga2 = async () => {
      marco.textContent = ''; S.webVer = sv.value;
      try {
        if (S.webVer === '') await guardaYa();
        const r = await K.post(url('/vista'), { v: sv.value, js: !!S.js }); const fr = el('iframe', 'cd-frame grande'); fr.setAttribute('sandbox', S.js ? 'allow-scripts' : ''); fr.title = 'Vista web';
        const lista = sv.value ? await K.get(url('/versiones/' + sv.value)).then(d => Object.keys(d.archivos)) : htmls; const pag = lista.includes(sa.value) ? sa.value : (lista.find(x => /\.html?$/i.test(x)) || sa.value);
        fr.src = `${BASE}/api/codigo-vista/${r.token}/${pag.split('/').map(encodeURIComponent).join('/')}`; marco.appendChild(fr); accionPrev();
      } catch (e) { marco.appendChild(el('p', 'cd-err', e.message)); }
    };
    sa.addEventListener('change', carga2); sv.addEventListener('change', carga2);
    bar.append(sa, sv, interruptorJs(() => { pintaNota(); carga2(); }), btn('Recargar', 'i-refresh', carga2, 'btn sm')); cont.append(bar, marco, nota); carga2();
  }

  // Markdown básico y seguro: todo se escapa antes de dar formato
  function markdown(src) {
    const lines = src.replace(/\r/g, '').split('\n'); let out = '', lista = null, en = false, buf = [], lang = '';
    const inl = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/~~([^~]+)~~/g, '<s>$1</s>')
      .replace(/\[([^\][\n]+)\]\((https?:\/\/[^\s()]+)\)/g, (m, a, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${a}</a>`);
    const cierra2 = () => { if (lista) { out += `</${lista}>`; lista = null; } };
    for (const ln of lines) {
      const f = /^```(\w*)/.exec(ln);
      if (f) { if (!en) { cierra2(); en = true; buf = []; lang = f[1]; } else { out += `<pre class="hljs"><code>${colorea(buf.join('\n'), lang)}</code></pre>`; en = false; } continue; }
      if (en) { buf.push(ln); continue; }
      let m;
      if ((m = /^(#{1,6})\s+([\s\S]*)$/.exec(ln))) { cierra2(); out += `<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`; }
      else if ((m = /^\s*[-*+]\s+([\s\S]*)$/.exec(ln))) { if (lista !== 'ul') { cierra2(); out += '<ul>'; lista = 'ul'; } out += `<li>${inl(m[1])}</li>`; }
      else if ((m = /^\s*\d+[.)]\s+([\s\S]*)$/.exec(ln))) { if (lista !== 'ol') { cierra2(); out += '<ol>'; lista = 'ol'; } out += `<li>${inl(m[1])}</li>`; }
      else if ((m = /^>\s?(.*)$/.exec(ln))) { cierra2(); out += `<blockquote>${inl(m[1])}</blockquote>`; }
      else if (/^---+$/.test(ln.trim())) { cierra2(); out += '<hr>'; }
      else if (!ln.trim()) cierra2();
      else { cierra2(); out += `<p>${inl(ln)}</p>`; }
    }
    if (en) out += `<pre class="hljs"><code>${esc(buf.join('\n'))}</code></pre>`;
    cierra2(); return out;
  }

  Object.assign(C, { pintaWeb, markdown });
})();
