// Pictures of the stage-two track levels: 閃避障礙搶分 (hurdles, bars, swinging cushions, then two
// answer gates) and 原地衝刺 (a race against the robot 「閃電喀喀」). Seen from behind the runner:
// the camera looks down +z, so the screen's left is world +x (positions are flipped with -x).
import { THREE, Avatar } from '../stage.js';

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
const OFF = 60; // these tracks are built away from the studio and the first track

function trackGroup(len, width, color = 0xd9653b) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.BoxGeometry(width, 0.3, len + 20), M(color)); t.position.set(0, 0.05, len / 2); g.add(t);
  for (let z = 0; z < len + 8; z += 4) { const s = new THREE.Mesh(new THREE.BoxGeometry(width - 0.4, 0.02, 0.25), M(0xffe9c2)); s.position.set(0, 0.21, z); g.add(s); }
  for (const x of [-width / 2, width / 2]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, len + 20), M(0xffffff)); rail.position.set(x, 0.3, len / 2); g.add(rail); }
  for (let z = 4; z < len + 8; z += 8) for (const x of [-width / 2 - 1.2, width / 2 + 1.2]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3), M(0xdddddd)); pole.position.set(x, 1.5, z); g.add(pole);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), M(new THREE.Color().setHSL((z * 0.05) % 1, 0.8, 0.6), { roughness: 0.3 })); b.position.set(x, 3.2, z); b.scale.y = 1.2; g.add(b);
  }
  return g;
}

export function dodgeView() {
  let root = null, obs = [], gates = [], lastStep = null, hop = 0;
  const L = 36, SPEED_Z = (lv) => L / lv.window;
  function build(stage) { root = trackGroup(L + 6, 6); root.position.set(OFF, 0, 0); stage.scene.add(root); }
  function setStep(lv) {
    for (const o of obs) root.remove(o.mesh); for (const g of gates) root.remove(g);
    obs = lv.obstacles.map((o) => {
      const z = SPEED_Z(lv) * o.at;
      const g = new THREE.Group(); g.position.z = z;
      if (o.kind === 'hurdle') { const b = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.18, 0.15), M(0xff5a6e)); b.position.y = 0.55; g.add(b); for (const x of [-2.7, 2.7]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), M(0xffffff)); p.position.set(x, 0.35, 0); g.add(p); } }
      if (o.kind === 'bar') { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.8).rotateZ(Math.PI / 2), M(0xffd23f)); b.position.y = 1.35; g.add(b); for (const x of [-2.9, 2.9]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.5, 0.15), M(0xffffff)); p.position.set(x, 0.75, 0); g.add(p); } }
      if (o.kind === 'hoop') { const r = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.1, 10, 30), M(0x3ccf7a, { emissive: 0x0a3a1a })); r.position.y = 2.4; g.add(r); }
      if (o.kind === 'swing') { const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.8, 4, 10), M(0xff9fd0, { roughness: 0.9 })); c.position.set(o.side === 'left' ? 1.4 : -1.4, 1.2, 0); g.add(c); g.userData.cushion = c; }
      root.add(g);
      return { def: o, mesh: g };
    });
    const colors = [0xff5a6e, 0x3fa7ff];
    gates = [1.4, -1.4].map((x, i) => { // screen-left (A) is world +x
      const g = new THREE.Group(); g.position.set(x, 0, L + 1);
      for (const dx of [-1.1, 1.1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3), M(colors[i])); p.position.set(dx, 1.5, 0); g.add(p); }
      const top = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.14, 8, 20, Math.PI), M(colors[i], { emissive: colors[i], emissiveIntensity: 0.3 })); top.position.y = 3; g.add(top);
      root.add(g); return g;
    });
  }
  return {
    id: 'dodge',
    show(stage) { if (!root) build(stage); root.visible = true; stage.studio.root.visible = false; stage.host.fig.root.visible = false; stage.scene.background = new THREE.Color(0x7ec8ff); },
    hide(stage) { if (root) root.visible = false; stage.studio.root.visible = true; stage.host.fig.root.visible = true; stage.scene.background = null; },
    onStep(stage, lv) { setStep(lv); lastStep = lv.step; },
    anchors() { return null; },
    jump() { hop = 0.45; },
    update(dt, stage, lv, inp) {
      if (lv.step && lastStep !== lv.step && lv.obstacles) { setStep(lv); lastStep = lv.step; }
      let z = 0, x = 0, fall = 0;
      if (lv.phase === 'answer' || lv.phase === 'reveal') {
        z = lv.phase === 'answer' ? Math.min(lv.t / lv.window, 1) * L : L + Math.min(lv.t * 4, 3);
        x = -(inp.lean || 0) * 1.4;
        if (lv.phase === 'reveal') { x = lv.decision.choice === 0 ? 1.4 : lv.decision.choice === 1 ? -1.4 : 0; if (!lv.decision.correct) fall = Math.min(lv.t * 2, 1); }
        for (const o of obs) {
          const c = o.mesh.userData.cushion;
          if (c) c.position.x = (o.def.side === 'left' ? 1 : -1) * (1.4 - Math.max(0, 1 - Math.abs(lv.t - o.def.at)) * 1.2);
          o.mesh.visible = !(o.def.ok && lv.t > o.def.at + 0.4); // dodged obstacles pop away
        }
      }
      hop = Math.max(hop - dt, 0);
      const y = 0.2 + Math.sin(Math.min(hop / 0.45, 1) * Math.PI) * 0.6 - fall * 0.4;
      const fig = stage.player.fig.root;
      fig.position.set(OFF + x, y, z); fig.rotation.set(0, 0, lv.stumble > 0 ? Math.sin(stage.time * 30) * 0.1 : 0);
      stage.player.update(dt, { mirror: false, lean: inp.lean, run: lv.phase === 'answer' ? 0.7 : 0.2, crouch: inp.crouching ? 1 : 0, up: inp.armsUp >= 1 ? [1, 1] : [0, 0], fall });
      stage.lookAt([OFF + x * 0.4, 3.4, z - 6.5], [OFF + x * 0.3, 1.4, z + 6], 1 - Math.exp(-dt * 4));
    },
  };
}

export function sprintView() {
  let root = null, rival = null;
  const L = 400, X = 2 * OFF;
  function build(stage) {
    root = trackGroup(L, 6, 0x3a7bd5);
    root.position.set(X, 0, 0);
    for (let z = 10; z < L; z += 10) { const m = new THREE.Mesh(new THREE.BoxGeometry(6, 0.03, 0.15), M(0xffffff)); m.position.set(0, 0.22, z); root.add(m); }
    stage.scene.add(root);
    rival = new Avatar({ jersey: '#b0bec5', pants: '#546e7a', cap: '#ffeb3b', skin: '#cfd8dc' });
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2), M(0x333333)); antenna.position.y = 0.2; rival.fig.headG.add(antenna);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M(0xff3b3b, { emissive: 0xff0000 })); tip.position.y = 0.31; rival.fig.headG.add(tip);
    stage.scene.add(rival.fig.root);
  }
  return {
    id: 'sprint',
    show(stage) { if (!root) build(stage); root.visible = true; rival.fig.root.visible = true; stage.studio.root.visible = false; stage.host.fig.root.visible = false; stage.scene.background = new THREE.Color(0xffc68a); },
    hide(stage) { if (root) { root.visible = false; rival.fig.root.visible = false; } stage.studio.root.visible = true; stage.host.fig.root.visible = true; stage.scene.background = null; },
    onStep() {}, anchors() { return null; },
    update(dt, stage, lv, inp) {
      const d = (lv.dist || 0) % L, r = (lv.rival || 0) - (lv.dist || 0) + d;
      const fig = stage.player.fig.root;
      fig.position.set(X + 1.3, 0.2, d); fig.rotation.set(0, 0, 0); // player in the left lane (world +x)
      rival.fig.root.position.set(X - 1.3, 0.2, Math.min(Math.max(r, d - 30), d + 30));
      const run = Math.min((lv.v || 0) / 6, 1);
      stage.player.update(dt, { mirror: false, lean: inp.lean, run, up: [0, 0] });
      rival.update(dt, { mirror: false, run: lv.phase === 'intro' ? 0 : 0.7 });
      stage.lookAt([X + 0.6, 3.2, d - 7], [X, 1.2, d + 6], 1 - Math.exp(-dt * 4));
    },
  };
}
