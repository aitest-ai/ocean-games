// The quiz-show world (three.js, self-hosted, MIT): a studio stage with moving lights, a marquee
// arch and a glowing back wall, the host 「答答」, the player's figure that mirrors the player, and
// confetti / bubble effects. Everything is made by code (no outside models, pictures or fonts).
// Each level type adds its own set (src/quiz/views/) and its own camera.
import * as THREE from '../land/three.js';
import { Figure, mixPose } from '../land/figure.js';

export { THREE };
const rand = (a, b) => a + Math.random() * (b - a);

export class Stage {
  constructor(canvas, { tier = 'mid', reduceMotion = false } = {}) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: tier !== 'low', powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    this.renderer = r; this.tier = tier; this.reduceMotion = reduceMotion;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);
    this.scale = 1; this.time = 0;
    this.scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x302040, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 8, 6); this.scene.add(key);
    this.studio = buildStudio(this);
    this.scene.add(this.studio.root);
    this.host = makeHost();
    this.scene.add(this.host.fig.root);
    this.player = new Avatar({ jersey: '#2f80ed', pants: '#1b3a6b', cap: '#ffd23f' });
    this.scene.add(this.player.fig.root);
    this.fx = new Effects(this.scene, tier);
    this.view = null;
  }

  setView(v) {
    this.view?.hide?.(this);
    this.view = v;
    v?.show?.(this);
  }

  resize() {
    this.renderer.setPixelRatio(this.scale);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  frame(dt) {
    this.time += dt;
    this.studio.update(dt, this.time, this.reduceMotion);
    this.host.update(dt, this.time);
    this.fx.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  project(p) {
    const v = new THREE.Vector3(p[0], p[1], p[2]);
    const behind = v.clone().applyMatrix4(this.camera.matrixWorldInverse).z > 0;
    v.project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (0.5 - v.y * 0.5) * innerHeight, behind };
  }

  lookAt(pos, target, k = 1) {
    const c = this.camera;
    if (k >= 1 || !this._look) { c.position.set(...pos); this._look = new THREE.Vector3(...target); }
    else { c.position.lerp(new THREE.Vector3(...pos), k); this._look.lerp(new THREE.Vector3(...target), k); }
    c.lookAt(this._look);
  }
}

// ── studio ──────────────────────────────────────────────────────────────────
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, g, c };
}

function buildStudio(stage) {
  const root = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o });
  // round stage with stripes, on a dark floor
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48), M(0x141026, { roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; root.add(floor);
  const disc = canvasTex(512, 512, (g, w) => {
    const cx = w / 2;
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#3a2a7a' : '#4f37a8'; g.beginPath(); g.moveTo(cx, cx); g.arc(cx, cx, cx, (i / 16) * Math.PI * 2, ((i + 1) / 16) * Math.PI * 2); g.fill(); }
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(cx, cx, cx * 0.18, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffd23f'; g.lineWidth = 10; g.beginPath(); g.arc(cx, cx, cx - 6, 0, Math.PI * 2); g.stroke();
  });
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.8, 0.4, 48), [M(0x2a1f5c), M(0xffffff, { map: disc.tex, roughness: 0.35, metalness: 0.1 }), M(0x2a1f5c)]);
  platform.position.y = 0.2; root.add(platform);
  // back wall: an animated light panel (stripes and stars), drawn on a small canvas each frame
  const wall = canvasTex(256, 128, () => {});
  const wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), new THREE.MeshBasicMaterial({ map: wall.tex }));
  wallMesh.position.set(0, 4.5, -7); root.add(wallMesh);
  // marquee arch with bulbs
  const arch = new THREE.Group(); root.add(arch);
  const beamM = M(0xe03a6f, { roughness: 0.4 });
  const postL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 0.6), beamM); postL.position.set(-7.5, 3.5, -5.5);
  const postR = postL.clone(); postR.position.x = 7.5;
  const top = new THREE.Mesh(new THREE.BoxGeometry(15.6, 0.8, 0.6), beamM); top.position.set(0, 7.2, -5.5);
  arch.add(postL, postR, top);
  const bulbs = [];
  const bulbGeo = new THREE.SphereGeometry(0.11, 8, 6);
  const addBulb = (x, y) => { const m = new THREE.MeshBasicMaterial({ color: 0xfff3b0 }); const b = new THREE.Mesh(bulbGeo, m); b.position.set(x, y, -5.18); arch.add(b); bulbs.push(b); };
  for (let i = 0; i <= 26; i++) addBulb(-7.5 + i * (15 / 26), 7.2);
  for (let i = 0; i < 12; i++) { addBulb(-7.5, 0.6 + i * 0.55); addBulb(7.5, 0.6 + i * 0.55); }
  // audience: rows of simple figures on both sides (instanced), bobbing when cheering
  const crowdGeo = new THREE.CapsuleGeometry(0.22, 0.5, 3, 6);
  const crowdN = stage.tier === 'low' ? 40 : 90;
  const crowd = new THREE.InstancedMesh(crowdGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), crowdN);
  const seats = [];
  const tmp = new THREE.Object3D(), col = new THREE.Color();
  for (let i = 0; i < crowdN; i++) {
    const side = i % 2 ? 1 : -1, row = Math.floor(i / 2) % 3, k = Math.floor(i / 6);
    const x = side * (9.5 + row * 1.3), z = -4 + k * (stage.tier === 'low' ? 1.7 : 0.75);
    seats.push({ x, y: 0.75 + row * 0.6, z, ph: Math.random() * 6 });
    col.setHSL(Math.random(), 0.5, 0.45); crowd.setColorAt(i, col);
  }
  root.add(crowd);
  // moving spotlights (cones of light drawn as additive transparent cones)
  const beams = [];
  const coneGeo = new THREE.ConeGeometry(1.6, 12, 20, 1, true).translate(0, -6, 0);
  [0xff4fa3, 0x4fc3ff, 0xffd23f, 0x7cff6b].forEach((c, i) => {
    const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const b = new THREE.Mesh(coneGeo, m);
    b.position.set(-6 + i * 4, 11, -3); root.add(b); beams.push({ b, ph: i * 1.7 });
  });
  let mood = 'idle', moodT = 0;
  return {
    root, crowd,
    setMood(m) { mood = m; moodT = 0; },
    update(dt, t, calm) {
      moodT += dt;
      // back wall pattern
      const g = wall.g, W = 256, H = 128;
      const hue = mood === 'good' ? 140 : mood === 'bad' ? 200 : 265;
      const grd = g.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, `hsl(${hue},70%,22%)`); grd.addColorStop(1, `hsl(${hue + 40},70%,32%)`);
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 12; i++) {
        const x = ((i * 40 + (calm ? 0 : t * 30)) % (W + 80)) - 40;
        g.fillStyle = `hsla(${hue + i * 12},90%,65%,0.25)`; g.fillRect(x, 0, 14, H);
      }
      g.fillStyle = 'rgba(255,240,180,0.85)';
      for (let i = 0; i < 18; i++) { const x = (i * 53) % W, y = (i * 29) % H, s = 1 + ((Math.sin(t * 3 + i) + 1) * (calm ? 0.3 : 1)); g.fillRect(x, y, s, s); }
      wall.tex.needsUpdate = true;
      bulbs.forEach((b, i) => b.material.color.setHex(((i + Math.floor(t * (mood === 'good' ? 10 : 4))) % 3 === 0) || calm ? 0xfff3b0 : 0x6b5a2a));
      beams.forEach(({ b, ph }) => { const s = calm ? 0.1 : 1; b.rotation.z = Math.sin(t * 0.7 + ph) * 0.45 * s; b.rotation.x = Math.cos(t * 0.5 + ph) * 0.25 * s; });
      const cheer = mood === 'good' && moodT < 2.5;
      seats.forEach((s, i) => { tmp.position.set(s.x, s.y + (cheer && !calm ? Math.abs(Math.sin(t * 9 + s.ph)) * 0.35 : 0), s.z); tmp.updateMatrix(); crowd.setMatrixAt(i, tmp.matrix); });
      crowd.instanceMatrix.needsUpdate = true;
    },
  };
}

// ── figures ─────────────────────────────────────────────────────────────────
const STAND = { hipY: 0.74, bend: 0.02, lean: 0, lHand: [0.2, 0.02, 0.06], rHand: [-0.2, 0.02, 0.06], lFoot: [0.13, 0.02], rFoot: [-0.13, 0.02] };

// the player's figure: it copies the player (lean, arms up, arms crossed, crouch, running)
export class Avatar {
  constructor(colors) {
    this.fig = new Figure({ ...colors, castShadow: false });
    this.cur = { ...STAND };
    this.runPh = 0;
    this.fig.set(this.cur);
  }
  // s: { lean -1..1, up: [left, right] 0..1, cross 0..1, crouch 0..1, run 0..1 (speed), mirror, fall 0..1 }
  update(dt, s) {
    this.runPh += dt * (6 + 8 * (s.run || 0));
    // facing the camera (mirror) the player's left is the figure's right; seen from behind it is its left
    const p = { ...STAND, lean: (s.mirror ? -0.32 : 0.32) * (s.lean || 0) };
    const upL = s.up?.[0] || 0, upR = s.up?.[1] || 0;
    // which figure hand is the player's left one
    const pl = s.mirror ? 'rHand' : 'lHand', pr = s.mirror ? 'lHand' : 'rHand';
    const side = (k) => (k === 'lHand' ? 1 : -1);
    const raise = (k, u) => { const sx = side(k); p[k] = p[k].map((v, i) => v + ([sx * 0.27, 0.98, 0.02][i] - v) * u); };
    raise(pl, upL); raise(pr, upR);
    if (s.cross) {
      const c = s.cross;
      p.lHand = p.lHand.map((v, i) => v + ([-0.1, 0.3, 0.24][i] - v) * c);
      p.rHand = p.rHand.map((v, i) => v + ([0.1, 0.32, 0.22][i] - v) * c);
    }
    if (s.run) {
      const a = Math.sin(this.runPh), k = s.run;
      p.hipY = 0.74 - 0.03 * k + Math.abs(Math.cos(this.runPh)) * 0.04 * k; p.bend = 0.18 * k;
      p.lFoot = [0.13, 0.32 * a * k]; p.rFoot = [-0.13, -0.32 * a * k];
      if (!upL && !upR && !s.cross) { p.lHand = [0.2, 0.18, 0.06 - 0.2 * a * k]; p.rHand = [-0.2, 0.18, 0.06 + 0.2 * a * k]; }
    }
    if (s.crouch) { const c = s.crouch; p.hipY -= 0.3 * c; p.bend += 0.45 * c; p.lFoot = [0.22, 0.05]; p.rFoot = [-0.22, 0.05]; }
    if (s.fall) { const f = s.fall; p.bend += 0.3 * f; p.lHand = [0.4, 0.9 * f, 0.1]; p.rHand = [-0.4, 0.9 * f, 0.1]; }
    // smooth (the camera already smooths; this keeps the figure from snapping)
    this.cur = mixPose(this.cur, p, 1 - Math.exp(-dt * 14));
    this.fig.set(this.cur);
  }
}

function makeHost() {
  const fig = new Figure({ jersey: '#ff7a59', pants: '#24325f', cap: '#ffd23f', skin: '#d9a47c', scale: 1.18, castShadow: false });
  // bow tie and a microphone (simple shapes)
  const tieM = new THREE.MeshStandardMaterial({ color: 0x24325f, roughness: 0.4 });
  const cone = new THREE.ConeGeometry(0.05, 0.09, 4).rotateZ(Math.PI / 2);
  const t1 = new THREE.Mesh(cone, tieM); t1.position.set(0.045, 0.38, 0.11);
  const t2 = new THREE.Mesh(cone, tieM); t2.rotation.z = Math.PI; t2.position.set(-0.045, 0.38, 0.11);
  fig.torso.add(t1, t2);
  const mic = new THREE.Group();
  mic.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.012, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0x222222 })));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.6, roughness: 0.3 }));
  head.position.y = 0.09; mic.add(head);
  fig.rHand.add(mic);
  const POSES = {
    idle: (t) => ({ ...STAND, lHand: [0.2, 0.02, 0.06], rHand: [-0.08, 0.36, 0.22], headYaw: Math.sin(t * 0.8) * 0.15, lean: Math.sin(t * 1.3) * 0.03 }),
    point: () => ({ ...STAND, lHand: [0.48, 0.38, 0.28], rHand: [-0.08, 0.36, 0.22], headYaw: 0.4 }),
    cheer: (t) => ({ ...STAND, hipY: 0.74 + Math.abs(Math.sin(t * 8)) * 0.05, lHand: [0.3, 0.95, 0.05], rHand: [-0.3, 0.95, 0.05] }),
    oops: () => ({ ...STAND, bend: 0.15, lHand: [0.08, 0.5, 0.22], rHand: [-0.08, 0.36, 0.22], headYaw: -0.2 }),
  };
  let mood = 'idle', until = 0, cur = { ...STAND };
  return {
    fig,
    say(m, secs = 1.8) { mood = m; until = secs; },
    update(dt, t) {
      until -= dt; if (until <= 0) mood = 'idle';
      cur = mixPose(cur, POSES[mood](t), 1 - Math.exp(-dt * 8));
      fig.set(cur);
    },
  };
}

// ── confetti and bubbles ────────────────────────────────────────────────────
class Effects {
  constructor(scene, tier) {
    const n = tier === 'low' ? 160 : 400;
    this.conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.07), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n);
    this.conf.frustumCulled = false;
    this.cp = Array.from({ length: n }, () => ({ life: 0 }));
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) { col.setHSL(Math.random(), 0.85, 0.6); this.conf.setColorAt(i, col); }
    const nb = tier === 'low' ? 60 : 140;
    this.bub = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.1 }), nb);
    this.bub.frustumCulled = false;
    this.bp = Array.from({ length: nb }, () => ({ life: 0 }));
    scene.add(this.conf, this.bub);
    this.tmp = new THREE.Object3D();
    this.hideAll();
  }
  hideAll() { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < this.cp.length; i++) this.conf.setMatrixAt(i, z); for (let i = 0; i < this.bp.length; i++) this.bub.setMatrixAt(i, z); }
  confetti(at, count = 120, spread = 2) {
    let k = 0;
    for (const p of this.cp) {
      if (p.life > 0) continue;
      Object.assign(p, { life: rand(1.6, 2.6), x: at[0] + rand(-0.3, 0.3), y: at[1], z: at[2] + rand(-0.3, 0.3), vx: rand(-spread, spread), vy: rand(3, 7), vz: rand(-spread, spread), r: rand(0, 6), vr: rand(-8, 8) });
      if (++k >= count) break;
    }
  }
  bubbles(at, count = 50, up = 3) {
    let k = 0;
    for (const p of this.bp) {
      if (p.life > 0) continue;
      Object.assign(p, { life: rand(1.2, 2.4), x: at[0] + rand(-0.8, 0.8), y: at[1], z: at[2] + rand(-0.8, 0.8), vx: rand(-1, 1), vy: rand(1, up), vz: rand(-1, 1), s: rand(0.08, 0.25) });
      if (++k >= count) break;
    }
  }
  update(dt) {
    const T = this.tmp;
    this.cp.forEach((p, i) => {
      if (p.life <= 0) return;
      p.life -= dt; p.vy -= 6 * dt; p.vx *= 0.98; p.vz *= 0.98; if (p.vy < -1.5) p.vy = -1.5;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.r += p.vr * dt;
      T.position.set(p.x, p.y, p.z); T.rotation.set(p.r, p.r * 0.7, 0); T.scale.setScalar(p.life > 0 ? 1 : 0); T.updateMatrix();
      this.conf.setMatrixAt(i, T.matrix);
    });
    this.bp.forEach((p, i) => {
      if (p.life <= 0) return;
      p.life -= dt; p.vy -= 2 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      T.position.set(p.x, p.y, p.z); T.rotation.set(0, 0, 0); T.scale.setScalar(p.life > 0 ? p.s * Math.min(p.life * 3, 1) : 0); T.updateMatrix();
      this.bub.setMatrixAt(i, T.matrix);
    });
    this.conf.instanceMatrix.needsUpdate = true; this.bub.instanceMatrix.needsUpdate = true;
  }
}
