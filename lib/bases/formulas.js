'use strict';
// Bases · fórmulas. Analizador y evaluador propios (sin eval ni Function): solo números, textos, fechas y funciones de la lista.
// Sintaxis: {Nombre de columna}, números, "textos", + - * / % ^, & (unir textos), = != < > <= >=, y funciones en español:
// SI(cond; a; b)  Y  O  NO  VACIO  SIERROR  SUMA  PROMEDIO  MIN  MAX  REDONDEAR  ABS  ENTERO  RAIZ  CONCAT  LARGO  MAYUS  MINUS
// RECORTAR  IZQUIERDA  DERECHA  REEMPLAZAR  CONTIENE  TEXTO  NUM  CUENTA  HOY  ANIO  MES  DIA  DIAS  SUMADIAS
const { ahora, sumaDias, diasHasta } = require('../push/tiempo');
const { RE_DIA, LIM } = require('./constantes');

class ErrorFormula extends Error { constructor(msg, codigo) { super(msg); this.codigo = codigo || '#ERROR'; } }
const MAX_TOKENS = 300, MAX_PROF = 150, MAX_TEXTO = 2000;

/* ---------- Analizador ---------- */
function tokeniza(src) {
  const t = []; let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (t.length >= MAX_TOKENS) throw new ErrorFormula('La fórmula es demasiado larga');
    if (ch === '{') {
      const f = src.indexOf('}', i); if (f < 0) throw new ErrorFormula('Falta cerrar una llave }');
      const nombre = src.slice(i + 1, f).trim(); if (!nombre || nombre.length > 60) throw new ErrorFormula('Nombre de columna no válido entre llaves');
      t.push({ k: 'ref', v: nombre }); i = f + 1; continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== ch) { if (src[j] === '\\' && j + 1 < src.length) j++; s += src[j++]; }
      if (j >= src.length) throw new ErrorFormula('Falta cerrar unas comillas');
      t.push({ k: 'str', v: s }); i = j + 1; continue;
    }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { t.push({ k: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ_][\wÁÉÍÓÚÜÑáéíóúüñ.]*/.exec(src.slice(i));
    if (id) { t.push({ k: 'id', v: id[0].toUpperCase() }); i += id[0].length; continue; }
    const op = /^(<=|>=|<>|!=|[-+*/%^&=<>(),;])/.exec(src.slice(i));
    if (op) { t.push({ k: 'op', v: op[0] === '<>' ? '!=' : op[0] === ';' ? ',' : op[0] }); i += op[0].length; continue; }
    throw new ErrorFormula(`Carácter no permitido: «${ch}»`);
  }
  return t;
}

// [mínimo de argumentos, máximo]
const FUNCS = {
  SI: [2, 3], Y: [1, 20], O: [1, 20], NO: [1, 1], VACIO: [1, 1], SIERROR: [2, 2],
  SUMA: [1, 30], PROMEDIO: [1, 30], MIN: [1, 30], MAX: [1, 30], REDONDEAR: [1, 2], ABS: [1, 1], ENTERO: [1, 1], RAIZ: [1, 1],
  CONCAT: [1, 30], LARGO: [1, 1], MAYUS: [1, 1], MINUS: [1, 1], RECORTAR: [1, 1], IZQUIERDA: [2, 2], DERECHA: [2, 2], REEMPLAZAR: [3, 3], CONTIENE: [2, 2],
  TEXTO: [1, 1], NUM: [1, 1], CUENTA: [1, 1], HOY: [0, 0], ANIO: [1, 1], AÑO: [1, 1], MES: [1, 1], DIA: [1, 1], DIAS: [2, 2], SUMADIAS: [2, 2],
};

function analiza(src) {
  const t = tokeniza(String(src || '')); let p = 0;
  const ve = () => t[p], es = (v) => t[p] && t[p].k === 'op' && t[p].v === v;
  const come = (v) => { if (!es(v)) throw new ErrorFormula(`Se esperaba «${v}»`); p++; };
  const nodo = (prof, fn) => { if (prof > MAX_PROF) throw new ErrorFormula('La fórmula tiene demasiados niveles'); return fn(); };
  function cmp(d) {
    return nodo(d, () => {
      let a = cat(d + 1);
      if (['=', '!=', '<', '>', '<=', '>='].some(es)) { const op = t[p++].v; a = { t: 'bin', op, a, b: cat(d + 1) }; }
      return a;
    });
  }
  function cat(d) { return nodo(d, () => { let a = suma(d + 1); while (es('&')) { p++; a = { t: 'bin', op: '&', a, b: suma(d + 1) }; } return a; }); }
  function suma(d) { return nodo(d, () => { let a = mul(d + 1); while (es('+') || es('-')) { const op = t[p++].v; a = { t: 'bin', op, a, b: mul(d + 1) }; } return a; }); }
  function mul(d) { return nodo(d, () => { let a = un(d + 1); while (es('*') || es('/') || es('%')) { const op = t[p++].v; a = { t: 'bin', op, a, b: un(d + 1) }; } return a; }); }
  function un(d) { return nodo(d, () => { if (es('-')) { p++; return { t: 'neg', a: un(d + 1) }; } return pot(d + 1); }); }
  function pot(d) { return nodo(d, () => { const a = prim(d + 1); if (es('^')) { p++; return { t: 'bin', op: '^', a, b: un(d + 1) }; } return a; }); }
  function prim(d) {
    return nodo(d, () => {
      const x = ve(); if (!x) throw new ErrorFormula('La fórmula está incompleta');
      if (x.k === 'num') { p++; return { t: 'lit', v: x.v }; }
      if (x.k === 'str') { p++; return { t: 'lit', v: x.v }; }
      if (x.k === 'ref') { p++; return { t: 'ref', nombre: x.v }; }
      if (x.k === 'op' && x.v === '(') { p++; const e = cmp(d + 1); come(')'); return e; }
      if (x.k === 'id') {
        p++;
        if (x.v === 'VERDADERO') return { t: 'lit', v: true };
        if (x.v === 'FALSO') return { t: 'lit', v: false };
        if (!es('(')) throw new ErrorFormula(`«${x.v}» no es una función ni un valor; las columnas van entre llaves {así}`);
        const lim = FUNCS[x.v]; if (!lim) throw new ErrorFormula(`La función ${x.v} no existe`);
        p++; const args = [];
        if (!es(')')) { do { args.push(cmp(d + 1)); } while (es(',') && ++p); }
        come(')');
        if (args.length < lim[0] || args.length > lim[1]) throw new ErrorFormula(`${x.v} necesita ${lim[0] === lim[1] ? lim[0] : `entre ${lim[0]} y ${lim[1]}`} valor(es)`);
        return { t: 'call', f: x.v === 'AÑO' ? 'ANIO' : x.v, args };
      }
      throw new ErrorFormula(`No se esperaba «${x.v}»`);
    });
  }
  if (!t.length) throw new ErrorFormula('La fórmula está vacía');
  const ast = cmp(0);
  if (p < t.length) throw new ErrorFormula(`Sobra «${t[p].v}»`);
  return ast;
}

// Nombres de columna que usa la fórmula
function referencias(ast, out = new Set()) {
  if (!ast) return out;
  if (ast.t === 'ref') out.add(ast.nombre);
  for (const k of ['a', 'b']) if (ast[k]) referencias(ast[k], out);
  (ast.args || []).forEach(x => referencias(x, out));
  return out;
}

// Comprueba la fórmula al guardar la columna; devuelve el texto limpio. `nombres`: columnas que existen.
function compila(expr, nombres) {
  const s = String(expr === undefined || expr === null ? '' : expr).trim();
  if (s.length > LIM.FORMULA) throw new ErrorFormula(`La fórmula es demasiado larga (máximo ${LIM.FORMULA} caracteres)`);
  const ast = analiza(s);
  for (const n of referencias(ast)) if (!nombres.has(n)) throw new ErrorFormula(`No existe la columna «${n}»`);
  return s;
}
// Cambia {viejo} por {nuevo} en el texto de una fórmula (al renombrar una columna)
const renombraRef = (expr, viejo, nuevo) => String(expr).split('{' + viejo + '}').join('{' + nuevo + '}');

/* ---------- Evaluación ---------- */
const nf = (n) => String(Math.round(n * 1e6) / 1e6).replace('.', ',');
const vacio = (x) => x === null || x === undefined || x === '' || (Array.isArray(x) && !x.length);
const aTexto = (x) => (vacio(x) ? '' : Array.isArray(x) ? x.join(', ') : typeof x === 'number' ? nf(x) : typeof x === 'boolean' ? (x ? 'Sí' : 'No') : String(x));
function aNum(x) {
  if (vacio(x)) return 0;
  if (typeof x === 'number') return x;
  if (typeof x === 'boolean') return x ? 1 : 0;
  if (Array.isArray(x)) throw new ErrorFormula('No se puede operar con una lista; usa CUENTA o un resumen', '#VALOR');
  const n = Number(String(x).replace(',', '.'));
  if (!Number.isFinite(n)) throw new ErrorFormula(`«${String(x).slice(0, 20)}» no es un número`, '#VALOR');
  return n;
}
const cierto = (x) => (typeof x === 'boolean' ? x : typeof x === 'number' ? x !== 0 : Array.isArray(x) ? x.length > 0 : !vacio(x));
function aFecha(x) {
  const s = String(x === undefined || x === null ? '' : x);
  if (!RE_DIA.test(s) || Number.isNaN(Date.parse(s))) throw new ErrorFormula(`«${s.slice(0, 20)}» no es una fecha (AAAA-MM-DD)`, '#FECHA');
  return s;
}
const numerico = (x) => typeof x === 'number' || (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x.replace(',', '.'))));
function compara(a, b) {
  if (vacio(a) && vacio(b)) return 0;
  if (typeof a === 'boolean' || typeof b === 'boolean') return Number(cierto(a)) - Number(cierto(b));
  if (numerico(a) && numerico(b)) return aNum(a) - aNum(b);
  const A = aTexto(a).toLocaleLowerCase('es'), B = aTexto(b).toLocaleLowerCase('es');
  return A < B ? -1 : A > B ? 1 : 0;
}
const limita = (s) => (s.length > MAX_TEXTO ? s.slice(0, MAX_TEXTO) : s);
const plano = (args) => args.flat().filter(x => !vacio(x)).map(aNum);
const finito = (n) => { if (!Number.isFinite(n)) throw new ErrorFormula('El resultado no es un número válido', '#NUM'); return n; };

function evalua(ast, valorRef, hoy) {
  const ev = (n) => {
    switch (n.t) {
      case 'lit': return n.v;
      case 'ref': return valorRef(n.nombre);
      case 'neg': return -aNum(ev(n.a));
      case 'bin': {
        const a = ev(n.a), b = ev(n.b);
        switch (n.op) {
          case '+': return finito(aNum(a) + aNum(b));
          case '-': return finito(aNum(a) - aNum(b));
          case '*': return finito(aNum(a) * aNum(b));
          case '/': { const d = aNum(b); if (d === 0) throw new ErrorFormula('División entre cero', '#DIV/0'); return finito(aNum(a) / d); }
          case '%': { const d = aNum(b); if (d === 0) throw new ErrorFormula('División entre cero', '#DIV/0'); return finito(aNum(a) % d); }
          case '^': return finito(Math.pow(aNum(a), aNum(b)));
          case '&': return limita(aTexto(a) + aTexto(b));
          case '=': return compara(a, b) === 0;
          case '!=': return compara(a, b) !== 0;
          case '<': return compara(a, b) < 0;
          case '>': return compara(a, b) > 0;
          case '<=': return compara(a, b) <= 0;
          case '>=': return compara(a, b) >= 0;
          default: throw new ErrorFormula('Operador desconocido');
        }
      }
      case 'call': return llama(n);
      default: throw new ErrorFormula('Fórmula no válida');
    }
  };
  function llama(n) {
    const A = n.args;
    // Las que no evalúan todos sus argumentos
    if (n.f === 'SI') return cierto(ev(A[0])) ? ev(A[1]) : (A[2] ? ev(A[2]) : '');
    if (n.f === 'SIERROR') { try { return ev(A[0]); } catch (e) { if (e instanceof ErrorFormula) return ev(A[1]); throw e; } }
    const v = A.map(ev);
    switch (n.f) {
      case 'Y': return v.every(cierto);
      case 'O': return v.some(cierto);
      case 'NO': return !cierto(v[0]);
      case 'VACIO': return vacio(v[0]);
      case 'SUMA': return finito(plano(v).reduce((s, x) => s + x, 0));
      case 'PROMEDIO': { const l = plano(v); return l.length ? finito(l.reduce((s, x) => s + x, 0) / l.length) : 0; }
      case 'MIN': { const l = plano(v); return l.length ? Math.min(...l) : 0; }
      case 'MAX': { const l = plano(v); return l.length ? Math.max(...l) : 0; }
      case 'REDONDEAR': { const d = Math.max(0, Math.min(10, Math.trunc(aNum(v[1] === undefined ? 0 : v[1])))); const k = 10 ** d; return Math.round(aNum(v[0]) * k) / k; }
      case 'ABS': return Math.abs(aNum(v[0]));
      case 'ENTERO': return Math.floor(aNum(v[0]));
      case 'RAIZ': { const x = aNum(v[0]); if (x < 0) throw new ErrorFormula('Raíz de un número negativo', '#NUM'); return Math.sqrt(x); }
      case 'CONCAT': return limita(v.map(aTexto).join(''));
      case 'LARGO': return aTexto(v[0]).length;
      case 'MAYUS': return aTexto(v[0]).toLocaleUpperCase('es');
      case 'MINUS': return aTexto(v[0]).toLocaleLowerCase('es');
      case 'RECORTAR': return aTexto(v[0]).trim();
      case 'IZQUIERDA': return aTexto(v[0]).slice(0, Math.max(0, Math.trunc(aNum(v[1]))));
      case 'DERECHA': { const k = Math.max(0, Math.trunc(aNum(v[1]))); const s = aTexto(v[0]); return k ? s.slice(-k) : ''; }
      case 'REEMPLAZAR': { const b = aTexto(v[1]); return b ? limita(aTexto(v[0]).split(b).join(aTexto(v[2]))) : aTexto(v[0]); }
      case 'CONTIENE': return aTexto(v[0]).toLocaleLowerCase('es').includes(aTexto(v[1]).toLocaleLowerCase('es'));
      case 'TEXTO': return aTexto(v[0]);
      case 'NUM': return aNum(v[0]);
      case 'CUENTA': return Array.isArray(v[0]) ? v[0].length : vacio(v[0]) ? 0 : 1;
      case 'HOY': return hoy;
      case 'ANIO': return Number(aFecha(v[0]).slice(0, 4));
      case 'MES': return Number(aFecha(v[0]).slice(5, 7));
      case 'DIA': return Number(aFecha(v[0]).slice(8, 10));
      case 'DIAS': return diasHasta(aFecha(v[0]), aFecha(v[1]));
      case 'SUMADIAS': return sumaDias(aFecha(v[0]), Math.trunc(aNum(v[1])));
      default: throw new ErrorFormula(`La función ${n.f} no existe`);
    }
  }
  return ev(ast);
}

const hoyAhora = () => ahora().dia;

module.exports = { ErrorFormula, analiza, compila, referencias, renombraRef, evalua, hoyAhora, aTexto };
