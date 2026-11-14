import * as THREE from 'three';
import { roadTextures } from './textures.js';

const CLASS = {
  trunk: 'major', primary: 'major', secondary: 'major',
  tertiary: 'street', unclassified: 'street', residential: 'street', living_street: 'street', service: 'street',
  pedestrian: 'street', trunk_link: 'street', primary_link: 'street', services: 'street',
  track: 'dirt', path: 'dirt',
};
const LAYER = { shoulder: { y: 0.05, order: 1, rep: 6 }, dirt: { y: 0.06, order: 2, rep: 8 }, street: { y: 0.08, order: 3, rep: 8 }, major: { y: 0.1, order: 4, rep: 12 } };
export const CHUNK = 400;

export class RoadNetwork {
  constructor(roads) {
    this.roads = roads;
    this.cell = 25;
    this.grid = new Map();
    roads.forEach((r, ri) => {
      r.cls = CLASS[r.t] || 'street';
      const p = r.p;
      for (let i = 0; i < p.length - 2; i += 2) {
        const seg = { ax: p[i], az: p[i + 1], bx: p[i + 2], bz: p[i + 3], hw: r.w / 2, r: ri };
        const c = this.cell;
        const x0 = Math.floor((Math.min(seg.ax, seg.bx) - seg.hw) / c), x1 = Math.floor((Math.max(seg.ax, seg.bx) + seg.hw) / c);
        const z0 = Math.floor((Math.min(seg.az, seg.bz) - seg.hw) / c), z1 = Math.floor((Math.max(seg.az, seg.bz) + seg.hw) / c);
        for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
          const k = gx * 100003 + gz;
          let a = this.grid.get(k); if (!a) this.grid.set(k, (a = []));
          a.push(seg);
        }
      }
    });
  }

  // Nearest road segment info at a point: {dist, edge (dist - halfWidth), road, seg, t, dirx, dirz}
  query(x, z) {
    const c = this.cell, gx = Math.floor(x / c), gz = Math.floor(z / c);
    let best = null, bd = 1e9;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const a = this.grid.get((gx + dx) * 100003 + (gz + dz));
      if (!a) continue;
      for (const s of a) {
        const ex = s.bx - s.ax, ez = s.bz - s.az;
        const L2 = ex * ex + ez * ez || 1e-6;
        let t = ((x - s.ax) * ex + (z - s.az) * ez) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = s.ax + ex * t, qz = s.az + ez * t;
        const d = Math.hypot(x - qx, z - qz);
        const edge = d - s.hw;
        if (edge < bd) { bd = edge; const L = Math.sqrt(L2); best = { dist: d, edge, seg: s, road: this.roads[s.r], t, qx, qz, dirx: ex / L, dirz: ez / L }; }
      }
    }
    return best;
  }

  // Nearest road at any distance (expanding search), optionally skipping some classes.
  nearest(x, z, maxR = 800, skip = ['path']) {
    for (let r = 40; r <= maxR; r *= 2) {
      let best = null, bd = 1e9;
      for (const s of this.segmentsNear(x, z, r)) {
        const road = this.roads[s.r];
        if (skip.includes(road.t)) continue;
        const ex = s.bx - s.ax, ez = s.bz - s.az, L2 = ex * ex + ez * ez || 1e-6;
        let t = ((x - s.ax) * ex + (z - s.az) * ez) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = s.ax + ex * t, qz = s.az + ez * t, d = Math.hypot(x - qx, z - qz);
        if (d - s.hw < bd) { bd = d - s.hw; const L = Math.sqrt(L2); best = { dist: d, edge: d - s.hw, seg: s, road, t, qx, qz, dirx: ex / L, dirz: ez / L }; }
      }
      if (best && best.dist < r) return best;
    }
    return null;
  }

  // Insert an extra road at runtime (venue driveways).
  addRoad(road) {
    road.cls = CLASS[road.t] || 'street';
    const ri = this.roads.push(road) - 1;
    const p = road.p;
    for (let i = 0; i < p.length - 2; i += 2) {
      const seg = { ax: p[i], az: p[i + 1], bx: p[i + 2], bz: p[i + 3], hw: road.w / 2, r: ri };
      const c = this.cell;
      for (let gx = Math.floor((Math.min(seg.ax, seg.bx) - seg.hw) / c); gx <= Math.floor((Math.max(seg.ax, seg.bx) + seg.hw) / c); gx++)
        for (let gz = Math.floor((Math.min(seg.az, seg.bz) - seg.hw) / c); gz <= Math.floor((Math.max(seg.az, seg.bz) + seg.hw) / c); gz++) {
          const k = gx * 100003 + gz; let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(seg);
        }
    }
    return road;
  }

  segmentsNear(x, z, r) {
    const c = this.cell, out = new Set();
    for (let gx = Math.floor((x - r) / c); gx <= Math.floor((x + r) / c); gx++)
      for (let gz = Math.floor((z - r) / c); gz <= Math.floor((z + r) / c); gz++) {
        const a = this.grid.get(gx * 100003 + gz);
        if (a) for (const s of a) out.add(s);
      }
    return out;
  }
}

// ---------------------------------------------------------------- meshes
function ribbon(pts, hw, y, rep, out) {
  // pts: [x,z,...]; appends to out {pos, uv, idx}
  const n = pts.length / 2;
  if (n < 2) return;
  const base = out.pos.length / 3;
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2], z = pts[i * 2 + 1];
    let nx = 0, nz = 0;
    const seg = (a, b) => {
      const dx = pts[b * 2] - pts[a * 2], dz = pts[b * 2 + 1] - pts[a * 2 + 1];
      const L = Math.hypot(dx, dz) || 1; return [-dz / L, dx / L];
    };
    if (i > 0) { const [a, b] = seg(i - 1, i); nx += a; nz += b; }
    if (i < n - 1) { const [a, b] = seg(i, i + 1); nx += a; nz += b; }
    const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
    let scale = 1;
    if (i > 0 && i < n - 1) {
      const [a, b] = seg(i, i + 1);
      const cos = nx * a + nz * b;
      scale = Math.min(2.2, 1 / Math.max(0.3, cos));
    }
    if (i > 0) dist += Math.hypot(x - pts[i * 2 - 2], z - pts[i * 2 - 1]);
    const v = dist / rep;
    out.pos.push(x + nx * hw * scale, y, z + nz * hw * scale, x - nx * hw * scale, y, z - nz * hw * scale);
    out.uv.push(0, v, 1, v);
    if (i < n - 1) {
      const a = base + i * 2;
      out.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
}

function splitPolyline(p, maxLen) {
  const parts = [];
  let cur = [p[0], p[1]], len = 0;
  for (let i = 2; i < p.length; i += 2) {
    len += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    cur.push(p[i], p[i + 1]);
    if (len > maxLen && i < p.length - 2) { parts.push(cur); cur = [p[i], p[i + 1]]; len = 0; }
  }
  if (cur.length >= 4) parts.push(cur);
  return parts;
}

export function buildRoadMeshes(net) {
  const mats = {};
  const mk = (cls, tex) => new THREE.MeshLambertMaterial({
    map: tex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
  });
  mats.major = mk('major', roadTextures.major());
  mats.street = mk('street', roadTextures.street());
  mats.dirt = mk('dirt', roadTextures.dirt());
  mats.shoulder = mk('shoulder', roadTextures.shoulder());

  const chunks = new Map(); // key -> {cls: {pos,uv,idx}}
  const get = (cx, cz, cls) => {
    const k = cx + ',' + cz;
    let c = chunks.get(k); if (!c) chunks.set(k, (c = { cx, cz, layers: {} }));
    return c.layers[cls] || (c.layers[cls] = { pos: [], uv: [], idx: [] });
  };
  for (const r of net.roads) {
    for (const part of splitPolyline(r.p, 180)) {
      const mid = (part.length / 4 | 0) * 2;
      const cx = Math.floor(part[mid] / CHUNK), cz = Math.floor(part[mid + 1] / CHUNK);
      const L = LAYER[r.cls];
      ribbon(part, r.w / 2, L.y, L.rep * (r.cls === 'street' ? 1 : 1), get(cx, cz, r.cls));
      if (r.cls === 'major') ribbon(part, r.w / 2 + 3.5, LAYER.shoulder.y, LAYER.shoulder.rep, get(cx, cz, 'shoulder'));
      else if (r.cls === 'street' && r.w >= 7) ribbon(part, r.w / 2 + 2, LAYER.shoulder.y, LAYER.shoulder.rep, get(cx, cz, 'shoulder'));
    }
  }
  const group = new THREE.Group();
  group.name = 'roads';
  const list = [];
  for (const c of chunks.values()) {
    const g = new THREE.Group();
    g.position.set(0, 0, 0);
    for (const [cls, d] of Object.entries(c.layers)) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(d.pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      geo.setIndex(d.idx);
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mats[cls]);
      m.renderOrder = LAYER[cls].order;
      m.receiveShadow = true;
      g.add(m);
    }
    g.userData.center = new THREE.Vector3((c.cx + 0.5) * CHUNK, 0, (c.cz + 0.5) * CHUNK);
    group.add(g);
    list.push(g);
  }
  return { group, chunks: list, mats };
}
