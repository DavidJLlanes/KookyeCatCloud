'use strict';
/* Buscar · preguntas a la IA sobre tus datos y resúmenes de una ficha. El servidor envía al modelo solo los fragmentos que
   encuentra la búsqueda; aquí se muestran la respuesta y las fuentes numeradas. */
(function () {
  if (!window.K || !K.buscar) return;
  const B = K.buscar, S = B.S;

  // Texto con las citas [n] convertidas en botones que abren la fuente
  function conCitas(texto, fuentes) {
    const fr = document.createDocumentFragment();
    let pos = 0;
    for (const m of texto.matchAll(/\[(\d{1,2})\]/g)) {
      const f = fuentes.find(x => x.n === Number(m[1]));
      if (!f) continue;
      if (m.index > pos) fr.appendChild(document.createTextNode(texto.slice(pos, m.index)));
      const b = el('button', 'bu-cita', m[1]); b.type = 'button'; b.title = f.titulo; b.addEventListener('click', () => B.abrir(f));
      fr.appendChild(b); pos = m.index + m[0].length;
    }
    if (pos < texto.length) fr.appendChild(document.createTextNode(texto.slice(pos)));
    return fr;
  }

  B.pintaIA = (cont) => {
    cont.textContent = '';
    const c = S.config;
    if (!c) { cont.appendChild(el('div', 'bu-vacio k-faint', 'Cargando…')); return; }
    const p = B.iaLista();
    if (!p) {
      const v = el('div', 'bu-vacio');
      v.append(el('b', null, 'Conecta una IA para hacer preguntas'),
        el('span', 'k-faint', 'Usa tu propia clave de OpenAI, Anthropic, Google, OpenRouter (con modelos gratis), OpenCode, Groq, Mistral, DeepSeek, xAI, Ollama o cualquier API compatible. Sin IA, la búsqueda sigue funcionando igual.'));
      const b = el('button', 'btn primary', 'Configurar la IA'); b.type = 'button'; b.addEventListener('click', () => B.ajustes());
      v.appendChild(b); cont.appendChild(v); return;
    }
    const info = el('div', 'bu-ia-info');
    info.append(icon(p.local ? 'i-shield' : 'i-sparkle'), el('span', null, `${p.nombre} · ${p.modelo}`),
      el('small', 'k-faint', p.local ? 'En tu servidor: los datos no salen.' : 'Se envían a este proveedor solo los fragmentos encontrados.'));
    const cambia = el('button', 'btn sm', 'Cambiar'); cambia.type = 'button'; cambia.addEventListener('click', () => B.ajustes());
    info.appendChild(cambia);
    const opt = el('label', 'bu-opt'); const chk = el('input'); chk.type = 'checkbox'; chk.checked = !!S.ampliar;
    chk.addEventListener('change', () => { S.ampliar = chk.checked; });
    opt.append(chk, el('span', null, 'Ampliar la búsqueda con sinónimos (una llamada más)'));
    cont.append(info, opt);

    if (S.ocupado) { cont.appendChild(el('div', 'bu-pensando', 'Buscando en tus datos y preguntando al modelo…')); return; }
    if (S.error) cont.appendChild(el('div', 'bu-error', S.error));
    const r = S.ia;
    if (!r) { cont.appendChild(el('p', 'k-faint', 'Escribe una pregunta arriba, por ejemplo: «¿en qué compañía tengo el seguro del coche?» o «¿qué apunté sobre el VPS?».')); return; }
    const card = el('div', 'bu-resp');
    const txt = el('div', 'bu-resp-txt'); txt.appendChild(conCitas(r.respuesta, r.fuentes)); card.appendChild(txt);
    card.appendChild(el('small', 'k-faint', `${B.nombreProv(r.proveedor)} · ${r.modelo} · ${(r.ms / 1000).toFixed(1)} s`));
    if (r.fuentes.length) {
      const fs = el('div', 'bu-fuentes'); fs.appendChild(el('b', null, 'Fuentes'));
      r.fuentes.forEach(f => { const b = el('button', 'bu-fuente'); b.type = 'button'; b.append(el('span', 'bu-cita', String(f.n)), icon(B.iconoDe(f.fuente)), el('span', null, f.titulo)); b.addEventListener('click', () => B.abrir(f)); fs.appendChild(b); });
      card.appendChild(fs);
    }
    cont.appendChild(card);
  };

  B.pregunta = async () => {
    const q = S.q.trim();
    if (q.length < 3 || S.ocupado) return;
    S.ocupado = true; S.error = ''; S.ia = null; B.pintaTodo();
    // contador de segundos: los modelos gratuitos pueden tardar y sin él parece que no pasa nada
    const t0 = Date.now();
    const reloj = setInterval(() => { const e = document.querySelector('.bu-pensando'); if (e) e.textContent = `Buscando en tus datos y preguntando al modelo… ${Math.round((Date.now() - t0) / 1000)} s`; }, 1000);
    try {
      S.ia = await K.post('/api/ia/preguntar', { pregunta: q, ampliar: !!S.ampliar });
      B.logros();
    } catch (e) {
      if (/acepta que se envíen/.test((e && e.message) || '')) { clearInterval(reloj); S.ocupado = false; B.ajustes({ aviso: true }); return; }
      S.error = (e && e.message) || 'No se pudo preguntar a la IA';
    }
    clearInterval(reloj);
    S.ocupado = false; B.pintaTodo();
  };

  B.resumir = async (r) => {
    const cuerpo = el('div', 'bu-resumen'); cuerpo.appendChild(el('p', 'k-faint', 'Resumiendo…'));
    K.modal({ title: 'Resumen', sub: r.titulo, content: cuerpo, actions: [{ label: 'Abrir', onClick: () => { B.abrir(r); } }, { label: 'Cerrar', primary: true }] });
    try {
      const x = await K.post('/api/ia/resumir', { fuente: r.fuente, id: r.id, sub: r.sub || undefined });
      cuerpo.textContent = '';
      cuerpo.appendChild(el('div', 'bu-resp-txt', x.resumen));
      cuerpo.appendChild(el('small', 'k-faint', `${B.nombreProv(x.proveedor)} · ${x.modelo} · ${(x.ms / 1000).toFixed(1)} s`));
      B.logros();
    } catch (e) {
      cuerpo.textContent = ''; cuerpo.appendChild(el('div', 'bu-error', (e && e.message) || 'No se pudo resumir'));
      if (/acepta que se envíen/.test((e && e.message) || '')) { const b = el('button', 'btn sm', 'Revisar ajustes de IA'); b.type = 'button'; b.addEventListener('click', () => B.ajustes({ aviso: true })); cuerpo.appendChild(b); }
    }
  };
})();
