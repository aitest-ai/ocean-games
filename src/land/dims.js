// 少棒（12 歲以下、60 呎場地）球場尺寸，單位公尺。出處與取捨寫在 docs/baseball-plan.md「場地規格」。
//
// 座標：本壘板尖端（靠捕手那一角）= 原點，y 朝上，+z 朝中外野。
// 從捕手往外看，三壘在左邊（+x）、一壘在右邊（−x）。
const FT = 0.3048, IN = 0.0254;

export const FIELD = {
  base: 60 * FT,               // 壘間 60 呎 = 18.29 m（台灣世界少棒聯盟、Little League Majors）
  pitch: 46 * FT,              // 投手板前緣到本壘尖端 46 呎 = 14.02 m
  moundRadius: 9 * FT,         // 投手丘直徑 18 呎
  moundHeight: 6 * IN,         // 高 6 吋 = 15 cm
  rubber: [18 * IN, 4 * IN],   // 投手板 18 × 4 吋（少棒）
  arc: 50 * FT,                // 內野紅土弧線：以投手板為圓心半徑 50 呎
  homeCircle: 10 * FT,         // 本壘周圍紅土圓半徑 10 呎
  plateWidth: 17 * IN,         // 本壘板寬 17 吋（各級棒球規則相同）
  box: [3 * FT, 6 * FT],       // 打擊區 3 × 6 呎（少棒）
  boxGap: 6 * IN,              // 打擊區內線離本壘板 6 吋
  baseSize: 15 * IN,           // 壘包 15 吋見方（畫面用）
  backstop: 25 * FT,           // 本壘到後擋網 25 呎
  fenceLine: 200 * FT,         // 左右外野（界線）全壘打牆 200 呎 = 60.96 m（建議值）
  fenceCenter: 215 * FT,       // 中外野 215 呎（自訂：讓圍牆成弧形，介於 200 呎建議值與 Lamade 球場 225 呎之間）
  wallHeight: 1.8,             // 外野牆高（自訂，約 6 呎）
  foulWidth: 7.5,              // 界外區寬度（界線到看台圍欄）
  ballDiameter: 0.073,         // 硬式棒球周長 9～9¼ 吋
  strikeZone: [0.45, 1.05],    // 打擊練習用的好球帶高度（約五年級學生膝蓋到腋下）
};

export const S2 = Math.SQRT1_2;
// 界線方向：三壘線 (+x)、一壘線 (−x)
export const LINE3 = [S2, S2], LINE1 = [-S2, S2];

// 從中外野方向量角度（弧度，+ 往三壘側）與距離，算出地面座標 [x, z]
export const polar = (ang, r) => [Math.sin(ang) * r, Math.cos(ang) * r];
// 地面座標 → 角度（0 = 中外野，±π/4 = 界線）
export const angleOf = (x, z) => Math.atan2(x, z);
export const isFair = (x, z) => z > 0 && Math.abs(angleOf(x, z)) <= Math.PI / 4 + 1e-6;

// 外野牆距離（隨角度變化：界線 200 呎 → 中外野 215 呎）
export function fenceR(ang) {
  const a = Math.min(Math.abs(ang), Math.PI / 4);
  return FIELD.fenceLine + (FIELD.fenceCenter - FIELD.fenceLine) * Math.cos(2 * a);
}

export const BASES = {
  home: [0, 0],
  first: [LINE1[0] * FIELD.base, LINE1[1] * FIELD.base],
  second: [0, FIELD.base * Math.SQRT2],
  third: [LINE3[0] * FIELD.base, LINE3[1] * FIELD.base],
  rubber: [0, FIELD.pitch],
};
