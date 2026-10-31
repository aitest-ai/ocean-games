import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initLayout} from '../src/teeball/layout-ui.js';
function fixture(){
 const selectors=new Map(), ids=new Map();
 class Node{
  constructor(){this.children=[];this.dataset={};this.attrs={};this.events={};this.open=false;const values=new Set();this.classList={add:v=>values.add(v),toggle:(v,on)=>on?values.add(v):values.delete(v),contains:v=>values.has(v)};}
  append(node){if(node.parentElement)node.parentElement.children=node.parentElement.children.filter(n=>n!==node);this.children.push(node);node.parentElement=this;}
  insertBefore(node,before){this.append(node);this.children.splice(this.children.indexOf(node),1);this.children.splice(this.children.indexOf(before),0,node);}
  after(node){this.parentElement.append(node);}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,fn){this.events[k]=fn;}
 }
 const body=new Node(),main=new Node();body.append(main);
 const add=(selector,parent=main)=>{const n=new Node();selectors.set(selector,n);if(selector.startsWith('#'))ids.set(selector.slice(1),n);parent.append(n);return n;};
 const workspace=add('.workspace'), field=add('.field-panel',workspace),viewport=add('.world-viewport',field),canvas=add('#world',viewport);
 add('.view-controls',viewport);const controls=add('.controls');
 for(const id of ['pause','stopCamera','camera','calibrate'])add('#'+id,controls);
 add('.modes');add('.play-selector');const panel=add('#actionPanel',workspace);
 for(const selector of ['#actionDescription','#actionHint','.action-diagram','.simulation-note'])add(selector,panel);
 return {body,main,canvas,viewport,field,workspace,ids,selectors,doc:{body,getElementById:id=>ids.get(id),querySelector:s=>selectors.get(s),createElement:()=>new Node()}};
}
test('field layout moves all interactive overlays outside canvas while preserving safety button identity',()=>{
 const h=fixture(), pause=h.ids.get('pause');pause.onclick=()=>17;
 initLayout({doc:h.doc});
 assert.equal(pause.onclick(),17);assert.equal(pause.parentElement.parentElement.id,'playToolbar');
 assert.equal(h.selectors.get('.view-controls').parentElement.id,'playToolbar');
 assert.deepEqual(h.viewport.children,[h.canvas]);
 const drawer=h.main.children.find(n=>n.id==='teacherDrawer');assert.ok(drawer);
 assert.equal(h.selectors.get('.controls').parentElement,drawer.children[1]);
 assert.notEqual(pause.parentElement,drawer.children[1]);
 assert.equal(h.body.classList.contains('field-first'),true);
});
test('opening teacher drawer pauses once per toggle; closing never resumes',()=>{
 const h=fixture(),messages=[];const layout=initLayout({doc:h.doc,requestPause:m=>messages.push(m)});
 const drawer=h.main.children.find(n=>n.id==='teacherDrawer');
 drawer.open=true;drawer.events.toggle();assert.equal(layout.isOpen(),true);assert.equal(messages.length,1);
 layout.close();drawer.events.toggle();assert.equal(messages.length,1);assert.equal(layout.isOpen(),false);
 layout.setImmersive(true);assert.equal(h.body.classList.contains('immersive-play'),true);
 layout.setView('overview');assert.equal(h.body.dataset.fieldView,'overview');
});
test('CSS contract: canvas width is not reduced by panels in portrait or landscape',()=>{
 const css=readFileSync(new URL('../src/teeball/style.css',import.meta.url),'utf8').split('/* Field-first classroom layout.')[1];
 assert.match(css,/body\.field-first \.workspace\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/body\.field-first \.question-panel\{position:static/);
 assert.match(css,/body\.field-first \.safety-controls,body\.field-first \.view-controls\{[^}]*position:static/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/@media\(max-height:600px\) and \(orientation:landscape\)/);
 assert.doesNotMatch(css,/position:(absolute|fixed)/);
});
test('reflow keeps scene camera aspect and pointer mapping anchored to actual canvas rectangle',()=>{
 const scene=readFileSync(new URL('../src/teeball/scene.js',import.meta.url),'utf8');
 assert.match(scene,/new ResizeObserver\(\(\)=>this.fit\(\)\)/);
 assert.match(scene,/camera.aspect=r.width\/r.height/);
 assert.match(scene,/canvas.getBoundingClientRect\(\)/);
 assert.match(scene,/e.clientX-r.left/);assert.match(scene,/e.clientY-r.top/);
});
test('drawer open blocks resume, keyboard, and both pose/action input paths',()=>{
 const app=readFileSync(new URL('../src/teeball/app.js',import.meta.url),'utf8');
 assert.equal((app.match(/active:!\$\('help'\)\.open&&!layout\?\.isOpen\(\)/g)||[]).length,2);
 assert.match(app,/paused&&\(layout\?\.isOpen\(\)\|\|\$\('help'\)\.open\)/);
 assert.match(app,/\|\|layout\?\.isOpen\(\)\|\|paused\|\|e.repeat/);
});
