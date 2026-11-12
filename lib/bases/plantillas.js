'use strict';
// Bases · plantillas para empezar (columnas y vistas ya montadas).
const { newId } = require('../store');
const { COLORES } = require('./constantes');

const opc = (nombre, i) => ({ nombre, color: COLORES[(i + 1) % COLORES.length] });
const PLANTILLAS = Object.assign(Object.create(null), {
  vacia: { nombre: 'Base vacía', icono: '🗂️', desc: 'Empieza solo con una columna de nombre', columnas: [{ nombre: 'Nombre', tipo: 'text' }], vistas: [{ nombre: 'Tabla', tipo: 'table' }] },
  proyectos: {
    nombre: 'Proyectos', icono: '🚀', desc: 'Tablero con estados, prioridad y fecha límite',
    columnas: [{ nombre: 'Nombre', tipo: 'text' }, { nombre: 'Estado', tipo: 'select', opciones: ['Pendiente', 'En curso', 'Hecho'] }, { nombre: 'Prioridad', tipo: 'select', opciones: ['Baja', 'Media', 'Alta'] }, { nombre: 'Fecha límite', tipo: 'date' }, { nombre: 'Notas', tipo: 'text' }],
    vistas: [{ nombre: 'Tablero', tipo: 'kanban', agrupa: 'Estado' }, { nombre: 'Tabla', tipo: 'table' }, { nombre: 'Calendario', tipo: 'calendar', fecha: 'Fecha límite' }, { nombre: 'Línea de tiempo', tipo: 'timeline', fecha: 'Fecha límite' }],
  },
  tareas: {
    nombre: 'Tareas', icono: '✅', desc: 'Lista de tareas con casilla y estado',
    columnas: [{ nombre: 'Tarea', tipo: 'text' }, { nombre: 'Hecha', tipo: 'checkbox' }, { nombre: 'Estado', tipo: 'select', opciones: ['Por hacer', 'Haciendo', 'Hecho'] }, { nombre: 'Vence', tipo: 'date' }],
    vistas: [{ nombre: 'Tabla', tipo: 'table' }, { nombre: 'Tablero', tipo: 'kanban', agrupa: 'Estado' }, { nombre: 'Calendario', tipo: 'calendar', fecha: 'Vence' }],
  },
  libros: {
    nombre: 'Libros', icono: '📚', desc: 'Lo que lees, con nota y géneros',
    columnas: [{ nombre: 'Título', tipo: 'text' }, { nombre: 'Autor', tipo: 'text' }, { nombre: 'Estado', tipo: 'select', opciones: ['Por leer', 'Leyendo', 'Leído'] }, { nombre: 'Nota', tipo: 'number' }, { nombre: 'Géneros', tipo: 'multiselect', opciones: ['Novela', 'Ensayo', 'Fantasía', 'Ciencia ficción', 'Técnico'] }, { nombre: 'Terminado', tipo: 'date' }],
    vistas: [{ nombre: 'Tabla', tipo: 'table' }, { nombre: 'Tablero', tipo: 'kanban', agrupa: 'Estado' }],
  },
  gastos: {
    nombre: 'Gastos', icono: '💶', desc: 'Control sencillo de gastos',
    columnas: [{ nombre: 'Concepto', tipo: 'text' }, { nombre: 'Importe', tipo: 'number' }, { nombre: 'Fecha', tipo: 'date' }, { nombre: 'Categoría', tipo: 'select', opciones: ['Casa', 'Comida', 'Ocio', 'Transporte', 'Trabajo'] }, { nombre: 'Pagado', tipo: 'checkbox' }],
    vistas: [{ nombre: 'Tabla', tipo: 'table' }, { nombre: 'Por categoría', tipo: 'kanban', agrupa: 'Categoría' }, { nombre: 'Calendario', tipo: 'calendar', fecha: 'Fecha' }],
  },
  clientes: {
    nombre: 'Clientes', icono: '🤝', desc: 'Seguimiento comercial',
    columnas: [{ nombre: 'Nombre', tipo: 'text' }, { nombre: 'Empresa', tipo: 'text' }, { nombre: 'Estado', tipo: 'select', opciones: ['Contacto', 'Propuesta', 'Cliente', 'Perdido'] }, { nombre: 'Email', tipo: 'email' }, { nombre: 'Web', tipo: 'url' }, { nombre: 'Próxima acción', tipo: 'date' }],
    vistas: [{ nombre: 'Embudo', tipo: 'kanban', agrupa: 'Estado' }, { nombre: 'Tabla', tipo: 'table' }, { nombre: 'Calendario', tipo: 'calendar', fecha: 'Próxima acción' }],
  },
});

function desdePlantilla(t) {
  const cols = t.columnas.map(c => ({ id: newId(), nombre: c.nombre, tipo: c.tipo, ...(c.opciones ? { opciones: c.opciones.map(opc).map(o => ({ id: newId(), ...o })) } : {}) }));
  const vistas = t.vistas.map(v => ({ id: newId(), nombre: v.nombre, tipo: v.tipo, filtros: [], unir: 'y', ordenes: [], ocultas: [], ...(v.agrupa ? { agrupa: (cols.find(c => c.nombre === v.agrupa) || {}).id } : {}), ...(v.fecha ? { fecha: (cols.find(c => c.nombre === v.fecha) || {}).id } : {}) }));
  return { cols, vistas };
}

module.exports = { PLANTILLAS, desdePlantilla };
