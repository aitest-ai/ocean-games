import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Classroom} from '../src/teeball/classroom.js';
import {SCENARIOS} from '../src/teeball/scenarios.js';
import {ChoiceGate,TeeDrill,grade,canUseCameraAction} from '../src/teeball/logic.js';
import {ActionRound,simulationStep} from '../src/teeball/action-logic.js';
import {targetBase} from '../src/teeball/world-logic.js';
// Execute the actual controller, with DOM, camera and rendering adapters replaced.
// This is not WebGL visual QA or a real-child camera/pose validation.
function harness(){
 const ids=new Map(),events={},kitEvents={};
 class Element{
  constructor(tag='div'){this.tag=tag;this.dataset={};this.attributes={};this.children=[];this.hidden=false;this.disabled=false;this.open=false;this.textContent='';this.value='';this.checked=false;this.events={};const classes=new Set();this.classList={add:v=>classes.add(v),remove:v=>classes.delete(v),toggle:(v,on)=>on?classes.add(v):classes.delete(v)};}
  setAttribute(k,v){this.attributes[k]=v;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  addEventListener(k,f){this.events[k]=f;}
  closest(selector){if(selector==='article')return article;return selector.split(',').includes(this.tag)?this:null;}
  matches(selector){return selector.split(',').includes(this.tag);}
  showModal(){this.open=true;}
  close(){this.open=false;}
  querySelector(){return rounds;}
  click(){if(!this.disabled)(this.onclick||this.events.click)?.();}
 }
 const html=readFileSync(new URL('../teeball/index.html',import.meta.url),'utf8');
 for(const m of html.matchAll(/<([\w-]+)[^>]*id="([^"]+)"[^>]*>/g)){
  const e=new Element(m[1]);e.value=m[0].match(/value="([^"]*)"/)?.[1]||'';e.checked=/\bchecked\b/.test(m[0]);e.hidden=/\bhidden\b/.test(m[0]);ids.set(m[2],e);
 }
 ids.get('classPace').value='standard';
 const article=new Element('article'),rounds=new Element(),body=new Element('body');
 const groups={mode:['batting','running','fielding'],view:['play','overview','follow']};
 for(const key in groups)groups[key]=groups[key].map(v=>{const e=new Element('button');e.dataset[key]=v;return e;});
 const kit={state:{tracking:'ok'},calibrations:0,on(k,f){kitEvents[k]=f;},calibrate(){this.calibrations++;},stop(){},use(){}};
 const layout={open:false,isOpen(){return this.open;},setImmersive(){},setView(){}};
 let ui;
 class UI{
  constructor(options){Object.assign(this,options);this.panel=new Element('article');ids.set('actionPanel',this.panel);this.engine=new ActionRound();this.start('batting');ui=this;this.poses=0;this.keys=0;}
  start(kind,context,budget){this.kind=kind;if(context!==undefined)this.engine.configureFielding(context,budget);this.engine.start(kind);this.engine.setPaused(this.isPaused());}
  setPaused(value){this.engine.setPaused(value);}
  tick(dt){this.engine.tick(dt);}
  render(){} pose(){this.poses++;} key(){this.keys++;} simulate(){}
 }
 class World{reset(){} setScenario(){} act(){} hit(){} update(){} setView(){} dispose(){}}
 const context={console,Classroom,SCENARIOS,ChoiceGate,TeeDrill,grade,canUseCameraAction,ActionUI:UI,TeeWorld:World,simulationStep,targetBase,
  createTaikan:()=>kit,CameraSource:class{},CameraSession:class{pending=false;async start(){return true;}stop(){}},
  initLayout:({requestPause})=>{layout.toggle=v=>{layout.open=v;if(v)requestPause('drawer open');};return layout;},
  document:{body,hidden:false,getElementById:id=>{assert.ok(ids.has(id),'known DOM ID '+id);return ids.get(id);},createElement:t=>new Element(t),querySelectorAll:s=>groups[s.includes('data-mode')?'mode':'view'],addEventListener(k,f){events['doc:'+k]=f;}},
  window:{addEventListener(k,f){events[k]=f;}},performance:{now:()=>100},requestAnimationFrame:()=>1,cancelAnimationFrame(){}};
 vm.createContext(context);
 const source=readFileSync(new URL('../src/teeball/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInContext(source+'\n globalThis.inspect=()=>({classroom,paused,camera,tracking,answered,actionActive,current:current()});globalThis.paint=renderClassroom;',context);
 return {ids,kit,kitEvents,layout,events,ui,get state(){return context.inspect();},click:id=>ids.get(id).click(),paint:()=>context.paint(),key:(code,target=body)=>events.keydown({code,target,repeat:false,preventDefault(){}})};
}
function completeAction(h){h.ui.engine.stage='done';h.paint();h.click('classAdvance');}
function toKnowledge(h){h.click('pause');completeAction(h);h.click('pause');completeAction(h);h.click('pause');}
test('actual controller defaults to 18 paused anonymous players; completion gates next stage',()=>{
 const h=harness();assert.equal(h.state.classroom.count,18);assert.equal(h.state.paused,true);assert.equal(h.state.classroom.stage,'batting');
 h.click('classAdvance');assert.equal(h.state.classroom.stage,'batting');h.click('pause');h.paint();h.click('classAdvance');assert.equal(h.state.classroom.stage,'batting');
 completeAction(h);assert.equal(h.state.classroom.stage,'fielding');assert.equal(h.state.paused,true);
});
test('knowledge answer does not auto-advance; next player is manual and resets action baseline',()=>{
 const h=harness();toKnowledge(h);assert.equal(h.state.classroom.stage,'knowledge');
 const s=h.state.current,index=s.options.findIndex(o=>o.id===s.correct);h.ids.get('choices').children[index].click();h.click('confirm');
 assert.equal(h.state.answered,true);assert.equal(h.state.classroom.slot,0);assert.match(h.ids.get('feedback').textContent,/判斷正確/);
 h.key('Enter');assert.equal(h.state.classroom.slot,0);h.ui.engine.baseline={scale:999};h.click('classNext');
 assert.equal(h.state.classroom.slot,1);assert.equal(h.state.classroom.stage,'batting');assert.equal(h.ui.engine.baseline,null);assert.equal(h.state.paused,true);
});
test('new camera player resets kit calibration and waits for fresh tracking',async()=>{
 const h=harness();await h.ids.get('camera').onclick();assert.equal(h.state.camera,true);h.ui.engine.baseline={scale:9};
 h.click('classNext');assert.equal(h.kit.calibrations,1);assert.equal(h.ui.engine.baseline,null);assert.equal(h.state.tracking,'lost');
 h.click('pause');assert.equal(h.state.paused,true);h.kitEvents.status({tracking:'ok'});h.click('pause');assert.equal(h.state.paused,false);
});
test('last slot ends without wrapping or resuming stale scene',()=>{
 const h=harness();for(let i=0;i<18;i++)h.click('classNext');assert.equal(h.state.classroom.finished,true);assert.equal(h.state.classroom.slot,17);
 h.click('pause');assert.equal(h.state.paused,true);assert.match(h.ids.get('feedback').textContent,/本輪已結束/);
});
test('drawer blocks resume, pose and shortcuts; close stays paused',async()=>{
 const h=harness();await h.ids.get('camera').onclick();h.layout.toggle(true);h.click('pause');assert.equal(h.state.paused,true);
 h.kitEvents.pose({});h.key('Space');assert.equal(h.ui.poses,0);assert.equal(h.ui.keys,0);
 h.layout.toggle(false);assert.equal(h.state.paused,true);h.click('pause');h.key('Space',h.ids.get('pause'));assert.equal(h.ui.keys,0);
});
test('teacher settings restart at player 1, validate count, honor shorter action packet and estimate',()=>{
 const h=harness();h.click('classNext');h.ids.get('classCount').value='4';h.ids.get('classPace').value='relaxed';h.ids.get('classSeconds').value='90';h.ids.get('classKnowledge').checked=false;h.click('classApply');
 assert.equal(h.state.classroom.slot,0);assert.equal(h.state.classroom.count,4);assert.equal(h.state.classroom.runnerTime,4.2);assert.equal(h.state.classroom.stages.length,2);assert.match(h.ids.get('classEstimate').textContent,/6 分鐘/);
 h.ids.get('classCount').value='0';h.click('classApply');assert.equal(h.state.classroom.count,4);assert.match(h.ids.get('classSettingsStatus').textContent,/1–40/);
});
test('assigned batting knowledge cannot switch into the legacy drill and has only classroom next control',()=>{
 const h=harness();const slot=h.state.classroom.deck.findIndex(s=>s.mode==='batting');assert.ok(slot>=0);
 for(let i=0;i<slot;i++)h.click('classNext');toKnowledge(h);
 assert.equal(h.ids.get('batQuiz').hidden,true,'classroom assignment cannot be replaced by a different drill');
 const s=h.state.current;h.ids.get('choices').children[s.options.findIndex(o=>o.id===s.correct)].click();h.click('confirm');
 assert.equal(h.ids.get('next').hidden,true,'no transient duplicate next button after answer');
});

test('classroom knowledge cannot switch into unrelated safety drill; no duplicate next button',()=>{
 const h=harness();toKnowledge(h);assert.equal(h.ids.get('batQuiz').hidden,true);const original=h.state.current.id;h.click('batQuiz');assert.equal(h.state.current.id,original);h.click('confirm');assert.equal(h.ids.get('next').hidden,true);
});
test('18 slots balance four real action goals with equal reaction budget',()=>{
 const h=harness(),counts=new Map();
 for(let i=0;i<18;i++){
  h.click('pause');completeAction(h);const target=h.ui.engine.requiredTarget;counts.set(target,(counts.get(target)||0)+1);
  assert.equal(h.ui.engine.fieldingContext.id,h.state.classroom.fieldingContext.id);
  assert.ok(Math.abs(h.ui.engine.runnerTime-h.ui.engine.catchTime-({1:.85,2:1.1,3:1.05,4:1.2}[target])-1.85)<1e-9);
  h.click('classNext');
 }
 assert.equal(counts.size,4);assert.ok(Math.max(...counts.values())-Math.min(...counts.values())<=1);
});
