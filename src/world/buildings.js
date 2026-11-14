import * as THREE from 'three';
import { facadeAtlas, ATLAS, roofTextureLight, signTexture, SIGN_COLS, SIGN_ROWS } from './textures.js';
import { CHUNK } from './roads.js';

// Real footprints (Google / Microsoft / OSM, see tools/footprints.py) extruded into Kichha-style
// buildings: weathered plaster in dusty pastels, exposed brick, grilled windows, rolling-shutter
// shops with flex signboards and awnings, black water tanks and stair rooms on flat roofs, and roofs
// tinted with the colour sampled from the satellite image of that very roof.
//
// Geometry is built lazily per 400 m chunk around the focus (time-sliced), and disposed when far.

// Paint palette: index order must match PAINT_W in tools/footprints.py.
export const PAINTS = ['#ece6da', '#e9dcc0', '#bdb8ae', '#d3d0c8', '#ecd9a0', '#d9b56e', '#e8b5a2', '#edc9c4',
  '#b9cfdd', '#c9d8b0', '#b8d6c8', '#f0c49a', '#d4c8e0', '#c98a6a', '#f2efe8', '#9fbf8f'].map((c) => new THREE.Color(c));
const HOUSE = 0, SHOP = 1, SHED = 2, BRICK = 3;
const FLOOR_H = 3.2, PARAPET = 0.9;
const AWNINGS = ['#8d9499', '#2f6fb3', '#3f8f5a', '#7a2a2a', '#c9a227', '#9aa3a8', '#1f5fa0', '#b5651d'].map((c) => new THREE.Color(c));
const VB = 1 / ATLAS.BANDS, VE = 1.5 / 2048;

function rnd(seed) { let s = seed | 0; return () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 8) & 0xffffff) / 0x1000000; }; }

class Acc {
  constructor() { this.pos = []; this.uv = []; this.col = []; this.nrm = []; this.idx = []; }
  quad(a, b, c, d, n, uvs, color) {
    const i = this.pos.length / 3;
    for (const p of [a, b, c, d]) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); }
    this.uv.push(...uvs);
    for (let k = 0; k < 4; k++) { const cc = Array.isArray(color) ? color[k] : color; this.col.push(cc.r, cc.g, cc.b); }
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  tri(a, b, c, n, uvs, color) {
    const i = this.pos.length / 3;
    for (const p of [a, b, c]) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.col.push(color.r, color.g, color.b); }
    this.uv.push(...uvs);
    this.idx.push(i, i + 1, i + 2);
  }
  geo() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// Vertical quad p0->p1 (outside on the left-hand normal (-dz, dx)), textured with one atlas band.
function wallBand(acc, p0, p1, y0, y1, u0m, band, color, vFrac = 1, ao = false) {
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz);
  if (L < 0.05) return;
  const n = [-dz / L, 0, dx / L];
  const u0 = u0m / ATLAS.U, u1 = (u0m + L) / ATLAS.U;
  const v0 = 1 - (band + 1) * VB + VE, v1 = v0 + (VB - 2 * VE) * vFrac;
  const bot = ao ? color.clone().multiplyScalar(0.72) : color;
  acc.quad([p0[0], y0, p0[1]], [p1[0], y0, p1[1]], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]], n, [u0, v0, u1, v0, u1, v1, u0, v1], [bot, bot, color, color]);
}
function plainWall(acc, p0, p1, y0, y1, color, uvScale = 4) {
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz);
  if (L < 0.05) return;
  const n = [-dz / L, 0, dx / L];
  acc.quad([p0[0], y0, p0[1]], [p1[0], y0, p1[1]], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]], n, [0, y0 / uvScale, L / uvScale, y0 / uvScale, L / uvScale, y1 / uvScale, 0, y1 / uvScale], color);
}
// Horizontal quad with an upward normal regardless of the corner order given.
function hquad(acc, a, b, c, d, y, color, uvs) {
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  if (area > 0) { [a, d] = [d, a]; [b, c] = [c, b]; }
  acc.quad([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], [d[0], y, d[1]], [0, 1, 0], uvs || [a[0] / 8, a[1] / 8, b[0] / 8, b[1] / 8, c[0] / 8, c[1] / 8, d[0] / 8, d[1] / 8], color);
}
function boxInto(acc, cx, cy, cz, w, h, d, ang, color) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const P = (lx, lz) => [cx + lx * ca - lz * sa, cz + lx * sa + lz * ca];
  const c = [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)];
  for (const [a, b] of [[1, 0], [2, 1], [3, 2], [0, 3]]) plainWall(acc, c[a], c[b], cy, cy + h, color);
  hquad(acc, c[0], c[1], c[2], c[3], cy + h, color, [0, 0, 1, 0, 1, 1, 0, 1]);
}

// Inset a ring (outer orientation) by d metres with mitred corners.
function inset(ring, d) {
  const n = ring.length, out = [];
  for (let k = 0; k < n; k++) {
    const p = ring[(k + n - 1) % n], c = ring[k], q = ring[(k + 1) % n];
    let e1x = c[0] - p[0], e1z = c[1] - p[1], e2x = q[0] - c[0], e2z = q[1] - c[1];
    const l1 = Math.hypot(e1x, e1z) || 1, l2 = Math.hypot(e2x, e2z) || 1;
    e1x /= l1; e1z /= l1; e2x /= l2; e2z /= l2;
    const n1x = e1z, n1z = -e1x, n2x = e2z, n2z = -e2x; // inward normals
    let mx = n1x + n2x, mz = n1z + n2z; const ml = Math.hypot(mx, mz);
    if (ml < 1e-3) { mx = n1x; mz = n1z; } else { mx /= ml; mz /= ml; }
    const s = d / Math.max(0.35, mx * n1x + mz * n1z);
    out.push([c[0] + mx * s, c[1] + mz * s]);
  }
  return out;
}

function decode(data) {
  const list = Array.isArray(data) ? [] : data.b;
  return list.map((a) => {
    const [kind, floors, rgb, paint, front, x0, z0] = a;
    const ring = [[x0 / 10, z0 / 10]];
    let x = x0, z = z0;
    for (let k = 7; k < a.length; k += 2) { x += a[k]; z += a[k + 1]; ring.push([x / 10, z / 10]); }
    let cx = 0, cz = 0; for (const p of ring) { cx += p[0]; cz += p[1]; } cx /= ring.length; cz /= ring.length;
    return { kind, floors, rgb, paint, front, ring, cx, cz };
  });
}

// Minimum-area oriented box over the footprint's edge directions (collider).
function obb(ring) {
  let best = null;
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k], b = ring[(k + 1) % ring.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
    const ca = (b[0] - a[0]) / L, sa = (b[1] - a[1]) / L;
    let mn1 = 1e9, mx1 = -1e9, mn2 = 1e9, mx2 = -1e9;
    for (const p of ring) { const u = p[0] * ca + p[1] * sa, v = -p[0] * sa + p[1] * ca; mn1 = Math.min(mn1, u); mx1 = Math.max(mx1, u); mn2 = Math.min(mn2, v); mx2 = Math.max(mx2, v); }
    const area = (mx1 - mn1) * (mx2 - mn2);
    if (!best || area < best.area) {
      const u = (mn1 + mx1) / 2, v = (mn2 + mx2) / 2;
      best = { area, x: u * ca - v * sa, z: u * sa + v * ca, hw: (mx1 - mn1) / 2, hd: (mx2 - mn2) / 2, ca, sa };
    }
  }
  return best;
}

function pointIn(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

// ------------------------------------------------------------------ street life (low-poly, vertex coloured)
const C = (h) => new THREE.Color(h);
const PCOL = {
  wood: C('#7a5233'), woodL: C('#9b6b43'), dark: C('#232325'), tyre: C('#151515'), metal: C('#8c9094'), seat: C('#2b2622'),
  bikes: ['#1c1c1e', '#9b1c1c', '#1d3f8a', '#5a1a24', '#a7abb0', '#1c1c1e', '#2f2f33', '#7a1c1c'].map(C),
  cycles: ['#1c1c1e', '#2c4a2c', '#5a1a1a', '#1c2c4a'].map(C),
  produce: ['#e8892b', '#e8cf4a', '#c8321e', '#4f8a2f', '#b0606a', '#b8202a', '#7cae3a', '#d9a441'].map(C),
  tin: ['#2f6fb3', '#3f8f5a', '#8d9499', '#a33a2a', '#2a7f8f', '#c9a227', '#5b6b7b', '#3f8f5a'].map(C),
  umbrella: ['#1f5fa0', '#c0392b', '#e0b030', '#2e8b57', '#6a1b9a', '#d35400'].map(C),
  skin: ['#8d5a3b', '#a8714a', '#6e4429', '#b98057', '#7b4a2e', '#9a6340'].map(C),
  hair: C('#141210'),
  // [top, bottom, accent] per outfit: kurta-pyjama, shirt-trousers, salwar-kameez + dupatta, sari, abaya, school kid...
  outfits: [['#f2efe6', '#f2efe6', null], ['#5b7fa6', '#3a3a40', null], ['#c2185b', '#f3e5f5', '#ffd54f'], ['#e65100', '#e65100', '#ffcc80'],
    ['#1c1c22', '#1c1c22', null], ['#ffffff', '#2c3e70', null], ['#2e7d32', '#f1f8e9', '#81c784'], ['#8d6e63', '#4e342e', null]].map((o) => o.map((c) => c && C(c))),
  cow: ['#ebe6db', '#d9cfbf', '#8a6a4f', '#f2eee6'].map(C), horn: C('#cfc6b0'),
  rope: C('#d8c79a'), straw: C('#c9a85a'), strawD: C('#a8893e'),
};
function wheel(acc, cx, cy, cz, r, t, axAng, col, seg = 8) {
  const ax = Math.cos(axAng), az = Math.sin(axAng), bx = -az, bz = ax;
  const ring = (s) => { const out = []; for (let k = 0; k < seg; k++) { const th = (k / seg) * Math.PI * 2; out.push([cx + bx * Math.cos(th) * r + ax * s, cy + Math.sin(th) * r, cz + bz * Math.cos(th) * r + az * s]); } return out; };
  const A = ring(-t / 2), B = ring(t / 2);
  for (let k = 0; k < seg; k++) {
    const k2 = (k + 1) % seg, th = ((k + 0.5) / seg) * Math.PI * 2;
    acc.quad(A[k], A[k2], B[k2], B[k], [bx * Math.cos(th), Math.sin(th), bz * Math.cos(th)], [0, 0, 0, 0, 0, 0, 0, 0], col);
  }
  for (let k = 1; k < seg - 1; k++) { acc.tri(A[0], A[k + 1], A[k], [-ax, 0, -az], [0, 0, 0, 0, 0, 0], col); acc.tri(B[0], B[k], B[k + 1], [ax, 0, az], [0, 0, 0, 0, 0, 0], col); }
}
function cone(acc, cx, cz, r0, r1, y0, y1, col, seg = 8) {
  const P = (r, y, k) => [cx + Math.cos((k / seg) * Math.PI * 2) * r, y, cz + Math.sin((k / seg) * Math.PI * 2) * r];
  for (let k = 0; k < seg; k++) {
    const m = ((k + 0.5) / seg) * Math.PI * 2;
    acc.quad(P(r0, y0, k + 1), P(r0, y0, k), P(r1, y1, k), P(r1, y1, k + 1), [Math.cos(m), 0.5, Math.sin(m)], [0, 0, 0, 0, 0, 0, 0, 0], col);
  }
  if (r1 > 0.01) for (let k = 1; k < seg - 1; k++) acc.tri(P(r1, y1, 0), P(r1, y1, k), P(r1, y1, k + 1), [0, 1, 0], [0, 0, 0, 0, 0, 0], col);
}
function emitProp(acc, p, i) {
  const ca = Math.cos(p.ang), sa = Math.sin(p.ang), v = p.v;
  const W = (lx, lz) => [p.x + lx * ca - lz * sa, p.z + lx * sa + lz * ca];
  const B = (lx, ly, lz, w, h, d, col, rot = 0) => { const [x, z] = W(lx, lz); boxInto(acc, x, ly, z, w, h, d, p.ang + rot, col); };
  const Wh = (lx, ly, lz, r, t, alongX, col) => { const [x, z] = W(lx, lz); wheel(acc, x, ly, z, r, t, alongX ? p.ang : p.ang + Math.PI / 2, col); };
  const r = rnd(i * 977 + 5);
  switch (p.prop) {
    case 0: { // handcart (thela) with produce, maybe an umbrella
      B(0, 0.74, 0, 1.9, 0.1, 0.95, PCOL.woodL);
      for (const s of [-1, 1]) Wh(-0.15, 0.38, s * 0.52, 0.38, 0.06, false, PCOL.tyre);
      B(0.85, 0, 0, 0.06, 0.74, 0.06, PCOL.wood); B(-1.05, 0.8, 0, 0.5, 0.05, 0.05, PCOL.wood);
      for (let a = 0; a < 6; a++) for (let b = 0; b < 3; b++) {
        const col = PCOL.produce[(v + (a > 2 ? 1 : 0) + b) % PCOL.produce.length];
        B(-0.75 + a * 0.3, 0.84, -0.3 + b * 0.3, 0.27, 0.12 + r() * 0.16, 0.27, col);
      }
      if (v % 2 === 0) { B(0.6, 0.84, 0, 0.04, 1.5, 0.04, PCOL.metal); B(0.6, 2.3, 0, 1.8, 0.04, 1.8, PCOL.umbrella[v % PCOL.umbrella.length]); }
      break;
    }
    case 1: { // parked motorbike, nose toward the road (length along local z)
      const col = PCOL.bikes[v];
      Wh(0, 0.3, 0.66, 0.3, 0.1, true, PCOL.tyre); Wh(0, 0.3, -0.66, 0.3, 0.1, true, PCOL.tyre);
      B(0, 0.36, 0, 0.26, 0.3, 1.0, PCOL.metal); B(0, 0.62, 0.22, 0.34, 0.24, 0.5, col);
      B(0, 0.74, -0.25, 0.3, 0.1, 0.62, PCOL.seat); B(0, 0.5, -0.55, 0.3, 0.28, 0.3, col);
      B(0, 0.95, 0.58, 0.72, 0.04, 0.05, PCOL.dark); B(0, 0.6, 0.62, 0.06, 0.38, 0.06, PCOL.metal);
      B(0, 0.86, 0.66, 0.18, 0.16, 0.08, col);
      break;
    }
    case 2: { // tin kiosk (gumti) with a flap awning
      const col = PCOL.tin[v];
      B(0, 0.25, 0, 1.7, 1.85, 1.3, col);
      for (const s of [-1, 1]) B(0, 0.9, s * 0.66, 1.3, 0.75, 0.04, PCOL.dark);
      B(0, 2.1, 0, 1.8, 0.06, 1.4, col.clone().multiplyScalar(0.8));
      for (const s of [-1, 1]) { const a0 = W(-0.9, s * 0.66), a1 = W(0.9, s * 0.66), b0 = W(-0.9, s * 1.08), b1 = W(0.9, s * 1.08); acc.quad([a0[0], 1.95, a0[1]], [a1[0], 1.95, a1[1]], [b1[0], 1.62, b1[1]], [b0[0], 1.62, b0[1]], [0, 1, 0], [0, 0, 0, 0, 0, 0, 0, 0], col); }
      for (const [lx, lz] of [[-0.75, -0.55], [0.75, -0.55], [-0.75, 0.55], [0.75, 0.55]]) B(lx, 0, lz, 0.08, 0.25, 0.08, PCOL.metal);
      B(0, 2.16, 0, 1.2, 0.36, 0.06, PCOL.umbrella[(v + 2) % PCOL.umbrella.length]);
      break;
    }
    case 3: { // person
      const [top, bot, acc2] = PCOL.outfits[v];
      const skin = PCOL.skin[(i * 7) % PCOL.skin.length];
      const s = 0.9 + r() * 0.15, kid = r() < 0.12 ? 0.68 : 1;
      const k = s * kid;
      const longTop = v === 0 || v === 2 || v === 4 || v === 6;
      B(-0.09 * k, 0, 0, 0.13 * k, 0.8 * k, 0.16 * k, bot); B(0.09 * k, 0, 0, 0.13 * k, 0.8 * k, 0.16 * k, bot);
      B(0, (longTop ? 0.45 : 0.78) * k, 0, 0.42 * k, (longTop ? 0.95 : 0.62) * k, 0.24 * k, top);
      for (const sd of [-1, 1]) B(sd * 0.27 * k, 0.82 * k, 0, 0.1 * k, 0.56 * k, 0.12 * k, v === 4 ? top : sd > 0 && r() < 0.5 ? skin : top);
      B(0, 1.4 * k, 0, 0.2 * k, 0.26 * k, 0.22 * k, v === 4 ? top : skin);
      B(0, 1.62 * k, -0.01 * k, 0.21 * k, 0.07 * k, 0.23 * k, v === 4 ? top : PCOL.hair);
      if (acc2) B(0.05 * k, 1.05 * k, 0.04 * k, 0.5 * k, 0.12 * k, 0.27 * k, acc2, 0.5); // dupatta
      break;
    }
    case 4: { // bicycle (length along local z)
      const col = PCOL.cycles[v % PCOL.cycles.length];
      Wh(0, 0.34, 0.52, 0.34, 0.04, true, PCOL.tyre); Wh(0, 0.34, -0.52, 0.34, 0.04, true, PCOL.tyre);
      B(0, 0.55, 0, 0.05, 0.05, 1.0, col); B(0, 0.34, -0.12, 0.05, 0.42, 0.05, col);
      B(0, 0.8, -0.2, 0.12, 0.05, 0.22, PCOL.seat); B(0, 0.95, 0.45, 0.55, 0.03, 0.04, PCOL.dark);
      if (v % 3 === 0) B(0, 0.62, -0.62, 0.3, 0.04, 0.3, PCOL.metal); // carrier
      break;
    }
    case 5: { // cow resting or standing
      const col = PCOL.cow[v % PCOL.cow.length];
      const sit = v >= 5 ? 0.4 : 0;
      B(0, 0.55 - sit, 0, 1.45, 0.72, 0.55, col);
      if (!sit) for (const [lx, lz] of [[-0.55, -0.18], [0.55, -0.18], [-0.55, 0.18], [0.55, 0.18]]) B(lx, 0, lz, 0.12, 0.58, 0.12, col.clone().multiplyScalar(0.92));
      B(0.42, 1.2 - sit, 0, 0.32, 0.18, 0.4, col); // hump
      B(0.88, 0.95 - sit, 0, 0.36, 0.34, 0.28, col);
      B(1.06, 0.92 - sit, 0, 0.12, 0.2, 0.22, col.clone().multiplyScalar(0.7));
      for (const sd of [-1, 1]) B(0.82, 1.2 - sit, sd * 0.12, 0.05, 0.2, 0.05, PCOL.horn);
      B(-0.76, 0.5 - sit, 0, 0.04, 0.6, 0.04, col);
      break;
    }
    case 6: { // charpai (rope cot)
      B(0, 0.38, 0, 1.9, 0.08, 0.9, PCOL.wood); B(0, 0.46, 0, 1.78, 0.02, 0.78, PCOL.rope);
      for (const [lx, lz] of [[-0.88, -0.38], [0.88, -0.38], [-0.88, 0.38], [0.88, 0.38]]) B(lx, 0, lz, 0.08, 0.42, 0.08, PCOL.wood);
      break;
    }
    case 7: { // haystack / bhusa heap
      cone(acc, p.x, p.z, 1.6 + r() * 0.6, 0.25, 0, 1.6 + r() * 0.8, v % 2 ? PCOL.straw : PCOL.strawD);
      break;
    }
  }
}

export function buildBuildings(data, street = [], net = null) {
  const items = decode(data);
  const nB = items.length;
  for (const a of street) { const x = a[1] / 10, z = a[2] / 10; items.push({ prop: a[0], x, z, ang: a[3] / 100, v: a[4], cx: x, cz: z, ring: null }); }
  const atlas = facadeAtlas();
  const mats = {
    facade: new THREE.MeshLambertMaterial({ map: atlas.map, emissiveMap: atlas.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true }),
    roof: new THREE.MeshLambertMaterial({ map: roofTextureLight(), vertexColors: true }),
    sign: new THREE.MeshLambertMaterial({ map: signTexture(), emissiveMap: signTexture(), emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true }),
    props: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  };
  const white = new THREE.Color(1, 1, 1);
  const tankCols = [new THREE.Color('#1c1c1e'), new THREE.Color('#1c1c1e'), new THREE.Color('#1c1c1e'), new THREE.Color('#2b5d8a'), new THREE.Color('#d8d4c8')];
  const standCol = new THREE.Color('#77736b');
  const signFrame = new THREE.Color('#8a8a8a');
  const roofTmp = new THREE.Color();

  // colliders for every building up front (cheap), geometry later
  const colliderList = [];
  items.forEach((b) => {
    if (b.prop !== undefined) {
      if (b.prop === 0 || b.prop === 2) { const w = b.prop === 0 ? 1.9 : 1.7, d = b.prop === 0 ? 1.0 : 1.3; b.col = { x: b.x, z: b.z, hw: w / 2, hd: d / 2, ca: Math.cos(b.ang), sa: Math.sin(b.ang), h: 2 }; colliderList.push(b.col); }
      return;
    }
    const o = obb(b.ring); if (!o) return;
    b.col = { x: o.x, z: o.z, hw: o.hw, hd: o.hd, ca: o.ca, sa: o.sa, h: b.kind === SHED ? 7 : b.floors * FLOOR_H };
    // An L-shaped house's bounding box can spill onto the lane: collide with its real walls instead.
    const onRoad = (x, z) => { const q = net?.query(x, z); return q && q.edge < -0.2; };
    let spill = false;
    if (net) for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const lx = sx * o.hw, lz = sz * o.hd;
      if (onRoad(o.x + lx * o.ca - lz * o.sa, o.z + lx * o.sa + lz * o.ca)) { spill = true; break; }
    }
    if (spill) {
      b.walls = [];
      for (let k = 0; k < b.ring.length; k++) {
        const a = b.ring[k], c = b.ring[(k + 1) % b.ring.length];
        const L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 0.3) continue;
        const ca = (c[0] - a[0]) / L, sa = (c[1] - a[1]) / L;
        // 0.6 m thick, pushed inward (inward normal = (sa, -ca))
        const w = { x: (a[0] + c[0]) / 2 + sa * 0.3, z: (a[1] + c[1]) / 2 - ca * 0.3, hw: L / 2, hd: 0.3, ca, sa, h: b.col.h };
        b.walls.push(w); colliderList.push(w);
      }
      b.col.walls = b.walls;
    } else colliderList.push(b.col);
  });
  const colliders = new ColliderGrid(colliderList);

  function emit(acc, b, i) {
    if (b.excluded) return;
    if (b.prop !== undefined) { emitProp(acc.props, b, i); return; }
    const r = rnd(i * 7919 + 13);
    const ring = b.ring, n = ring.length;
    const shed = b.kind === SHED, brick = b.kind === BRICK, shop = b.kind === SHOP;
    const floors = Math.max(1, b.floors);
    const H = shed ? 6 + r() * 2 : floors * FLOOR_H + 0.3;
    const paint = PAINTS[b.paint % PAINTS.length].clone().multiplyScalar(0.88 + r() * 0.14);
    const rr = (b.rgb >> 16) & 255, rg = (b.rgb >> 8) & 255, rb = b.rgb & 255;
    const roofCol = roofTmp.setRGB(Math.min(1, rr / 255 * 1.2), Math.min(1, rg / 255 * 1.2), Math.min(1, rb / 255 * 1.2), THREE.SRGBColorSpace).clone();
    { const l = roofCol.r * 0.3 + roofCol.g * 0.59 + roofCol.b * 0.11; roofCol.lerp(new THREE.Color(l, l * 0.98, l * 0.95), 0.4); } // satellite haze reads olive
    const upper = [ATLAS.UPPER, ATLAS.UPPER, ATLAS.UPPER, ATLAS.BALCONY, ATLAS.BALCONY, ATLAS.ARCHED][(r() * 6) | 0];
    const topBrick = !shed && !brick && floors >= 2 && r() < 0.12;
    const brickTint = white.clone().multiplyScalar(0.9 + r() * 0.1);
    const shopTint = paint.clone().lerp(white, 0.55);
    const sheetCol = r() < 0.5 ? roofCol.clone().lerp(white, 0.25) : new THREE.Color('#b9b6ae');
    let u = Math.floor(r() * 4) * 3.5;

    for (let k = 0; k < n; k++) {
      const p0 = ring[k], p1 = ring[(k + 1) % n];
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const front = k === b.front;
      if (shed) {
        wallBand(acc.facade, p0, p1, 0, H, u, ATLAS.SHEET, sheetCol, 1, true);
      } else {
        const blank = !front && L < 9 && r() < 0.5;
        for (let f = 0; f < floors; f++) {
          const y0 = f * FLOOR_H, y1 = f === floors - 1 ? H : (f + 1) * FLOOR_H;
          let band, col = paint;
          if (brick || (topBrick && f === floors - 1)) { band = ATLAS.BRICK; col = brickTint; }
          else if (f === 0) {
            if (shop && front) { band = ATLAS.SHOP; col = shopTint; }
            else band = front || (!blank && b.front < 0 && r() < 0.5) ? ATLAS.GROUND : ATLAS.BLANK;
          } else band = blank ? ATLAS.BLANK : upper;
          wallBand(acc.facade, p0, p1, y0, y1, u, band, col, (y1 - y0) / FLOOR_H > 1.05 ? 1 : 1, f === 0);
        }
        // parapet (outer face)
        wallBand(acc.facade, p0, p1, H, H + PARAPET, u, brick ? ATLAS.BRICK : ATLAS.BLANK, brick ? brickTint : paint, PARAPET / FLOOR_H);
      }
      u += L;
    }

    // roof
    const inner = shed ? ring : inset(ring, 0.22);
    const roofY = shed ? H : H;
    const contour = inner.map((p) => new THREE.Vector2(p[0], p[1]));
    let tris = [];
    try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { tris = []; }
    for (const t of tris) {
      let a = inner[t[0]], bb = inner[t[1]], c = inner[t[2]];
      if ((bb[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (bb[1] - a[1]) > 0) [bb, c] = [c, bb];
      acc.roof.tri([a[0], roofY, a[1]], [bb[0], roofY, bb[1]], [c[0], roofY, c[1]], [0, 1, 0], [a[0] / 8, a[1] / 8, bb[0] / 8, bb[1] / 8, c[0] / 8, c[1] / 8], roofCol);
    }
    if (!shed) {
      const capCol = (brick ? brickTint : paint).clone().multiplyScalar(0.92);
      for (let k = 0; k < n; k++) {
        const o0 = ring[k], o1 = ring[(k + 1) % n], i0 = inner[k], i1 = inner[(k + 1) % n];
        plainWall(acc.roof, i1, i0, H, H + PARAPET, capCol);
        hquad(acc.roof, o0, o1, i1, i0, H + PARAPET, capCol, [0, 0, 1, 0, 1, 0.05, 0, 0.05]);
      }
    }

    // roof furniture
    let ccx = 0, ccz = 0; for (const p of ring) { ccx += p[0]; ccz += p[1]; } ccx /= n; ccz /= n;
    const area = b.col ? b.col.hw * b.col.hd * 4 : 40;
    const ang = b.col ? Math.atan2(b.col.sa, b.col.ca) : 0;
    if (!shed && floors >= 2 && area > 45 && r() < 0.5 && b.col) { // stair room (mumty)
      const mw = 2.6, md = 3.0;
      const lx = (r() - 0.5) * Math.max(0, b.col.hw * 2 - mw - 1.2), lz = (r() - 0.5) * Math.max(0, b.col.hd * 2 - md - 1.2);
      const px = b.col.x + lx * b.col.ca - lz * b.col.sa, pz = b.col.z + lx * b.col.sa + lz * b.col.ca;
      if (pointIn(ring, px, pz)) {
        const ca = b.col.ca, sa = b.col.sa;
        const mc = [[-mw / 2, -md / 2], [mw / 2, -md / 2], [mw / 2, md / 2], [-mw / 2, md / 2]].map(([qx, qz]) => [px + qx * ca - qz * sa, pz + qx * sa + qz * ca]);
        for (const [a2, b2] of [[1, 0], [2, 1], [3, 2], [0, 3]]) wallBand(acc.facade, mc[a2], mc[b2], H, H + 2.5, 0, ATLAS.BLANK, paint, 2.5 / FLOOR_H);
        hquad(acc.roof, mc[0], mc[1], mc[2], mc[3], H + 2.5, paint.clone().multiplyScalar(0.85));
      }
    }
    if (!shed && r() < 0.72) { // water tank(s)
      const k = (r() * n) | 0, t = 0.25 + r() * 0.35;
      const px = ccx + (ring[k][0] - ccx) * t, pz = ccz + (ring[k][1] - ccz) * t;
      const rad = 0.5 + r() * 0.3, th = 1.0 + r() * 0.4, seg = 7, base = H + 0.4;
      const tc = tankCols[(r() * tankCols.length) | 0];
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
        const q0 = [px + Math.cos(a0) * rad, pz + Math.sin(a0) * rad], q1 = [px + Math.cos(a1) * rad, pz + Math.sin(a1) * rad];
        plainWall(acc.props, q1, q0, base, base + th, tc);
        acc.props.tri([px, base + th + 0.15, pz], [q1[0], base + th, q1[1]], [q0[0], base + th, q0[1]], [0, 1, 0], [0, 0, 0, 0, 0, 0], tc);
      }
      boxInto(acc.props, px, H, pz, rad * 2, 0.4, rad * 2, ang, standCol);
    }

    // shop front: flex signboard + awning
    if (shop && b.front >= 0) {
      const p0 = ring[b.front], p1 = ring[(b.front + 1) % n];
      const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz);
      if (L > 2.5) {
        const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
        const cell = (i * 31 + b.paint) % (SIGN_COLS * SIGN_ROWS);
        const su0 = (cell % SIGN_COLS) / SIGN_COLS, sv1 = 1 - Math.floor(cell / SIGN_COLS) / SIGN_ROWS, su1 = su0 + 1 / SIGN_COLS, sv0 = sv1 - 1 / SIGN_ROWS;
        const sw = Math.min(L - 0.4, 4.5 + r() * 3), sh = Math.min(1.1, sw / 5.33);
        const mid = (L - sw) / 2 + (r() - 0.5) * Math.max(0, L - sw - 0.4);
        const off = 0.14;
        const s0 = [p0[0] + ux * mid + nx * off, p0[1] + uz * mid + nz * off], s1 = [s0[0] + ux * sw, s0[1] + uz * sw];
        const y0 = FLOOR_H - 0.62, y1 = y0 + sh;
        acc.sign.quad([s0[0], y0, s0[1]], [s1[0], y0, s1[1]], [s1[0], y1, s1[1]], [s0[0], y1, s0[1]], [nx, 0, nz], [su0, sv0, su1, sv0, su1, sv1, su0, sv1], white);
        plainWall(acc.props, [s0[0] - nx * 0.08 - ux * 0.05, s0[1] - nz * 0.08 - uz * 0.05], [s1[0] - nx * 0.08 + ux * 0.05, s1[1] - nz * 0.08 + uz * 0.05], y0 - 0.06, y1 + 0.06, signFrame);
        if (r() < 0.6) { // sloping tin/tarp awning over the shutter
          const ac = AWNINGS[(r() * AWNINGS.length) | 0];
          const depth = 1.1 + r() * 0.8, yA = y0 - 0.05, yB = yA - 0.4 - r() * 0.25;
          const a0 = [p0[0] + nx * 0.05, p0[1] + nz * 0.05], a1 = [p1[0] + nx * 0.05, p1[1] + nz * 0.05];
          const b0 = [a0[0] + nx * depth, a0[1] + nz * depth], b1 = [a1[0] + nx * depth, a1[1] + nz * depth];
          const ny = depth / Math.hypot(depth, yA - yB);
          acc.props.quad([a0[0], yA, a0[1]], [b0[0], yB, b0[1]], [b1[0], yB, b1[1]], [a1[0], yA, a1[1]], [nx * (1 - ny), ny, nz * (1 - ny)], [0, 0, 0, 0, 0, 0, 0, 0], ac);
        }
      }
    }
  }

  // ---- chunks
  const group = new THREE.Group(); group.name = 'buildings';
  const byKey = new Map();
  items.forEach((b, i) => {
    const cx = Math.floor(b.cx / CHUNK), cz = Math.floor(b.cz / CHUNK), k = cx + ',' + cz;
    let c = byKey.get(k);
    if (!c) {
      const g = new THREE.Group();
      g.userData.center = new THREE.Vector3((cx + 0.5) * CHUNK, 0, (cz + 0.5) * CHUNK);
      byKey.set(k, (c = { g, items: [], state: 0, acc: null, next: 0 }));
      group.add(g);
    }
    b.chunk = c;
    c.items.push(i);
  });
  const chunks = [...byKey.values()];
  const newAcc = () => ({ facade: new Acc(), roof: new Acc(), sign: new Acc(), props: new Acc() });
  function finalize(c) {
    for (const [k, acc] of Object.entries(c.acc)) {
      const geo = acc.geo(); if (!geo) continue;
      const m = new THREE.Mesh(geo, mats[k]);
      m.castShadow = k !== 'sign'; m.receiveShadow = true;
      c.g.add(m);
    }
    c.acc = null; c.state = 2;
  }
  function step(c, deadline) {
    if (c.state === 0) { c.acc = newAcc(); c.next = 0; c.state = 1; }
    while (c.next < c.items.length) {
      const i = c.items[c.next++];
      emit(c.acc, items[i], i);
      if ((c.next & 31) === 0 && performance.now() > deadline) return false;
    }
    finalize(c);
    return true;
  }
  function dispose(c) {
    for (const m of c.g.children) m.geometry.dispose();
    c.g.clear(); c.state = 0; c.acc = null;
  }
  const dist = (c, f) => Math.hypot(c.g.userData.center.x - f.x, c.g.userData.center.z - f.z);
  let current = null;
  // Called every frame: builds the nearest missing chunk within `radius` for up to budgetMs.
  function update(focus, radius, budgetMs = 5) {
    const deadline = performance.now() + budgetMs;
    while (performance.now() < deadline) {
      if (!current || current.state === 2 || dist(current, focus) > radius + CHUNK) {
        current = null; let bd = radius;
        for (const c of chunks) if (c.state !== 2) { const d = dist(c, focus); if (d < bd) { bd = d; current = c; } }
        if (!current) break;
      }
      step(current, deadline);
    }
    for (const c of chunks) if (c.state === 2 && dist(c, focus) > radius + CHUNK * 2.2) dispose(c);
  }
  function prime(focus, radius) {
    const near = chunks.filter((c) => c.state !== 2 && dist(c, focus) < radius).sort((a, b) => dist(a, focus) - dist(b, focus));
    for (const c of near) step(c, Infinity);
  }
  // Remove real buildings that overlap a plot the game builds itself (e.g. the home compound).
  function exclude(poly) {
    for (const b of items) {
      if (b.excluded) continue;
      if (pointIn(poly, b.cx, b.cz) || (b.ring && (b.ring.some((p) => pointIn(poly, p[0], p[1])) || poly.some((p) => pointIn(b.ring, p[0], p[1]))))) {
        b.excluded = true;
        if (b.walls) b.walls.forEach((w) => colliders.remove(w)); else if (b.col) colliders.remove(b.col);
        if (b.chunk.state !== 0) dispose(b.chunk);
      }
    }
  }
  const setNight = (on) => {
    mats.facade.emissiveIntensity = on ? 0.85 : 0;
    mats.sign.emissiveIntensity = on ? 0.35 : 0;
  };
  return { group, chunks: chunks.map((c) => c.g), colliders, mats, setNight, update, prime, exclude, count: nB, props: items.length - nB };
}

export class ColliderGrid {
  constructor(items) {
    this.cell = 20; this.map = new Map(); this.items = items;
    for (const it of items) this.insert(it);
  }
  cells(it) {
    const r = Math.hypot(it.hw, it.hd), c = this.cell, out = [];
    for (let gx = Math.floor((it.x - r) / c); gx <= Math.floor((it.x + r) / c); gx++)
      for (let gz = Math.floor((it.z - r) / c); gz <= Math.floor((it.z + r) / c); gz++) out.push(gx * 100003 + gz);
    return out;
  }
  insert(it) {
    for (const k of this.cells(it)) { let a = this.map.get(k); if (!a) this.map.set(k, (a = [])); a.push(it); }
  }
  // Add an oriented box collider at runtime (venues, props). ang = rotation so that local x = (cos, sin).
  add(x, z, w, d, ang = 0) { const it = { x, z, hw: w / 2, hd: d / 2, ca: Math.cos(ang), sa: Math.sin(ang) }; this.items.push(it); this.insert(it); return it; }
  remove(it) { for (const k of this.cells(it)) { const a = this.map.get(k); if (!a) continue; const i = a.indexOf(it); if (i >= 0) a.splice(i, 1); } }
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
