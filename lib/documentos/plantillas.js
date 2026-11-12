'use strict';
// Documentos · plantillas de partida (HTML ya saneado). La primera es el documento en blanco.
const COLS = (n, cols) => `<div class="dc-cols" data-n="${n}">${cols.map(c => `<div class="dc-col">${c}</div>`).join('')}</div><p><br></p>`;
const PLANTILLAS = {
  blanco: { nombre: 'En blanco', icono: '📄', desc: 'Un documento vacío', titulo: 'Documento sin título', html: '<p><br></p>' },
  carta: { nombre: 'Carta', icono: '✉️', desc: 'Remitente, fecha, destinatario y cuerpo', titulo: 'Carta',
    html: '<p style="text-align:right">Tu nombre<br>Tu dirección<br>Ciudad, fecha</p><p><br></p><p>Estimado/a señor/a:</p><p>Escribe aquí el cuerpo de la carta.</p><p><br></p><p>Atentamente,</p><p>Tu nombre</p>' },
  acta: { nombre: 'Acta de reunión', icono: '📝', desc: 'Asistentes, orden del día y acuerdos', titulo: 'Acta de reunión',
    html: '<h1>Acta de reunión</h1><p><b>Fecha:</b> </p><p><b>Asistentes:</b> </p><h2>Orden del día</h2><ol><li><br></li></ol><h2>Acuerdos</h2><ul class="dc-tareas"><li><br></li></ul><h2>Próxima reunión</h2><p><br></p>' },
  curriculum: { nombre: 'Currículum', icono: '🧑‍💼', desc: 'Dos columnas: datos y experiencia', titulo: 'Currículum',
    html: '<h1>Tu nombre</h1><p>Profesión · correo · teléfono</p>' + COLS(2, ['<h2>Experiencia</h2><p><b>Cargo</b> · Empresa · años</p><p>Descripción del puesto.</p>', '<h2>Formación</h2><p><b>Titulación</b> · Centro · año</p><h2>Habilidades</h2><ul><li>Habilidad</li><li>Habilidad</li></ul>']) },
  boletin: { nombre: 'Boletín en columnas', icono: '📰', desc: 'Titular y tres columnas de texto', titulo: 'Boletín',
    html: '<h1 style="text-align:center">Titular del boletín</h1><p style="text-align:center"><i>Subtítulo o fecha</i></p>' + COLS(3, ['<h3>Noticia 1</h3><p>Texto de la primera noticia.</p>', '<h3>Noticia 2</h3><p>Texto de la segunda noticia.</p>', '<h3>Noticia 3</h3><p>Texto de la tercera noticia.</p>']) },
  tareas: { nombre: 'Lista de tareas', icono: '✅', desc: 'Pendientes con casillas', titulo: 'Lista de tareas',
    html: '<h1>Lista de tareas</h1><ul class="dc-tareas"><li><br></li></ul>' },
};
module.exports = { PLANTILLAS };
