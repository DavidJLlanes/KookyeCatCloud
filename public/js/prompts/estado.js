'use strict';
/* estado: parte de la biblioteca de prompts (ver prompts/estado.js). Comparte el espacio K._prompts. */
(function () {
  const C = (K._prompts = K._prompts || {});

  const KIND_BASE = [
    { id: 'imagen', name: 'Imagen', icon: 'i-image' }, { id: 'texto', name: 'Texto', icon: 'i-doc' },
    { id: 'codigo', name: 'Código', icon: 'i-bars' }, { id: 'video', name: 'Vídeo', icon: 'i-play' },
    { id: 'audio', name: 'Audio', icon: 'i-music' }, { id: 'agente', name: 'Agente', icon: 'i-sparkle' },
    { id: 'fragmento', name: 'Fragmento', icon: 'i-tag' }, { id: 'otro', name: 'Otro', icon: 'i-stack' },
  ];
  const KIND_ICONS = [
    ['i-image', 'Imagen'], ['i-doc', 'Documento'], ['i-bars', 'Código'], ['i-play', 'Vídeo'], ['i-music', 'Audio'],
    ['i-sparkle', 'Destello'], ['i-tag', 'Etiqueta'], ['i-stack', 'Capas'], ['i-folder', 'Carpeta'], ['i-note', 'Nota'],
    ['i-server', 'Servidor'], ['i-monitor', 'Pantalla'], ['i-globe', 'Web'], ['i-mail', 'Correo'], ['i-calendar', 'Calendario'],
    ['i-palette', 'Paleta'], ['i-activity', 'Actividad'], ['i-cloud', 'Nube'], ['i-key', 'Llave'], ['i-link', 'Enlace'],
    ['i-shield', 'Escudo'], ['i-user', 'Usuario'], ['i-users', 'Usuarios'], ['i-zip', 'Archivo ZIP'], ['i-check', 'Correcto'],
    ['i-star', 'Estrella'], ['i-pin', 'Fijado'], ['i-cart', 'Compra'],
  ];
  const PRO = () => (K.prompts && K.prompts.pro) || null;
  const STATUS = { borrador: 'Borrador', probando: 'Probando', final: 'Final', archivado: 'Archivado' };
  const SORTS = [['updated', 'Modificados recientemente'], ['created', 'Más nuevos'], ['oldest', 'Más antiguos'], ['title', 'Título A-Z'],
    ['rating', 'Mejor valorados'], ['uses', 'Más usados']];

  const S = {
    built: false, M: null, items: [], total: 0, page: 1, pages: 1, loading: 0,
    q: { q: '', category: '', list: '', kind: '', status: '', model: '', tool: '', language: '', fav: false, minRating: 0, images: '', cal: false, from: '', to: '', trash: false, sort: 'updated' },
    labels: new Set(), view: 'grid', sel: new Set(), selMode: false, modelsAll: false, toolsAll: false,
  };
  try { S.view = localStorage.getItem('kcc-pr-view') || 'grid'; S.q.sort = localStorage.getItem('kcc-pr-sort') || 'updated'; } catch {}
  const R = {};
  const imgUrl = (pid, iid, thumb) => `${BASE}/api/prompts/${pid}/img/${iid}${thumb ? '?thumb=1' : ''}`;
  const kindDefs = () => {
    const saved = S.M && Array.isArray(S.M.kindDefs) ? S.M.kindDefs : [];
    const byId = new Map(saved.filter(k => k && typeof k === 'object' && typeof k.id === 'string').map(k => [k.id, k]));
    return KIND_BASE.map(base => {
      const k = byId.get(base.id);
      const storedName = k && typeof k.name === 'string' ? k.name.trim() : '';
      const name = storedName && !/^(?:false|true|null|undefined)$/i.test(storedName) ? storedName : base.name;
      const icono = k && KIND_ICONS.some(([id]) => id === k.icon) ? k.icon : base.icon;
      return { ...base, name, icon: icono };
    });
  };
  const kindBy = (id) => kindDefs().find(k => k.id === id) || { id, name: id || 'Otro', icon: 'i-stack' };
  const catBy = (id) => (S.M ? S.M.categories.find(c => c.id === id) : null);
  const listBy = (id) => (S.M ? S.M.lists.find(c => c.id === id) : null);
  const colorOf = (p) => p.color || (catBy(p.category) && catBy(p.category).color) || 'transparent';


  Object.assign(C, { KIND_BASE, KIND_ICONS, PRO, STATUS, SORTS, S, R, imgUrl, kindDefs, kindBy, catBy, listBy, colorOf });
})();
