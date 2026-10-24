// Game props (kayak, paddler, paddle, buoys): small procedural meshes lit like the sea's foam is,
// by the same sun, sky irradiance, cloud shadow, aerial perspective and rain fog, so they sit in the
// scene in any weather. Vertex layout: position, normal, colour (linear albedo).
import { Program, makeMesh } from '../gl.js';
import { SKY_LOOKUP_GLSL } from '../sky/atmosphere.js';

const VS = `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNor;
layout(location = 2) in vec3 aCol;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vWorld;
out vec3 vN;
out vec3 vCol;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vN = mat3(uModel) * aNor;
  vCol = aCol;
  gl_Position = uViewProj * w;
}`;

const FS = SKY_LOOKUP_GLSL + `
in vec3 vWorld;
in vec3 vN;
in vec3 vCol;
out vec4 oColor;
uniform vec3 uCamPos;
uniform vec3 uTint;      // albedo multiplier (a buoy already passed fades to grey)
uniform float uGlow;     // self-lit marker (next gate), in units of the sky irradiance
uniform vec3 uFlash;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(uCamPos - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = uSunDir;
  vec2 suv = (vWorld.xz - uShaftRect.xy) * uShaftRect.zw;
  float sunVis = mix(uHazeSun, texture(uShaftShadow, suv).r, smoothstep(0.0, 0.04, min(min(suv.x, suv.y), min(1.0 - suv.x, 1.0 - suv.y))));
  vec3 sunE = sunIlluminance(), skyE = skyIrradiance();
  // wrapped diffuse (painted plastic) plus light bounced up from the sea
  float wrapL = max((dot(N, L) + 0.15) / 1.15, 0.0);
  vec3 Ein = sunE * sunVis * wrapL + skyE * (0.55 + 0.45 * N.y) + skyE * 0.12 * max(-N.y, 0.0) + uFlash;
  vec3 alb = vCol * uTint;
  vec3 col = alb * Ein / 3.14159265;
  // a little gloss so the hull reads as plastic
  vec3 H = normalize(L + V);
  col += sunE * sunVis * 0.04 * pow(max(dot(N, H), 0.0), 60.0) * step(0.0, dot(N, L));
  col += alb * skyE * uGlow / 3.14159265;
  float dist = length(vWorld - uCamPos);
  vec3 aL, aT;
  aerial(-V, dist * 0.001, aL, aT);
  col = col * aT + aL;
  col = withShafts(col, uCamPos, -V, dist);
  col = applyFog(col, -V, dist);
  oColor = vec4(col, 1.0);
}`;

// ── mesh building ───────────────────────────────────────────────────────────
// sRGB-ish colour to linear albedo
const lin = (hex) => [0, 1, 2].map((i) => Math.pow(((hex >> (16 - 8 * i)) & 255) / 255, 2.2));

export class MeshBuilder {
  constructor() { this.p = []; this.n = []; this.c = []; }
  tri(a, b, c, col, na, nb, nc) {
    if (!na) {
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(...n) || 1;
      na = nb = nc = n.map((x) => x / l);
    }
    this.p.push(...a, ...b, ...c);
    this.n.push(...na, ...nb, ...nc);
    for (let i = 0; i < 3; i++) this.c.push(...col);
  }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  // grid of points rows[i][j] (smooth normals from neighbours), colour per row
  surface(rows, colOf) {
    const R = rows.length, C = rows[0].length;
    const nrm = (i, j) => {
      const P = (a, b) => rows[Math.min(Math.max(a, 0), R - 1)][(b + C) % C];
      const du = P(i + 1, j).map((x, k) => x - P(i - 1, j)[k]);
      const dv = P(i, j + 1).map((x, k) => x - P(i, j - 1)[k]);
      const n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
      const l = Math.hypot(...n) || 1;
      return n.map((x) => x / l);
    };
    for (let i = 0; i < R - 1; i++)
      for (let j = 0; j < C - 1; j++) {
        const col = colOf(i, j);
        const a = rows[i][j], b = rows[i + 1][j], c = rows[i + 1][j + 1], d = rows[i][j + 1];
        this.tri(a, b, c, col, nrm(i, j), nrm(i + 1, j), nrm(i + 1, j + 1));
        this.tri(a, c, d, col, nrm(i, j), nrm(i + 1, j + 1), nrm(i, j + 1));
      }
  }
  // closed cylinder / cone frustum along y
  cylinder(x, y0, z, r0, r1, h, col, seg = 16) {
    const ring = (y, r) => Array.from({ length: seg + 1 }, (_, j) => { const a = (j / seg) * Math.PI * 2; return [x + Math.cos(a) * r, y, z + Math.sin(a) * r]; });
    this.surface([ring(y0, r0), ring(y0 + h, r1)], () => col);
    for (let j = 0; j < seg; j++) {
      const a0 = (j / seg) * Math.PI * 2, a1 = ((j + 1) / seg) * Math.PI * 2;
      if (r1 > 0) this.tri([x, y0 + h, z], [x + Math.cos(a1) * r1, y0 + h, z + Math.sin(a1) * r1], [x + Math.cos(a0) * r1, y0 + h, z + Math.sin(a0) * r1], col);
      this.tri([x, y0, z], [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0], [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0], col);
    }
  }
  sphere(cx, cy, cz, r, col, seg = 12, sy = 1) {
    const rows = [];
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI;
      rows.push(Array.from({ length: seg * 2 + 1 }, (_, j) => { const ph = (j / (seg * 2)) * Math.PI * 2; return [cx + r * Math.sin(th) * Math.cos(ph), cy + r * sy * Math.cos(th), cz + r * Math.sin(th) * Math.sin(ph)]; }));
    }
    this.surface(rows, () => col);
  }
  box(x0, y0, z0, x1, y1, z1, col) {
    const v = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
    for (const [a, b, c, d] of [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]) this.quad(v(a), v(b), v(c), v(d), col);
  }
  build(gl) {
    return { ...makeMesh(gl, [[new Float32Array(this.p), 3], [new Float32Array(this.n), 3], [new Float32Array(this.c), 3]]), verts: this.p.length / 3 };
  }
}

// Kayak, bow along +x, waterline at y = 0. 4.3 m long, 0.66 m beam.
function kayakMesh() {
  const m = new MeshBuilder();
  const L = 4.3, B = 0.66, hull = lin(0xff7a1a), deck = lin(0xf2c230), rim = lin(0x202428);
  const sections = 28, around = 14;
  const rows = [];
  for (let i = 0; i <= sections; i++) {
    const u = (i / sections) * 2 - 1;               // -1 stern .. +1 bow
    const w = (B / 2) * Math.pow(Math.max(1 - u * u, 0), 0.62) + 0.004;
    const keel = -0.2 * Math.pow(Math.max(1 - u * u, 0), 0.35) + 0.05 * u * u;
    const sheer = 0.16 + 0.1 * u * u * u * u;        // deck edge rises toward the ends
    const row = [];
    for (let j = 0; j <= around; j++) {
      const a = Math.PI * (j / around);             // 0: right gunwale, pi/2: keel, pi: left gunwale
      row.push([u * L / 2, sheer + (keel - sheer) * Math.sin(a), Math.cos(a) * w]);
    }
    rows.push(row);
  }
  m.surface(rows, () => hull);
  // deck: a gentle crown between the gunwales, with a cockpit rim
  const drows = [];
  for (let i = 0; i <= sections; i++) {
    const u = (i / sections) * 2 - 1;
    const w = (B / 2) * Math.pow(Math.max(1 - u * u, 0), 0.62) + 0.004;
    const sheer = 0.16 + 0.1 * u * u * u * u;
    drows.push(Array.from({ length: 9 }, (_, j) => { const s = j / 8 * 2 - 1; return [u * L / 2, sheer + 0.07 * (1 - s * s) * Math.max(1 - u * u, 0), -s * w]; }));
  }
  m.surface(drows, (i, j) => {
    const u = (i / sections) * 2 - 1;
    return u > -0.28 && u < 0.08 && j > 1 && j < 6 ? rim : deck;
  });
  return m;
}

// Paddler (sitting in the cockpit, facing +x): life jacket, arms folded into the torso, helmet
function paddlerMesh() {
  const m = new MeshBuilder();
  const jacket = lin(0xd8262e), skin = lin(0xe0ac7e), helmet = lin(0x1f6fd1), shirt = lin(0x2b3a4a);
  m.cylinder(-0.25, 0.18, 0, 0.2, 0.17, 0.42, jacket, 14);        // torso / life jacket
  m.cylinder(-0.25, 0.6, 0, 0.07, 0.07, 0.08, skin, 10);           // neck
  m.sphere(-0.25, 0.8, 0, 0.13, skin, 10);                          // head
  m.sphere(-0.27, 0.86, 0, 0.145, helmet, 10, 0.75);                // helmet
  // arms reaching forward to the paddle shaft at chest height
  for (const s of [-1, 1]) {
    m.cylinder(-0.2, 0.43, s * 0.2, 0.05, 0.045, 0.12, shirt, 8);
    const a = [-0.2, 0.52, s * 0.2], b = [0.12, 0.45, s * 0.28];
    const steps = 6;
    for (let k = 0; k < steps; k++) {
      const p = a.map((x, i) => x + (b[i] - x) * (k / steps));
      m.sphere(p[0], p[1], p[2], 0.05, k > 3 ? skin : shirt, 6);
    }
  }
  return m;
}

// Double paddle along z (the paddler rotates it while stroking), centred at the origin
function paddleMesh() {
  const m = new MeshBuilder();
  const shaft = lin(0x2a2d31), blade = lin(0xf4f4f0);
  const seg = 8, r = 0.016, half = 1.05;
  const ring = (z) => Array.from({ length: seg + 1 }, (_, j) => { const a = (j / seg) * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r, z]; });
  m.surface([ring(-half), ring(half)], () => shaft);
  for (const s of [-1, 1]) {
    const z0 = s * half, z1 = s * (half + 0.45);
    m.quad([0, -0.09, z0], [0, 0.09, z0], [0, 0.1, z1], [0, -0.1, z1], blade);
    m.quad([0.004, -0.09, z0], [0.004, -0.1, z1], [0.004, 0.1, z1], [0.004, 0.09, z0], blade);
  }
  return m;
}

// Buoy: float body, cone top, white band and a staff with a flag. Colour set per gate via uTint.
function buoyMesh() {
  const m = new MeshBuilder();
  const white = lin(0xffffff), dark = lin(0x30343a);
  m.cylinder(0, -0.6, 0, 0.55, 0.55, 0.85, white, 18);
  m.cylinder(0, 0.25, 0, 0.555, 0.555, 0.18, lin(0xf0f0f0), 18);
  m.cylinder(0, 0.43, 0, 0.5, 0.08, 0.7, white, 18);
  m.cylinder(0, 1.1, 0, 0.035, 0.035, 1.2, dark, 6);
  m.quad([0, 2.3, 0], [0, 1.85, 0], [0.7, 1.95, 0], [0.7, 2.25, 0], white);
  return m;
}

export class Props {
  constructor(gl) {
    this.gl = gl;
    this.prog = new Program(gl, VS, FS, { label: 'props' });
    this.meshes = { kayak: kayakMesh().build(gl), paddler: paddlerMesh().build(gl), paddle: paddleMesh().build(gl), buoy: buoyMesh().build(gl) };
    this.queue = [];
  }

  // register a game's own mesh (a MeshBuilder) under a name
  define(name, builder) { this.meshes[name] = builder.build(this.gl); }

  // queue a draw for this frame: mesh name, model matrix, tint, glow
  add(mesh, model, tint = [1, 1, 1], glow = 0) { this.queue.push({ mesh, model, tint, glow }); }

  draw({ vp, camPos, skyU, fogU, flash }) {
    const gl = this.gl;
    this.prog.use({ ...skyU, ...fogU, uViewProj: vp, uCamPos: camPos, uFlash: flash });
    gl.disable(gl.CULL_FACE);
    for (const d of this.queue) {
      const m = this.meshes[d.mesh];
      this.prog.set('uModel', d.model);
      this.prog.set('uTint', d.tint);
      this.prog.set('uGlow', d.glow);
      gl.bindVertexArray(m.vao);
      gl.drawArrays(gl.TRIANGLES, 0, m.verts);
    }
    gl.bindVertexArray(null);
    this.queue.length = 0;
  }
}

// model matrix: translate(pos) * yaw (about y, heading from +x toward +z) * pitch (about z) * roll (about x)
export function modelMatrix(pos, yaw, pitch = 0, roll = 0, scale = 1) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  // R = Ry(-yaw) * Rz(pitch) * Rx(roll): +x (bow) maps to (cos yaw, 0, sin yaw)
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];             // columns
  const Rz = [cp, sp, 0, -sp, cp, 0, 0, 0, 1];
  const Rx = [1, 0, 0, 0, cr, sr, 0, -sr, cr];
  const m3 = (a, b) => { const o = new Array(9); for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2]; return o; };
  const R = m3(m3(Ry, Rz), Rx);
  const o = new Float32Array(16);
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 4 + r] = R[c * 3 + r] * scale;
  o[12] = pos[0]; o[13] = pos[1]; o[14] = pos[2]; o[15] = 1;
  return o;
}

// scale a model matrix along its own x / y / z axes (a crouching rider, a swelling sail)
export function scaled(m, [sx, sy, sz]) {
  const o = new Float32Array(m);
  for (let i = 0; i < 3; i++) { o[i] *= sx; o[4 + i] *= sy; o[8 + i] *= sz; }
  return o;
}

export { lin };
export const COLORS = { red: lin(0xe5332a), green: lin(0x1fae55), yellow: lin(0xffc21a), grey: lin(0x8a8f96), white: [1, 1, 1] };
