'use strict';
// Búsqueda · lectores de los módulos que guardan una lista pequeña en un solo JSON
// (contactos, calendario, pagos, recordatorios, marcadores, portapapeles y bloques sincronizados).
const { ruta, desdeLista, leeSeguro, lista, fechaDe } = require('./ayudas');

const nombreContacto = (c) => [c.first, c.middle, c.last].filter(Boolean).join(' ') || c.company || c.nickname || 'Contacto';

module.exports = [
  { id: 'contactos', nombre: 'Contactos',
    documentos: (ctx, u) => desdeLista(ctx, u, { fuente: 'contactos', archivo: ruta(ctx, u, 'contacts.json'), clave: 'contacts', titulo: nombreContacto }) },
  { id: 'calendario', nombre: 'Calendario',
    documentos: (ctx, u) => desdeLista(ctx, u, { fuente: 'calendario', archivo: ruta(ctx, u, 'calendar.json'), clave: 'events', titulo: (e) => e.title }) },
  { id: 'pagos', nombre: 'Pagos',
    documentos: (ctx, u) => desdeLista(ctx, u, { fuente: 'pagos', archivo: ruta(ctx, u, 'pagos', 'data.json'), clave: 'pagos', titulo: (p) => p.nombre }) },
  { id: 'recordatorios', nombre: 'Recordatorios',
    documentos: (ctx, u) => desdeLista(ctx, u, { fuente: 'recordatorios', archivo: ruta(ctx, u, 'recordatorios', 'data.json'), clave: 'recordatorios', titulo: (r) => r.titulo }) },
  { id: 'marcadores', nombre: 'Marcadores',
    documentos: (ctx, u) => desdeLista(ctx, u, { fuente: 'marcadores', archivo: ruta(ctx, u, 'marcadores', 'data.json'), clave: 'marcadores', titulo: (m) => m.nombre }) },
  { id: 'sincronizados', nombre: 'Bloques sincronizados',
    documentos: (ctx, u) => desdeLista(ctx, u, { fuente: 'sincronizados', archivo: ruta(ctx, u, 'sincronizados', 'data.json'), clave: 'bloques', titulo: (b) => String(b.texto || '').slice(0, 60) }) },
  { id: 'portapapeles', nombre: 'Portapapeles',
    async documentos(ctx, u) {
      const d = await leeSeguro(ruta(ctx, u, 'clip', 'index.json'), () => ({ items: [] }));
      return lista(d.items).filter(i => i && i.type === 'text' && i.text).map(i => ({ fuente: 'portapapeles', id: i.id, titulo: String(i.text).split('\n')[0].slice(0, 80), texto: String(i.text).slice(0, 20000), fecha: fechaDe(i) }));
    } },
];
