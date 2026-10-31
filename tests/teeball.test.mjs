import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ChoiceGate,TeeDrill,validateScenario,grade,canUseCameraAction,nextIndex } from '../src/teeball/logic.js';
import { SCENARIOS,CONTENT } from '../src/teeball/scenarios.js';
test('all 17 scenarios have one valid answer and explanatory provenance',()=>{
  assert.equal(SCENARIOS.length,17);assert.equal(new Set(SCENARIOS.map(s=>s.id)).size,17);
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
