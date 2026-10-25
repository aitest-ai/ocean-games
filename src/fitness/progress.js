// 本機進度：訓練紀錄、每日任務、活動天數、解鎖、個人最佳。純邏輯，儲存方式由外面傳進來
// （瀏覽器用 store.js 的 localStorage；測試用記憶體），全部只存在這台裝置，不上傳。
//
// 不製造「連續天數」壓力：
// - 主要顯示「本週練了幾天」（目標每週 3 天，休息日是訓練的一部分）。
// - 連續天數只拿來鼓勵；斷了不會出現「中斷」「失敗」等字眼，只說「歡迎回來」。
// - 連續練 4 天以上，會建議明天休息。
import { LEVELS, DAILY_SOFT, DAILY_MAX } from './levels.js';
import { EXERCISES } from '../../packages/taikan-kit/src/exercise/exercises.js';

const KEY = 'progress';
const MAX_SESSIONS = 400;
export const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n)); };

// 每日任務（✏️ 內容與數字可以改）
export const QUEST_POOL = [
  { id: 'session', text: '完成一次完整訓練（含暖身與收操）', goal: 1, need: [], get: (s) => (s.completed ? 1 : 0) },
  { id: 'cooldown', text: '好好做完收操伸展', goal: 1, need: [], get: (s) => (s.cooldownDone ? 1 : 0) },
  { id: 'goodSquat', text: '標準深蹲 12 下', goal: 12, need: ['squat'], get: (s) => s.good?.squat || 0 },
  { id: 'jackCombo', text: '開合跳連擊達到 10', goal: 10, need: ['jack'], max: true, get: (s) => s.maxCombo?.jack || 0 },
  { id: 'legStraight', text: '側抬腿時「上半身直立」做到 10 下', goal: 10, need: ['legRaise'], get: (s) => s.checkOk?.legRaise?.lean || 0 },
  { id: 'quality', text: '一次訓練平均品質 80 分以上', goal: 1, need: [], get: (s) => (s.avgQuality != null && s.avgQuality >= 0.8 ? 1 : 0) },
  { id: 'slowSquat', text: '深蹲「速度剛好」做到 10 下', goal: 10, need: ['squat'], get: (s) => s.checkOk?.squat?.tempo || 0 },
  { id: 'wallHold', text: '靠牆深蹲累積撐 40 秒', goal: 40, need: ['wallSit'], get: (s) => s.reps?.wallSit || 0 },
  { id: 'lungeUpright', text: '弓箭步「上半身直立」做到 8 下', goal: 8, need: ['lunge'], get: (s) => s.checkOk?.lunge?.upright || 0 },
];

function seeded(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; }; }

export class Progress {
  constructor({ load = () => null, save = () => {}, now = () => Date.now() } = {}) {
    this.io = { load, save }; this.now = now;
    this.d = { sessions: [], unlocked: 1, bests: {}, quests: null, weeklyGoal: 3, badges: 0, plans: {}, ...(load(KEY) || {}) };
    this.d.plans ||= {};
  }

  persist() { this.io.save(KEY, this.d); }
  today() { return dayKey(this.now()); }

  // 已解鎖的動作：出現在已解鎖關卡裡的動作
  unlockedExercises() {
    const set = new Set();
    LEVELS.slice(0, this.d.unlocked).forEach((lv) => lv.sets.forEach(([ex]) => set.add(ex)));
    return [...set];
  }

  quests() {
    const t = this.today();
    if (this.d.quests?.date !== t) {
      const have = this.unlockedExercises();
      const pool = QUEST_POOL.filter((q) => q.need.every((x) => have.includes(x)));
      const rnd = seeded(t);
      const pick = [];
      // 第一個固定「完成一次完整訓練」，另外兩個每天不同
      pick.push(pool.find((q) => q.id === 'session'));
      const rest = pool.filter((q) => q.id !== 'session');
      while (pick.length < 3 && rest.length) pick.push(rest.splice(Math.floor(rnd() * rest.length), 1)[0]);
      this.d.quests = { date: t, list: pick.map((q) => ({ id: q.id, text: q.text, goal: q.goal, progress: 0, done: false })) };
      this.persist();
    }
    return this.d.quests.list;
  }

  sessionsOn(day) { return this.d.sessions.filter((s) => s.day === day); }
  todayCount() { return this.sessionsOn(this.today()).length; }

  // 今天還可以練嗎？
  canTrain() {
    const n = this.todayCount();
    if (n >= DAILY_MAX) return { ok: false, text: `今天已經練了 ${n} 次，訓練量夠了。肌肉是在休息時變強的，明天見！` };
    if (n >= DAILY_SOFT) return { ok: true, warn: true, text: `今天已經練了 ${n} 次。再練一次之前，確定身體沒有痠痛或疲勞嗎？` };
    if (this.streak() >= 4) return { ok: true, warn: true, text: `已經連續練了 ${this.streak()} 天，很棒！記得安排休息日，今天可以選「輕鬆」難度。` };
    return { ok: true };
  }

  days() { return [...new Set(this.d.sessions.map((s) => s.day))].sort(); }

  // 連續天數（今天或昨天有練才算延續）
  streak() {
    const set = new Set(this.days());
    let d = this.today();
    if (!set.has(d)) d = addDays(d, -1);
    let n = 0;
    while (set.has(d)) { n++; d = addDays(d, -1); }
    return n;
  }

  // 本週（週一到週日）有練的天數
  weekDays() {
    const now = new Date(this.now());
    const dow = (now.getDay() + 6) % 7;
    const mon = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow));
    return this.days().filter((d) => d >= mon && d <= this.today()).length;
  }

  // 打開時的歡迎詞：斷了也不責備
  welcome() {
    const days = this.days();
    if (!days.length) return '歡迎！先從第一關開始，慢慢來就好。';
    const last = days[days.length - 1], t = this.today();
    if (last === t) return `今天已經練過了，做得好！本週第 ${this.weekDays()} 天。`;
    const gap = Math.round((new Date(t) - new Date(last)) / 86400000);
    if (gap >= 3) return '歡迎回來！休息一陣子很正常，今天可以從「輕鬆」難度開始。';
    return `本週已經練了 ${this.weekDays()} 天（目標 ${this.d.weeklyGoal} 天）。`;
  }

  // 記錄一次訓練（完成或中途停止都記），回傳這次的新紀錄、解鎖與完成的任務
  record(summary, { stars = 1, score = 0 } = {}) {
    const day = this.today();
    const s = { ...summary, day, at: this.now(), stars, score };
    this.d.sessions.push(s);
    if (this.d.sessions.length > MAX_SESSIONS) this.d.sessions.splice(0, this.d.sessions.length - MAX_SESSIONS);
    const out = { newBests: [], unlocked: null, questsDone: [] };
    // 解鎖：完整做完（含收操）才解鎖下一關，跟連續天數無關
    const idx = LEVELS.findIndex((l) => l.id === summary.levelId);
    if (summary.completed && idx >= 0 && idx + 1 >= this.d.unlocked && idx + 1 < LEVELS.length) { this.d.unlocked = idx + 2; out.unlocked = LEVELS[idx + 1]; }
    // 訓練計畫：完整做完才前進到下一次
    if (summary.planId && summary.completed) this.d.plans[summary.planId] = Math.max(this.d.plans[summary.planId] || 0, (summary.planIndex ?? 0) + 1);
    // 個人最佳：「標準的次數」與連擊（不是總次數，鼓勵品質）
    for (const ex of Object.keys(EXERCISES)) {
      const b = (this.d.bests[ex] ||= { good: 0, combo: 0 });
      if ((summary.good?.[ex] || 0) > b.good) { b.good = summary.good[ex]; out.newBests.push(`${EXERCISES[ex].name}：一次訓練標準 ${b.good} 下`); }
      if ((summary.maxCombo?.[ex] || 0) > b.combo) { b.combo = summary.maxCombo[ex]; out.newBests.push(`${EXERCISES[ex].name}：最高 ${b.combo} 連擊`); }
    }
    const bq = this.d.bests.quality || 0;
    if (summary.avgQuality != null && summary.completed && summary.avgQuality > bq) { this.d.bests.quality = summary.avgQuality; if (bq) out.newBests.push(`平均品質 ${Math.round(summary.avgQuality * 100)} 分`); }
    // 每日任務
    for (const q of this.quests()) {
      if (q.done) continue;
      const def = QUEST_POOL.find((x) => x.id === q.id);
      const v = def.get(summary);
      q.progress = def.max ? Math.max(q.progress, v) : q.progress + v;
      if (q.progress >= q.goal) { q.progress = q.goal; q.done = true; this.d.badges++; out.questsDone.push(q.text); }
    }
    this.persist();
    return out;
  }

  planNext(planId) { return this.d.plans[planId] || 0; }

  clear() { this.d = { sessions: [], unlocked: 1, bests: {}, quests: null, weeklyGoal: 3, badges: 0, plans: {} }; this.persist(); }
}
