'use strict';
/* Dibujo vectorial normalizado: ratón, lápiz y táctil; guarda trazos editables. */
(function(){
  const root=document.getElementById('view-dibujos'); if(!root)return;
  let items=[], actual=null, trazos=[], activo=null, ctx=null, canvas=null;
  const $=s=>root.querySelector(s);
  const aviso=e=>K.fail(e);
  const limpia=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f7f6f2';ctx.fillRect(0,0,canvas.width,canvas.height);};
  function pintar(){
    if(!ctx)return;limpia();for(const t of trazos){if(!t.puntos.length)continue;ctx.strokeStyle=t.color;ctx.fillStyle=t.color;ctx.lineWidth=t.grosor;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();t.puntos.forEach(([x,y],i)=>i?ctx.lineTo(x*canvas.width,y*canvas.height):ctx.moveTo(x*canvas.width,y*canvas.height));if(t.puntos.length===1){ctx.arc(t.puntos[0][0]*canvas.width,t.puntos[0][1]*canvas.height,t.grosor/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();}
  }
  function punto(e){const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];}
  function elegir(item){actual=item||null;trazos=item?structuredClone(item.contenido):[];$('#cr-d-title').value=item?.titulo||'';pintar();}
  function lista(){const box=$('#cr-d-list');box.replaceChildren();for(const item of items){const b=document.createElement('button');b.textContent=item.titulo;b.onclick=()=>elegir(item);const wrap=document.createElement('div');wrap.className='cr-item';wrap.append(b);box.append(wrap);}}
  async function cargar(){try{items=(await K.get('/api/creativos/dibujos')).items;lista();if(actual){const found=items.find(x=>x.id===actual.id);elegir(found);}else if(items.length)elegir(items[0]);else elegir(null);}catch(e){aviso(e);}}
  root.innerHTML='<div class="cr-wrap"><header class="cr-head"><h2>Dibujos a mano alzada</h2><span>Cuaderno creativo</span></header><div class="cr-tools"><button id="cr-d-new">Nuevo</button><input id="cr-d-title" maxlength="120" placeholder="Título del dibujo" aria-label="Título"><label>Color <input id="cr-d-color" type="color" value="#303030"></label><label>Grosor <input id="cr-d-width" type="range" min="1" max="48" value="5"></label><button id="cr-d-undo">Deshacer</button><button id="cr-d-save">Guardar</button><button id="cr-d-export">PNG</button><button id="cr-d-delete">Eliminar</button></div><div id="cr-d-list" class="cr-list"></div><canvas class="cr-canvas" id="cr-d-canvas" width="1200" height="750" aria-label="Superficie de dibujo"></canvas></div>';
  canvas=$('#cr-d-canvas');ctx=canvas.getContext('2d');pintar();
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;canvas.setPointerCapture(e.pointerId);activo={color:$('#cr-d-color').value,grosor:Number($('#cr-d-width').value),puntos:[punto(e)]};trazos.push(activo);pintar();});
  canvas.addEventListener('pointermove',e=>{if(!activo)return;activo.puntos.push(punto(e));pintar();});
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(ev,()=>{activo=null;});
  $('#cr-d-new').onclick=()=>elegir(null);
  $('#cr-d-undo').onclick=()=>{trazos.pop();pintar();};
  $('#cr-d-save').onclick=async()=>{try{const payload={titulo:$('#cr-d-title').value,contenido:trazos};const url='/api/creativos/dibujos'+(actual?'/'+encodeURIComponent(actual.id):'');await (actual?K.put(url,payload):K.post(url,payload));K.toast('Dibujo guardado');await cargar();}catch(e){aviso(e);}};
  $('#cr-d-delete').onclick=async()=>{if(!actual||!confirm('¿Eliminar este dibujo?'))return;try{await K.del('/api/creativos/dibujos/'+encodeURIComponent(actual.id));actual=null;await cargar();}catch(e){aviso(e);}};
  $('#cr-d-export').onclick=()=>{const a=document.createElement('a');a.download='dibujo.png';a.href=canvas.toDataURL('image/png');a.click();};
  K.registerView('dibujos',{open:cargar,close(){}});
})();
