'use strict';
// Importar · CSV → contactos: campos disponibles, sugerencia de asignación según la cabecera (Google, Outlook, español, inglés)
// y conversión de cada fila al formato que lee `contacts.importaLeidos`.
const { fecha } = require('./csv');

const CAMPOS = [
  ['first', 'Nombre'], ['middle', 'Segundo nombre'], ['last', 'Apellidos'], ['completo', 'Nombre completo (se separa solo)'], ['nickname', 'Apodo'],
  ['company', 'Empresa'], ['department', 'Departamento'], ['title', 'Cargo'], ['phone', 'Teléfono'], ['email', 'Correo'], ['website', 'Web'],
  ['street', 'Calle'], ['city', 'Ciudad'], ['region', 'Provincia o región'], ['zip', 'Código postal'], ['country', 'País'],
  ['birthday', 'Cumpleaños'], ['notes', 'Notas'], ['labels', 'Etiquetas (separadas por coma o ;)'],
];
const REGLAS = [
  [/^(first ?name|given ?name|nombre|primer nombre)$/i, 'first'], [/^(middle ?name|additional name|segundo nombre)$/i, 'middle'],
  [/^(last ?name|family ?name|surname|apellidos?)$/i, 'last'], [/^(name|full ?name|nombre completo|display name)$/i, 'completo'],
  [/^(nick ?name|apodo|alias)$/i, 'nickname'], [/^(company|organi[sz]ation|organization name|empresa|compañ[ií]a)$/i, 'company'],
  [/^(department|departamento|organization department)$/i, 'department'], [/^(job ?title|title|cargo|puesto|organization title)$/i, 'title'],
  [/(phone|tel[eé]fono|m[oó]vil|mobile|celular)/i, 'phone'], [/(e-?mail|correo)/i, 'email'],
  [/^(web|website|url|sitio web|p[aá]gina web)/i, 'website'], [/(street|calle|direcci[oó]n)/i, 'street'], [/^(city|ciudad|poblaci[oó]n|localidad)/i, 'city'],
  [/^(state|region|provincia|estado)/i, 'region'], [/(zip|postal|c[oó]digo postal)/i, 'zip'], [/^(country|pa[ií]s)/i, 'country'],
  [/(birthday|cumplea|nacimiento)/i, 'birthday'], [/^(notes?|notas?|comentarios?)$/i, 'notes'], [/^(labels?|etiquetas?|groups?|grupos?|categories|categor[ií]as)/i, 'labels'],
];

const sugiere = (cabecera) => cabecera.map(c => { const r = REGLAS.find(([re]) => re.test(String(c).trim())); return r ? r[1] : ''; });

const lista = (v) => String(v || '').split(/[,;|]|:::/).map(x => x.trim()).filter(Boolean);

/** campos[k] = clave de CAMPOS (o '') de la columna k → contactos en el formato de vCard leído */
function aContactos(tabla, campos) {
  const out = [];
  for (const f of tabla.filas) {
    const c = { first: '', middle: '', last: '', nickname: '', company: '', department: '', title: '', phones: [], emails: [], addresses: [], websites: [], dates: [], notes: '', categories: [] };
    const dir = { label: 'Casa', street: '', city: '', region: '', zip: '', country: '' };
    campos.forEach((campo, k) => {
      const v = String(f[k] == null ? '' : f[k]).trim(); if (!campo || !v) return;
      if (campo === 'completo') { const p = v.split(/\s+/); c.first = p.shift(); c.last = p.join(' '); }
      else if (campo === 'phone') c.phones.push({ label: 'Móvil', value: v });
      else if (campo === 'email') c.emails.push({ label: 'Personal', value: v });
      else if (campo === 'website') c.websites.push({ label: 'Personal', value: v });
      else if (campo === 'birthday') { const d = fecha(v); if (d) c.dates.push({ label: 'Cumpleaños', date: d }); }
      else if (campo === 'labels') c.categories.push(...lista(v));
      else if (campo === 'notes') c.notes += (c.notes ? '\n' : '') + v;
      else if (campo in dir) dir[campo] = v;
      else c[campo] = c[campo] ? c[campo] + ' ' + v : v;
    });
    if (dir.street || dir.city || dir.region || dir.zip || dir.country) c.addresses.push(dir);
    out.push(c);
  }
  return out;
}

module.exports = { CAMPOS, sugiere, aContactos };
