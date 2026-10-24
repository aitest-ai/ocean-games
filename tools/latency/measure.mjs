// 量辨識器的延遲：把揮棒骨架預錄檔餵給辨識器（打擊模式 sideOk），列出
// 「真實起動 → batStart／bat 送出」各幾毫秒（以影格的拍攝時間算，不含鏡頭與推論）。
//   node tools/latency/measure.mjs                     （預設：taikan-kit/fixtures/mp-bat-*.json）
//   node tools/latency/measure.mjs out/latency/x.json  （自己產生的檔案）
import { readFileSync, readdirSync } from 'node:fs';
import { Recognizer } from '../../packages/taikan-kit/src/recognizer.js';
import { unpackPose } from '../../packages/taikan-kit/src/pose.js';

const fx = new URL('../../packages/taikan-kit/fixtures/', import.meta.url);
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(fx).filter((n) => n.startsWith('mp-bat-')).map((n) => new URL(n, fx));
const rows = [];
for (const f of files) {
  const clip = JSON.parse(readFileSync(f));
  const ev = [];
  const r = new Recognizer({ sideOk: true, emit: (e) => { if (e.type === 'bat' || e.type === 'batStart') ev.push(e); } });
  for (const row of clip.frames) { const p = unpackPose(row); r.feed(p, p.t); }
  clip.onsets.forEach((on, i) => {
    const next = clip.onsets[i + 1] ?? Infinity;
    const pick = (type) => ev.find((e) => e.type === type && e.time >= on - 300 && e.time < next);
    const s = pick('batStart'), b = pick('bat');
    rows.push({ 檔案: clip.name, 第幾次: i + 1, '起動→batStart(ms)': s ? Math.round(s.time - on) : '沒有', '起動→bat(ms)': b ? Math.round(b.time - on) : '沒有', '擊球點(ms)': clip.contacts ? clip.contacts[i] - on : '-', '辨識器估的起動誤差(ms)': b ? Math.round(b.onset - on) : '-' });
  });
}
console.table(rows);
