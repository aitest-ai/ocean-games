// 簡化但「有教育意義」的飛行模型（不追求擬真，追求手感好、可預測）。可以在 node 測試。
//
// 學生可以從這個模型學到的事：
//   - 升力 = ½ × 空氣密度 × 速度² × 機翼面積 × 升力係數：速度不夠，機頭抬再高也飛不起來（抬頭太早）
//   - 攻角（機頭方向和前進方向的夾角）太大會失速：升力突然變小，失速警告燈會先亮
//   - 機頭抬高 → 爬升、速度變慢；機頭放低 → 下降、速度變快（用高度換速度）
//   - 飛機傾斜才會轉彎：傾斜越多轉越快（轉彎率 = g·tanφ / V）
//   - 起飛滑跑時螺旋槳會讓飛機往左偏，要一直往右修
//
// 操縱方式（給孩子用，也不容易累）：
//   elev（-1 ~ 1）＝ 機頭「往上／往下轉的快慢」；手回到中間 = 保持現在的機頭角度（像有自動配平）。
//     所以雙手只要「抬一下、再放回胸前」，不用一直舉著；手放在腿上（低於校正範圍）當作中間。
//   aileron（-1 ~ 1）＝ 想要的傾斜角；身體回正，機翼就回到水平，不會「一放手就翻過去」。
//
// 座標：x 東、y 上、z 南（-z 北）；heading 0 = 北、90 = 東。內部用公尺、秒、弧度；輸出儀表用的單位。
import { KT, FT, FPM, DEG } from './state.js';

const D = Math.PI / 180, G = 9.81, RHO = 1.225;
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const approach = (x, target, rate, dt) => x + clamp(target - x, -rate * dt, rate * dt);

// 通用教練機的模型參數（數字是一般單發教練機的量級，抬頭 55 節、爬升 74 節）
export const TRAINER_FDM = {
  mass: 1000, S: 16.2,
  CL0: 0.25, CLa: 5.0, CLmax: 1.5, flapCL: 0.35 / 30, alphaStall: 15, // 攻角（度）
  CD0: 0.031, k: 0.054, flapCD: 0.03 / 30,
  thrustStatic: 2700, thrustSlope: 22,     // 推力 = 油門 × (2700 − 22·V) 牛頓
  mu: 0.025, muBrake: 0.35,
  gearHeight: 1.28,                        // 地面到機艙地板（主輪著地時）
  pitchMax: 20, pitchMin: -10,             // 機頭角度的範圍（度）
  rotateFrom: 30, tailStrike: 13,          // 地面上：30 節以下升降舵沒有效果；機頭超過 13° 會擦機尾
  leftTurn: 2.4,                           // 起飛滑跑時往左偏的趨勢（度/秒，全油門、低速時）
};

// 難度：輔助程度與限制
export const FDM_ASSIST = {
  easy: { bankMax: 25, stallProtect: true, leftTurn: 0.3, pitchRate: 6 },
  normal: { bankMax: 30, stallProtect: false, leftTurn: 0.7, pitchRate: 7 },
  hard: { bankMax: 35, stallProtect: false, leftTurn: 1.2, pitchRate: 8 },
};

export class FlightModel {
  constructor(p = TRAINER_FDM, assist = FDM_ASSIST.normal) {
    this.p = p; this.a = assist;
    this.reset();
  }

  // 停在跑道上（x, z 公尺；heading 度）
  reset({ x = 0, z = 0, y = 0, heading = 270, speed = 0, onGround = true, gamma = 0, pitch = null, flaps = 10, throttle = 0, trim = null } = {}) {
    Object.assign(this, {
      x, z, ground: 0, y,
      V: speed / KT, gamma: gamma * D, psi: heading * D, theta: 0, phi: 0, alpha: 0,
      onGround, flaps, throttle, brake: 0, trim: 0,
      elev: 0, ail: 0, psiDot: 0, phiDot: 0, vy: 0, t: 0, stall: false, tailStrike: false,
      events: [], groundRoll: 0, airTime: 0,
    });
    if (!onGround) {
      const th = pitch ?? this.trimForLevel(this.V) / D + gamma;
      this.theta = th * D; this.trim = trim ?? th;
      this.alpha = this.theta - this.gamma;
    }
    return this;
  }

  // 平飛需要的機頭角度（給配平的起點、測試用）
  trimForLevel(V) {
    const p = this.p, q = 0.5 * RHO * V * V;
    const CL = (p.mass * G) / Math.max(q * p.S, 1);
    return (CL - p.CL0 - p.flapCL * this.flaps) / p.CLa;
  }

  CL(alphaDeg) {
    const p = this.p, as = p.alphaStall;
    const lin = p.CL0 + p.CLa * alphaDeg * D + p.flapCL * this.flaps;
    if (alphaDeg <= as) return Math.min(lin, p.CLmax + p.flapCL * this.flaps);
    // 失速後：升力掉下來（但不會掉到 0，飛機只是「軟掉」往下沉）
    const peak = Math.min(p.CL0 + p.CLa * as * D + p.flapCL * this.flaps, p.CLmax + p.flapCL * this.flaps);
    return Math.max(peak - (alphaDeg - as) * 0.06, 0.55);
  }

  // controls：{ elev, ail, throttle, flaps, brake }；回傳這一步發生的事件（離地、著地、失速…）
  step(dt, c = {}) {
    const ev = [];
    let rest = Math.min(dt, 0.1);
    while (rest > 1e-6) { const h = Math.min(rest, 1 / 120); rest -= h; this.sub(h, c, ev); }
    this.events = ev;
    return ev;
  }

  sub(dt, c, ev) {
    const p = this.p, a = this.a, m = p.mass, W = m * G;
    this.t += dt;
    this.elev = clamp(c.elev ?? 0, -1, 1); this.ail = clamp(c.ail ?? 0, -1, 1);
    this.throttle = approach(this.throttle, clamp(c.throttle ?? this.throttle, 0, 1), 0.8, dt);
    if (c.flaps !== undefined) this.flaps = approach(this.flaps, c.flaps, 5, dt); // 襟翼每秒 5°
    this.brake = c.brake ?? 0;
    const V = Math.max(this.V, 0.01), q = 0.5 * RHO * V * V;
    const thrust = this.throttle * Math.max(p.thrustStatic - p.thrustSlope * V, 0);

    // 想要的機頭角度（trim）：手往上 → 慢慢加大；手在中間 → 不變
    this.trim = clamp(this.trim + this.elev * a.pitchRate * dt, p.pitchMin, p.pitchMax);
    if (!this.onGround && a.stallProtect) this.trim = Math.min(this.trim, this.gamma / D + p.alphaStall - 3); // 簡單模式：不讓攻角超過失速前 3°
    const thetaCmd = this.trim;

    if (this.onGround) {
      // ── 地面滑跑 ──
      const kt = V * KT;
      // 速度不夠時升降舵抬不起機頭：最多能抬的角度隨速度增加
      const auth = clamp((kt - p.rotateFrom) / (55 - p.rotateFrom), 0, 1);
      this.trim = clamp(this.trim, 0, 2 + 14 * auth); // 速度不夠時，再怎麼拉機頭也抬不起來
      const thetaGround = this.trim * auth;
      this.theta = approach(this.theta, thetaGround * D, 6 * D, dt);
      this.tailStrike = this.theta / D > p.tailStrike;
      this.alpha = this.theta;
      const L = q * p.S * this.CL(this.alpha / D);
      const Dr = q * p.S * (p.CD0 + p.k * (L / Math.max(q * p.S, 1)) ** 2 + p.flapCD * this.flaps);
      const N = Math.max(W - L, 0);
      const fr = (p.mu + this.brake * p.muBrake) * N;
      this.V = Math.max(this.V + ((thrust - Dr - fr) / m) * dt, 0);
      // 前輪轉向（傾斜身體 = 轉向）：低速時轉得多、快的時候少；加上螺旋槳造成的往左偏
      const steer = this.ail * clamp(14 - kt * 0.12, 4, 14);
      const left = -(p.leftTurn * a.leftTurn) * this.throttle * clamp(1 - kt / 70, 0.25, 1) * (V > 0.5 ? 1 : 0);
      this.psiDot = (steer + left) * D * clamp(V / 3, 0, 1);
      this.psi += this.psiDot * dt;
      this.phi = approach(this.phi, 0, 0.5, dt);
      this.gamma = 0; this.vy = 0;
      this.groundRoll += V * dt;
      // 升力大於重量（而且機頭抬起來）就離地
      if (L > W * 1.02 && this.theta > 3 * D) {
        this.onGround = false; this.gamma = 0.5 * D; this.airTime = 0;
        ev.push({ type: 'liftoff', kt: kt, roll: this.groundRoll });
      }
    } else {
      // ── 空中 ──
      this.airTime += dt;
      this.theta = approach(this.theta, thetaCmd * D, 10 * D, dt);
      const phiCmd = this.ail * a.bankMax * D;
      const phiPrev = this.phi;
      this.phi = approach(this.phi, phiCmd, 30 * D, dt);
      this.phi += (phiCmd - this.phi) * clamp(dt * 2.5, 0, 1) * 0.3;
      this.phiDot = (this.phi - phiPrev) / dt;
      this.alpha = this.theta - this.gamma;
      const aDeg = this.alpha / D;
      const CL = this.CL(aDeg);
      const L = q * p.S * CL;
      const Dr = q * p.S * (p.CD0 + p.k * CL * CL + p.flapCD * this.flaps);
      this.V = Math.max(this.V + ((thrust * Math.cos(this.alpha) - Dr) / m - G * Math.sin(this.gamma)) * dt, 3);
      this.gamma += ((L * Math.cos(this.phi) + thrust * Math.sin(this.alpha) - W * Math.cos(this.gamma)) / (m * V)) * dt;
      this.gamma = clamp(this.gamma, -40 * D, 40 * D);
      this.psiDot = (L * Math.sin(this.phi)) / (m * V * Math.cos(this.gamma));
      this.psi += this.psiDot * dt;
      const wasStall = this.stall;
      this.stall = aDeg > p.alphaStall - 2.5;
      if (this.stall && !wasStall) ev.push({ type: 'stallWarn' });
      // 失速後機頭自己往下掉（真實飛機也是這樣，讓速度回來）
      if (aDeg > p.alphaStall) this.trim = approach(this.trim, this.gamma / D, 6, dt);
    }
    const cg = Math.cos(this.gamma);
    this.x += Math.sin(this.psi) * cg * this.V * dt;
    this.z -= Math.cos(this.psi) * cg * this.V * dt;
    this.vy = this.onGround ? 0 : Math.sin(this.gamma) * this.V;
    this.y += this.vy * dt;
    if (!this.onGround && this.y <= this.ground) {
      // 著地：記下下降率與速度，交給任務判斷（不會墜毀，只是評分）
      const fpm = -this.vy * FPM, kt = this.V * KT, bank = this.phi / D;
      this.y = this.ground; this.onGround = true; this.gamma = 0;
      this.theta = Math.max(this.theta, 0); this.phi = 0;
      ev.push({ type: 'touchdown', fpm, kt, pitch: this.theta / D, bank, x: this.x, z: this.z, heading: this.heading });
    }
    if (this.onGround && this.y > this.ground) this.y = this.ground;
  }

  get heading() { return ((this.psi / D) % 360 + 360) % 360; }
  get kt() { return this.V * KT; }

  // 寫進飛行狀態物件（儀表、駕駛艙動畫讀這個）
  toState(s, { fieldElev = 20 } = {}) {
    s.ias = this.V * KT;
    s.alt = this.y * FT + fieldElev;
    s.pitch = this.theta / D;
    s.roll = this.phi / D;
    s.heading = this.heading;
    s.vs = this.vy * FPM;
    s.turnRate = this.psiDot / D;
    s.slip = clamp(-this.phiDot * 0.25 + (this.onGround ? -this.psiDot * 2 : 0), -1, 1);
    s.throttle = this.throttle; s.flaps = this.flaps; s.elevator = this.elev; s.aileron = this.ail;
    s.onGround = this.onGround; s.brake = this.brake;
    const idle = 700, max = 2650;
    s.rpm = idle + this.throttle * (max - 250 - idle) + Math.min(this.V * KT, 120) * 2.2;
    s.oilP = 60 + this.throttle * 18; s.oilT = 150 + this.throttle * 45; s.vac = 4.6 + this.throttle * 0.6; s.amps = 2 + (1 - this.throttle) * 3;
    s.warn.stall = this.stall && !this.onGround;
    s.warn.brake = this.onGround && this.brake > 0.5;
    return s;
  }
}

export { DEG };
