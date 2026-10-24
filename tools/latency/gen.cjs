// 產生人偶揮棒的骨架預錄檔（taikan-pose/1）＋（可選）影格圖片，給延遲量測與自動測試用。
//   先開本機伺服器：npm run dev
//   node tools/latency/gen.cjs side [seated=0|1] [frames=0|1]   → out/latency/mp-bat-side.json（frames=1 另存 PNG）
//   影格轉成假鏡頭影片：ffmpeg -framerate 30 -i out/latency/mp-bat-side-png/%04d.png -pix_fmt yuv420p out/latency/mp-bat-side.y4m
// 需要 playwright（雲端沙盒已內建）。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const [stance = 'side', seated = '0', frames = '0'] = process.argv.slice(2);
  const port = process.env.PORT || 5173;
  const out = path.join(__dirname, '../../out/latency');
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 700, height: 520 } });
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(`http://localhost:${port}/tools/latency/gen.html?stance=${stance}&seated=${seated}&frames=${frames}`);
  await p.waitForFunction(() => window.result, null, { timeout: 600000, polling: 1000 });
  const r = await p.evaluate(() => window.result);
  const name = r.clip.name;
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(r.clip));
  if (r.imgs.length) {
    fs.mkdirSync(path.join(out, `${name}-png`), { recursive: true });
    r.imgs.forEach((d, i) => fs.writeFileSync(path.join(out, `${name}-png`, `${String(i).padStart(4, '0')}.png`), Buffer.from(d.split(',')[1], 'base64')));
  }
  console.log(name, '影格', r.clip.frames.length, '起動時間', r.clip.onsets.join(', '), 'ms');
  await b.close();
})();
