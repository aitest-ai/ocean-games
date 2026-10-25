// 合成人體（給自動測試、鍵盤模擬、示範動畫用）
//
// 原本的模擬人偶（../puppet.js）是平面的上半身，夠划槳、揮棒用；健身動作需要「全身」而且要分
// 正面、側面、斜角來看（同一個深蹲，正面看大腿會「縮短」、側面看才看得到膝蓋角度）。所以這裡做一個
// 很簡單的 3D 火柴人：關節位置用公尺表示，再依「手機放在哪裡」投影成鏡頭畫面上的座標，輸出格式和
// 真的鏡頭一模一樣（taikan-kit 的 pose：鏡像正規化座標 + 可信度 v）。
//
// 人體座標：原點在兩腳中間的地面，+y 向上，+z = 玩家面向的方向，+x = 玩家自己的左手邊。
// 鏡頭：在玩家前方 distance 公尺、高 height 公尺，對準身體中段；yaw = 0 是正對玩家，
//       yaw = 90 是從玩家左側拍（玩家側身對鏡頭）。aspect = 畫面寬 / 高（手機直放約 0.56～0.75）。
import { KEYPOINTS } from '../pose.js';

// 成人身材（約 170 公分）；scale 可以整體縮放
export const BODY = { ankle: 0.08, shin: 0.42, thigh: 0.43, hipHalf: 0.12, torso: 0.5, shoulderHalf: 0.19, upper: 0.29, fore: 0.27 };
const HIP_Y = BODY.ankle + BODY.shin + BODY.thigh; // 站直時髖關節高度 0.93 公尺
const ARM = BODY.upper + BODY.fore;
const DEG = Math.PI / 180;

// ── 小工具：3D 向量 ──
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
// 0 → 1 → 0 的平滑曲線（一下動作：下去再上來）
export const bump = (u) => (1 - Math.cos(2 * Math.PI * clamp(u, 0, 1))) / 2;
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

// 兩節 IK：已知起點 a、終點 b、兩節長度，回傳中間關節（往 pole 方向彎）
function ik(a, b, l1, l2, pole) {
  let d = sub(b, a), L = len(d);
  const maxL = (l1 + l2) * 0.999;
  if (L > maxL) { d = mul(d, maxL / L); L = maxL; }
  L = Math.max(L, Math.abs(l1 - l2) + 1e-3);
  const dir = norm(d);
  const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L);
  const h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
  let perp = sub(pole, mul(dir, dot(pole, dir)));
  if (len(perp) < 1e-6) perp = [0, 0, 1];
  return add(add(a, mul(dir, x)), mul(norm(perp), h));
}

// ── 姿勢 → 3D 關節 ──
// spec：pelvis [x,y,z]、pitch（上半身前彎，弧度）、roll（上半身往自己左邊歪為正）、
//       lFoot / rFoot（腳踝位置）、lKnee / rKnee（膝蓋往哪個方向彎）、lHand / rHand（手腕位置）、
//       lElbow / rElbow（手肘往哪個方向彎）、head（低頭為正）
export function standSpec() {
  return {
    pelvis: [0, HIP_Y - 0.004, 0], pitch: 0.02, roll: 0, head: 0,
    lFoot: [0.14, BODY.ankle, 0.02], rFoot: [-0.14, BODY.ankle, 0.02],
    lKnee: [0.1, 0, 1], rKnee: [-0.1, 0, 1],
    lHand: null, rHand: null, lElbow: [0.6, 0, -0.5], rElbow: [-0.6, 0, -0.5],
  };
}

// 玩家的「左邊」：+x 扣掉和上半身軸線平行的部分（躺著、趴著時也不會左右顛倒）
const latOf = (up) => norm(sub([1, 0, 0], mul(up, up[0])));

// 上半身的方向（示範人偶要把手的位置換成「上半身座標」）
export function torsoFrame(spec) {
  const cp = Math.cos(spec.pitch || 0), sp = Math.sin(spec.pitch || 0);
  const cr = Math.cos(spec.roll || 0), sr = Math.sin(spec.roll || 0);
  const up = norm([sr * cp, cr * cp, sp]);
  const lat = latOf(up);
  return { up, lat, fwd: norm(cross(lat, up)) };
}

export function buildJoints(spec, scale = 1) {
  const P = spec.pelvis;
  const cp = Math.cos(spec.pitch || 0), sp = Math.sin(spec.pitch || 0);
  const cr = Math.cos(spec.roll || 0), sr = Math.sin(spec.roll || 0);
  // 上半身的「上」：先前彎（往 +z），再側彎（往 +x）
  const up = norm([sr * cp, cr * cp, sp]);
  const latFix = latOf(up); // 玩家左邊
  const fwd = norm(cross(latFix, up));
  const hipL = add(P, [BODY.hipHalf, 0, 0]), hipR = add(P, [-BODY.hipHalf, 0, 0]);
  const sMid = add(P, mul(up, BODY.torso));
  const shL = add(sMid, mul(latFix, BODY.shoulderHalf)), shR = add(sMid, mul(latFix, -BODY.shoulderHalf));
  const hp = spec.head || 0;
  const hUp = norm(add(mul(up, Math.cos(hp)), mul(fwd, Math.sin(hp))));
  const hFwd = norm(add(mul(fwd, Math.cos(hp)), mul(up, -Math.sin(hp))));
  const head = (u, f, l) => add(add(add(sMid, mul(hUp, u)), mul(hFwd, f)), mul(latFix, l));
  const restHand = (s) => add(s === 1 ? shL : shR, add(mul(up, -ARM * 0.97), mul(latFix, s * 0.05)));
  const lHand = spec.lHand || restHand(1), rHand = spec.rHand || restHand(-1);
  const j = {
    nose: head(0.2, 0.1, 0), leftEye: head(0.235, 0.085, 0.035), rightEye: head(0.235, 0.085, -0.035),
    leftEar: head(0.215, 0.0, 0.078), rightEar: head(0.215, 0.0, -0.078),
    leftShoulder: shL, rightShoulder: shR,
    leftElbow: ik(shL, lHand, BODY.upper, BODY.fore, spec.lElbow || [0.6, 0, -0.5]),
    rightElbow: ik(shR, rHand, BODY.upper, BODY.fore, spec.rElbow || [-0.6, 0, -0.5]),
    leftWrist: lHand, rightWrist: rHand,
    leftHip: hipL, rightHip: hipR,
    leftKnee: ik(hipL, spec.lFoot, BODY.thigh, BODY.shin, spec.lKnee || [0, 0, 1]),
    rightKnee: ik(hipR, spec.rFoot, BODY.thigh, BODY.shin, spec.rKnee || [0, 0, 1]),
    leftAnkle: spec.lFoot, rightAnkle: spec.rFoot,
  };
  if (scale !== 1) for (const k in j) j[k] = mul(j[k], scale);
  return j;
}

// 手腕位置：從肩膀出發，abd = 側舉角度（0 垂下、90 水平、180 舉到頭頂），flex = 前舉角度
function armHand(spec, side, abd, flex = 0, reach = 0.98) {
  const j = buildJoints({ ...spec, lHand: [0, 0, 0], rHand: [0, 0, 0] });
  const sh = side === 1 ? j.leftShoulder : j.rightShoulder;
  const up = norm(sub(j.leftShoulder.map((v, i) => (v + j.rightShoulder[i]) / 2), spec.pelvis));
  const lat = norm(sub(j.leftShoulder, j.rightShoulder));
  const fwd = norm(cross(lat, up));
  const a = abd * DEG, f = flex * DEG;
  // 先側舉、再往前帶
  let d = add(mul(up, -Math.cos(a)), mul(lat, side * Math.sin(a)));
  d = norm(add(mul(d, Math.cos(f)), mul(fwd, Math.sin(f))));
  return add(sh, mul(d, ARM * reach));
}

// ── 動作：u = 這一下的進度 0～1，回傳 spec ──
// 每個動作都有「標準」與「常見錯誤」兩種參數，讓測試可以檢查「標準的要算、錯的要被提示」。
export const MOTIONS = {
  // 深蹲：depth = 大腿最多前傾幾度（80 ≈ 接近水平，40 ≈ 只蹲一點點）；lean = 上半身額外多前傾幾度；
  // kneeIn = 膝蓋往內夾幾度（單鏡頭不可靠，只用來確認系統「不會亂報」）；shift = 重心偏向一邊（公尺）
  squat: { ms: 2600, make(u, o = {}) {
    const s = bump(u), th = (o.depth ?? 80) * DEG * s, ph = th * 0.5;
    const spec = standSpec();
    const toe = 14 * DEG, kin = (o.kneeIn ?? 0) * DEG * s;
    const hipY = BODY.ankle + BODY.shin * Math.cos(ph) + BODY.thigh * Math.cos(th);
    const hipZ = BODY.shin * Math.sin(ph) - BODY.thigh * Math.sin(th);
    spec.pelvis = [(o.shift ?? 0) * s, hipY - 0.004, hipZ + 0.02];
    spec.pitch = th * 0.62 + (o.lean ?? 0) * DEG * s;
    spec.lFoot = [0.16, BODY.ankle, 0.02]; spec.rFoot = [-0.16, BODY.ankle, 0.02];
    spec.lKnee = [Math.sin(toe - kin), 0, Math.cos(toe - kin)];
    spec.rKnee = [-Math.sin(toe - kin), 0, Math.cos(toe - kin)];
    // 雙手往前平舉保持平衡（角度是相對上半身，所以要加回上半身前傾的角度，手才會是水平的）
    const fl = 5 + 80 * s + spec.pitch * 180 / Math.PI * s;
    spec.lHand = armHand(spec, 1, 10, fl); spec.rHand = armHand(spec, -1, 10, fl);
    return spec;
  } },
  // 開合跳：arms = 手舉到多高（1 = 頭頂）、legs = 腳張多開（1 = 標準）、hop = 有沒有跳（低衝擊版 0）
  jack: { ms: 1100, make(u, o = {}) {
    const s = smooth(u < 0.5 ? u * 2 : 2 - u * 2), arms = o.arms ?? 1, legs = o.legs ?? 1;
    const spec = standSpec();
    const fx = 0.14 + s * 0.34 * legs;
    const dx = fx - BODY.hipHalf, Lg = BODY.thigh + BODY.shin;
    const hop = (o.hop ?? 1) * 0.05 * Math.abs(Math.sin(2 * Math.PI * u));
    spec.pelvis = [0, BODY.ankle + Math.sqrt(Lg * Lg - dx * dx) - 0.006 + hop, 0];
    spec.lFoot = [fx, BODY.ankle + hop, 0.02]; spec.rFoot = [-fx, BODY.ankle + hop, 0.02];
    spec.lKnee = [0.3, 0, 1]; spec.rKnee = [-0.3, 0, 1];
    const a = 8 + s * 167 * arms;
    spec.lHand = armHand(spec, 1, a, 5); spec.rHand = armHand(spec, -1, (o.armsAsym ? a * 0.55 : a), 5);
    return spec;
  } },
  // 側抬腿（站姿髖外展）：side = 'left' | 'right'，angle = 抬幾度，lean = 上半身往另一邊歪幾度（代償）
  legRaise: { ms: 2200, make(u, o = {}) {
    const s = bump(u), sd = o.side === 'right' ? -1 : 1, a = (o.angle ?? 40) * DEG * s;
    const spec = standSpec();
    spec.pelvis = [-sd * 0.045 * s, HIP_Y - 0.006, 0];
    spec.roll = -sd * (3 + (o.lean ?? 0)) * DEG * s;
    const hip = add(spec.pelvis, [sd * BODY.hipHalf, 0, 0]);
    const Lg = (BODY.thigh + BODY.shin) * 0.995;
    const foot = add(hip, [sd * Math.sin(a) * Lg, -Math.cos(a) * Lg, 0.02]);
    const stance = add(spec.pelvis, [-sd * BODY.hipHalf, -(HIP_Y - BODY.ankle) + 0.004, 0.02]);
    if (sd === 1) { spec.lFoot = foot; spec.rFoot = stance; } else { spec.rFoot = foot; spec.lFoot = stance; }
    // 雙手叉腰
    const j = buildJoints(spec);
    spec.lHand = add(j.leftHip, [0.06, 0.06, 0.04]); spec.rHand = add(j.rightHip, [-0.06, 0.06, 0.04]);
    spec.lElbow = [1, 0, -0.6]; spec.rElbow = [-1, 0, -0.6];
    return spec;
  } },
  // ── 暖身、收操（示範人偶與鍵盤模擬用；不計次數） ──
  march: { ms: 1200, make(u) {
    const spec = standSpec(), a = Math.sin(2 * Math.PI * u), lift = (x) => Math.max(x, 0);
    const kl = lift(a) * 0.16, kr = lift(-a) * 0.16;
    spec.lFoot = [0.13, BODY.ankle + kl, 0.02 + kl * 0.6]; spec.rFoot = [-0.13, BODY.ankle + kr, 0.02 + kr * 0.6];
    spec.pelvis = [0, HIP_Y - 0.01 - Math.abs(a) * 0.01, 0];
    spec.lHand = armHand(spec, 1, 8, 5 - a * 30); spec.rHand = armHand(spec, -1, 8, 5 + a * 30);
    return spec;
  } },
  armCircle: { ms: 1600, make(u) {
    const spec = standSpec(), a = 2 * Math.PI * u;
    spec.lHand = armHand(spec, 1, 90 + 25 * Math.sin(a), 25 * Math.cos(a));
    spec.rHand = armHand(spec, -1, 90 + 25 * Math.sin(a), 25 * Math.cos(a));
    return spec;
  } },
  sideReach: { ms: 5000, make(u) {
    const spec = standSpec(), sd = u < 0.5 ? 1 : -1, s = bump(u < 0.5 ? u * 2 : u * 2 - 1);
    spec.roll = -sd * 18 * DEG * s;
    spec.lFoot = [0.2, BODY.ankle, 0.02]; spec.rFoot = [-0.2, BODY.ankle, 0.02];
    if (sd === 1) { spec.lHand = armHand(spec, 1, 10 + 160 * s, 5); spec.rHand = null; }
    else { spec.rHand = armHand(spec, -1, 10 + 160 * s, 5); spec.lHand = null; }
    return spec;
  } },
  // 大腿前側伸展：side 那隻腳往後彎、腳跟靠近屁股，同側手抓腳踝
  quad: { ms: 4000, make(u, o = {}) {
    const spec = standSpec(), sd = o.side === 'right' ? -1 : 1, s = smooth(Math.min(u * 10, 1));
    const foot = [sd * 0.13, BODY.ankle + 0.55 * s, 0.02 - 0.28 * s];
    if (sd === 1) { spec.lFoot = foot; spec.lKnee = [0, -1, 0.2]; } else { spec.rFoot = foot; spec.rKnee = [0, -1, 0.2]; }
    const j = buildJoints(spec);
    const grab = add(sd === 1 ? j.leftAnkle : j.rightAnkle, [0, 0.02, -0.02]);
    if (sd === 1) spec.lHand = mix3(buildJoints(standSpec()).leftWrist, grab, s); else spec.rHand = mix3(buildJoints(standSpec()).rightWrist, grab, s);
    spec[sd === 1 ? 'rHand' : 'lHand'] = armHand(spec, -sd, 60, 10);
    return spec;
  } },
  hamstring: { ms: 4000, make(u) {
    const spec = standSpec(), s = smooth(Math.min(u * 10, 1)), th = 25 * DEG * s;
    spec.lFoot = [0.13, BODY.ankle + 0.03 * s, 0.02 + 0.35 * s];
    spec.rFoot = [-0.13, BODY.ankle, -0.05 * s];
    spec.rKnee = [0, 0, 1];
    spec.pelvis = [0, HIP_Y - 0.06 * s, -0.12 * s];
    spec.pitch = th + 15 * DEG * s;
    const j = buildJoints(spec);
    const knee = add(j.leftHip.map((v, i) => (v + spec.lFoot[i]) / 2), [0, 0.03, 0.02]);
    spec.lHand = add(knee, [0.03, 0.02, 0]); spec.rHand = add(knee, [-0.07, 0.02, 0]);
    return spec;
  } },
  shoulder: { ms: 5000, make(u) {
    const spec = standSpec(), sd = u < 0.5 ? 1 : -1, s = bump(u < 0.5 ? u * 2 : u * 2 - 1);
    const j = buildJoints(spec);
    const chestOpp = add(sd === 1 ? j.rightShoulder : j.leftShoulder, [-sd * 0.12, -0.05, 0.12]);
    if (sd === 1) { spec.lHand = mix3(j.leftWrist, chestOpp, s); spec.rHand = mix3(j.rightWrist, add(j.leftElbow, [0, 0.0, 0.18]), s); }
    else { spec.rHand = mix3(j.rightWrist, chestOpp, s); spec.lHand = mix3(j.leftWrist, add(j.rightElbow, [0, 0.0, 0.18]), s); }
    return spec;
  } },
  breathe: { ms: 5000, make(u) {
    const spec = standSpec(), s = bump(u);
    spec.lHand = armHand(spec, 1, 10 + 160 * s, 8); spec.rHand = armHand(spec, -1, 10 + 160 * s, 8);
    return spec;
  } },
  // ── 階段三的動作 ──
  // 高抬腿：side 那隻膝蓋抬到 lift（1 = 大腿水平）；lean = 上半身往後仰幾度（常見錯誤）
  highKnee: { ms: 700, make(u, o = {}) {
    const spec = standSpec(), sd = o.side === 'right' ? -1 : 1, s = bump(u), th = (o.lift ?? 1) * 88 * DEG * s;
    const hip = [sd * BODY.hipHalf, HIP_Y - 0.004, 0];
    const knee = add(hip, [0, -BODY.thigh * Math.cos(th), BODY.thigh * Math.sin(th)]);
    const foot = add(knee, [0, -BODY.shin * 0.98, -0.03 * s]);
    if (sd === 1) { spec.lFoot = foot; spec.lKnee = [0, 0, 1]; } else { spec.rFoot = foot; spec.rKnee = [0, 0, 1]; }
    spec.pitch = -(o.lean ?? 0) * DEG * s;
    spec.lHand = armHand(spec, 1, 10, sd === 1 ? -25 * s : 45 * s); spec.rHand = armHand(spec, -1, 10, sd === 1 ? 45 * s : -25 * s);
    return spec;
  } },
  // 弓箭步：side 那隻腳往前跨，兩膝彎曲往下；depth 1 = 前腳大腿接近水平；lean = 上半身前傾幾度
  lunge: { ms: 2800, make(u, o = {}) {
    const spec = standSpec(), sd = o.side === 'right' ? -1 : 1, s = bump(u), d = (o.depth ?? 1) * s;
    const step = 0.72 * Math.min(s * 2, 1);
    const front = [sd * 0.13, BODY.ankle, 0.02 + step * 0.62], back = [-sd * 0.13, BODY.ankle + 0.06 * d, 0.02 - step * 0.38];
    spec.pelvis = [0, HIP_Y - 0.004 - 0.36 * d - 0.03 * Math.min(s * 2, 1), 0.02 + step * 0.05];
    spec.pitch = (o.lean ?? 0) * DEG * s + 4 * DEG * s;
    if (sd === 1) { spec.lFoot = front; spec.rFoot = back; spec.rKnee = [0, -0.4, 1]; } else { spec.rFoot = front; spec.lFoot = back; spec.lKnee = [0, -0.4, 1]; }
    const j = buildJoints(spec);
    spec.lHand = add(j.leftHip, [0.06, 0.06, 0.04]); spec.rHand = add(j.rightHip, [-0.06, 0.06, 0.04]);
    spec.lElbow = [1, 0, -0.6]; spec.rElbow = [-1, 0, -0.6];
    return spec;
  } },
  // 提踵（踮腳尖）：rise = 身體往上多少公尺
  calfRaise: { ms: 2200, make(u, o = {}) {
    const spec = standSpec(), r = (o.rise ?? 0.07) * bump(u);
    spec.pelvis = add(spec.pelvis, [0, r, 0]);
    spec.lFoot = add(spec.lFoot, [0, r * 0.7, 0]); spec.rFoot = add(spec.rFoot, [0, r * 0.7, 0]);
    return spec;
  } },
  // 靠牆深蹲（維持）：u 只用來進出姿勢；depth = 大腿角度，lean = 上半身前傾
  wallSit: { ms: 3000, make(u, o = {}) {
    const spec = standSpec(), s = smooth(Math.min(u * 6, 1)) * smooth(Math.min((1 - u) * 6, 1)), th = (o.depth ?? 85) * DEG * s, ph = 8 * DEG * s;
    spec.pelvis = [0, BODY.ankle + BODY.shin * Math.cos(ph) + BODY.thigh * Math.cos(th) - 0.004, -BODY.thigh * Math.sin(th) + BODY.shin * Math.sin(ph) + 0.02];
    spec.pitch = (o.lean ?? 0) * DEG * s;
    spec.lFoot = [0.16, BODY.ankle, 0.02]; spec.rFoot = [-0.16, BODY.ankle, 0.02];
    return spec;
  } },
  // 坐在椅子上（椅面高 0.47 公尺）。knee = 抬起哪一腳、arms = 雙手側舉角度（坐姿開合手）
  seated: { ms: 1800, make(u, o = {}) {
    const spec = standSpec(), s = bump(u);
    spec.pelvis = [0, 0.5, -0.05];
    spec.pitch = 0.05;
    const lift = (o.knee ? (o.lift ?? 1) * 0.16 * s : 0);
    spec.lFoot = [0.15, BODY.ankle + (o.knee === 'left' ? lift : 0), 0.4]; spec.rFoot = [-0.15, BODY.ankle + (o.knee === 'right' ? lift : 0), 0.4];
    spec.lKnee = [0, 0.4, 1]; spec.rKnee = [0, 0.4, 1];
    const a = o.arms ? 8 + 150 * (o.armsLevel ?? 1) * s : 8;
    spec.lHand = armHand(spec, 1, a, 5); spec.rHand = armHand(spec, -1, a, 5);
    return spec;
  } },
  // 坐到站（從椅子站起來再坐下）：0 = 站、1 = 坐
  sitStand: { ms: 3200, make(u) {
    const spec = standSpec(), s = bump(u);
    const sit = MOTIONS.seated.make(0.5, {}), stand = standSpec();
    spec.pelvis = mix3(stand.pelvis, sit.pelvis, s);
    spec.pitch = 0.5 * Math.sin(Math.PI * s) + 0.05 * s;
    spec.lFoot = mix3(stand.lFoot, [0.15, BODY.ankle, 0.22], Math.min(s * 3, 1)); spec.rFoot = mix3(stand.rFoot, [-0.15, BODY.ankle, 0.22], Math.min(s * 3, 1));
    spec.lKnee = [0.1, 0.3, 1]; spec.rKnee = [-0.1, 0.3, 1];
    spec.lHand = armHand(spec, 1, 10, 60 * s + 5); spec.rHand = armHand(spec, -1, 10, 60 * s + 5);
    return spec;
  } },
  // ── 地板動作（實驗）：側面看，玩家頭朝 +z ──
  // 伏地挺身：depth 1 = 手肘約 90°；sag = 腰往下塌（公尺）；knees = 跪姿版
  pushUp: { ms: 2400, make(u, o = {}) { return prone(bump(u) * (o.depth ?? 1), o.sag ?? 0, o.pike ?? 0, 'hands'); } },
  // 棒式（維持）：前臂撐地；sag / pike = 腰塌下或屁股翹高（公尺）
  plank: { ms: 3000, make(u, o = {}) { return prone(0, o.sag ?? 0, o.pike ?? 0, 'forearms'); } },
  // 臀橋：躺著、膝蓋彎曲，把髖往上推；lift 1 = 肩—髖—膝接近一直線
  bridge: { ms: 2600, make(u, o = {}) {
    const spec = standSpec(), s = bump(u) * (o.lift ?? 1);
    const sh = [0, 0.11, -0.52];
    const pel = [0, 0.13 + 0.22 * s, 0];
    spec.pelvis = pel;
    const d = sub(sh, pel), L = len(d);
    spec.pitch = Math.atan2(d[2], d[1]);
    spec.pelvis = sub(sh, mul(norm(d), BODY.torso));
    spec.lFoot = [0.15, BODY.ankle, 0.42]; spec.rFoot = [-0.15, BODY.ankle, 0.42];
    spec.lKnee = [0, 1, 0.2]; spec.rKnee = [0, 1, 0.2];
    spec.head = -0.2;
    spec.lHand = [0.3, 0.03, -0.25]; spec.rHand = [-0.3, 0.03, -0.25];
    spec.lElbow = [0.5, 0.5, 0]; spec.rElbow = [-0.5, 0.5, 0];
    void L;
    return spec;
  } },
  // ── 不該算次數的動作（測試「亂動不能亂計次」） ──
  // 抓頭、交叉手臂、看手機
  fidget: { ms: 3000, make(u) {
    const spec = standSpec(), s = bump(u);
    spec.rHand = armHand(spec, -1, 40 + 120 * s, 40 * s, 0.6 + 0.2 * (1 - s));
    spec.head = 0.3 * s;
    return spec;
  } },
  // 彎腰撿東西（膝蓋微彎）
  pickup: { ms: 2600, make(u) {
    const s = bump(u), spec = standSpec(), th = 22 * DEG * s, ph = th * 0.5;
    spec.pelvis = [0, BODY.ankle + BODY.shin * Math.cos(ph) + BODY.thigh * Math.cos(th) - 0.004, BODY.shin * Math.sin(ph) - BODY.thigh * Math.sin(th) - 0.1 * s];
    spec.pitch = 75 * DEG * s; spec.head = -0.2 * s;
    spec.lHand = armHand(spec, 1, 5, 20 * s); spec.rHand = armHand(spec, -1, 5, 20 * s);
    return spec;
  } },
  // 伸懶腰（雙手舉高，但腳沒有張開）
  stretch: { ms: 2600, make(u) {
    const s = bump(u), spec = standSpec();
    spec.lHand = armHand(spec, 1, 170 * s + 5, 10); spec.rHand = armHand(spec, -1, 170 * s + 5, 10);
    return spec;
  } },
  // 往旁邊走一步再回來
  sidestep: { ms: 2400, make(u) {
    const s = bump(u), spec = standSpec();
    const x = 0.45 * s, step = Math.sin(Math.PI * clamp(u * 4 % 1, 0, 1)) * 0.06;
    spec.pelvis = [x, HIP_Y - 0.004 - step * 0.2, 0];
    spec.lFoot = [x + 0.14, BODY.ankle + (Math.floor(u * 4) % 2 ? step : 0), 0.02];
    spec.rFoot = [x - 0.14, BODY.ankle + (Math.floor(u * 4) % 2 ? 0 : step), 0.02];
    return spec;
  } },
};

// 趴著的身體（伏地挺身、棒式）：腳尖在地上，身體一直線，k = 往下的程度 0～1
function prone(k, sag, pike, support) {
  const spec = standSpec();
  const ank = 0.09;
  // 頂端：手撐直時肩膀高約 0.56；底部：肩膀高約 0.24；前臂撐地約 0.3
  const shY = support === 'hands' ? 0.58 - 0.33 * k : 0.3;
  const Lb = BODY.thigh + BODY.shin + BODY.torso;
  const a = Math.asin((shY - ank) / Lb);
  const dir = [0, Math.sin(a), Math.cos(a)];
  const foot = [0, ank, -1.0];
  const pelvis = add(add(foot, mul(dir, BODY.thigh + BODY.shin)), [0, pike - sag, 0]);
  const sh = add(foot, mul(dir, Lb));
  const d = sub(sh, pelvis);
  spec.pelvis = add(sh, mul(norm(d), -BODY.torso));
  spec.pitch = Math.atan2(d[2], d[1]);
  spec.lFoot = [0.12, ank, -1.0]; spec.rFoot = [-0.12, ank, -1.0];
  spec.lKnee = [0, -1, 0]; spec.rKnee = [0, -1, 0];
  spec.head = 0.2;
  const shX = BODY.shoulderHalf + 0.03;
  if (support === 'hands') { spec.lHand = [shX, 0.03, sh[2] - 0.02]; spec.rHand = [-shX, 0.03, sh[2] - 0.02]; spec.lElbow = [0.6, 0.3, -1]; spec.rElbow = [-0.6, 0.3, -1]; }
  else { spec.lHand = [0.12, 0.04, sh[2] + 0.3]; spec.rHand = [-0.12, 0.04, sh[2] + 0.3]; spec.lElbow = [0.2, -1, 0]; spec.rElbow = [-0.2, -1, 0]; }
  return spec;
}

// ── 鏡頭投影 ──
export function project(p, cam) {
  const yaw = (cam.yaw ?? 0) * DEG, D = cam.distance ?? 2.6, H = cam.height ?? 0.8;
  const aim = cam.aim || [0, 0.95, 0];
  const C = [aim[0] + D * Math.sin(yaw), H, aim[2] + D * Math.cos(yaw)];
  const f = norm(sub(aim, C));
  let r = norm(cross(f, [0, 1, 0]));
  let u = cross(r, f);
  const roll = (cam.roll ?? 0) * DEG; // 手機沒放正（歪一邊）
  if (roll) { const cr = Math.cos(roll), sr = Math.sin(roll); [r, u] = [add(mul(r, cr), mul(u, sr)), add(mul(u, cr), mul(r, -sr))]; }
  const q = sub(p, C);
  const z = dot(q, f);
  const tv = Math.tan(((cam.fov ?? 62) * DEG) / 2), aspect = cam.aspect ?? 0.75, th = tv * aspect;
  const xr = 0.5 + 0.5 * (dot(q, r) / (z * th)); // 原始畫面座標
  const y = 0.5 - 0.5 * (dot(q, u) / (z * tv));
  return { x: 1 - xr, y, z }; // 鏡像：玩家的左手在畫面左邊
}

// 可重現的亂數
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

const PAIRS = [['leftEye', 'rightEye'], ['leftEar', 'rightEar'], ['leftShoulder', 'rightShoulder'], ['leftElbow', 'rightElbow'], ['leftWrist', 'rightWrist'], ['leftHip', 'rightHip'], ['leftKnee', 'rightKnee'], ['leftAnkle', 'rightAnkle']];

// 3D 關節 → pose（含雜訊）
export function toPose(joints, t, cam, { rand = Math.random, jitter = 0.003, spike = 0 } = {}) {
  const proj = {};
  for (const n of KEYPOINTS) proj[n] = project(joints[n], cam);
  const g = () => { const a = Math.max(rand(), 1e-9), b = rand(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); };
  const aspect = cam.aspect ?? 0.75;
  const kp = {};
  for (const n of KEYPOINTS) {
    const p = proj[n];
    let v = 0.95;
    // 被身體擋住的那一邊（比另一邊離鏡頭遠很多）：MediaPipe 還是會猜位置，但可信度較低
    const pair = PAIRS.find((pp) => pp.includes(n));
    if (pair) { const o = proj[pair[0] === n ? pair[1] : pair[0]]; if (p.z - o.z > 0.12) v = n.endsWith('Eye') || n.endsWith('Ear') ? 0.3 : 0.6; }
    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) v = 0.12;
    kp[n] = { x: p.x + (g() * jitter) / aspect, y: p.y + g() * jitter, v };
  }
  if (spike && rand() < spike) {
    const n = KEYPOINTS[Math.floor(rand() * KEYPOINTS.length)];
    kp[n].x += (rand() - 0.5) * 0.15; kp[n].y += (rand() - 0.5) * 0.15;
  }
  return { t, kp, aspect };
}

// ── 合成玩家：排動作、推進時間、輸出 pose ──
export class SynthPerson {
  // camera：見 project()；noise：jitter 抖動、spike 偶發亂跳機率、drop 漏格機率；sway 站著時身體晃動（公尺）
  constructor({ seed = 1, camera = {}, jitter = 0.003, spike = 0, drop = 0, sway = 0.012, scale = 1, x = 0 } = {}) {
    this.rand = rng(seed);
    this.camera = { distance: 2.6, height: 0.8, yaw: 0, fov: 62, aspect: 0.75, ...camera };
    Object.assign(this, { jitter, spike, drop, sway, scale, x });
    this.queue = []; this.cur = null; this.t = 0;
    this.hold = null;      // 持續姿勢（鍵盤按住、靠牆深蹲等）：{ name, amount }
    this.offset = [0, 0, 0]; // 整個人移動（走近、走遠）
    this.present = true;     // false = 走出畫面
  }

  // 排一個動作（接在前一個後面）；opts 會傳給 MOTIONS[name].make
  play(name, opts = {}, ms) { this.queue.push({ name, opts, ms: ms ?? MOTIONS[name].ms }); return this; }
  busy() { return !!this.cur || this.queue.length > 0; }

  spec(t) {
    if (this.cur && t - this.cur.start >= this.cur.ms) this.cur = null;
    if (!this.cur && this.queue.length) this.cur = { ...this.queue.shift(), start: t };
    let spec;
    if (this.cur) spec = MOTIONS[this.cur.name].make((t - this.cur.start) / this.cur.ms, this.cur.opts);
    else if (this.hold) spec = MOTIONS[this.hold.name].make(this.hold.u ?? 0.5 * this.hold.amount, this.hold.opts);
    else spec = standSpec();
    // 站著也會微微晃動、呼吸
    const sw = this.sway * Math.sin(t / 1000 * 0.9) + this.sway * 0.4 * Math.sin(t / 1000 * 2.3 + 1);
    spec.pelvis = add(spec.pelvis, [sw + this.x, 0.003 * Math.sin(t / 1000 * 1.6), 0]);
    for (const k of ['lFoot', 'rFoot']) spec[k] = add(spec[k], [this.x, 0, 0]);
    for (const k of ['lHand', 'rHand']) if (spec[k]) spec[k] = add(spec[k], [sw + this.x, 0, 0]);
    if (this.offset.some((v) => v)) for (const k of ['pelvis', 'lFoot', 'rFoot', 'lHand', 'rHand']) if (spec[k]) spec[k] = add(spec[k], this.offset);
    return spec;
  }

  joints(t) { return buildJoints(this.spec(t), this.scale); }

  // 推進到時間 t（毫秒），回傳 pose；漏格或人不在畫面時回傳 null
  step(t) {
    this.t = t;
    const j = this.joints(t);
    if (!this.present) return null;
    if (this.drop && this.rand() < this.drop) return null;
    return toPose(j, t, this.camera, { rand: this.rand, jitter: this.jitter, spike: this.spike });
  }
}

// 產生一段 pose 序列：script = [[開始時間 ms, 動作, opts], ...]；動作也可以是函式 (person, t) => {}
// fps 可以是數字或「每格間隔」的函式（模擬鏡頭不穩定）
export function synthSequence(script, { durationMs, fps = 30, ...opts } = {}) {
  const P = new SynthPerson(opts);
  const out = [];
  const q = [...script].sort((a, b) => a[0] - b[0]);
  const gap = typeof fps === 'function' ? fps : () => 1000 / fps;
  for (let t = 0; t <= durationMs; t += gap(t, P.rand)) {
    while (q.length && q[0][0] <= t) {
      const [, a, o, ms] = q.shift();
      if (typeof a === 'function') a(P, t); else P.play(a, o, ms);
    }
    out.push(P.step(t));
  }
  return out;
}

export { HIP_Y };
