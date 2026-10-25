// 飛行狀態物件：所有儀表、駕駛艙動畫（操縱桿、油門把手）只讀這一個物件。
// 飛行模型（fdm.js）、展示頁的假資料、之後的直升機模型，都只要「填好這個物件」就能驅動同一組儀表。
//
// 單位用航空慣例（儀表本來就是這些單位，也是教學內容）：
//   空速 節（kt）、高度 呎（ft）、爬升率 呎/分（fpm）、角度 度（deg）、轉速 RPM、油量 加侖（gal）、
//   油壓 psi、油溫 °F、真空 inHg、電流 A。
export function createFlightState(over = {}) {
  return {
    ias: 0,          // 指示空速（kt）
    alt: 0,          // 氣壓高度（ft）
    baro: 29.92,     // 高度表撥定值（inHg），顯示在高度表小窗
    pitch: 0,        // 俯仰（deg，機頭朝上為正）
    roll: 0,         // 滾轉（deg，右翼朝下為正）
    heading: 0,      // 磁航向（deg，0 = 北，順時針）
    vs: 0,           // 垂直速度（fpm，爬升為正）
    turnRate: 0,     // 轉彎率（deg/s，右轉為正；標準轉彎 = 3°/s）
    slip: 0,         // 側滑球位置（-1 ~ 1，右為正）
    rpm: 0,          // 發動機轉速
    fuelL: 20, fuelR: 20, fuelCap: 26, // 左右油箱（gal）
    oilP: 0,         // 油壓（psi）
    oilT: 60,        // 油溫（°F）
    vac: 0,          // 真空（inHg），姿態儀與航向儀靠它
    amps: 0,         // 充電電流（A，負 = 放電）
    // 操縱面與把手位置（駕駛艙裡的桿子、把手會跟著動）
    elevator: 0,     // 升降舵（-1 推 ~ 1 拉）
    aileron: 0,      // 副翼（-1 左 ~ 1 右）
    throttle: 0,     // 油門（0 ~ 1）
    mixture: 1,      // 混合比（0 ~ 1）
    flaps: 0,        // 襟翼（deg：0 / 10 / 20 / 30）
    trim: 0,         // 配平（-1 ~ 1）
    brake: 0,        // 煞車（0 ~ 1）
    onGround: true,
    // 電源與警示燈（true = 亮）
    master: true,
    warn: { stall: false, lowFuelL: false, lowFuelR: false, oilPress: false, lowVac: false, volts: false, brake: false, door: false },
    ...over,
  };
}

export const KT = 1.943844;   // m/s → kt
export const FT = 3.280840;   // m → ft
export const FPM = 196.8504;  // m/s → ft/min
export const DEG = 180 / Math.PI;
