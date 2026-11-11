'use strict';
// Rutas seguras: cada usuario trabaja dentro de su raíz, sin salirse (../, enlaces simbólicos, hermanos con el mismo prefijo),
// y lo que empieza por punto (.trash, .kcc…) es interno y no se expone nunca.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

function createRutas({ DATA_ROOT, USERNAME_RE, shares }) {
  // --- Helpers de rutas seguras (evita path traversal) ---
  function invalidPath() {
    const err = new Error('Ruta inválida');
    err.status = 400;
    return err;
  }

  /**
   * Resuelve relPath dentro de root y garantiza que no se sale de ahí.
   * Compara contra root + separador para que un directorio hermano con el mismo
   * prefijo (/data/storage-backup) no cuele, y resuelve symlinks antes de validar.
   */
  function safeResolve(root, relPath) {
    const target = path.resolve(root, path.join('.', relPath || ''));
    if (target !== root && !target.startsWith(root + path.sep)) throw invalidPath();
    // El destino puede no existir todavía (mkdir, mover): en ese caso valida el ancestro más cercano
    let probe = target;
    let real = null;
    while (probe.length >= root.length) {
      try { real = fs.realpathSync(probe); break; } catch { probe = path.dirname(probe); }
    }
    if (real && real !== root && !real.startsWith(root + path.sep)) throw invalidPath();
    return target;
  }

  /**
   * Raíz de cada usuario: el admin ve todo el almacén, cada usuario normal
   * trabaja aislado dentro de <DATA_ROOT>/users/<username>.
   */
  function userRoot(user) {
    if (user.role === 'admin') return DATA_ROOT;
    if (!USERNAME_RE.test(user.username)) throw invalidPath();
    const dir = path.join(DATA_ROOT, 'users', user.username);
    fs.mkdirSync(dir, { recursive: true });
    return fs.realpathSync(dir);
  }
  // Los nombres que empiezan por punto son internos (.trash) y no se exponen nunca:
  // ni se listan ni se pueden alcanzar desde la API pública.
  // Declaración, no constante: se usa al montar WebDAV, que va más arriba del archivo
  function isHidden(name) { return name.startsWith('.'); }
  function assertVisible(relPath) {
    const parts = String(relPath || '').split(/[\\/]+/).filter(Boolean);
    if (parts.some(isHidden)) throw invalidPath();
  }
  // opts.compartidos: acepta rutas "@compartido/<nombre>~<id>/…" (carpetas que otro usuario te compartió).
  // WebDAV y los módulos internos no las usan: llaman con 2 argumentos y esas rutas no existen para ellos.
  function resolveFor(user, relPath, opts) {
    if (opts && opts.compartidos) {
      const comp = shares().parse(relPath);
      if (comp) {
        if (!comp.id) throw invalidPath();                         // "@compartido" a secas es solo un listado
        return shares().resolver(user, comp, !!opts.write).abs;
      }
    }
    assertVisible(relPath);
    return safeResolve(userRoot(user), relPath);
  }
  // Una petición que no es GET/HEAD modifica algo: sobre una carpeta compartida exige permiso de edición
  function userPath(req, relPath) {
    return resolveFor(req.user, relPath, { compartidos: true, write: req.method !== 'GET' && req.method !== 'HEAD' });
  }
  // Mover entre tu almacén y una carpeta compartida (o entre dos compartidas) mezclaría almacenes de dueños distintos
  function mismoAlmacen(a, b) {
    const x = shares().parse(a), y = shares().parse(b);
    if (!x && !y) return true;
    return !!x && !!y && x.id === y.id;
  }
  const esCompartida = (rel) => { try { return !!shares().parse(rel); } catch { return true; } };
  const sharesMueve = (user, a, b) => { try { if (!shares().parse(a)) shares().mueve(user.username, a, b); } catch { /* ruta virtual */ } };

  async function exists(p) {
    try { await fsp.access(p); return true; } catch { return false; }
  }
  // Devuelve una ruta libre añadiendo _1, _2… si el destino ya está ocupado
  async function freeName(dir, name) {
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    let target = path.join(dir, name);
    let n = 1;
    while (await exists(target)) target = path.join(dir, `${base}_${n++}${ext}`);
    return target;
  }

  return {
    invalidPath, safeResolve, userRoot, isHidden, assertVisible, resolveFor, userPath, mismoAlmacen,
    esCompartida, sharesMueve, exists, freeName,
  };
}

module.exports = createRutas;
