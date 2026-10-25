// 駕駛員轉頭：滑鼠拖曳、觸控拖曳、體感（頭往左右偏）都只改「目標角度」，實際角度平滑地跟上，
// 所以不會晃、不會抖。轉頭時眼睛位置也跟著小幅移動（真的人轉頭時頭會往那邊挪），看起來比較有立體感。
import * as THREE from '../land/three.js';

const D = Math.PI / 180;
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

export class HeadLook {
  constructor(el, { yaw = 0, pitch = -13 * D, fov = 62 } = {}) {
    this.yaw = yaw; this.pitch = pitch; this.fov = fov;
    this.home = { yaw, pitch, fov };
    this.target = { yaw, pitch, fov };
    this.offset = new THREE.Vector3();
    this.limits = { yaw: 150 * D, up: 45 * D, down: -65 * D };
    this.drag = null;
    this.enabled = true;
    this.springBack = false; // 遊戲中：放開後慢慢回到正前方
    if (el) this.attach(el);
  }

  attach(el) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => { if (!this.enabled) return; this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; el.setPointerCapture?.(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const k = (this.fov * D) / innerHeight;
      this.target.yaw = clamp(this.target.yaw + (e.clientX - this.drag.x) * k, -this.limits.yaw, this.limits.yaw);
      this.target.pitch = clamp(this.target.pitch + (e.clientY - this.drag.y) * k, this.limits.down, this.limits.up);
      this.drag.x = e.clientX; this.drag.y = e.clientY;
    });
    const end = () => { this.drag = null; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => { if (!this.enabled) return; e.preventDefault(); this.target.fov = clamp(this.target.fov * Math.exp(e.deltaY * 0.001), 28, 80); }, { passive: false });
  }

  set({ yaw, pitch, fov }) {
    if (yaw !== undefined) this.target.yaw = yaw;
    if (pitch !== undefined) this.target.pitch = pitch;
    if (fov !== undefined) this.target.fov = fov;
  }
  reset() { this.set(this.home); }

  // 體感轉頭：v = -1 ~ 1（例如身體或頭往左右偏），對應最多 ±70°
  head(v, pitchV = 0) {
    this.target.yaw = clamp(-v * 70 * D, -this.limits.yaw, this.limits.yaw);
    this.target.pitch = clamp(this.home.pitch + pitchV * 25 * D, this.limits.down, this.limits.up);
  }

  update(dt) {
    if (this.springBack && !this.drag) { this.target.yaw *= Math.exp(-dt * 0.8); this.target.pitch += (this.home.pitch - this.target.pitch) * (1 - Math.exp(-dt * 0.8)); }
    const k = 1 - Math.exp(-dt * 9);
    this.yaw += (this.target.yaw - this.yaw) * k;
    this.pitch += (this.target.pitch - this.pitch) * k;
    this.fov += (this.target.fov - this.fov) * k;
    // 轉頭時頭會往那邊移一點、往下看時往前傾一點
    this.offset.set(-Math.sin(this.yaw) * 0.06, Math.min(this.pitch, 0) * 0.04, -Math.abs(Math.sin(this.yaw)) * 0.03 + Math.min(this.pitch, 0) * -0.05);
  }
}
