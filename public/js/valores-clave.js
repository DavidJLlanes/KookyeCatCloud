/* Normalización de valores repetibles (modelo, plataforma, empresa…). UN solo archivo para servidor y navegador:
   lib/valores.js lo carga con require() y el navegador con <script>, así la clave que calcula el cliente para
   avisar al usuario es exactamente la que luego aplica el servidor al guardar.

   clave('Claude Sonnet 5,5') === clave('claude  sonnet 5.5') === clave('CLAUDE-SONNET 5.5')
   Ignora mayúsculas, acentos, espacios, guiones y signos sin significado, y trata la coma decimal como punto.
   Conserva lo que cambia el significado: «5.5» no es «55», «C++» no es «C» y «PS4» no es «PS5».

   parecido() detecta erratas de una o dos letras («sonet» ↔ «sonnet») para SUGERIR, nunca para cambiar solo,
   y jamás cuando difieren los números («4.5» ↔ «5.5»). */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.KccValores = fabrica();
})(this, function () {
  const MAX = 80;

  // Texto tal como se guarda: sin espacios sobrantes y con la coma decimal escrita como punto
  function limpia(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().replace(/(\d),(\d)/g, '$1.$2').slice(0, MAX).trim();
  }

  // Lo que se compara: dos valores con la misma clave son el mismo valor
  function clave(v) {
    let t = String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    t = t.replace(/(\d),(\d)/g, '$1.$2');                                  // 5,5 → 5.5
    t = t.replace(/(\d)[\s_\-–—]+(?=\d)/g, '$1~');                         // «5 5» ≠ «55»
    t = t.replace(/\./g, (m, i, s) => (/\d/.test(s[i - 1] || '') && /\d/.test(s[i + 1] || '') ? '.' : ''));   // node.js → nodejs
    return t.replace(/[\s_\-–—'"`´‘’“”()[\]{}:;,!?¡¿]+/g, '');
  }

  // Distancia de edición con transposiciones (cambiar dos letras contiguas cuenta como 1)
  function distancia(a, b) {
    const n = a.length, m = b.length;
    if (!n) return m;
    if (!m) return n;
    const d = [];
    for (let i = 0; i <= n; i++) { d[i] = [i]; }
    for (let j = 1; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const c = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[n][m];
  }

  const soloLetras = (k) => k.replace(/[0-9.~]/g, '');
  const soloCifras = (k) => k.replace(/[^0-9.~]/g, '');
  // Cuántas letras de diferencia se toleran según la longitud: las palabras cortas no admiten errata
  const umbral = (letras) => (letras < 5 ? 0 : letras < 10 ? 1 : 2);

  // ¿Se parece `a` a `b` lo bastante como para sugerirlo? (claves distintas, mismas cifras, letras casi iguales)
  function sonParecidos(a, b) {
    if (!a || !b || a === b) return false;
    if (soloCifras(a) !== soloCifras(b)) return false;
    const la = soloLetras(a), lb = soloLetras(b);
    const u = umbral(Math.min(la.length, lb.length));
    return u > 0 && distancia(la, lb) <= u;
  }

  // El más parecido de una lista de valores, o null
  function parecido(texto, valores) {
    const k = clave(texto);
    if (!k) return null;
    let mejor = null, dm = 99;
    for (const v of valores) {
      const kv = clave(v);
      if (!sonParecidos(k, kv)) continue;
      const d = distancia(soloLetras(k), soloLetras(kv));
      if (d < dm) { dm = d; mejor = v; }
    }
    return mejor;
  }

  return { clave, limpia, distancia, sonParecidos, parecido, MAX };
});
