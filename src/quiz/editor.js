// Teacher's question-bank editor (quiz/editor.html). Plain DOM, no build step. Banks and pictures are
// saved in this browser (store.js) after every change; nothing leaves the device unless the teacher
// exports a file. Every message is written for teachers, not programmers.
import { validateBank, normalizeQuestion, parseAny, toJSON, toCSVText, TYPE_NAMES, CSV_HEADER, LETTER, describeIssue } from './bank.js';
import { loadBuiltins, esc } from './library.js';
import { listBanks, saveBank, deleteBank, getBank, shrinkImage, newId, persistent } from './store.js';
import { toCSV } from './csv.js';
import { artURL, imageURL, ART_LIST, ART_NAMES } from './art.js';
import { mountAIPanel, parseAIOutput } from './ai.js';

const $ = (id) => document.getElementById(id);
let builtins = [], mine = [], bank = null, readonly = false, editing = null, pasted = null;

// ── files ──
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const safeName = (s) => String(s || '題庫').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40);
export const EXAMPLE_TEXT = `1. cat 是什麼意思？
A. 貓 *
B. 狗
C. 鳥
提示：會喵喵叫
解說：cat 就是貓。

是非：太陽從東邊升起。○

配對：把英文和中文配對
cat = 貓
dog = 狗
bird = 鳥

排序：由小排到大
1/4
1/2
3/4

數字：7 × 8 = ？
答案：56
標籤：乘法
難度：1`;
$('fmtExample').textContent = EXAMPLE_TEXT;
$('tplTXT').onclick = (e) => { e.preventDefault(); download('貼上文字範本.txt', EXAMPLE_TEXT, 'text/plain'); };
$('tplCSV').onclick = (e) => {
  e.preventDefault();
  download('題庫範本.csv', toCSV([CSV_HEADER,
    ['選擇', 'cat 是什麼意思？', '貓', '狗', '鳥', '', 'A', '會喵喵叫', 'cat 就是貓。', '1', '動物', '', ''],
    ['是非', '太陽從東邊升起。', '', '', '', '', '○', '', '', '1', '', '', ''],
    ['配對', '把英文和中文配對', 'cat=貓', 'dog=狗', 'bird=鳥', '', '', '', '', '2', '', '', ''],
    ['排序', '由小排到大（照正確順序寫）', '1/4', '1/2', '3/4', '', '', '', '', '2', '', '', ''],
    ['數字', '7 × 8 = ？', '', '', '', '', '56', '', '', '1', '乘法', '', ''],
    ['圖片', '這是幾點？', '3 點', '6 點', '9 點', '', 'A', '', '', '1', '時間', 'art:clock:3:00', ''],
  ]), 'text/csv');
};

// ── lists ──
async function refresh() {
  mine = await listBanks().catch(() => []);
  $('myList').innerHTML = mine.length ? mine.map((m) => `<li data-id="${esc(m.id)}" class="${bank && bank.id === m.id ? 'on' : ''}"><b>${esc(m.title)}</b><span class="muted small">${m.questions.length} 題・${new Date(m.updated).toLocaleDateString('zh-TW')}</span>
    <div class="row"><button data-act="open">開啟</button><button data-act="play">試玩</button><button data-act="del">刪除</button></div></li>`).join('') : '<li class="muted small" style="cursor:default">還沒有自己的題庫</li>';
  $('builtinList').innerHTML = builtins.map((b) => `<li data-id="${esc(b.id)}" data-builtin="1" class="${bank && bank.id === b.id ? 'on' : ''}"><b>${esc(b.title)}</b><span class="muted small">${b.questions.length} 題</span>
    <div class="row"><button data-act="open">看看</button><button data-act="clone">複製</button><button data-act="play">試玩</button></div></li>`).join('');
}
async function onList(e) {
  const li = e.target.closest('li[data-id]'); if (!li) return;
  const id = li.dataset.id, act = e.target.dataset.act || 'open';
  const src = li.dataset.builtin ? builtins.find((b) => b.id === id) : null;
  if (act === 'play') { location.href = `./?bank=${encodeURIComponent(id)}&menu`; return; }
  if (act === 'del') {
    if (!confirm('確定刪除這份題庫嗎？刪除後無法復原（建議先匯出備份）。')) return;
    await deleteBank(id); if (bank?.id === id) close(); refresh(); return;
  }
  if (act === 'clone') { await cloneBank(src); return; }
  if (src) openBank(structuredClone(src), true);
  else { const m = await getBank(id); openBank({ ...validateBank(m).bank, id: m.id }, false); }
}
$('myList').onclick = onList; $('builtinList').onclick = onList;

async function cloneBank(src) {
  const b = structuredClone(src);
  delete b.builtin; b.id = ''; b.title = src.title + '（我的）'; b.author = ''; b.license = '改編自內建原創範例';
  const saved = await saveBank(b);
  await refresh();
  openBank({ ...validateBank(saved).bank, id: saved.id }, false);
}
$('cloneThis').onclick = () => cloneBank(bank);
$('newBank').onclick = async () => {
  const saved = await saveBank({ title: '新題庫', subject: '', grade: '', author: '', license: '自編教材，僅供教學使用', questions: [], images: {} });
  await refresh();
  openBank({ ...validateBank({ ...saved, questions: [] }).bank, id: saved.id, title: saved.title }, false);
  $('bTitle').focus(); $('bTitle').select();
};

// ── open a bank ──
function openBank(b, ro) {
  bank = b; readonly = ro; editing = null;
  $('empty').hidden = true; $('editor').hidden = false;
  for (const k of ['Title', 'Subject', 'Grade', 'Author', 'License']) { const el = $('b' + k); el.value = b[k.toLowerCase()] || ''; el.disabled = ro; }
  $('readonly').hidden = !ro;
  for (const id of ['addQ', 'checkPaste', 'imgFile']) $(id).disabled = ro;
  $('playLink').href = `./?bank=${encodeURIComponent(b.id)}&menu`;
  $('saveState').textContent = ro ? '內建範例（唯讀）' : '✅ 已存在這台裝置';
  $('form').hidden = true;
  renderList(); renderImages(); refresh();
  tab('list');
}
function close() { bank = null; $('editor').hidden = true; $('empty').hidden = false; }

let saveTimer;
function changed() {
  if (readonly) return;
  $('saveState').textContent = '儲存中…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await saveBank(bank); $('saveState').textContent = '✅ 已存在這台裝置'; refresh(); }
    catch (e) { $('saveState').innerHTML = `<span class="bad">⚠️ 沒有存成功（${esc(e.message)}）。可能是裝置空間不足：請先匯出備份，或刪掉一些圖片。</span>`; }
  }, 400);
}
for (const k of ['Title', 'Subject', 'Grade', 'Author', 'License']) $('b' + k).oninput = (e) => { bank[k.toLowerCase()] = e.target.value; changed(); };

// ── tabs ──
function tab(name) {
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', b.dataset.tab === name);
  for (const t of document.querySelectorAll('.tab')) t.hidden = t.id !== 'tab-' + name;
}
document.querySelector('.tabs').onclick = (e) => { const t = e.target.closest('button')?.dataset.tab; if (t) tab(t); };

// ── question list ──
const img = (ref) => { const u = imageURL(ref, bank); return u ? `<img src="${esc(u)}" alt="">` : ''; };
const it = (o) => `${img(o.image)}${esc(o.text)}`;
function answerHTML(q) {
  if (q.type === 'choice' || q.type === 'image') return `<div class="opts">${q.options.map((o, i) => `<span class="${i === q.answer ? 'ans' : ''}">${LETTER(i)}. ${it(o)}</span>`).join('')}</div>`;
  if (q.type === 'tf') return `<div class="opts"><span class="ans">${q.answer ? '○ 對' : '× 錯'}</span></div>`;
  if (q.type === 'order') return `<div class="opts">${q.items.map((o, i) => `<span>${i + 1}. ${it(o)}</span>`).join('')}</div>`;
  if (q.type === 'match') return `<div class="opts">${q.pairs.map((p) => `<span>${it(p[0])} ↔ ${it(p[1])}</span>`).join('')}</div>`;
  if (q.type === 'number') return `<div class="opts"><span class="ans">${q.answer}${q.unit ? ' ' + esc(q.unit) : ''}</span>${q.distractors.map((d) => `<span>${d}</span>`).join('')}${q.distractors.length ? '' : '<span class="muted">錯的選項自動產生</span>'}</div>`;
  return '';
}
function renderList() {
  $('qCount').textContent = bank.questions.length;
  $('qList').innerHTML = bank.questions.map((q, i) => `<li data-i="${i}"><span class="tp">${TYPE_NAMES[q.type]}</span><span class="tp">難度 ${q.difficulty}</span>${q.tags.map((t) => `<span class="tp">${esc(t)}</span>`).join('')}
    <div>${img(q.image)} <b>${esc(q.q)}</b></div>${answerHTML(q)}
    ${q.hint ? `<div class="ex">💡 ${esc(q.hint)}</div>` : ''}${q.explain ? `<div class="ex">📖 ${esc(q.explain)}</div>` : ''}
    ${readonly ? '' : `<div class="row"><button data-act="edit">編輯</button><button data-act="up">▲</button><button data-act="down">▼</button><button data-act="dup">複製</button><button data-act="del">刪除</button></div>`}</li>`).join('') || '<p class="muted">還沒有題目。按「＋ 新增一題」，或到「貼上文字」整批加入。</p>';
}
$('qList').onclick = (e) => {
  const act = e.target.dataset.act; if (!act) return;
  const i = Number(e.target.closest('li').dataset.i), Q = bank.questions;
  if (act === 'edit') return openForm(i);
  if (act === 'del') { if (!confirm('刪除這一題？')) return; Q.splice(i, 1); }
  if (act === 'dup') Q.splice(i + 1, 0, { ...structuredClone(Q[i]), id: 'q' + newId('') });
  if (act === 'up' && i > 0) [Q[i - 1], Q[i]] = [Q[i], Q[i - 1]];
  if (act === 'down' && i < Q.length - 1) [Q[i + 1], Q[i]] = [Q[i], Q[i + 1]];
  renderList(); changed();
};

// ── one-question form ──
$('addQ').onclick = () => openForm(-1);
function blank(type) { return { type, q: '', options: [{ text: '' }, { text: '' }, { text: '' }], answer: type === 'number' ? '' : type === 'tf' ? true : 0, items: [{ text: '' }, { text: '' }, { text: '' }], pairs: [[{ text: '' }, { text: '' }], [{ text: '' }, { text: '' }]], hint: '', explain: '', difficulty: 2, tags: [], image: '', unit: '', distractors: [] }; }
function openForm(i) {
  editing = { i, q: i >= 0 ? { ...blank(bank.questions[i].type), ...structuredClone(bank.questions[i]) } : blank('choice') };
  renderForm(); $('form').hidden = false; $('form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
const imgField = (path, val) => `<span class="imgf"><input type="text" data-p="${path}" value="${esc(val || '')}" placeholder="圖片檔名或 art:代碼（可空白）" size="18">${val ? img(val).replace('<img', '<img class="thumb"') : ''}</span>`;
function renderForm() {
  const q = editing.q, T = q.type;
  let body = '';
  if (T === 'choice' || T === 'image') {
    body = `<div class="f"><span>選項<br><small>點圓圈選正確答案</small></span><div>${q.options.map((o, k) => `<div class="opt"><input type="radio" name="ans" value="${k}" ${q.answer === k ? 'checked' : ''} aria-label="正確答案">${LETTER(k)}.<input type="text" data-p="options.${k}.text" value="${esc(o.text)}" maxlength="40">${imgField(`options.${k}.image`, o.image)}${q.options.length > 2 ? `<button type="button" data-rm="options.${k}">✕</button>` : ''}</div>`).join('')}
      ${q.options.length < 4 ? '<button type="button" data-add="options">＋ 選項</button>' : '<small class="muted">最多 4 個選項（身體動作最多分得出 4 個）</small>'}</div></div>`;
  } else if (T === 'tf') {
    body = `<div class="f"><span>答案</span><div><label><input type="radio" name="tf" value="1" ${q.answer !== false ? 'checked' : ''}> ○ 對</label>　<label><input type="radio" name="tf" value="0" ${q.answer === false ? 'checked' : ''}> × 錯</label></div></div>`;
  } else if (T === 'order') {
    body = `<div class="f"><span>項目<br><small>照「正確順序」寫，遊戲會打亂</small></span><div>${q.items.map((o, k) => `<div class="opt">${k + 1}.<input type="text" data-p="items.${k}.text" value="${esc(o.text)}" maxlength="40">${imgField(`items.${k}.image`, o.image)}${q.items.length > 2 ? `<button type="button" data-rm="items.${k}">✕</button>` : ''}</div>`).join('')}${q.items.length < 6 ? '<button type="button" data-add="items">＋ 項目</button>' : ''}</div></div>`;
  } else if (T === 'match') {
    body = `<div class="f"><span>配對<br><small>左邊 ↔ 右邊</small></span><div>${q.pairs.map((p, k) => `<div class="opt"><input type="text" data-p="pairs.${k}.0.text" value="${esc(p[0].text)}" maxlength="30">↔<input type="text" data-p="pairs.${k}.1.text" value="${esc(p[1].text)}" maxlength="30">${q.pairs.length > 2 ? `<button type="button" data-rm="pairs.${k}">✕</button>` : ''}</div>`).join('')}${q.pairs.length < 6 ? '<button type="button" data-add="pairs">＋ 一組</button>' : ''}</div></div>`;
  } else if (T === 'number') {
    body = `<div class="f"><span>答案（數字）</span><div><input type="text" data-p="answer" value="${esc(q.answer ?? '')}" size="10"> 單位 <input type="text" data-p="unit" value="${esc(q.unit || '')}" size="8" placeholder="例如 公分"></div></div>
      <div class="f"><span>錯的選項<br><small>可空白，遊戲會自己出</small></span><div><input type="text" data-p="distractorsText" value="${esc((q.distractors || []).join('、'))}" placeholder="例如 54、63、48"></div></div>`;
  }
  $('form').innerHTML = `<h3>${editing.i >= 0 ? `編輯第 ${editing.i + 1} 題` : '新增一題'}</h3>
    <div class="f"><span>題型</span><div><select id="fType">${Object.entries(TYPE_NAMES).map(([k, n]) => `<option value="${k}" ${k === T ? 'selected' : ''}>${n}</option>`).join('')}</select> <small class="muted">${{ choice: '2～4 個選項選一個', tf: '學生用 ○（雙手舉高）× （雙臂交叉）回答', order: '排出正確順序，遊戲會一格一格問', match: '左右配對，遊戲會一組一組問', image: '看圖選答案（題目或選項放圖片）', number: '答案是一個數字，錯的選項可以讓遊戲自己出' }[T]}</small></div></div>
    <div class="f"><span>題目</span><div><textarea data-p="q" rows="2" maxlength="200">${esc(q.q)}</textarea></div></div>
    <div class="f"><span>題目圖片</span><div>${imgField('image', q.image)}</div></div>
    ${body}
    <div class="f"><span>提示（可空白）</span><div><input type="text" data-p="hint" value="${esc(q.hint)}" style="width:100%"></div></div>
    <div class="f"><span>解說（可空白）</span><div><input type="text" data-p="explain" value="${esc(q.explain)}" style="width:100%" placeholder="答錯時會顯示，幫助學生學會"></div></div>
    <div class="f"><span>難度・標籤</span><div><select data-p="difficulty">${[1, 2, 3].map((d) => `<option value="${d}" ${q.difficulty == d ? 'selected' : ''}>${['', '1 簡單', '2 普通', '3 困難'][d]}</option>`).join('')}</select> <input type="text" data-p="tagsText" value="${esc((q.tags || []).join('、'))}" placeholder="標籤，用頓號分開"></div></div>
    <div class="msg" id="fMsg"></div>
    <div class="btns"><button type="button" class="primary" id="fSave">✔ 存這一題</button><button type="button" id="fCancel">取消</button></div>`;
  check();
}
function set(path, v) { const ks = path.split('.'); let o = editing.q; for (const k of ks.slice(0, -1)) o = o[k]; o[ks.at(-1)] = v; }
function rawOf(q) {
  const r = { ...q };
  if (q.type === 'number') { r.answer = q.answer; r.options = String(q.distractorsText ?? (q.distractors || []).join('、')).split(/[、,，\s]+/).filter(Boolean); }
  if (q.type === 'choice' || q.type === 'image') r.answer = Number(q.answer) + 1;
  r.tags = q.tagsText ?? q.tags;
  return r;
}
function check() {
  const r = normalizeQuestion(rawOf(editing.q), { images: bank.images });
  $('fMsg').innerHTML = r.errors.length || r.warnings.length ? `<ul class="issues">${r.errors.map((m) => `<li class="e">❌ ${esc(m)}</li>`).join('')}${r.warnings.map((m) => `<li class="w">⚠️ ${esc(m)}</li>`).join('')}</ul>` : '<span class="ok">✅ 這一題沒問題</span>';
  $('fSave').disabled = r.errors.length > 0;
  return r;
}
$('form').addEventListener('input', (e) => {
  const p = e.target.dataset.p;
  if (p) set(p, e.target.value);
  if (e.target.name === 'ans') editing.q.answer = Number(e.target.value);
  if (e.target.name === 'tf') editing.q.answer = e.target.value === '1';
  check();
});
$('form').addEventListener('change', (e) => {
  if (e.target.id === 'fType') { const old = editing.q; editing.q = { ...blank(e.target.value), q: old.q, image: old.image, hint: old.hint, explain: old.explain, difficulty: old.difficulty, tags: old.tags }; renderForm(); }
  else if (e.target.dataset.p?.endsWith('image') || e.target.dataset.p === 'image') renderForm();
});
$('form').addEventListener('click', (e) => {
  const add = e.target.dataset.add, rm = e.target.dataset.rm;
  if (add) { editing.q[add].push(add === 'pairs' ? [{ text: '' }, { text: '' }] : { text: '' }); renderForm(); }
  if (rm) { const [k, i] = rm.split('.'); editing.q[k].splice(Number(i), 1); if (k === 'options' && editing.q.answer >= editing.q.options.length) editing.q.answer = 0; renderForm(); }
  if (e.target.id === 'fCancel') { $('form').hidden = true; editing = null; }
  if (e.target.id === 'fSave') {
    const r = check(); if (!r.question) return;
    const q = { ...r.question, id: editing.q.id || 'q' + newId('') };
    for (const o of [q, ...(q.options || []), ...(q.items || []), ...(q.pairs || []).flat()]) { const id = Object.keys(bank.images).find((k) => bank.images[k].name === o.image); if (id) o.image = 'img:' + id; }
    if (editing.i >= 0) bank.questions[editing.i] = q; else bank.questions.push(q);
    $('form').hidden = true; editing = null;
    renderList(); changed();
  }
});

// ── paste / spreadsheet ──
$('checkPaste').onclick = () => {
  const text = $('pasteBox').value;
  if (!text.trim()) { $('pasteReport').innerHTML = '<p class="muted">還沒有貼上任何文字。</p>'; return; }
  // pictures named by file name are looked up among this bank's pictures
  const r = parseAny(text, '', bank.images);
  pasted = r;
  const ok = r.bank?.questions.length || 0;
  $('pasteSum').textContent = `可以加入 ${ok} 題` + (r.errors.length ? `，${new Set(r.errors.map((e) => e.n)).size} 題有問題（不會加入）` : '');
  $('addPaste').disabled = !ok || readonly;
  $('pasteReport').innerHTML = issuesHTML(r.errors, r.warnings) + (ok ? `<div class="preview"><ol>${r.bank.questions.map((q) => `<li><span class="tp">${TYPE_NAMES[q.type]}</span> ${esc(q.q)}</li>`).join('')}</ol></div>` : '');
};
$('addPaste').onclick = () => {
  if (!pasted?.bank) return;
  for (const q of pasted.bank.questions) bank.questions.push({ ...q, id: 'q' + newId('') });
  $('pasteReport').innerHTML = `<p class="ok">✅ 已加入 ${pasted.bank.questions.length} 題。</p>`;
  $('pasteBox').value = ''; $('addPaste').disabled = true; $('pasteSum').textContent = ''; pasted = null;
  renderList(); changed();
};
function issuesHTML(errors, warnings) {
  if (!errors.length && !warnings.length) return '<p class="ok">✅ 全部都沒問題。</p>';
  return `<ul class="issues">${errors.map((e) => `<li class="e">❌ ${esc(describeIssue(e))}</li>`).join('')}${warnings.map((e) => `<li class="w">⚠️ ${esc(describeIssue(e))}</li>`).join('')}</ul>`;
}

// ── import a file ──
$('importFile').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (f.size > 30 * 1024 * 1024) return dialog(`<p class="bad">檔案太大（${(f.size / 1048576).toFixed(1)} MB），題庫檔通常不到 10 MB。</p>`, [['好']]);
  const text = await f.text();
  const r = parseAny(text, f.name);
  if (!r.bank || !r.bank.questions.length) return dialog(`<h3>沒辦法匯入「${esc(f.name)}」</h3>${issuesHTML(r.errors, r.warnings)}<p class="muted small">可以先下載範本，照範本的格式整理。</p>`, [['好']]);
  if (r.bank.title === '未命名題庫') r.bank.title = f.name.replace(/\.[^.]+$/, '');
  const choice = await dialog(`<h3>匯入「${esc(r.bank.title)}」</h3><p>找到 <b>${r.bank.questions.length}</b> 題可以用${r.errors.length ? `，另外有問題的題目不會匯入：` : '。'}</p>${r.errors.length || r.warnings.length ? issuesHTML(r.errors, r.warnings) : ''}
    <label class="chk"><input type="checkbox" id="impOK"> 我確認這份題庫的文字與圖片我有權使用（自己做的、作者同意分享，或授權清楚）。</label>`, [['匯入成新題庫', 'go', true], ['取消']]);
  if (choice !== 'go') return;
  r.bank.id = '';
  const saved = await saveBank(r.bank);
  await refresh();
  openBank({ ...validateBank(saved).bank, id: saved.id }, false);
};
function dialog(html, buttons) {
  return new Promise((res) => {
    $('dlgBody').innerHTML = html;
    $('dlgBtns').innerHTML = buttons.map(([t, v = t, needOK], i) => `<button value="${esc(v)}" class="${i === 0 ? 'primary' : ''}" ${needOK ? 'data-needok="1" disabled' : ''}>${esc(t)}</button>`).join('');
    const ok = $('impOK');
    if (ok) ok.onchange = () => { for (const b of $('dlgBtns').querySelectorAll('[data-needok]')) b.disabled = !ok.checked; };
    $('dlg').onclose = () => res($('dlg').returnValue);
    $('dlg').showModal();
  });
}

// ── export ──
$('exportJSON').onclick = () => download(safeName(bank.title) + '.json', toJSON(bank), 'application/json');
$('exportCSV').onclick = () => {
  download(safeName(bank.title) + '.csv', toCSVText(bank), 'text/csv');
  if (Object.keys(bank.images || {}).length) dialog('<p>CSV 檔<b>不含圖片</b>（只有圖片檔名）。要連圖片一起給別的老師，請用「匯出 .json」。</p>', [['好']]);
};

// ── pictures ──
function renderImages() {
  const ims = Object.entries(bank.images || {});
  $('imgGrid').innerHTML = ims.length ? ims.map(([id, im]) => `<figure><img src="${esc(im.data)}" alt=""><figcaption>${esc(im.name)}<br>${readonly ? '' : `<button data-del="${esc(id)}">刪除</button>`}</figcaption></figure>`).join('') : '<p class="muted small">還沒有上傳圖片。</p>';
}
$('imgOK').onchange = () => { $('imgPick').classList.toggle('primary', $('imgOK').checked); };
$('imgPick').onclick = (e) => { if (!$('imgOK').checked) { e.preventDefault(); dialog('<p>上傳之前，請先勾選「我確認要上傳的圖片…我有權使用」。</p>', [['好']]); } };
$('imgFile').onchange = async (e) => {
  const files = [...e.target.files]; e.target.value = '';
  const bad = [];
  for (const f of files) {
    try {
      const { data } = await shrinkImage(f);
      let name = f.name; const names = new Set(Object.values(bank.images).map((x) => x.name));
      for (let k = 2; names.has(name); k++) name = f.name.replace(/(\.[^.]+)?$/, `-${k}$1`);
      bank.images[newId('i')] = { name, data };
    } catch (err) { bad.push(`${f.name}：${err.message}`); }
  }
  renderImages(); changed();
  if (bad.length) dialog(`<p class="bad">有些檔案沒辦法用：</p><ul>${bad.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`, [['好']]);
};
$('imgGrid').onclick = (e) => {
  const id = e.target.dataset.del; if (!id) return;
  const name = bank.images[id].name;
  const used = bank.questions.some((q) => JSON.stringify(q).includes('img:' + id));
  if (used && !confirm(`「${name}」有題目正在用，刪掉後那些題目就不會顯示圖片。確定刪除？`)) return;
  delete bank.images[id]; renderImages(); renderList(); changed();
};
$('artGrid').innerHTML = Object.entries(ART_LIST).map(([k, vals]) => vals.map((v) => `<figure data-ref="art:${k}:${v}" title="點一下複製代碼"><img src="${artURL(`art:${k}:${v}`)}" alt="${ART_NAMES[k]} ${v}"><figcaption>${ART_NAMES[k]}<br><code>art:${k}:${v}</code></figcaption></figure>`).join('')).join('');
$('artGrid').onclick = async (e) => {
  const f = e.target.closest('figure'); if (!f) return;
  try { await navigator.clipboard.writeText(f.dataset.ref); f.querySelector('figcaption').insertAdjacentHTML('beforeend', '<br><span class="ok">已複製</span>'); } catch { prompt('複製這個代碼：', f.dataset.ref); }
};

// ── AI (instructions only; see docs/quiz-ai.md) ──
mountAIPanel($('aiBody'), {
  onResult(text, ui) {
    if (!bank || readonly) { ui.report.innerHTML = '<p class="bad">請先開啟或新增一份「我的題庫」。</p>'; return; }
    if (!text.trim()) { ui.report.innerHTML = '<p class="muted">還沒有貼上 AI 的回覆。</p>'; return; }
    const r = parseAIOutput(text, bank.images);
    const ok = r.bank?.questions.length || 0;
    for (const q of r.bank?.questions || []) bank.questions.push({ ...q, id: 'q' + newId('') });
    ui.sum.textContent = ok ? `已加入 ${ok} 題` : '';
    ui.report.innerHTML = issuesHTML(r.errors, r.warnings) + (ok ? `<p class="ok">✅ 已加入 ${ok} 題到「${esc(bank.title)}」。<b>請到「📋 題目」逐題檢查答案是否正確。</b></p>` : '');
    if (ok) { ui.clear(); renderList(); changed(); }
  },
});

// ── start ──
builtins = await loadBuiltins('../data/quiz/');
if (!(await persistent())) $('storeWarn').textContent = ' ⚠️ 這個瀏覽器（可能是無痕視窗）不能長期保存資料：關掉視窗題庫就會不見，請記得匯出。';
await refresh();
const want = new URLSearchParams(location.search).get('bank');
if (want) { const b = builtins.find((x) => x.id === want); if (b) openBank(structuredClone(b), true); else { const m = await getBank(want); if (m) openBank({ ...validateBank(m).bank, id: m.id }, false); } }
window.editor = { get bank() { return bank; } };
