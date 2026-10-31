import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../src/land/three.js';
import {Figure} from '../src/land/figure.js';
import {TeeWorld,TEE_BALL} from '../src/teeball/scene.js';
import {BASE_POINTS} from '../src/teeball/world-logic.js';
import {SCENARIOS} from '../src/teeball/scenarios.js';
function harness(){
 const w=Object.create(TeeWorld.prototype);Object.assign(w,{root:new THREE.Group(),runners:[],fielders:[],rings:[],clock:0,elapsed:0,key:'',view:'play',world:{camera:new THREE.PerspectiveCamera(50,1.5,.05,6000),frame(){}}});
 for(const name of ['batter','holder','coach'])w[name]=new Figure({bat:name==='batter'});
 for(const name of ['tee','ball','ballHalo','stopTag'])w[name]=new THREE.Mesh();
 w.trail=new THREE.Line(new THREE.BufferGeometry());w.path=new THREE.Line(new THREE.BufferGeometry());return w;
}
const bat={kind:'batting',stage:'ready',elapsed:0,contactAt:null,result:null,trajectory:[]};
const field={kind:'fielding',stage:'ready',elapsed:0,direction:2,releaseAt:null,runnerStarted:true,runnerTime:3.2,flightTime:.8,catchTime:.25,result:null};
test('stationary ball survives ready, load and a miss; contact alone launches',()=>{
 const w=harness();for(const stage of ['calibrating','ready','loaded']){w.setAction({...bat,stage,elapsed:99});w.update(.05,false);assert.deepEqual(w.ball.position.toArray(),TEE_BALL);}
 w.setAction({...bat,stage:'done',elapsed:2,result:{outcome:'miss',quality:0,speed:0}});assert.deepEqual(w.ball.position.toArray(),TEE_BALL);
 w.setAction({...bat,stage:'flight',elapsed:1,contactAt:0,result:{outcome:'contact',quality:.8,speed:.5}});assert.ok(w.ball.position.z>5);assert.ok(w.trail.visible);
});
test('contact quality changes resulting flight without maximum-force demand',()=>{
 const w=harness();w.setAction({...bat,elapsed:2,contactAt:0,result:{outcome:'contact',quality:.2,speed:.5}});const short=w.ball.position.z;
 w.setAction({...bat,elapsed:2,contactAt:0,result:{outcome:'contact',quality:.9,speed:.5}});assert.ok(w.ball.position.z>short);
});
test('runner starts exactly at first and moves before release; ball stays held',()=>{
 const w=harness();w.setAction(field);assert.deepEqual(w.runners[0].figure.root.position.toArray(),[BASE_POINTS[1][0],0,BASE_POINTS[1][1]]);
 w.setAction({...field,elapsed:1});assert.notEqual(w.runners[0].figure.root.position.z,BASE_POINTS[1][1]);assert.deepEqual(w.ball.position.toArray(),[4,1.05,15.25]);
});
test('throw and runner use same simulation clock, freeze, and camera never relabels target',()=>{
 const w=harness();const s={...field,stage:'flight',elapsed:1.5,releaseAt:1};w.setAction(s);const ball=w.ball.position.toArray(),runner=w.runners[0].figure.root.position.toArray();
 for(let i=0;i<30;i++)w.update(.05,true);assert.deepEqual(w.ball.position.toArray(),ball);assert.deepEqual(w.runners[0].figure.root.position.toArray(),runner);
 for(const view of ['play','overview','follow']){w.setView(view);w.update(.05,false);assert.deepEqual(w.ball.position.toArray(),ball);assert.equal(w.action.direction,2);}
 w.setAction({...s,elapsed:3.2});assert.deepEqual(w.runners[0].figure.root.position.toArray(),[BASE_POINTS[2][0],0,BASE_POINTS[2][1]]);assert.deepEqual(w.ball.position.toArray(),[BASE_POINTS[2][0],1.05,BASE_POINTS[2][1]]);
});
test('wrong-base throw still travels to selected wrong base, no covert second-base success',()=>{
 const w=harness();w.setAction({...field,direction:1,releaseAt:.5,elapsed:2,result:{outcome:'wrong'}});assert.deepEqual(w.ball.position.toArray(),[BASE_POINTS[1][0],1.05,BASE_POINTS[1][1]]);
});
test('returning to teaching mode disposes action state and reconstructs scenario',()=>{
 const w=harness();w.setAction(field);w.setScenario(SCENARIOS[0],false,0);assert.equal(w.action,null);assert.equal(w.key,SCENARIOS[0].id);w.update(.05,false);assert.ok(w.ball.position.toArray().every(Number.isFinite));
});
test('replay does not disclose a release before its recorded time',()=>{
 const w=harness();w.setAction({...bat,elapsed:.4,contactAt:1,replay:true,result:{outcome:'contact',quality:.7,speed:.5}});assert.deepEqual(w.ball.position.toArray(),TEE_BALL);assert.equal(w.trail.visible,false);
 w.setAction({...field,elapsed:.4,releaseAt:1,replay:true,result:{outcome:'correct-fast'}});assert.deepEqual(w.ball.position.toArray(),[4,1.05,15.25]);
 w.setAction({...field,elapsed:1.4,releaseAt:1,replay:true,result:{outcome:'correct-fast'}});assert.notDeepEqual(w.ball.position.toArray(),[4,1.05,15.25]);
});
test('final teardown releases scene resources and observer',()=>{
 const w=harness();let geometry=0,material=0,texture=0,renderer=0,observer=0,pointer=0;
 const g=new THREE.BoxGeometry();g.addEventListener('dispose',()=>geometry++);const tex=new THREE.Texture();tex.addEventListener('dispose',()=>texture++);const m=new THREE.MeshBasicMaterial({map:tex});m.addEventListener('dispose',()=>material++);
 w.world.scene=new THREE.Scene();w.world.scene.add(new THREE.Mesh(g,m),new THREE.Mesh(g,m));w.world.renderer={dispose(){renderer++;}};w.resize={disconnect(){observer++;}};w.canvas={removeEventListener(){pointer++;}};
 w.dispose();assert.deepEqual([geometry,material,texture,renderer,observer,pointer],[1,1,1,1,1,1]);
});
test('correct-fast runner stops short when teammate completes catch and step',()=>{
 const w=harness();w.setAction({...field,elapsed:4,releaseAt:.5,result:{outcome:'correct-fast',arrival:1.55}});assert.ok(w.runners[0].figure.root.position.distanceTo(new THREE.Vector3(BASE_POINTS[2][0],0,BASE_POINTS[2][1]))>1);
});
