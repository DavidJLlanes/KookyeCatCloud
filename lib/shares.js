'use strict';
// Compartir carpetas y archivos entre usuarios, con permiso de solo lectura o de edición.
//
// Cómo se ve para quien recibe: en su raíz aparece la carpeta virtual "@compartido" (la app la
// enseña como "Compartido conmigo") y dentro, una entrada por cada cosa que le han compartido,
// con el nombre "<nombre>~<id>". Las rutas son del tipo
//     @compartido/Fotos~1a2b3c4d/2026/viaje.jpg
// y el servidor las traduce a la ruta real dentro del almacén del dueño, comprobando en cada
// petición que el usuario sigue teniendo acceso y que no se sale de la carpeta compartida.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { HttpError } = require('./store');

const VIRTUAL = '@compartido';
const PERMISOS = ['read', 'write'];
const RE_SEG = /~([a-f0-9]{8})$/;
const limpia = (rel) => String(rel || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

function createShares({ express, auth, file, userRoot, safeResolve, assertVisible, loadUsers, sendError, registrarActividad }) {
  const router = express.Router();
  let data = { shares: [] };
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); if (!Array.isArray(data.shares)) data = { shares: [] }; } catch { /* aún no hay ninguna */ }
  const guarda = () => {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  };

  const usuario = (nombre) => (loadUsers().find(u => u.username === nombre) || null);
  const comoUser = (u) => ({ username: u.username, role: u.role });
  const otrosUsuarios = (yo) => loadUsers().filter(u => u.username !== yo).map(u => u.username).sort((a, b) => a.localeCompare(b, 'es'));

  // "@compartido/Fotos~1a2b3c4d/resto" -> { id, resto }   ("@compartido" a secas -> { id: null })
  function parse(rel) {
    const partes = limpia(rel).split('/').filter(Boolean);
    if (partes[0] !== VIRTUAL) return null;
    if (partes.length === 1) return { id: null, resto: '' };
    const m = RE_SEG.exec(partes[1]);
    if (!m) throw new HttpError(404, 'Esa carpeta compartida no existe');
    return { id: m[1], resto: partes.slice(2).join('/') };
  }

  // Comprobación de acceso + ruta real. `escribir`: la operación modifica algo.
  function resolver(user, comp, escribir) {
    const s = data.shares.find(x => x.id === comp.id);
    const g = s && s.grants.find(x => x.user === user.username);
    if (!s || !g) throw new HttpError(404, 'Esa carpeta compartida no existe o ya no tienes acceso');
    if (escribir && g.perm !== 'write') throw new HttpError(403, 'Solo tienes permiso de lectura en esta carpeta compartida');
    const duenio = usuario(s.owner);
    if (!duenio) throw new HttpError(404, 'El dueño de esta carpeta ya no existe');
    const owner = comoUser(duenio);
    assertVisible(comp.resto);
    const base = safeResolve(userRoot(owner), s.path);
    let baseReal;
    try { baseReal = fs.realpathSync(base); } catch { throw new HttpError(404, 'La carpeta compartida ya no existe'); }
    const abs = safeResolve(baseReal, comp.resto);
    return { abs, owner, ownerRel: limpia(path.posix.join(s.path, comp.resto)), perm: g.perm, share: s };
  }

  const nombreSeg = (s) => `${s.name}~${s.id}`;
  const hayPara = (user) => data.shares.some(s => s.grants.some(g => g.user === user.username));
  function entradasPara(user) {
    const out = [];
    for (const s of data.shares) {
      const g = s.grants.find(x => x.user === user.username);
      if (!g) continue;
      let st = null;
      try { const o = usuario(s.owner); if (o) st = fs.statSync(safeResolve(userRoot(comoUser(o)), s.path)); } catch { /* ya no está */ }
      if (!st) continue;
      out.push({ name: nombreSeg(s), isDir: st.isDirectory(), size: st.isDirectory() ? 0 : st.size, modified: st.mtime, shared: { owner: s.owner, perm: g.perm, id: s.id } });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }
  // Permiso del usuario en una ruta virtual (para que la interfaz esconda lo que no puede hacer)
  const permDe = (user, rel) => {
    try { const c = parse(rel); if (!c || !c.id) return null; const s = data.shares.find(x => x.id === c.id); const g = s && s.grants.find(x => x.user === user.username); return g ? { perm: g.perm, owner: s.owner } : null; }
    catch { return null; }
  };

  /* ---------- Gestión (el dueño) ---------- */
  const publico = (s) => ({ id: s.id, name: s.name, path: s.path, isDir: s.isDir, segment: nombreSeg(s), grants: s.grants, createdAt: s.createdAt, owner: s.owner });

  router.get('/shares/users', auth, (req, res) => { try { res.json({ users: otrosUsuarios(req.user.username) }); } catch (err) { sendError(res, err); } });

  router.get('/shares/mine', auth, (req, res) => {
    try { res.json({ shares: data.shares.filter(s => s.owner === req.user.username).map(publico) }); } catch (err) { sendError(res, err); }
  });

  router.get('/shares/with-me', auth, (req, res) => {
    try {
      res.json({ shares: data.shares.filter(s => s.grants.some(g => g.user === req.user.username))
        .map(s => ({ ...publico(s), perm: s.grants.find(g => g.user === req.user.username).perm, grants: undefined })) });
    } catch (err) { sendError(res, err); }
  });

  // Crea o actualiza el reparto de una ruta propia
  router.post('/shares', auth, express.json(), (req, res) => {
    try {
      const rel = limpia(req.body.path);
      if (!rel || parse(rel)) throw new HttpError(400, 'Solo puedes compartir tus propios archivos');
      assertVisible(rel);
      const abs = safeResolve(userRoot(req.user), rel);
      if (abs === userRoot(req.user)) throw new HttpError(400, 'No se puede compartir toda tu carpeta raíz');
      const st = fs.statSync(abs);
      const validos = new Set(loadUsers().map(u => u.username));
      const grants = [];
      for (const g of Array.isArray(req.body.grants) ? req.body.grants : []) {
        const user = String(g.user || '');
        if (!validos.has(user) || user === req.user.username || !PERMISOS.includes(g.perm) || grants.some(x => x.user === user)) continue;
        grants.push({ user, perm: g.perm });
      }
      let s = data.shares.find(x => x.owner === req.user.username && x.path === rel);
      if (!grants.length) {
        if (s) { data.shares = data.shares.filter(x => x !== s); guarda(); }
        return res.json({ ok: true, share: null });
      }
      if (!s) {
        if (data.shares.length >= 2000) throw new HttpError(400, 'Demasiadas comparticiones');
        s = { id: crypto.randomBytes(4).toString('hex'), owner: req.user.username, path: rel, name: path.basename(abs).replace(/~/g, '-'), isDir: st.isDirectory(), grants: [], createdAt: Date.now() };
        data.shares.push(s);
      }
      s.grants = grants; s.isDir = st.isDirectory();
      guarda();
      registrarActividad(req, 'compartido_con_usuarios', { path: rel, con: grants.map(g => `${g.user}:${g.perm}`) });
      res.json({ ok: true, share: publico(s) });
    } catch (err) { sendError(res, err); }
  });

  // Dueño: dejar de compartir. Invitado: dejar de ver lo que le compartieron.
  router.delete('/shares/:id', auth, (req, res) => {
    try {
      const s = data.shares.find(x => x.id === req.params.id);
      if (!s) return res.json({ ok: true });
      if (s.owner === req.user.username) data.shares = data.shares.filter(x => x !== s);
      else if (s.grants.some(g => g.user === req.user.username)) {
        s.grants = s.grants.filter(g => g.user !== req.user.username);
        if (!s.grants.length) data.shares = data.shares.filter(x => x !== s);
      } else throw new HttpError(404, 'No encontrada');
      guarda();
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  return {
    router, parse, resolver, hayPara, entradasPara, permDe, VIRTUAL,
    // El dueño movió o renombró algo: lo compartido sigue apuntando a su nuevo sitio
    mueve(owner, desde, hacia) {
      const a = limpia(desde), b = limpia(hacia); let t = false;
      for (const s of data.shares) {
        if (s.owner !== owner) continue;
        if (s.path === a || s.path.startsWith(a + '/')) { s.path = b + s.path.slice(a.length); if (s.path === b) s.name = path.basename(b).replace(/~/g, '-'); t = true; }
      }
      if (t) guarda();
    },
    // Algo compartido se borró (va a la papelera): deja de estar compartido
    quita(owner, rel) {
      const a = limpia(rel); const antes = data.shares.length;
      data.shares = data.shares.filter(s => !(s.owner === owner && (s.path === a || s.path.startsWith(a + '/'))));
      if (data.shares.length !== antes) guarda();
    },
    // Se borró un usuario: sus comparticiones y sus accesos desaparecen
    quitaUsuario(nombre) {
      data.shares = data.shares.filter(s => s.owner !== nombre);
      data.shares.forEach(s => { s.grants = s.grants.filter(g => g.user !== nombre); });
      data.shares = data.shares.filter(s => s.grants.length);
      guarda();
    },
  };
}

module.exports = createShares;
