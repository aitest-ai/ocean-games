import { createTaikan, CameraSource } from '../../packages/taikan-kit/src/index.js';
import { SCENARIOS } from './scenarios.js';
import { ChoiceGate, TeeDrill, grade, canUseCameraAction } from './logic.js';
import { CameraSession } from './camera-session.js';
import { TeeWorld } from './scene.js';
import { simulationStep } from './action-logic.js';
import { ActionUI } from './action-ui.js';
import { Classroom } from './classroom.js';
import { initLayout } from './layout-ui.js';
import { targetBase } from './world-logic.js';
const $ = id => document.getElementById(id);
const gate = new ChoiceGate(), tee = new TeeDrill();
const kit = createTaikan({ sensitivity:'normal', disabled:['jump','swing','paddle','crouch'], sideOk:true });
let actionActive=true, actionUI, layout;
const classroom=new Classroom(SCENARIOS,{seed:1});
let classroomEnabled=false, classSeed=1;
let mode='batting', quiz=false, index=0, selected=0, answered=false, correct=0, total=0, paused=false;
const cameraSession = new CameraSession(()=>new CameraSource({video:$('video'),numPoses:2}), source=>kit.use(source), ()=>kit.stop());
let lastPoseAt=0;
let camera=false, tracking='lost', coreOnly=true, attempt=1;
const names={batting:'打擊準備站',running:'跑壘與停壘',fielding:'守備傳球站'};
const baseNames=['本壘（打者）','一壘','二壘','三壘','本壘'];
const ballNames={onTee:'球在打擊座上',fairGroundBall:'有效落地球',held:'守備員持球',caughtFlyDead:'接殺後裁判宣告死球',resetDead:'裁判宣告本次攻防結束',liveHeld:'比賽進行中',fielderControlled:'守備員穩定持球',calledFoul:'裁判宣告無效界外球'};
const statusNames={onBase:'停在壘上',safeOnBase:'安全到壘',advancing:'前進中',forced:'須前進',committed:'已越過不回頭線',returning:'回原壘'};
const list=()=>SCENARIOS.filter(s=>s.mode===mode&&(!coreOnly||!s.requiresProfile?.length));
const current=()=>classroomEnabled&&classroom.stage==='knowledge'?classroom.scenario:list()[index%list().length];
const isDrill=()=>mode==='batting'&&!quiz;
function feedback(text){$('feedback').textContent=text;}
let world;
try { world=new TeeWorld($('world'),base=>{if(actionActive){actionUI?.simulate('direction',base);return;}if(paused||answered||isDrill())return;const i=current().options.findIndex(o=>targetBase(o.id)===base);if(i>=0){selected=i;render();}}); }
catch(error){$('worldError').hidden=false;$('worldError').textContent='這台裝置無法啟動 WebGL 3D 球場。可先用下方文字／按鈕練習；請換支援 WebGL 的裝置檢查完整 3D 畫面。';console.warn('3D field unavailable',error);}
$('world').addEventListener('webglcontextlost',e=>{e.preventDefault();setPaused(true,'3D 繪圖中斷，請重新載入；鏡頭已關閉。');stopCamera();$('worldError').hidden=false;$('worldError').textContent='3D 繪圖中斷。請重新載入頁面，或改用支援 WebGL 的裝置。';});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{world?.setView(b.dataset.view);layout?.setView(b.dataset.view);document.querySelectorAll('[data-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
function drawScene(s){
  world?.setScenario(s,isDrill(),selected);
  $('facts').textContent=isDrill()?'球固定在球座上；綠燈後按揮擊，觀察球與揮棒動畫。空手小幅動作即可。':[
    `球況：${ballNames[s.ball.state]||'依題目敘述'}`,
    `跑者：${s.runners.length?s.runners.map(r=>`${baseNames[r.base]}${statusNames[r.status]||''}${r.destination&&r.destination!==r.base?' → '+baseNames[r.destination]:''}`).join('、'):'壘上無人'}`,
    s.receiverReady?`綠色壘圈＝接球隊友已就位：${s.receiverReady.map(b=>baseNames[b]).join('、')}`:''
  ].filter(Boolean).join(' ｜ ');
}

function render(){
  layout?.setImmersive(actionActive);renderClassroom();
  $('actionPanel').hidden=!actionActive;$('choices').closest('article').hidden=actionActive;
  $('actionMode').setAttribute('aria-pressed',String(actionActive));
  if(actionActive){$('sceneTag').textContent='動作實戰・兩回合';$('facts').textContent='空手小幅動作即可。中央接觸區與投球路徑是教學近似，不是精準運動測量。';actionUI.render();return;}
  $('score').textContent=`${correct} / ${total}`;
  $('sceneTag').textContent=names[mode]; $('station').textContent=names[mode];
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  const drill=isDrill(), s=current();
  $('teeCue').hidden=!drill; $('batButtons').hidden=!drill; $('batQuiz').hidden=classroomEnabled||mode!=='batting';
  $('batQuiz').textContent=quiz?'切換：空手打擊準備':'切換：打擊觀念題';
  $('replay').hidden=drill||!answered; $('confirm').hidden=drill||answered; $('next').hidden=classroomEnabled||drill||!answered;
  $('choices').replaceChildren();
  if(drill){
    $('questionCount').textContent=`第 ${attempt} 次練習`;
    $('question').textContent='先確認四周沒有同學';
    $('context').textContent='球固定在打擊座上。按「開始準備」，等綠燈再做空手小幅打擊。只練安全準備，不判定正式比賽好壞球。';
  }else{
    $('questionCount').textContent=classroomEnabled?'本位知識題（不排名）':`題 ${index+1} / ${list().length}`;
    $('question').textContent=s.prompt;
    $('context').textContent=s.answerBasis==='coaching-scenario'?'教練情境題：答案取決於題目指定的目標、球與接球隊友，不是所有情況的唯一戰術。':s.answerBasis==='classroom-safety'?'室內活動安全題：先保護自己與同學。':'本題依協會樂樂棒一般組設定；校內若不同，請先與老師核對。';
    s.options.forEach((o,i)=>{
      const b=document.createElement('button'); b.type='button'; b.setAttribute('aria-pressed',String(i===selected));
      b.className=i===selected?'selected':''; b.disabled=answered;
      const n=document.createElement('b');n.textContent=String(i+1);const t=document.createElement('span');t.textContent=o.text;b.append(n,t);
      if(answered&&o.id===s.correct)b.classList.add('correct');
      if(answered&&i===selected&&o.id!==s.correct)b.classList.add('wrong');
      b.addEventListener('click',()=>{if(paused||answered)return;selected=i;render();}); $('choices').append(b);
    });
  }
  drawScene(drill?null:s); renderCue();
}
function renderCue(){
  $('teeCue').dataset.stage=paused?'paused':tee.stage;
  $('teeCue').textContent=paused?'已暫停':({idle:'等待準備',waiting:'先等一下・區域確認中',ready:'準備好！可以小幅揮擊',done:tee.result==='safe'?'完成！安全出發':tee.result==='early'?'先等區域準備好':'沒關係，再準備一次'})[tee.stage];
  $('hit').disabled=paused||!['waiting','ready'].includes(tee.stage);$('arm').disabled=paused||['waiting','ready'].includes(tee.stage);
}
function setPaused(value,message){
  paused=value; document.body.classList.toggle('paused',paused); $('pause').textContent=paused?'繼續':'暫停';
  gate.reset();tee.cancel();actionUI?.setPaused(value,message);
  if(message)feedback(message);renderCue();
}
function switchMode(next){classroomEnabled=false;actionActive=false;world?.reset();mode=next;quiz=false;index=0;selected=0;answered=false;tee.cancel();gate.reset();feedback('先讀題目，不用搶快。');render();}
function submit(){
  if(paused||answered||isDrill())return;
  const result=grade(current(),current().options[selected].id);if(!result)return;
  answered=true;total++;if(result.correct)correct++;world?.act(current().options[selected].id);
  feedback(`${result.correct?'判斷正確！':'再想想：'} ${result.explanation}`);render();
}
function hit(){
  if(paused||!isDrill())return; const result=tee.hit(performance.now()); if(!result)return;
  total++;if(result==='safe'){correct++;world?.hit();}
  feedback(result==='safe'?'做得好！先確認安全才揮擊。正式擊出有效球後，要安全放棒並依序跑壘。':'剛才還在確認活動區。先等準備好再開始，這不是正式比賽的好壞球判定。');
  attempt++;render();
}
function next(){if(paused||!answered)return;if(classroomEnabled){nextClassPlayer();return;}index=(index+1)%list().length;selected=0;answered=false;gate.reset();feedback('看清楚球與跑者的位置，再選答案。');render();}
async function startCamera(){
  if(camera||cameraSession.pending)return;
  $('camera').disabled=true;$('cameraStatus').textContent='正在載入姿態模型並要求鏡頭權限…';
  try{
    if(!await cameraSession.start())return;
    camera=true;lastPoseAt=performance.now();tracking=kit.state.tracking || 'lost';$('cameraDot').classList.add('on');$('stopCamera').hidden=false;$('calibrate').hidden=false;
    if(actionActive)actionUI.start(actionUI.kind);
    $('inputHelp').textContent='主要動作模式依畫面提示：穩定準備、引棒穿過中央；守備預覽方向、胸前收手後小幅送手。次要教學模式才用微傾選答案、舉手確認。';
    setPaused(true,'等身體與雙手進入畫面，按「繼續」。');$('cameraStatus').textContent='鏡頭已開啟。請保持坐／站姿，讓軀幹和雙手入鏡。';
  }catch(error){camera=false;$('cameraStatus').textContent='鏡頭無法啟動：請確認 HTTPS／權限。可直接用觸控或鍵盤繼續。';}
  finally{$('camera').disabled=camera;}
}
function stopCamera(){
  cameraSession.stop();camera=false;tracking='lost';$('camera').disabled=cameraSession.pending;$('stopCamera').hidden=true;$('calibrate').hidden=true;$('cameraDot').classList.remove('on');
  $('cameraStatus').textContent='鏡頭已關閉。可用觸控或鍵盤繼續。';$('inputHelp').textContent='動作模擬：R 準備、L 引棒、空白鍵揮擊；守備方向鍵選壘、C 收手、空白鍵送出。教學模式：方向鍵選答案、Enter 確認。';gate.reset();tee.cancel();renderCue();
}
kit.on('status',event=>{
  if(!camera)return;
  if(event.tracking){tracking=event.tracking;$('cameraStatus').textContent=event.tracking==='ok'?'辨識正常；依目前動作提示操作。空手小幅動作即可。':event.hint||'請回到鏡頭中央。';
    if(event.tracking!=='ok')setPaused(true,'鏡頭辨識暫停，不扣分。調整後按「繼續」，或關閉鏡頭改用按鈕。');}
});
kit.on('action',event=>{
  if(!canUseCameraAction({camera,active:!$('help').open&&!layout?.isOpen(),paused,tracking}))return;
  if(actionActive)return; // The new engine consumes raw pose trajectories, never bat events.
  if(isDrill()){if(event.type==='bat')hit();return;}
  if(answered)return;
  const action=gate.action(event,performance.now(),current().options.length,selected);
  if(action?.type==='select'){selected=action.index;render();} else if(action?.type==='confirm')submit();
});
kit.on('pose',pose=>{lastPoseAt=performance.now();if(actionActive&&canUseCameraAction({camera,active:!$('help').open&&!layout?.isOpen(),paused,tracking}))actionUI.pose(pose);});
actionUI=new ActionUI({world,stopCamera,isCamera:()=>camera,isPaused:()=>paused,feedback,requestPause:message=>setPaused(true,message)});
layout=initLayout({requestPause:message=>setPaused(true,message)});
$('actionMode').onclick=()=>{classroomEnabled=false;actionActive=true;actionUI.start(actionUI.kind);render();};
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>switchMode(b.dataset.mode)));
$('batQuiz').onclick=()=>{if(classroomEnabled)return;quiz=!quiz;index=0;selected=0;answered=false;tee.cancel();gate.reset();feedback('先讀題目，不用搶快。');render();};
$('arm').onclick=()=>{if(paused)return;world?.reset();world?.setScenario(null,true,0);tee.arm(performance.now());feedback('等待練習區準備好。綠燈不是投球，只是安全提示。');renderCue();};
$('replay').onclick=()=>{if(paused)return;const s=current();selected=s.options.findIndex(o=>o.id===s.correct);world?.reset();world?.setScenario(s,false,selected);world?.act(s.correct);feedback('正確動作示範：'+s.explanation);};
$('hit').onclick=hit;$('confirm').onclick=submit;$('next').onclick=next;
$('camera').onclick=startCamera;$('stopCamera').onclick=stopCamera;
$('calibrate').onclick=()=>{if(actionActive)actionUI.start(actionUI.kind);kit.calibrate();tracking='lost';setPaused(true,'換人或換姿勢後重新校準；穩定後按「繼續」。');};
$('pause').onclick=()=>{if(classroomEnabled&&classroom.finished){feedback('本輪已結束，請重開全班或選自由練習。');return;}if(paused&&(layout?.isOpen()||$('help').open)){feedback('請先收起教師控制與規則，再按繼續。');return;}if(paused&&camera&&tracking!=='ok'){feedback('請先讓鏡頭正常辨識，或關閉鏡頭改用按鈕。');return;}setPaused(!paused,paused?'繼續練習；請重新穩定準備，避免暫停前的動作誤觸。':'已暫停，可以休息。');};
$('reset').onclick=()=>{if(classroomEnabled){startClassroom();return;}if(actionActive){actionUI.start('batting');setPaused(true,'換組後重新準備。');if(camera)kit.calibrate();return;}correct=0;total=0;attempt=1;switchMode(mode);setPaused(true,'已清空本輪。換人後請重新校準或按「繼續」。');if(camera)kit.calibrate();};
$('helpOpen').onclick=()=>{setPaused(true,'規則與說明開啟中。關閉後請按「繼續」。');$('help').showModal();};
$('helpClose').onclick=()=>$('help').close();
$('coreOnly').onchange=()=>{coreOnly=$('coreOnly').checked;if(classroomEnabled){startClassroom();return;}index=0;selected=0;answered=false;render();};
window.addEventListener('keydown',e=>{
  if(e.target.matches('input,select,textarea')||$('help').open||layout?.isOpen()||paused||e.repeat)return;
  if(actionActive){if(e.target.closest('button,summary,a'))return;actionUI.key(e);return;}
  if(e.code==='Space'&&isDrill()){e.preventDefault();hit();return;}
  if(!isDrill()&&['ArrowLeft','ArrowRight'].includes(e.code)&&!answered){e.preventDefault();selected=(selected+(e.code==='ArrowLeft'?-1:1)+current().options.length)%current().options.length;render();}
  if(e.code==='Enter'&&!e.target.closest('button')){e.preventDefault();answered?(classroomEnabled?null:next()):submit();}
});
window.addEventListener('blur',()=>setPaused(true,'視窗失去焦點，已暫停。回來後按「繼續」。'));
document.addEventListener('visibilitychange',()=>{if(document.hidden){setPaused(true,'切換分頁，已暫停。');stopCamera();}});
window.addEventListener('pagehide',stopCamera);
let frameId;
window.addEventListener('pagehide',event=>{if(!event.persisted){cancelAnimationFrame(frameId);world?.dispose();}});
let lastFrame=performance.now();
function frame(now){const step=simulationStep((now-lastFrame)/1000),dt=Math.min(.05,step.dt);lastFrame=now;if(actionActive&&!paused&&step.stalled)setPaused(true,'畫面更新暫時中斷，球與跑者已一起暫停。按繼續重新準備，不扣分。');if(actionActive&&camera&&!paused&&now-lastPoseAt>750)setPaused(true,'姿態訊號中斷，球與跑者已暫停。確認鏡頭恢復後按繼續。');if(actionActive)actionUI.tick(step.dt);renderClassroom();world?.update(dt,paused);if(!actionActive&&!paused&&isDrill()){const before=tee.stage;tee.tick(performance.now());if(tee.stage!==before){if(tee.result==='waited')feedback('沒有揮擊也沒關係；準備好再試，不扣分。');renderCue();}}frameId=requestAnimationFrame(frame);}
function renderClassroom(){
 document.body.classList.toggle('classroom-active',classroomEnabled);
 const done=actionActive?actionUI?.engine.stage==='done':answered;
 const status=classroomEnabled?(classroom.finished?'本輪全班完成':`目前 1 人操作｜第 ${classroom.slot+1} / ${classroom.count} 位`):'自由練習｜仍限 1 人操作';
 if($('classStatus').textContent!==status)$('classStatus').textContent=status;
 $('classTask').textContent=classroomEnabled&&!classroom.finished?`本位 ${classroom.step+1} / ${classroom.stages.length}：${{batting:'球座打擊',fielding:'看跑者，選傳球目標',knowledge:'規則與判斷'}[classroom.stage]}`:'';
 $('classAdvance').hidden=!classroomEnabled||classroom.finished||classroom.stage===classroom.stages.at(-1);
 $('classAdvance').disabled=!done||paused;
 $('classNext').hidden=!classroomEnabled||classroom.finished;
 $('classNext').textContent=done&&classroom.stage===classroom.stages.at(-1)?'完成本位，下一位 →':'下一位／略過本位';
 $('classEstimate').textContent=`全班約 ${classroom.estimatedMinutes} 分鐘（每位含交接 ${classroom.secondsPerPlayer} 秒的估計；不倒數）`;
 if(actionUI)actionUI.panel.querySelector('.action-rounds').hidden=classroomEnabled;
 if(classroomEnabled)$('next').hidden=true;
}
function loadClassStage(){
 selected=0;answered=false;gate.reset();tee.cancel();world?.reset();
 actionActive=classroom.stage!=='knowledge';
 if(actionActive){actionUI.engine.runnerTime=classroom.runnerTime;actionUI.start(classroom.stage,classroom.stage==='fielding'?classroom.fieldingContext:null,classroom.decisionBudget);}
 else{mode=classroom.scenario.mode;quiz=true;feedback('先看球況與跑者，再判斷。答完請按「完成本位，下一位」。');}
 setPaused(true,'新項目已準備；確認安全後按繼續。');render();
}
function nextClassPlayer(){
 if(!classroomEnabled)return;
 // Reset the raw-pose engine and kit calibration even if the camera stays open.
 actionUI.start('batting');gate.reset();tee.cancel();if(camera){kit.calibrate();tracking='lost';}
 if(!classroom.nextPlayer()){setPaused(true,'本輪全班完成。不記名、不排名；可重開新題序。');renderClassroom();return;}
 loadClassStage();$('cameraStatus').textContent='換人完成：請新同學入定位。鏡頭模式須重新穩定校準，確認安全後按繼續。';
}
function startClassroom(){
 try{classroom.reset({count:Number($('classCount').value),seed:classSeed++,pace:$('classPace').value,knowledge:$('classKnowledge').checked,coreOnly,secondsPerPlayer:Number($('classSeconds').value)});}
 catch(error){$('classSettingsStatus').textContent='請輸入 1–40 人、每位估計 20–300 秒。';return;}
 classroomEnabled=true;correct=0;total=0;$('score').textContent='0 / 0';
 if(camera){kit.calibrate();tracking='lost';}loadClassStage();
 $('classSettingsStatus').textContent='設定已套用，從第 1 位開始；關閉說明後按繼續。';
}
$('classAdvance').onclick=()=>{if(paused)return;const done=actionActive?actionUI.engine.stage==='done':answered;if(done&&classroom.nextStep())loadClassStage();};
$('classNext').onclick=nextClassPlayer;$('classStart').onclick=startClassroom;$('classApply').onclick=startClassroom;
startClassroom();frameId=requestAnimationFrame(frame);
