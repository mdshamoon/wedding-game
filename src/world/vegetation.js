import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CHUNK } from './roads.js';

function leafTexture(hueShift = 0) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  let s = 7 + hueShift * 13;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 420; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 110;
    const x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d;
    const l = 22 + r() * 22;
    ctx.fillStyle = `hsl(${88 + hueShift + r() * 30}, ${38 + r() * 25}%, ${l}%)`;
    ctx.save(); ctx.translate(x, y); ctx.rotate(r() * Math.PI);
    ctx.beginPath(); ctx.ellipse(0, 0, 9 + r() * 6, 3.5 + r() * 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function colorize(geo, color) {
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function blob(radius, sx, sy, sz, x, y, z, seed) {
  const g = new THREE.IcosahedronGeometry(radius, 1);
  const p = g.attributes.position;
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < p.count; i++) {
    const k = 0.8 + r() * 0.35;
    p.setXYZ(i, p.getX(i) * sx * k + x, p.getY(i) * sy * k + y, p.getZ(i) * sz * k + z);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

function cards(count, cx, cy, cz, rx, ry, rz, size, seed) {
  const geos = [];
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const g = new THREE.PlaneGeometry(size * (0.8 + r() * 0.5), size * (0.8 + r() * 0.5));
    g.rotateX((r() - 0.5) * 1.2); g.rotateY(r() * Math.PI); g.rotateZ((r() - 0.5) * 0.8);
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    g.translate(cx + Math.cos(a) * rx * d, cy + (r() - 0.45) * ry * 2, cz + Math.sin(a) * rz * d);
    // normals pointing outward from canopy centre for nicer lighting
    const p = g.attributes.position, n = g.attributes.normal;
    for (let j = 0; j < p.count; j++) {
      const v = new THREE.Vector3(p.getX(j) - cx, (p.getY(j) - cy) * 0.6 + 0.4 * ry, p.getZ(j) - cz).normalize();
      n.setXYZ(j, v.x, v.y, v.z);
    }
    geos.push(g);
  }
  return mergeGeometries(geos);
}

function trunk(h, r0, r1, color, lean = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, h, 6, 2);
  g.translate(0, h / 2, 0);
  if (lean) g.rotateZ(lean);
  g.deleteAttribute('uv');
  return colorize(g.toNonIndexed(), new THREE.Color(color));
}

function buildTypes() {
  const dark = new THREE.Color('#2f4a22'), dark2 = new THREE.Color('#34502a');
  const T = [];
  // 0: poplar (tall, columnar, farm boundary rows)
  {
    const wood = trunk(12, 0.22, 0.1, '#7d7564');
    const b1 = colorize(blob(1, 1.3, 3.2, 1.3, 0, 8.5, 0, 3), dark);
    const b2 = colorize(blob(1, 1.0, 2.0, 1.0, 0, 11.5, 0, 5), dark);
    const leaves = cards(16, 0, 9, 0, 1.5, 3.4, 1.5, 2.6, 11);
    T.push({ solid: mergeGeometries([wood, b1, b2]), leaves, leafTex: 0 });
  }
  // 1: mango / neem (round, broad)
  {
    const wood = trunk(3.2, 0.35, 0.22, '#5a4a3a');
    const b = mergeGeometries([
      colorize(blob(1, 2.6, 1.8, 2.6, 0, 5.2, 0, 7), dark2),
      colorize(blob(1, 1.8, 1.5, 1.8, 1.6, 4.6, 0.6, 9), dark2),
      colorize(blob(1, 1.8, 1.4, 1.8, -1.4, 4.8, -0.8, 13), dark2),
    ]);
    const leaves = cards(22, 0, 5.1, 0, 3.0, 1.7, 3.0, 3.0, 17);
    T.push({ solid: mergeGeometries([wood, b]), leaves, leafTex: 1 });
  }
  // 2: eucalyptus (tall pale trunk, sparse high crown)
  {
    const wood = trunk(13, 0.22, 0.08, '#cfc6b4', 0.04);
    const b = colorize(blob(1, 1.6, 1.4, 1.6, 0.5, 12, 0, 21), new THREE.Color('#40553a'));
    const leaves = cards(12, 0.5, 11.6, 0, 2.2, 2.0, 2.2, 2.4, 23);
    T.push({ solid: mergeGeometries([wood, b]), leaves, leafTex: 2 });
  }
  return T;
}

export function buildVegetation(trees, opts = {}) {
  const types = buildTypes();
  const leafTexes = [leafTexture(0), leafTexture(-8), leafTexture(10)];
  const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const leafMats = leafTexes.map((t) => new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide }));
  const byChunk = new Map();
  for (const t of trees) {
    const k = Math.floor(t[0] / CHUNK) + ',' + Math.floor(t[1] / CHUNK);
    let a = byChunk.get(k); if (!a) byChunk.set(k, (a = [[], [], []])); a[t[2]].push(t);
  }
  const group = new THREE.Group(); group.name = 'trees';
  const chunks = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const col = new THREE.Color();
  for (const [k, arr] of byChunk) {
    const [cx, cz] = k.split(',').map(Number);
    const g = new THREE.Group();
    arr.forEach((list, ti) => {
      if (!list.length) return;
      const ty = types[ti];
      const solid = new THREE.InstancedMesh(ty.solid, solidMat, list.length);
      const leaves = new THREE.InstancedMesh(ty.leaves, leafMats[ty.leafTex], list.length);
      list.forEach((t, i) => {
        const s = t[3];
        e.set(0, (t[0] * 13.7 + t[1] * 7.1) % 6.28, 0); q.setFromEuler(e);
        sc.set(s, s * (0.9 + ((t[0] * 3.3) % 0.25)), s);
        m4.compose(v.set(t[0], 0, t[1]), q, sc);
        solid.setMatrixAt(i, m4); leaves.setMatrixAt(i, m4);
        const shade = 0.85 + ((t[0] * 7.7 + t[1] * 3.1) % 0.3);
        col.setRGB(shade, shade, shade * 0.95); leaves.setColorAt(i, col);
      });
      solid.castShadow = leaves.castShadow = true;
      solid.receiveShadow = leaves.receiveShadow = true;
      solid.computeBoundingSphere(); leaves.computeBoundingSphere();
      g.add(solid, leaves);
    });
    g.userData.center = new THREE.Vector3((cx + 0.5) * CHUNK, 0, (cz + 0.5) * CHUNK);
    group.add(g); chunks.push(g);
  }
  return { group, chunks, types, solidMat, leafMats };
}

// Single tree factory for hand-placed scenes.
let _types = null, _mats = null;
export function makeTree(type = 1, scale = 1) {
  if (!_types) {
    _types = buildTypes();
    _mats = { solid: new THREE.MeshLambertMaterial({ vertexColors: true }), leaves: [leafTexture(0), leafTexture(-8), leafTexture(10)].map((t) => new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide })) };
  }
  const ty = _types[type];
  const g = new THREE.Group();
  const a = new THREE.Mesh(ty.solid, _mats.solid), b = new THREE.Mesh(ty.leaves, _mats.leaves[ty.leafTex]);
  a.castShadow = b.castShadow = true;
  g.add(a, b); g.scale.setScalar(scale);
  return g;
}
