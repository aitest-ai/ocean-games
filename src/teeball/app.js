import { createTaikan, CameraSource } from '../../packages/taikan-kit/src/index.js';
import { SCENARIOS } from './scenarios.js';
import { ChoiceGate, TeeDrill, grade, canUseCameraAction } from './logic.js';
import { CameraSession } from './camera-session.js';
const $ = id => document.getElementById(id);
const gate = new ChoiceGate(), tee = new TeeDrill();
const kit = createTaikan({ sensitivity:'normal', disabled:['jump','swing','paddle','crouch'], sideOk:true });
let mode='batting', quiz=false, index=0, selected=0, answered=false, correct=0, total=0, paused=false;
const cameraSession = new CameraSession(()=>new CameraSource({video:$('video'),numPoses:2}), source=>kit.use(source), ()=>kit.stop());
let camera=false, tracking='lost', coreOnly=true, attempt=1;
const names={batting:'打擊準備站',running:'跑壘與停壘',fielding:'守備傳球站'};
const baseNames=['本壘（打者）','一壘','二壘','三壘','本壘'];
const ballNames={onTee:'球在打擊座上',fairGroundBall:'有效落地球',held:'守備員持球',caughtFlyDead:'接殺後裁判宣告死球',resetDead:'裁判宣告本次攻防結束',liveHeld:'比賽進行中',fielderControlled:'守備員穩定持球',calledFoul:'裁判宣告無效界外球'};
const statusNames={onBase:'停在壘上',safeOnBase:'安全到壘',advancing:'前進中',forced:'須前進',committed:'已越過不回頭線',returning:'回原壘'};
const list=()=>SCENARIOS.filter(s=>s.mode===mode&&(!coreOnly||!s.requiresProfile?.length));
const current=()=>list()[index%list().length];
const isDrill=()=>mode==='batting'&&!quiz;
function feedback(text){$('feedback').textContent=text;}
function drawScene(s){
  const positions=[[300,413],[474,239],[300,65],[126,239],[300,413]];
  $('runners').replaceChildren();
  for(const [i,r] of (s?.runners||[]).entries()){
    const [x,y]=positions[r.base]; const node=document.createElementNS('http://www.w3.org/2000/svg','g');
    node.innerHTML=`<circle cx="${x-17}" cy="${y-26-i*3}" r="14" fill="#f5a453" stroke="#fff8df" stroke-width="2"/><text x="${x-17}" y="${y-21-i*3}" fill="#243d32" text-anchor="middle" font-size="12" font-weight="900">${r.base===0?'打':r.base}</text>`;
    $('runners').append(node);
  }
  $('tee').style.display=isDrill()||s?.ball.state==='onTee'?'':'none';
  $('fieldCaption').textContent=isDrill()?'球在打擊座上，不是投手投來的球':ballNames[s.ball.state]||'請看題目球況';
  $('ball').setAttribute('transform',s?.ball.holderBase?`translate(${positions[s.ball.holderBase][0]-300} ${positions[s.ball.holderBase][1]-330})`:'');
  $('facts').textContent=isDrill()?'打擊準備與安全口令練習。綠燈不是投球；只做空手小幅動作。':[
    `球況：${ballNames[s.ball.state]||'依題目敘述'}`,
    `跑者：${s.runners.length?s.runners.map(r=>`${baseNames[r.base]}${statusNames[r.status]||''}${r.destination&&r.destination!==r.base?' → '+baseNames[r.destination]:''}`).join('、'):'壘上無人'}`,
    `出局數：${s.outs}（本版不模擬完整局數）`,
    s.receiverReady?`已就位的接球隊友：${s.receiverReady.map(b=>baseNames[b]).join('、')}`:''
  ].filter(Boolean).join('\n');
}
function render(){
  $('score').textContent=`${correct} / ${total}`;
  $('sceneTag').textContent=names[mode]; $('station').textContent=names[mode];
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  const drill=isDrill(), s=current();
  $('teeCue').hidden=!drill; $('batButtons').hidden=!drill; $('batQuiz').hidden=mode!=='batting';
  $('batQuiz').textContent=quiz?'切換：空手打擊準備':'切換：打擊觀念題';
  $('confirm').hidden=drill||answered; $('next').hidden=drill||!answered;
  $('choices').replaceChildren();
  if(drill){
    $('questionCount').textContent=`第 ${attempt} 次練習`;
    $('question').textContent='先確認四周沒有同學';
    $('context').textContent='球固定在打擊座上。按「開始準備」，等綠燈再做空手小幅打擊。只練安全準備，不判定正式比賽好壞球。';
  }else{
    $('questionCount').textContent=`題 ${index+1} / ${list().length}`;
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
  gate.reset();tee.cancel();
  if(message)feedback(message);renderCue();
}
function switchMode(next){mode=next;quiz=false;index=0;selected=0;answered=false;tee.cancel();gate.reset();feedback('先讀題目，不用搶快。');render();}
function submit(){
  if(paused||answered||isDrill())return;
  const result=grade(current(),current().options[selected].id);if(!result)return;
  answered=true;total++;if(result.correct)correct++;
  feedback(`${result.correct?'判斷正確！':'再想想：'} ${result.explanation}`);render();
}
function hit(){
  if(paused||!isDrill())return; const result=tee.hit(performance.now()); if(!result)return;
  total++;if(result==='safe')correct++;
  feedback(result==='safe'?'做得好！先確認安全才揮擊。正式擊出有效球後，要安全放棒並依序跑壘。':'剛才還在確認活動區。先等準備好再開始，這不是正式比賽的好壞球判定。');
  attempt++;render();
}
function next(){if(paused||!answered)return;index=(index+1)%list().length;selected=0;answered=false;gate.reset();feedback('看清楚球與跑者的位置，再選答案。');render();}
async function startCamera(){
  if(camera||cameraSession.pending)return;
  $('camera').disabled=true;$('cameraStatus').textContent='正在載入姿態模型並要求鏡頭權限…';
  try{
    if(!await cameraSession.start())return;
    camera=true;tracking=kit.state.tracking || 'lost';$('cameraDot').classList.add('on');$('stopCamera').hidden=false;$('calibrate').hidden=false;
    $('inputHelp').textContent='鏡頭：左右微傾選答案，回正再選下一格；雙手舉起確認。打擊站空手小幅揮擊。也可直接按按鈕。';
    setPaused(true,'等身體與雙手進入畫面，按「繼續」。');$('cameraStatus').textContent='鏡頭已開啟。請保持坐／站姿，讓軀幹和雙手入鏡。';
  }catch(error){camera=false;$('cameraStatus').textContent='鏡頭無法啟動：請確認 HTTPS／權限。可直接用觸控或鍵盤繼續。';}
  finally{$('camera').disabled=camera;}
}
function stopCamera(){
  cameraSession.stop();camera=false;tracking='lost';$('camera').disabled=cameraSession.pending;$('stopCamera').hidden=true;$('calibrate').hidden=true;$('cameraDot').classList.remove('on');
  $('cameraStatus').textContent='鏡頭已關閉。可用觸控或鍵盤繼續。';$('inputHelp').textContent='觸控按答案；鍵盤 ← → 選擇、Enter 確認。打擊站用空白鍵。';gate.reset();tee.cancel();renderCue();
}
kit.on('status',event=>{
  if(!camera)return;
  if(event.tracking){tracking=event.tracking;$('cameraStatus').textContent=event.tracking==='ok'?'辨識正常；左右微傾選答案，雙手舉起確認。':event.hint||'請回到鏡頭中央。';
    if(event.tracking!=='ok')setPaused(true,'鏡頭辨識暫停，不扣分。調整後按「繼續」，或關閉鏡頭改用按鈕。');}
});
kit.on('action',event=>{
  if(!canUseCameraAction({camera,active:!$('help').open,paused,tracking}))return;
  if(isDrill()){if(event.type==='bat')hit();return;}
  if(answered)return;
  const action=gate.action(event,performance.now(),current().options.length,selected);
  if(action?.type==='select'){selected=action.index;render();} else if(action?.type==='confirm')submit();
});
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>switchMode(b.dataset.mode)));
$('batQuiz').onclick=()=>{quiz=!quiz;index=0;selected=0;answered=false;tee.cancel();gate.reset();feedback('先讀題目，不用搶快。');render();};
$('arm').onclick=()=>{if(paused)return;tee.arm(performance.now());feedback('等待練習區準備好。綠燈不是投球，只是安全提示。');renderCue();};
$('hit').onclick=hit;$('confirm').onclick=submit;$('next').onclick=next;
$('camera').onclick=startCamera;$('stopCamera').onclick=stopCamera;
$('calibrate').onclick=()=>{kit.calibrate();tracking='lost';setPaused(true,'換人或換姿勢後重新校準；穩定後按「繼續」。');};
$('pause').onclick=()=>{if(paused&&camera&&tracking!=='ok'){feedback('請先讓鏡頭正常辨識，或關閉鏡頭改用按鈕。');return;}setPaused(!paused,paused?'繼續練習，打擊站請重新按「開始準備」。':'已暫停，可以休息。');};
$('reset').onclick=()=>{correct=0;total=0;attempt=1;switchMode(mode);setPaused(true,'已清空本輪。換人後請重新校準或按「繼續」。');if(camera)kit.calibrate();};
$('helpOpen').onclick=()=>{setPaused(true,'規則與說明開啟中。關閉後請按「繼續」。');$('help').showModal();};
$('helpClose').onclick=()=>$('help').close();
$('coreOnly').onchange=()=>{coreOnly=$('coreOnly').checked;index=0;selected=0;answered=false;render();};
window.addEventListener('keydown',e=>{
  if(e.target.matches('input,select,textarea')||$('help').open||paused||e.repeat)return;
  if(e.code==='Space'&&isDrill()){e.preventDefault();hit();return;}
  if(!isDrill()&&['ArrowLeft','ArrowRight'].includes(e.code)&&!answered){e.preventDefault();selected=(selected+(e.code==='ArrowLeft'?-1:1)+current().options.length)%current().options.length;render();}
  if(e.code==='Enter'&&!e.target.closest('button')){e.preventDefault();answered?next():submit();}
});
window.addEventListener('blur',()=>setPaused(true,'視窗失去焦點，已暫停。回來後按「繼續」。'));
document.addEventListener('visibilitychange',()=>{if(document.hidden){setPaused(true,'切換分頁，已暫停。');stopCamera();}});
window.addEventListener('pagehide',stopCamera);
function frame(){if(!paused&&isDrill()){const before=tee.stage;tee.tick(performance.now());if(tee.stage!==before){if(tee.result==='waited')feedback('沒有揮擊也沒關係；準備好再試，不扣分。');renderCue();}}requestAnimationFrame(frame);}
render();requestAnimationFrame(frame);
