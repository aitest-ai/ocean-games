// Every bank a teacher can pick: the built-in samples (data/quiz/, read-only) and the teacher's own
// banks saved on this device (store.js). Shared by the game and the editor.
import { validateBank } from './bank.js';
import { listBanks, getBank } from './store.js';

let builtins = null;
export async function loadBuiltins(base = '../data/quiz/') {
  if (builtins) return builtins;
  const idx = await (await fetch(base + 'index.json')).json();
  builtins = (await Promise.all(idx.banks.map(async (f) => {
    try { const b = validateBank(await (await fetch(base + f)).json()).bank; b.builtin = true; return b; } catch { return null; }
  }))).filter(Boolean);
  return builtins;
}

export async function allBanks(base) {
  const [b, mine] = await Promise.all([loadBuiltins(base), listBanks().catch(() => [])]);
  return [...mine.map((m) => ({ ...validateBank(m).bank, id: m.id, updated: m.updated })), ...b];
}

export async function findBank(id, base) {
  const b = (await loadBuiltins(base)).find((x) => x.id === id);
  if (b) return b;
  const m = await getBank(id).catch(() => null);
  return m ? { ...validateBank(m).bank, id: m.id } : null;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
