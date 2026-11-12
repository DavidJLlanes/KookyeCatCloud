'use strict';
// Importar · el análisis (descomprimir, leer XML/HTML/CSV) corre en un hilo aparte (worker_threads): un ZIP grande ocupa la CPU
// varios segundos y, en el hilo principal, el servidor dejaba de responder a todos mientras tanto.
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { HttpError } = require('../nucleo/store');
const { Adjuntos } = require('./adjuntos');

const TIEMPO_MAX = 120000;   // ms
const aBuffer = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);

/** Igual que plan.analiza, pero en otro hilo. Devuelve el mismo «paquete». */
function analizaEnHilo(buf, nombre, pedida) {
  return new Promise((resolve, reject) => {
    const w = new Worker(__filename, { workerData: { buf, nombre, pedida }, resourceLimits: { maxOldGenerationSizeMb: 1024 } });
    let hecho = false;
    const fin = (f, v) => { if (hecho) return; hecho = true; clearTimeout(t); w.terminate().catch(() => {}); f(v); };
    const t = setTimeout(() => fin(reject, new HttpError(400, 'El archivo tarda demasiado en analizarse. Prueba con uno más pequeño o divídelo.')), TIEMPO_MAX);
    w.on('message', (m) => {
      if (m.error) { const e = m.error.status ? new HttpError(m.error.status, m.error.message) : new Error(m.error.message); return fin(reject, e); }
      const p = m.ok; p.adj = Adjuntos.desde(p.adj, aBuffer);
      fin(resolve, p);
    });
    w.on('error', (e) => fin(reject, /memory|heap/i.test(String(e && e.message)) ? new HttpError(400, 'El archivo es demasiado grande para analizarlo') : e));
    w.on('exit', (c) => fin(reject, new Error('El análisis terminó sin respuesta (código ' + c + ')')));
  });
}

if (!isMainThread && parentPort && workerData && workerData.buf) {
  try {
    const plan = require('./plan');
    const d = workerData;
    const p = plan.analiza(aBuffer(d.buf), d.nombre, d.pedida);
    parentPort.postMessage({ ok: { ...p, adj: p.adj.exporta() } });
  } catch (e) {
    parentPort.postMessage({ error: { status: e.status, message: (e && e.message) || String(e) } });
  }
}

module.exports = { analizaEnHilo, ruta: path.resolve(__filename) };
