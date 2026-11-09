import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ChoiceGate,TeeDrill,validateScenario,grade,canUseCameraAction,nextIndex } from '../src/teeball/logic.js';
import { SCENARIOS,CONTENT } from '../src/teeball/scenarios.js';
test('all 30 scenarios have one valid answer and explanatory provenance',()=>{
  assert.equal(SCENARIOS.length,30);assert.equal(new Set(SCENARIOS.map(s=>s.id)).size,30);
  for(const s of SCENARIOS){assert.ok(validateScenario(s),s.id);assert.equal(s.options.filter(o=>o.id===s.correct).length,1);assert.ok(s.answerBasis);assert.ok(s.explanation.length>15);}
});
test('grading accepts only listed choices and never mutates source',()=>{
  const s=SCENARIOS[0], before=JSON.stringify(s);assert.equal(grade(s,s.correct).correct,true);assert.equal(grade(s,'unknown'),null);assert.equal(JSON.stringify(s),before);
});
test('unknown structure is not gradable',()=>{assert.equal(validateScenario({}),false);assert.equal(grade(null,'a'),null);});
test('lean requires center before another selection',()=>{
  const g=new ChoiceGate();assert.deepEqual(g.action({type:'lean',side:'right'},0,3,0),{type:'select',index:1});assert.equal(g.action({type:'lean',side:'right'},1000,3,1),null);
  g.action({type:'lean',side:'center'},1100,3,1);assert.deepEqual(g.action({type:'lean',side:'right'},1200,3,1),{type:'select',index:2});
});
test('gesture cooldown stops simultaneous raise confirming a new selection',()=>{
  const g=new ChoiceGate();g.action({type:'lean',side:'left'},100,3,0);assert.equal(g.action({type:'raise',side:'both'},200,3,2),null);assert.deepEqual(g.action({type:'raise',side:'both'},800,3,2),{type:'confirm'});
});
test('single hand does not submit, gate reset resets gesture',()=>{
  const g=new ChoiceGate();assert.equal(g.action({type:'raise',side:'left'},0,3,0),null);g.action({type:'lean',side:'left'},0,3,0);g.reset();assert.equal(g.action({type:'lean',side:'left'},1000,3,0).index,2);
});
test('tee is stationary readiness cue, accepts only one hit per trial',()=>{
  const d=new TeeDrill();assert.equal(d.hit(0),null);d.arm(100);assert.equal(d.hit(500),'early');assert.equal(d.hit(600),null);d.arm(1000);assert.equal(d.hit(3300),'safe');assert.equal(d.hit(3500),null);
});
test('pause cancellation cannot award a delayed gesture',()=>{
  const d=new TeeDrill();d.arm(0);d.tick(3000);d.cancel();assert.equal(d.hit(3100),null);assert.equal(d.stage,'idle');
});
test('waiting without swinging ends with no false successful hit',()=>{const d=new TeeDrill();d.arm(0);d.tick(6500);assert.equal(d.result,'waited');assert.equal(d.hit(6600),null);});
test('camera actions require source, active app, unpaused, tracking ok',()=>{
  const good={camera:true,active:true,paused:false,tracking:'ok'};assert.equal(canUseCameraAction(good),true);
  for(const patch of [{camera:false},{active:false},{paused:true},{tracking:'lost'},{tracking:'crowd'},{tracking:'hands'}])assert.equal(canUseCameraAction({...good,...patch}),false);
});
test('no baseball tag-up, tagging, innings assumptions',()=>{
  assert.equal(CONTENT.ruleProfile.caughtFlyDeadBall,true);assert.equal(CONTENT.ruleProfile.tagOuts,false);assert.equal(CONTENT.ruleProfile.inningModel,'notSimulated');
  assert.equal(SCENARIOS.find(s=>s.id==='run-04').correct,'return');assert.equal(SCENARIOS.find(s=>s.id==='def-04').correct,'reset');assert.equal(SCENARIOS.find(s=>s.id==='def-06').correct,'first');assert.equal(SCENARIOS.find(s=>s.id==='run-07').correct,'return');
});
test('advanced local-profile rules can be excluded without empty station',()=>{
  for(const mode of ['batting','running','fielding'])assert.ok(SCENARIOS.filter(s=>s.mode===mode&&!s.requiresProfile?.length).length>=2);
});
test('finite deck wraps without advancing scores or innings',()=>{assert.equal(nextIndex(5,6),0);assert.equal(nextIndex(2,6),3);assert.equal(nextIndex(0,0),0);});
test('camera remains explicitly opt-in and session closes streams',()=>{
  const source=readFileSync(new URL('../src/teeball/app.js',import.meta.url),'utf8');
  assert.match(source,/\$\('camera'\)\.onclick=startCamera/);assert.match(source,/pagehide.*stopCamera/);assert.match(source,/visibilitychange/);assert.doesNotMatch(source,/localStorage|fetch\(|recorder\.(start|download)/);
});

import { CameraSession } from '../src/teeball/camera-session.js';
test('pending camera cancellation closes late stream and serializes restart', async()=>{
  let resolve, created=0, detached=0;const sources=[];
  const session=new CameraSession(()=>{const s={stopCount:0,stop(){this.stopCount++;}};sources.push(s);created++;return s;},()=>new Promise(r=>{resolve=r;}),()=>detached++);
  const pending=session.start();session.stop();
  assert.equal(await session.start(),false);assert.equal(created,1);
  resolve();assert.equal(await pending,false);assert.equal(sources[0].stopCount,2);
  const next=session.start();assert.equal(created,2);resolve();assert.equal(await next,true);
  assert.equal(sources[1].stopCount,0);session.stop();assert.equal(sources[1].stopCount,1);assert.equal(detached,2);
});
test('camera failure stops the exact source and allows retry',async()=>{
  let stopped=0;const session=new CameraSession(()=>({stop(){stopped++;}}),async()=>{throw Error('permission');},()=>{});
  await assert.rejects(session.start(),/permission/);assert.equal(stopped,1);assert.equal(session.pending,false);assert.equal(session.source,null);
});

import { BASE_POINTS, targetBase, runnerStart, lerpPoint, flight, decisionMotion } from '../src/teeball/world-logic.js';
test('3D base IDs and trajectory endpoints stay in original world coordinates',()=>{
 assert.equal(targetBase('first'),1);assert.equal(targetBase('hold'),null);
 assert.deepEqual(BASE_POINTS[0],BASE_POINTS[4]);assert.ok(BASE_POINTS[1][0]<0);assert.ok(BASE_POINTS[3][0]>0);
 assert.deepEqual(lerpPoint([0,0],[4,8],2),[4,8]);assert.deepEqual(lerpPoint([0,0],[4,8],-1),[0,0]);
 assert.deepEqual(flight([0,1,0],[2,1,8],0),[0,1,0]);assert.ok(Math.abs(flight([0,1,0],[2,1,8],1)[1]-1)<1e-9);assert.ok(flight([0,1,0],[2,1,8],.5)[1]>1);
});
test('all 30 situations have safe, deterministic 3D decisions without mutating rules',()=>{
 for(const s of SCENARIOS){const before=JSON.stringify(s);for(const o of s.options){const m=decisionMotion(s,o.id);assert.ok(['blocked','run','throw','hold','bat'].includes(m.kind));if(o.id!==s.correct)assert.equal(m.kind,'blocked');if(m.target!=null)assert.ok(m.target>=0&&m.target<=4);}assert.equal(JSON.stringify(s),before);}
});
test('dead ball does not animate another throw or tag-up',()=>{
 assert.equal(decisionMotion(SCENARIOS.find(s=>s.id==='def-04'),'reset').kind,'hold');
 assert.deepEqual(decisionMotion(SCENARIOS.find(s=>s.id==='run-04'),'return'),{kind:'run',target:1});
 assert.deepEqual(decisionMotion(SCENARIOS.find(s=>s.id==='run-03'),'hold'),{kind:'hold'});
});
test('committed runners begin visibly beyond five metres and standing runners stay on base',()=>{
 assert.deepEqual(runnerStart({base:2,status:'onBase'}),BASE_POINTS[2]);const p=runnerStart({base:2,destination:3,pastCommitLine:true});assert.ok(Math.hypot(p[0]-BASE_POINTS[2][0],p[1]-BASE_POINTS[2][1])>5);
});
test('3D reuses original field and IK figures, with explicit unsupported WebGL fallback',()=>{
 const scene=readFileSync(new URL('../src/teeball/scene.js',import.meta.url),'utf8');const app=readFileSync(new URL('../src/teeball/app.js',import.meta.url),'utf8');const html=readFileSync(new URL('../teeball/index.html',import.meta.url),'utf8');
 assert.match(scene,/new LandWorld/);assert.match(scene,/new Figure/);assert.match(scene,/samplePose\(SWING/);assert.match(scene,/ResizeObserver/);assert.match(app,/worldError/);assert.match(html,/<canvas id="world"/);assert.doesNotMatch(html,/<svg id="field"/);
});

import * as THREE from '../src/land/three.js';
import { Figure } from '../src/land/figure.js';
import { TeeWorld, CONTACT, TEE_BALL, BATTER_POSITION } from '../src/teeball/scene.js';
function sceneHarness(){
 const w=Object.create(TeeWorld.prototype);Object.assign(w,{root:new THREE.Group(),runners:[],fielders:[],rings:[],clock:0,elapsed:0,key:'',view:'play',world:{camera:new THREE.PerspectiveCamera(50,1.5,.05,6000),frame(){}}});
 for(const name of ['batter','holder','coach'])w[name]=new Figure({bat:name==='batter'});
 for(const name of ['tee','ball','ballHalo','stopTag'])w[name]=new THREE.Mesh();
 w.trail=new THREE.Line(new THREE.BufferGeometry());w.path=new THREE.Line(new THREE.BufferGeometry());return w;
}
test('actual Three.js scene state and IK animate every scenario without GPU or NaNs',()=>{
 const w=sceneHarness();
 for(const s of SCENARIOS){for(let i=0;i<s.options.length;i++){w.reset();w.setScenario(s,false,i);w.act(s.options[i].id);for(let n=0;n<120;n++)w.update(.05,false);for(const r of w.runners)assert.ok(r.figure.root.position.toArray().every(Number.isFinite),s.id);assert.ok(w.ball.position.toArray().every(Number.isFinite),s.id);}}
});
test('3D drill reset, paused motion, and runner after swing are coherent',()=>{
 const w=sceneHarness();w.setScenario(null,true,0);assert.equal(w.tee.visible,true);w.hit();w.update(.05,false);const elapsed=w.elapsed;w.update(.05,true);assert.equal(w.elapsed,elapsed);
 for(let n=0;n<120;n++)w.update(.05,false);assert.ok(w.runners[0].figure.root.visible);assert.deepEqual(w.runners[0].figure.root.position.toArray(),[BASE_POINTS[1][0],0,BASE_POINTS[1][1]]);
 w.reset();w.setScenario(null,true,0);assert.equal(w.batter.root.visible,true);assert.equal(w.runners[0].figure.root.visible,false);assert.deepEqual(w.ball.position.toArray(),TEE_BALL);
});

test('original IK bat sweet spot contacts the stationary tee ball at launch pose',()=>{
 const batter=new Figure({bat:true});batter.root.position.set(...BATTER_POSITION);batter.root.rotation.y=-Math.PI/2;batter.set(CONTACT);batter.root.updateMatrixWorld(true);assert.ok(batter.batPoint().distanceTo(new THREE.Vector3(...TEE_BALL))<.03);
});
test('scene facts match overrun return, catcher possession, and lead runner objective',()=>{
 const w=sceneHarness();const s=id=>SCENARIOS.find(x=>x.id===id);
 w.setScenario(s('run-07'),false,0);assert.notDeepEqual(w.runners[0].start,BASE_POINTS[2]);w.act('return');for(let n=0;n<100;n++)w.update(.05,false);assert.deepEqual(w.runners[0].figure.root.position.toArray(),[...BASE_POINTS[2].slice(0,1),0,BASE_POINTS[2][1]]);
 w.setScenario(s('run-05'),false,0);assert.equal(w.holder.root.position.x,0);assert.equal(w.holder.root.position.z,0);assert.equal(w.ball.position.z,.25);
 w.setScenario(s('def-03'),false,0);assert.equal(w.focusRunner.spec.base,3);assert.equal(w.focusRunner.spec.destination,4);
});
