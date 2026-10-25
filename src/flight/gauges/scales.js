// 儀表的刻度換算：數值 → 指針角度。錶面刻度（faces.js）和指針（instruments.js）都用這裡的函式，
// 所以「指針指到的數字」一定和錶面上印的數字一致；單元測試也測這裡（tests/flight.test.mjs）。
//
// 角度一律用弧度，從 12 點鐘方向起算、順時針為正（跟看錶的習慣一樣）。
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const D = Math.PI / 180;

// 空速表：0~40 kt 壓縮在 0°~30°，40~160 kt 每節 2.5°（30°~330°），超過 160 kt 停在 340°
export function asiAngle(kt) {
  const v = Math.max(kt, 0);
  if (v <= 40) return (v / 40) * 30 * D;
  if (v <= 160) return (30 + (v - 40) * 2.5) * D;
  return clamp(330 + (v - 160) * 1, 330, 340) * D;
}

// 高度表三根針：百呎（長針，一圈 1000 ft）、千呎（短粗針，一圈 1 萬 ft）、萬呎（細針，一圈 10 萬 ft）
export function altHands(ft) {
  const f = Math.max(ft, -1000);
  const w = (x, n) => (((x % n) + n) % n) / n * Math.PI * 2;
  return { h100: w(f, 1000), h1000: w(f, 10000), h10000: w(f, 100000) };
}

// 爬升率表：0 在 9 點鐘（-90°）；0~1000 fpm 佔 100°（看得比較細），1000~2000 再 70°；爬升順時針
export function vsiAngle(fpm) {
  const a = Math.min(Math.abs(fpm), 2000);
  const deg = a <= 1000 ? a * 0.1 : 100 + (a - 1000) * 0.07;
  return (-90 + Math.sign(fpm) * deg) * D;
}

// 轉速表：0~3500 RPM 對應 -135°~+135°
export const TACH_MAX = 3500;
export const tachAngle = (rpm) => (-135 + clamp(rpm, 0, TACH_MAX) / TACH_MAX * 270) * D;

// 轉彎協調儀：小飛機圖示傾斜 20° = 標準轉彎（每秒 3°，2 分鐘轉一圈）；最多到 1.4 倍
export const STD_RATE = 3;
export const tcAngle = (rate) => clamp(rate / STD_RATE, -1.4, 1.4) * 20 * D;
// 側滑球：沿著弧形管子，最多偏 ±22°（以管子圓心看）
export const slipAngle = (slip) => clamp(slip, -1, 1) * 22 * D;

// 姿態儀：每 10° 俯仰，地平線移動錶面半徑的 PITCH_PER_10 倍（錶面半徑 = 1）
export const PITCH_PER_10 = 0.24;
export const aiOffset = (pitchDeg) => clamp(pitchDeg, -30, 30) / 10 * PITCH_PER_10;

// 航向儀：刻度盤反轉（航向 90° 時，E 轉到正上方）
export const hiCardAngle = (hdg) => -hdg * D;

// 小儀表：在 [a0, a1]（度）的弧上線性分布
export const arcAngle = (v, min, max, a0, a1) => (a0 + (clamp(v, min, max) - min) / (max - min) * (a1 - a0)) * D;
