// Field-guide cards (圖鑑卡) and the fridge (冰箱). Every word and number on a card is laid out here
// from the database; the pictures never carry text.

import { val, percentile, lognormal, sizeClass } from './stats.js';
import { thumbURL } from './art.js';

const STORE = 'ocean-games.fishing.fridge';
const STATUS = {
  verified: { label: '已查證', cls: 'ok', tip: '兩個以上來源一致，或直接讀過權威原始資料' },
  partial: { label: '部分查證', cls: 'mid', tip: '只有一個來源，或來源之間有差異' },
  illustrative: { label: '示意', cls: 'bad', tip: '無法確認，只是合理的示意值，不是精確數據' },
  'game-design': { label: '遊戲設定', cls: 'game', tip: '為了遊戲好玩而設定，不是科學數據' },
};
export const statusBadge = (s) => { const b = STATUS[s] || STATUS.illustrative; return `<span class="badge ${b.cls}" title="${b.tip}">${b.label}</span>`; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const LTYPE = { TL: '全長', FL: '尾叉長', SL: '標準體長', CCL: '背甲曲線長' };

// ── storage ──
export function loadFridge() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (d && d.version === 1) return d;
  } catch {}
  return { version: 1, items: [], released: [], junk: {}, turtles: 0, seen: [] };
}
export function saveFridge(f) {
  if (f.items.length > 300) f.items = f.items.slice(-300);
  if (f.released.length > 300) f.released = f.released.slice(-300);
  try { localStorage.setItem(STORE, JSON.stringify(f)); } catch {}
}
export function recordCatch(f, rec) {
  if (!f.seen.includes(rec.id)) f.seen.push(rec.id);
  const row = { id: rec.id, lengthCm: rec.lengthCm, weightG: rec.weightG, date: new Date().toISOString().slice(0, 10), diff: rec.diff };
  if (rec.kind === 'fish') (rec.outcome === 'kept' ? f.items : f.released).push(row);
  else if (rec.kind === 'junk') f.junk[rec.id] = (f.junk[rec.id] || 0) + 1;
  else if (rec.kind === 'bycatch') f.turtles++;
  saveFridge(f);
}

// ── the size chart: the lognormal catch distribution, p5–p95 shaded, this fish marked ──
function sizeChart(sp, L) {
  const { mu, sigma } = lognormal(sp.length.catch);
  const lo = Math.exp(mu - 2.6 * sigma), hi = Math.exp(mu + 2.6 * sigma);
  const W = 320, Hh = 90, xs = (x) => ((x - lo) / (hi - lo)) * W;
  const pdf = (x) => Math.exp(-((Math.log(x) - mu) ** 2) / (2 * sigma * sigma)) / x;
  let peak = 0;
  for (let i = 0; i <= 60; i++) peak = Math.max(peak, pdf(lo + ((hi - lo) * i) / 60));
  const pts = [];
  for (let i = 0; i <= 60; i++) { const x = lo + ((hi - lo) * i) / 60; pts.push(`${xs(x).toFixed(1)},${(Hh - 14 - (pdf(x) / peak) * (Hh - 26)).toFixed(1)}`); }
  const p5 = Math.exp(mu - 1.645 * sigma), p95 = Math.exp(mu + 1.645 * sigma);
  const mx = Math.min(Math.max(xs(L), 2), W - 2);
  const ticks = [p5, Math.exp(mu), p95].map((x) => `<text x="${xs(x)}" y="${Hh - 1}" text-anchor="middle">${x.toFixed(0)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${Hh}" class="dist" role="img" aria-label="同種魚體長分布">
    <rect x="${xs(p5)}" y="4" width="${xs(p95) - xs(p5)}" height="${Hh - 18}" class="band"/>
    <polyline points="${pts.join(' ')}" class="curve"/>
    <line x1="${mx}" x2="${mx}" y1="2" y2="${Hh - 14}" class="me"/>
    <circle cx="${mx}" cy="8" r="5" class="me-dot"/>
    ${ticks}
  </svg>`;
}

function monthsBar(info) {
  const m = val(info?.months) || [], pk = val(info?.peakMonths) || [];
  return `<div class="months">${MONTHS.map((x, i) => `<span class="${pk.includes(i + 1) ? 'peak' : m.includes(i + 1) ? 'on' : ''}">${x}</span>`).join('')}</div>`;
}

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const field = (label, f, extra = '') => (f == null || val(f) == null ? '' : `<div class="fact"><b>${label}</b><span>${esc(val(f))}${extra}</span>${f.status ? statusBadge(f.status) : ''}</div>`);

// rows for the "sources" table: every datum that carries src / license / status
function provenanceRows(sp, sources) {
  const rows = [];
  const walk = (o, path) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return;
    if ('value' in o && ('status' in o || 'src' in o)) {
      const srcs = (o.src || []).map((id) => sources[id]).filter(Boolean);
      rows.push({ path, value: READABLE[o.value] || o.value, status: o.status, license: o.license || [...new Set(srcs.map((s) => s.license))].join('；'), src: srcs, note: o.note });
      return;
    }
    for (const [k, x] of Object.entries(o)) if (k !== 'art' && k !== 'game') walk(x, path ? `${path}.${k}` : k);
  };
  walk(sp, '');
  return rows;
}
const READABLE = {
  always: '一律放流', belowSize: '未滿尺寸要放流', none: '不需放流', protected: '保育類', law: '法規',
  'law-reference': '遊戲規則：比照漁船法規', 'maturity-suggestion': '遊戲規則：依初次成熟體長',
};
const PATH_LABEL = {
  'names.zh': '中文名', 'names.aliases': '俗名', 'names.en': '英文名', 'names.scientific': '學名', 'names.family': '科',
  'length.type': '體長量法', 'length.catch.p50': '常見釣獲體長（中位數）', 'length.catch.p95': '常見釣獲體長（大型，95 百分位）', 'length.min': '最小釣獲體長', 'length.maxCommon': '常見最大體長', 'length.maxRecorded': '最大紀錄',
  'lengthWeight.a': '體重公式 a', 'lengthWeight.b': '體重公式 b', 'maturity.L50': '初次成熟體長', habitat: '棲息環境', depth: '水深', diet: '食性', behavior: '習性', fightNote: '拉扯特性', intro: '介紹文字', safety: '安全提醒',
  'conservation.iucn': 'IUCN 紅皮書', 'conservation.taiwan': '台灣法規地位', 'conservation.legalMinSize': '法定最小尺寸', 'conservation.release.mode': '放流規則', 'conservation.release.sizeCm': '放流尺寸（公分）', 'conservation.release.basis': '放流依據', 'conservation.note': '保育補充', handling: '誤釣時怎麼做', 'regions.tw-northeast.months': '東北角可釣月份', 'regions.tw-northeast.peakMonths': '東北角最多的月份',
};
const pathLabel = (p) => PATH_LABEL[p] || PATH_LABEL[p.replace(/^regions\.[^.]+\./, '')] || (p.startsWith('regions.') ? '海域與季節：' + p.split('.').slice(2).join('.') : p);

// ── a field-guide card for one species, optionally for one individual (rec) ──
export function cardHTML(sp, { rec = null, sources = {}, region = null, imgURL = '' } = {}) {
  const n = sp.names;
  const aliases = val(n.aliases) || [];
  const info = region ? sp.regions?.[region.id] : null;
  let me = '';
  if (rec && sp.kind === 'fish') {
    const p = rec.percentile ?? percentile(sp, rec.lengthCm);
    const cls = sizeClass(p);
    const lt = LTYPE[val(sp.length.type)] || val(sp.length.type);
    me = `<section class="me-box">
      <h3>這一隻</h3>
      <div class="me-nums">
        <div><small>體長（${lt}）</small><b>${rec.lengthCm.toFixed(1)}</b> 公分</div>
        <div><small>體重（依長度換算）</small><b>${rec.weightG >= 1000 ? (rec.weightG / 1000).toFixed(2) : Math.round(rec.weightG)}</b> ${rec.weightG >= 1000 ? '公斤' : '公克'}</div>
        <div><small>在同種魚裡</small><b class="size ${cls.tone}">${cls.label}</b></div>
      </div>
      <p class="pct">比大約 <b>${Math.round(p * 100)}%</b> 的同種魚（常見釣獲的個體）還長。</p>
      ${sizeChart(sp, rec.lengthCm)}
      <p class="tiny">灰色帶＝大多數（90%）同種魚的體長範圍，白線＝這一隻。分布是依「常見釣獲體長」估計的 ${statusBadge(sp.length.catch.p50.status)}；體重用「體重＝a×長度<sup>b</sup>」換算 ${statusBadge(sp.lengthWeight.b.status)}，每隻胖瘦不同，所以是「約」。</p>
      ${rec.release?.required ? `<p class="release">🔁 這一隻要<b>放流</b>：${esc(rec.release.reason || '')}</p>` : ''}
    </section>`;
  }
  const C = sp.conservation || {};
  const rel = C.release ? val(C.release.mode) : 'none';
  const relText = rel === 'always' ? '一律放流（不能帶走）' : rel === 'belowSize' ? `未滿 ${val(C.release.sizeCm)} 公分要放流` : '可以帶走（請只帶走吃得完的量）';
  const basis = { law: '依法規', protected: '保育類，受法律保護', 'maturity-suggestion': '本遊戲規則：依初次成熟體長，讓小魚長大繁殖', 'law-reference': '本遊戲規則：比照漁船的法規尺寸', none: '' }[val(C.release?.basis)] || '';
  return `
  <article class="fcard ${sp.kind}">
    <header>
      <div>
        <h2>${esc(val(n.zh))}</h2>
        <p class="sci"><i>${esc(val(n.scientific))}</i>${n.family ? `・${esc(val(n.family))}` : ''}</p>
        ${aliases.length ? `<p class="alias">俗名：${aliases.map(esc).join('、')}</p>` : ''}
      </div>
      <div class="diffs">${sp.game?.difficulty ? `<small>難釣程度</small><span class="stars5">${stars(val(sp.game.difficulty))}</span>` : ''}</div>
    </header>
    <figure class="pic">${imgURL ? `<img src="${imgURL}" alt="${esc(val(n.zh))}的圖鑑圖">` : ''}
      ${sp.art && !sp.artOfficial ? '<figcaption>暫代圖（正式圖鑑插畫製作中）</figcaption>' : ''}</figure>
    ${me}
    <section><h3>介紹</h3><p>${esc(val(sp.intro))}</p></section>
    <section class="facts">
      ${field('棲息環境', sp.habitat)}
      ${field('水深', sp.depth)}
      ${field('吃什麼', sp.diet)}
      ${field('習性', sp.behavior)}
      ${field('上鉤後', sp.fightNote)}
      ${sp.length?.maxCommon ? `<div class="fact"><b>體型</b><span>常見 ${val(sp.length.catch.p50)}～${val(sp.length.catch.p95)} 公分，最大約 ${val(sp.length.maxCommon)} 公分${sp.length.maxRecorded ? `（紀錄 ${val(sp.length.maxRecorded)} 公分）` : ''}</span>${statusBadge(sp.length.maxCommon.status)}</div>` : ''}
      ${info ? `<div class="fact"><b>出現季節（${esc(region.name)}）</b>${monthsBar(info)}<small class="legend"><i class="on"></i>常見 <i class="peak"></i>最多</small>${statusBadge(info.months.status)}</div>` : ''}
    </section>
    ${sp.safety ? `<section class="safety-box"><h3>⚠️ 安全提醒</h3><p>${esc(val(sp.safety))}</p></section>` : ''}
    <section class="cons"><h3>🌱 保育資訊</h3>
      <div class="fact"><b>放流規則</b><span>${relText}${basis ? `（${basis}）` : ''}</span>${C.release?.mode?.status ? statusBadge(C.release.mode.status) : ''}</div>
      ${field('台灣法規', C.taiwan)}
      ${field('法定最小尺寸', C.legalMinSize)}
      ${field('IUCN 紅皮書', C.iucn)}
      ${C.note ? `<p>${esc(val(C.note))}</p>` : ''}
    </section>
    <details class="prov"><summary>📚 資料來源、授權與查證狀態</summary>
      <table><thead><tr><th>項目</th><th>內容</th><th>來源</th><th>授權</th><th>查證</th></tr></thead><tbody>
      ${provenanceRows(sp, sources).map((r) => `<tr><td>${esc(pathLabel(r.path))}</td><td>${esc((Array.isArray(r.value) ? r.value.join('、') : String(r.value ?? '—')).replace(/<[^>]+>/g, '').slice(0, 90))}${r.note ? `<br><small>${esc(r.note)}</small>` : ''}</td>
        <td>${r.src.map((s) => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.short || s.title)}</a>` : esc(s.short || s.title)).join('；') || '—'}</td><td>${esc(r.license || '—')}</td><td>${statusBadge(r.status)}</td></tr>`).join('')}
      </tbody></table>
      <p class="tiny">「示意」的數字只是合理的估計，不能當成精確資料引用。介紹文字是本專案自己寫的。</p>
    </details>
  </article>`;
}

export function junkCardHTML(j, { imgURL = '', sources = {} } = {}) {
  const src = (val(j.factSrc) || j.factSrc?.src || []).map?.((id) => sources[id]).filter(Boolean) || [];
  return `<article class="fcard junk">
    <header><div><h2>${esc(val(j.names.zh))}</h2><p class="sci">海洋垃圾・已經幫海洋撿起來了</p></div></header>
    <figure class="pic">${imgURL ? `<img src="${imgURL}" alt="${esc(val(j.names.zh))}">` : ''}</figure>
    <section><h3>它為什麼不該在海裡</h3><p>${esc(val(j.intro))}</p></section>
    ${j.fact ? `<section class="cons"><h3>🔎 你知道嗎</h3><p>${esc(val(j.fact))} ${j.fact.status ? statusBadge(j.fact.status) : ''}</p>${src.length ? `<p class="tiny">來源：${src.map((s) => esc(s.short || s.title)).join('；')}</p>` : ''}</section>` : ''}
    <section><h3>怎麼處理</h3><p>${esc(val(j.disposal))}</p></section>
  </article>`;
}

// ── the fridge ──
export function fridgeHTML(fridge, db, thumbs) {
  const fish = db.catchables.filter((c) => c.kind === 'fish');
  const seen = new Set(fridge.seen);
  const byId = Object.fromEntries(db.catchables.map((c) => [c.id, c]));
  const items = [...fridge.items].reverse();
  const junkN = Object.values(fridge.junk).reduce((a, b) => a + b, 0);
  const tile = (row, i, released) => {
    const sp = byId[row.id];
    if (!sp) return '';
    const p = percentile(sp, row.lengthCm), cls = sizeClass(p);
    return `<button class="tile" data-id="${row.id}" data-i="${i}" data-rel="${released ? 1 : 0}">
      <img src="${thumbs[row.id] || ''}" alt="">
      <b>${esc(val(sp.names.zh))}</b>
      <span>${row.lengthCm.toFixed(1)} 公分・<i class="size ${cls.tone}">${cls.label}</i></span>
      <small>${row.date}${released ? '・已放流' : ''}</small>
    </button>`;
  };
  return `
  <div class="fr-head">
    <div class="fr-stat"><b>${items.length}</b><small>冰箱裡的魚</small></div>
    <div class="fr-stat"><b>${fridge.released.length}</b><small>放流</small></div>
    <div class="fr-stat"><b>${fish.filter((f) => seen.has(f.id)).length} / ${fish.length}</b><small>圖鑑收集</small></div>
    <div class="fr-stat"><b>${junkN}</b><small>撿起的垃圾</small></div>
    ${fridge.turtles ? `<div class="fr-stat"><b>${fridge.turtles}</b><small>遇到海龜</small></div>` : ''}
  </div>
  <h3>🧊 冰箱</h3>
  <div class="tiles">${items.length ? items.map((r) => tile(r, fridge.items.indexOf(r), false)).join('') : '<p class="empty">冰箱還是空的，去釣魚吧！</p>'}</div>
  ${fridge.released.length ? `<h3>🔁 放流紀錄</h3><div class="tiles">${[...fridge.released].reverse().slice(0, 40).map((r) => tile(r, fridge.released.indexOf(r), true)).join('')}</div>` : ''}
  <h3>📖 圖鑑（點一下看介紹）</h3>
  <div class="tiles dex">${db.catchables.filter((c) => c.kind !== 'junk').map((c) => `<button class="tile ${seen.has(c.id) ? '' : 'unseen'}" data-dex="${c.id}">
      <img src="${thumbs[c.id] || ''}" alt=""><b>${seen.has(c.id) ? esc(val(c.names.zh)) : '？？？'}</b><small>${seen.has(c.id) ? '' : '還沒遇到'}</small></button>`).join('')}</div>
  ${junkN ? `<h3>♻️ 淨海成果</h3><div class="tiles">${db.catchables.filter((c) => c.kind === 'junk' && fridge.junk[c.id]).map((c) => `<button class="tile" data-junk="${c.id}"><img src="${thumbs[c.id] || ''}" alt=""><b>${esc(val(c.names.zh))}</b><span>× ${fridge.junk[c.id]}</span></button>`).join('')}</div>` : ''}
  <p class="tiny">冰箱紀錄只存在這台裝置的瀏覽器裡，不會上傳。</p>`;
}

