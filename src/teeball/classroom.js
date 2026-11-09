import { FORCE_CONTEXTS } from './force-contexts.js';
// In-memory anonymous rotation only. No names, persistence, camera data or ranking.
export const PACES=Object.freeze({relaxed:4.2,standard:3.2});
export function shuffled(items,seed=1){
 let state=(Number(seed)>>>0)||1;const out=[...items];
 const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
 for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
 return out;
}
export function makeDeck(bank,{count=18,seed=1,coreOnly=true}={}){
 if(!Number.isInteger(count)||count<1||count>40)throw new RangeError('Student count must be 1–40');
 const eligible=bank.filter(s=>!coreOnly||!s.requiresProfile?.length);
 if(!eligible.length)throw new Error('No eligible knowledge scenarios');
 const ids=new Set();for(const s of eligible){if(ids.has(s.id)||!s.options?.some(o=>o.id===s.correct)||new Set(s.options.map(o=>o.id)).size!==s.options.length)throw new Error('Invalid scenario bank');ids.add(s.id);}
 // Interleave concepts/modes after seeded shuffling, while consuming every template
 // once before reuse. Changing option order is not counted as a new scenario.
 const pool=shuffled(eligible,seed),groups=new Map();
 for(const s of pool){const key=s.mode;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);}
 const order=[];while(order.length<pool.length)for(const group of groups.values())if(group.length)order.push(group.shift());
 return Array.from({length:count},(_,i)=>{
  const s=order[i%order.length];return {...s,options:shuffled(s.options,seed+i+101)};
 });
}
export class Classroom {
 constructor(bank,options={}){this.bank=bank;this.reset(options);}
 reset({count=18,seed=1,pace='standard',knowledge=true,coreOnly=true,secondsPerPlayer=75}={}){
  if(!(pace in PACES))throw new Error('Unknown classroom pace');
  if(!Number.isFinite(secondsPerPlayer)||secondsPerPlayer<20||secondsPerPlayer>300)throw new RangeError('Estimate must be 20–300 seconds');
  this.deck=makeDeck(this.bank,{count,seed,coreOnly});this.forceOrder=shuffled(FORCE_CONTEXTS,seed);Object.assign(this,{count,seed,pace,knowledge,coreOnly,secondsPerPlayer,slot:0,step:0,finished:false});
 }
 get stages(){return this.knowledge?['batting','fielding','knowledge']:['batting','fielding'];}
 get stage(){return this.stages[this.step];}
 get scenario(){return this.deck[this.slot];}
 get runnerTime(){return PACES[this.pace];}
 get decisionBudget(){return this.pace==='relaxed'?2.85:1.85;}
 get fieldingContext(){return this.forceOrder[this.slot%this.forceOrder.length];}
 get estimatedMinutes(){return Math.ceil(this.count*this.secondsPerPlayer/60);}
 nextStep(){if(this.finished||this.step===this.stages.length-1)return false;this.step++;return true;}
 nextPlayer(){if(this.finished)return false;if(this.slot+1>=this.count){this.finished=true;return false;}this.slot++;this.step=0;return true;}
}
