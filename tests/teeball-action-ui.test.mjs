import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ActionUI} from '../src/teeball/action-ui.js';
import {CONTACT_REGION} from '../src/teeball/action-logic.js';

// Controller contract tests: real engine/UI modules, minimal DOM, no GPU/camera claims.
function harness(){
 const ids=new Map();
 class Element{
  constructor(){this.dataset={};this.attributes={};this.parentElement={};this.hidden=false;this.textContent='';this.children=[];}
  set innerHTML(html){this.html=html;for(const m of html.matchAll(/<[^>]+>/g)){const tag=m[0],e=new Element();const id=tag.match(/id="([^"]+)"/);if(id)ids.set(id[1],e);for(const a of tag.matchAll(/data-(\w+)="([^"]*)"/g))e.dataset[a[1]]=a[2];if(/<button/.test(tag))this.children.push(e);}}
  querySelectorAll(selector){const key=selector.match(/data-(\w+)/)?.[1];return this.children.filter(e=>key in e.dataset);}
  setAttribute(k,v){this.attributes[k]=v;}
  closest(){return {before(){}};}
 }
 ids.set('choices',new Element());globalThis.document={getElementById:id=>ids.get(id),createElement:()=>new Element()};
 let camera=false,paused=false,stops=0;const frames=[];const world={reset(){},setAction:s=>frames.push(s)};
 const ui=new ActionUI({world,isCamera:()=>camera,isPaused:()=>paused,stopCamera:()=>{camera=false;stops++;},feedback(){},requestPause(){paused=true;ui.setPaused(true);}});
 ui.render();
 return {ui,ids,frames,button:(key,val)=>ui.panel.children.find(e=>e.dataset[key]===val),pause(v){paused=v;ui.setPaused(v);},camera(v){camera=v;},get stops(){return stops;}};
}
function key(ui,code){let prevented=false;ui.key({code,preventDefault(){prevented=true;}});assert.ok(prevented);}
function finish(ui){for(let i=0;i<100;i++)ui.tick(.05);}
test('UI touch buttons perform full batting stages; no ready-only or load-only hit',()=>{
 const h=harness();h.button('action','ready').onclick();assert.equal(h.ui.engine.stage,'ready');assert.equal(h.ui.engine.result,null);
 h.button('action','load').onclick();assert.equal(h.ui.engine.stage,'loaded');assert.equal(h.ui.engine.result,null);
 h.button('action','swing').onclick();assert.equal(h.ui.engine.result.outcome,'contact');assert.equal(h.ui.engine.result.simulated,true);finish(h.ui);
 assert.match(h.ids.get('actionResult').textContent,/模擬輸入/);assert.equal(h.ids.get('actionReplay').hidden,false);
});
test('UI keyboard supports fielding correct-fast, correct-late and wrong-base outcomes',()=>{
 for(const [direction,delay,outcome] of [['ArrowUp',.1,'correct-fast'],['ArrowUp',2,'correct-late'],['ArrowRight',.1,'wrong']]){
  const h=harness();h.button('round','fielding').onclick();key(h.ui,'KeyR');key(h.ui,direction);h.ui.tick(delay);key(h.ui,'KeyC');key(h.ui,'Space');
  assert.equal(h.ui.engine.result.outcome,outcome);assert.equal(h.ui.engine.result.simulated,true);assert.ok(!h.ids.get('actionThrowControls').hidden);assert.ok(h.ids.get('actionBatControls').hidden);
 }
});
test('UI pause freezes runner and replay; resume requires new readiness before release',()=>{
 const h=harness();h.ui.start('fielding');key(h.ui,'KeyR');h.ui.tick(.5);key(h.ui,'KeyC');h.pause(true);h.ui.tick(9);assert.equal(h.ui.engine.elapsed,.5);key(h.ui,'Space');assert.equal(h.ui.engine.result,null);
 h.pause(false);key(h.ui,'Space');assert.equal(h.ui.engine.result,null);assert.equal(h.ui.engine.stage,'calibrating');key(h.ui,'KeyR');key(h.ui,'KeyC');key(h.ui,'Space');finish(h.ui);
 h.ids.get('actionReplay').onclick();h.ui.tick(.1);const t=h.frames.at(-1).elapsed;assert.equal(h.frames.at(-1).replay,true);h.pause(true);h.ui.tick(5);assert.equal(h.frames.at(-1).elapsed,t);
});
test('simulated input closes camera and never reports synthetic real-hand metrics',()=>{
 const h=harness();h.camera(true);key(h.ui,'KeyR');assert.equal(h.stops,1);key(h.ui,'KeyL');key(h.ui,'Space');
 assert.equal(h.ui.engine.result.simulated,true);assert.match(h.ids.get('actionInput').textContent,/模擬/);assert.match(h.ids.get('actionResult').textContent,/不代表真人數據/);
});
test('missing pose pauses all clocks through UI requestPause, not just gesture detector',()=>{
 const h=harness();h.camera(true);h.ui.pose({t:0,kp:{}});h.ui.tick(.1);assert.equal(h.ui.engine.paused,true);assert.match(h.ids.get('actionStage').textContent,/已暫停/);assert.equal(h.frames.at(-1).paused,true);
});
test('displayed contact rectangle matches actual engine collision bounds',()=>{
 const h=harness();const rect=h.ui.panel.html.match(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/);assert.ok(rect);
 assert.equal(+rect[1],CONTACT_REGION.left);assert.equal(+rect[2],CONTACT_REGION.top);assert.ok(Math.abs(+rect[1]+ +rect[3]-CONTACT_REGION.right)<1e-10);assert.ok(Math.abs(+rect[2]+ +rect[4]-CONTACT_REGION.bottom)<1e-10);
});
