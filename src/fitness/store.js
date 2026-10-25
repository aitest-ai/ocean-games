// 本機儲存：設定、個人校正、（之後的）訓練紀錄。全部只存在這台裝置的瀏覽器（localStorage），不上傳。
// 鍵名用 taikan.fitness.*（平台化規劃建議的命名，不綁「海洋」）。
const P = 'taikan.fitness.';

export function load(key, fallback) {
  try { const v = localStorage.getItem(P + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function save(key, value) {
  try { localStorage.setItem(P + key, JSON.stringify(value)); return true; } catch { return false; }
}
export function remove(key) { try { localStorage.removeItem(P + key); } catch { /* 沒有儲存空間也沒關係 */ } }

// 清除這個遊戲存在本機的所有資料（設定頁的「清除我的資料」）
export function clearAll() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith(P)) localStorage.removeItem(k); }
  } catch { /* 同上 */ }
}

// 個人校正：{ targets: { squat: 0.38, legRaise: 32 }, updated: { squat: '2026-10-25' } }
export const loadProfile = () => load('profile', { targets: {}, updated: {} });
export function saveTarget(key, value) {
  const p = loadProfile();
  p.targets[key] = value;
  p.updated[key] = new Date().toISOString().slice(0, 10);
  save('profile', p);
  return p;
}
