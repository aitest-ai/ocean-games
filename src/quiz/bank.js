// Question bank: the data format, parsing (JSON, CSV, pasted text), validation with plain-language
// messages for teachers, and compiling a question into the "steps" the levels play.
//
// A step is always one decision made with the body: { kind: 'choice', options[2..4], correct } or
// { kind: 'tf', correct: true|false }. Ordering and matching questions become several choice steps
// ("第 1 個是？", "「cat」配哪一個？"), so every level type can play every question type.
// Format reference for teachers: docs/quiz.md「題庫格式」. Runs in node (tests) and the browser.
import { parseCSV, toCSV } from './csv.js';

export const FORMAT = 'taikan-quiz';
export const VERSION = 1;
export const TYPES = ['choice', 'tf', 'order', 'match', 'image', 'number'];
export const TYPE_NAMES = { choice: '選擇題', tf: '是非題', order: '排序題', match: '配對題', image: '圖片題', number: '數字題' };
export const LIMITS = { options: [2, 4], items: [2, 6], pairs: [2, 6], text: 80, option: 24 };
const LETTERS = 'ABCDEF';

const TYPE_ALIASES = {
  choice: 'choice', mc: 'choice', 選擇: 'choice', 選擇題: 'choice', 單選: 'choice', 單選題: 'choice',
  tf: 'tf', truefalse: 'tf', 'true/false': 'tf', 是非: 'tf', 是非題: 'tf', 圈叉: 'tf', '○×': 'tf', 對錯: 'tf',
  order: 'order', sort: 'order', 排序: 'order', 排序題: 'order', 順序: 'order',
  match: 'match', pair: 'match', 配對: 'match', 配對題: 'match', 連連看: 'match',
  image: 'image', picture: 'image', 圖片: 'image', 圖片題: 'image', 看圖: 'image', 看圖題: 'image',
  number: 'number', num: 'number', 數字: 'number', 數字題: 'number', 計算: 'number', 計算題: 'number',
};
export const typeOf = (s) => TYPE_ALIASES[String(s ?? '').trim().toLowerCase().replace(/\s+/g, '')] || null;

const TRUE = ['○', 'o', '〇', '◯', 'true', 't', 'yes', 'y', 'v', '✓', '✔', '對', '是', '正確', '圈', '1'];
const FALSE = ['×', 'x', '✗', '✘', '╳', 'false', 'f', 'no', 'n', '錯', '否', '錯誤', '叉', '0'];
export function parseBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase().replace(/[()（）]/g, '');
  if (TRUE.includes(s)) return true;
  if (FALSE.includes(s)) return false;
  return null;
}

// "1,234" / "56 公分" / "-3.5" → number (null if it is not one number)
export function parseNumber(v, unit = '') {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v ?? '').trim().replace(/[，,](?=\d{3}\b)/g, '').replace(/[０-９．－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (unit && s.endsWith(unit)) s = s.slice(0, -unit.length).trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

const DIFF_WORDS = { 易: 1, 簡單: 1, 容易: 1, easy: 1, 中: 2, 普通: 2, normal: 2, 難: 3, 困難: 3, 挑戰: 3, hard: 3 };
function parseDifficulty(v) {
  if (v === undefined || v === null || v === '') return { value: 2 };
  if (typeof v === 'number') return Number.isInteger(v) && v >= 1 && v <= 3 ? { value: v } : { bad: true, value: 2 };
  const s = String(v).trim();
  if (/^[★☆*]+$/.test(s)) return { value: Math.min(Math.max(s.replace(/[☆]/g, '').length, 1), 3) };
  if (DIFF_WORDS[s.toLowerCase()]) return { value: DIFF_WORDS[s.toLowerCase()] };
  const n = Number(s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
  return Number.isInteger(n) && n >= 1 && n <= 3 ? { value: n } : { bad: true, value: 2 };
}
const splitTags = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[、,，;；|／/]+/)).map((x) => String(x).trim()).filter(Boolean);

// an option may be "text", { text, image } or (images only) { image }
function toItem(o) {
  if (o && typeof o === 'object') return { text: String(o.text ?? '').trim(), image: String(o.image ?? '').trim() };
  return { text: String(o ?? '').trim(), image: '' };
}
const itemLabel = (it) => it.text || (it.image ? '（圖片）' : '');

// which option an answer names: a letter (A–F, full width too), a 1-based number, or the option's text
function resolveChoice(answer, options) {
  if (answer === undefined || answer === null || answer === '') return { missing: true };
  if (typeof answer === 'number') return Number.isInteger(answer) && answer >= 1 && answer <= options.length ? { index: answer - 1 } : { bad: true };
  const s = String(answer).trim().replace(/[Ａ-Ｆａ-ｆ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const byText = options.findIndex((o) => o.text && o.text === s);
  if (byText >= 0) return { index: byText };
  const m = s.match(/^[(（]?([A-Fa-f])[)）.、]?$/);
  if (m) { const i = LETTERS.indexOf(m[1].toUpperCase()); return i < options.length ? { index: i } : { bad: true, letter: m[1].toUpperCase() }; }
  if (/^\d+$/.test(s)) { const i = Number(s) - 1; return i >= 0 && i < options.length ? { index: i } : { bad: true }; }
  return { bad: true };
}

// ── one question ────────────────────────────────────────────────────────────
// raw: { type, q, options, answer, items, pairs, hint, explain, difficulty, tags, image, unit, line }
// → { question | null, errors: [msg], warnings: [msg] }
export function normalizeQuestion(raw, { images = {} } = {}) {
  const errors = [], warnings = [];
  const out = { type: null, q: '', hint: '', explain: '', difficulty: 2, tags: [], image: '' };
  if (!raw || typeof raw !== 'object') return { question: null, errors: ['這一題不是正確的格式'], warnings };
  out.type = typeOf(raw.type ?? 'choice');
  if (!out.type) { errors.push(`不認得的題型「${raw.type}」，可以用：選擇、是非、排序、配對、圖片、數字`); return { question: null, errors, warnings }; }
  out.q = String(raw.q ?? raw.question ?? '').trim();
  out.image = String(raw.image ?? '').trim();
  if (!out.q && !out.image) errors.push('題目是空白的');
  if (out.q.length > LIMITS.text) warnings.push(`題目有 ${out.q.length} 個字，投影時會比較擠，建議 ${LIMITS.text} 字以內`);
  out.hint = String(raw.hint ?? '').trim();
  out.explain = String(raw.explain ?? raw.explanation ?? '').trim();
  const d = parseDifficulty(raw.difficulty);
  if (d.bad) warnings.push(`難度「${raw.difficulty}」看不懂，先當作 2（普通）。可以填 1、2、3 或 易、中、難`);
  out.difficulty = d.value;
  out.tags = splitTags(raw.tags);
  if (raw.id) out.id = String(raw.id);
  if (raw.shuffle === false) out.shuffle = false;

  const T = out.type;
  if (T === 'choice' || T === 'image') {
    const opts = (raw.options || []).map(toItem).filter((o) => o.text || o.image);
    if (opts.length < LIMITS.options[0]) errors.push(`選擇題至少要 2 個選項，現在只有 ${opts.length} 個`);
    else if (opts.length > LIMITS.options[1]) errors.push(`選擇題最多 4 個選項（身體動作最多分得出 4 個），現在有 ${opts.length} 個`);
    const labels = opts.map(itemLabel);
    if (new Set(opts.map((o) => o.text + '|' + o.image)).size < opts.length) errors.push('有兩個選項一模一樣');
    if (opts.some((o) => o.text.length > LIMITS.option)) warnings.push(`有選項超過 ${LIMITS.option} 個字，在跑道門上會很擠`);
    out.options = opts;
    if (opts.length >= 2) {
      const a = resolveChoice(raw.answer, opts);
      if (a.missing) errors.push('沒有填答案（例如填 A，或直接填正確選項的文字）');
      else if (a.bad) errors.push(`答案「${raw.answer}」找不到對應的選項（只有 ${LETTERS.slice(0, opts.length).split('').join('、')}：${labels.join('／')}）`);
      else out.answer = a.index;
    }
    if (T === 'image' && !out.image && !opts.some((o) => o.image)) warnings.push('圖片題沒有放圖片，會當成一般選擇題來玩');
  } else if (T === 'tf') {
    const b = parseBool(raw.answer);
    if (b === null) errors.push(raw.answer === undefined || raw.answer === '' ? '是非題沒有填答案（填 ○ 或 ×、對 或 錯）' : `是非題的答案「${raw.answer}」看不懂，請填 ○ 或 ×（對 或 錯）`);
    else out.answer = b;
  } else if (T === 'order') {
    const items = (raw.items || raw.options || []).map(toItem).filter((o) => o.text || o.image);
    if (items.length < LIMITS.items[0]) errors.push(`排序題至少要 2 個項目（按照正確順序寫），現在只有 ${items.length} 個`);
    else if (items.length > LIMITS.items[1]) errors.push(`排序題最多 6 個項目，現在有 ${items.length} 個`);
    else if (items.length === 2) warnings.push('排序題只有 2 個項目，等於二選一；建議 3～5 個');
    if (new Set(items.map(itemLabel)).size < items.length) errors.push('排序題有兩個項目一模一樣，學生會分不出來');
    out.items = items;
  } else if (T === 'match') {
    let pairs = raw.pairs || [];
    if (!pairs.length && raw.options) pairs = raw.options.map((o) => (typeof o === 'string' ? splitPair(o) : o)).filter(Boolean);
    pairs = pairs.map((p) => (Array.isArray(p) ? [toItem(p[0]), toItem(p[1])] : null));
    if (pairs.some((p) => !p || !(p[0].text || p[0].image) || !(p[1].text || p[1].image))) errors.push('配對題每一組都要有左右兩邊，例如「cat=貓」');
    pairs = pairs.filter(Boolean);
    if (pairs.length < LIMITS.pairs[0]) errors.push(`配對題至少要 2 組，現在只有 ${pairs.length} 組`);
    else if (pairs.length > LIMITS.pairs[1]) errors.push(`配對題最多 6 組，現在有 ${pairs.length} 組`);
    if (new Set(pairs.map((p) => itemLabel(p[1]))).size < pairs.length) errors.push('配對題右邊有重複的答案，學生會不知道配哪一個');
    if (new Set(pairs.map((p) => itemLabel(p[0]))).size < pairs.length) errors.push('配對題左邊有重複的項目');
    out.pairs = pairs;
  } else if (T === 'number') {
    out.unit = String(raw.unit ?? '').trim();
    const n = parseNumber(raw.answer, out.unit);
    if (n === null) errors.push(raw.answer === undefined || raw.answer === '' ? '數字題沒有填答案' : `數字題的答案「${raw.answer}」不是一個數字（可以有小數點，不要寫算式或分數）`);
    else out.answer = n;
    const given = (raw.options || []).map((o) => String(typeof o === 'object' ? o.text : o).trim()).filter(Boolean);
    const vals = given.map((o) => parseNumber(o, out.unit));
    if (vals.some((x) => x === null)) warnings.push('數字題的選項有些不是數字，已經略過');
    out.distractors = [...new Set(vals.filter((x) => x !== null && x !== n))].slice(0, 3);
  }
  // images that point at nothing
  const refs = [out.image, ...(out.options || []).map((o) => o.image), ...(out.items || []).map((o) => o.image), ...(out.pairs || []).flat().map((o) => o.image)].filter(Boolean);
  for (const r of refs) if (!imageKnown(r, images)) warnings.push(`找不到圖片「${r}」，請先在「圖片」上傳同名的檔案；沒有的話這張圖不會顯示`);
  return { question: errors.length ? null : out, errors, warnings };
}

// "cat = 貓" / "cat → 貓"; when there is an "=", only "=" separates (so "冰 → 水 = 熔化" works)
function splitPair(s) {
  s = String(s);
  const m = /[=＝]/.test(s) ? s.split(/\s*[=＝]\s*/) : s.split(/\s*(?:→|->|⇒|⇨)\s*/);
  return m.length === 2 && m[0].trim() && m[1].trim() ? [m[0].trim(), m[1].trim()] : null;
}

// image references: data: URLs, built-in drawings ("art:…", src/quiz/art.js), "img:<id>" from the
// bank's own image list, or a file name that matches an uploaded image's name
export function imageKnown(ref, images = {}) {
  if (!ref) return true;
  if (/^(data:|art:|blob:)/.test(ref)) return true;
  if (ref.startsWith('img:')) return !!images[ref.slice(4)];
  return Object.values(images).some((im) => im && im.name === ref);
}
export function imageId(ref, images = {}) {
  if (!ref) return null;
  if (ref.startsWith('img:')) return images[ref.slice(4)] ? ref.slice(4) : null;
  const e = Object.entries(images).find(([, im]) => im && im.name === ref);
  return e ? e[0] : null;
}

// ── a whole bank ────────────────────────────────────────────────────────────
// raw: an object (from JSON) → { bank, errors: [{ n, line, msg }], warnings: [...] }
// bank keeps only the valid questions; n is the question number a teacher sees (1-based)
// extraImages: pictures already in the teacher's bank, so pasted questions can name them by file name
export function validateBank(raw, { extraImages = {} } = {}) {
  const errors = [], warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) && !raw.length) return { bank: null, errors: [{ msg: '檔案裡沒有題目' }], warnings };
  if (Array.isArray(raw)) raw = { questions: raw };
  if (raw.format && raw.format !== FORMAT) warnings.push({ msg: `這個檔案標示的格式是「${raw.format}」，不是本遊戲的題庫格式，會盡量讀讀看` });
  const images = {};
  for (const [id, im] of Object.entries({ ...extraImages, ...(raw.images || {}) })) {
    if (typeof im === 'string') images[id] = { name: id, data: im };
    else if (im && typeof im.data === 'string') images[id] = { name: String(im.name || id), data: im.data };
  }
  const bank = {
    format: FORMAT, version: VERSION,
    id: String(raw.id || ''), title: String(raw.title || '').trim() || '未命名題庫',
    subject: String(raw.subject || '').trim(), grade: String(raw.grade || '').trim(),
    author: String(raw.author || '').trim(), license: String(raw.license || '').trim(), note: String(raw.note || '').trim(),
    questions: [], images,
  };
  if (raw.builtin) bank.builtin = true;
  const list = Array.isArray(raw.questions) ? raw.questions : [];
  if (!list.length) errors.push({ msg: '題庫裡沒有任何題目' });
  list.forEach((q, i) => {
    const r = normalizeQuestion(q, { images });
    const at = { n: i + 1, line: q && q.line };
    for (const m of r.errors) errors.push({ ...at, msg: m });
    for (const m of r.warnings) warnings.push({ ...at, msg: m });
    if (r.question) {
      // file names become img:<id> so the bank stays consistent when images are renamed
      const fix = (it) => { const id = imageId(it.image, images); if (id) it.image = 'img:' + id; };
      fix(r.question); (r.question.options || []).forEach(fix); (r.question.items || []).forEach(fix); (r.question.pairs || []).flat().forEach(fix);
      r.question.id ||= 'q' + (i + 1);
      bank.questions.push(r.question);
    }
  });
  const ids = new Set();
  for (const q of bank.questions) { while (ids.has(q.id)) q.id += '_'; ids.add(q.id); }
  return { bank, errors, warnings };
}

// human-readable message list: "第 3 題（第 12 行）：…"
export function describeIssue(e) {
  const where = e.n ? `第 ${e.n} 題${e.line ? `（第 ${e.line} 行）` : ''}：` : e.line ? `第 ${e.line} 行：` : '';
  return where + e.msg;
}

// ── JSON / CSV / pasted text → raw ──────────────────────────────────────────
export function parseJSON(text) {
  try { return { raw: JSON.parse(String(text).replace(/^﻿/, '')) }; }
  catch (e) {
    const m = /position (\d+)/.exec(e.message);
    const line = m ? String(text).slice(0, Number(m[1])).split('\n').length : null;
    return { error: { line, msg: `這不是正確的 JSON 檔（${line ? `大約在第 ${line} 行` : '格式錯誤'}）。常見原因：少了逗號、引號沒有成對、最後多一個逗號` } };
  }
}

const COLS = {
  type: ['題型', 'type', '類型'], q: ['題目', 'question', 'q', '問題'],
  A: ['選項a', 'a', 'option1', '選項1'], B: ['選項b', 'b', 'option2', '選項2'], C: ['選項c', 'c', 'option3', '選項3'],
  D: ['選項d', 'd', 'option4', '選項4'], E: ['選項e', 'e', 'option5', '選項5'], F: ['選項f', 'f', 'option6', '選項6'],
  answer: ['答案', 'answer', '正解', '正確答案'], hint: ['提示', 'hint'], explain: ['解說', 'explain', '解析', '說明', 'explanation'],
  difficulty: ['難度', 'difficulty', 'level'], tags: ['標籤', 'tags', 'tag', '分類'], image: ['圖片', 'image', '圖', 'picture'], unit: ['單位', 'unit'],
};
export const CSV_HEADER = ['題型', '題目', '選項A', '選項B', '選項C', '選項D', '答案', '提示', '解說', '難度', '標籤', '圖片', '單位'];

// CSV or TSV text → { raw: { questions }, errors }
export function parseCSVBank(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { raw: { questions: [] }, errors: [{ msg: '檔案是空的' }] };
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, ''));
  const col = {};
  for (const [k, names] of Object.entries(COLS)) { const i = head.findIndex((h) => names.includes(h)); if (i >= 0) col[k] = i; }
  const errors = [];
  if (col.q === undefined) return { raw: { questions: [] }, errors: [{ line: 1, msg: `第一行要是欄位名稱，至少要有「題目」。目前第一行是：${rows[0].join('、').slice(0, 60)}。可以先下載範本照著填` }] };
  const get = (r, k) => (col[k] === undefined ? '' : String(r[col[k]] ?? '').trim());
  const questions = rows.slice(1).map((r) => {
    const options = ['A', 'B', 'C', 'D', 'E', 'F'].map((k) => get(r, k)).filter(Boolean);
    const type = typeOf(get(r, 'type') || inferType({ options, answer: get(r, 'answer') })) || get(r, 'type');
    const raw = { line: r.line, type, q: get(r, 'q'), answer: get(r, 'answer'), hint: get(r, 'hint'), explain: get(r, 'explain'), difficulty: get(r, 'difficulty'), tags: get(r, 'tags'), image: get(r, 'image'), unit: get(r, 'unit') };
    if (type === 'order') raw.items = options;
    else if (type === 'match') raw.pairs = options.map(splitPair); // a cell without "=" stays null → error
    else raw.options = options;
    return raw;
  });
  return { raw: { questions }, errors };
}

function inferType({ options = [], answer = '', pairs = [] }) {
  if (pairs.length >= 2 || (options.length >= 2 && options.every((o) => splitPair(o)))) return 'match';
  if (!options.length && parseBool(answer) !== null && !/^\d+$/.test(String(answer).trim())) return 'tf';
  if (!options.length && parseNumber(answer) !== null) return 'number';
  if (!options.length && parseBool(answer) !== null) return 'tf';
  return 'choice';
}

// Pasted text, the friendliest way to write questions (format in docs/quiz.md):
//   1. cat 是什麼意思？        ← question (numbering is optional)
//   A. 貓 *                    ← options; mark the right one with * (or write 答案：A)
//   B. 狗
//   提示：會喵喵叫             ← 提示／解說／難度／標籤／圖片／單位
//   (blank line)               ← next question
//   是非：太陽從東邊升起。○     ← 是非 with ○ or × at the end
//   配對：…  cat = 貓 …         ← pairs with = or →
//   排序：…  items in the right order
//   數字：7 × 8 = ？  答案：56
export function parseTextBank(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  if (lines.some((l) => l.includes('\t'))) return parseCSVBank(text); // pasted from a spreadsheet
  const blocks = [];
  let cur = null;
  lines.forEach((l, i) => {
    if (!l.trim()) { cur = null; return; }
    if (!cur) blocks.push((cur = []));
    cur.push({ s: l.trim(), line: i + 1 });
  });
  const KEY = /^(答案|正解|正確答案|answer|ans|提示|hint|解說|解析|說明|explain|難度|difficulty|標籤|tags?|圖片|image|單位|unit|題型|type)\s*[:：]\s*(.*)$/i;
  const KEYMAP = { 答案: 'answer', 正解: 'answer', 正確答案: 'answer', answer: 'answer', ans: 'answer', 提示: 'hint', hint: 'hint', 解說: 'explain', 解析: 'explain', 說明: 'explain', explain: 'explain', 難度: 'difficulty', difficulty: 'difficulty', 標籤: 'tags', tag: 'tags', tags: 'tags', 圖片: 'image', image: 'image', 單位: 'unit', unit: 'unit', 題型: 'type', type: 'type' };
  const OPT = /^[(（]?([A-Fa-fＡ-Ｆ])[)）.．、:：]\s*(.+)$/;
  const NUMOPT = /^[(（]?([1-6１-６])[)）]\s*(.+)$/;
  const BULLET = /^[-•・*]\s+(.+)$/;
  const MARK = /\s*(?:\*|＊|✓|✔|（正確）|\(正確\)|←\s*答案)\s*$/;
  const questions = blocks.map((b) => {
    const raw = { line: b[0].line, options: [], pairs: [] };
    let first = b[0].s.replace(/^(?:第\s*)?(?:\d+|[一二三四五六七八九十]+)\s*(?:題)?\s*[.．、)）:：]\s*/, '').replace(/^[(（]\d+[)）]\s*/, '').replace(/^Q\d+\s*[:：.]\s*/i, '');
    const tm = first.match(/^(選擇|是非|排序|配對|圖片|數字|看圖|連連看|計算)題?\s*[:：]\s*/);
    if (tm) { raw.type = typeOf(tm[1]); first = first.slice(tm[0].length); }
    // 是非 with the answer at the end: "太陽從東邊升起。○" / "…（×）"
    const tf = first.match(/\s*[(（]?\s*(○|〇|◯|×|✗|╳)\s*[)）]?\s*$/) || (raw.type === 'tf' ? first.match(/\s*[(（]\s*(O|X|o|x|對|錯)\s*[)）]\s*$/) : null);
    if (tf && (raw.type === 'tf' || !raw.type)) { raw.answer = tf[1]; raw.type = 'tf'; first = first.slice(0, tf.index); }
    const qLines = [first];
    let correct = null;
    for (const { s } of b.slice(1)) {
      const k = s.match(KEY);
      if (k) { const key = KEYMAP[k[1].toLowerCase()] || KEYMAP[k[1]]; if (key === 'type') raw.type = typeOf(k[2]) || k[2]; else raw[key] = k[2].trim(); continue; }
      const o = s.match(OPT) || s.match(NUMOPT) || s.match(BULLET);
      let txt = o ? o[o.length - 1] : null;
      if (txt === null && splitPair(s) && raw.type !== 'order') { raw.pairs.push(splitPair(s)); continue; }
      if (txt === null) {
        // a line after options have started is an option too (people forget the letters)
        if (raw.options.length || raw.type === 'order') txt = s; else { qLines.push(s); continue; }
      }
      if (MARK.test(txt)) { txt = txt.replace(MARK, ''); correct = raw.options.length; }
      if (splitPair(txt) && raw.type === 'match') { raw.pairs.push(splitPair(txt)); continue; }
      raw.options.push(txt.trim());
    }
    raw.q = qLines.join('\n').trim();
    if (raw.answer === undefined && correct !== null) raw.answer = correct + 1;
    if (!raw.type) raw.type = inferType(raw);
    if (raw.type === 'order') { raw.items = raw.options; delete raw.options; }
    if (raw.type === 'match' && !raw.pairs.length) raw.pairs = raw.options.map(splitPair);
    if (raw.type !== 'match') delete raw.pairs;
    return raw;
  });
  return { raw: { questions }, errors: [] };
}

// any text a teacher drops in: JSON, CSV/TSV or the pasted-text format
export function parseAny(text, filename = '', extraImages = {}) {
  const s = String(text).replace(/^﻿/, '').trim();
  let raw, pre = [];
  if (/\.json$/i.test(filename) || /^[[{]/.test(s)) {
    const r = parseJSON(s);
    if (r.error) return { bank: null, errors: [r.error], warnings: [] };
    raw = r.raw;
  } else if (/\.(csv|tsv)$/i.test(filename) || looksLikeCSV(s)) {
    const r = parseCSVBank(s); raw = r.raw; pre = r.errors;
    if (pre.length && !raw.questions.length) return { bank: null, errors: pre, warnings: [] };
  } else {
    const r = parseTextBank(s); raw = r.raw; pre = r.errors;
  }
  const v = validateBank(raw, { extraImages });
  return { bank: v.bank, errors: [...pre, ...v.errors], warnings: v.warnings };
}
const looksLikeCSV = (s) => { const first = s.split(/\r?\n/)[0].toLowerCase().replace(/\s+/g, ''); return /(^|[,\t;])("?)(題目|question)\2([,\t;]|$)/.test(first); };

// ── bank → files ────────────────────────────────────────────────────────────
// JSON keeps everything (images embedded), so another teacher gets the exact same bank
// toPlain: the same object as the file (answers as letters / ○×), which validateBank reads back
// exactly; storage keeps every uploaded image (allImages), a shared file only the used ones
export function toPlain(bank, { allImages = false } = {}) {
  const used = usedImages(bank);
  const images = Object.fromEntries(Object.entries(bank.images || {}).filter(([id]) => allImages || used.has(id)));
  return { format: FORMAT, version: VERSION, id: bank.id, title: bank.title, subject: bank.subject, grade: bank.grade, author: bank.author, license: bank.license, note: bank.note, questions: bank.questions.map(exportQuestion), images };
}
export const toJSON = (bank) => JSON.stringify(toPlain(bank), null, 1);
function exportQuestion(q) {
  const o = { ...q };
  if (q.type === 'choice' || q.type === 'image') o.answer = LETTERS[q.answer];
  if (q.type === 'tf') o.answer = q.answer ? '○' : '×';
  const plain = (it) => (it.image ? it : it.text);
  if (o.options) o.options = o.options.map(plain);
  if (o.items) o.items = o.items.map(plain);
  if (o.pairs) o.pairs = o.pairs.map((p) => p.map(plain));
  if (o.type === 'number') { o.options = o.distractors; delete o.distractors; }
  for (const k of ['hint', 'explain', 'image', 'unit']) if (!o[k]) delete o[k];
  if (!o.tags?.length) delete o.tags;
  return o;
}
export function usedImages(bank) {
  const s = new Set();
  const add = (r) => { if (r && r.startsWith('img:')) s.add(r.slice(4)); };
  for (const q of bank.questions) { add(q.image); for (const it of [...(q.options || []), ...(q.items || []), ...(q.pairs || []).flat()]) add(it.image); }
  return s;
}

// CSV for spreadsheets: images become their file names (the images themselves are not in a CSV)
export function toCSVText(bank) {
  const nameOf = (r) => (r && r.startsWith('img:') ? bank.images?.[r.slice(4)]?.name || '' : r || '');
  const header = [...CSV_HEADER];
  const wide = bank.questions.some((q) => (q.items || q.pairs || []).length > 4);
  if (wide) header.splice(6, 0, '選項E', '選項F');
  const nOpt = wide ? 6 : 4;
  const rows = bank.questions.map((q) => {
    let opts = [], ans = '';
    if (q.type === 'choice' || q.type === 'image') { opts = q.options.map((o) => o.text || nameOf(o.image)); ans = LETTERS[q.answer]; }
    else if (q.type === 'tf') ans = q.answer ? '○' : '×';
    else if (q.type === 'order') opts = q.items.map((o) => o.text || nameOf(o.image));
    else if (q.type === 'match') opts = q.pairs.map((p) => `${p[0].text}=${p[1].text}`);
    else if (q.type === 'number') { opts = q.distractors.map(String); ans = String(q.answer); }
    while (opts.length < nOpt) opts.push('');
    return [TYPE_NAMES[q.type].replace('題', ''), q.q, ...opts, ans, q.hint, q.explain, q.difficulty, q.tags.join('、'), nameOf(q.image), q.unit || ''];
  });
  return toCSV([header, ...rows]);
}

// ── question → steps ────────────────────────────────────────────────────────
export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
export function shuffle(a, r = Math.random) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// distractors for a number question: close values, a place-value slip and swapped digits
export function numberDistractors(n, r = Math.random, want = 3) {
  const dec = String(n).includes('.') ? String(n).split('.')[1].length : 0;
  const unit = dec ? Math.pow(10, -dec) : 1;
  const mag = Math.abs(n) >= 10 ? Math.pow(10, Math.floor(Math.log10(Math.abs(n)))) : 5 * unit;
  const c = [n + unit, n - unit, n + 2 * unit, n - 2 * unit, n + mag, n - mag, n + 10 * unit, n - 10 * unit];
  if (!dec && Math.abs(n) >= 10 && Math.abs(n) < 100) { const s = String(Math.abs(n)); c.push(Math.sign(n) * Number(s[1] + s[0])); }
  const round = (x) => Number(x.toFixed(dec));
  const ok = [...new Set(c.map(round))].filter((x) => x !== n && (n < 0 || x >= 0));
  // keep one of the nearest, then fill at random
  const near = ok.slice(0, 1), rest = shuffle(ok.slice(1), r);
  return shuffle([...near, ...rest].slice(0, want), r);
}
export const fmtNumber = (x, unit = '') => (Number.isInteger(x) ? x.toLocaleString('en-US') : String(x)) + (unit ? ' ' + unit : '');

const base = (q) => ({ qid: q.id, type: q.type, image: q.image || '', hint: q.hint, explain: q.explain, difficulty: q.difficulty, tags: q.tags });

// one question → [step]; r = random source (seeded in tests)
export function compile(q, r = Math.random) {
  const T = q.type;
  if (T === 'tf') return [{ ...base(q), kind: 'tf', prompt: q.q, correct: q.answer, answerText: q.answer ? '○ 對' : '× 錯' }];
  if (T === 'choice' || T === 'image') {
    const idx = q.options.map((_, i) => i);
    const order = q.shuffle === false ? idx : shuffle(idx, r);
    return [{ ...base(q), kind: 'choice', prompt: q.q, options: order.map((i) => q.options[i]), correct: order.indexOf(q.answer), answerText: itemLabel(q.options[q.answer]) }];
  }
  if (T === 'number') {
    const wrong = q.distractors.length ? q.distractors.slice(0, 3) : numberDistractors(q.answer, r);
    const vals = shuffle([q.answer, ...wrong], r);
    return [{ ...base(q), kind: 'choice', prompt: q.q, options: vals.map((v) => ({ text: fmtNumber(v, q.unit), image: '' })), correct: vals.indexOf(q.answer), answerText: fmtNumber(q.answer, q.unit) }];
  }
  if (T === 'order') {
    const steps = [];
    const left = q.items.map((it, i) => ({ it, i }));
    for (let k = 0; k < q.items.length - 1; k++) {
      const pool = shuffle(left, r);
      const right = pool.find((x) => x.i === k);
      const opts = shuffle([right, ...pool.filter((x) => x !== right).slice(0, 3)], r);
      steps.push({ ...base(q), kind: 'choice', prompt: q.q, sub: `第 ${k + 1} 個是？`, options: opts.map((x) => x.it), correct: opts.indexOf(right), answerText: itemLabel(right.it), part: { k, n: q.items.length - 1, done: q.items.slice(0, k).map(itemLabel) } });
      left.splice(left.indexOf(right), 1);
    }
    return steps;
  }
  if (T === 'match') {
    const pairs = shuffle(q.pairs, r);
    const rights = pairs.map((p) => p[1]);
    const steps = [];
    const used = new Set();
    pairs.slice(0, pairs.length - 1).forEach((p, k) => {
      const free = rights.filter((x) => !used.has(x));
      const opts = shuffle([p[1], ...shuffle(free.filter((x) => x !== p[1]), r).slice(0, 3)], r);
      steps.push({ ...base(q), kind: 'choice', prompt: q.q, sub: `「${itemLabel(p[0])}」配哪一個？`, subImage: p[0].image, options: opts, correct: opts.indexOf(p[1]), answerText: itemLabel(p[1]), part: { k, n: pairs.length - 1 } });
      used.add(p[1]);
    });
    return steps;
  }
  return [];
}

// a level shows at most `max` options: keep the right one and some wrong ones, order unchanged
export function adapt(step, max, r = Math.random) {
  if (step.kind !== 'choice' || step.options.length <= max) return step;
  const wrong = shuffle(step.options.map((_, i) => i).filter((i) => i !== step.correct), r).slice(0, max - 1);
  const keep = [step.correct, ...wrong].sort((a, b) => a - b);
  return { ...step, options: keep.map((i) => step.options[i]), correct: keep.indexOf(step.correct), reduced: true };
}

// a choice step asked as true/false: "答案是「貓」嗎？" (half the time the shown answer is wrong)
export function toStatement(step, r = Math.random) {
  if (step.kind === 'tf') return step;
  const right = r() < 0.5;
  const pick = right ? step.correct : shuffle(step.options.map((_, i) => i).filter((i) => i !== step.correct), r)[0];
  const opt = step.options[pick];
  return { ...step, kind: 'tf', fromChoice: true, claim: opt, sub: `${step.sub ? step.sub + ' ' : ''}答案是「${itemLabel(opt)}」嗎？`, correct: right, options: undefined, answerText: (right ? '○ 對' : '× 錯') + (right ? '' : `（正確答案：${step.answerText}）`) };
}

export const LETTER = (i) => LETTERS[i];
export { itemLabel };
