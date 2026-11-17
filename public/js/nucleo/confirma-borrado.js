'use strict';
/* «Se va a borrar algo que tiene fecha en el calendario o un aviso pendiente: ¿se borra también?»
   K.confirmaBorrado(items, texto, { ok, title }) -> Promise<boolean>
     items: [{ type, ref }] (type: note, contact, file, prompt, game, pago…; ref: su id o su ruta)
     true  = seguir con el borrado (y, si se eligió conservar, los eventos y avisos ya han quedado sueltos)
     false = cancelado
   Si no cuelga nada de lo que se borra, es una confirmación normal. Si no se puede consultar el calendario, también:
   el borrado no se bloquea por eso. Va después de kit.js. */
(function () {
  if (!window.K) return;
  const MAX_LISTA = 5;
  const NOMBRE = { evento: 'Evento', tarea: 'Tarea', recordatorio: 'Recordatorio' };

  function cuando(c) {
    if (!c) return '';
    const d = new Date(c.length > 10 ? c : c + 'T12:00:00');
    if (isNaN(d)) return '';
    return c.length > 10 ? K.d.short(d) + ' ' + d.toTimeString().slice(0, 5) : K.d.short(d);
  }

  // El servidor mira hasta 500 elementos por llamada: una selección grande se manda por trozos
  const trozos = (items) => { const t = []; for (let i = 0; i < items.length; i += 500) t.push(items.slice(i, i + 500)); return t; };

  K.confirmaBorrado = async function (items, texto, { ok = 'Eliminar', title = 'Confirmar' } = {}) {
    let colgando = [];
    try { for (const t of trozos(items)) colgando.push(...((await K.post('/api/calendar/dependientes', { items: t })).items || [])); } catch { colgando = []; }
    if (!colgando.length) return K.confirm(texto, { ok, danger: true, title });

    return new Promise((res) => {
      let hecho = false;
      const caja = el('div', 'cb-lista');
      caja.appendChild(el('p', 'k-faint', colgando.length === 1 ? 'Tiene esto en el calendario o como aviso:' : `Tiene ${colgando.length} cosas en el calendario o como aviso:`));
      const ul = el('ul', 'cb-items');
      for (const c of colgando.slice(0, MAX_LISTA)) {
        const li = el('li'); li.append(el('b', null, (NOMBRE[c.tipo] || 'Evento') + ': '), document.createTextNode(c.titulo || '(sin título)'));
        if (cuando(c.cuando)) li.append(el('span', 'k-faint', ' · ' + cuando(c.cuando)));
        ul.appendChild(li);
      }
      if (colgando.length > MAX_LISTA) ul.appendChild(el('li', 'k-faint', `y ${colgando.length - MAX_LISTA} más`));
      caja.appendChild(ul);
      const marca = el('label', 'k-switch'); const chk = el('input'); chk.type = 'checkbox'; chk.checked = true;
      marca.append(chk, el('span', 'track'), el('span', null, 'Borrarlo también del calendario y de los avisos'));
      caja.appendChild(marca);
      caja.appendChild(el('p', 'k-faint cb-nota', 'Si lo desmarcas, se quedan en el calendario como eventos sueltos.'));

      K.modal({
        title, sub: texto, content: caja, onClose: () => { if (!hecho) res(false); },
        actions: [{ label: 'Cancelar' }, {
          label: ok, danger: true,
          onClick: async () => {
            if (!chk.checked) {
              try { for (const t of trozos(items)) await K.post('/api/calendar/desvincula', { items: t }); } catch (e) { K.fail(e); return false; }   // sin dejarlos sueltos no se borra: mejor avisar que perderlos
            }
            hecho = true; res(true);
          },
        }],
      });
    });
  };
})();
