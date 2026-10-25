// Pictures of the studio levels: ○× 大舞台 (giant ○ and × signs) and 倒數搶答 (a buzzer podium).
// The player's figure faces the camera and mirrors the player (raise your left hand → the figure
// raises the hand on the left of the screen).
import { THREE } from '../stage.js';

const FRONT = { pos: [0, 2.7, 9.2], look: [0, 1.7, 0] };
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, ...o });

function placeCommon(stage) {
  stage.host.fig.root.position.set(-5.2, 0.4, 1.2);
  stage.host.fig.root.rotation.y = 0.7;
  stage.player.fig.root.position.set(0, 0.4, 1.4);
  stage.player.fig.root.rotation.y = 0;
}
// what the figure copies from the player
const mirrorOf = (inp, extra = {}) => ({
  lean: inp.lean, mirror: true, crouch: inp.crouching ? 1 : 0, cross: inp.cross ? 1 : 0,
  up: [inp.armsUp >= 1 ? 1 : inp.upL || 0, inp.armsUp >= 1 ? 1 : inp.upR || 0], ...extra,
});

export function tfView() {
  let root = null, O, X;
  function build(stage) {
    root = new THREE.Group();
    O = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.24, 14, 40), M(0x3fa7ff, { emissive: 0x0b2a55 }));
    O.position.set(-2.9, 3.1, -0.6);
    X = new THREE.Group();
    const bar = new THREE.BoxGeometry(2.6, 0.45, 0.45);
    const xm = M(0xff5a6e, { emissive: 0x4a0b16 });
    const b1 = new THREE.Mesh(bar, xm); b1.rotation.z = Math.PI / 4;
    const b2 = new THREE.Mesh(bar, xm); b2.rotation.z = -Math.PI / 4;
    X.add(b1, b2); X.position.set(2.9, 3.1, -0.6);
    root.add(O, X);
    stage.scene.add(root);
  }
  const glow = (m, k) => { m.material ? m.material.emissiveIntensity = k : m.children.forEach((c) => (c.material.emissiveIntensity = k)); };
  return {
    id: 'tf',
    show(stage) { if (!root) build(stage); root.visible = true; placeCommon(stage); },
    hide() { if (root) root.visible = false; },
    onStep() {},
    anchors(stage) { return [stage.project([-2.9, 1.6, -0.6]), stage.project([2.9, 1.6, -0.6])]; },
    update(dt, stage, lv, inp) {
      const t = stage.time;
      const pose = lv.phase === 'answer' ? (lv.locked ?? lv.pose) : lv.decision?.choice;
      let o = pose === true ? 2.5 : 0.6, x = pose === false ? 2.5 : 0.6;
      if (lv.phase === 'reveal') {
        const right = lv.step.correct;
        if (right) o = 2 + Math.sin(t * 14) * 1.5; else x = 2 + Math.sin(t * 14) * 1.5;
      }
      glow(O, o); glow(X, x);
      O.rotation.y = Math.sin(t * 0.8) * 0.25; X.rotation.y = -Math.sin(t * 0.8) * 0.25;
      const shake = lv.phase === 'reveal' && !lv.decision.correct && lv.t < 1 ? Math.sin(t * 40) * 0.05 : 0;
      stage.player.fig.root.position.x = shake;
      stage.player.update(dt, lv.phase === 'reveal' && lv.decision.correct && lv.t > 0.3 ? { mirror: true, up: [1, 1] } : mirrorOf(inp));
      stage.lookAt(FRONT.pos, FRONT.look, 1 - Math.exp(-dt * 3));
    },
  };
}

export function buzzView() {
  let root = null, button, light;
  function build(stage) {
    root = new THREE.Group();
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.7, 24), M(0x2a1f5c, { metalness: 0.3 }));
    pod.position.set(1.15, 0.75, 1.9);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.06, 8, 24), M(0xffd23f, { emissive: 0x553c00 }));
    rim.rotation.x = Math.PI / 2; rim.position.set(1.15, 1.1, 1.9);
    button = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.37, 0.2, 24), M(0xff3b3b, { emissive: 0x330000 }));
    button.position.set(1.15, 1.2, 1.9);
    light = new THREE.PointLight(0xff4040, 0, 6); light.position.set(1.15, 2, 2.3);
    root.add(pod, rim, button, light);
    stage.scene.add(root);
  }
  return {
    id: 'buzz',
    show(stage) { if (!root) build(stage); root.visible = true; placeCommon(stage); stage.player.fig.root.position.set(-0.5, 0.4, 1.2); },
    hide() { if (root) root.visible = false; },
    onStep() {},
    anchors() { return null; }, // options sit in a row at the bottom of the screen
    update(dt, stage, lv, inp) {
      const buzzed = lv.phase === 'answer' && lv.stage === 'choose' || lv.phase === 'reveal' && lv.buzzAt !== null;
      const pressed = buzzed && (lv.chooseT ?? 0) < 0.4 && lv.phase === 'answer';
      button.position.y = pressed ? 1.14 : 1.2;
      button.material.emissiveIntensity = buzzed ? 3 + Math.sin(stage.time * 12) : 0.5;
      light.intensity = buzzed ? 6 : 0;
      stage.player.update(dt, lv.phase === 'reveal' && lv.decision.correct && lv.t > 0.3 ? { mirror: true, up: [1, 1] } : mirrorOf(inp));
      stage.lookAt(FRONT.pos, FRONT.look, 1 - Math.exp(-dt * 3));
    },
  };
}

// between levels and on the menu: the host in the middle of the stage, the camera slowly circling
export function idleView() {
  return {
    id: 'idle',
    show(stage) { placeCommon(stage); stage.host.fig.root.position.set(-1.6, 0.4, 1); stage.host.fig.root.rotation.y = 0.3; stage.player.fig.root.position.set(1.4, 0.4, 1.2); },
    hide() {},
    onStep() {}, anchors() { return null; },
    update(dt, stage) {
      const a = Math.sin(stage.time * 0.15) * 0.35;
      stage.player.update(dt, { mirror: true });
      stage.lookAt([Math.sin(a) * 10, 3, Math.cos(a) * 10], [0, 1.8, 0], 1 - Math.exp(-dt * 2));
    },
  };
}
