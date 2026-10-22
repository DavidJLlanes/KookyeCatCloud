'use strict';
/* ---------------------------------------------------------------
   Face ID, Touch ID y huella dactilar (passkeys / WebAuthn):
   - Botón "Entrar con huella o Face ID" en la pantalla de inicio de sesión.
   - Tarjeta en Cuenta para registrar, renombrar y quitar dispositivos.
   La biometría nunca sale del dispositivo: el servidor solo guarda una clave pública.
--------------------------------------------------------------- */
(function () {
  const soportado = !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
  const aBuf = (b64u) => { const b = atob(b64u.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64u.length / 4) * 4, '=')); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; };
  const aB64 = (buf) => { let s = ''; new Uint8Array(buf).forEach(x => { s += String.fromCharCode(x); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };

  async function post(url, body) {
    const r = await fetch(BASE + url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
    return j;
  }
  // Los errores del navegador (cancelar, no hay passkey…) se traducen a algo útil
  function mensaje(e) {
    if (e && e.name === 'NotAllowedError') return 'Cancelado o no hay ninguna passkey de este sitio en el dispositivo';
    if (e && e.name === 'InvalidStateError') return 'Este dispositivo ya está registrado';
    if (e && e.name === 'SecurityError') return 'El navegador no permite passkeys en esta dirección (hace falta HTTPS)';
    return e && e.message ? e.message : 'No se pudo completar';
  }

  /* ---------- Entrar ---------- */
  async function entrar() {
    const err = $('login-error'); err.textContent = '';
    const btn = $('login-passkey'); btn.disabled = true;
    try {
      const o = await post('/api/passkeys/login/options');
      const pk = o.publicKey;
      const cred = await navigator.credentials.get({ publicKey: { ...pk, challenge: aBuf(pk.challenge), allowCredentials: [] } });
      const r = cred.response;
      const data = await post('/api/passkeys/login/verify', {
        challengeId: o.challengeId,
        credential: { id: cred.id, response: {
          clientDataJSON: aB64(r.clientDataJSON), authenticatorData: aB64(r.authenticatorData), signature: aB64(r.signature),
          userHandle: r.userHandle ? aB64(r.userHandle) : null,
        } },
      });
      state.user = data;
      $('login-pass').value = '';
      showApp();
    } catch (e) { err.textContent = mensaje(e); }
    finally { btn.disabled = false; }
  }

  if (soportado) {
    const b = $('login-passkey'), o = $('login-or');
    if (b) { b.hidden = false; o.hidden = false; b.addEventListener('click', entrar); }
  }

  /* ---------- Registrar un dispositivo ---------- */
  const nombreSugerido = () => {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone'; if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Móvil Android';
    if (/Macintosh/.test(ua)) return 'Mac'; if (/Windows/.test(ua)) return 'Windows'; if (/Linux/.test(ua)) return 'Linux';
    return 'Mi dispositivo';
  };

  async function registrar(alTerminar) {
    const nombre = await K.ask('Añadir este dispositivo', { value: nombreSugerido(), ok: 'Continuar', sub: 'Te pedirá tu huella, Face ID o el PIN del dispositivo.' });
    if (nombre === null) return;
    try {
      const o = await K.post('/api/passkeys/register/options');
      const pk = o.publicKey;
      const cred = await navigator.credentials.create({ publicKey: {
        ...pk, challenge: aBuf(pk.challenge), user: { ...pk.user, id: aBuf(pk.user.id) },
        excludeCredentials: (pk.excludeCredentials || []).map(c => ({ ...c, id: aBuf(c.id) })),
      } });
      const r = cred.response;
      await K.post('/api/passkeys/register/verify', {
        challengeId: o.challengeId, name: nombre || nombreSugerido(),
        credential: { id: cred.id, response: { clientDataJSON: aB64(r.clientDataJSON), attestationObject: aB64(r.attestationObject), transports: r.getTransports ? r.getTransports() : [] } },
      });
      K.toast('Dispositivo añadido: ya puedes entrar con tu huella o tu cara');
      if (alTerminar) alTerminar();
    } catch (e) { K.toast(mensaje(e)); }
  }

  /* ---------- Tarjeta en Cuenta ---------- */
  let refresca = null;
  function tarjeta() {
    const v = $('view-cuenta'); if (!v) return;
    if ($('card-passkeys')) { if (refresca) refresca(); return; }
    const c = el('section', 'card'); c.id = 'card-passkeys';
    const h = el('h3'); h.append(icon('i-fingerprint'), document.createTextNode(' Huella y Face ID'));
    c.append(h, el('p', 'card-sub', 'Entra sin escribir la contraseña, con la huella, la cara o el PIN de tu dispositivo. La contraseña sigue funcionando.'));
    const lista = el('div'); c.appendChild(lista);
    const acc = el('div', 'k-row'); acc.style.marginTop = '12px';
    const add = el('button', 'btn primary', 'Añadir este dispositivo'); add.type = 'button';
    add.addEventListener('click', () => registrar(pinta));
    acc.appendChild(add);
    if (!soportado) { add.disabled = true; acc.appendChild(el('span', 'k-faint', window.isSecureContext ? 'Este navegador no admite passkeys.' : 'Hace falta abrir la web con HTTPS.')); }
    c.appendChild(acc);
    v.appendChild(c);

    async function pinta() {
      lista.textContent = '';
      let r; try { r = await K.get('/api/passkeys'); } catch { return; }
      if (!r.passkeys.length) { const p = el('p', 'k-faint', 'Aún no has añadido ningún dispositivo.'); p.style.cssText = 'font-size:13px;margin:8px 0 0'; lista.appendChild(p); return; }
      r.passkeys.forEach(pk => {
        const f = el('div', 'k-row'); f.style.cssText = 'padding:10px 0;border-bottom:1px solid var(--line);flex-wrap:nowrap';
        const info = el('div', 'k-grow'); info.appendChild(el('b', null, pk.name));
        const sub = el('div', 'k-faint', `Añadido el ${new Date(pk.createdAt).toLocaleDateString('es-ES')} · ${pk.lastUsedAt ? 'último uso ' + K.ago(pk.lastUsedAt) : 'sin usar aún'}`); sub.style.fontSize = '12px'; info.appendChild(sub);
        const ren = el('button', 'btn ghost icon'); ren.type = 'button'; ren.title = 'Renombrar'; ren.appendChild(icon('i-pencil'));
        ren.addEventListener('click', async () => { const n = await K.ask('Renombrar dispositivo', { value: pk.name, ok: 'Guardar' }); if (n) { try { await K.put('/api/passkeys/' + encodeURIComponent(pk.id), { name: n }); pinta(); } catch (e) { K.fail(e); } } });
        const del = el('button', 'btn ghost icon'); del.type = 'button'; del.title = 'Quitar'; del.appendChild(icon('i-trash'));
        del.addEventListener('click', async () => { if (!await K.confirm(`“${pk.name}” dejará de poder entrar con huella o Face ID.`, { ok: 'Quitar', danger: true })) return; try { await K.del('/api/passkeys/' + encodeURIComponent(pk.id)); pinta(); } catch (e) { K.fail(e); } });
        f.append(info, ren, del); lista.appendChild(f);
      });
    }
    refresca = pinta;
    pinta();
  }
  // La vista Cuenta se abre después de iniciar sesión: se monta al primer uso
  const antes = window.KCC.views.cuenta;
  K.registerView('cuenta', { open() { tarjeta(); if (antes && antes.open) antes.open(); }, close() { if (antes && antes.close) antes.close(); } });

  K.passkeys = { soportado, registrar };
})();
