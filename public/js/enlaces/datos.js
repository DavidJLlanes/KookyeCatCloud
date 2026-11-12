'use strict';
/* Enlaces · datos y utilidades de la zona «Enlaces», donde se ven y se gestionan todos los enlaces creados (todo cuelga de K.enlaces). */
(function () {
  if (!window.K) return;
  const E = K.enlaces = { S: { links: [], q: '', tipo: 'todos', estado: 'todos', cargado: false } };
  E.TIPOS = [['todos', 'Todos'], ['share', 'Descarga'], ['upload', 'Subida'], ['prompts', 'Prompts']];
  E.ESTADOS = [['todos', 'Todos'], ['activos', 'Activos'], ['caducados', 'Caducados'], ['perpetuos', 'Sin caducidad']];
  E.NOMBRE = { share: 'Descarga', upload: 'Subida', prompts: 'Prompts' };
  E.ICONO = { share: 'i-share', upload: 'i-upload', prompts: 'i-sparkle' };
  E.PLAZOS = [['0.0417', '1 hora'], ['1', '1 día'], ['7', '7 días'], ['30', '30 días'], ['90', '90 días'], ['365', '1 año'], ['0', 'Sin caducidad'], ['otro', 'Otro plazo…']];

  const base = () => (document.querySelector('meta[name="kcc-base"]') || {}).content || '';
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  E.norm = norm;
  // Dirección pública de cada tipo: descarga = corta (/cloud/<12>), subida = /u/<id>, prompts = /p/<id>
  E.urlDe = (l) => {
    const o = location.origin + base();
    if (l.kind === 'share') return `${o}/${String(l.id).length === 12 ? '' : 's/'}${l.id}`;
    return `${o}/${l.kind === 'prompts' ? 'p' : 'u'}/${l.id}`;
  };
  const fecha = (t) => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  E.fecha = fecha;
  E.caducidadTxt = (l) => {
    if (!l.expiresAt) return 'Sin caducidad';
    if (l.expired) return 'Caducó el ' + fecha(l.expiresAt);
    const h = (l.expiresAt - Date.now()) / 3600000;
    if (h < 1) return 'Caduca en menos de una hora';
    if (h < 48) return `Caduca en ${Math.round(h)} horas`;
    return `Caduca el ${fecha(l.expiresAt)} (${Math.round(h / 24)} días)`;
  };
  E.tamano = (n) => (n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : (n || 0) + ' B');
  // Lo que el enlace da o recibe, en una línea
  E.usoTxt = (l) => {
    if (l.kind === 'share') return `${l.downloads || 0} descarga${l.downloads === 1 ? '' : 's'}`;
    if (l.kind === 'prompts') return `${l.views || 0} visita${l.views === 1 ? '' : 's'}`;
    return `${l.files || 0} archivo${l.files === 1 ? '' : 's'} recibido${l.files === 1 ? '' : 's'}${l.bytes ? ' · ' + E.tamano(l.bytes) : ''}`;
  };
  E.destinoTxt = (l) => {
    if (l.kind === 'share') return (l.album ? 'Álbum · ' : l.isDir ? 'Carpeta · ' : 'Archivo · ') + (l.path || l.label);
    if (l.kind === 'prompts') return `${(l.ids || []).length} prompt${(l.ids || []).length === 1 ? '' : 's'}`;
    return 'Destino: ' + (l.path || 'Inicio');
  };

  E.visibles = () => {
    const q = norm(E.S.q);
    return E.S.links.filter(l => {
      if (E.S.tipo !== 'todos' && l.kind !== E.S.tipo) return false;
      if (E.S.estado === 'activos' && l.expired) return false;
      if (E.S.estado === 'caducados' && !l.expired) return false;
      if (E.S.estado === 'perpetuos' && l.expiresAt) return false;
      return !q || [l.label, l.path, l.id, E.NOMBRE[l.kind]].some(t => norm(t).includes(q));
    }).sort((a, b) => (a.expired ? 1 : 0) - (b.expired ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0));
  };
  E.cuentas = () => {
    const L = E.S.links;
    return {
      activos: L.filter(l => !l.expired).length, caducados: L.filter(l => l.expired).length,
      descargas: L.reduce((a, l) => a + (l.kind === 'share' ? (l.downloads || 0) : 0), 0),
      recibidos: L.reduce((a, l) => a + (l.kind === 'upload' ? (l.files || 0) : 0), 0),
      perpetuos: L.filter(l => !l.expiresAt && !l.expired).length,
    };
  };

  E.logros = K.debounce(() => { if (K.game && K.game.load) K.game.load(); }, 500);
  E.carga = async () => { E.S.links = await K.get('/api/uploadlinks'); E.S.cargado = true; };
})();
