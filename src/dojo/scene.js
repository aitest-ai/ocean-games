// 道場場景（可重用）：榻榻米＋木地板、木牆與灰泥牆、紙拉門窗、天花板木樑、紙燈籠、
// 地板站位線與紅色安全線、吊掛沙包、木樁人（木人樁）。全部是程式產生的幾何與貼圖（自製）。
//
// 光線：窗外的日光（形狀依窗格投在地上）、三四盞暖色燈籠、半球環境光＋房間角落的柔和陰影。
// 畫質分級（TIERS）：低＝平板（無陰影貼圖，改用「膠囊」近似陰影、小貼圖）；中＝陰影貼圖＋凹凸；
// 高＝大陰影貼圖、柔邊陰影、大貼圖、更多燈。
//
//   const dojo = await createDojo(canvas, { tier: 'low', floor: 'tatami' });
//   dojo.hitBag('left', 0.8); dojo.hitDummy('right', 0.5); dojo.focus('bag');
//   每格：dojo.frame(dt)
import { Program, makeMesh } from '../gl.js';
import * as TX from './textures.js';

export const TIERS = {
  low: { tex: 512, floorTex: 512, shadow: 0, pcf: 0, bump: false, points: 2, msaa: false, seg: 14 },
  mid: { tex: 512, floorTex: 1024, shadow: 1024, pcf: 1, bump: true, points: 3, msaa: true, seg: 22 },
  rt: { tex: 1024, floorTex: 2048, shadow: 2048, pcf: 2, bump: true, points: 4, msaa: true, seg: 32 },
};

// 房間大小（公尺）：玩家站在 z≈3.4 往 -z 看
export const ROOM = { x0: -5, x1: 5, z0: -3.5, z1: 6.5, h: 3.3 };
export const BAG = { x: -0.95, z: 0.3, top: 3.3, y0: 0.78, y1: 1.82, r: 0.18 };
export const DUMMY = { x: 1.0, z: 0.1 };
const WINDOWS = [[-1.7, 0.95, 2.45, 1.9], [1.6, 0.95, 2.45, 1.9]]; // 左牆：[z 中心, y0, y1, 寬]

// ── 4×4 矩陣（column-major，跟 WebGL 一樣） ─────────────────────────────────
const I = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
const T = (x, y, z) => { const m = I(); m[12] = x; m[13] = y; m[14] = z; return m; };
const RX = (a) => { const c = Math.cos(a), s = Math.sin(a), m = I(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; };
const RY = (a) => { const c = Math.cos(a), s = Math.sin(a), m = I(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; };
const RZ = (a) => { const c = Math.cos(a), s = Math.sin(a), m = I(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; };
const about = (p, R) => mul(T(p[0], p[1], p[2]), mul(R, T(-p[0], -p[1], -p[2])));
function perspective(fovy, aspect, n, f) {
  const t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
  m[0] = t / aspect; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = (2 * f * n) / (n - f);
  return m;
}
function ortho(l, r, b, t, n, f) {
  const m = I();
  m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n);
  m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n);
  return m;
}
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function lookAt(eye, at, up = [0, 1, 0]) {
  const z = nrm(sub3(eye, at)), x = nrm(cross(up, z)), y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]), -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]), -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]), 1]);
}

// ── 幾何（位置、法線、貼圖座標） ───────────────────────────────────────────
class Geo {
  constructor() { this.p = []; this.n = []; this.uv = []; }
  v(p, n, uv) { this.p.push(...p); this.n.push(...n); this.uv.push(...uv); }
  // 四邊形 a b c d（逆時針朝外），uv 預設依四角給
  quad(a, b, c, d, uv = [[0, 0], [1, 0], [1, 1], [0, 1]], n) {
    n ||= nrm(cross(sub3(b, a), sub3(d, a)));
    for (const i of [0, 1, 2, 0, 2, 3]) this.v([a, b, c, d][i], n, uv[i]);
  }
  // 長方體；貼圖座標以公尺為單位（材質再乘 uvScale）
  box(x0, y0, z0, x1, y1, z1, { skipBottom = false, skip = [] } = {}) {
    const P = (x, y, z) => [x, y, z];
    const faces = {
      px: [P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), [z1, z0, y0, y1]],
      nx: [P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), [z0, z1, y0, y1]],
      py: [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), [x0, x1, z1, z0]],
      ny: [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), [x0, x1, z0, z1]],
      pz: [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), [x0, x1, y0, y1]],
      nz: [P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), [x1, x0, y0, y1]],
    };
    for (const [k, [a, b, c, d, [u0, u1, v0, v1]]] of Object.entries(faces)) {
      if ((skipBottom && k === 'ny') || skip.includes(k)) continue;
      this.quad(a, b, c, d, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    }
  }
  // 旋轉體（繞 y 軸）：profile＝[[半徑, 高度], ...] 由下往上；uRep＝貼圖繞一圈重複幾次
  lathe(cx, cz, profile, seg, { uRep = 1, vScale = 1 } = {}) {
    let len = [0];
    for (let i = 1; i < profile.length; i++) len.push(len[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
    const pn = profile.map((_, i) => {
      const a = profile[Math.max(i - 1, 0)], b = profile[Math.min(i + 1, profile.length - 1)];
      const dr = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dr, dy) || 1;
      return [dy / l, -dr / l]; // (徑向, y) 法線
    });
    for (let i = 0; i < profile.length - 1; i++) for (let j = 0; j < seg; j++) {
      const pt = (ii, jj) => { const a = (jj / seg) * Math.PI * 2, [r, y] = profile[ii]; return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]; };
      const nn = (ii, jj) => { const a = (jj / seg) * Math.PI * 2, [nr, ny] = pn[ii]; return nrm([Math.cos(a) * nr, ny, Math.sin(a) * nr]); };
      const uv = (ii, jj) => [(jj / seg) * uRep, len[ii] * vScale];
      for (const [ii, jj] of [[i, j], [i, j + 1], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i + 1, j]]) this.v(pt(ii, jj), nn(ii, jj), uv(ii, jj));
    }
  }
  // 兩點之間的圓柱（木樁人的手、吊鍊、棍子）
  rod(a, b, r, seg = 10, uRep = 1) {
    const d = sub3(b, a), L = Math.hypot(...d), z = nrm(d);
    const x = nrm(cross(Math.abs(z[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], z)), y = cross(z, x);
    for (let j = 0; j < seg; j++) {
      const ring = (jj, t) => { const an = (jj / seg) * Math.PI * 2, c = Math.cos(an), s = Math.sin(an); const n = [x[0] * c + y[0] * s, x[1] * c + y[1] * s, x[2] * c + y[2] * s]; return [[a[0] + d[0] * t + n[0] * r, a[1] + d[1] * t + n[1] * r, a[2] + d[2] * t + n[2] * r], n, [(jj / seg) * uRep, t * L]]; };
      const q = [ring(j, 0), ring(j + 1, 0), ring(j + 1, 1), ring(j, 1)];
      for (const i of [0, 1, 2, 0, 2, 3]) this.v(...q[i]);
    }
    // 端蓋
    for (const [c, sgn] of [[a, -1], [b, 1]]) for (let j = 0; j < seg; j++) {
      const P = (jj) => { const an = (jj / seg) * Math.PI * 2; return [c[0] + (x[0] * Math.cos(an) + y[0] * Math.sin(an)) * r, c[1] + (x[1] * Math.cos(an) + y[1] * Math.sin(an)) * r, c[2] + (x[2] * Math.cos(an) + y[2] * Math.sin(an)) * r]; };
      const n = z.map((v) => v * sgn);
      const tri = sgn > 0 ? [c, P(j), P(j + 1)] : [c, P(j + 1), P(j)];
      for (const p of tri) this.v(p, n, [0.5, 0.5]);
    }
  }
  build(gl) {
    if (!this.p.length) return null;
    return { ...makeMesh(gl, [[new Float32Array(this.p), 3], [new Float32Array(this.n), 3], [new Float32Array(this.uv), 2]]), verts: this.p.length / 3 };
  }
}

// ── 著色器 ──────────────────────────────────────────────────────────────────
const VS = `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNor;
layout(location = 2) in vec2 aUV;
uniform mat4 uVP, uModel, uLightVP;
out vec3 vW; out vec3 vN; out vec2 vUV; out vec4 vL;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz; vN = mat3(uModel) * aNor; vUV = aUV; vL = uLightVP * w;
  gl_Position = uVP * w;
}`;

const FS = `
in vec3 vW; in vec3 vN; in vec2 vUV; in vec4 vL;
out vec4 oColor;
uniform sampler2D uTex;        // RGB 顏色（sRGB 貼圖，取樣已是線性）、A 高度
uniform sampler2D uShoji;      // 窗格：窗光投影的形狀
uniform vec2 uUVScale;
uniform vec3 uTint;
uniform float uRough, uF0, uBump, uEmitMask, uHit;
uniform vec3 uEmit;
uniform vec3 uCam, uKeyDir, uKeyCol, uSky, uGround;
uniform vec3 uPLPos[4]; uniform vec3 uPLCol[4];
uniform vec4 uCapA[3]; uniform vec4 uCapB[3];   // 膠囊（沙包、木樁人）：A=(下端, 半徑)、B=(上端, 強度)
uniform vec4 uWin[2];                           // 窗：(z 中心, y0, y1, 寬)
uniform vec4 uRoom;                             // x0, x1, z0, z1
uniform float uRoomH, uExposure, uTime;
#ifdef SHADOWMAP
uniform highp sampler2DShadow uShadow;
uniform float uShadowTexel;
#endif

const float PI = 3.14159265;

float capDist(vec3 P, vec3 L, vec3 A, vec3 B, out float tRay) {
  vec3 ba = B - A, w0 = A - P;
  float a = dot(ba, ba), b = dot(ba, L), d = dot(ba, w0), e = dot(L, w0);
  float den = max(a - b * b, 1e-5);
  float s = clamp((b * e - d) / den, 0.0, 1.0);
  tRay = max(dot(w0 + s * ba, L), 0.0);
  s = clamp(dot(P + L * tRay - A, ba) / a, 0.0, 1.0);
  vec3 q = A + s * ba;
  tRay = max(dot(q - P, L), 0.0);
  return length(q - (P + L * tRay));
}

// 窗光：從這一點往光源回推到左牆，落在窗格裡才亮（紙拉門的木格會投出格子影）
float windowLight(vec3 P, vec3 L) {
  if (L.x >= -0.05) return 0.0;
  float t = (uRoom.x - P.x) / L.x;
  if (t <= 0.0) return 0.0;
  vec3 q = P + L * t;
  float lit = 0.0;
  for (int i = 0; i < 2; i++) {
    vec4 w = uWin[i];
    vec2 uv = vec2((q.z - (w.x - w.w * 0.5)) / w.w, (q.y - w.y) / (w.z - w.y));
    float soft = 0.02 + t * 0.004;
    float m = smoothstep(-soft, soft, uv.x) * smoothstep(-soft, soft, 1.0 - uv.x) * smoothstep(-soft, soft, uv.y) * smoothstep(-soft, soft, 1.0 - uv.y);
    if (m > 0.0) lit += m * mix(0.25, 1.0, texture(uShoji, clamp(uv, 0.0, 1.0), t * 0.6).a);
  }
  return lit;
}

float keyVisibility(vec3 P, vec3 N, vec3 L) {
  float vis = 1.0;
#ifdef SHADOWMAP
  vec3 s = vL.xyz / vL.w * 0.5 + 0.5;
  if (s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0) {
    float bias = 0.0015 + 0.003 * (1.0 - clamp(dot(N, L), 0.0, 1.0));
    float acc = 0.0, n = 0.0;
    for (int x = -PCF; x <= PCF; x++) for (int y = -PCF; y <= PCF; y++) {
      acc += texture(uShadow, vec3(s.xy + vec2(x, y) * uShadowTexel * 1.3, s.z - bias)); n += 1.0;
    }
    vis = acc / n;
  }
#else
  for (int i = 0; i < 3; i++) {
    if (uCapB[i].w <= 0.0) continue;
    float tr; float d = capDist(P, L, uCapA[i].xyz, uCapB[i].xyz, tr);
    float r = uCapA[i].w;
    vis *= mix(1.0, smoothstep(r * 0.5, r * 1.3 + tr * 0.06, d), uCapB[i].w);
  }
#endif
  return vis;
}

// 房間角落與物體底下的柔和陰影（取代昂貴的環境光遮蔽）
float ambientOcc(vec3 P, vec3 N) {
  float ao = 1.0;
  ao *= 1.0 - 0.45 * exp(-P.y / 0.35) * (1.0 - abs(N.y));
  ao *= 1.0 - 0.35 * exp(-(uRoomH - P.y) / 0.45) * (1.0 - abs(N.y));
  float dx = min(P.x - uRoom.x, uRoom.y - P.x), dz = min(P.z - uRoom.z, uRoom.w - P.z);
  ao *= 1.0 - 0.4 * exp(-dx / 0.4) * (1.0 - abs(N.x));
  ao *= 1.0 - 0.4 * exp(-dz / 0.4) * (1.0 - abs(N.z));
  for (int i = 0; i < 3; i++) {
    if (uCapB[i].w <= 0.0) continue;
    vec3 ba = uCapB[i].xyz - uCapA[i].xyz;
    vec3 q = uCapA[i].xyz + ba * clamp(dot(P - uCapA[i].xyz, ba) / dot(ba, ba), 0.0, 1.0);
    vec3 dq = q - P; float d = length(dq);
    float r = uCapA[i].w;
    ao *= 1.0 - 0.55 * uCapB[i].w * clamp(dot(N, dq / max(d, 1e-3)) * 0.5 + 0.5, 0.0, 1.0) * (r * r) / max(d * d, r * r);
  }
  return ao;
}

vec3 brdf(vec3 N, vec3 V, vec3 L, vec3 alb, float rough, float F0, vec3 E) {
  float ndl = max(dot(N, L), 0.0);
  if (ndl <= 0.0) return vec3(0.0);
  vec3 H = normalize(L + V);
  float a = rough * rough, a2 = a * a;
  float ndh = max(dot(N, H), 0.0), ndv = max(dot(N, V), 1e-3);
  float dd = ndh * ndh * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * dd * dd);
  float k = (rough + 1.0) * (rough + 1.0) / 8.0;
  float G = ndv / (ndv * (1.0 - k) + k) * ndl / (ndl * (1.0 - k) + k);
  float F = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  float spec = D * G * F / (4.0 * ndv * ndl + 1e-4);
  return (alb / PI * (1.0 - F) + spec) * E * ndl;
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

void main() {
  vec4 tx = texture(uTex, vUV * uUVScale);
  vec3 alb = tx.rgb * uTint;
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
#ifdef BUMP
  if (uBump > 0.0) {
    vec3 dpx = dFdx(vW), dpy = dFdy(vW);
    float hx = dFdx(tx.a), hy = dFdy(tx.a);
    vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (hx * r1 + hy * r2);
    N = normalize(abs(det) * N - grad * uBump);
  }
#endif
  vec3 V = normalize(uCam - vW);
  vec3 L = -uKeyDir;
  float ao = ambientOcc(vW, N);
  vec3 col = vec3(0.0);
  // 窗外日光
  float win = windowLight(vW, L);
  if (win > 0.0) col += brdf(N, V, L, alb, uRough, uF0, uKeyCol * win * keyVisibility(vW, N, L));
  // 燈籠
  for (int i = 0; i < NPL; i++) {
    vec3 d = uPLPos[i] - vW; float d2 = dot(d, d);
    col += brdf(N, V, d * inversesqrt(d2), alb, uRough, uF0, uPLCol[i] / (d2 + 0.25));
  }
  // 環境光：上方偏暖白（天花板與牆反射）、下方偏木色（地板反射）
  vec3 amb = mix(uGround, uSky, N.y * 0.5 + 0.5);
  col += alb * amb * ao;
  col += alb * uEmit * mix(1.0, tx.a, uEmitMask);
  // 被打到的一瞬間稍微亮一下（回饋）
  col = mix(col, col * 1.7 + alb * vec3(0.12, 0.07, 0.03), uHit * 0.7);
  col = aces(col * uExposure);
  col = pow(col, vec3(1.0 / 2.2));
  // 一點點抖色，避免暗部出現色帶
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  oColor = vec4(col, 1.0);
}`;

const SHADOW_VS = `
layout(location = 0) in vec3 aPos;
uniform mat4 uLightVP, uModel;
void main() { gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`;
const SHADOW_FS = `out vec4 o; void main() { o = vec4(1.0); }`;

// ── 建立 ────────────────────────────────────────────────────────────────────
function makeTexture(gl, img, { repeat = true } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const wr = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
  const an = gl.getExtension('EXT_texture_filter_anisotropic');
  if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  return tex;
}

const nextFrame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

export async function createDojo(canvas, { tier = 'low', floor = 'tatami', onProgress = () => {} } = {}) {
  const Q = TIERS[tier] || TIERS.low;
  const gl = canvas.getContext('webgl2', { antialias: Q.msaa, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('這台裝置不支援 WebGL2');

  // 貼圖（每張畫完讓畫面喘口氣，載入進度才會更新）
  const T0 = performance.now();
  const textures = {};
  const jobs = [
    ['wood', () => TX.woodFloor(Q.floorTex)], ['tatami', () => TX.tatami(Q.floorTex)], ['plaster', () => TX.plaster(Q.tex)],
    ['panel', () => TX.woodPanel(Q.tex)], ['ceiling', () => TX.woodPanel(Q.tex, { tone: 0x8a6440, light: 0xc39a6c, boards: 6 })],
    ['beam', () => TX.woodPanel(Q.tex, { tone: 0x3e2717, light: 0x6e4a2c, boards: 2, gaps: false })],
    ['leather', () => TX.leather(Q.tex)], ['hardwood', () => TX.hardwood(Q.tex)], ['shoji', () => TX.shoji(Q.tex)],
  ];
  for (let i = 0; i < jobs.length; i++) {
    onProgress(`正在準備道場（${i + 1}/${jobs.length}）…`);
    await nextFrame();
    textures[jobs[i][0]] = makeTexture(gl, jobs[i][1]());
  }
  const white = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, white);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 128]));
  textures.white = white;
  const texMs = performance.now() - T0;

  const defines = { NPL: Q.points, ...(Q.shadow ? { SHADOWMAP: 1, PCF: Q.pcf } : {}), ...(Q.bump ? { BUMP: 1 } : {}) };
  const prog = new Program(gl, VS, FS, { label: 'dojo', defines });
  const shadowProg = Q.shadow ? new Program(gl, SHADOW_VS, SHADOW_FS, { label: 'dojo-shadow' }) : null;

  // 材質：貼圖、每公尺重複次數、粗糙度、反射率、顏色、凹凸
  const M = {
    wood: { tex: 'wood', uv: [1 / 1.2, 1 / 1.2], rough: 0.38, f0: 0.04, bump: 0.004 },
    tatami: { tex: 'tatami', uv: [1, 1], rough: 0.85, f0: 0.03, bump: 0.003 },
    tatamiEdge: { tex: 'panel', uv: [1.5, 6], rough: 0.6, f0: 0.04, tint: [0.75, 0.7, 0.62] },
    plaster: { tex: 'plaster', uv: [0.35, 0.35], rough: 0.95, f0: 0.02, bump: 0.003 },
    panel: { tex: 'panel', uv: [0.85, 1], rough: 0.55, f0: 0.04, bump: 0.003 },
    beam: { tex: 'beam', uv: [1.2, 0.5], rough: 0.6, f0: 0.04, bump: 0.002 },
    ceiling: { tex: 'ceiling', uv: [0.6, 0.4], rough: 0.7, f0: 0.03, bump: 0.002 },
    shoji: { tex: 'shoji', uv: [1, 1], rough: 0.9, f0: 0.02, emit: [3.2, 3.15, 3.0], emitMask: 1 },
    lantern: { tex: 'shoji', uv: [3, 1], rough: 0.9, f0: 0.02, tint: [1, 0.93, 0.8], emit: [1.5, 1.05, 0.55], emitMask: 0.8 },
    cord: { tex: 'white', uv: [1, 1], rough: 0.8, f0: 0.04, tint: [0.05, 0.04, 0.035] },
    tapeWhite: { tex: 'white', uv: [1, 1], rough: 0.6, f0: 0.04, tint: [0.92, 0.92, 0.9] },
    tapeRed: { tex: 'white', uv: [1, 1], rough: 0.6, f0: 0.04, tint: [0.75, 0.06, 0.05] },
    leather: { tex: 'leather', uv: [2, 1.2], rough: 0.5, f0: 0.05, bump: 0.002 },
    leatherCap: { tex: 'leather', uv: [3, 3], rough: 0.55, f0: 0.05, tint: [0.55, 0.5, 0.5] },
    strap: { tex: 'white', uv: [1, 1], rough: 0.6, f0: 0.04, tint: [0.12, 0.09, 0.07] },
    chain: { tex: 'white', uv: [1, 1], rough: 0.32, f0: 0.55, tint: [0.35, 0.35, 0.36] },
    hardwood: { tex: 'hardwood', uv: [1.4, 1.4], rough: 0.42, f0: 0.045, bump: 0.002 },
    stand: { tex: 'beam', uv: [1.5, 1.5], rough: 0.55, f0: 0.04 },
  };

  // ── 靜態房間 ──
  const R = ROOM;
  const G = {};
  const geo = (k) => (G[k] ||= new Geo());
  const tatamiArea = floor === 'tatami' ? { x0: -2.7, x1: 2.7, z0: -1.8, z1: 3.6, y: 0.045 } : null;
  geo('wood').quad([R.x0, 0, R.z1], [R.x1, 0, R.z1], [R.x1, 0, R.z0], [R.x0, 0, R.z0], [[R.x0, R.z1], [R.x1, R.z1], [R.x1, R.z0], [R.x0, R.z0]]);
  const fy = tatamiArea ? tatamiArea.y : 0.002;
  if (tatamiArea) {
    const A = tatamiArea;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      const x0 = A.x0 + i * 0.9, z0 = A.z0 + j * 1.8, flip = (i + j) % 2;
      const uv = flip ? [[1, 1], [0, 1], [0, 0], [1, 0]] : [[0, 0], [1, 0], [1, 1], [0, 1]];
      geo('tatami').quad([x0, A.y, z0 + 1.8], [x0 + 0.9, A.y, z0 + 1.8], [x0 + 0.9, A.y, z0], [x0, A.y, z0], [uv[3], uv[2], uv[1], uv[0]].map(([u, v]) => [u, v]));
    }
    geo('tatamiEdge').box(A.x0 - 0.06, 0, A.z0 - 0.06, A.x1 + 0.06, A.y - 0.001, A.z1 + 0.06, { skipBottom: true });
  }
  // 地板線：白色站位線＋馬步腳位、紅色安全線（不要超過）
  const tape = (k, x0, z0, x1, z1) => geo(k).quad([x0, fy + 0.002, z1], [x1, fy + 0.002, z1], [x1, fy + 0.002, z0], [x0, fy + 0.002, z0]);
  tape('tapeWhite', -0.75, 3.0, 0.75, 3.05);
  for (const s of [-1, 1]) { tape('tapeWhite', s * 0.62 - 0.12, 3.12, s * 0.62 + 0.12, 3.16); tape('tapeWhite', s * 0.62 - 0.02, 3.16, s * 0.62 + 0.02, 3.36); }
  tape('tapeRed', -2.2, 1.55, 2.2, 1.61);
  // 牆：牆裙木板（0~1 m）、灰泥、橫樑；四面牆共用
  const walls = [
    { axis: 'z', at: R.z0, from: R.x0, to: R.x1, dir: 1 }, { axis: 'z', at: R.z1, from: R.x1, to: R.x0, dir: -1 },
    { axis: 'x', at: R.x0, from: R.z1, to: R.z0, dir: 1 }, { axis: 'x', at: R.x1, from: R.z0, to: R.z1, dir: -1 },
  ];
  for (const w of walls) {
    const P = (s, y, off = 0) => (w.axis === 'z' ? [s, y, w.at + w.dir * off] : [w.at + w.dir * off, y, s]);
    const strip = (k, y0, y1, off = 0) => {
      const len = Math.abs(w.to - w.from);
      geo(k).quad(P(w.from, y0, off), P(w.to, y0, off), P(w.to, y1, off), P(w.from, y1, off), [[0, y0], [len, y0], [len, y1], [0, y1]]);
    };
    strip('panel', 0, 1.0); strip('plaster', 1.0, R.h);
    // 踢腳板、腰帶木條、上方橫樑（突出牆面）
    const ledge = (k, y0, y1, d) => {
      const a = P(w.from, y0), b = P(w.to, y1, d);
      geo(k).box(Math.min(a[0], b[0]), y0, Math.min(a[2], b[2]), Math.max(a[0], b[0]), y1, Math.max(a[2], b[2]));
    };
    ledge('beam', 0, 0.1, 0.02); ledge('beam', 0.98, 1.05, 0.03); ledge('beam', 2.55, 2.72, 0.08);
    // 柱子：每 2.5 公尺一根
    const n = Math.round(Math.abs(w.to - w.from) / 2.5);
    for (let i = 0; i <= n; i++) {
      const s = w.from + ((w.to - w.from) * i) / n;
      const a = P(s - 0.08, 0), b = P(s + 0.08, R.h, 0.07);
      geo('beam').box(Math.min(a[0], b[0]), 0, Math.min(a[2], b[2]), Math.max(a[0], b[0]), R.h, Math.max(a[2], b[2]));
    }
  }
  // 左牆的紙拉門窗（會透光）＋木框
  for (const [zc, y0, y1, wd] of WINDOWS) {
    const x = R.x0 + 0.012;
    geo('shoji').quad([x, y0, zc + wd / 2], [x, y0, zc - wd / 2], [x, y1, zc - wd / 2], [x, y1, zc + wd / 2], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    geo('beam').box(R.x0, y0 - 0.06, zc - wd / 2 - 0.06, R.x0 + 0.06, y0, zc + wd / 2 + 0.06);
    geo('beam').box(R.x0, y1, zc - wd / 2 - 0.06, R.x0 + 0.06, y1 + 0.06, zc + wd / 2 + 0.06);
    geo('beam').box(R.x0, y0, zc - wd / 2 - 0.06, R.x0 + 0.06, y1, zc - wd / 2);
    geo('beam').box(R.x0, y0, zc + wd / 2, R.x0 + 0.06, y1, zc + wd / 2 + 0.06);
  }
  // 天花板＋木樑
  geo('ceiling').quad([R.x0, R.h, R.z0], [R.x1, R.h, R.z0], [R.x1, R.h, R.z1], [R.x0, R.h, R.z1], [[R.x0, R.z0], [R.x1, R.z0], [R.x1, R.z1], [R.x0, R.z1]]);
  for (let z = R.z0 + 1.0; z < R.z1; z += 1.6) geo('beam').box(R.x0, R.h - 0.2, z - 0.09, R.x1, R.h, z + 0.09, { skip: ['py'] });
  // 後牆：空白木匾、棍架與木棍
  geo('hardwood').box(-0.8, 1.85, R.z0 + 0.02, 0.8, 2.35, R.z0 + 0.06);
  const rackX = 2.4;
  for (const dx of [0, 1.4]) geo('stand').box(rackX + dx, 0, R.z0 + 0.05, rackX + dx + 0.08, 1.75, R.z0 + 0.25);
  for (const y of [0.55, 1.45]) geo('stand').box(rackX, y, R.z0 + 0.08, rackX + 1.48, y + 0.06, R.z0 + 0.22);
  const sticks = new Geo();
  for (let i = 0; i < 5; i++) { const x = rackX + 0.2 + i * 0.25; sticks.rod([x, 0.02, R.z0 + 0.3], [x - 0.03, 1.7, R.z0 + 0.16], 0.016, 8, 1); }
  // 紙燈籠＋吊繩
  const lampPos = [[-1.6, 2.35, 0.6], [1.7, 2.35, 0.4], [0, 2.35, 2.9], [-3.4, 2.35, 3.5]].slice(0, Math.max(Q.points, 3));
  const lamps = new Geo(), cords = new Geo();
  for (const [x, y, z] of lampPos) {
    lamps.lathe(x, z, [[0.0, y - 0.2], [0.15, y - 0.19], [0.21, y - 0.08], [0.22, y + 0.02], [0.2, y + 0.13], [0.14, y + 0.19], [0.0, y + 0.2]], Q.seg, { uRep: 3, vScale: 2 });
    cords.rod([x, y + 0.2, z], [x, R.h, z], 0.006, 6);
  }

  // ── 沙包（掛點在天花板） ──
  const bag = new Geo(), bagCap = new Geo(), chain = new Geo(), straps = new Geo();
  const B = BAG;
  bag.lathe(B.x, B.z, [[B.r * 0.85, B.y0], [B.r, B.y0 + 0.05], [B.r, B.y1 - 0.05], [B.r * 0.85, B.y1]], Q.seg, { uRep: 2, vScale: 1 });
  bagCap.lathe(B.x, B.z, [[0, B.y0 - 0.005], [B.r * 0.86, B.y0]], Q.seg);
  bagCap.lathe(B.x, B.z, [[B.r * 0.86, B.y1], [0, B.y1 + 0.005]], Q.seg);
  const ring = B.y1 + 0.24;
  chain.rod([B.x, ring, B.z], [B.x, B.top, B.z], 0.011, 6);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.6; straps.rod([B.x, ring, B.z], [B.x + Math.cos(a) * B.r * 0.8, B.y1 + 0.01, B.z + Math.sin(a) * B.r * 0.8], 0.008, 5); }

  // ── 木樁人（主幹＋三隻手＋一隻腳，架在木架上） ──
  const D = DUMMY;
  const frame = new Geo(), trunk = new Geo();
  for (const s of [-1, 1]) {
    frame.box(D.x + s * 0.45 - 0.05, 0, D.z - 0.06, D.x + s * 0.45 + 0.05, 1.95, D.z + 0.06);
    frame.box(D.x + s * 0.45 - 0.07, 0, D.z - 0.35, D.x + s * 0.45 + 0.07, 0.07, D.z + 0.35);
  }
  for (const y of [0.5, 1.75]) frame.box(D.x - 0.5, y, D.z - 0.04 - 0.16, D.x + 0.5, y + 0.07, D.z + 0.04 - 0.16);
  trunk.lathe(D.x, D.z, [[0.12, 0.42], [0.135, 0.5], [0.135, 1.78], [0.11, 1.84], [0, 1.86]], Q.seg, { uRep: 1, vScale: 1.2 });
  // 手：從主幹往玩家（+z）伸出；樞紐在主幹表面
  const arms = [
    { pivot: [D.x - 0.05, 1.38, D.z + 0.12], tip: [D.x - 0.2, 1.42, D.z + 0.55], r: 0.027 },
    { pivot: [D.x + 0.05, 1.38, D.z + 0.12], tip: [D.x + 0.2, 1.42, D.z + 0.55], r: 0.027 },
    { pivot: [D.x, 1.12, D.z + 0.12], tip: [D.x, 1.08, D.z + 0.52], r: 0.03 },
  ].map((a) => { const g = new Geo(); g.rod(a.pivot, a.tip, a.r, 10, 1); return { ...a, geo: g, ang: 0, vel: 0 }; });
  const leg = new Geo();
  leg.rod([D.x, 0.62, D.z + 0.12], [D.x, 0.6, D.z + 0.4], 0.032, 10); leg.rod([D.x, 0.6, D.z + 0.4], [D.x + 0.02, 0.32, D.z + 0.55], 0.03, 10);

  // ── 繪製清單 ──
  const items = [];
  const add = (g, mat, { dyn = null, cast = false } = {}) => { const mesh = g.build(gl); if (mesh) items.push({ mesh, mat: M[mat], dyn, cast }); };
  for (const [k, g] of Object.entries(G)) add(g, k, { cast: k === 'stand' || k === 'hardwood' });
  add(sticks, 'stand', { cast: true });
  add(lamps, 'lantern'); add(cords, 'cord', { cast: true });
  for (const [g, m] of [[bag, 'leather'], [bagCap, 'leatherCap'], [chain, 'chain'], [straps, 'strap']]) add(g, m, { dyn: 'bag', cast: true });
  add(frame, 'stand', { cast: true });
  add(trunk, 'hardwood', { dyn: 'trunk', cast: true });
  add(leg, 'hardwood', { dyn: 'trunk', cast: true });
  arms.forEach((a, i) => add(a.geo, 'hardwood', { dyn: 'arm' + i, cast: true }));
  const tris = items.reduce((s, it) => s + it.mesh.verts / 3, 0);

  // ── 陰影貼圖（中、高畫質） ──
  let shadow = null;
  const keyDir = nrm([0.78, -0.5, 0.18]);  // 日光從左牆的窗戶斜斜照進來
  const lightVP = mul(ortho(-7, 7, -5, 5, 0.5, 30), lookAt([-keyDir[0] * 12, 1.2 - keyDir[1] * 12, 1 - keyDir[2] * 12], [0, 1.2, 1], [0, 1, 0]));
  if (Q.shadow) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, Q.shadow, Q.shadow);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    shadow = { tex, fbo, loc: gl.getUniformLocation(prog.program, 'uShadow') };
  }

  // ── 動態：沙包擺動、木樁人晃動 ──
  const phys = {
    bag: { ax: 0, vx: 0, az: 0, vz: 0, tw: 0, vt: 0, hit: 0 },
    dummy: { x: 0, vx: 0, z: 0, vz: 0, yaw: 0, vyaw: 0, hit: 0 },
  };
  const pivot = [B.x, B.top, B.z], trunkAxis = [D.x, 0, D.z];

  // ── 鏡頭 ──
  const VIEWS = {
    bag: { eye: [-0.3, 1.45, 3.45], at: [-0.95, 1.22, 0.3] },
    dummy: { eye: [0.35, 1.45, 3.3], at: [1.0, 1.15, 0.1] },
    room: { eye: [0.15, 1.6, 4.7], at: [0.05, 1.05, 0.2] },
    both: { eye: [0.05, 1.5, 3.9], at: [0.05, 1.15, 0.2] },
  };
  const cam = { eye: [...VIEWS.room.eye], at: [...VIEWS.room.at], view: 'room', fov: 55, t: 0 };

  const api = {
    gl, tier, tris, texMs: Math.round(texMs), scale: 1,
    reduceMotion: false, menuDrift: true,
    focus(view) { if (VIEWS[view]) cam.view = view; },
    hitBag(side = 'left', strength = 0.6, good = true) {
      const b = phys.bag, k = this.reduceMotion ? 0.5 : 1;
      b.vx += (0.25 + strength * 0.55) * (good ? 1 : 0.6) * k;
      b.vz += (side === 'left' ? 1 : -1) * 0.12 * k;
      b.vt += (side === 'left' ? -1 : 1) * 1.1 * k;
      b.hit = good ? 1 : 0.5;
    },
    hitDummy(side = 'left', strength = 0.6, good = true) {
      const d = phys.dummy, k = this.reduceMotion ? 0.5 : 1;
      d.vz -= (0.12 + strength * 0.25) * k;
      d.vx += (side === 'left' ? 1 : -1) * 0.05 * k;
      d.vyaw += (side === 'left' ? 1 : -1) * 0.9 * k;
      arms.forEach((a, i) => { a.vel += (i === (side === 'left' ? 0 : 1) ? 3.5 : 1.5) * (0.5 + strength) * k * (i % 2 ? -1 : 1); });
      d.hit = good ? 1 : 0.5;
    },
    resize() {
      const w = Math.max(1, Math.round(canvas.clientWidth * this.scale)), h = Math.max(1, Math.round(canvas.clientHeight * this.scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    },
    frame(dt) {
      cam.t += dt;
      // 物理：阻尼單擺（沙包）、彈簧（木樁人）
      const b = phys.bag, g = 9.81 / 1.9;
      b.vx += (-g * b.ax - 0.55 * b.vx) * dt; b.ax += b.vx * dt;
      b.vz += (-g * b.az - 0.55 * b.vz) * dt; b.az += b.vz * dt;
      b.vt += (-6 * b.tw - 1.2 * b.vt) * dt; b.tw += b.vt * dt;
      b.hit = Math.max(b.hit - dt * 4, 0);
      const d = phys.dummy;
      d.vz += (-160 * d.z - 9 * d.vz) * dt; d.z += d.vz * dt;
      d.vx += (-160 * d.x - 9 * d.vx) * dt; d.x += d.vx * dt;
      d.vyaw += (-120 * d.yaw - 7 * d.vyaw) * dt; d.yaw += d.vyaw * dt;
      d.hit = Math.max(d.hit - dt * 4, 0);
      for (const a of arms) { a.vel += (-260 * a.ang - 6 * a.vel) * dt; a.ang += a.vel * dt; }

      const mats = {};
      mats.bag = about(pivot, mul(RX(-b.ax), mul(RZ(b.az), RY(b.tw))));
      mats.trunk = mul(T(d.x, 0, d.z), about(trunkAxis, RY(d.yaw)));
      arms.forEach((a, i) => { mats['arm' + i] = mul(mats.trunk, about(a.pivot, i === 2 ? RX(a.ang * 0.02) : RY(a.ang * 0.02))); });
      const hitOf = (dyn) => (dyn === 'bag' ? b.hit : dyn ? d.hit : 0);

      // 鏡頭：慢慢移到要看的地方；選單時輕輕晃動
      const V = VIEWS[cam.view], kk = 1 - Math.exp(-dt * 2.2);
      for (let i = 0; i < 3; i++) { cam.eye[i] += (V.eye[i] - cam.eye[i]) * kk; cam.at[i] += (V.at[i] - cam.at[i]) * kk; }
      const sway = this.reduceMotion ? 0 : 1;
      const eye = [cam.eye[0] + Math.sin(cam.t * 0.31) * 0.05 * sway * (this.menuDrift ? 3 : 1), cam.eye[1] + Math.sin(cam.t * 0.47) * 0.015 * sway, cam.eye[2]];

      this.resize();
      const W = canvas.width, H = canvas.height;
      const VP = mul(perspective((cam.fov * Math.PI) / 180, W / H, 0.05, 40), lookAt(eye, cam.at));

      // 陰影
      if (shadow) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadow.fbo);
        gl.viewport(0, 0, Q.shadow, Q.shadow);
        gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        shadowProg.use({ uLightVP: lightVP });
        for (const it of items) {
          if (!it.cast) continue;
          shadowProg.set('uModel', it.dyn ? mats[it.dyn] : I());
          gl.bindVertexArray(it.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, it.mesh.verts);
        }
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      gl.clearColor(0.05, 0.04, 0.03, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // 膠囊：沙包（跟著擺動）、木樁人
      const bagBottom = [B.x + Math.sin(b.az) * (B.top - B.y0), B.top - Math.cos(b.ax) * (B.top - B.y0), B.z - Math.sin(b.ax) * (B.top - B.y0)];
      const bagTopP = [B.x + Math.sin(b.az) * (B.top - B.y1), B.top - Math.cos(b.ax) * (B.top - B.y1), B.z - Math.sin(b.ax) * (B.top - B.y1)];
      const pl = lampPos.slice(0, Q.points);
      prog.use({
        uVP: VP, uLightVP: lightVP, uCam: eye, uKeyDir: keyDir, uKeyCol: [5.2, 5.0, 4.6],
        uSky: [0.36, 0.33, 0.29], uGround: [0.22, 0.17, 0.11], uExposure: 1.0, uTime: cam.t,
        uPLPos: pl.flat(), uPLCol: pl.flatMap(() => [2.6, 1.75, 0.95]),
        uCapA: [...bagBottom, B.r, D.x + d.x, 0.1, D.z + d.z, 0.24, 0, 0, 0, 0],
        uCapB: [...bagTopP, 1, D.x + d.x, 1.8, D.z + d.z, 0.8, 0, 0, 0, 0],
        uWin: WINDOWS.flat(), uRoom: [R.x0, R.x1, R.z0, R.z1], uRoomH: R.h, uShoji: textures.shoji,
      });
      if (shadow) {
        gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, shadow.tex);
        gl.uniform1i(shadow.loc, 7);
        prog.set('uShadowTexel', 1 / Q.shadow);
      }
      for (const it of items) {
        const m = it.mat;
        prog.set('uModel', it.dyn ? mats[it.dyn] : I());
        prog.set('uTex', textures[m.tex]);
        prog.set('uUVScale', m.uv); prog.set('uTint', m.tint || [1, 1, 1]);
        prog.set('uRough', m.rough); prog.set('uF0', m.f0); prog.set('uBump', Q.bump ? m.bump || 0 : 0);
        prog.set('uEmit', m.emit || [0, 0, 0]); prog.set('uEmitMask', m.emitMask || 0);
        prog.set('uHit', hitOf(it.dyn));
        gl.bindVertexArray(it.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, it.mesh.verts);
      }
      gl.bindVertexArray(null);
    },
  };
  return api;
}
