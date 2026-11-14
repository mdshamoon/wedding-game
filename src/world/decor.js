// Reusable decor building blocks: Mughal (ogee) arches, fairy lights, marigold garlands, drapes, flowers.
import * as THREE from 'three';
import { glowTexture } from './textures.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    const M = opts.standard ? THREE.MeshStandardMaterial : THREE.MeshLambertMaterial;
    const o = { color, ...opts }; delete o.standard;
    matCache.set(key, new M(o));
  }
  return matCache.get(key);
}

export function box(w, h, d, material, x = 0, y = 0, z = 0, parent = null, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof material === 'object' && material.isMaterial ? material : mat(material));
  m.position.set(x, y + h / 2, z);
  m.castShadow = shadow; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

export function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, parent = null, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof material === 'object' && material.isMaterial ? material : mat(material));
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// Ogee (Mughal) arch outline, width w, spring height hs, total height h. Returns THREE.Shape (opening shape).
export function ogeeShape(w, hs, h) {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0);
  s.lineTo(-r, hs);
  s.bezierCurveTo(-r, hs + (h - hs) * 0.55, -r * 0.15, hs + (h - hs) * 0.6, 0, h);
  s.bezierCurveTo(r * 0.15, hs + (h - hs) * 0.6, r, hs + (h - hs) * 0.55, r, hs);
  s.lineTo(r, 0);
  s.lineTo(-r, 0);
  return s;
}

// A wall panel of size W x H with an ogee arch opening, extruded depth d.
export function archWall(W, H, aw, ahs, ah, d, material) {
  const outer = new THREE.Shape();
  outer.moveTo(-W / 2, 0); outer.lineTo(W / 2, 0); outer.lineTo(W / 2, H); outer.lineTo(-W / 2, H); outer.lineTo(-W / 2, 0);
  const hole = ogeeShape(aw, ahs, ah);
  outer.holes.push(new THREE.Path(hole.getPoints(24)));
  const g = new THREE.ExtrudeGeometry(outer, { depth: d, bevelEnabled: false, curveSegments: 16 });
  g.translate(0, 0, -d / 2);
  const m = new THREE.Mesh(g, typeof material === 'object' && material.isMaterial ? material : mat(material));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Freestanding ogee arch frame (for gates / stage backdrops): thick outline.
export function archFrame(aw, ahs, ah, thick, depth, material) {
  const outer = ogeeShape(aw + thick * 2, ahs, ah + thick * 1.3);
  const inner = ogeeShape(aw, ahs, ah);
  outer.holes.push(new THREE.Path(inner.getPoints(30)));
  const g = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1, curveSegments: 18 });
  g.translate(0, 0, -depth / 2);
  const m = new THREE.Mesh(g, typeof material === 'object' && material.isMaterial ? material : mat(material));
  m.castShadow = true;
  return m;
}

// Fairy lights along a list of polylines (array of Vector3 arrays). Returns Points that glow at night.
const fairyMat = { warm: null, white: null };
export function fairyLights(lines, spacing = 0.35, color = 0xffd27a, size = 0.22) {
  const pos = [];
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      const n = Math.max(1, Math.round(a.distanceTo(b) / spacing));
      for (let k = 0; k < n; k++) { const p = a.clone().lerp(b, k / n); pos.push(p.x, p.y, p.z); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ map: glowTexture(), color, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.25 });
  const pts = new THREE.Points(g, m);
  pts.userData.fairy = true;
  return pts;
}

// Catenary between two points
export function sag(a, b, drop, n = 12) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n; const p = a.clone().lerp(b, t); p.y -= Math.sin(Math.PI * t) * drop; out.push(p); }
  return out;
}

// Marigold garland (instanced flower balls) along a polyline.
const flowerGeo = new THREE.IcosahedronGeometry(0.042, 1);
export function garland(line, colors = [0xff9a1a, 0xffc21a, 0xff7a10], spacing = 0.06, radius = 1) {
  const pts = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1]; const n = Math.max(1, Math.round(a.distanceTo(b) / spacing));
    for (let k = 0; k < n; k++) pts.push(a.clone().lerp(b, k / n));
  }
  const m = new THREE.InstancedMesh(flowerGeo, mat(0xffffff), pts.length);
  const c = new THREE.Color(), m4 = new THREE.Matrix4();
  pts.forEach((p, i) => {
    const s = radius * (0.85 + Math.random() * 0.3);
    m4.makeScale(s, s, s).setPosition(p); m.setMatrixAt(i, m4);
    c.setHex(colors[i % colors.length]); m.setColorAt(i, c);
  });
  m.castShadow = true;
  return m;
}

// Hanging vertical flower strings (ladi) from a horizontal bar.
export function ladis(x0, x1, y, z, count, length, colors, parent) {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const x = x0 + (x1 - x0) * (i / Math.max(1, count - 1));
    const L = length * (0.85 + Math.random() * 0.3);
    g.add(garland([new THREE.Vector3(x, y, z), new THREE.Vector3(x, y - L, z)], colors, 0.09, 0.9));
  }
  if (parent) parent.add(g);
  return g;
}

// Soft fabric drape: a plane with gentle waves.
export function drape(w, h, color, opts = {}) {
  const g = new THREE.PlaneGeometry(w, h, Math.max(4, Math.round(w * 4)), 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, Math.sin(x * (opts.freq || 6)) * (opts.amp || 0.08) * (0.4 + 0.6 * (1 - (y + h / 2) / h)));
  }
  g.computeVertexNormals();
  g.translate(0, -h / 2, 0);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, transparent: !!opts.opacity, opacity: opts.opacity ?? 1, emissive: opts.emissive ?? 0x000000 }));
  m.castShadow = !opts.opacity; m.receiveShadow = true;
  return m;
}

// Sunflower / generic flower head
export function flower(color = 0xffc400, center = 0x5a3a10, r = 0.14) {
  const g = new THREE.Group();
  const petals = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.02, 12), mat(color));
  petals.rotation.x = Math.PI / 2;
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.03, 10), mat(center));
  c.rotation.x = Math.PI / 2; c.position.z = 0.01;
  g.add(petals, c);
  return g;
}

export function bush(r, color = 0x3d6b2a) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 0.8 + Math.random() * 0.35; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat(color)); m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Floral arrangement: a dome of individual roses/blooms around a green core.
const bloomGeo = new THREE.IcosahedronGeometry(1, 1);
export function floralBall(r, colors = [0xffffff, 0xf6d4d8, 0xe9b8b5], density = 1) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.9, 12, 8), mat(0x3f5f34)); core.scale.y = 0.8; g.add(core);
  const n = Math.max(12, Math.round(r * r * 260 * density));
  const m = new THREE.InstancedMesh(bloomGeo, mat(0xffffff), n);
  const m4 = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 1.6; // upper ~80% of sphere
    const rad = Math.sqrt(Math.max(0, 1 - y * y)), th = golden * i;
    v.set(Math.cos(th) * rad * r, y * r * 0.8, Math.sin(th) * rad * r);
    const s = r * (0.13 + Math.random() * 0.06);
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
    sc.set(s, s * 0.6, s);
    m4.compose(v, q, sc); m.setMatrixAt(i, m4);
    c.setHex(colors[(Math.random() * colors.length) | 0]); m.setColorAt(i, c);
  }
  m.castShadow = true; g.add(m);
  return g;
}
