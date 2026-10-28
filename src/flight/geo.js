// 駕駛艙幾何小工具：圓角方塊、沿路徑的管子、上色、烘焙「環境遮蔽」（角落變暗），以及把不會動的零件
// 依材質合併成少數幾個網格（平板上 draw call 越少越順，見 docs/flight.md「效能」）。
import * as THREE from '../land/three.js';

// 讓幾何有一致的屬性（position / normal / uv / color），合併時才不會缺欄位
export function prep(g, color = 0xffffff) {
  if (g.index) g = g.toNonIndexed();
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  const c = new THREE.Color(color);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  g.morphAttributes = {};
  return g;
}

export function merge(list) {
  const geoms = list.filter(Boolean);
  let n = 0;
  for (const g of geoms) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const [k, size] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) {
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const g of geoms) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.Float32BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}

// 把 root 底下標記為 static 的網格，依材質合併成一個網格（套用世界座標），回傳合併後的網格數
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  const remove = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.userData.static) return;
    const g = prep(o.geometry.clone(), 0xffffff);
    if (o.geometry.attributes.color) g.setAttribute('color', (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry).attributes.color.clone());
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const key = o.material.uuid + (o.castShadow ? 's' : '') + (o.receiveShadow ? 'r' : '');
    if (!groups.has(key)) groups.set(key, { mat: o.material, list: [], cast: o.castShadow, recv: o.receiveShadow, order: o.renderOrder });
    groups.get(key).list.push(g);
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const { mat, list, cast, recv, order } of groups.values()) {
    const m = new THREE.Mesh(merge(list), mat);
    m.castShadow = cast; m.receiveShadow = recv; m.renderOrder = order;
    m.name = 'merged:' + (mat.name || mat.type);
    root.add(m);
  }
  return groups.size;
}

// 加一個不會動的零件（合併前的暫存網格）
export function part(parent, geom, mat, { color = 0xffffff, pos, rot, scale, cast = true, recv = true, ao } = {}) {
  const g = prep(geom, color);
  const m = new THREE.Mesh(g, mat);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...(Array.isArray(scale) ? scale : [scale, scale, scale]));
  m.userData.static = true;
  m.userData.ao = ao;
  m.castShadow = cast; m.receiveShadow = recv;
  parent.add(m);
  return m;
}

// 圓角方塊（軟墊、旋鈕、面板）：把細分方塊的頂點推成圓角
export function roundedBox(w, h, d, r = 0.01, seg = 3) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  r = Math.min(r, w / 2, h / 2, d / 2);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    const dlt = v.clone().sub(c);
    if (dlt.lengthSq() > 1e-12) v.copy(c).add(dlt.normalize().multiplyScalar(r));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// 沿著點列的管子（操縱桿的握把、邊框）
export function tube(points, radius, radial = 8, tubular = 24, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
  return new THREE.TubeGeometry(curve, tubular, radius, radial, closed);
}

// 旋轉體（旋鈕、錶框、座椅調整桿）：profile = [[r, y], ...]
export const lathe = (profile, seg = 24) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// 依位置把頂點顏色變暗（簡易環境遮蔽：腳下、儀表板下方、角落比較暗）。fn(x, y, z) → 0~1
export function bakeAO(mesh, fn) {
  const g = mesh.geometry, p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const k = fn(p.getX(i), p.getY(i), p.getZ(i));
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  c.needsUpdate = true;
}

// 平面 UV：用世界座標的兩個軸（例如 x、y）乘上比例，讓貼圖密度一致
export function planarUV(g, ax = 'x', ay = 'y', scale = 1, ox = 0, oy = 0) {
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p['get' + ax.toUpperCase()](i) - ox) * scale, (p['get' + ay.toUpperCase()](i) - oy) * scale);
  uv.needsUpdate = true;
  return g;
}

// 盒狀投影 UV（依法線選投影面），適合不規則的塑膠件
export function boxUV(g, scale = 1) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ax >= ay && ax >= az) uv.setXY(i, z * scale, y * scale);
    else if (ay >= az) uv.setXY(i, x * scale, z * scale);
    else uv.setXY(i, x * scale, y * scale);
  }
  uv.needsUpdate = true;
  return g;
}

// 兩點之間的直桿（窗框、支架）：圓柱 + 兩端圓球，接起來的角是圓的
export function rod(a, b, r, seg = 10, caps = true) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, !caps);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q); g.translate(A.x, A.y, A.z);
  return g;
}
export function frameLoop(parent, pts, r, mat, opts) {
  for (let i = 0; i < pts.length; i++) {
    part(parent, rod(pts[i], pts[(i + 1) % pts.length], r), mat, opts);
    part(parent, new THREE.SphereGeometry(r, 10, 8), mat, { ...opts, pos: pts[i] });
  }
}
