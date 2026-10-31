import * as THREE from '../land/three.js';
import { LandWorld, pickTier } from '../land/world.js';
import { Figure, samplePose } from '../land/figure.js';
import { BASE_POINTS, targetBase, runnerStart, lerpPoint, flight, decisionMotion } from './world-logic.js';
const STANCE={hipY:.66,bend:.22,torsoYaw:-.1,headYaw:1.25,lHand:[-.09,.36,.16],rHand:[-.13,.42,.13],batTip:[-.3,1.05,-.25],lFoot:[.3,.02,.15],rFoot:[-.28,-.04,.2]};
const LOAD={...STANCE,torsoYaw:-.4,lHand:[-.17,.4,.08],rHand:[-.21,.46,.05],batTip:[-.55,.95,-.55],lFoot:[.22,.04,.1,.03]};
export const CONTACT={hipY:.63,bend:.25,torsoYaw:.75,headYaw:.65,lHand:[-.02,.2,.42],rHand:[-.08,.22,.38],batTip:[-.75,.3,.95],lFoot:[.42,.04,.4],rFoot:[-.28,-.04,.6]};
const FINISH={hipY:.66,bend:.12,torsoYaw:1.45,headYaw:.2,lHand:[.12,.5,.18],rHand:[.06,.52,.2],batTip:[.5,.9,-.5],lFoot:[.42,.04,.6],rFoot:[-.22,-.02,1.2]};
const SWING=[[0,LOAD],[.1,LOAD],[.3,CONTACT],[.55,FINISH],[1.3,FINISH],[1.8,STANCE]];
export const TEE_BALL=[0,.724,0];
export const BATTER_POSITION=[.9,.02,-.18];
const REST={hipY:.73,lHand:[.26,.1,.1],rHand:[-.26,.1,.1],lFoot:[.15,0],rFoot:[-.15,0]};
function label(text,color='#fff5ce'){
 const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d');
 x.fillStyle='#102f32dd';x.beginPath();x.roundRect(4,4,504,120,24);x.fill();x.font='bold 56px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillStyle=color;x.fillText(text,256,64);
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.scale.set(3.8,.95,1);sprite.renderOrder=10;return sprite;
}
export class TeeWorld {
 constructor(canvas,onBase){
  this.world=new LandWorld(canvas,{tier:pickTier(new URLSearchParams(location.search)),time:'day'});this.canvas=canvas;
  this.world.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.world.scene.getObjectByName('mound')?.removeFromParent();this.world.scene.getObjectByName('rubber')?.removeFromParent();
  this.root=new THREE.Group();this.world.scene.add(this.root);this.runners=[];this.fielders=[];this.rings=[];this.labels=[];this.clock=0;this.elapsed=0;this.view='play';this.key='';
  const jersey={jersey:'#f19b3d',pants:'#fff4dc',cap:'#183e52',helmet:true};
  this.batter=new Figure({...jersey,bat:true});this.batter.root.position.set(...BATTER_POSITION);this.batter.root.rotation.y=-Math.PI/2;this.batter.set(STANCE);this.root.add(this.batter.root);
  this.tee=new THREE.Group();const mat=new THREE.MeshStandardMaterial({color:0x243c46,roughness:.7});
  for(const [radius,height,y] of [[.28,.08,.04],[.055,.48,.3],[.11,.08,.55]]){const m=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,20),mat);m.position.y=y;m.castShadow=true;this.tee.add(m);}this.root.add(this.tee);
  this.ball=new THREE.Mesh(new THREE.SphereGeometry(.14,24,16),new THREE.MeshStandardMaterial({color:0xffe8a0,roughness:.65}));this.ball.castShadow=true;this.root.add(this.ball);
  this.ballHalo=new THREE.Mesh(new THREE.RingGeometry(.23,.33,32),new THREE.MeshBasicMaterial({color:0xffe08a,side:THREE.DoubleSide,transparent:true,opacity:.7}));this.ballHalo.rotation.x=-Math.PI/2;this.root.add(this.ballHalo);
  for(let b=1;b<=4;b++){
   const p=BASE_POINTS[b];const ring=new THREE.Mesh(new THREE.RingGeometry(.6,1.05,48),new THREE.MeshBasicMaterial({color:0x61d6cf,transparent:true,opacity:.65,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(p[0],.055,p[1]);ring.userData.base=b;this.root.add(ring);this.rings.push(ring);
   const tag=label(['','一壘','二壘','三壘','本壘'][b]);tag.position.set(p[0],2.6,p[1]);this.root.add(tag);this.labels.push(tag);
   const f=new Figure({jersey:'#397c9a',pants:'#f2f1dd',cap:'#173d53',mitt:true});f.root.position.set(p[0]+.7,0,p[1]+.7);f.set(REST);this.root.add(f.root);this.fielders.push(f);
  }
  this.holder=new Figure({jersey:'#397c9a',pants:'#f2f1dd',cap:'#173d53',mitt:true});this.holder.root.position.set(4,0,15);this.holder.set({...REST,lHand:[.1,.4,.25],rHand:[-.1,.4,.25]});this.root.add(this.holder.root);
  this.coach=new Figure({jersey:'#ece9dc',pants:'#334c50',cap:'#d47a37'});this.coach.root.position.set(16,0,19);this.coach.set({...REST,rHand:[-.3,1,.1]});this.root.add(this.coach.root);
  this.stopTag=label('教練：停！','#ffcb85');this.stopTag.position.set(16,2.5,19);this.root.add(this.stopTag);
  this.trail=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffe1a0,transparent:true,opacity:.8}));this.root.add(this.trail);
  this.commitLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xff8268}));this.root.add(this.commitLine);
  this.path=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:0xffc679,dashSize:.5,gapSize:.3}));this.root.add(this.path);
  this.ray=new THREE.Raycaster();canvas.addEventListener('pointerup',e=>{const r=canvas.getBoundingClientRect();this.ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),this.world.camera);const hit=this.ray.intersectObjects(this.rings)[0];if(hit)onBase(hit.object.userData.base);});
  this.resize=new ResizeObserver(()=>this.fit());this.resize.observe(canvas.parentElement);this.fit();
 }
 fit(){const r=this.canvas.parentElement.getBoundingClientRect();if(!r.width||!r.height)return;this.world.renderer.setSize(r.width,r.height,false);this.world.camera.aspect=r.width/r.height;this.world.camera.updateProjectionMatrix();}
 setView(view){this.view=view;}
 setScenario(s,drill,selected){
  const key=drill?'drill':s.id;
  if(this.key!==key){this.key=key;this.s=s;this.drill=drill;this.motion=null;this.elapsed=0;this.trail.visible=false;
   this.runners.forEach(r=>{r.figure.root.removeFromParent();r.figure.root.traverse(o=>o.geometry?.dispose());Object.values(r.figure.mats).forEach(m=>m.dispose());});this.runners=[];
   const specs=drill?[{base:0,drillRunner:true}]:s.runners.length?s.runners: s.mode==='running'||s.ball.state==='fairGroundBall'?[{base:0}]:[];
   specs.forEach(spec=>{const f=new Figure({jersey:'#f19b3d',pants:'#fff4dc',cap:'#173d53',helmet:true});const p=runnerStart(spec);if(s?.id==='run-07'){p[0]+=1;p[1]+=1;}f.root.position.set(p[0],0,p[1]);f.set(REST);f.root.visible=!spec.drillRunner;this.root.add(f.root);this.runners.push({figure:f,spec,start:p});});
   if(this.commitLine){const committed=specs.find(r=>r.pastCommitLine);this.commitLine.visible=!!committed;if(committed){const a=BASE_POINTS[committed.base],b=BASE_POINTS[committed.destination],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),p=lerpPoint(a,b,5/len);this.commitLine.geometry.dispose();this.commitLine.geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p[0]-dz/len,.08,p[1]+dx/len),new THREE.Vector3(p[0]+dz/len,.08,p[1]-dx/len)]);}}
   this.tee.visible=drill||s.ball.state==='onTee';this.batter.root.visible=this.tee.visible;this.batter.set(STANCE);
   const holder=s?.ball?.holderBase;const bp=s?.ball?.returnedTo==='catcher'?BASE_POINTS[4]:holder?BASE_POINTS[holder]:[4,15];this.holder.root.visible=!this.tee.visible;this.holder.root.position.set(bp[0],0,bp[1]);this.holder.set({...REST,lHand:[.1,.4,.25],rHand:[-.1,.4,.25]});
   this.ball.position.set(...(this.tee.visible?TEE_BALL:s.ball.state==='calledFoul'?[0,.14,3]:s.ball.state==='fairGroundBall'?[-3,.14,9]:[bp[0],1.05,bp[1]+.25]));
   this.stopTag.visible=this.coach.root.visible=s?.coachSignal==='stop';
   this.fielders.forEach((f,i)=>{const p=BASE_POINTS[i+1];const ready=s?.receiverReady?.includes(i+1);f.root.position.set(p[0]+(ready?.3:2),0,p[1]+(ready?.3:2));f.set({...REST,...(ready?{lHand:[.25,.55,.2],rHand:[-.25,.55,.2]}:{})});});
  }
  this.selected=drill?null:targetBase(s.options[selected]?.id);
  this.rings.forEach((r,i)=>{r.material.color.set(this.selected===i+1?0xffbd55:s?.receiverReady?.includes(i+1)?0x6fffb1:0x61d6cf);r.material.opacity=this.selected===i+1?.95:.45;});
  this.focusRunner=this.runners.find(r=>r.spec.isLearner)||this.runners.find(r=>r.spec.destination===this.selected)||this.runners[0];
  const runner=this.focusRunner;const dest=this.selected!==null?BASE_POINTS[this.selected]:runner?.spec.destination?BASE_POINTS[runner.spec.destination]:null;
  this.path.visible=!!runner&&!!dest;if(this.path.visible){this.path.geometry.dispose();this.path.geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(runner.start[0],.1,runner.start[1]),new THREE.Vector3(dest[0],.1,dest[1])]);this.path.computeLineDistances();}
 }
 act(id){this.elapsed=0;this.motion=decisionMotion(this.s,id);this.motion.from=this.ball.position.toArray();if(this.motion.kind==='bat')this.hit();}
 hit(){this.elapsed=0;this.motion={kind:'bat',from:TEE_BALL};this.trail.visible=true;this.trail.geometry.dispose();this.trail.geometry=new THREE.BufferGeometry().setFromPoints(Array.from({length:49},(_,i)=>new THREE.Vector3(...flight(TEE_BALL,[-8,.14,27],i/48,7))));}
 reset(){this.key='';this.motion=null;}
 update(dt,paused){
  if(!paused){this.clock+=dt;this.elapsed+=dt;}
  const t=this.elapsed,m=this.motion;
  if(m?.kind==='bat'){
   this.batter.set(samplePose(SWING,Math.min(t,1.8)));const p=flight(TEE_BALL,[-8,.14,27],Math.max(0,(t-.3)/2),7);this.ball.position.set(...p);
  }
  if(m?.kind==='throw'){
   const b=BASE_POINTS[m.target];this.ball.position.set(...flight(m.from,[b[0]+.3,1.05,b[1]+.3],t/1.5,2.7));
   this.holder.set({...REST,rHand:[-.25,.7,Math.min(t,.6)],torsoYaw:Math.min(t,.5)});
  }
  this.runners.forEach((r,i)=>{
   let p=r.start,moving=false;
   if(r.spec.drillRunner){r.figure.root.visible=m?.kind==='bat'&&t>1.4;if(t>1.4&&m?.kind==='bat'){p=lerpPoint(r.start,BASE_POINTS[1],(t-1.4)/4);moving=t<5.4;this.batter.root.visible=false;}}
   if(m?.kind==='run'&&i===0){p=lerpPoint(r.start,BASE_POINTS[m.target],t/3.5);moving=t<3.5;}
   if(m?.kind==='throw'&&r.spec.destination){p=lerpPoint(r.start,BASE_POINTS[r.spec.destination],t/4);moving=t<4;}
   const f=r.figure;f.root.position.set(p[0],0,p[1]);
   if(moving){const end=BASE_POINTS[r.spec.drillRunner?1:m.kind==='run'?m.target:r.spec.destination];f.root.rotation.y=Math.atan2(end[0]-r.start[0],end[1]-r.start[1]);const w=Math.sin(this.clock*10);f.set({hipY:.71+Math.abs(w)*.04,bend:.1,lFoot:[.15,w*.3,0,Math.max(0,w)*.1],rFoot:[-.15,-w*.3,0,Math.max(0,-w)*.1],lHand:[.25,.15,-w*.3],rHand:[-.25,.15,w*.3]});}else f.set(REST);
  });
  this.ballHalo.position.set(this.ball.position.x,.07,this.ball.position.z);
  const camera=this.world.camera;const portrait=camera.aspect<.9;let pos,look;
  if(this.view==='overview'||(!this.drill&&this.view==='play')){pos=portrait?[0,47,-33]:[29,32,-24];look=[0,0,13];}
  else if(this.view==='follow'&&this.focusRunner?.figure.root.visible){const p=this.focusRunner.figure.root.position;pos=[p.x+5,5,p.z-8];look=[p.x,1,p.z+3];}
  else if(this.view==='follow'&&m?.kind==='bat'&&t>.4){const p=this.ball.position;pos=[p.x+5,7,p.z-10];look=[p.x,1,p.z];}
  else{pos=portrait?[3.5,3.5,-8]:[4.5,2.8,-6.5];look=[0,.9,4];}
  camera.position.lerp(new THREE.Vector3(...pos),1-Math.exp(-dt*5));this.look??=new THREE.Vector3(...look);this.look.lerp(new THREE.Vector3(...look),1-Math.exp(-dt*5));camera.lookAt(this.look);
  this.world.frame(paused?0:dt);
 }
}
