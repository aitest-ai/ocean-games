// 冒險模式的資料：怪獸、關卡、暖身與收操。
//
// 故事（✏️ 我的選擇，可以改）：「沙發怪獸」是久坐習慣變成的小怪物——懶骨頭史萊姆、遙控器小妖、
// 零食大王……每次訓練就是一場對戰：暖身集氣 → 主訓練用技能攻擊（每一組是一招）→ 收操把怪獸封印。
// 怪獸的血量依「預定次數」設計：做完全部次數就一定打得倒，動作越標準只是傷害與分數越高，
// 不會因為姿勢不好而「輸掉」。

// 每個動作是一招技能
export const SKILLS = {
  squat: { name: '大地重擊', icon: '💥', verb: '蹲下蓄力、站起來釋放', color: '#ffb547' },
  jack: { name: '星光連擊', icon: '⭐', verb: '一下一顆星，連續標準就連擊', color: '#7fd4ff' },
  legRaise: { name: '旋風踢', icon: '🌀', verb: '左右輪流踢出旋風', color: '#b48cff' },
  stepJack: { name: '星光連擊', icon: '⭐', verb: '不用跳，左右輪流踏出去', color: '#7fd4ff' },
  highKnees: { name: '疾風衝刺', icon: '🏃', verb: '膝蓋輪流抬高，衝向怪獸', color: '#5fd39a' },
  march: { name: '疾風踏步', icon: '🚶', verb: '抬膝踏步，不用跳', color: '#5fd39a' },
  lunge: { name: '突進斬', icon: '🤺', verb: '往前跨步、往下蹲，左右輪流', color: '#ff8a65' },
  calfRaise: { name: '踮腳雷擊', icon: '⚡', verb: '踮起腳尖、停一下、慢慢放下', color: '#ffd166' },
  wallSit: { name: '鐵壁護盾', icon: '🛡️', verb: '靠牆撐住，每撐一秒護盾就反擊一次', color: '#9fb7ff' },
  sitStand: { name: '大地重擊（椅子）', icon: '💥', verb: '從椅子站起來釋放', color: '#ffb547' },
  seatedKnee: { name: '膝擊', icon: '🦵', verb: '坐著左右輪流抬膝', color: '#b48cff' },
  seatedArms: { name: '星光連擊（坐姿）', icon: '⭐', verb: '坐著雙手舉高', color: '#7fd4ff' },
  plank: { name: '鐵壁', icon: '🧱', verb: '身體一直線撐住', color: '#9fb7ff' },
  pushUp: { name: '推波', icon: '🌊', verb: '推起來釋放海浪', color: '#63b8ff' },
  bridge: { name: '彩虹橋', icon: '🌈', verb: '把髖推上去', color: '#ff9ad5' },
};

// 怪獸外觀全部用程式畫（不用任何外部圖片或模型）
export const MONSTERS = {
  slime: { name: '懶骨頭史萊姆', body: '#7ccf8a', eye: 'sleepy', shape: 'blob', line: '躺著好舒服……不想動……' },
  remote: { name: '遙控器小妖', body: '#5a6b7d', eye: 'shifty', shape: 'remote', line: '再看一集就好！再一集！' },
  snack: { name: '零食大王', body: '#e9a23b', eye: 'greedy', shape: 'bag', line: '洋芋片配汽水才是人生！' },
  sofa: { name: '沙發巨獸', body: '#a0525a', eye: 'grumpy', shape: 'sofa', line: '坐下來……永遠坐下來……' },
  screen: { name: '螢幕魔王', body: '#3c4a8c', eye: 'glow', shape: 'screen', line: '滑手機滑到天亮吧！' },
  elevator: { name: '電梯精靈', body: '#8a8f99', eye: 'shifty', shape: 'remote', line: '走樓梯？搭我就好啦～' },
  chair: { name: '辦公椅幽靈', body: '#4d5b6b', eye: 'sleepy', shape: 'sofa', line: '坐著就好、坐著就好……' },
  takeout: { name: '外送巨龍', body: '#c0392b', eye: 'greedy', shape: 'bag', line: '不用出門，什麼都送到家！' },
};

// 關卡：sets = [[動作, 次數], ...]（側抬腿是「每邊」次數）；rest = 組間休息秒數
export const LEVELS = [
  { id: 'c1-1', chapter: '第一章 客廳保衛戰', name: '起床囉', monster: 'slime', rest: 40, sets: [['squat', 8], ['squat', 8]], intro: '第一關只用「大地重擊」：蹲下蓄力、站起來攻擊。' },
  { id: 'c1-2', chapter: '第一章 客廳保衛戰', name: '搶回遙控器', monster: 'remote', rest: 40, sets: [['squat', 8], ['jack', 15], ['squat', 8]], intro: '新技能「星光連擊」：開合跳，連續標準就能連擊。' },
  { id: 'c1-3', chapter: '第一章 客廳保衛戰', name: '零食櫃危機', monster: 'snack', rest: 45, sets: [['jack', 15], ['legRaise', 6], ['squat', 10], ['jack', 15]], intro: '新技能「旋風踢」：側抬腿，左右輪流。' },
  { id: 'c1-4', chapter: '第一章 客廳保衛戰', name: '沙發陷阱', monster: 'sofa', rest: 45, sets: [['squat', 10], ['legRaise', 8], ['jack', 20], ['squat', 10]] },
  { id: 'c1-5', chapter: '第一章 客廳保衛戰', name: '魔王：螢幕之夜', monster: 'screen', rest: 50, sets: [['jack', 20], ['squat', 12], ['legRaise', 8], ['jack', 20], ['squat', 12]], boss: true },
  { id: 'c2-1', chapter: '第二章 城市大冒險', name: '電梯罷工', monster: 'elevator', rest: 45, sets: [['highKnees', 10], ['squat', 10], ['calfRaise', 12], ['highKnees', 10]], intro: '新技能「疾風衝刺」（高抬腿）與「踮腳雷擊」（提踵）。' },
  { id: 'c2-2', chapter: '第二章 城市大冒險', name: '辦公椅的詛咒', monster: 'chair', rest: 50, sets: [['lunge', 8], ['wallSit', 20], ['jack', 20], ['lunge', 8]], intro: '新技能「突進斬」（弓箭步）與「鐵壁護盾」（靠牆深蹲，撐住幾秒）。' },
  { id: 'c2-3', chapter: '第二章 城市大冒險', name: '魔王：外送巨龍', monster: 'takeout', rest: 55, sets: [['highKnees', 12], ['lunge', 8], ['wallSit', 25], ['squat', 12], ['calfRaise', 15], ['jack', 20]], boss: true },
];

// 低衝擊（不跳）：開合跳 → 低衝擊開合跳、高抬腿 → 抬膝踏步
export const LOW_IMPACT = { jack: 'stepJack', highKnees: 'march' };

// 難度只改次數（✏️ 數字可以改）
export const DIFFS = {
  easy: { label: '輕鬆', mult: 0.6, note: '剛開始運動、或今天比較累' },
  normal: { label: '標準', mult: 1, note: '一般成人' },
  hard: { label: '進階', mult: 1.3, note: '已經有運動習慣' },
};

// 暖身與收操：每一段有時間、示範人偶的動作、提示。用鏡頭時「看到人」才會倒數（真的要做）。
// detect：'move' = 要看到身體在動才打勾；'still' = 伸展要保持不動；null = 只要在畫面裡
export const WARMUP = [
  { id: 'march', name: '原地踏步', sec: 40, coach: 'walkInPlace', detect: 'move', tip: '膝蓋輕輕抬起、雙手自然擺動，讓身體暖起來' },
  { id: 'arms', name: '手臂繞圈', sec: 30, coach: 'armCircle', detect: 'move', tip: '雙手打開，往前繞 15 秒、往後繞 15 秒' },
  { id: 'halfSquat', name: '慢速半蹲', sec: 30, coach: 'halfSquat', detect: 'move', tip: '只蹲一半，慢慢下、慢慢起，膝蓋跟腳尖同方向' },
  { id: 'sideReach', name: '側邊伸展', sec: 30, coach: 'sideReach', detect: null, tip: '一手舉高往另一邊伸展，左右輪流，不要憋氣' },
];
export const COOLDOWN = [
  { id: 'walk', name: '原地慢走、深呼吸', sec: 30, coach: 'walkInPlace', detect: null, tip: '放慢速度，讓心跳慢慢降下來' },
  { id: 'quadL', name: '大腿前側伸展（左腳）', sec: 20, coach: 'quadL', detect: 'still', tip: '可以扶牆或椅背，膝蓋朝下、不要拉到痛' },
  { id: 'quadR', name: '大腿前側伸展（右腳）', sec: 20, coach: 'quadR', detect: 'still', tip: '換邊，身體保持直立' },
  { id: 'hamstring', name: '大腿後側伸展', sec: 25, coach: 'hamstring', detect: 'still', tip: '一腳往前、腳跟著地，屁股往後坐，背打直' },
  { id: 'shoulder', name: '肩膀伸展', sec: 20, coach: 'shoulder', detect: 'still', tip: '一手橫過胸前，另一手輕輕壓住，左右各 10 秒' },
  { id: 'breathe', name: '深呼吸', sec: 20, coach: 'breathe', detect: null, tip: '吸氣雙手舉高，吐氣慢慢放下' },
];

// 坐姿版暖身與收操（坐姿訓練計畫用）
export const SEATED_WARMUP = [
  { id: 'seatedMarch', name: '坐姿踏步', sec: 40, coach: 'seatedMarch', detect: 'move', tip: '坐在椅子前半，左右腳輪流抬起踩下，雙手跟著擺' },
  { id: 'arms', name: '手臂繞圈', sec: 30, coach: 'armCircle', detect: 'move', tip: '坐著也可以，雙手打開往前、往後繞' },
  { id: 'sideReach', name: '坐姿側邊伸展', sec: 30, coach: 'sideReach', detect: null, tip: '一手舉高往另一邊伸展，左右輪流' },
];
export const SEATED_COOLDOWN = [
  { id: 'breathe1', name: '深呼吸', sec: 25, coach: 'breathe', detect: null, tip: '吸氣雙手舉高，吐氣慢慢放下' },
  { id: 'seatedHam', name: '坐姿大腿後側伸展', sec: 30, coach: 'seatedHam', detect: 'still', tip: '一腳往前伸直、腳跟著地，上半身挺直微微往前，左右各 15 秒' },
  { id: 'shoulder', name: '肩膀伸展', sec: 20, coach: 'shoulder', detect: 'still', tip: '一手橫過胸前，另一手輕輕壓住，左右各 10 秒' },
  { id: 'breathe2', name: '深呼吸', sec: 20, coach: 'breathe', detect: null, tip: '慢慢吸氣、慢慢吐氣' },
];

export const SESSION_CAP_MIN = 25;   // 一次訓練最多 25 分鐘（超過就直接進收操）
export const DAILY_SOFT = 2;         // 一天第 2 次之後提醒休息
export const DAILY_MAX = 3;          // 一天最多 3 次
export const REST_MIN_SEC = 15;      // 組間休息至少 15 秒才能按「準備好了」

export const repsFor = (n, diff) => Math.max(3, Math.round(n * (DIFFS[diff]?.mult ?? 1)));
export const levelExercises = (lv) => [...new Set(lv.sets.map((s) => s[0]))];
