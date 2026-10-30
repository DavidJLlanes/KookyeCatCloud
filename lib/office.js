'use strict';
// Visor de documentos de Office (convertidos a PDF con LibreOffice) y de hojas de cálculo (leídas con
// exceljs y devueltas como datos para pintar una rejilla). Fábrica como el resto: createOffice({...}) →
// { router, core: { convertirOffice } }. El router se monta en /api (rutas /office y /sheet);
// /api/preview, que sigue en server.js, reutiliza convertirOffice.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

// Lo que LibreOffice sabe convertir a PDF (documentos y presentaciones)
const OFFICE_RE = /\.(docx?|pptx?|odt|odp|rtf|pages|key)$/i;
// Las hojas de cálculo van por otro camino: se leen y se pintan como rejilla,
// porque convertirlas a PDF las pagina y deja de parecer una hoja de cálculo
const SHEET_RE = /\.(xlsx|xlsm|xls|ods|numbers)$/i;
const SHEET_NATIVE_RE = /\.(xlsx|xlsm)$/i;      // lo que exceljs abre directamente
const OFFICE_TIMEOUT = Number(process.env.OFFICE_TIMEOUT || 90000);
const SHEET_MAX_ROWS = Number(process.env.SHEET_MAX_ROWS || 2000);
const SHEET_MAX_COLS = Number(process.env.SHEET_MAX_COLS || 60);

function createOffice({ express, auth, userPath, soffice, thumbsDir, exists, sendError }) {
  const router = express.Router();

  // --- Documentos de Office, convertidos a PDF con LibreOffice ---
  function convertirOffice(file, salidaDir, formato = 'pdf') {
    return new Promise((resolve, reject) => {
      // Perfil de usuario propio por conversión: sin esto, dos a la vez chocan
      const perfil = path.join(salidaDir, 'perfil');
      const args = [
        '--headless', '--norestore', '--invisible', '--nolockcheck', '--nodefault',
        `-env:UserInstallation=file:///${perfil.replace(/\\/g, '/')}`,
        '--convert-to', formato, '--outdir', salidaDir, file,
      ];
      const p = spawn(soffice, args, { stdio: 'ignore' });
      const temporizador = setTimeout(() => p.kill('SIGKILL'), OFFICE_TIMEOUT);
      p.on('error', err => { clearTimeout(temporizador); reject(err); });
      p.on('close', code => {
        clearTimeout(temporizador);
        code === 0 ? resolve() : reject(new Error('La conversión falló'));
      });
    });
  }

  router.get('/office', auth, async (req, res) => {
    let trabajo = null;
    try {
      const file = userPath(req, req.query.path);
      if (!OFFICE_RE.test(file)) return res.status(415).json({ error: 'Formato no convertible' });
      if (!soffice) return res.status(501).json({ error: 'Este servidor no tiene LibreOffice instalado' });

      const stat = await fsp.stat(file);
      const key = crypto.createHash('sha1')
        .update(`${file}|${stat.size}|${stat.mtimeMs}|office`).digest('hex');
      const cached = path.join(thumbsDir, `${key}.pdf`);

      if (!await exists(cached)) {
        trabajo = path.join(thumbsDir, `conv-${key}-${process.pid}`);
        await fsp.mkdir(trabajo, { recursive: true });
        await convertirOffice(file, trabajo);
        const generado = (await fsp.readdir(trabajo)).find(f => f.toLowerCase().endsWith('.pdf'));
        if (!generado) throw new Error('LibreOffice no generó ningún PDF');
        await fsp.rename(path.join(trabajo, generado), cached);
      }

      // Mismo motivo que en /api/preview: el visor necesita poder montar su <embed>
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Content-Disposition', 'inline');
      res.sendFile(cached, { headers: { 'Content-Type': 'application/pdf' } });
    } catch (err) {
      sendError(res, err);
    } finally {
      if (trabajo) fsp.rm(trabajo, { recursive: true, force: true }).catch(() => {});
    }
  });

  /* ---------------- Hojas de cálculo ----------------
     Se leen y se devuelven como datos, no como PDF: así el cliente puede pintar
     una rejilla de verdad, con sus columnas, sus filas y sus pestañas de hoja. */

  // Convierte el valor de una celda a algo que se pueda enseñar tal cual
  function celdaATexto(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) {
      return v.getHours() || v.getMinutes()
        ? v.toLocaleString('es-ES')
        : v.toLocaleDateString('es-ES');
    }
    if (typeof v === 'object') {
      if (v.richText) return v.richText.map(t => t.text).join('');   // texto con formatos
      if (v.text !== undefined) return String(v.text);               // hipervínculo
      if (v.result !== undefined) return String(v.result);           // fórmula ya calculada
      if (v.formula) return '';                                      // fórmula sin resultado guardado
      if (v.error) return String(v.error);
      return '';
    }
    return String(v);
  }
  const esNumero = (v) => typeof v === 'number' ||
    (v && typeof v === 'object' && typeof v.result === 'number');

  router.get('/sheet', auth, async (req, res) => {
    let trabajo = null;
    try {
      const file = userPath(req, req.query.path);
      if (!SHEET_RE.test(file)) return res.status(415).json({ error: 'No es una hoja de cálculo' });

      let aLeer = file;
      // .xls y .ods no los abre exceljs: LibreOffice los pasa antes a xlsx
      if (!SHEET_NATIVE_RE.test(file)) {
        if (!soffice) return res.status(501).json({ error: 'Este formato necesita LibreOffice en el servidor' });
        const stat = await fsp.stat(file);
        const key = crypto.createHash('sha1').update(`${file}|${stat.size}|${stat.mtimeMs}|sheet`).digest('hex');
        const cached = path.join(thumbsDir, `${key}.xlsx`);
        if (!await exists(cached)) {
          trabajo = path.join(thumbsDir, `sheet-${key}-${process.pid}`);
          await fsp.mkdir(trabajo, { recursive: true });
          await convertirOffice(file, trabajo, 'xlsx');
          const generado = (await fsp.readdir(trabajo)).find(f => f.toLowerCase().endsWith('.xlsx'));
          if (!generado) throw new Error('No se pudo leer la hoja');
          await fsp.rename(path.join(trabajo, generado), cached);
        }
        aLeer = cached;
      }

      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      try {
        await wb.xlsx.readFile(aLeer);
      } catch {
        // El mensaje de la librería habla de directorios centrales y de zips: no ayuda a nadie
        return res.status(422).json({ error: 'No se pudo leer la hoja. Puede que el archivo esté dañado.' });
      }

      let recortado = false;
      const hojas = wb.worksheets.map(ws => {
        const totalFilas = Math.min(ws.rowCount || 0, SHEET_MAX_ROWS);
        const totalCols = Math.min(ws.columnCount || 0, SHEET_MAX_COLS);
        if ((ws.rowCount || 0) > totalFilas || (ws.columnCount || 0) > totalCols) recortado = true;

        const filas = [];
        for (let r = 1; r <= totalFilas; r++) {
          const fila = ws.getRow(r);
          const celdas = [];
          for (let c = 1; c <= totalCols; c++) {
            const celda = fila.getCell(c);
            celdas.push({ t: celdaATexto(celda.value), n: esNumero(celda.value) || undefined });
          }
          // Se recorta la cola vacía de cada fila, que en Excel suele ser larga
          while (celdas.length && !celdas[celdas.length - 1].t) celdas.pop();
          filas.push(celdas);
        }
        while (filas.length && !filas[filas.length - 1].length) filas.pop();

        const anchos = [];
        for (let c = 1; c <= totalCols; c++) anchos.push(ws.getColumn(c).width || null);

        return { nombre: ws.name, filas, anchos, filasTotales: ws.rowCount || 0, colsTotales: ws.columnCount || 0 };
      });

      res.json({ hojas, recortado, maxFilas: SHEET_MAX_ROWS, maxCols: SHEET_MAX_COLS });
    } catch (err) {
      sendError(res, err);
    } finally {
      if (trabajo) fsp.rm(trabajo, { recursive: true, force: true }).catch(() => {});
    }
  });

  return { router, core: { convertirOffice } };
}

createOffice.OFFICE_RE = OFFICE_RE;
module.exports = createOffice;
