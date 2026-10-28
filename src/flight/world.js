// 飛行系列的 3D 世界：three.js 繪圖器、天空與時段（沿用陸地系列 src/land/ 的 Sky 與 TIMES）、
// 地面與海、飛機（駕駛艙掛在飛機底下）、駕駛員視角。
//
// 為什麼分兩次畫：外面的世界很大（幾十公里），駕駛艙很近（幾公分）。同一個鏡頭的深度緩衝分不清楚，
// 所以先用「遠景鏡頭」（0.5 m ~ 40 km）畫世界，清掉深度，再用「近景鏡頭」（1.5 cm ~ 60 m）畫駕駛艙。
// 介面跟陸地系列的 LandWorld 一樣（scale、resize()、frame(dt)、project(p)、setTime()），可以直接給遊戲外殼用。
import * as THREE from '../land/three.js';
import { TIMES } from '../land/ballpark.js';
import { buildCockpit } from './cockpit.js';
import { COCKPIT_TIERS } from './materials.js';
import { createFlightState } from './state.js';
import { HeadLook } from './look.js';
import { lightPoints } from './lights.js';
import { fbmField, rng } from './tex.js';
import { landMap, fieldTile, groundMaterial } from './terrain.js';

export const LAYER_WORLD = 0, LAYER_COCKPIT = 1;
const D = Math.PI / 180;

export class FlightWorld {
  constructor(cv, { tier = 'mid', time = 'day', spec, scenery = null } = {}) {
    // 平板的 GPU 多半是 tile-based，MSAA 幾乎不花額外頻寬，所以三種畫質都開反鋸齒（錶面的細刻度需要）
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.autoClear = false;
    this.renderer = renderer;
    this.gl = renderer.getContext();
    this.tier = tier;
    this.T = COCKPIT_TIERS[tier] || COCKPIT_TIERS.mid;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 1, 40000);
    this.camera.layers.enableAll();
    this.scale = 1; this.time = 0; this.onFrame = null;
    this.fs = createFlightState(); // 飛行狀態物件（不叫 state：遊戲外殼用 game.state 表示畫面狀態）

    // 飛機（世界座標：x = 東、y = 上、-z = 北）
    this.aircraft = new THREE.Group(); this.aircraft.name = 'aircraft';
    this.scene.add(this.aircraft);
    this.cockpit = buildCockpit(spec, { tier });
    this.aircraft.add(this.cockpit.root);
    this.cockpit.root.traverse((o) => o.layers.set(LAYER_COCKPIT));
    this.look = new HeadLook(cv);

    this.buildSky();
    this.scenery = scenery ? scenery(this) : basicScenery(this);
    this.setTime(time);
  }

  buildSky() {
    const S = this.scene;
    this.sky = new THREE.Sky(); this.sky.scale.setScalar(30000); this.sky.material.fog = false; S.add(this.sky);
    const R = rng(3), n = 1200, pos = [], col = [];
    for (let i = 0; i < n; i++) {
      const th = R() * Math.PI * 2, ph = Math.acos(1 - (R() * 0.9 + 0.08)), b = 0.25 + Math.pow(R(), 3) * 0.9, w = R();
      pos.push(...[Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)].map((v) => v * 20000));
      col.push(b * (0.85 + w * 0.15), b * 0.92, b * (1.1 - w * 0.2));
    }
    this.stars = lightPoints(pos, col, { px: 2.2, intensity: 0, fog: false });
    S.add(this.stars);
    // 著陸燈（從機翼照向前下方，夜間才開；只照外面的世界）
    this.landingLight = new THREE.SpotLight(0xfff2dc, 0, 450, 0.32, 0.55, 0);
    this.landingLight.position.set(0, 1.3, -0.6);
    this.landingLight.target.position.set(0, -1.5, -80);
    this.aircraft.add(this.landingLight, this.landingLight.target);
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a5a32, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sunTarget = new THREE.Object3D();
    this.aircraft.add(this.sunTarget);
    this.sun.target = this.sunTarget;
    // 機艙裡的「反射光」：地板、腿、儀表板反射上來的光，讓朝下的頂棚不會全黑（只照駕駛艙）
    this.bounce = new THREE.HemisphereLight(0x303030, 0xb8ad9c, 0.5);
    this.bounce.layers.set(LAYER_COCKPIT);
    S.add(this.hemi, this.sun, this.bounce);
    for (const L of [this.hemi, this.sun]) L.layers.enableAll();
    this.cockpit.root.traverse((o) => { if (o.isLight) o.layers.enableAll(); });
    // 駕駛艙的即時陰影（中、高畫質）：陰影相機只罩住機艙（約 3 公尺），只算駕駛艙圖層
    if (this.T.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(this.T.shadows, this.T.shadows);
      const c = this.sun.shadow.camera;
      c.left = -1.6; c.right = 1.6; c.top = 1.6; c.bottom = -1.6; c.near = 0.1; c.far = 12;
      c.layers.set(LAYER_COCKPIT);
      this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.012;
    }
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
  }

  setTime(name) {
    const P = TIMES[name] || TIMES.day;
    this.timeName = name;
    const el = P.sunElev * D, az = (P.sunAz + 60) * D; // 方位：0 = 北
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    const U = this.sky.material.uniforms;
    U.turbidity.value = P.turbidity; U.rayleigh.value = P.rayleigh; U.mieCoefficient.value = P.mie; U.mieDirectionalG.value = 0.8;
    U.sunPosition.value.copy(this.sunDir);
    const night = name === 'night', dusk = name === 'dusk';
    this.sky.visible = !night;
    this.scene.background = night ? new THREE.Color(0x04070d) : null;
    this.stars.material.uniforms.uIntensity.value = night ? 1 : 0;
    this.landingLight.intensity = night ? 6 : dusk ? 2 : 0;
    // 夜間：月光（冷色、很弱）當主光
    if (night) { this.sun.color.set(0x9fb4d8); this.sun.intensity = 0.35; this.hemi.color.set(0x23324a); this.hemi.groundColor.set(0x0b0d10); this.hemi.intensity = 0.35; }
    else {
      this.sun.color.set(dusk ? 0xffc490 : 0xfff4e6); this.sun.intensity = P.sun * (dusk ? 0.9 : 1);
      this.hemi.color.set(dusk ? 0xd9b8a8 : 0xcfe6ff); this.hemi.groundColor.set(dusk ? 0x3a3428 : 0x5a5f4a); this.hemi.intensity = P.hemi * (dusk ? 1.1 : 1);
    }
    this.bounce.intensity = night ? 0.02 : dusk ? 0.25 : 0.55;
    this.moonDir = new THREE.Vector3(-0.4, 0.55, -0.73).normalize();
    this.lightDir = night ? this.moonDir : this.sunDir;
    this.renderer.toneMappingExposure = night ? 1.25 : dusk ? 0.95 : 0.6;
    // 環境反射（玻璃、金屬）用天空算一次
    const env = new THREE.Scene();
    const sky2 = new THREE.Sky(); sky2.scale.setScalar(1000); sky2.material.uniforms = THREE.UniformsUtils.clone(U);
    env.add(sky2);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: night ? 0x020304 : dusk ? 0x3a2e24 : 0x4c5a3c }));
    ground.position.y = -5; env.add(ground);
    if (night) env.background = new THREE.Color(0x070b14);
    this.envRT?.dispose();
    this.envRT = this.pmrem.fromScene(env, 0.04, 1, 2000);
    sky2.geometry.dispose(); sky2.material.dispose();
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = night ? 0.15 : dusk ? 0.55 : 0.85;
    const fogC = night ? 0x070b12 : dusk ? 0xc99878 : 0xb8cde0;
    this.scene.fog = new THREE.Fog(fogC, night ? 2000 : 4000, night ? 15000 : 26000);
    this.scenery?.setTime?.(name, P);
    // 駕駛艙燈光：夜間儀表背光、儀表板泛光燈
    this.cockpitLights = night ? { backlight: 1.0, flood: 0.5, dome: 0 } : dusk ? { backlight: 0.35, flood: 0.06, dome: 0 } : { backlight: 0, flood: 0, dome: 0 };
    this.applyCockpitLights();
  }

  applyCockpitLights(over = {}) {
    const L = { ...this.cockpitLights, ...over };
    this.cockpitLights = L;
    const skyCol = this.timeName === 'night' ? new THREE.Color(0.03, 0.04, 0.07) : this.timeName === 'dusk' ? new THREE.Color(0.55, 0.45, 0.45) : new THREE.Color(0.62, 0.76, 0.92);
    this.cockpit.setLighting({ ...L, night: this.timeName === 'night' ? 1 : this.timeName === 'dusk' ? 0.4 : 0, sunColor: this.sun.color, sky: skyCol });
  }

  resize() {
    this.renderer.setPixelRatio(this.scale);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // 飛機姿態 → 世界座標（heading 0 = 北 = -z，pitch 機頭朝上為正，roll 右翼朝下為正）
  placeAircraft(pos, s) {
    const A = this.aircraft;
    A.position.copy(pos);
    A.quaternion.setFromEuler(new THREE.Euler(s.pitch * D, -s.heading * D, -s.roll * D, 'YXZ'));
  }

  frame(dt) {
    this.time += dt;
    this.onFrame?.(dt);
    const s = this.fs;
    this.cockpit.update(s, dt);
    this.look.update(dt);
    // 駕駛員視角：眼睛位置 + 轉頭
    const cam = this.camera;
    this.aircraft.updateMatrixWorld(true);
    const eye = this.cockpit.eye.clone().add(this.look.offset);
    cam.position.copy(eye).applyMatrix4(this.aircraft.matrixWorld);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.look.pitch, this.look.yaw, 0, 'YXZ'));
    cam.quaternion.copy(this.aircraft.quaternion).multiply(q);
    cam.fov = this.look.fov;
    // 光線方向轉到機身座標，給擋風玻璃的逆光效果；陰影相機跟著飛機
    const L = this.lightDir;
    this.sun.position.copy(this.aircraft.position).addScaledVector(L, 6);
    this.sunTarget.position.set(0, 0.7, 0);
    const inv = this.aircraft.quaternion.clone().invert();
    this.cockpit.mats.window.uniforms.uSun.value.copy(L).applyQuaternion(inv);
    this.scene.environmentRotation.setFromQuaternion(inv, 'YXZ');
    this.sky.position.copy(cam.position);
    this.stars.position.copy(cam.position);
    this.scenery?.update?.(dt, cam);

    const r = this.renderer;
    r.clear();
    // 1) 外面的世界
    cam.near = 1; cam.far = 40000; cam.layers.set(LAYER_WORLD); cam.updateProjectionMatrix();
    r.render(this.scene, cam);
    // 2) 駕駛艙（清掉深度再畫，近平面 1.5 公分）
    r.clearDepth();
    cam.near = 0.015; cam.far = 60; cam.layers.set(LAYER_COCKPIT); cam.updateProjectionMatrix();
    // 背景是純色（夜間）時，three.js 每次 render 都會用背景色清畫面：第二次畫之前先拿掉，不然外面會被蓋掉
    const bg = this.scene.background; this.scene.background = null;
    r.render(this.scene, cam);
    this.scene.background = bg;
    cam.layers.enableAll();
  }

  project(p) {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera);
    const behind = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(this.camera.matrixWorldInverse).z > 0;
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (0.5 - v.y * 0.5) * innerHeight, behind };
  }

  info() {
    const i = this.renderer.info;
    return { calls: i.render.calls, tris: i.render.triangles, textures: i.memory.textures, geometries: i.memory.geometries };
  }
}

// 一大片海，挖掉 [x0, x1] × [z0, z1] 的陸地
export function seaWithHole(x0, z0, x1, z1, R = 90000) {
  const sh = new THREE.Shape();
  sh.moveTo(-R, -R); sh.lineTo(R, -R); sh.lineTo(R, R); sh.lineTo(-R, R); sh.closePath();
  const h = new THREE.Path(); h.moveTo(x0, z0); h.lineTo(x0, z1); h.lineTo(x1, z1); h.lineTo(x1, z0); h.closePath();
  sh.holes.push(h);
  // Shape 在 xy 平面：y 當作 z，轉到水平時 y → -z，所以先把 z 取負號
  const g = new THREE.ShapeGeometry(sh);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setXYZ(i, p.getX(i), 0, y); }
  g.computeVertexNormals();
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  g.index && g.index.array.reverse?.();
  return g;
}

// 展示用的簡單地景：田地與城鎮的大地圖、海岸線與海、遠山
export function basicScenery(W) {
  const S = W.scene;
  const size = 40000, texN = W.tier === 'low' ? 512 : 1024;
  const groundMat = groundMaterial(landMap(texN, { seed: 5, meters: size }), fieldTile(W.tier === 'low' ? 256 : 512, 5), size, W.T.aniso);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), groundMat);
  ground.position.set(size / 2 - 6000, 0, 0); // 西邊 6 km 是海岸
  S.add(ground);
  // 海：一大片，中間挖掉陸地那一塊（兩個平面重疊在遠處會閃）
  const sea = new THREE.Mesh(seaWithHole(-6000, -size / 2, 34000, size / 2), new THREE.MeshStandardMaterial({ color: 0x1d4a66, roughness: 0.22, metalness: 0 }));
  S.add(sea);
  // 遠山（東邊與北邊一圈）
  const hills = new THREE.CylinderGeometry(22000, 22000, 1, 160, 1, true);
  const hp = hills.attributes.position, hf = fbmField(64, { seed: 9, base: 4, oct: 4 });
  for (let i = 0; i < hp.count; i++) {
    const a = Math.atan2(hp.getZ(i), hp.getX(i));
    const k = ((a / (Math.PI * 2) + 1) % 1) * 63;
    const land = Math.max(0, Math.cos(a - 0.3)); // 東側比較高
    if (hp.getY(i) > 0) hp.setY(i, 200 + land * (900 + hf[(k | 0) + 64 * 8] * 1600)); else hp.setY(i, -50);
  }
  hills.computeVertexNormals();
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x4d5f4a, side: THREE.BackSide });
  S.add(new THREE.Mesh(hills, hillMat));
  return {
    setTime(name) {
      const k = name === 'night' ? 0.08 : name === 'dusk' ? 0.7 : 1;
      groundMat.color.setScalar(k); hillMat.color.set(0x4d5f4a).multiplyScalar(k);
      sea.material.color.set(name === 'night' ? 0x050b12 : 0x1d4a66);
    },
  };
}
