// High-quality procedural cars: sculpted extruded body with wheel wells, tumblehome, glass greenhouse,
// clear-coat paint, LED lights, alloy wheels. Body styles: suv, sedan, coupe, hatch.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { garland, sag, mat } from '../world/decor.js';
import { textTexture, blobTexture } from '../world/textures.js';

export const PAINTS = {
  pearl: { name: 'Pearl White', color: 0xf3f2ee, metalness: 0.25, roughness: 0.3 },
  black: { name: 'Midnight Black', color: 0x0d0e10, metalness: 0.55, roughness: 0.28 },
  emerald: { name: 'Emerald', color: 0x0c4a37, metalness: 0.6, roughness: 0.3 },
  champagne: { name: 'Champagne Gold', color: 0xc9b08a, metalness: 0.75, roughness: 0.3 },
  blue: { name: 'Royal Blue', color: 0x183a78, metalness: 0.6, roughness: 0.3 },
  red: { name: 'Ruby Red', color: 0x7e1020, metalness: 0.55, roughness: 0.3 },
  silver: { name: 'Silver', color: 0xb5b8bc, metalness: 0.85, roughness: 0.3 },
};

// Side profiles (z along the car, front = +z; y up). Each returns spec values used for details.
const STYLES = {
  suv: {
    name: 'Luxury SUV', L: 4.8, W: 1.95, r: 0.40, zF: 1.47, zR: -1.38, belt: 1.22, roof: 1.84, hood: 1.13, ws: 1.18, rearZ: -2.43, frontZ: 2.45, ride: 0.36,
    vmax: 36, boost: 50, accel: 8.5, bevel: { t: 0.085, s: 0.045 }, cladding: true,
    profile(s, notch) {
      s.moveTo(-2.40, 0.46); s.lineTo(-2.43, 1.0); s.quadraticCurveTo(-2.45, 1.18, -2.32, 1.22);
      s.lineTo(-2.20, 1.74); s.quadraticCurveTo(-2.14, 1.82, -1.95, 1.83); s.lineTo(0.30, 1.84); s.quadraticCurveTo(0.48, 1.83, 0.58, 1.75);
      s.lineTo(1.18, 1.27); s.quadraticCurveTo(1.28, 1.20, 1.48, 1.19); s.lineTo(2.28, 1.13); s.quadraticCurveTo(2.44, 1.10, 2.45, 0.95);
      s.lineTo(2.43, 0.48); s.quadraticCurveTo(2.41, 0.37, 2.27, 0.36); notch(s, 0.36); s.lineTo(-2.26, 0.36); s.quadraticCurveTo(-2.39, 0.37, -2.40, 0.46);
    },
    green: [[-2.32, 1.22], [-2.20, 1.74], [-1.95, 1.83], [0.30, 1.84], [0.58, 1.75], [1.18, 1.27], [1.28, 1.21]],
    winF: [[-0.15, 1.29], [-0.15, 1.76], [0.28, 1.78], [0.52, 1.72], [1.05, 1.30]],
    winR: [[-2.12, 1.29], [-2.04, 1.66], [-1.90, 1.77], [-0.32, 1.78], [-0.32, 1.29]],
    rails: true,
  },
  sedan: {
    name: 'Executive Sedan', L: 4.9, W: 1.86, r: 0.35, zF: 1.48, zR: -1.46, belt: 1.03, roof: 1.47, hood: 0.94, ws: 1.25, rearZ: -2.46, frontZ: 2.46, ride: 0.3,
    vmax: 38, boost: 52, accel: 9,
    profile(s, notch) {
      s.moveTo(-2.43, 0.40); s.lineTo(-2.46, 0.85); s.quadraticCurveTo(-2.47, 1.0, -2.30, 1.03); s.lineTo(-1.75, 1.07);
      s.lineTo(-1.18, 1.42); s.quadraticCurveTo(-1.03, 1.48, -0.83, 1.49); s.lineTo(0.25, 1.49); s.quadraticCurveTo(0.46, 1.48, 0.6, 1.40);
      s.lineTo(1.25, 1.05); s.quadraticCurveTo(1.35, 0.99, 1.55, 0.98); s.lineTo(2.28, 0.90); s.quadraticCurveTo(2.46, 0.86, 2.46, 0.72);
      s.lineTo(2.43, 0.42); s.quadraticCurveTo(2.41, 0.32, 2.26, 0.31); notch(s, 0.31); s.lineTo(-2.26, 0.31); s.quadraticCurveTo(-2.41, 0.32, -2.43, 0.40);
    },
    green: [[-1.75, 1.07], [-1.18, 1.42], [-0.83, 1.49], [0.25, 1.49], [0.6, 1.40], [1.25, 1.05], [1.32, 1.02]],
    winF: [[-0.05, 1.10], [-0.05, 1.42], [0.24, 1.43], [0.52, 1.36], [1.08, 1.10]],
    winR: [[-1.62, 1.10], [-1.12, 1.38], [-0.88, 1.43], [-0.22, 1.43], [-0.22, 1.10]],
  },
  coupe: {
    name: 'Sports Coupe', L: 4.55, W: 1.95, r: 0.36, zF: 1.40, zR: -1.33, belt: 0.98, roof: 1.31, hood: 0.82, ws: 1.1, rearZ: -2.26, frontZ: 2.28, ride: 0.26,
    vmax: 42, boost: 58, accel: 10.5, calipers: true,
    profile(s, notch) {
      s.moveTo(-2.22, 0.38); s.lineTo(-2.25, 0.80); s.quadraticCurveTo(-2.27, 0.96, -2.10, 0.99); s.lineTo(-1.92, 1.02);
      s.lineTo(-0.85, 1.28); s.quadraticCurveTo(-0.65, 1.33, -0.45, 1.33); s.lineTo(0.05, 1.32); s.quadraticCurveTo(0.25, 1.29, 0.38, 1.21);
      s.lineTo(1.10, 0.93); s.quadraticCurveTo(1.2, 0.87, 1.4, 0.85); s.lineTo(2.1, 0.75); s.quadraticCurveTo(2.28, 0.71, 2.28, 0.56);
      s.lineTo(2.23, 0.36); s.quadraticCurveTo(2.2, 0.27, 2.05, 0.26); notch(s, 0.26); s.lineTo(-2.06, 0.26); s.quadraticCurveTo(-2.2, 0.27, -2.22, 0.38);
    },
    green: [[-1.92, 1.02], [-0.85, 1.28], [-0.45, 1.33], [0.05, 1.32], [0.38, 1.21], [1.10, 0.93], [1.16, 0.90]],
    winF: [[-0.75, 1.02], [-0.72, 1.25], [-0.45, 1.29], [0.04, 1.28], [0.32, 1.19], [0.95, 0.99]],
    winR: null,
  },
  hatch: {
    name: 'City Hatchback', L: 3.9, W: 1.72, r: 0.31, zF: 1.24, zR: -1.2, belt: 1.02, roof: 1.57, hood: 0.92, ws: 1.05, rearZ: -1.96, frontZ: 1.97, ride: 0.3,
    vmax: 30, boost: 40, accel: 7,
    profile(s, notch) {
      s.moveTo(-1.92, 0.40); s.lineTo(-1.95, 1.0); s.quadraticCurveTo(-1.96, 1.1, -1.88, 1.18); s.lineTo(-1.75, 1.5); s.quadraticCurveTo(-1.7, 1.56, -1.55, 1.57);
      s.lineTo(0.15, 1.57); s.quadraticCurveTo(0.35, 1.55, 0.45, 1.47); s.lineTo(1.05, 1.08); s.quadraticCurveTo(1.15, 1.02, 1.35, 1.0); s.lineTo(1.85, 0.92);
      s.quadraticCurveTo(1.97, 0.88, 1.97, 0.75); s.lineTo(1.94, 0.40); s.quadraticCurveTo(1.92, 0.32, 1.8, 0.31); notch(s, 0.31); s.lineTo(-1.8, 0.31); s.quadraticCurveTo(-1.91, 0.32, -1.92, 0.40);
    },
    green: [[-1.86, 1.12], [-1.75, 1.5], [-1.55, 1.57], [0.15, 1.57], [0.45, 1.47], [1.05, 1.08], [1.1, 1.04]],
    winF: [[-0.15, 1.08], [-0.15, 1.5], [0.14, 1.51], [0.4, 1.43], [0.92, 1.1]],
    winR: [[-1.7, 1.08], [-1.62, 1.44], [-1.5, 1.51], [-0.3, 1.51], [-0.3, 1.08]],
  },
};
export const CAR_STYLES = Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, { name: v.name, vmax: v.vmax, boost: v.boost, accel: v.accel }]));

const ss = (t) => t * t * (3 - 2 * t);
function taper(geo, S, extra = 0) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), x = p.getX(i);
    let f = 1;
    if (y > S.belt) f = 1 - 0.15 * ss(Math.min(1, (y - S.belt) / (S.roof - S.belt)));
    else if (y < S.ride + 0.2) f = 1 - 0.035 * ss(Math.min(1, (S.ride + 0.2 - y) / 0.2));
    else f = 1 + 0.012 * Math.sin(((y - S.ride - 0.2) / (S.belt - S.ride - 0.2)) * Math.PI); // gentle shoulder bulge
    p.setX(i, x * f + Math.sign(x) * extra);
  }
  p.needsUpdate = true;
}

function extrudeProfile(shapeFn, depth, bevel) {
  const s = new THREE.Shape();
  shapeFn(s);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: !!bevel, bevelThickness: bevel ? bevel.t : 0, bevelSize: bevel ? bevel.s : 0, bevelSegments: bevel ? 4 : 0, curveSegments: 14 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2); // shape x -> world z, extrusion -> world x
  return g;
}
// Offset an open top chain (rear -> front) outward by d; endpoints are belt-line points pushed horizontally.
function offsetChain(pts, d) {
  const out = pts.map(([z, y], i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dz = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dz, dy) || 1; dz /= L; dy /= L;
    return [z - dy * d, y + dz * d];
  });
  out[0] = [pts[0][0] - d, pts[0][1]]; out[out.length - 1] = [pts[pts.length - 1][0] + d, pts[pts.length - 1][1]];
  return out;
}
const polyShape = (pts) => (s) => { s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); };

function tireGeo(r, w) {
  const pts = [];
  const side = r * 0.32;
  for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI; pts.push(new THREE.Vector2(r - side + Math.cos(a) * side * 0.9 + side * 0.1, (Math.sin(a) * w) / 2)); }
  pts.unshift(new THREE.Vector2(r * 0.66, -w / 2)); pts.push(new THREE.Vector2(r * 0.66, w / 2));
  const g = new THREE.LatheGeometry(pts, 28);
  g.rotateZ(Math.PI / 2);
  return g;
}

export function buildCarModel({ paint = 'pearl', decor = null, type = 'suv' } = {}) {
  const S = STYLES[type] || STYLES.suv;
  const P = PAINTS[paint] || PAINTS.pearl;
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const paintM = new THREE.MeshPhysicalMaterial({ color: P.color, metalness: P.metalness, roughness: P.roughness, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.3 });
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0x0a1014, metalness: 0.2, roughness: 0.05, clearcoat: 1, envMapIntensity: 1.6 });
  const trimM = new THREE.MeshStandardMaterial({ color: 0x151618, metalness: 0.3, roughness: 0.55 });
  const chromeM = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 1, roughness: 0.12 });
  const headM = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, emissive: 0xeaf2ff, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.1 });
  const drlM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const tailM = new THREE.MeshStandardMaterial({ color: 0x500509, emissive: 0xff1020, emissiveIntensity: 0.5, roughness: 0.3 });
  const { L, W, r, zF, zR } = S;
  const notchR = r + 0.07;
  const notch = (s, yb) => {
    // bottom edge runs front -> rear: front wheel well then rear wheel well
    for (const zc of [zF, zR]) { s.lineTo(zc + notchR, yb); s.lineTo(zc + notchR, r); s.absarc(zc, r, notchR, 0, Math.PI, false); s.lineTo(zc - notchR, yb); }
  };
  // ---- body shell
  const bt = S.bevel?.t ?? 0.12, bs = S.bevel?.s ?? 0.06;
  let shell = extrudeProfile((s) => S.profile(s, notch), W - bt * 2, { t: bt, s: bs });
  taper(shell, S);
  shell.deleteAttribute('uv');
  shell = toCreasedNormals(shell, Math.PI / 3.2);
  const shellM = new THREE.Mesh(shell, paintM); body.add(shellM);
  // ---- glass: greenhouse (windscreen + rear glass + black roof), then side windows
  let gh = extrudeProfile(polyShape(offsetChain(S.green, bs + 0.012)), W - 0.34, null);
  taper(gh, S); gh.deleteAttribute('uv');
  body.add(new THREE.Mesh(gh, glassM));
  for (const poly of [S.winF, S.winR]) {
    if (!poly) continue;
    let wg = extrudeProfile(polyShape(poly), W + 0.002, null);
    taper(wg, S, 0.012); wg.deleteAttribute('uv');
    body.add(new THREE.Mesh(wg, glassM));
  }
  // black wheel-arch cladding (SUV)
  if (S.cladding) for (const zc of [zF, zR]) for (const sd of [-1, 1]) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(notchR + 0.025, 0.045, 6, 24, Math.PI), trimM);
    arch.rotation.y = Math.PI / 2; arch.scale.set(1, 1, 0.6); arch.position.set(sd * (W / 2 - 0.02), r, zc); body.add(arch);
  }
  // wheel-well liners (hide see-through) and side skirts
  for (const zc of [zF, zR]) {
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(notchR - 0.01, notchR - 0.01, W - 0.12, 20, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 1, side: THREE.BackSide }));
    liner.rotation.z = Math.PI / 2; liner.position.set(0, r, zc); body.add(liner);
  }
  for (const sd of [-1, 1]) {
    const sk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, zF - zR - notchR * 2 - 0.05), trimM);
    sk.position.set(sd * (W / 2 - 0.035 * W / 2), S.ride + 0.1, (zF + zR) / 2); body.add(sk);
    // mirror
    const mz = S.ws + 0.02, my = S.belt + 0.1;
    const mirror = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), paintM); mirror.scale.set(1.0, 0.75, 1.5); mirror.position.set(sd * (W / 2 + 0.06), my, mz - 0.12); body.add(mirror);
    const mglass = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), new THREE.MeshStandardMaterial({ color: 0x9aa6b0, metalness: 1, roughness: 0.05 }));
    mglass.position.set(sd * (W / 2 + 0.06), my, mz - 0.27); mglass.rotation.y = Math.PI; body.add(mglass);
    // door handles + lower chrome line
    for (const z of [0.35, -0.75]) { if (z > S.ws || z < zR) continue; const h = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.03, 0.17), chromeM); h.position.set(sd * (W / 2 + 0.003), S.belt - 0.08, z); body.add(h); }
    const cl = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 1.9), chromeM); cl.position.set(sd * (W / 2 - 0.004), S.belt - 0.005, (S.ws + zR) / 2 - 0.2); body.add(cl);
  }
  if (S.rails) for (const sd of [-1, 1]) { const rr = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 2.0), new THREE.MeshStandardMaterial({ color: 0x9a9da2, metalness: 0.9, roughness: 0.3 })); rr.position.set(sd * 0.68, S.roof + 0.03, -0.75); body.add(rr); }
  // ---- front: grille with chrome slats, LED headlights with DRL, lower intake, fog lamps
  const fz = S.frontZ;
  const gw = W * 0.5, gh2 = (S.hood - S.ride) * 0.42, gy = S.ride + (S.hood - S.ride) * 0.55;
  const grille = new THREE.Mesh(new THREE.BoxGeometry(gw, gh2, 0.06), trimM); grille.position.set(0, gy, fz - 0.02); body.add(grille);
  for (let i = 0; i < 5; i++) { const sl = new THREE.Mesh(new THREE.BoxGeometry(gw * 0.98, 0.012, 0.02), chromeM); sl.position.set(0, gy - gh2 / 2 + (i + 0.5) * (gh2 / 5), fz + 0.015); body.add(sl); }
  const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), chromeM); emblem.position.set(0, gy, fz + 0.03); body.add(emblem);
  for (const sd of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(W * 0.22, 0.075, 0.1), headM); hl.position.set(sd * W * 0.35, S.hood - 0.08, fz - 0.07); hl.rotation.y = sd * 0.25; body.add(hl);
    const drl = new THREE.Mesh(new THREE.BoxGeometry(W * 0.22, 0.016, 0.02), drlM); drl.position.set(sd * W * 0.35, S.hood - 0.13, fz - 0.03); drl.rotation.y = sd * 0.25; body.add(drl);
    const fog = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), headM); fog.position.set(sd * W * 0.36, S.ride + 0.16, fz + 0.005); body.add(fog);
  }
  const intake = new THREE.Mesh(new THREE.BoxGeometry(W * 0.62, 0.1, 0.05), trimM); intake.position.set(0, S.ride + 0.12, fz - 0.01); body.add(intake);
  if (type === 'suv') { const skid = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, 0.05, 0.04), new THREE.MeshStandardMaterial({ color: 0xb0b3b8, metalness: 0.9, roughness: 0.3 })); skid.position.set(0, S.ride + 0.03, fz - 0.03); body.add(skid); }
  // ---- rear: full-width light bar, corner clusters, plate, exhausts
  const rz = S.rearZ;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.045, 0.04), tailM); bar.position.set(0, S.belt - 0.14, rz - 0.01); body.add(bar);
  for (const sd of [-1, 1]) { const tc = new THREE.Mesh(new THREE.BoxGeometry(W * 0.17, 0.12, 0.05), tailM); tc.position.set(sd * W * 0.39, S.belt - 0.16, rz + 0.01); body.add(tc); }
  const rb = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.12, 0.05), trimM); rb.position.set(0, S.ride + 0.1, rz + 0.01); body.add(rb);
  for (const sd of [-1, 1]) { const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12).rotateX(Math.PI / 2), chromeM); ex.position.set(sd * W * 0.3, S.ride + 0.06, rz - 0.02); body.add(ex); }
  const plateT = textTexture('UK 06 S 2403', { w: 512, h: 120, font: 'bold 74px Arial', color: '#111', bg: '#f4f4f0' });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.115), new THREE.MeshBasicMaterial({ map: plateT })); plate.position.set(0, S.ride + 0.3, fz + 0.04); body.add(plate);
  const plateR = plate.clone(); plateR.rotation.y = Math.PI; plateR.position.set(0, S.ride + 0.33, rz - 0.04); body.add(plateR);
  body.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // ---- wheels: profiled tyres, 5 double-spoke alloys, discs, calipers
  const wheels = [];
  const tg = tireGeo(r, 0.25);
  const tireM = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.92 });
  const rimM = new THREE.MeshStandardMaterial({ color: type === 'coupe' ? 0x2a2c30 : 0xcfd2d6, metalness: 0.95, roughness: 0.22 });
  const discM = new THREE.MeshStandardMaterial({ color: 0x77797c, metalness: 0.9, roughness: 0.4 });
  const calM = new THREE.MeshStandardMaterial({ color: S.calipers ? 0xc0141c : 0x3a3a3a, roughness: 0.4 });
  for (const [sx, zc] of [[-1, zF], [1, zF], [-1, zR], [1, zR]]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * (W / 2 - 0.15), r, zc); g.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    const tire = new THREE.Mesh(tg, tireM); tire.castShadow = true; spin.add(tire);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.66, r * 0.66, 0.22, 24, 1, true).rotateZ(Math.PI / 2), rimM); spin.add(barrel);
    const face = new THREE.Group(); face.position.x = sx * 0.1; spin.add(face);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.18, 0.05, 16).rotateZ(Math.PI / 2), rimM); face.add(hub);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.64, 0.015, 6, 28).rotateY(Math.PI / 2), rimM); face.add(lip);
    for (let k = 0; k < 5; k++) for (const off of [-0.09, 0.09]) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, r * 0.5, 0.035), rimM);
      const a = (k / 5) * Math.PI * 2 + off;
      sp.position.set(0, Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38); sp.rotation.x = a; face.add(sp);
    }
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.52, r * 0.52, 0.02, 20).rotateZ(Math.PI / 2), discM); disc.position.x = -sx * 0.02; pivot.add(disc);
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.16), calM); cal.position.set(sx * 0.02, r * 0.3, zc > 0 ? -r * 0.32 : r * 0.32); pivot.add(cal);
    wheels.push({ pivot, spin, front: zc > 0 });
  }
  // soft contact shadow
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.45, L * 1.15).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.85 }));
  blob.position.y = 0.13; blob.renderOrder = 6; g.add(blob);

  // ---- decorations (baraat flowers / Just Married)
  if (decor === 'flowers' || decor === 'justMarried') {
    const roseCols = [0xffffff, 0xf4c7cc, 0xe9b8b5, 0xfff3f0];
    const goldR = mat(0xd4af37, { standard: true, metalness: 0.7, roughness: 0.3 });
    const hz0 = fz - 0.15, hz1 = S.ws + 0.1, hy = S.hood + 0.03;
    g.add(garland([new THREE.Vector3(-W / 2 + 0.15, hy, hz0), new THREE.Vector3(W / 2 - 0.15, hy + 0.08, hz1)], roseCols, 0.05, 1.1));
    g.add(garland([new THREE.Vector3(W / 2 - 0.15, hy, hz0), new THREE.Vector3(-W / 2 + 0.15, hy + 0.08, hz1)], roseCols, 0.05, 1.1));
    const heart = new THREE.Group();
    for (let i = 0; i < 70; i++) {
      const t = (i / 70) * Math.PI * 2;
      const x = Math.sin(t) ** 3 * 0.3, z = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16 * 0.3;
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 1), mat(i % 3 ? 0xd94a64 : 0xffffff)); f.position.set(x, 0, z); heart.add(f);
    }
    heart.position.set(0, hy + 0.05, (hz0 + hz1) / 2); g.add(heart);
    for (const sd of [-1, 1]) {
      g.add(garland(sag(new THREE.Vector3(sd * W * 0.42, S.roof - 0.02, S.ws - 0.55), new THREE.Vector3(sd * W * 0.42, S.roof - 0.02, rz + 0.55), 0.18, 16), roseCols, 0.055, 1));
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, L * 0.66), goldR); rib.position.set(sd * (W / 2 + 0.008), S.belt - 0.22, 0); g.add(rib);
    }
    if (decor === 'justMarried') {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.27), new THREE.MeshBasicMaterial({ map: textTexture('Just Married', { w: 1024, h: 256, font: '150px "Great Vibes", cursive', color: '#9a7620', bg: '#f7f0e1' }), side: THREE.DoubleSide }));
      sign.position.set(0, S.ride + 0.62, rz - 0.07); sign.rotation.y = Math.PI; g.add(sign);
    }
  }
  return { group: g, body, wheels, headM, tailM, length: L, width: W, wheelbase: zF - zR, height: S.roof, frontZ: fz, style: type, perf: { vmax: S.vmax, boost: S.boost, accel: S.accel } };
}
