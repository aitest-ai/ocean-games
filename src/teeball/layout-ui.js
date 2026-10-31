// Keep every interactive panel outside the canvas' measured rectangle.
// Moving existing nodes preserves their handlers and unique accessible IDs.
export function initLayout({requestPause, doc=document}={}) {
 const $=id=>doc.getElementById(id);
 const workspace=doc.querySelector('.workspace');
 const field=doc.querySelector('.field-panel');
 const viewport=doc.querySelector('.world-viewport');
 const toolbar=doc.createElement('div');
 toolbar.id='playToolbar';toolbar.className='play-toolbar';
 toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','遊戲安全與視角控制');
 const safe=doc.createElement('div');safe.className='safety-controls';
 for(const id of ['pause','stopCamera','camera','calibrate']) if($(id))safe.append($(id));
 toolbar.append(safe);
 const views=doc.querySelector('.view-controls');if(views)toolbar.append(views);
 field.insertBefore(toolbar,viewport);
 const drawer=doc.createElement('details');drawer.id='teacherDrawer';drawer.className='teacher-drawer';
 const summary=doc.createElement('summary');summary.textContent='教師控制與詳細操作（開啟會暫停）';drawer.append(summary);
 const content=doc.createElement('div');content.className='teacher-drawer-content';drawer.append(content);
 for(const selector of ['.play-selector','.modes','.controls']){
  const node=doc.querySelector(selector);if(node)content.append(node);
 }
 const instructions=doc.createElement('section');instructions.className='action-instructions';instructions.setAttribute('aria-label','動作詳細說明');
 for(const selector of ['#actionDescription','#actionHint','.action-diagram','.simulation-note']){
  const node=doc.querySelector(selector);if(node)instructions.append(node);
 }
 content.append(instructions);workspace.after(drawer);
 drawer.addEventListener('toggle',()=>{if(drawer.open)requestPause?.('教師控制開啟中，球與跑者已暫停。收起後請按繼續。');});
 doc.body.classList.add('field-first');
 return {
  setImmersive(value){doc.body.classList.toggle('immersive-play',!!value);},
  setView(view){doc.body.dataset.fieldView=view;},
  close(){drawer.open=false;},
  isOpen(){return drawer.open;}
 };
}
