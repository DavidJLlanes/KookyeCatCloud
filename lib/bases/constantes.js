'use strict';
// Bases · constantes compartidas por el modelo, las vistas, los cálculos y las rutas.

// Tipos que se escriben a mano y los que se calculan (fórmula, relación, resumen: no guardan valor propio, salvo relation)
const TIPOS_DATO = ['text', 'number', 'date', 'checkbox', 'select', 'multiselect', 'url', 'email', 'phone', 'file'];
const TIPOS_CALC = ['formula', 'relation', 'rollup'];
const TIPOS = [...TIPOS_DATO, ...TIPOS_CALC];
const VISTAS = ['table', 'kanban', 'calendar', 'gallery', 'timeline'];
const OPS = ['contains', 'equals', 'not', 'checked', 'unchecked', 'empty', 'filled', 'gt', 'lt', 'gte', 'lte', 'before', 'after'];
const FUNC_RESUMEN = ['cuenta', 'rellenas', 'suma', 'media', 'min', 'max', 'unicos', 'marcadas'];
const FUNC_TOTAL = ['cuenta', 'rellenas', 'vacias', 'unicos', 'suma', 'media', 'min', 'max', 'marcadas'];
const LIM = { BASES: 60, COLS: 30, FILAS: 5000, OPC: 40, VISTAS: 12, FILTROS: 8, ORDENES: 4, RELACION: 50, FORMULA: 500 };
const COLORES = ['#64748b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const RE_ID = /^[a-f0-9]{16}$/;
const RE_COLOR = /^#[0-9a-fA-F]{6}$/;

module.exports = { TIPOS_DATO, TIPOS_CALC, TIPOS, VISTAS, OPS, FUNC_RESUMEN, FUNC_TOTAL, LIM, COLORES, RE_DIA, RE_ID, RE_COLOR };
