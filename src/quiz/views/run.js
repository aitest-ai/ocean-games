// Picture of 左右岔路: a running track out of the studio toward paper doors; trapdoors over bubble
// pools in front of every door (so the layout never gives the answer away).
import { THREE } from '../stage.js';
import { DOOR_Z, laneX } from '../levels/run.js';

const DOOR_COLORS = [0xff5a6e, 0x3fa7ff, 0x3ccf7a];
// the camera looks down +z, so the screen's left is world +x: lane positions are flipped here
const wx = (n) => laneX(n).map((x) => -x);
export function runView() {
  let root = null, doors = [], traps = [], lanesN = 0, broke = -1, fell = false;
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  function build(stage) {
    root = new THREE.Group();
    root.position.set(0, 0, 12); // the track starts just in front of the studio stage
    const track = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, DOOR_Z + 14), M(0xd9653b));
    track.position.set(0, 0.05, (DOOR_Z + 14) / 2 - 4); root.add(track);
    for (const x of [-3.5, 3.5]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, DOOR_Z + 14), M(0xffffff)); rail.position.set(x, 0.3, (DOOR_Z + 14) / 2 - 4); root.add(rail); }
    // stripes every few metres (they show the speed)
    for (let z = 0; z < DOOR_Z; z += 3) { const s = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.02, 0.3), M(0xffe9c2)); s.position.set(0, 0.21, z); root.add(s); }
    // flags and balloons along the sides
    for (let z = 2; z < DOOR_Z + 8; z += 5) for (const x of [-4.6, 4.6]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3), M(0xdddddd)); pole.position.set(x, 1.5, z); root.add(pole);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), M(new THREE.Color().setHSL((z * 0.07) % 1, 0.8, 0.6), { roughness: 0.3 })); b.position.set(x, 3.2, z); b.scale.y = 1.2; root.add(b);
    }
    stage.scene.add(root);
  }
  function setDoors(n) {
    for (const d of doors) root.remove(d.g);
    for (const t of traps) root.remove(t.g);
    doors = []; traps = [];
    lanesN = n;
    const xs = wx(n), w = n === 3 ? 1.8 : 2.4;
    xs.forEach((x, i) => {
      const g = new THREE.Group(); g.position.set(x, 0.2, DOOR_Z);
      const frameM = M(0xffd23f, { roughness: 0.4 });
      const postL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.3), frameM); postL.position.set(-w / 2, 1.5, 0);
      const postR = postL.clone(); postR.position.x = w / 2;
      const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.25, 0.3), frameM); top.position.y = 3;
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, 2.85), M(DOOR_COLORS[i], { side: THREE.DoubleSide, roughness: 0.9, transparent: true }));
      paper.position.y = 1.45;
      g.add(postL, postR, top, paper);
      root.add(g);
      doors.push({ g, paper });
      // a trapdoor and a bubble pool just before each door
      const tg = new THREE.Group(); tg.position.set(x, 0.21, DOOR_Z - 2.2);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 2.2), M(0xb04d2c)); lid.position.set(w / 2, 0, 0);
      const hinge = new THREE.Group(); hinge.position.x = -w / 2; hinge.add(lid); tg.add(hinge);
      const pool = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 2.2), M(0x6fd3ff, { emissive: 0x114466 })); pool.position.y = -1.2; tg.add(pool);
      for (let k = 0; k < 14; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), M([0xffffff, 0xbfe9ff, 0xffc2e2][k % 3], { roughness: 0.2 })); b.position.set((Math.random() - 0.5) * (w - 0.4), -1.05, (Math.random() - 0.5) * 1.8); tg.add(b); }
      root.add(tg);
      traps.push({ g: tg, hinge });
    });
  }
  return {
    id: 'run',
    show(stage) { if (!root) build(stage); root.visible = true; stage.studio.root.visible = false; stage.host.fig.root.visible = false; stage.scene.background = new THREE.Color(0x7ec8ff); },
    hide(stage) { if (root) root.visible = false; stage.studio.root.visible = true; stage.host.fig.root.visible = true; stage.scene.background = null; },
    onStep(stage, lv) { setDoors(lv.step.options.length); broke = -1; fell = false; },
    // option cards sit on the doors
    // option cards sit in a left / middle / right row at the bottom, in the doors' colours (cards on
    // the far doors were too small to read on a projector)
    anchors() { return null; },
    update(dt, stage, lv, inp) {
      const rz = root.position.z;
      if (!lv?.step || lanesN === 0) {
        // level intro: the runner warms up at the start line
        stage.player.fig.root.position.set(0, 0.2, rz);
        stage.player.update(dt, { run: 0.2, mirror: false });
        stage.lookAt([0, 3.4, rz - 6.5], [0, 1.4, rz + 6], 1);
        return;
      }
      const answering = lv.phase === 'answer', rev = lv.phase === 'reveal' ? lv.decision : null;
      const z = rz + lv.z, x = -lv.x;
      let y = 0.2, fall = 0;
      if (rev && !rev.correct) {
        // trapdoor opens under the chosen (or middle) lane: slide down into the bubbles
        const lane = rev.choice ?? (lanesN === 3 ? 1 : 0);
        const tr = traps[lane];
        const t = Math.min(lv.t / 0.4, 1);
        if (tr) tr.hinge.rotation.z = -1.4 * t;
        if (lv.t > 0.25) { y = 0.2 - Math.min((lv.t - 0.25) * 4, 1.3); fall = Math.min((lv.t - 0.25) * 3, 1); }
        if (!fell && lv.t > 0.45) { fell = true; stage.fx.bubbles([wx(lanesN)[lane], -0.4, rz + DOOR_Z - 2.2], 60, 5); }
      } else if (rev && rev.correct && broke < 0) {
        broke = rev.choice;
        doors[broke].paper.material.opacity = 0;
        stage.fx.confetti([wx(lanesN)[broke], 2.2, rz + DOOR_Z + 0.4], 140, 2.5);
      }
      const avZ = rev && !rev.correct ? Math.min(z, rz + DOOR_Z - 2.2) : z;
      stage.player.fig.root.position.set(x, y, avZ);
      stage.player.fig.root.rotation.y = 0;
      stage.player.update(dt, { lean: answering ? inp.lean : 0, run: answering ? (lv.dash ? 1 : 0.6) : rev?.correct ? 0.4 : 0, fall, up: rev?.correct && lv.t > 0.6 ? [1, 1] : [0, 0], mirror: false });
      // chase camera behind the runner
      // (after a right answer the runner bursts through the door; the camera stops short of it)
      const camZ = Math.min(avZ - 6.5, rz + DOOR_Z - 7.5);
      stage.lookAt([x * 0.4, 3.4, camZ], [x * 0.3, 1.4, camZ + 12.5], 1 - Math.exp(-dt * 4));
    },
  };
}
