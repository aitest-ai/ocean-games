// 陸地系列的 3D 世界：three.js 繪圖器＋棒球場底座＋鏡頭。遊戲外殼（shell.js）和場地展示頁共用。
// 介面跟海洋系列的 VesselGame 相同：scale、resize()、frame(dt)、project(p)、time。
import * as THREE from './three.js';
import { createBallpark } from './ballpark.js';

export class LandWorld {
  constructor(canvas, { tier = 'mid', time = 'day' } = {}) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier !== 'low', powerPreference: 'high-performance', preserveDrawingBuffer: false });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;
    this.gl = renderer.getContext();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 6000);
    this.park = createBallpark(renderer, { tier });
    this.scene.add(this.park.root);
    this.park.setTime(time, this.scene);
    this.tier = tier;
    this.scale = 1;
    this.time = 0;
    this.onFrame = null;
    this.camera.position.set(0, 2, -6);
    this.camera.lookAt(0, 1, 20);
  }

  setTime(name) { this.park.setTime(name, this.scene); }

  resize() {
    this.renderer.setPixelRatio(this.scale);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  frame(dt) {
    this.time += dt;
    this.onFrame?.(dt);
    this.park.update(dt, this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  project(p) {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera);
    const behind = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(this.camera.matrixWorldInverse).z > 0;
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (0.5 - v.y * 0.5) * innerHeight, behind };
  }
}

// 裝置預設畫質：平板、手機自動選「低」
export function pickTier(params) {
  const TIERS = ['low', 'mid', 'rt'];
  if (TIERS.includes(params.get('q'))) return params.get('q');
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
  return touch ? 'low' : 'mid';
}
