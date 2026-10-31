import {test} from 'node:test';import assert from 'node:assert/strict';
import {ActionRound,ACTION_TIMING} from '../src/teeball/action-logic.js';
import {FORCE_CONTEXTS,validateForceContext} from '../src/teeball/force-contexts.js';
import {TeeWorld} from '../src/teeball/scene.js';import * as THREE from '../src/land/three.js';import {Figure} from '../src/land/figure.js';import {BASE_POINTS} from '../src/teeball/world-logic.js';
function harness(){const w=Object.create(TeeWorld.prototype);Object.assign(w,{root:new THREE.Group(),runners:[],fielders:[],rings:[],clock:0,elapsed:0,key:'',view:'play',world:{camera:new THREE.PerspectiveCamera(50,1.5,.05,6000),frame(){}}});for(const n of ['batter','holder','coach'])w[n]=new Figure({bat:n==='batter'});for(const n of ['tee','ball','ballHalo','stopTag'])w[n]=new THREE.Mesh();w.trail=new THREE.Line(new THREE.BufferGeometry());w.path=new THREE.Line(new THREE.BufferGeometry());return w;}
function configured(c){const e=new ActionRound();e.configureFielding(c,1.85);e.start('fielding');return e;}
test('four contexts are valid contiguous force chains, not arbitrary randomized targets',()=>{
 assert.deepEqual(FORCE_CONTEXTS.map(c=>c.requiredTarget),[1,2,3,4]);
 for(const c of FORCE_CONTEXTS){assert.equal(validateForceContext(c),c);assert.equal(c.runners.length,c.requiredTarget);assert.equal(c.runners.filter(r=>r.target).length,1);assert.equal(c.runners.find(r=>r.target).destination,c.requiredTarget);c.runners.forEach((r,i)=>{assert.equal(r.base,i);assert.equal(r.destination,i+1);});assert.deepEqual(c.receiverReady,[1,2,3,4]);}
 assert.throws(()=>validateForceContext({...FORCE_CONTEXTS[2],runners:[{base:2,destination:3,target:true}]}));
});
test('all targets allow same decision budget with correct-fast, late, wrong objective distinctions',()=>{
 for(const c of FORCE_CONTEXTS){for(const [delay,direction,outcome] of [[1,c.requiredTarget,'correct-fast'],[2,c.requiredTarget,'correct-late'],[.1,c.requiredTarget%4+1,'wrong']]){const e=configured(c);assert.ok(Math.abs(e.runnerTime-ACTION_TIMING.flight[c.requiredTarget]-.25-1.85)<1e-10);e.simulate('ready');e.tick(delay);e.simulate('direction',direction);e.simulate('collect');e.simulate('throw');assert.equal(e.result.outcome,outcome);}}
});
test('restart retains context, pauses freeze all target clocks, invalid budgets rejected',()=>{
 const e=configured(FORCE_CONTEXTS[3]);e.simulate('ready');e.tick(.5);e.setPaused(true);e.tick(9);assert.equal(e.elapsed,.5);e.start('fielding');assert.equal(e.requiredTarget,4);assert.equal(e.fieldingContext.id,FORCE_CONTEXTS[3].id);assert.equal(e.baseline,null);assert.throws(()=>e.configureFielding(FORCE_CONTEXTS[0],NaN));
});
test('each force snapshot renders every correct starting base and destination',()=>{
 for(const c of FORCE_CONTEXTS){const w=harness(),e=configured(c);w.setAction(e.snapshot);assert.equal(w.runners.length,c.runners.length);w.runners.forEach((r,i)=>assert.deepEqual(r.figure.root.position.toArray(),[BASE_POINTS[i][0],0,BASE_POINTS[i][1]]));
  e.simulate('ready');e.tick(e.runnerTime);w.setAction(e.snapshot);w.runners.forEach((r,i)=>assert.deepEqual(r.figure.root.position.toArray(),[BASE_POINTS[i+1][0],0,BASE_POINTS[i+1][1]]));
 }
});
test('successful target out freezes only designated runner; no automatic chained outs',()=>{
 const c=FORCE_CONTEXTS[3],w=harness(),e=configured(c);e.simulate('ready');e.tick(.1);e.simulate('direction',4);e.simulate('collect');e.simulate('throw');e.tick(10);w.setAction(e.snapshot);
 for(const r of w.runners){const dest=new THREE.Vector3(BASE_POINTS[r.spec.destination][0],0,BASE_POINTS[r.spec.destination][1]);if(r.spec.target)assert.ok(r.figure.root.position.distanceTo(dest)>1);else assert.deepEqual(r.figure.root.position.toArray(),dest.toArray());}
 const frozen=w.runners.map(r=>r.figure.root.position.toArray());w.update(5,true);assert.deepEqual(w.runners.map(r=>r.figure.root.position.toArray()),frozen);
});
