// 機場的尺寸與座標換算（純資料，畫面與任務判斷共用，可以在 node 測試）。
// 一條跑道「27／09」：沿著東西向，從原點往兩邊各 400 公尺。起飛方向 270°（往西，朝海邊）。
// 世界座標：x 東、z 南、y 上；heading 0 = 北（-z）、90 = 東（+x）。
export const RUNWAY = {
  name: '27', heading: 270, length: 800, width: 23,
  thrX: 400,           // 27 號跑道頭（東端）的 x；往西是 -x
  elevFt: 20,          // 機場標高（呎）
  startX: 375,         // 起飛時停在跑道頭往內 25 公尺
  aimFromThr: 250,     // 降落的瞄準點：離跑道頭 250 公尺
  papiFromThr: 250, papiSide: 18, // 進場坡度指示燈（PAPI）在瞄準點旁、跑道左側 18 公尺外
  glide: 3,            // 進場下滑角（度）
};

// 相對跑道的位置：along = 從 27 跑道頭往前（往西）幾公尺；cross = 偏離中心線（往右為正，面向 270° 時右邊是北）
export function rwyFrame(x, z, R = RUNWAY) {
  return { along: R.thrX - x, cross: -z };
}
export function onRunway(x, z, R = RUNWAY, margin = 0) {
  const f = rwyFrame(x, z, R);
  return f.along >= -margin && f.along <= R.length + margin && Math.abs(f.cross) <= R.width / 2 + margin;
}
// 跑道方向的航向差（-180 ~ 180，正 = 偏右）
export const hdgErr = (hdg, R = RUNWAY) => ((hdg - R.heading + 540) % 360) - 180;
