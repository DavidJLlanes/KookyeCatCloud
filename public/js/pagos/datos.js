'use strict';
/* Pagos · datos y utilidades compartidas por lista.js, formulario.js e index.js (todo cuelga de K.pagos). */
(function () {
  if (!window.K) return;
  const P = K.pagos = { S: { pagos: [], hoy: '', cargado: false, q: '', estado: 'todos', valor: null } };
  P.FRECUENCIAS = [['mensual', 'Cada mes'], ['bimestral', 'Cada 2 meses'], ['trimestral', 'Cada 3 meses'], ['semestral', 'Cada 6 meses'], ['anual', 'Cada año'], ['unico', 'Pago único']];
  P.MESES = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12, unico: 0 };
  P.METODOS = [['', 'Sin indicar'], ['domiciliacion', 'Domiciliación'], ['tarjeta', 'Tarjeta'], ['transferencia', 'Transferencia'], ['efectivo', 'Efectivo'], ['otro', 'Otro']];
  P.nombreDe = (lista, id) => (lista.find(x => x[0] === id) || [, ''])[1];

  const nf = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  P.euros = (n) => (n === null || n === undefined || n === '' ? 'Sin importe' : nf.format(Number(n)));
  P.fechaTxt = (d) => { const x = K.d.parse(d); return Number.isNaN(x.getTime()) ? '' : x.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }); };
  P.dias = (d) => K.d.diffDays(K.d.parse(P.S.hoy), K.d.parse(d));     // «hoy» lo manda el servidor (su zona horaria)

  // Estado de un pago: clase para el color y texto corto
  P.estadoDe = (p) => {
    if (p.activo === false) return { clase: 'fin', texto: p.frecuencia === 'unico' ? 'Pagado' : 'Pausado', orden: 4 };
    const n = P.dias(p.fechaProxima);
    if (n < 0) return { clase: 'vencido', texto: n === -1 ? 'Venció ayer' : `Vencido hace ${-n} días`, orden: 0, dias: n };
    if (n === 0) return { clase: 'hoy', texto: 'Vence hoy', orden: 1, dias: n };
    if (n <= (p.avisoDias ?? 3)) return { clase: 'pronto', texto: n === 1 ? 'Vence mañana' : `Vence en ${n} días`, orden: 2, dias: n };
    return { clase: 'ok', texto: n < 31 ? `En ${n} días` : P.fechaTxt(p.fechaProxima), orden: 3, dias: n };
  };
  // Gasto mensual equivalente (un recibo anual de 120 € cuenta 10 € al mes); los pagos únicos no cuentan
  P.mensual = (p) => (p.activo !== false && P.MESES[p.frecuencia] && p.importe ? p.importe / P.MESES[p.frecuencia] : 0);

  P.logros = K.debounce(() => { if (K.game && K.game.load) K.game.load(); }, 500);
  P.carga = async function () {
    const d = await K.get('/api/pagos');
    P.S.pagos = d.pagos || []; P.S.hoy = d.hoy; P.S.cargado = true;
    return P.S;
  };
})();
