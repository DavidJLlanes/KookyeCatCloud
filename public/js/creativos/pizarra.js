'use strict';
/* Post-its con editor enriquecido. Sanitización por lista blanca antes de guardar y pintar. */
(function(){
 const root=document.getElementById('view-pizarra');if(!root)return;
 const colores=['crema','amarillo','rosa','menta','azul','lavanda'];
 const permitidos=new Set(['DIV','P','BR','H1','H2','H3','B','STRONG','I','EM','U','S','UL','OL','LI','BLOCKQUOTE','SPAN']);
 function limpiar(html){
   const doc=new DOMParser().parseFromString('<div>'+html+'</div>','text/html');
   const walk=node=>{for(const child of [...node.childNodes]){if(child.nodeType===8){child.remove();continue;}if(child.nodeType!==1)continue;
     if(!permitidos.has(child.tagName)){const span=doc.createElement('span');span.textContent=child.textContent||'';child.replaceWith(span);continue;}
     for(const attr of [...child.attributes])child.removeAttribute(attr.name);
     walk(child);
   }};
   const box=doc.body.firstElementChild;walk(box);return box.innerHTML.slice(0,100000);
 }
 let items=[];
 const $=s=>root.querySelector(s);
 root.innerHTML='<div class="cr-wrap"><header class="cr-head"><h2>Pizarra de notas</h2><button id="cr-p-new" class="btn primary">+ Nueva nota</button></header><p>Notas de colores con títulos, listas y formato de texto.</p><div id="cr-p-board" class="cr-board"></div></div>';
 const board=$('#cr-p-board');
 function boton(texto,accion){const b=document.createElement('button');b.type='button';b.textContent=texto;b.onclick=accion;return b;}
 function crear(item){
  const card=document.createElement('article');card.className='cr-postit';card.dataset.color=item.color;
  const title=document.createElement('input');title.value=item.titulo;title.maxLength=120;title.setAttribute('aria-label','Título de nota');
  const toolbar=document.createElement('div');toolbar.className='cr-tools';
  const editor=document.createElement('div');editor.contentEditable='true';editor.setAttribute('role','textbox');editor.setAttribute('aria-label','Texto de la nota');editor.innerHTML=limpiar(item.contenido);
  const formato=(cmd,value)=>{editor.focus();document.execCommand(cmd,false,value);};
  const heading=document.createElement('select');for(const [value,label] of [['p','Párrafo'],['h1','H1'],['h2','H2'],['h3','H3']]){const o=document.createElement('option');o.value=value;o.textContent=label;heading.append(o);}heading.onchange=()=>formato('formatBlock',heading.value);toolbar.append(heading);
  for(const [label,cmd] of [['N','bold'],['I','italic'],['U','underline'],['S','strikeThrough'],['•','insertUnorderedList'],['1.','insertOrderedList'],['←','justifyLeft'],['↔','justifyCenter'],['→','justifyRight']])toolbar.append(boton(label,()=>formato(cmd)));
  const color=document.createElement('select');for(const c of colores){const o=document.createElement('option');o.value=c;o.textContent=c;color.append(o);}color.value=item.color;color.onchange=()=>{card.dataset.color=color.value;guardar();};
  const actions=document.createElement('div');actions.className='cr-tools';
  async function guardar(){try{const payload={titulo:title.value,color:color.value,contenido:limpiar(editor.innerHTML)};const r=await K.put('/api/creativos/pizarra/'+encodeURIComponent(item.id),payload);Object.assign(item,r.item);K.toast('Nota guardada');}catch(e){K.fail(e);}}
  actions.append(color,boton('Guardar',guardar),boton('Eliminar',async()=>{if(!confirm('¿Eliminar esta nota?'))return;try{await K.del('/api/creativos/pizarra/'+encodeURIComponent(item.id));card.remove();}catch(e){K.fail(e);}}));
  card.append(title,toolbar,editor,actions);return card;
 }
 async function cargar(){try{items=(await K.get('/api/creativos/pizarra')).items;board.replaceChildren(...items.map(crear));}catch(e){K.fail(e);}}
 $('#cr-p-new').onclick=async()=>{try{const r=await K.post('/api/creativos/pizarra',{titulo:'Nueva nota',color:'amarillo',contenido:''});items.push(r.item);const node=crear(r.item);board.prepend(node);node.querySelector('input').focus();}catch(e){K.fail(e);}};
 K.registerView('pizarra',{open:cargar,close(){}});
})();
