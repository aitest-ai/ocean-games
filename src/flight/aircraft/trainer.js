// 機艙規格：原創的「通用教練機」（並排雙座、上單翼、固定式起落架、單發活塞）。
// 不是任何真實機型：外形比例、儀表配置、顏色都是一般教練機的共通慣例，名稱與塗裝是本專案自訂。
//
// 要加新機型（例如直升機）：複製這個檔，改 cabin（機艙尺寸與造型）、panel（儀表與開關的位置）、
// controls（操縱桿種類、把手）、vspeeds 與 fdm（飛行模型參數）。儀表元件與駕駛艙產生器都不用改。
// 長度單位：公尺。座標：x 向右、y 向上、-z 向前（機頭方向）；原點 = 機艙地板中央、儀表板正下方附近。
export const TRAINER = {
  id: 'trainer',
  name: '通用教練機',
  tail: 'TK-01',             // 自訂的機尾編號（不是真實登記號碼）
  type: 'fixed-wing',

  cabin: {
    width: 1.14,             // 內部寬度
    floorY: 0, roofY: 1.38,
    eye: [-0.28, 1.12, 0.08], // 左座（機長座）眼睛位置
    panelZ: -0.74,           // 儀表板前緣
    panelY: 0.5, panelH: 0.4, panelTilt: -0.12, // 儀表板下緣高度、高度、往後仰的角度（rad）
    glareDepth: 0.17,        // 遮光罩往前延伸的深度
    windshieldTopZ: -0.18,   // 擋風玻璃上緣（接到頂棚）的 z
    doorZ: [-0.62, 0.52],    // 側門窗前後範圍
    sillY: 0.84,             // 側窗下緣
    seatX: 0.28,             // 兩個座位的中心 |x|
    rearZ: 0.95,             // 後壁
    high_wing: true,         // 上單翼：頂棚兩側看得到機翼根部
    style: 'trainer',
  },

  colors: {
    panel: 0x2b2d30, panelWear: 0x55585c, glare: 0x141414, trim: 0x77736c, trimDark: 0x45474a,
    headliner: 0xc9c6bd, seat: 0x3e4a5a, seatBolster: 0x23272c, carpet: 0x2f3236, frame: 0xbdbab2,
    yoke: 0x1b1c1e, metal: 0xb8bcc0,
  },

  // 儀表板配置（儀表板座標：原點 = 儀表板下緣中央，x 向右、y 向上；單位公尺）
  // 儀表比真實大約 1.25 倍（真實 3⅛ 吋），平板螢幕上才看得清楚刻度；配置仍是標準的「T 字」
  panel: {
    width: 1.12,
    instruments: [
      { type: 'asi', at: [-0.402, 0.3] }, { type: 'ai', at: [-0.29, 0.3] }, { type: 'alt', at: [-0.178, 0.3] },
      { type: 'tc', at: [-0.402, 0.188] }, { type: 'hi', at: [-0.29, 0.188] }, { type: 'vsi', at: [-0.178, 0.188] },
      { type: 'tach', at: [-0.066, 0.188] },
      { type: 'small', id: 'fuelL', at: [0.215, 0.31] }, { type: 'small', id: 'fuelR', at: [0.29, 0.31] }, { type: 'small', id: 'oilT', at: [0.365, 0.31] },
      { type: 'small', id: 'oilP', at: [0.215, 0.235] }, { type: 'small', id: 'vac', at: [0.29, 0.235] }, { type: 'small', id: 'amps', at: [0.365, 0.235] },
    ],
    bigRadius: 0.046,
    smallRadius: 0.03,
    annunciator: { at: [0.07, 0.356], size: [0.2, 0.026] },
    radios: [{ id: 'radioCom', at: [0.07, 0.29], size: [0.16, 0.042] }, { id: 'radioXpdr', at: [0.07, 0.24], size: [0.16, 0.042] }],
    switches: { at: [-0.54, 0.058], gap: 0.031, list: ['MASTER', 'FUEL PUMP', 'BCN', 'LAND', 'TAXI', 'NAV', 'STROBE', 'PANEL'] },
    knobs: [ // 推拉式把手（油門、混合比、化油器加溫）
      { id: 'throttle', at: [-0.005, 0.085], color: 0x161616, label: 'THROTTLE', shape: 'round' },
      { id: 'mixture', at: [0.068, 0.085], color: 0xb3221c, label: 'MIXTURE', shape: 'ribbed' },
      { id: 'carb', at: [-0.075, 0.085], color: 0x161616, label: 'CARB HEAT', shape: 'small' },
    ],
    flaps: { at: [0.135, 0.095], label: 'FLAPS', stops: [0, 10, 20, 30] },
    breakers: { at: [0.175, 0.045], gap: 0.0205, labels: ['FLAP', 'INST', 'RADIO', 'XPDR', 'LAND', 'NAV', 'BCN', 'PUMP', 'ALT', 'MSTR'] },
    key: { at: [-0.515, 0.14] },
    glovebox: { at: [0.452, 0.125], size: [0.17, 0.11] },
    vents: [[-0.515, 0.33], [0.5, 0.33]],
    seams: [[-0.012, 0.14, 0.395], [0.165, 0.14, 0.395]],
    placards: [
      { at: [-0.5, 0.235], size: [0.08, 0.03], lines: ['MANEUVERING', 'SPEED VA 99 KT'] },
      { at: [0.3, 0.37], size: [0.11, 0.016], lines: ['DAY VFR ONLY'] },
      { at: [0.46, 0.37], size: [0.07, 0.016], lines: ['$TAIL'], dark: true },
    ],
  },

  annunciators: [
    { key: 'stall', text: 'STALL', color: 'red' },
    { key: 'lowFuelL', text: 'L LOW\nFUEL', color: 'amber' },
    { key: 'oilPress', text: 'OIL\nPRESS', color: 'red' },
    { key: 'lowVac', text: 'LOW\nVAC', color: 'amber' },
    { key: 'volts', text: 'VOLTS', color: 'red' },
    { key: 'lowFuelR', text: 'R LOW\nFUEL', color: 'amber' },
    { key: 'brake', text: 'PARK\nBRAKE', color: 'amber' },
    { key: 'door', text: 'DOOR', color: 'amber' },
  ],

  smallGauges: [
    { id: 'fuelL', value: (s) => s.fuelL, scale: { min: 0, max: 26, label: 'FUEL', sub: 'L GAL', bands: [[0, 4, 'yellow']], red: [0], nums: [[0, '0'], [13, '1/2'], [26, 'F']], ticks: 4 } },
    { id: 'fuelR', value: (s) => s.fuelR, scale: { min: 0, max: 26, label: 'FUEL', sub: 'R GAL', bands: [[0, 4, 'yellow']], red: [0], nums: [[0, '0'], [13, '1/2'], [26, 'F']], ticks: 4 } },
    { id: 'oilT', value: (s) => s.oilT, scale: { min: 50, max: 250, label: 'OIL', sub: '°F', bands: [[100, 245, 'green']], red: [245], nums: [[50, '50'], [250, '250']], ticks: 10 } },
    { id: 'oilP', value: (s) => s.oilP, scale: { min: 0, max: 120, label: 'OIL', sub: 'PSI', bands: [[25, 60, 'yellow'], [60, 90, 'green']], red: [25, 115], nums: [[0, '0'], [120, '120']], ticks: 6 } },
    { id: 'vac', value: (s) => s.vac, scale: { min: 3, max: 7, label: 'VAC', sub: 'IN HG', bands: [[4.5, 5.5, 'green']], nums: [[3, '3'], [5, '5'], [7, '7']], ticks: 4 } },
    { id: 'amps', value: (s) => s.amps, scale: { min: -60, max: 60, label: 'AMPS', bands: [], nums: [[-60, '-'], [0, '0'], [60, '+']], ticks: 6 } },
  ],

  // 空速限制（節）：錶面色帶與起飛降落的判斷都用這些
  vspeeds: { vso: 40, vs1: 47, vfe: 85, vno: 125, vne: 158, vr: 55, vx: 62, vy: 74, vapp: 70, vref: 62 },
  engine: { idle: 700, max: 2650, green: [2100, 2700], redline: 2700 },

  controls: {
    yoke: 'ramhorn',         // 羊角式操縱盤（直升機會換成 cyclic／collective）
    yokeAt: [0, 0.1],       // 操縱桿從儀表板伸出的高度（儀表板座標 y）
    yokeTravel: 0.07,        // 前後行程
    rudderPedals: true,
    trimWheel: true, fuelSelector: true,
  },
};
