// Pictures of the stage-two studio levels: 穿牆姿勢 (a wall with person-shaped holes), 平衡過橋
// (a narrow bridge over the bubble pool) and Boss 題 (the original monster 「咕嚕嚕」).
// Seen from behind the player, so the player's left is the screen's left (no mirroring needed).
import { THREE } from '../stage.js';
import { POSE_ORDER } from '../levels/wall.js';

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o });
const COLORS = ['#ff5a6e', '#3fa7ff', '#3ccf7a', '#e0a800'];
const PZ = 3.5; // where the player stands

function behind(stage, dt, x = 0) {
  stage.lookAt([x, 3.2, PZ + 6], [x * 0.5, 1.6, PZ - 6], 1 - Math.exp(-dt * 3));
}
function standPlayer(stage, x = 0, z = PZ) {
  const r = stage.player.fig.root;
  r.position.set(x, 0.4, z); r.rotation.set(0, Math.PI, 0);
  stage.host.fig.root.position.set(-5.4, 0.4, 0); stage.host.fig.root.rotation.y = 0.9;
}

// draw a pose silhouette (as a hole) on a canvas: x, y = feet centre, s = scale (px per metre)
function silhouette(g, pose, x, y, s) {
  const lean = pose === 'left' ? -0.35 : pose === 'right' ? 0.35 : 0;
  const crouch = pose === 'crouch' ? 0.45 : 0;
  const hip = { x, y: y - (0.8 - crouch * 0.6) * s };
  const sh = { x: hip.x + Math.sin(lean) * 0.5 * s, y: hip.y - Math.cos(lean) * 0.5 * s };
  const head = { x: sh.x + Math.sin(lean) * 0.22 * s, y: sh.y - Math.cos(lean) * 0.22 * s };
  g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 0.2 * s;
  const line = (...p) => { g.beginPath(); g.moveTo(p[0].x, p[0].y); for (const q of p.slice(1)) g.lineTo(q.x, q.y); g.stroke(); };
  // legs
  if (crouch) { line({ x: x - 0.25 * s, y }, { x: hip.x - 0.3 * s, y: hip.y + 0.15 * s }, hip); line({ x: x + 0.25 * s, y }, { x: hip.x + 0.3 * s, y: hip.y + 0.15 * s }, hip); }
  else { line({ x: x - 0.18 * s, y }, hip); line({ x: x + 0.18 * s, y }, hip); }
  line(hip, sh);
  // arms
  if (pose === 'up') { line(sh, { x: sh.x - 0.35 * s, y: sh.y - 0.55 * s }); line(sh, { x: sh.x + 0.35 * s, y: sh.y - 0.55 * s }); }
  else { line(sh, { x: sh.x - 0.28 * s + Math.sin(lean) * 0.2 * s, y: sh.y + 0.42 * s }); line(sh, { x: sh.x + 0.28 * s + Math.sin(lean) * 0.2 * s, y: sh.y + 0.42 * s }); }
  g.lineWidth = 0.1 * s;
  g.beginPath(); g.arc(head.x, head.y, 0.17 * s, 0, Math.PI * 2); g.fill(); g.stroke();
  // a little extra room so it reads as a hole a child fits through
  g.lineWidth = 0.32 * s; line(hip, sh);
}

export function wallView() {
  let root = null, wall, tex, cv, pool;
  const W = 9, H = 4.2;
  function build(stage) {
    root = new THREE.Group();
    cv = document.createElement('canvas'); cv.width = 1024; cv.height = 480;
    tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    wall = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.3), [M(0x8a5cf6), M(0x8a5cf6), M(0x8a5cf6), M(0x8a5cf6), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.6 })]);
    wall.position.set(0, H / 2 + 0.4, -6);
    pool = new THREE.Group();
    const p = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 2.4), M(0x6fd3ff, { emissive: 0x114466 })); pool.add(p);
    for (let k = 0; k < 40; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), M(['#ffffff', '#bfe9ff', '#ffc2e2'][k % 3], { roughness: 0.2 })); b.position.set((Math.random() - 0.5) * 5.6, 0.25, (Math.random() - 0.5) * 2); pool.add(b); }
    pool.position.set(0, 0.25, PZ + 2.6);
    root.add(wall, pool);
    stage.scene.add(root);
  }
  function paint(lv) {
    const g = cv.getContext('2d'), w = cv.width, h = cv.height, n = lv.poses.length;
    g.globalCompositeOperation = 'source-over';
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#a77bff'); grd.addColorStop(1, '#6a3fd6');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 12; i++) g.fillRect(0, i * 40, w, 3);
    const cell = w / n;
    lv.poses.forEach((pose, i) => {
      const cx = cell * (i + 0.5);
      g.fillStyle = COLORS[i]; g.fillRect(cx - cell * 0.42, 6, cell * 0.84, 54);
      g.fillStyle = '#fff'; g.font = 'bold 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String.fromCharCode(65 + i), cx, 34);
      g.globalCompositeOperation = 'destination-out';
      g.strokeStyle = g.fillStyle = '#000';
      silhouette(g, pose, cx, h - 8, 200);
      g.globalCompositeOperation = 'source-over';
    });
    tex.needsUpdate = true;
  }
  let painted = null, bumped = false;
  return {
    id: 'wall',
    show(stage) { if (!root) build(stage); root.visible = true; standPlayer(stage); },
    hide() { if (root) root.visible = false; },
    onStep(stage, lv) { paint(lv); painted = lv.step; bumped = false; },
    anchors() { return null; },
    update(dt, stage, lv, inp) {
      if (lv.step && painted !== lv.step) { paint(lv); painted = lv.step; }
      let z = -6, px = 0, pz = PZ, fall = 0;
      if (lv.phase === 'answer') z = PZ - 0.6 - lv.wallZ * 10;
      else if (lv.phase === 'reveal') {
        const d = lv.decision;
        if (d.correct) { z = PZ - 0.6 + lv.t * 6; if (lv.t < 0.1) stage.fx.confetti([0, 3, PZ - 1], 120, 2.5); }
        else {
          // the wall stops at the player and gives a soft push back into the bubbles
          z = PZ - 0.6; pz = PZ + Math.min(lv.t * 2.5, 1.4); fall = Math.min(lv.t * 2, 1);
          if (!bumped && lv.t > 0.4) { bumped = true; stage.fx.bubbles([0, 0.5, PZ + 2.6], 60, 4); }
        }
        // the hole the player went for lines up with the player
        const k = d.correct ? d.choice : -1;
        if (k >= 0) px = (k + 0.5 - lv.poses.length / 2) * (W / lv.poses.length) * -1;
      }
      wall.position.set(px, H / 2 + 0.4, z);
      wall.visible = lv.phase !== 'intro' && z < PZ + 0.8; // gone once the player is through
      stage.player.fig.root.position.set(0, 0.4 - fall * 0.5, pz);
      const pose = lv.phase === 'answer' ? lv.pose : null;
      stage.player.update(dt, { mirror: false, lean: inp.lean, up: pose === 'up' ? [1, 1] : [0, 0], crouch: pose === 'crouch' ? 1 : 0, fall });
      behind(stage, dt);
    },
  };
}

export function bridgeView() {
  let root = null, beam;
  const Z0 = PZ + 1, Z1 = -9;
  function build(stage) {
    root = new THREE.Group();
    const pool = new THREE.Mesh(new THREE.BoxGeometry(7, 0.4, 16), M(0x6fd3ff, { emissive: 0x114466 }));
    pool.position.set(0, -0.6, (Z0 + Z1) / 2); root.add(pool);
    for (let k = 0; k < 90; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), M(['#ffffff', '#bfe9ff', '#ffc2e2', '#fff3b0'][k % 4], { roughness: 0.2 })); b.position.set((Math.random() - 0.5) * 6.6, -0.3, Z1 + Math.random() * (Z0 - Z1)); root.add(b); }
    beam = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, Z0 - Z1), M(0xd9a066));
    beam.position.set(0, 1.0, (Z0 + Z1) / 2); root.add(beam);
    for (let z = Z1; z <= Z0; z += 3) for (const x of [-0.5, 0.5]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2), M(0xffd23f)); post.position.set(x, 1.5, z); root.add(post); }
    const goal = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 2), M(0x3ccf7a)); goal.position.set(0, 1.0, Z1 - 1); root.add(goal);
    stage.scene.add(root);
  }
  let fellAt = -1;
  return {
    id: 'bridge',
    show(stage) { if (!root) build(stage); root.visible = true; stage.studio.root.visible = false; stage.host.fig.root.visible = false; stage.scene.background = new THREE.Color(0x2b1a5c); standPlayer(stage); },
    hide(stage) { if (root) root.visible = false; stage.studio.root.visible = true; stage.host.fig.root.visible = true; stage.scene.background = null; },
    onStep() { fellAt = -1; },
    anchors() { return null; },
    update(dt, stage, lv, inp) {
      const p = lv.phase === 'answer' ? Math.min(lv.t / lv.window, 1) : lv.phase === 'reveal' ? 1 : 0;
      const z = Z0 - 0.8 - p * (Z0 - Z1 - 1.5);
      const fig = stage.player.fig.root;
      let y = 1.1, tilt = (lv.theta || 0) * 0.45;
      if (lv.fallT > 0) {
        const f = 1 - lv.fallT / 1.8;
        y = 1.1 - Math.min(f * 4, 1.6); tilt = Math.sign(lv.theta || 1) * 1.2;
        if (fellAt !== lv.falls) { fellAt = lv.falls; stage.fx.bubbles([Math.sign(lv.theta || 1) * 0.8, -0.2, z], 60, 4); }
      }
      fig.position.set(Math.sin(tilt) * 0.4, y, z); fig.rotation.set(0, Math.PI, -tilt * 0.6);
      const walking = lv.phase === 'answer' && !(lv.fallT > 0);
      const ans = lv.answer ?? (lv.phase === 'reveal' ? lv.decision?.choice : null);
      stage.player.update(dt, { mirror: false, lean: inp.lean, run: walking ? 0.25 : 0, up: ans === 0 ? [1, 0] : ans === 1 ? [0, 1] : [0, 0] });
      stage.lookAt([0, 3.4, z + 5.5], [0, 1.2, z - 5], 1 - Math.exp(-dt * 3));
    },
  };
}

export function bossView() {
  let root = null, boss, eyes = [], shot = null, shotT = 0, shotKind = null, hp = null;
  function build(stage) {
    root = new THREE.Group();
    boss = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 24), M(0x7d3cff, { emissive: 0x220055, roughness: 0.35 }));
    body.scale.set(1, 1.1, 0.9); boss.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1.0, 24, 16), M(0xc7a6ff, { roughness: 0.5 }));
    belly.position.set(0, -0.35, 0.75); belly.scale.set(1, 0.9, 0.4); boss.add(belly);
    for (const x of [-0.5, 0.5]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), M(0xffffff)); e.position.set(x, 0.5, 1.15);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), M(0x111111)); pupil.position.set(0, 0, 0.25); e.add(pupil);
      boss.add(e); eyes.push(e);
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 12), M(0xffd23f)); horn.position.set(x * 1.6, 1.45, 0); horn.rotation.z = -x * 0.7; boss.add(horn);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.07, 8, 20, Math.PI), M(0x2a0a40)); mouth.position.set(0, 0.05, 1.3); mouth.rotation.z = Math.PI; boss.add(mouth);
    // the question-mark antenna
    const q = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 8, 20, Math.PI * 1.4), M(0xff5a6e, { emissive: 0x440010 })); q.position.set(0, 2.2, 0); q.rotation.z = -0.6; boss.add(q);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M(0xff5a6e, { emissive: 0x440010 })); dot.position.set(0, 1.55, 0); boss.add(dot);
    boss.position.set(2.6, 2.1, -0.5);
    shot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 0), M(0xffd23f, { emissive: 0x886600 })); shot.visible = false;
    root.add(boss, shot);
    stage.scene.add(root);
  }
  return {
    id: 'boss',
    show(stage) {
      if (!root) build(stage); root.visible = true;
      boss.scale.setScalar(1); boss.rotation.set(0, 0, 0); boss.visible = true;
      stage.player.fig.root.position.set(-2.2, 0.4, 1.6); stage.player.fig.root.rotation.set(0, 0.5, 0);
      stage.host.fig.root.position.set(-5.6, 0.4, -0.5); stage.host.fig.root.rotation.y = 0.9;
      stage.studio.setMood('bad'); hp = null;
    },
    hide() { if (root) root.visible = false; },
    onStep() {},
    anchors() { return null; },
    // called by the page for 'hit' / 'bossAttack' events
    fire(kind) { shotKind = kind; shotT = 0; shot.visible = true; shot.material.color.set(kind === 'hit' ? 0xffd23f : 0x8fe3ff); },
    update(dt, stage, lv, inp) {
      const t = stage.time;
      if (lv.down) {
        const k = Math.min((lv.phase === 'reveal' ? lv.t : 3) / 1.5, 1);
        boss.scale.setScalar(Math.max(1 - k, 0.001)); boss.rotation.y += dt * 12;
        if (k >= 1) boss.visible = false;
      } else {
        const charge = lv.phase === 'answer' ? Math.min(lv.t / lv.window, 1) : 0;
        boss.position.y = 2.1 + Math.sin(t * 2) * 0.12;
        boss.children[0].material.emissiveIntensity = 1 + charge * 4 * (0.6 + 0.4 * Math.sin(t * 12));
        const s = 1 + charge * 0.12; boss.scale.set(s, s, s);
        for (const e of eyes) e.children[0].position.x = Math.sin(t * 1.3) * 0.08;
      }
      if (shot.visible) {
        shotT += dt;
        const k = Math.min(shotT / 0.45, 1);
        const a = new THREE.Vector3(-2.2, 1.6, 1.6), b = boss.position.clone();
        const [from, to] = shotKind === 'hit' ? [a, b] : [b, a];
        shot.position.lerpVectors(from, to, k); shot.position.y += Math.sin(k * Math.PI) * 1.2; shot.rotation.x += dt * 10;
        if (k >= 1) {
          shot.visible = false;
          if (shotKind === 'hit') { stage.fx.confetti([b.x, b.y, b.z], 90, 2); boss.scale.multiplyScalar(0.85); }
          else stage.fx.bubbles([-2.2, 0.8, 1.6], 60, 4);
        }
      }
      const correct = lv.phase === 'reveal' && lv.decision?.correct;
      stage.player.update(dt, correct && lv.t < 0.6 ? { mirror: true, up: [0, 1] } : { mirror: true, lean: inp.lean, up: [inp.upL || 0, inp.upR || 0] });
      stage.lookAt([0.2, 2.8, 9.5], [0.2, 1.8, 0], 1 - Math.exp(-dt * 3));
    },
  };
}
export { POSE_ORDER };
