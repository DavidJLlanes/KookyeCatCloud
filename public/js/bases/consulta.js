'use strict';
/* Bases · filtros y orden de una vista (varios filtros unidos con «y»/«o» y varios criterios de orden). */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases, S = B.S;
  const vacio = (v) => !(Array.isArray(v) ? v.length : v === true || (v !== '' && v !== null && v !== undefined && v !== false));
  const minus = (s) => String(s ?? '').toLocaleLowerCase('es');

  B.pasa = (r, f) => {
    const c = B.col(f.col); if (!c) return true;
    const v = B.crudo(r, c), plano = minus(B.texto(r, c)), txt = minus(f.valor);
    switch (f.op) {
      case 'contains': return plano.includes(txt);
      case 'equals': return plano === txt;
      case 'not': return plano !== txt;
      case 'checked': return v === true; case 'unchecked': return v !== true;
      case 'empty': return vacio(v) && v !== true;
      case 'filled': return !vacio(v);
      case 'gt': return Number(v) > Number(f.valor); case 'lt': return Number(v) < Number(f.valor);
      case 'gte': return Number(v) >= Number(f.valor); case 'lte': return Number(v) <= Number(f.valor);
      case 'before': return !!v && !!f.valor && String(v) < f.valor;
      case 'after': return !!v && !!f.valor && String(v) > f.valor;
      default: return true;
    }
  };
  B.pasaFiltros = (r, v) => { const fs = (v.filtros || []).filter(f => B.col(f.col)); return !fs.length || (v.unir === 'o' ? fs.some(f => B.pasa(r, f)) : fs.every(f => B.pasa(r, f))); };
  // Orden de la vista; la cabecera de la tabla puede imponer uno temporal (ordenLocal) que no se guarda
  B.ordenes = (v) => (S.ordenLocal && S.ordenLocal.vista === v.id ? [S.ordenLocal] : (v.ordenes || [])).filter(o => B.col(o.col));
  const clave = (r, c) => {
    const x = B.crudo(r, c);
    if (c.tipo === 'select') return (c.opciones || []).findIndex(p => p.id === x);
    if (c.tipo === 'multiselect' || c.tipo === 'relation') return (x || []).length;
    if (c.tipo === 'number') return x === null || x === '' ? -Infinity : x;
    if (c.tipo === 'checkbox') return x ? 1 : 0;
    return typeof x === 'number' ? x : minus(x);
  };
  B.filas = (v) => {
    const q = minus(S.q);
    let l = S.base.rows.filter(r => B.pasaFiltros(r, v) && (!q || S.base.columns.some(c => minus(B.texto(r, c)).includes(q))));
    const os = B.ordenes(v);
    if (os.length) l = [...l].sort((a, b) => { for (const o of os) { const c = B.col(o.col); const A = clave(a, c), Z = clave(b, c); if (A !== Z) return (A < Z ? -1 : 1) * (o.dir === 'desc' ? -1 : 1); } return 0; });
    return l;
  };
  B.resumenFiltros = (v) => (v.filtros || []).filter(f => B.col(f.col)).map(f => `${B.col(f.col).nombre} ${B.OPS[f.op]}${B.SIN_VALOR.includes(f.op) ? '' : ' «' + (/^\d{4}-\d{2}-\d{2}$/.test(f.valor) ? B.fechaTxt(f.valor) : f.valor) + '»'}`);
})();
