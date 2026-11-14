import * as THREE from 'three';
import { facadeTextures, facadeEmissive, FACADE_U, FACADE_V, shopTexture, shopEmissive, signTexture, roofTexture, SIGN_COLS, SIGN_ROWS } from './textures.js';
import { CHUNK } from './roads.js';

const PAINTS = ['#f3e3c3', '#f6d6cf', '#e8eef0', '#f7efc0', '#dbe9d5', '#f4cfa8', '#d7e3f2', '#efe6dc', '#f2c9b3', '#e0d1ee', '#fff7e8', '#cfe5e0', '#e9d3a8', '#d9c2a5', '#f0e0e0', '#c8d8c0'].map((c) => new THREE.Color(c));
const FLOOR_H = 3.2;

function rnd(seed) { let s = seed | 0; return () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 8) & 0xffffff) / 0x1000000; }; }

class Acc {
  constructor(colors = true) { this.pos = []; this.uv = []; this.col = []; this.nrm = []; this.idx = []; this.colors = colors; }
  quad(a, b, c, d, n, uvs, color) { // a,b,c,d = [x,y,z] counter-clockwise seen from outside
    const i = this.pos.length / 3;
    for (const p of [a, b, c, d]) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); }
    this.uv.push(...uvs);
    if (this.colors) for (let k = 0; k < 4; k++) { const cc = Array.isArray(color) ? color[k] : color; this.col.push(cc.r, cc.g, cc.b); }
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  geo() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.colors) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// Wall quad between two ground points p0->p1 (outside on the right-hand normal), from y0 to y1.
function wall(acc, p0, p1, y0, y1, uScale, vScale, color, uOff = 0, vOff = 0, shade = true) {
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1];
  const L = Math.hypot(dx, dz);
  const n = [-dz / L, 0, dx / L];
  const u0 = uOff, u1 = uOff + L / uScale, v0 = vOff + y0 / vScale, v1 = vOff + y1 / vScale;
  const dark = shade ? color.clone().multiplyScalar(y0 < 0.5 ? 0.78 : 1) : color;
  acc.quad([p0[0], y0, p0[1]], [p1[0], y0, p1[1]], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]], n, [u0, v0, u1, v0, u1, v1, u0, v1], [dark, dark, color, color]);
}

function boxInto(acc, cx, cy, cz, w, h, d, ang, color, uvFn) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const P = (lx, lz) => [cx + lx * ca - lz * sa, cz + lx * sa + lz * ca];
  const c = [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)];
  const y0 = cy, y1 = cy + h;
  // order corners so walls face outward: (-,-)->(+,-) is the front (-z local)
  const order = [[1, 0], [2, 1], [3, 2], [0, 3]];
  order.forEach(([a, b], i) => wall(acc, c[a], c[b], y0, y1, uvFn ? 1 : 1, 1, color, 0, 0, false));
  acc.quad([c[0][0], y1, c[0][1]], [c[3][0], y1, c[3][1]], [c[2][0], y1, c[2][1]], [c[1][0], y1, c[1][1]], [0, 1, 0], [0, 0, 0, 1, 1, 1, 1, 0], color);
}

export function buildBuildings(list) {
  const facadeKeys = ['plain', 'balcony', 'arched'];
  const mats = {
    plain: new THREE.MeshLambertMaterial({ map: facadeTextures.plain(), emissiveMap: facadeEmissive.plain(), emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true }),
    balcony: new THREE.MeshLambertMaterial({ map: facadeTextures.balcony(), emissiveMap: facadeEmissive.balcony(), emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true }),
    arched: new THREE.MeshLambertMaterial({ map: facadeTextures.arched(), emissiveMap: facadeEmissive.arched(), emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true }),
    shop: new THREE.MeshLambertMaterial({ map: shopTexture(), emissiveMap: shopEmissive(), emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true }),
    roof: new THREE.MeshLambertMaterial({ map: roofTexture(), vertexColors: true }),
    sign: new THREE.MeshLambertMaterial({ map: signTexture(), emissiveMap: signTexture(), emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true }),
    props: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  };
  const chunks = new Map();
  const getChunk = (x, z) => {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), k = cx + ',' + cz;
    let c = chunks.get(k);
    if (!c) chunks.set(k, (c = { cx, cz, acc: { plain: new Acc(), balcony: new Acc(), arched: new Acc(), shop: new Acc(), roof: new Acc(), sign: new Acc(), props: new Acc() } }));
    return c.acc;
  };
  const white = new THREE.Color(1, 1, 1);
  const tankCol = new THREE.Color('#1c1c1e');
  const tankLid = new THREE.Color('#2a2a2c');
  const parapetCap = new THREE.Color('#d8d2c6');
  const signFrame = new THREE.Color('#8a8a8a');
  const colliders = [];

  list.forEach((b, i) => {
    const [cx, cz, w, d, ang, floors, style, shop] = b;
    const r = rnd(i * 7919 + 13);
    const acc = getChunk(cx, cz);
    const paint = PAINTS[(style + i) % PAINTS.length].clone().multiplyScalar(0.92 + r() * 0.1);
    const fkey = facadeKeys[(style + (floors > 2 ? 1 : 0)) % 3];
    const H = floors * FLOOR_H + 0.25;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const P = (lx, lz) => [cx + lx * ca - lz * sa, cz + lx * sa + lz * ca];
    const c = [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)];
    // walls: front (c1->c0 faces -z local i.e. toward the road), right, back, left
    const edges = [[c[1], c[0], 'front'], [c[2], c[1], 'side'], [c[3], c[2], 'back'], [c[0], c[3], 'side']];
    const uOff = Math.floor(r() * 4) / 4;
    for (const [p0, p1, kind] of edges) {
      if (shop && kind === 'front') {
        wall(acc.shop, p0, p1, 0, FLOOR_H, 4, FLOOR_H, paint, 0, 0);
        wall(acc[fkey], p0, p1, FLOOR_H, H + 0.9, FACADE_U, FACADE_V, paint, uOff, 0);
      } else if (kind === 'side' && r() < 0.5) {
        // blank side walls (common between adjoining houses): use plain facade shifted onto the wall area
        wall(acc.plain, p0, p1, 0, H + 0.9, FACADE_U, FACADE_V, paint.clone().multiplyScalar(0.95), 0.125, 0.025);
      } else {
        wall(acc[fkey], p0, p1, 0, H + 0.9, FACADE_U, FACADE_V, paint, uOff, 0);
      }
    }
    // parapet inner faces
    const inset = 0.18;
    const ci = [P(-w / 2 + inset, -d / 2 + inset), P(w / 2 - inset, -d / 2 + inset), P(w / 2 - inset, d / 2 - inset), P(-w / 2 + inset, d / 2 - inset)];
    for (const [a, bb] of [[0, 1], [1, 2], [2, 3], [3, 0]]) wall(acc.roof, ci[a], ci[bb], H, H + 0.9, 4, 4, parapetCap, 0, 0, false);
    // parapet caps (thin top strip)
    for (const [a, bb] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
      const o0 = c[a], o1 = c[bb], i0 = ci[a], i1 = ci[bb];
      acc.roof.quad([o0[0], H + 0.9, o0[1]], [i0[0], H + 0.9, i0[1]], [i1[0], H + 0.9, i1[1]], [o1[0], H + 0.9, o1[1]], [0, 1, 0], [0, 0, 0, 0.1, 1, 0.1, 1, 0], parapetCap);
    }
    // roof slab
    const rc = paint.clone().lerp(white, 0.3).multiplyScalar(0.85);
    acc.roof.quad([ci[0][0], H, ci[0][1]], [ci[3][0], H, ci[3][1]], [ci[2][0], H, ci[2][1]], [ci[1][0], H, ci[1][1]], [0, 1, 0],
      [ci[0][0] / 8, ci[0][1] / 8, ci[3][0] / 8, ci[3][1] / 8, ci[2][0] / 8, ci[2][1] / 8, ci[1][0] / 8, ci[1][1] / 8], rc);
    // stair room (mumty)
    if (floors >= 2 && r() < 0.45 && w > 6 && d > 7) {
      const mw = 2.6, md = 3.2, mx = (r() - 0.5) * (w - mw - 1), mz = d / 2 - md / 2 - 0.4;
      const [px, pz] = P(mx, mz);
      const mc = [[-mw / 2, -md / 2], [mw / 2, -md / 2], [mw / 2, md / 2], [-mw / 2, md / 2]].map(([lx, lz]) => [px + lx * ca - lz * sa, pz + lx * sa + lz * ca]);
      for (const [a, bb] of [[1, 0], [2, 1], [3, 2], [0, 3]]) wall(acc.plain, mc[a], mc[bb], H, H + 2.6, FACADE_U, FACADE_V, paint, 0.15, 0.05, false);
      acc.roof.quad([mc[0][0], H + 2.6, mc[0][1]], [mc[3][0], H + 2.6, mc[3][1]], [mc[2][0], H + 2.6, mc[2][1]], [mc[1][0], H + 2.6, mc[1][1]], [0, 1, 0], [0, 0, 0, 0.4, 0.4, 0.4, 0.4, 0], rc);
    }
    // black water tank(s) on the roof (very characteristic)
    if (r() < 0.68) {
      const tx = (r() - 0.5) * (w - 2), tz = (r() - 0.2) * (d - 3);
      const [px, pz] = P(tx, tz);
      const rad = 0.55 + r() * 0.25, th = 1.0 + r() * 0.4, seg = 10;
      const base = H + 0.35;
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
        const p0 = [px + Math.cos(a0) * rad, pz + Math.sin(a0) * rad], p1 = [px + Math.cos(a1) * rad, pz + Math.sin(a1) * rad];
        wall(acc.props, p1, p0, base, base + th, 1, 1, tankCol, 0, 0, false);
        const am = (a0 + a1) / 2;
        acc.props.quad([px, base + th + 0.15, pz], [px, base + th + 0.15, pz], [p0[0], base + th, p0[1]], [p1[0], base + th, p1[1]], [Math.cos(am) * 0.3, 1, Math.sin(am) * 0.3], [0, 0, 0, 0, 0, 0, 0, 0], tankLid);
      }
      // stand
      boxInto(acc.props, px, H, pz, rad * 2, 0.35, rad * 2, ang, new THREE.Color('#77736b'));
    }
    // shop signboard above the shutter
    if (shop) {
      const cell = (i * 31 + style) % (SIGN_COLS * SIGN_ROWS);
      const u0 = (cell % SIGN_COLS) / SIGN_COLS, v1 = 1 - Math.floor(cell / SIGN_COLS) / SIGN_ROWS, u1 = u0 + 1 / SIGN_COLS, v0 = v1 - 1 / SIGN_ROWS;
      const sw = Math.min(w - 0.4, 5.5 + r() * 2.5), sh = sw / 5.33 * 1.0;
      const y0 = FLOOR_H - 0.15 - Math.min(sh, 1.1) + 0.1, y1 = y0 + Math.min(sh, 1.1);
      const f0 = P(-sw / 2, -d / 2 - 0.12), f1 = P(sw / 2, -d / 2 - 0.12);
      // front (faces -z local) => from f1 to f0
      acc.sign.quad([f1[0], y0, f1[1]], [f0[0], y0, f0[1]], [f0[0], y1, f0[1]], [f1[0], y1, f1[1]], [sa, 0, -ca], [u0, v0, u1, v0, u1, v1, u0, v1], white);
      boxInto(acc.props, (f0[0] + f1[0]) / 2 + sa * 0.06, y0 - 0.05, (f0[1] + f1[1]) / 2 - ca * 0.06, sw + 0.1, (y1 - y0) + 0.1, 0.1, ang, signFrame);
    }
    colliders.push({ x: cx, z: cz, hw: w / 2, hd: d / 2, ca, sa, h: H });
  });

  const group = new THREE.Group();
  group.name = 'buildings';
  const list2 = [];
  for (const c of chunks.values()) {
    const g = new THREE.Group();
    for (const [k, acc] of Object.entries(c.acc)) {
      const geo = acc.geo();
      if (!geo) continue;
      const m = new THREE.Mesh(geo, mats[k]);
      m.castShadow = k !== 'sign';
      m.receiveShadow = true;
      g.add(m);
    }
    g.userData.center = new THREE.Vector3((c.cx + 0.5) * CHUNK, 0, (c.cz + 0.5) * CHUNK);
    group.add(g);
    list2.push(g);
  }
  const setNight = (on) => {
    for (const k of ['plain', 'balcony', 'arched']) mats[k].emissiveIntensity = on ? 0.85 : 0;
    mats.shop.emissiveIntensity = on ? 0.7 : 0; mats.sign.emissiveIntensity = on ? 0.35 : 0;
  };
  return { group, chunks: list2, colliders: new ColliderGrid(colliders), mats, setNight };
}

export class ColliderGrid {
  constructor(items) {
    this.cell = 20; this.map = new Map(); this.items = items;
    for (const it of items) this.insert(it);
  }
  insert(it) {
    const r = Math.hypot(it.hw, it.hd), c = this.cell;
    for (let gx = Math.floor((it.x - r) / c); gx <= Math.floor((it.x + r) / c); gx++)
      for (let gz = Math.floor((it.z - r) / c); gz <= Math.floor((it.z + r) / c); gz++) {
        const k = gx * 100003 + gz; let a = this.map.get(k); if (!a) this.map.set(k, (a = [])); a.push(it);
      }
  }
  // Add an oriented box collider at runtime (venues, props). ang = rotation so that local x = (cos, sin).
  add(x, z, w, d, ang = 0) { const it = { x, z, hw: w / 2, hd: d / 2, ca: Math.cos(ang), sa: Math.sin(ang) }; this.items.push(it); this.insert(it); return it; }
  remove(it) { for (const a of this.map.values()) { const i = a.indexOf(it); if (i >= 0) a.splice(i, 1); } }
  // Circle vs OBBs: returns {x,z,nx,nz,hit} pushed-out position.
  resolve(x, z, rad) {
    const c = this.cell; let hit = false, nx = 0, nz = 0;
    const k = Math.floor(x / c) * 100003 + Math.floor(z / c);
    const a = this.map.get(k);
    if (!a) return { x, z, hit };
    for (let pass = 0; pass < 2; pass++) {
      for (const it of a) {
        const dx = x - it.x, dz = z - it.z;
        const lx = dx * it.ca + dz * it.sa, lz = -dx * it.sa + dz * it.ca;
        const qx = Math.max(-it.hw, Math.min(it.hw, lx)), qz = Math.max(-it.hd, Math.min(it.hd, lz));
        let ex = lx - qx, ez = lz - qz; let dist = Math.hypot(ex, ez);
        if (dist < rad) {
          if (dist < 1e-4) { // centre inside: push out along smallest axis
            const px = it.hw - Math.abs(lx), pz = it.hd - Math.abs(lz);
            if (px < pz) { ex = Math.sign(lx) || 1; ez = 0; dist = -px; } else { ex = 0; ez = Math.sign(lz) || 1; dist = -pz; }
          } else { ex /= dist; ez /= dist; }
          const push = rad - dist;
          const wx = ex * it.ca - ez * it.sa, wz = ex * it.sa + ez * it.ca;
          x += wx * push; z += wz * push; nx += wx; nz += wz; hit = true;
        }
      }
    }
    const L = Math.hypot(nx, nz) || 1;
    return { x, z, hit, nx: nx / L, nz: nz / L };
  }
}
