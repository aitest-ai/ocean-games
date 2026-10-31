import {test} from 'node:test';import assert from 'node:assert/strict';
import {Classroom,makeDeck,PACES} from '../src/teeball/classroom.js';
const bank=Array.from({length:24},(_,i)=>({id:'q'+i,mode:['batting','running','fielding'][i%3],options:[{id:'yes'},{id:'no'}],correct:'yes',requiresProfile:[]}));
test('18 anonymous packets consume distinct templates, deterministic seed and correct IDs',()=>{
 const a=makeDeck(bank),b=makeDeck(bank);assert.deepEqual(a,b);assert.equal(new Set(a.map(s=>s.id)).size,18);
 for(const s of a)assert.equal(s.options.filter(o=>o.id===s.correct).length,1);
 assert.notDeepEqual(a,makeDeck(bank,{seed:4}));assert.equal(new Set(a.map(s=>s.mode)).size,3);
});
test('every student has same action mix and pace; final slot does not silently wrap',()=>{
 const c=new Classroom(bank);for(let i=0;i<18;i++){
  assert.equal(c.slot,i);assert.equal(c.stage,'batting');assert.equal(c.runnerTime,PACES.standard);
  assert.ok(c.nextStep());assert.equal(c.stage,'fielding');assert.ok(c.nextStep());assert.equal(c.stage,'knowledge');assert.equal(c.nextStep(),false);c.nextPlayer();
 }assert.equal(c.finished,true);assert.equal(c.slot,17);assert.equal(c.nextPlayer(),false);
});
test('teacher settings rebuild whole class, not increasing difficulty by slot',()=>{
 const c=new Classroom(bank);c.nextPlayer();c.reset({count:4,knowledge:false,pace:'relaxed',secondsPerPlayer:90});assert.equal(c.slot,0);assert.equal(c.stages.length,2);assert.equal(c.estimatedMinutes,6);assert.equal(c.runnerTime,4.2);
});
test('invalid count, timing, bank and profile filter are guarded',()=>{
 for(const count of [0,41,1.5,NaN])assert.throws(()=>makeDeck(bank,{count}));assert.throws(()=>makeDeck([]));assert.throws(()=>makeDeck([...bank,bank[0]]));assert.throws(()=>makeDeck([{...bank[0],correct:'bad'}]));
 assert.throws(()=>new Classroom(bank,{pace:'fastest'}));assert.throws(()=>new Classroom(bank,{secondsPerPlayer:0}));
 assert.equal(makeDeck([...bank,{...bank[0],id:'special',requiresProfile:['local']}]).some(s=>s.id==='special'),false);
});

import {SCENARIOS} from '../src/teeball/scenarios.js';
test('real bank supplies18 nonrepeating core knowledge templates and valid answer IDs',()=>{const deck=makeDeck(SCENARIOS);assert.equal(new Set(deck.map(s=>s.id)).size,18);for(const s of deck){assert.ok(!s.requiresProfile?.length);assert.equal(s.options.filter(o=>o.id===s.correct).length,1);}});
