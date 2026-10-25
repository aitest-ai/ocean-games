// Local storage for teachers' question banks (with their pictures) and play records.
// Everything stays in this browser on this device (IndexedDB); nothing is ever uploaded.
// If IndexedDB is unavailable (some private windows), it falls back to memory for this visit and
// says so, so a teacher is never surprised by a bank that vanished.
import { toPlain } from './bank.js';

const DB = 'taikan-quiz', VER = 1;
let dbp = null, memory = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB, VER); } catch { memory = { banks: new Map(), records: new Map() }; return resolve(null); }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('banks')) db.createObjectStore('banks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { memory = { banks: new Map(), records: new Map() }; resolve(null); };
  });
  return dbp;
}
export const persistent = async () => !!(await open());

async function tx(store, mode, fn) {
  const db = await open();
  if (!db) return fn(null, memory[store]);
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode), s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('儲存空間不足或被瀏覽器拒絕'));
  });
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const newId = (p = 'b') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export async function listBanks() {
  return tx('banks', 'readonly', (s, m) => (s ? req(s.getAll()) : [...m.values()]))
    .then((all) => all.sort((a, b) => (b.updated || 0) - (a.updated || 0)));
}
export async function getBank(id) { return tx('banks', 'readonly', (s, m) => (s ? req(s.get(id)) : m.get(id))); }
// bank: a validated bank (bank.js); it is stored in file form so validateBank reads it back exactly
export async function saveBank(bank) {
  const b = { ...toPlain(bank, { allImages: true }), id: bank.id && !bank.builtin ? bank.id : newId(), updated: Date.now() };
  await tx('banks', 'readwrite', (s, m) => (s ? req(s.put(b)) : m.set(b.id, b)));
  return b;
}
export async function deleteBank(id) { return tx('banks', 'readwrite', (s, m) => (s ? req(s.delete(id)) : m.delete(id))); }

// records: { id, at, who (座號或暱稱, never a full name), bank, levels, score, correct, total, stars, mode }
export async function addRecord(r) {
  const rec = { ...r, id: newId('r'), at: Date.now() };
  await tx('records', 'readwrite', (s, m) => (s ? req(s.put(rec)) : m.set(rec.id, rec)));
  return rec;
}
export async function listRecords() {
  return tx('records', 'readonly', (s, m) => (s ? req(s.getAll()) : [...m.values()])).then((a) => a.sort((x, y) => y.at - x.at));
}
export async function clearRecords() { return tx('records', 'readwrite', (s, m) => (s ? req(s.clear()) : m.clear())); }

// pictures are shrunk before saving (long side ≤ 800 px, JPEG), so a bank of 50 pictures stays a
// few MB and exported files are small enough to e-mail
export async function shrinkImage(file, max = 800, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('這個檔案不是瀏覽器看得懂的圖片')); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); // transparent PNGs on white
    g.drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL('image/jpeg', quality), w: c.width, h: c.height };
  } finally { URL.revokeObjectURL(url); }
}

// settings (per device): localStorage, like the other games
const SKEY = 'taikan.quiz.settings';
export function loadSettings(defaults) {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(SKEY) || '{}') }; } catch { return { ...defaults }; }
}
export function saveSettings(s) { try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch {} }
