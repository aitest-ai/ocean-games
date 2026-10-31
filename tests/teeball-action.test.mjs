import test from 'node:test';
import assert from 'node:assert/strict';
import {ActionRound,segmentContact} from '../src/teeball/action-logic.js';
function pose(t,x=0,y=.35,{width=.2,lean=0,visible=1}={}){const chest=.5+lean*.2;return {t,kp:{leftShoulder:{x:chest-width/2,y:.3,v:visible},rightShoulder:{x:chest+width/2,y:.3,v:visible},leftHip:{x:.4,y:.65,v:visible},rightHip:{x:.6,y:.65,v:visible},leftWrist:{x:chest+x*.2-.01,y:.3+y*.2,v:visible},rightWrist:{x:chest+x*.2+.01,y:.3+y*.2,v:visible}}};}
function ready(r){for(let t=0;t<=600;t+=50)r.pose(pose(t));assert.equal(r.stage,'ready');return 600;}
test('contact clips whole segments, rejects wrong height and tangent exterior',()=>{assert.ok(segmentContact({x:1,y:.5},{x:-1,y:.5}));assert.equal(segmentContact({x:1,y:1.5},{x:-1,y:1.5}),null);assert.equal(segmentContact({x:.3,y:.4},{x:.3,y:.8}),null);});
test('stationary tee has no deadline, requires stable prep and load; batStart is not a hit',()=>{const r=new ActionRound();r.simulate('swing');assert.equal(r.result,null);ready(r);r.tick(100);assert.equal(r.stage,'ready');r.simulate('batStart');assert.equal(r.result,null);r.pose(pose(650,.8,.55));assert.equal(r.stage,'loaded');r.pose(pose(700,-.4,.55));assert.equal(r.result.outcome,'contact');assert.ok(r.result.speed<=1);assert.equal(r.result.simulated,false);const result=r.result;r.pose(pose(750,.8,.55));assert.equal(r.result,result);});
test('backswing either side works without a second mirror',()=>{for(const sign of [-1,1]){const r=new ActionRound();ready(r);r.pose(pose(650,sign*.8,.55));r.pose(pose(700,-sign*.4,.55));assert.equal(r.result.outcome,'contact');assert.equal(r.result.side,-sign);}});
test('miss is a distinct single attempt',()=>{const r=new ActionRound();ready(r);r.pose(pose(650,.8,1));r.pose(pose(700,-.5,1));assert.equal(r.result.outcome,'miss');assert.equal(r.stage,'flight');});
test('calibration scale stays fixed during shoulder narrowing',()=>{const r=new ActionRound();ready(r);r.pose(pose(650,.8,.55,{width:.08}));assert.ok(Math.abs(r.baseline.scale-.2)<1e-10);r.pose(pose(700,-.4,.55,{width:.08}));assert.equal(r.result.outcome,'contact');});
test('field runner only starts after readiness; correct-fast, late and wrong differ',()=>{for(const [wait,target,expected] of [[.5,2,'correct-fast'],[2,2,'correct-late'],[.1,1,'wrong']]){const r=new ActionRound();r.start('fielding');r.tick(5);assert.equal(r.elapsed,0);r.simulate('ready');r.tick(wait);r.simulate('direction',target);assert.equal(r.simulate('throw'),false);r.simulate('collect');r.simulate('throw');assert.equal(r.result.outcome,expected);assert.equal(r.result.simulated,true);assert.equal(r.result.arrival,wait+r.flightTime+r.catchTime);r.tick(5);assert.equal(r.stage,'done');}});
test('pause freezes clock and resets gestures, including in-flight ball timeline',()=>{const r=new ActionRound();r.start('fielding');r.simulate('ready');r.tick(.4);r.simulate('collect');r.setPaused(true);r.tick(50);assert.equal(r.elapsed,.4);r.setPaused(false);assert.equal(r.stage,'calibrating');assert.equal(r.simulate('throw'),false);r.tick(20);assert.equal(r.elapsed,.4);r.simulate('ready');r.simulate('collect');r.simulate('throw');r.setPaused(true);r.tick(40);assert.equal(r.elapsed,.4);r.setPaused(false);assert.equal(r.stage,'flight');r.tick(4);assert.equal(r.stage,'done');});
test('poor confidence pauses and stale/missing timestamps cannot complete a swing',()=>{const r=new ActionRound();ready(r);r.pose(pose(650,.8,.55));r.pose(pose(1000,-.4,.55));assert.equal(r.result,null);r.pose(pose(1050,0,.55,{visible:.1}));assert.equal(r.paused,true);r.tick(3);assert.equal(r.result,null);});
test('camera chest collect plus screen-up extension commits a second-base throw',()=>{const r=new ActionRound();r.start('fielding');ready(r);for(let t=650;t<=900;t+=50){r.tick(.05);r.pose(pose(t,0,.9));}for(let t=950;t<=1200;t+=50){r.tick(.05);r.pose(pose(t));}assert.equal(r.stage,'collected');r.tick(.1);r.pose(pose(1250,0,-.2));assert.equal(r.result.outcome,'correct-fast');assert.equal(r.result.simulated,false);});
test('camera right direction held before collect is wrong even when fast',()=>{const r=new ActionRound();r.start('fielding');ready(r);for(let t=650;t<=900;t+=50){r.tick(.05);r.pose(pose(t,0,.9,{lean:.35}));}for(let t=950;t<=1200;t+=50){r.tick(.05);r.pose(pose(t,0,.35));}assert.equal(r.direction,1);assert.equal(r.stage,'collected');r.pose(pose(1250,0,-.2,{lean:.35}));assert.equal(r.result.outcome,'wrong');});
test('rear substitute is latched through chest collection, not fake depth',()=>{const r=new ActionRound();r.start('fielding');ready(r);for(let t=650;t<=1000;t+=50)r.pose(pose(t,0,-.5));assert.equal(r.direction,4);for(let t=1050;t<=1500;t+=50)r.pose(pose(t));assert.equal(r.stage,'collected');r.pose(pose(1550,0,-.2));assert.equal(r.result.target,4);assert.equal(r.result.outcome,'wrong');});
test('simulation explicitly stages ready/load/swing and freezes at result',()=>{const r=new ActionRound();r.simulate('ready');assert.equal(r.simulate('swing'),false);r.simulate('load');r.simulate('swing');assert.equal(r.result.simulated,true);assert.equal(r.drainEvents().filter(e=>e.type==='hit').length,1);r.tick(3);const t=r.elapsed;r.tick(10);assert.equal(r.elapsed,t);});

test('waiting at chest never auto-collects; preview can return to front before collect',()=>{const r=new ActionRound();r.start('fielding');ready(r);for(let t=650;t<=1200;t+=50)r.pose(pose(t));assert.equal(r.stage,'ready');for(let t=1250;t<=1550;t+=50)r.pose(pose(t,0,.9,{lean:.35}));assert.equal(r.direction,1);for(let t=1600;t<=1950;t+=50)r.pose(pose(t,0,.9));assert.equal(r.direction,2);for(let t=2000;t<=2300;t+=50)r.pose(pose(t));assert.equal(r.stage,'collected');});

test('speed uses calibrated scale even with foreshortened shoulders',()=>{const r=new ActionRound();ready(r);r.pose(pose(650,.8,.55,{width:.08}));r.pose(pose(850,.45,.55,{width:.08}));r.pose(pose(1050,.1,.55,{width:.08}));assert.ok(Math.abs(r.result.speed-.35)<1e-8);});
test('arrival tie is not an out; configurable runner duration is used',()=>{const r=new ActionRound({runnerTime:2.35});r.start('fielding');r.simulate('ready');r.tick(1);r.simulate('collect');r.simulate('throw');assert.equal(r.result.arrival,2.35);assert.equal(r.result.outcome,'correct-late');});
test('separated hands cannot generate a midpoint-only swing hit',()=>{const r=new ActionRound();ready(r);r.pose(pose(650,.8,.55));const p=pose(700,-.4,.55);p.kp.leftWrist.x-=.2;p.kp.rightWrist.x+=.2;r.pose(p);assert.equal(r.result,null);assert.equal(r.stage,'ready');});

test('foreground simulation keeps real seconds at 10 FPS; stalled frames pause rather than catch up',async()=>{
 const {simulationStep}=await import('../src/teeball/action-logic.js');
 assert.deepEqual(simulationStep(.1),{dt:.1,stalled:false});
 assert.deepEqual(simulationStep(.3),{dt:0,stalled:true});
 assert.deepEqual(simulationStep(NaN),{dt:0,stalled:false});
 for(const fps of [10,20,60]){
  const round=new ActionRound();round.start('fielding');round.simulate('ready');
  for(let i=0;i<fps;i++)round.tick(simulationStep(1/fps).dt);
  assert.ok(Math.abs(round.elapsed-1)<1e-10,`${fps} FPS must count one real second`);
  const stalled=simulationStep(.5);if(stalled.stalled)round.setPaused(true);round.tick(stalled.dt);
  assert.ok(Math.abs(round.elapsed-1)<1e-10);assert.equal(round.paused,true);
 }
});
