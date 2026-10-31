// Classroom interaction estimates only: kit coordinates are already mirrored.
// No depth, force, finger release or true rear-facing measurement is inferred.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
export const ACTION_TIMING=Object.freeze({runner:3.2,catch:.25,flight:{1:.85,2:1.1,3:1.05,4:1.2}});
export const CONTACT_REGION=Object.freeze({left:-.16,right:.16,top:.25,bottom:.85});
// Segment clipping prevents a low-frame-rate swing from skipping the contact zone.
export function segmentContact(a,b,box=CONTACT_REGION){
 let lo=0,hi=1;const dx=b.x-a.x,dy=b.y-a.y;
 for(const [p,q] of [[-dx,a.x-box.left],[dx,box.right-a.x],[-dy,a.y-box.top],[dy,box.bottom-a.y]]){
  if(Math.abs(p)<1e-10){if(q<0)return null;continue;}
  const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;
 }
 return {x:a.x+lo*dx,y:a.y+lo*dy};
}
export class ActionRound {
 constructor(options={}){this.runnerTime=options.runnerTime??ACTION_TIMING.runner;this.catchTime=options.catchTime??ACTION_TIMING.catch;this.start('batting');}
 start(kind='batting'){
  if(!['batting','fielding'].includes(kind))throw new Error('Unknown action round');
  Object.assign(this,{kind,stage:'calibrating',elapsed:0,paused:false,direction:2,source:'camera',result:null,contactAt:null,releaseAt:null,runnerStarted:false,trajectory:[],events:[],baseline:null,last:null,stable:0,candidate:null,candidateTime:0,collectedTime:0,loadSign:0,collectArmed:false});
  return this.snapshot;
 }
 get flightTime(){return ACTION_TIMING.flight[this.direction];}
 get snapshot(){return {kind:this.kind,stage:this.stage,elapsed:this.elapsed,paused:this.paused,direction:this.direction,source:this.source,result:this.result?{...this.result}:null,contactAt:this.contactAt,releaseAt:this.releaseAt,runnerStarted:this.runnerStarted,runnerTime:this.runnerTime,flightTime:this.flightTime,catchTime:this.catchTime,trajectory:this.trajectory.map(p=>({...p}))};}
 emit(type,extra={}){this.events.push({type,...extra});}
 drainEvents(){const result=this.events;this.events=[];return result;}
 setPaused(value){
  value=!!value;if(this.paused===value)return;this.paused=value;
  this.last=null;this.stable=0;this.candidateTime=0;this.collectedTime=0;this.collectArmed=false;
  if(!value&&!['flight','done'].includes(this.stage)){this.stage='calibrating';this.baseline=null;this.loadSign=0;this.trajectory=[];}
 }
 tick(dt){
  if(this.paused||!Number.isFinite(dt)||dt<=0||this.stage==='calibrating'||this.stage==='done')return;
  this.elapsed+=dt;
  if(this.stage==='flight'){
   const end=this.kind==='batting'?this.contactAt+2.3:Math.max(this.runnerTime,this.releaseAt+this.flightTime+this.catchTime);
   if(this.elapsed>=end){this.elapsed=end;this.stage='done';this.emit('result',{result:this.result});}
  }
 }
 ready(){this.stage='ready';this.runnerStarted=this.kind==='fielding';this.emit('ready');}
 pose(pose){
  if(this.paused||['flight','done'].includes(this.stage))return;
  const k=pose?.kp,required=['leftShoulder','rightShoulder','leftHip','rightHip','leftWrist','rightWrist'];
  if(!k||!Number.isFinite(pose.t)||required.some(n=>!k[n]||k[n].v<.5||!Number.isFinite(k[n].x)||!Number.isFinite(k[n].y))){this.setPaused(true);this.emit('tracking-lost');return;}
  const chest=midpoint(k.leftShoulder,k.rightShoulder),hips=midpoint(k.leftHip,k.rightHip),hand=midpoint(k.leftWrist,k.rightWrist);
  const width=distance(k.leftShoulder,k.rightShoulder);if(width<.06){this.setPaused(true);this.emit('tracking-lost');return;}
  const prior=this.last;const gap=prior?(pose.t-prior.t)/1000:0;
  if(prior&&gap<=0)return;
  if(prior&&gap>.25){this.setPaused(true);this.emit('tracking-lost');return;}
  const dt=gap;
  if(this.stage==='calibrating'){
   const neutral=(this.kind!=='batting'||distance(k.leftWrist,k.rightWrist)<width*.85)&&Math.abs(hand.x-chest.x)<width*.45&&(hand.y-chest.y)>-.15*width&&(hand.y-chest.y)<width*.95;
   const quiet=!prior||distance(hand,prior.hand)/width<.08;
   this.stable=neutral&&quiet?this.stable+dt:0;
   if(this.stable>=.45){this.baseline={scale:width,lean:(chest.x-hips.x)/width};this.ready();}
   this.last={t:pose.t,hand};return;
  }
  const scale=this.baseline.scale;
  const p={x:(hand.x-chest.x)/scale,y:(hand.y-chest.y)/scale,t:this.elapsed};
  const prev=prior?.normalized;this.source='camera';
  if(this.kind==='batting'){
   if(distance(k.leftWrist,k.rightWrist)>scale*.85){this.stage='ready';this.loadSign=0;this.trajectory=[];this.last={t:pose.t,hand};return;}
   if(this.stage==='ready'&&Math.abs(p.x)>=.65&&p.y>-.2&&p.y<1.1){this.stage='loaded';this.loadSign=Math.sign(p.x);this.trajectory=[];this.emit('load');}
   if(this.stage==='loaded'){
    this.trajectory.push(p);if(this.trajectory.length>120)this.trajectory.shift();
    if(prev&&dt>0&&(p.x-prev.x)*this.loadSign<-.015){
     const contact=segmentContact(prev,p);
     if(contact){const speed=clamp(distance(prev,p)/dt/5);const quality=clamp(1-Math.abs(contact.y-.55)/.45);this.finishBat({quality,speed,side:-this.loadSign});}
     else if(p.x*this.loadSign<-.35)this.finishBat({quality:0,speed:0,side:-this.loadSign,miss:true});
    }
   }
  }else{
   const lean=(chest.x-hips.x)/scale-this.baseline.lean;
   const rear=k.leftWrist.y<chest.y-.3*scale&&k.rightWrist.y<chest.y-.3*scale;
   const candidate=rear?4:lean>.22?1:lean<-.22?3:2;
   if(this.stage==='ready'){
    const collected=Math.abs(p.x)<.5&&p.y>-.12&&p.y<.6;
    // Deliberately leave chest, preview a direction, then return to collect.
    // Merely waiting after calibration cannot auto-arm a throw.
    if(!collected){
     this.collectArmed=true;this.collectedTime=0;
     if(candidate!==this.candidate){this.candidate=candidate;this.candidateTime=0;}else this.candidateTime+=dt;
     if(this.candidateTime>=.18&&this.direction!==candidate){this.direction=candidate;this.emit('direction',{direction:candidate});}
    }
    this.collectedTime=collected&&this.collectArmed&&this.candidateTime>=.18?this.collectedTime+dt:0;
    if(this.collectedTime>=.18){this.stage='collected';this.collectPoint=p;this.emit('collect');}
   }else if(this.stage==='collected'&&p.y<this.collectPoint.y-.38&&Math.abs(p.x-this.collectPoint.x)<1){this.finishThrow();}
  }
  this.last={t:pose.t,hand,normalized:p};
 }
 finishBat({quality=.8,speed=.5,side=1,miss=false}={}){
  this.result={outcome:miss?'miss':'contact',quality:clamp(quality),speed:clamp(speed),side,simulated:this.source==='simulated'};
  this.contactAt=this.elapsed;this.stage='flight';this.emit('hit',{result:this.result});
 }
 finishThrow(){
  this.releaseAt=this.elapsed;const arrival=this.elapsed+this.flightTime+this.catchTime;
  this.result={outcome:this.direction!==2?'wrong':arrival<this.runnerTime?'correct-fast':'correct-late',target:this.direction,throwElapsed:this.elapsed,arrival,runnerTime:this.runnerTime,simulated:this.source==='simulated'};
  this.stage='flight';this.emit('throw',{result:this.result});
 }
 simulate(action,value){
  if(this.paused||['flight','done'].includes(this.stage))return false;
  this.source='simulated';
  if(action==='ready'&&this.stage==='calibrating'){this.baseline={scale:1,lean:0};this.ready();return true;}
  if(this.kind==='batting'){
   if(action==='load'&&this.stage==='ready'){this.stage='loaded';this.loadSign=1;this.emit('load');return true;}
   if(action==='swing'&&this.stage==='loaded'){this.trajectory=[{x:.8,y:.55,t:this.elapsed},{x:-.4,y:.55,t:this.elapsed+.1}];this.finishBat({quality:.8,speed:.5});return true;}
  }else{
   if(action==='direction'&&this.stage==='ready'&&[1,2,3,4].includes(value)){this.direction=value;this.emit('direction',{direction:value});return true;}
   if(action==='collect'&&this.stage==='ready'){this.stage='collected';this.emit('collect');return true;}
   if(action==='throw'&&this.stage==='collected'){this.finishThrow();return true;}
  }
  return false;
 }
}

// Reaction time follows foreground wall time, not the renderer's FPS clamp.
// A long stalled frame pauses safely rather than silently awarding extra time.
export function simulationStep(seconds){
 const valid=Number.isFinite(seconds)&&seconds>=0;
 return {dt:valid&&seconds<=.25?seconds:0,stalled:valid&&seconds>.25};
}
