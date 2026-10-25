// 駕駛艙的材質庫：全部的不動零件只用這幾種材質（合併後一種材質 = 一次 draw call）。
// 顏色差異用「頂點顏色」，所以黑色旋鈕、灰色飾板、紅色混合比把手可以共用同一個塑膠材質。
import * as THREE from '../land/three.js';
import { leather, fabric, grain, windshieldDirt, tex } from './tex.js';

export const COCKPIT_TIERS = {
  low: { atlas: 256, tex: 256, panelTex: 1024, shadows: 0, aniso: 2 },
  mid: { atlas: 512, tex: 512, panelTex: 2048, shadows: 1024, aniso: 4 },
  rt: { atlas: 512, tex: 512, panelTex: 2048, shadows: 2048, aniso: 8 },
};

export function createMaterials(atlas, T) {
  const t = T.tex;
  const lea = leather(t, 3), fab = fabric(t, 5), pl = grain(t, { seed: 7, base: 64, oct: 2, strength: 0.6 });
  const head = grain(t, { seed: 9, base: 16, oct: 3, strength: 0.6, dots: 48 }), carp = grain(t, { seed: 21, base: 128, oct: 2, strength: 2.2 });
  const N = (c, rep) => { const x = tex(c, { srgb: false, aniso: T.aniso }); x.repeat.set(rep, rep); return x; };
  const common = { vertexColors: true, fog: false };
  const mats = {
    plastic: new THREE.MeshStandardMaterial({ ...common, name: 'plastic', roughness: 0.62, metalness: 0, normalMap: N(pl.normal, 6), normalScale: new THREE.Vector2(0.35, 0.35) }),
    leather: new THREE.MeshStandardMaterial({ ...common, name: 'leather', roughness: 0.7, roughnessMap: N(lea.rough, 5), normalMap: N(lea.normal, 5), normalScale: new THREE.Vector2(0.8, 0.8) }),
    fabric: new THREE.MeshStandardMaterial({ ...common, name: 'fabric', roughness: 0.95, map: (() => { const x = tex(fab.color, { aniso: T.aniso }); x.repeat.set(4, 4); return x; })(), normalMap: N(fab.normal, 4), normalScale: new THREE.Vector2(0.9, 0.9) }),
    headliner: new THREE.MeshStandardMaterial({ ...common, name: 'headliner', roughness: 0.85, normalMap: N(head.normal, 3), normalScale: new THREE.Vector2(0.5, 0.5) }),
    carpet: new THREE.MeshStandardMaterial({ ...common, name: 'carpet', roughness: 1, normalMap: N(carp.normal, 6), normalScale: new THREE.Vector2(1, 1) }),
    metal: new THREE.MeshStandardMaterial({ ...common, name: 'metal', roughness: 0.32, metalness: 1 }),
    paint: new THREE.MeshStandardMaterial({ ...common, name: 'paint', roughness: 0.4, metalness: 0 }),
    panel: null, // 儀表板（貼圖在 cockpit.js 裡畫，因為要配合儀表位置）
    gauge: new THREE.MeshStandardMaterial({ name: 'gauge', map: tex(atlas.color, { repeat: false, aniso: T.aniso }), emissiveMap: tex(atlas.glow, { repeat: false, aniso: T.aniso }), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.5, metalness: 0, alphaTest: 0.5, fog: false }),
    glass: new THREE.MeshStandardMaterial({ name: 'gaugeGlass', color: 0xffffff, transparent: true, opacity: 0.09, roughness: 0.04, metalness: 0, envMapIntensity: 2.2, depthWrite: false, fog: false }),
    lamp: new THREE.MeshBasicMaterial({ name: 'lamp', map: null, color: new THREE.Color(2.2, 2.2, 2.2), fog: false, toneMapped: true }),
  };
  mats.lamp.map = mats.gauge.map;
  mats.window = windowMaterial(windshieldDirt(T.tex * 2 > 1024 ? 1024 : T.tex * 2, 11), T);
  return mats;
}

// 窗戶玻璃：很淡的天空反射（菲涅耳：斜看比較亮）、灰塵與細刮痕在逆光時會亮起來、夜間儀表板在玻璃下緣的倒影
function windowMaterial(dirtCanvas, T) {
  const dirt = tex(dirtCanvas, { srgb: false, repeat: false, aniso: T.aniso });
  return new THREE.ShaderMaterial({
    name: 'window', transparent: true, depthWrite: false, fog: false,
    uniforms: {
      uDirt: { value: dirt }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSky: { value: new THREE.Color(0.6, 0.75, 0.9) }, uNight: { value: 0 }, uAmb: { value: 1 }, uPanelGlow: { value: new THREE.Color(1, 0.75, 0.45) },
    },
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vGlow;
      attribute float glow;
      void main() {
        vUv = uv; vGlow = glow;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform sampler2D uDirt; uniform vec3 uSun; uniform vec3 uSunColor; uniform vec3 uSky; uniform float uNight; uniform float uAmb; uniform vec3 uPanelGlow;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vGlow;
      void main() {
        vec3 n = normalize(vN); if (dot(n, vV) < 0.0) n = -n;
        float c = clamp(dot(n, vV), 0.0, 1.0);
        float fres = 0.04 + 0.96 * pow(1.0 - c, 5.0);
        float d = texture2D(uDirt, vUv).a;
        // 逆光：太陽在玻璃另一側、靠近視線時，灰塵與刮痕散射出亮光
        float fwd = pow(max(dot(-vV, uSun), 0.0), 6.0);
        vec3 col = uSky * fres * 0.9;
        float a = fres * 0.55 + 0.035;
        vec3 dustCol = mix(vec3(0.75, 0.72, 0.66) * 0.25 * uAmb, uSunColor * 1.6, fwd * uAmb);
        col += dustCol * d; a += d * (0.06 + 0.5 * fwd) * uAmb;
        // 夜間：儀表背光映在玻璃下緣
        col += uPanelGlow * uNight * vGlow * 0.18; a += uNight * vGlow * 0.12;
        gl_FragColor = vec4(col, clamp(a, 0.0, 0.85));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
