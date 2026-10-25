// 一群「光點」（跑道燈、星星）：每個光點是一個永遠面向鏡頭的小方塊，畫面上至少 px 像素大，
// 所以很遠也看得到（GL 的 Points 在有些平板上最大只有 1 像素，不可靠）。一次 draw call 畫全部。
import * as THREE from '../land/three.js';

export function lightPoints(positions, colors, { px = 4, intensity = 1, fog = true } = {}) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.attributes.position = base.attributes.position;
  g.setAttribute('offset', new THREE.InstancedBufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('icolor', new THREE.InstancedBufferAttribute(new Float32Array(colors), 3));
  g.instanceCount = positions.length / 3;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uPx: { value: px }, uViewport: { value: new THREE.Vector2(1280, 800) }, uIntensity: { value: intensity }, uFogFar: { value: fog ? 20000 : 1e9 } },
    vertexShader: `
      attribute vec3 offset; attribute vec3 icolor;
      uniform float uPx; uniform vec2 uViewport; uniform float uFogFar;
      varying vec3 vColor; varying vec2 vUv; varying float vFade;
      void main() {
        vec4 mv = modelViewMatrix * vec4(offset, 1.0);
        vec4 clip = projectionMatrix * mv;
        clip.xy += position.xy * uPx * 2.0 / uViewport * clip.w;
        vColor = icolor; vUv = position.xy * 2.0; vFade = clamp(1.0 + mv.z / uFogFar, 0.0, 1.0);
        gl_Position = clip;
      }`,
    fragmentShader: `
      uniform float uIntensity; varying vec3 vColor; varying vec2 vUv; varying float vFade;
      void main() {
        float a = smoothstep(1.0, 0.15, length(vUv)) * vFade * uIntensity;
        gl_FragColor = vec4(vColor * a, a);
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.onBeforeRender = (r) => { r.getDrawingBufferSize(mat.uniforms.uViewport.value); };
  return m;
}
