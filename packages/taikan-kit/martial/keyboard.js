// 武術用的鍵盤／滑鼠模擬：按鍵操作全身模擬人偶，人偶每秒產生 30 格骨架，
// 交給跟鏡頭模式一樣的辨識流程（原本的 Recognizer 負責舉手開始／暫停，MartialRecognizer 負責武術動作）。
import { MartialPuppet, applyAction } from './puppet.js';

export const MARTIAL_KEYMAP = [
  { keys: ['KeyF'], label: 'F', action: 'punch-left', text: '左拳' },
  { keys: ['KeyJ'], label: 'J', action: 'punch-right', text: '右拳' },
  { keys: ['KeyW'], label: 'W', toggle: 'wide', text: '腳張開／併攏（切換）' },
  { keys: ['ArrowDown', 'KeyS'], label: '↓ / S', hold: 'down', text: '慢慢蹲低（按住）' },
  { keys: ['ArrowUp'], label: '↑', hold: 'up', text: '慢慢站起來（按住）' },
  { keys: ['KeyI'], label: 'I', hold: 'leanFwd', text: '上身往前傾（按住，測試提醒）' },
  { keys: ['KeyK'], label: 'K', toggle: 'kneesIn', text: '膝蓋內夾（切換，測試提醒）' },
  { keys: ['KeyZ'], label: 'Z', action: 'knee-left', text: '左腳提膝（實驗）' },
  { keys: ['KeyX'], label: 'X', action: 'knee-right', text: '右腳提膝（實驗）' },
  { keys: ['KeyQ'], label: 'Q', hold: 'raiseL', text: '舉左手（按住）' },
  { keys: ['KeyE'], label: 'E', hold: 'raiseR', text: '舉右手（按住）' },
  { keys: ['Enter'], label: 'Enter', hold: 'raiseBoth', text: '雙手舉高（按住）' },
];

export class MartialKeyboardSource {
  constructor({ target = window, fps = 30, jitter = 0.003 } = {}) {
    this.name = 'keyboard';
    this.target = target;
    this.fps = fps;
    this.puppet = new MartialPuppet({ seed: 7, jitter });
    this.onKey = this.onKey.bind(this);
  }

  // 畫面按鈕用：press('punch-left')、press('down', true/false)、press('wide')（切換）
  press(name, on = true) {
    const P = this.puppet;
    if (name === 'raiseBoth') { P.set('raiseL', on); P.set('raiseR', on); return; }
    const m = MARTIAL_KEYMAP.find((k) => k.toggle === name);
    if (m) { if (on) P.set(name, !P.hold[name]); return; }
    if (name in P.hold) P.set(name, on);
    else if (on) applyAction(P, name, performance.now());
  }

  onKey(e) {
    const down = e.type === 'keydown';
    const m = MARTIAL_KEYMAP.find((k) => k.keys.includes(e.code));
    if (!m) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
    e.preventDefault();
    if (m.hold) this.press(m.hold, down);
    else if (down && !e.repeat) this.press(m.toggle || m.action, true);
  }

  async start(onPose) {
    this.target.addEventListener('keydown', this.onKey);
    this.target.addEventListener('keyup', this.onKey);
    this.blur = () => { for (const k of ['down', 'up', 'leanFwd', 'raiseL', 'raiseR']) this.puppet.set(k, false); };
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
