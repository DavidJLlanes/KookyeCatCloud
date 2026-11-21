'use strict';
/* Dibujo vectorial normalizado: ratón, lápiz y táctil; guarda trazos editables. */
(function(){
  const root=document.getElementById('view-dibujos'); if(!root)return;
  let items=[], actual=null, trazos=[], rehacer=[], activo=null, ctx=null, canvas=null, loaded=false, saving=false, snapshot='';
  const $=s=>root.querySelector(s);
  const aviso=e=>K.fail(e);
  const limpia=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f7f6f2';ctx.fillRect(0,0,canvas.width,canvas.height);};
  function pintar(){
    if(!ctx)return;limpia();for(const t of trazos){if(!t.puntos.length)continue;ctx.strokeStyle=t.color;ctx.fillStyle=t.color;ctx.lineWidth=t.grosor;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();t.puntos.forEach(([x,y],i)=>i?ctx.lineTo(x*canvas.width,y*canvas.height):ctx.moveTo(x*canvas.width,y*canvas.height));if(t.puntos.length===1){ctx.arc(t.puntos[0][0]*canvas.width,t.puntos[0][1]*canvas.height,t.grosor/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();}
  }
  function punto(e){const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];}
  const estado=()=>JSON.stringify({titulo:$('#cr-d-title').value.trim(),contenido:trazos});
  const sucio=()=>estado()!==snapshot;
  function estadoUI(mensaje){$('#cr-d-status').textContent=mensaje||(sucio()?'Cambios sin guardar':actual?'Guardado':'Nuevo dibujo');$('#cr-d-undo').disabled=!trazos.length;$('#cr-d-redo').disabled=!rehacer.length;$('#cr-d-delete').disabled=!actual;$('#cr-d-count').textContent=trazos.length+' '+(trazos.length===1?'trazo':'trazos');}
  function elegir(item,forzar=false){if(!forzar&&sucio()&&!confirm('Hay cambios sin guardar. ¿Descartarlos?'))return;actual=item||null;trazos=item?structuredClone(item.contenido||[]):[];rehacer=[];$('#cr-d-title').value=item?.titulo==='Sin título'?'':item?.titulo||'';snapshot=estado();lista();pintar();}
  function lista(){const box=$('#cr-d-list');box.replaceChildren();if(!items.length){const p=document.createElement('p');p.className='cr-d-empty';p.textContent='Todavía no hay dibujos guardados.';box.append(p);}for(const item of items){const b=document.createElement('button');b.type='button';b.className='cr-d-gallery-item'+(actual?.id===item.id?' is-active':'');b.textContent=item.titulo||'Sin título';b.setAttribute('aria-current',String(actual?.id===item.id));b.onclick=()=>elegir(item);box.append(b);}}
  async function cargar(){if(loaded&&sucio())return;try{items=(await K.get('/api/creativos/dibujos')).items||[];loaded=true;elegir(items.find(x=>x.id===actual?.id)||items[0]||null,true);}catch(e){aviso(e);}}
  root.innerHTML='<div class="cr-wrap cr-dibujos"><header class="cr-head"><div><h2>Dibujos</h2><p class="cr-sub">Tu cuaderno creativo</p></div><button class="btn primary" type="button" id="cr-d-new">+ Nuevo dibujo</button></header><div class="cr-d-layout"><aside class="cr-d-sidebar"><h3>Mi galería</h3><div id="cr-d-list" class="cr-d-list"></div></aside><section class="cr-d-workspace" aria-label="Editor de dibujo"><div class="cr-d-top"><label for="cr-d-title">Nombre del dibujo</label><input id="cr-d-title" maxlength="120" placeholder="Dibujo sin título"><span id="cr-d-status" role="status"></span></div><div class="cr-d-tools"><label>Color <input id="cr-d-color" type="color" value="#303030"></label><label>Grosor <input id="cr-d-width" type="range" min="1" max="48" value="5"><output id="cr-d-width-value">5 px</output></label><button class="btn" type="button" id="cr-d-eraser" aria-pressed="false">Borrador</button></div><div class="cr-d-paper"><canvas class="cr-canvas" id="cr-d-canvas" width="1200" height="750" aria-label="Superficie de dibujo"></canvas></div><div class="cr-d-footer"><div><button class="btn" type="button" id="cr-d-undo">Deshacer</button><button class="btn" type="button" id="cr-d-redo">Rehacer</button><span id="cr-d-count"></span></div><div><button class="btn" type="button" id="cr-d-export">Descargar PNG</button><button class="btn cr-d-delete" type="button" id="cr-d-delete">Eliminar</button><button class="btn primary" type="button" id="cr-d-save">Guardar dibujo</button></div></div></section></div></div>';
  canvas=$('#cr-d-canvas');ctx=canvas.getContext('2d');pintar();
  let borrador=false;
  $('#cr-d-title').addEventListener('input',()=>estadoUI());
  $('#cr-d-width').addEventListener('input',()=>{$('#cr-d-width-value').value=$('#cr-d-width').value+' px';});
  $('#cr-d-eraser').onclick=()=>{borrador=!borrador;$('#cr-d-eraser').setAttribute('aria-pressed',String(borrador));};
  $('#cr-d-color').addEventListener('input',()=>{borrador=false;$('#cr-d-eraser').setAttribute('aria-pressed','false');});
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0||saving)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);activo={pointerId:e.pointerId,color:borrador?'#f7f6f2':$('#cr-d-color').value,grosor:Number($('#cr-d-width').value),puntos:[punto(e)]};trazos.push(activo);rehacer=[];pintar();estadoUI();});
  canvas.addEventListener('pointermove',e=>{if(!activo||e.pointerId!==activo.pointerId)return;for(const sample of e.getCoalescedEvents?.()||[e])activo.puntos.push(punto(sample));pintar();});
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(ev,e=>{if(activo?.pointerId===e.pointerId)activo=null;});
  $('#cr-d-new').onclick=()=>elegir(null);
  $('#cr-d-undo').onclick=()=>{if(trazos.length){rehacer.push(trazos.pop());pintar();estadoUI();}};
  $('#cr-d-redo').onclick=()=>{if(rehacer.length){trazos.push(rehacer.pop());pintar();estadoUI();}};
  $('#cr-d-save').onclick=async()=>{if(saving)return;if(!trazos.length&&!actual){K.toast('Dibuja algo antes de guardar');return;}saving=true;$('#cr-d-save').disabled=true;estadoUI('Guardando…');const payload={titulo:$('#cr-d-title').value.trim()||'Sin título',contenido:structuredClone(trazos)},version=estado();try{const url='/api/creativos/dibujos'+(actual?'/'+encodeURIComponent(actual.id):'');const saved=await (actual?K.put(url,payload):K.post(url,payload));actual=saved.item;const i=items.findIndex(x=>x.id===actual.id);if(i<0)items.unshift(actual);else items[i]=actual;snapshot=version;lista();K.toast('Dibujo guardado');}catch(e){aviso(e);}finally{saving=false;$('#cr-d-save').disabled=false;estadoUI();}};
  $('#cr-d-delete').onclick=async()=>{if(!actual||!confirm('¿Eliminar este dibujo?'))return;try{await K.del('/api/creativos/dibujos/'+encodeURIComponent(actual.id));items=items.filter(x=>x.id!==actual.id);elegir(items[0]||null,true);K.toast('Dibujo eliminado');}catch(e){aviso(e);}};
  $('#cr-d-export').onclick=()=>{const a=document.createElement('a');a.download=($('#cr-d-title').value.trim()||'dibujo').replace(/[\\/:*?"<>|]/g,'-')+'.png';a.href=canvas.toDataURL('image/png');a.click();};
  estadoUI();
  K.registerView('dibujos',{open:cargar,close(){}});
})();
