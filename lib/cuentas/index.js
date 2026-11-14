'use strict';
// Cuentas: inicio y cierre de sesión (con segundo paso TOTP), usuarios, contraseñas, sesiones abiertas,
// verificación en dos pasos y tokens de aplicación. Fábrica como el resto: createCuentas({...}) →
// { router }, montado en /api. El middleware `auth`, el almacén de sesiones, el limitador de intentos
// y abreSesion se quedan en server.js porque también los usan passkeys, WebDAV y todos los módulos;
// aquí llegan inyectados. shares, passkeys y vault se piden al usarlos (se crean más adelante).
const crypto = require('crypto');

function createCuentas({
  express, auth, adminOnly, jwt, bcrypt, JWT_SECRET, DUMMY_HASH, loadUsers, saveUsers,
  sessions, creaSesion, revocaSesion, revocaUsuario, marcaSesionesSucias,
  isBlocked, registerFailure, clearFailures, totpVerificar, totpPaso, base32Encode,
  USERNAME_RE, MIN_PASSWORD, COOKIE_PATH, SECURE_COOKIES,
  shares, passkeys, vault, enlaces, registrarActividad,
}) {
  const router = express.Router();

  // bcrypt solo lee los primeros 72 bytes: una contraseña más larga valdría igual con cualquier final, así que se rechaza
  const errorContrasena = (p) => {
    p = String(p ?? '');
    if (p.length < MIN_PASSWORD) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`;
    if (Buffer.byteLength(p) > 72) return 'La contraseña es demasiado larga (máximo 72 caracteres)';
    return '';
  };

  router.post('/login', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const ipKey = `ip:${req.ip}`;
    const userKey = `user:${username.toLowerCase()}`;

    const wait = isBlocked(ipKey) || isBlocked(userKey);
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      return res.status(429).json({ error: `Demasiados intentos fallidos. Prueba en ${Math.ceil(wait / 60)} min.` });
    }

    const users = loadUsers();
    const user = users.find(u => u.username === username);
    // Asíncrono: la comprobación tarda ~70 ms y en modo síncrono bloquearía a todos los usuarios mientras dura
    let ok = false;
    try { ok = (await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH)) && !!user; } catch { ok = false; }
    if (!ok) {
      registerFailure(ipKey);
      if (username) registerFailure(userKey);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    clearFailures(ipKey);
    clearFailures(userKey);

    // Con verificación en dos pasos activada, esto solo confirma la contraseña:
    // la sesión de verdad no se abre hasta validar el código en /api/login/2fa
    if (user.twofaSecret) {
      const pendiente = jwt.sign({ username: user.username, stage: '2fa' }, JWT_SECRET, { expiresIn: '5m' });
      res.cookie('pending2fa', pendiente, {
        httpOnly: true, sameSite: 'strict', secure: SECURE_COOKIES, path: COOKIE_PATH, maxAge: 5 * 60 * 1000,
      });
      return res.json({ ok: true, need2fa: true });
    }

    const jti = creaSesion(user.username, req);
    const token = jwt.sign({ username: user.username, role: user.role, jti }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: SECURE_COOKIES,
      path: COOKIE_PATH,
      maxAge: 30 * 24 * 3600 * 1000,
    });
    registrarActividad({ user: { username: user.username }, ip: req.ip }, 'login', {});
    res.json({ ok: true, username: user.username, role: user.role });
  });

  // Segundo paso del login: el código de la app de autenticación
  router.post('/login/2fa', (req, res) => {
    const pendiente = req.cookies.pending2fa;
    if (!pendiente) return res.status(401).json({ error: 'Vuelve a iniciar sesión' });
    let payload;
    try { payload = jwt.verify(pendiente, JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Vuelve a iniciar sesión' }); }
    if (payload.stage !== '2fa') return res.status(401).json({ error: 'Vuelve a iniciar sesión' });

    // Límite por IP y también por cuenta: con la contraseña ya robada, repartir los intentos entre muchas IP no debe
    // permitir probar códigos sin fin (hay 3 válidos entre un millón en cada momento)
    const ipKey = `ip:${req.ip}`, cuentaKey = `2fa:${String(payload.username).toLowerCase()}`;
    const wait = isBlocked(ipKey) || isBlocked(cuentaKey);
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      return res.status(429).json({ error: `Demasiados intentos. Prueba en ${Math.ceil(wait / 60)} min.` });
    }

    const users = loadUsers();
    const user = users.find(u => u.username === payload.username);
    const paso = user && user.twofaSecret ? totpPaso(user.twofaSecret, req.body?.code) : 0;
    // Cada código vale una sola vez: se guarda el último paso usado y no se acepta uno igual o anterior
    if (!paso || paso <= (Number(user.twofaUltimo) || 0)) {
      registerFailure(ipKey); registerFailure(cuentaKey);
      return res.status(401).json({ error: 'Código incorrecto' });
    }
    clearFailures(ipKey); clearFailures(cuentaKey);
    user.twofaUltimo = paso; saveUsers(users);
    res.clearCookie('pending2fa', { httpOnly: true, sameSite: 'strict', secure: SECURE_COOKIES, path: COOKIE_PATH });

    const jti = creaSesion(user.username, req);
    const token = jwt.sign({ username: user.username, role: user.role, jti }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('token', token, {
      httpOnly: true, sameSite: 'strict', secure: SECURE_COOKIES, path: COOKIE_PATH, maxAge: 30 * 24 * 3600 * 1000,
    });
    registrarActividad({ user: { username: user.username }, ip: req.ip }, 'login', {});
    res.json({ ok: true, username: user.username, role: user.role });
  });

  router.post('/logout', (req, res) => {
    const token = req.cookies.token;
    if (token) {
      try { const p = jwt.verify(token, JWT_SECRET); if (p.jti) revocaSesion(p.jti); } catch { /* token ya inválido */ }
    }
    res.clearCookie('token', { httpOnly: true, sameSite: 'strict', secure: SECURE_COOKIES, path: COOKIE_PATH });
    res.clearCookie('pending2fa', { httpOnly: true, sameSite: 'strict', secure: SECURE_COOKIES, path: COOKIE_PATH });
    res.json({ ok: true });
  });

  router.get('/me', auth, (req, res) => {
    res.json({ username: req.user.username, role: req.user.role });
  });

  // --- Gestión de usuarios (solo admin) ---
  router.get('/users', auth, adminOnly, (req, res) => {
    const users = loadUsers().map(u => ({ username: u.username, role: u.role }));
    res.json(users);
  });

  router.post('/users', auth, adminOnly, (req, res) => {
    const { username, password, role } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Usuario inválido: 3-32 caracteres, solo letras, números y . _ -' });
    }
    const fallo = errorContrasena(password);
    if (fallo) return res.status(400).json({ error: fallo });
    const users = loadUsers();
    // Sin distinguir mayúsculas: «Admin» y «admin» se confundirían (y comparten nombre de carpeta en sistemas que no distinguen)
    if (users.find(u => u.username.toLowerCase() === String(username).toLowerCase())) return res.status(400).json({ error: 'Usuario ya existe' });
    users.push({ username, passwordHash: bcrypt.hashSync(password, 10), role: role === 'admin' ? 'admin' : 'user' });
    saveUsers(users);
    registrarActividad(req, 'usuario_creado', { username });
    res.json({ ok: true });
  });

  router.delete('/users/:username', auth, adminOnly, (req, res) => {
    let users = loadUsers();
    if (req.params.username === 'admin') return res.status(400).json({ error: 'No puedes borrar admin' });
    users = users.filter(u => u.username !== req.params.username);
    saveUsers(users);
    revocaUsuario(req.params.username);   // sus sesiones abiertas dejan de valer al instante
    shares().quitaUsuario(req.params.username);
    passkeys().quitaUsuario(req.params.username);
    enlaces().quitaUsuario(req.params.username);
    registrarActividad(req, 'usuario_eliminado', { username: req.params.username });
    res.json({ ok: true });
  });

  // La propia contraseña se cambia con la actual (una sesión robada no basta para quedarse la cuenta); un administrador
  // puede cambiar la de otro sin ella. En ambos casos se cierran las demás sesiones de ese usuario.
  router.post('/users/:username/password', auth, async (req, res) => {
    const propia = req.user.username === req.params.username;
    if (!propia && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const { password, actual } = req.body || {};
    const fallo = errorContrasena(password);
    if (fallo) return res.status(400).json({ error: fallo });
    const users = loadUsers();
    const u = users.find(u => u.username === req.params.username);
    if (!u) return res.status(404).json({ error: 'No encontrado' });
    if (propia) {
      const ipKey = `ip:${req.ip}`, espera = isBlocked(ipKey);
      if (espera) { res.setHeader('Retry-After', String(espera)); return res.status(429).json({ error: `Demasiados intentos. Prueba en ${Math.ceil(espera / 60)} min.` }); }
      let ok = false; try { ok = await bcrypt.compare(String(actual || ''), u.passwordHash); } catch { ok = false; }
      if (!ok) { registerFailure(ipKey); return res.status(401).json({ error: 'La contraseña actual no es correcta' }); }
    }
    let hash; try { hash = await bcrypt.hash(password, 10); } catch { return res.status(500).json({ error: 'No se pudo cambiar la contraseña' }); }
    // Se relee: durante los ~150 ms de bcrypt otra petición ha podido crear una cuenta o activar la 2FA, y guardar la lista
    // leída al principio pisaría ese cambio
    const frescos = loadUsers(), f = frescos.find(x => x.username === req.params.username);
    if (!f) return res.status(404).json({ error: 'No encontrado' });
    f.passwordHash = hash;
    saveUsers(frescos);
    revocaUsuario(f.username, propia ? req.user.jti : null);
    registrarActividad(req, 'password_cambiada', { username: req.params.username });
    res.json({ ok: true });
  });

  /* ---------------- Sesiones abiertas ---------------- */
  router.get('/sessions', auth, (req, res) => {
    const mias = Object.values(sessions)
      .filter(s => s.username === req.user.username)
      .map(s => ({ ...s, current: s.jti === req.user.jti }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    res.json(mias);
  });
  router.delete('/sessions/:jti', auth, (req, res) => {
    const s = sessions[req.params.jti];
    if (!s || s.username !== req.user.username) return res.status(404).json({ error: 'No encontrada' });
    revocaSesion(req.params.jti);
    registrarActividad(req, 'sesion_cerrada_remoto', { jti: req.params.jti });
    res.json({ ok: true });
  });
  router.delete('/sessions', auth, (req, res) => {
    let n = 0;
    for (const [jti, s] of Object.entries(sessions)) {
      if (s.username === req.user.username && jti !== req.user.jti) { delete sessions[jti]; vault().cierraSesion(jti); n++; }
    }
    if (n) marcaSesionesSucias();
    registrarActividad(req, 'sesiones_cerradas_todas', { cantidad: n });
    res.json({ ok: true, removed: n });
  });

  /* ---------------- Verificación en dos pasos (TOTP) ---------------- */
  router.get('/2fa/status', auth, (req, res) => {
    const u = loadUsers().find(x => x.username === req.user.username);
    res.json({ enabled: !!(u && u.twofaSecret) });
  });

  router.post('/2fa/setup', auth, (req, res) => {
    const secreto = base32Encode(crypto.randomBytes(20));
    const users = loadUsers();
    const u = users.find(x => x.username === req.user.username);
    u.twofaPending = secreto;                 // no se activa hasta confirmar con un código válido
    saveUsers(users);
    const uri = `otpauth://totp/${encodeURIComponent('KookyeCatCloud:' + u.username)}` +
      `?secret=${secreto}&issuer=${encodeURIComponent('KookyeCatCloud')}&digits=6&period=30`;
    res.json({ secret: secreto, uri });
  });

  router.post('/2fa/confirm', auth, (req, res) => {
    const users = loadUsers();
    const u = users.find(x => x.username === req.user.username);
    if (!u.twofaPending) return res.status(400).json({ error: 'Primero pide un código nuevo' });
    const paso = totpPaso(u.twofaPending, req.body?.code);
    if (!paso) return res.status(400).json({ error: 'Código incorrecto' });
    u.twofaSecret = u.twofaPending;
    u.twofaUltimo = paso;                     // el código de la confirmación tampoco vale después para entrar
    delete u.twofaPending;
    saveUsers(users);
    registrarActividad(req, '2fa_activado', {});
    res.json({ ok: true });
  });

  router.post('/2fa/disable', auth, async (req, res) => {
    const users = loadUsers();
    const u = users.find(x => x.username === req.user.username);
    const ipKey = `ip:${req.ip}`, espera = isBlocked(ipKey);
    if (espera) { res.setHeader('Retry-After', String(espera)); return res.status(429).json({ error: `Demasiados intentos. Prueba en ${Math.ceil(espera / 60)} min.` }); }
    if (!(await bcrypt.compare(String(req.body?.password || ''), u.passwordHash).catch(() => false))) {
      registerFailure(ipKey);
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }
    const frescos = loadUsers(), f = frescos.find(x => x.username === req.user.username);   // releído tras el await (ver cambio de contraseña)
    if (f) { delete f.twofaSecret; delete f.twofaPending; delete f.twofaUltimo; saveUsers(frescos); }
    registrarActividad(req, '2fa_desactivado', {});
    res.json({ ok: true });
  });

  /* ---------------- Tokens de aplicación ----------------
     Para WebDAV o scripts, sin usar la contraseña de la cuenta: se pueden
     revocar uno a uno sin tener que cambiarla. */
  router.get('/apptokens', auth, (req, res) => {
    const u = loadUsers().find(x => x.username === req.user.username);
    const tokens = (u?.apptokens || []).map(t => ({ id: t.id, name: t.name, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt || null }));
    res.json(tokens);
  });
  router.post('/apptokens', auth, (req, res) => {
    const nombre = String(req.body?.name || '').slice(0, 60) || 'Sin nombre';
    const users = loadUsers();
    const u = users.find(x => x.username === req.user.username);
    u.apptokens = u.apptokens || [];
    if (u.apptokens.length >= 20) return res.status(400).json({ error: 'Máximo 20 tokens. Revoca alguno antes de crear otro.' });
    const token = crypto.randomBytes(24).toString('base64url');
    const entrada = { id: crypto.randomBytes(8).toString('hex'), name: nombre, hash: bcrypt.hashSync(token, 10), createdAt: Date.now() };
    u.apptokens.push(entrada);
    saveUsers(users);
    registrarActividad(req, 'apptoken_creado', { name: nombre });
    // El valor real solo se ve esta vez: a partir de aquí solo se guarda su hash
    res.json({ ok: true, id: entrada.id, token });
  });
  router.delete('/apptokens/:id', auth, (req, res) => {
    const users = loadUsers();
    const u = users.find(x => x.username === req.user.username);
    const antes = (u.apptokens || []).length;
    u.apptokens = (u.apptokens || []).filter(t => t.id !== req.params.id);
    if (u.apptokens.length === antes) return res.status(404).json({ error: 'No encontrado' });
    saveUsers(users);
    registrarActividad(req, 'apptoken_revocado', { id: req.params.id });
    res.json({ ok: true });
  });

  return { router };
}

module.exports = createCuentas;
