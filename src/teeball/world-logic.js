// Teaching animation, not a physics or umpiring engine. Rules remain in logic.js.
import { BASES } from '../land/dims.js';
export const BASE_POINTS=[BASES.home,BASES.first,BASES.second,BASES.third,BASES.home];
export const targetBase=id=>({first:1,second:2,third:3,home:4})[id]??null;
export const lerpPoint=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*Math.max(0,Math.min(1,t)));
export function runnerStart(r){
  const base=BASE_POINTS[r.base];
  if(r.destination&&r.destination!==r.base)return lerpPoint(base,BASE_POINTS[r.destination],r.pastCommitLine?.55:.22);
  return [...base];
}
export function flight(a,b,t,height=3){const p=lerpPoint(a,b,t);p[1]+=Math.sin(Math.PI*Math.max(0,Math.min(1,t)))*height;return p;}
export function decisionMotion(s,id){
  // Incorrect choices are highlighted but never demonstrated as legal play.
  if(id!==s.correct)return {kind:'blocked',target:targetBase(id)};
  if(s.mode==='fielding')return targetBase(id)!==null?{kind:'throw',target:targetBase(id)}:{kind:'hold'};
  const r=s.runners.find(r=>r.isLearner)||s.runners[0]||{base:0};
  if(id==='return'||id==='back')return {kind:'run',target:r.base};
  if(targetBase(id)!==null)return {kind:'run',target:targetBase(id)};
  if(id==='swing')return {kind:'bat'};
  return {kind:'hold'};
}
