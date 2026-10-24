// 鍵盤／滑鼠模擬：按鍵操作「模擬人偶」，人偶以每秒 30 格的速度產生骨架，交給辨識器。
// 也就是說，鍵盤模擬走的是跟鏡頭完全一樣的辨識流程（不是直接送事件）。
import { Puppet } from '../puppet.js';

export const KEYMAP = [
  { keys: ['KeyA'], label: 'A', action: 'paddle-left', text: '左邊划槳' },
  { keys: ['KeyD'], label: 'D', action: 'paddle-right', text: '右邊划槳' },
  { keys: ['KeyW'], label: 'W', action: 'paddle-both', text: '雙手一起划（雙槳）' },
  { keys: ['ArrowLeft'], label: '←', hold: 'leanL', text: '身體向左傾（按住）' },
  { keys: ['ArrowRight'], label: '→', hold: 'leanR', text: '身體向右傾（按住）' },
  { keys: ['ArrowDown', 'KeyS'], label: '↓ / S', hold: 'crouch', text: '蹲低／身體前彎（按住）' },
  { keys: ['Space'], label: '空白鍵', action: 'jump', text: '跳躍' },
  { keys: ['KeyQ'], label: 'Q', hold: 'raiseL', text: '舉左手（按住）' },
  { keys: ['KeyE'], label: 'E', hold: 'raiseR', text: '舉右手（按住）' },
  { keys: ['Enter'], label: 'Enter', hold: 'raiseBoth', text: '雙手舉高（按住）' },
  { keys: ['KeyJ'], label: 'J', action: 'swing-left', text: '右手往左揮' },
  { keys: ['KeyL'], label: 'L', action: 'swing-right', text: '左手往右揮' },
];

export class KeyboardSource {
  constructor({ target = window, fps = 30, jitter = 0.003 } = {}) {
    this.name = 'keyboard';
    this.target = target;
    this.fps = fps;
    this.puppet = new Puppet({ seed: 7, jitter });
    this.onKey = this.onKey.bind(this);
  }

  // 給畫面上的按鈕用（滑鼠點、觸控都可以）
  press(actionOrHold, on = true) {
    const P = this.puppet;
    if (actionOrHold === 'raiseBoth') { P.set('raiseL', on); P.set('raiseR', on); return; }
    if (actionOrHold in P.hold) P.set(actionOrHold, on);
    else if (on) P.trigger(actionOrHold, performance.now());
  }

  onKey(e) {
    const down = e.type === 'keydown';
    const m = KEYMAP.find((k) => k.keys.includes(e.code));
    if (!m) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    if (m.hold) this.press(m.hold, down);
    else if (down && !e.repeat) this.press(m.action, true);
  }

  async start(onPose) {
    this.target.addEventListener('keydown', this.onKey);
    this.target.addEventListener('keyup', this.onKey);
    this.blur = () => { for (const k in this.puppet.hold) this.puppet.set(k, false); };
    window.addEventListener('blur', this.blur);
    this.timer = setInterval(() => onPose(this.puppet.step(performance.now())), 1000 / this.fps);
  }

  stop() {
    clearInterval(this.timer);
    this.target.removeEventListener('keydown', this.onKey);
    this.target.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.blur);
  }
}
