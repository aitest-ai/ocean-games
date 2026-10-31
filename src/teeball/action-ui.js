import { ActionRound } from './action-logic.js';
const $ = id => document.getElementById(id);
const say=(id,text)=>{if($(id).textContent!==text)$(id).textContent=text;};
const bases={1:'右方・一壘',2:'前方・二壘',3:'左方・三壘',4:'後方・本壘'};
export class ActionUI {
 constructor({world, stopCamera, isCamera, isPaused, feedback, requestPause}){
  Object.assign(this,{world,stopCamera,isCamera,isPaused,feedback,requestPause});this.engine=new ActionRound();this.kind='batting';this.engine.start(this.kind);
  const panel=document.createElement('article');panel.id='actionPanel';panel.className='question-panel';
  panel.innerHTML=`<div class="question-meta"><span>動作實戰・兩回合試玩</span><span id="actionInput"></span></div><h2 id="actionTitle"></h2><p id="actionDescription"></p><div id="actionStage" class="cue" role="status"></div><div class="action-rounds"><button data-round="batting" aria-pressed="true">① 球座打擊</button><button data-round="fielding" aria-pressed="false">② 傳二壘封殺</button></div><p id="actionHint"></p><div class="action-diagram"><svg id="trajectoryView" viewBox="-1 -1 2 2" role="img" aria-label="雙手中點路徑與虛擬接觸區"><rect x="-.16" y=".25" width=".32" height=".60" fill="#a4edb833" stroke="#a4edb8" stroke-width=".025"/><polyline id="handTrail" fill="none" stroke="#ffcc67" stroke-width=".035"/><circle id="handPoint" r=".055" fill="#fff"/></svg><span>相對身體的雙手中點示意（不是球棒追蹤）</span></div><div id="actionBatControls" class="action-buttons"><button data-action="ready">模擬：準備 / R</button><button data-action="load">模擬：引棒 / L</button><button data-action="swing">模擬：小幅揮擊 / 空白鍵</button></div><div id="actionThrowControls" class="action-buttons" hidden><button data-action="ready">模擬：持球就緒 / R</button><div class="direction-pad"><button data-direction="2">↑ 前・二壘</button><button data-direction="3">← 左・三壘</button><button data-direction="1">→ 右・一壘</button><button data-direction="4">↓ 後・本壘</button></div><button data-action="collect">模擬：胸前收手 / C</button><button data-action="throw">模擬：向前送出 / 空白鍵</button></div><p class="simulation-note">上述按鈕／鍵盤是完整動作流程的「模擬輸入」，不會聲稱量到真人揮速或力道。開啟鏡頭後可空手小幅操作；按模擬鍵會關閉鏡頭。</p><div id="actionResult" class="feedback" role="status" aria-live="polite"></div><div class="action-buttons"><button id="actionReplay" hidden>重播本次動作</button><button id="actionRestart">重新準備</button></div><p id="actionTimeline"></p>`;
  $('choices').closest('article').before(panel);this.panel=panel;
  panel.querySelectorAll('[data-round]').forEach(b=>b.onclick=()=>this.start(b.dataset.round));
  panel.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>this.simulate(b.dataset.action));
  panel.querySelectorAll('[data-direction]').forEach(b=>b.onclick=()=>this.simulate('direction',Number(b.dataset.direction)));
  $('actionRestart').onclick=()=>this.start(this.kind);
  $('actionReplay').onclick=()=>{if(this.isPaused())return;const s=this.engine.snapshot;this.replay=s.kind==='batting'?Math.max(0,(s.contactAt||0)-.6):0;};
 }
 start(kind){this.kind=kind;this.engine.start(kind);this.engine.setPaused(this.isPaused());this.replay=null;this.world?.reset();this.render();}
 setPaused(v,message){this.pauseReason=message;this.engine.setPaused(v);}
 pose(p){if(!this.isCamera())return;const names=['leftShoulder','rightShoulder','leftHip','rightHip','leftWrist','rightWrist'];if(names.some(n=>!p?.kp?.[n]||p.kp[n].v<.5)){this.requestPause('雙手或軀幹看不清，球與跑者已暫停。調整後按繼續。');return;}this.engine.pose(p);}
 simulate(action,value){if(this.isPaused())return;if(this.isCamera())this.stopCamera();this.engine.simulate(action,value);this.render();}
 key(e){const map={KeyR:'ready',KeyL:'load',KeyC:'collect',Space:this.kind==='batting'?'swing':'throw'};if(map[e.code]){e.preventDefault();this.simulate(map[e.code]);return;}const dirs={ArrowUp:2,ArrowRight:1,ArrowLeft:3,ArrowDown:4};if(this.kind==='fielding'&&dirs[e.code]){e.preventDefault();this.simulate('direction',dirs[e.code]);}}
 tick(dt){this.engine.tick(dt);const s=this.engine.snapshot;
  for(const event of this.engine.drainEvents())if(event.type==='tracking-lost')this.requestPause('雙手或軀幹暫時看不清，球與跑者已暫停。請調整後按繼續。');
  if(this.replay!=null){if(!this.isPaused())this.replay+=dt*.7;const end=s.kind==='batting'?(s.contactAt||0)+2.3:Math.max(s.runnerTime,(s.releaseAt||0)+s.flightTime+s.catchTime);this.world?.setAction({...s,elapsed:Math.min(this.replay,end),replay:true});if(this.replay>=end)this.replay=null;}else this.world?.setAction(s);
  this.render();}

 render(){
  const s=this.engine.snapshot,bat=this.kind==='batting';
  $('actionInput').textContent=this.isCamera()?'鏡頭・2D 動作近似':'觸控／鍵盤・模擬';
  $('actionTitle').textContent=bat?'球不會跑掉：瞄準球座再揮':'一壘有人：判斷並傳二壘封殺';
  $('actionDescription').textContent=bat?'先穩定準備，雙手一起小幅引向一側，再穿過中央接觸區。不追求大力；這不是實際球棒／力道量測。':'守備員已持球；準備完成才出現口令並啟動跑者。前＝二壘、右＝一壘、左＝三壘、後＝本壘；換鏡頭不改方向。';
  say('actionStage',this.isPaused()?'已暫停：球與跑者一起停下':`階段：${({calibrating:'穩定校準',ready:'準備好',waiting:'等待準備',idle:'等待準備',loaded:'已引棒',backswing:'已引棒',swing:'揮擊',flight:'球飛行中',active:'持球判斷',collected:'已收手',result:'本回合結果',done:'本回合完成'})[s.stage]||s.stage}`);
  $('actionHint').textContent=this.isPaused()?(this.pauseReason||'已暫停。確認安全後按繼續，再穩定準備。'):bat?'鏡頭：雙手靠近胸前穩定 → 小幅移向一側引棒 → 掃過中央。接觸位置與舒適速度近似值影響教學球路；沒有強迫出棒倒數。':'鏡頭：回正穩定就緒 → 手先放低、小幅左右傾預覽方向（回正＝二壘）→ 收回胸前 → 向畫面上方小幅送手。後方以肩上準備替代；不是精確轉身或 3D 投球偵測。';
  $('actionBatControls').hidden=!bat;$('actionThrowControls').hidden=bat;$('trajectoryView').parentElement.hidden=!bat;
  this.panel.querySelectorAll('[data-round]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.round===this.kind)));
  this.panel.querySelectorAll('[data-direction]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.direction)===s.direction)));
  const replayTrail=this.replay!=null?(s.trajectory||[]).filter(p=>p.t<=this.replay):(s.trajectory||[]);
  const pts=replayTrail.map(p=>`${p.x},${p.y}`).join(' ');$('handTrail').setAttribute('points',pts);const p=replayTrail.at(-1);$('handPoint').setAttribute('cx',p?.x||0);$('handPoint').setAttribute('cy',p?.y||0);
  this.panel.querySelectorAll('[data-action]').forEach(b=>{const stages={ready:'calibrating',load:'ready',swing:'loaded',collect:'ready',throw:'collected'};b.disabled=this.isPaused()||s.stage!==stages[b.dataset.action];});
  this.panel.querySelectorAll('[data-direction]').forEach(b=>b.disabled=this.isPaused()||s.stage!=='ready');
  const r=s.result;$('actionReplay').hidden=!r||s.stage!=='done';
  say('actionResult',r ? (!bat&&s.stage==='flight'?'傳球進行中：等待球到、接穩並踩壘，再看本回合結果。':this.resultText(r,s)) : bat?'先確認四周安全，雙手與軀幹保持入鏡。':'目標是讓二壘隊友接穩並踩壘，比一壘跑者先到。選錯壘再快也不算成功。');
  $('actionTimeline').textContent=bat?'':`固定方向：${bases[s.direction]||'前方・二壘'} ｜ 跑者 ${Number(s.elapsed||0).toFixed(2)} / ${Number(s.runnerTime||3.2).toFixed(2)} 秒（遊戲時間，非真實跑速）`;
 }
 resultText(r,s){
  const prefix=r.simulated?'【模擬輸入】':'【鏡頭 2D 近似】';
  if(r.outcome==='contact')return `${prefix}碰到接觸區！位置品質 ${Math.round(r.quality*100)}%。${r.simulated?'球路使用預設舒適速度，不代表真人數據。':'球路使用有上限的舒適移動速度近似，不是力量測量。'}可重播觀察路徑。`;
  if(r.outcome==='miss')return `${prefix}這次路徑沒有穿過接觸區。球留在座上，重新準備即可，不用揮得更用力。`;
  const verdict={'correct-fast':'方向正確，而且接穩踩壘先到：封殺成功！','correct-late':'方向正確，但接穩踩壘較晚：跑者安全到二壘。','wrong':'傳錯壘包：即使很快，也無法完成二壘封殺。'}[r.outcome];
  return `${prefix}${verdict} 判斷／出手 ${r.throwElapsed.toFixed(2)} 秒 + 球飛行 ${s.flightTime.toFixed(2)} 秒 + 接穩踩壘 ${s.catchTime.toFixed(2)} 秒 = ${r.arrival.toFixed(2)} 秒；跑者 ${r.runnerTime.toFixed(2)} 秒。`;
 }

}
