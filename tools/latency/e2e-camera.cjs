// 端對端：用「假鏡頭」（人偶揮棒影片）開打擊練習的鏡頭模式＋延遲診斷，印出診斷數字。
//   node tools/latency/e2e-camera.cjs out/latency/mp-bat-side.y4m ["&delegate=cpu&worker=1"] [秒數]
// 注意：沙盒沒有顯示卡，推論很慢（每格 100～300 毫秒），只能驗證流程與「辨識」那一段；鏡頭與推論的毫秒數要在平板上看。
const { chromium } = require('playwright');
(async () => {
  const [video, extra = '', secs = '30'] = process.argv.slice(2);
  const port = process.env.PORT || 5173;
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 620 }, permissions: ['camera'] });
  await ctx.addInitScript(() => {
    localStorage.setItem('ocean-games.batting.settings', JSON.stringify({ input: 'camera', calibTest: false, diag: true, diff: 'easy' }));
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(`http://localhost:${port}/game/?g=batting&q=low&scale=0.4&diag=1&menu${extra}`);
  await p.waitForFunction(() => window.kit?.source === 'camera' && window.kit.stats?.fps > 0, null, { timeout: 180000, polling: 500 });
  await p.click('#mStart');
  await p.waitForTimeout(+secs * 1000);
  const r = await p.evaluate(() => ({ stats: window.kit.stats, diag: window.batDiag || [], text: document.getElementById('bDiag').innerText }));
  console.log(r.text); console.table(r.diag); console.log(r.stats);
  await b.close();
})();
