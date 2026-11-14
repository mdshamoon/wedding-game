// Procedural stylized-realistic wedding characters (groom, bride, relatives, band, qazi ...).
// Everything is built from code: lathe/limb/ribbon geometry, deformed spheres and canvas textures.
// Hierarchical joints (THREE.Bone) drive rigid limbs; torso garments and long drapes are SkinnedMeshes
// bound to hips/spine/chest/thighs so kurtas, lehengas and dupattas bend and follow the legs.
import * as THREE from 'three'
import * as TX from './charTextures.js'

const V3 = THREE.Vector3
const TAU = Math.PI * 2
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const gauss = (x, s) => Math.exp(-(x * x) / (s * s))
function interp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], smooth(pts[i - 1][0], pts[i][0], x))
  }
  return pts[pts.length - 1][1]
}
function linterp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]))
  }
  return pts[pts.length - 1][1]
}

// ============================================================== caches
const GEO = new Map()
const MAT = new Map()
export function cachedGeo(key, make) {
  let g = GEO.get(key)
  if (!g) { g = make(); GEO.set(key, g) }
  return g
}
export function cachedMat(key, make) {
  let m = MAT.get(key)
  if (!m) { m = make(); m.userData.shared = true; MAT.set(key, m) }
  return m
}

// ============================================================== geometry helpers
/** Build an indexed grid surface. P: (nu+1)*(nv+1) Vector3 (row-major by v). Normal = dPv x dPu. */
export function gridGeo(nu, nv, P, U, { wrapU = false, flip = false, colors = null } = {}) {
  const W = nu + 1, n = W * (nv + 1)
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2)
  for (let k = 0; k < n; k++) {
    pos[k * 3] = P[k].x; pos[k * 3 + 1] = P[k].y; pos[k * 3 + 2] = P[k].z
    uv[k * 2] = U[k * 2]; uv[k * 2 + 1] = U[k * 2 + 1]
  }
  const du = new V3(), dv = new V3(), nn = new V3()
  const bad = new Uint8Array(n)
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const k = j * W + i
      let i0 = i - 1, i1 = i + 1
      if (wrapU) { if (i0 < 0) i0 = nu - 1; if (i1 > nu) i1 = 1 } else { i0 = Math.max(0, i0); i1 = Math.min(nu, i1) }
      const j0 = Math.max(0, j - 1), j1 = Math.min(nv, j + 1)
      du.subVectors(P[j * W + i1], P[j * W + i0])
      dv.subVectors(P[j1 * W + i], P[j0 * W + i])
      nn.crossVectors(dv, du)
      const l = nn.length()
      if (l < 1e-9 || du.lengthSq() < 1e-12) { bad[k] = 1; continue }
      nn.multiplyScalar((flip ? -1 : 1) / l)
      nor[k * 3] = nn.x; nor[k * 3 + 1] = nn.y; nor[k * 3 + 2] = nn.z
    }
  }
  // poles / degenerate rows: average the neighbouring row
  for (let j = 0; j <= nv; j++) {
    if (!bad[j * W]) continue
    const jn = j === 0 ? 1 : j - 1
    nn.set(0, 0, 0)
    for (let i = 0; i <= nu; i++) { const k = jn * W + i; nn.x += nor[k * 3]; nn.y += nor[k * 3 + 1]; nn.z += nor[k * 3 + 2] }
    nn.normalize()
    for (let i = 0; i <= nu; i++) { const k = j * W + i; if (bad[k]) { nor[k * 3] = nn.x; nor[k * 3 + 1] = nn.y; nor[k * 3 + 2] = nn.z } }
  }
  const idx = []
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * W + i, b = (j + 1) * W + i, c = (j + 1) * W + i + 1, d = j * W + i + 1
      if (flip) idx.push(a, d, b, b, d, c)
      else idx.push(a, b, d, b, c, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  if (colors) g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  g.setIndex(idx)
  return g
}

/** Lathe around Y with elliptical rows {y, rx, rz, zo}. u=0.5 is the front (+Z). v=1 at the first row. */
export function latheGeo(rows, { segs = 24, bulges = null, deform = null } = {}) {
  const nu = segs, nv = rows.length - 1
  const acc = [0]
  for (let j = 1; j < rows.length; j++) {
    acc[j] = acc[j - 1] + Math.hypot(rows[j].y - rows[j - 1].y, rows[j].rx - rows[j - 1].rx) + 1e-6
  }
  const total = acc[acc.length - 1]
  const P = [], U = []
  for (let j = 0; j <= nv; j++) {
    const r = rows[j]
    for (let i = 0; i <= nu; i++) {
      const phi = Math.PI + (TAU * i) / nu
      const s = Math.sin(phi), c = Math.cos(phi)
      const v = new V3(r.rx * s, r.y, r.rz * c + (r.zo || 0))
      if (bulges && c > 0) for (const b of bulges) v.z += b.a * gauss(r.y - b.y, b.s) * Math.pow(c, b.p || 2)
      if (deform) deform(v, phi, j, acc[j] / total)
      P.push(v); U.push(i / nu, 1 - acc[j] / total)
    }
  }
  return gridGeo(nu, nv, P, U, { wrapU: true })
}

/** Tapered limb along -Y from the joint. prof: [[t, r], ...] with t in 0..1. */
export function limbGeo(len, prof, { top = 'cap', bottom = 'cap', segs = 9, n = 4, ripple = 0, rippleFrom = 0.6, rippleFreq = 60, aspect = 1, topExt = 0.75 } = {}) {
  const rows = []
  const r0 = linterp(prof, 0), r1 = linterp(prof, 1)
  if (top === 'cap') for (const a of [0, 0.75, 1.3]) rows.push({ y: Math.cos(a) * r0 * topExt, r: Math.max(1e-4, Math.sin(a) * r0) })
  for (let k = 0; k <= n; k++) {
    const t = k / n
    let r = linterp(prof, t)
    if (ripple && t > rippleFrom) r += ripple * (0.5 + 0.5 * Math.sin(t * rippleFreq)) * smooth(rippleFrom, rippleFrom + 0.1, t)
    rows.push({ y: -t * len, r })
  }
  if (bottom === 'cap') for (const a of [1.3, 0.75, 0]) rows.push({ y: -len - Math.cos(a) * r1 * 0.75, r: Math.max(1e-4, Math.sin(a) * r1) })
  return latheGeo(rows.map(r => ({ y: r.y, rx: r.r, rz: r.r * aspect, zo: 0 })), { segs })
}

/** Ribbon along control points [{p, n, w}] (n = outward hint). */
export function ribbonGeo(ctrl, { segs = 36, cols = 2, puff = 0.006 } = {}) {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(c => new V3(...c.p)), false, 'catmullrom', 0.5)
  const P = [], U = []
  const T = new V3(), N = new V3(), S = new V3(), Nn = new V3(), pt = new V3()
  for (let j = 0; j <= segs; j++) {
    const t = j / segs
    curve.getPoint(t, pt); curve.getTangent(t, T)
    const f = t * (ctrl.length - 1), k = Math.min(Math.floor(f), ctrl.length - 2), fr = f - k
    const a = ctrl[k], b = ctrl[k + 1]
    N.set(lerp(a.n[0], b.n[0], fr), lerp(a.n[1], b.n[1], fr), lerp(a.n[2], b.n[2], fr)).normalize()
    const w = lerp(a.w, b.w, fr)
    S.crossVectors(N, T).normalize()
    Nn.crossVectors(T, S).normalize()
    for (let i = 0; i <= cols; i++) {
      const u = i / cols
      P.push(pt.clone().addScaledVector(S, (u - 0.5) * w).addScaledVector(Nn, puff * Math.sin(Math.PI * u)))
      U.push(u, 1 - t)
    }
  }
  return gridGeo(cols, segs, P, U)
}

/** Sweep an elliptical section along a curve. rad(t) -> [rSide, rUp]. */
export function sweepGeo(curve, rad, { segs = 24, radial = 12, up = new V3(0, 1, 0), closeStart = false, closeEnd = false } = {}) {
  const P = [], U = []
  const T = new V3(), S = new V3(), Up = new V3(), pt = new V3()
  const rows = []
  for (let j = 0; j <= segs; j++) rows.push(j / segs)
  if (closeStart) rows.unshift(-1)
  if (closeEnd) rows.push(2)
  for (const tt of rows) {
    const t = clamp(tt, 0, 1)
    curve.getPoint(t, pt); curve.getTangent(t, T)
    S.crossVectors(T, up).normalize()
    Up.crossVectors(S, T).normalize()
    let [rs, ru] = rad(t)
    if (tt < 0 || tt > 1) { rs = 1e-4; ru = 1e-4 }
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * TAU
      P.push(pt.clone().addScaledVector(S, Math.cos(a) * rs).addScaledVector(Up, Math.sin(a) * ru))
      U.push(i / radial, 1 - t)
    }
  }
  return gridGeo(radial, rows.length - 1, P, U, { wrapU: true })
}

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new V3(), _p = new V3()
export function mtx(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz)
  return new THREE.Matrix4().compose(_p.set(px, py, pz), _q.setFromEuler(_e), _s.set(sx, sy, sz))
}

/** Merge parts [{g, m?, c?}] into one indexed geometry (position, normal, uv, optional color). */
export function mergeGeos(parts, withColor = false) {
  let nv = 0, ni = 0
  for (const p of parts) {
    nv += p.g.attributes.position.count
    ni += p.g.index ? p.g.index.count : p.g.attributes.position.count
  }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2)
  const col = withColor ? new Float32Array(nv * 3) : null
  const idx = new Uint32Array(ni)
  let vo = 0, io = 0
  const v = new V3(), nm = new THREE.Matrix3(), c = new THREE.Color()
  for (const p of parts) {
    const g = p.g
    const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv
    if (p.m) nm.getNormalMatrix(p.m)
    if (withColor) c.set(p.c ?? 0xffffff)
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i); if (p.m) v.applyMatrix4(p.m)
      pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z
      v.fromBufferAttribute(na, i); if (p.m) v.applyMatrix3(nm).normalize()
      nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z
      if (ua) { uv[(vo + i) * 2] = ua.getX(i); uv[(vo + i) * 2 + 1] = ua.getY(i) }
      if (withColor) {
        const ca = g.attributes.color
        if (ca && p.c == null) { col[(vo + i) * 3] = ca.getX(i); col[(vo + i) * 3 + 1] = ca.getY(i); col[(vo + i) * 3 + 2] = ca.getZ(i) }
        else { col[(vo + i) * 3] = c.r; col[(vo + i) * 3 + 1] = c.g; col[(vo + i) * 3 + 2] = c.b }
      }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo
    else for (let i = 0; i < pa.count; i++) idx[io + i] = i + vo
    vo += pa.count
    io += g.index ? g.index.count : pa.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  out.setIndex(new THREE.BufferAttribute(idx, 1))
  return out
}

/** Average normals across duplicated seam vertices. */
export function weldNormals(g) {
  g.computeVertexNormals()
  const pa = g.attributes.position, na = g.attributes.normal
  const map = new Map()
  for (let i = 0; i < pa.count; i++) {
    const k = `${Math.round(pa.getX(i) * 1e4)},${Math.round(pa.getY(i) * 1e4)},${Math.round(pa.getZ(i) * 1e4)}`
    let e = map.get(k)
    if (!e) { e = []; map.set(k, e) }
    e.push(i)
  }
  const n = new V3()
  for (const e of map.values()) {
    if (e.length < 2) continue
    n.set(0, 0, 0)
    for (const i of e) { n.x += na.getX(i); n.y += na.getY(i); n.z += na.getZ(i) }
    n.normalize()
    for (const i of e) na.setXYZ(i, n.x, n.y, n.z)
  }
  return g
}

export function ell(rx, ry, rz, ws = 10, hs = 8) {
  const g = new THREE.SphereGeometry(1, ws, hs)
  g.scale(rx, ry, rz)
  return g
}

/** A flower/ball garland along a closed or open path (vertex coloured). */
export function garlandGeo(points, { closed = true, count = 40, r = 0.021, seed = 5, pendant = true, palette = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new V3(...p)), closed, 'catmullrom', 0.5)
  const rnd = TX.mulberry32(seed)
  const ico = new THREE.IcosahedronGeometry(1, 0)
  const parts = []
  const cols = palette || ['#f29a12', '#f6b21b', '#f29a12', '#ffffff', '#f6b21b', '#c4122f']
  const pt = new V3()
  for (let i = 0; i < count; i++) {
    curve.getPointAt(i / count, pt)
    const isRose = cols[i % cols.length] === '#c4122f'
    const rr = r * (isRose ? 1.1 : 0.9 + rnd() * 0.2)
    parts.push({ g: ico, m: mtx(pt.x, pt.y, pt.z, rnd() * 3, rnd() * 3, rnd() * 3, rr, rr * 0.85, rr), c: cols[i % cols.length] })
  }
  if (pendant) {
    // tassel cluster at the lowest point
    let low = new V3(0, 1e9, 0)
    for (let i = 0; i < 64; i++) { curve.getPointAt(i / 64, pt); if (pt.y < low.y) low.copy(pt) }
    for (let k = 0; k < 4; k++) parts.push({ g: ico, m: mtx(low.x + (k % 2 - 0.5) * r * 1.2, low.y - r * (1.4 + k * 0.9), low.z + 0.004, 0, k, 0, r * 0.95, r * 0.8, r * 0.95), c: k % 2 ? '#c4122f' : '#f29a12' })
  }
  const g = mergeGeos(parts, true)
  g.computeVertexNormals()
  return g
}

// ============================================================== layout and silhouettes
const LAYOUT = {
  m: { H: 1.75, ankleH: 0.085, shin: 0.425, thigh: 0.43, hipY: 0.94, hipX: 0.092, spineY: 1.07, chestY: 1.25, shoulderY: 1.425, clavX: 0.03, shoulderX: 0.184, neckY: 1.47, headY: 1.555, upperArm: 0.29, forearm: 0.255, headScale: 1, hand: 1 },
  f: { H: 1.62, ankleH: 0.075, shin: 0.395, thigh: 0.395, hipY: 0.865, hipX: 0.088, spineY: 0.99, chestY: 1.15, shoulderY: 1.322, clavX: 0.028, shoulderX: 0.163, neckY: 1.36, headY: 1.44, upperArm: 0.268, forearm: 0.235, headScale: 0.94, hand: 0.9 },
}
// [y, rx, rz, zo]
const ROWS = {
  m: [
    [1.515, 0.046, 0.044, -0.004], [1.492, 0.072, 0.060, -0.008], [1.470, 0.120, 0.078, -0.010], [1.450, 0.158, 0.089, -0.008],
    [1.420, 0.180, 0.100, -0.004], [1.380, 0.186, 0.106, 0.000], [1.320, 0.180, 0.111, 0.006], [1.250, 0.168, 0.108, 0.007],
    [1.170, 0.153, 0.101, 0.005], [1.100, 0.145, 0.097, 0.003], [1.030, 0.150, 0.099, 0.001], [0.970, 0.160, 0.102, -0.004],
    [0.910, 0.160, 0.100, -0.008], [0.860, 0.140, 0.090, -0.008], [0.820, 0.090, 0.064, -0.004], [0.795, 0.002, 0.002, 0],
  ],
  f: [
    [1.400, 0.040, 0.038, -0.004], [1.378, 0.064, 0.054, -0.006], [1.358, 0.110, 0.070, -0.007], [1.340, 0.140, 0.080, -0.005],
    [1.315, 0.158, 0.088, -0.002], [1.280, 0.160, 0.092, 0.002], [1.235, 0.150, 0.098, 0.010], [1.190, 0.138, 0.096, 0.010],
    [1.130, 0.124, 0.086, 0.004], [1.060, 0.120, 0.081, 0.000], [0.990, 0.142, 0.091, -0.004], [0.920, 0.166, 0.101, -0.010],
    [0.860, 0.162, 0.099, -0.012], [0.800, 0.136, 0.087, -0.010], [0.760, 0.080, 0.060, -0.005], [0.737, 0.002, 0.002, 0],
  ],
}
function bodyRows(sex, build) {
  const k = build === 'heavy' ? 1.09 : build === 'slim' ? 0.95 : 1
  const rows = ROWS[sex].map(([y, rx, rz, zo]) => ({ y, rx: rx * k, rz: rz * k, zo }))
  if (build === 'heavy') {
    const by = sex === 'm' ? 1.07 : 0.99
    for (const r of rows) {
      const g = gauss(r.y - by, 0.14)
      r.rz += 0.03 * g; r.zo += 0.035 * g; r.rx += 0.012 * g
    }
  }
  return rows
}
function sampleRows(rows, y) {
  if (y >= rows[0].y) return { ...rows[0], y }
  for (let i = 1; i < rows.length; i++) {
    if (y >= rows[i].y) {
      const a = rows[i - 1], b = rows[i], t = (y - b.y) / (a.y - b.y)
      return { y, rx: lerp(b.rx, a.rx, t), rz: lerp(b.rz, a.rz, t), zo: lerp(b.zo, a.zo, t) }
    }
  }
  return { ...rows[rows.length - 1], y }
}
/** Point on the elliptical surface of rows at height y, at lateral x, front (sgn=1) or back (-1). */
function surfPt(rows, x, y, sgn, off) {
  const r = sampleRows(rows, y)
  const rx = r.rx + off, rz = r.rz + off
  const q = clamp(x / rx, -0.98, 0.98)
  return [x, y, sgn * rz * Math.sqrt(1 - q * q) + r.zo]
}

// bones used for skinning (index order)
const SKIN_BONES = ['hips', 'spine', 'chest', 'thighL', 'thighR', 'neck']
function bodyWeights(L, legInfl = 0.6, legRange = 0.45) {
  return (x, y, z) => {
    if (y >= L.chestY + 0.02) return [2, 0, 0, 0, 1, 0, 0, 0]
    if (y >= L.spineY) { const t = smooth(L.spineY, L.chestY + 0.02, y); return [1, 2, 0, 0, 1 - t, t, 0, 0] }
    if (y >= L.hipY - 0.02) { const t = smooth(L.hipY - 0.02, L.spineY, y); return [0, 1, 0, 0, 1 - t, t, 0, 0] }
    const lt = clamp((L.hipY - 0.02 - y) / legRange, 0, 1) * legInfl
    const sd = smooth(-0.06, 0.06, x)
    return [0, 3, 4, 0, 1 - lt, lt * sd, lt * (1 - sd), 0]
  }
}
function addSkin(g, fn) {
  const pa = g.attributes.position, n = pa.count
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    const w = fn(pa.getX(i), pa.getY(i), pa.getZ(i))
    for (let k = 0; k < 4; k++) { si[i * 4 + k] = w[k]; sw[i * 4 + k] = w[4 + k] }
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4))
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4))
  return g
}

// ============================================================== materials
const HALDI = new THREE.Color('#f2b705')
function stdMat(key, p) { return cachedMat(key, () => new THREE.MeshStandardMaterial(p)) }
function skinMat(hex, tint) {
  return cachedMat('skin|' + hex + (tint || ''), () => {
    const c = new THREE.Color(hex)
    if (tint) c.lerp(new THREE.Color(tint), 0.45)
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.58, metalness: 0 })
    m.emissive = c.clone().multiplyScalar(0.06)
    m.userData.cat = tint ? 'mehendi' : 'skin'
    return m
  })
}
function cloth(key, color, map, { side = THREE.DoubleSide, rough = 0.82, metal = 0, cat = 'cloth', sheen = 0 } = {}) {
  return cachedMat('cloth|' + key + '|' + color, () => {
    const m = new THREE.MeshStandardMaterial({ color, map: map || null, roughness: rough, metalness: metal, side })
    if (sheen) m.emissive = new THREE.Color(color).multiplyScalar(sheen)
    m.userData.cat = cat
    return m
  })
}
function goldMat() { return stdMat('gold', { color: '#d9b25f', roughness: 0.32, metalness: 0.55, emissive: new THREE.Color('#3a2a08') }) }
function vcMat(gloss = false) {
  return cachedMat('vc' + (gloss ? 'g' : ''), () => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: gloss ? 0.28 : 0.6 }); m.userData.cat = 'feature'; return m })
}

// ============================================================== head
const EYE = { x: 0.0315, y: 0.088, r: 0.0118 }
function headPoint(dx, dy, dz, fem, o) {
  let x = dx * 0.074, y = dy * 0.106, z = dz * 0.094
  if (dy < 0) {
    const t = -dy
    x *= 1 - (fem ? 0.3 : 0.2) * t * t
    if (dz < 0) z *= 1 - 0.55 * smooth(0, 1, t)
    else z *= 1 - 0.1 * t * t
    y *= 1 + (fem ? 0.02 : 0.06) * t * Math.max(0, dz)
  }
  if (dz < 0) z *= 1 + 0.07 * smooth(-0.55, 0, dy) * (1 - smooth(0.45, 1, dy))
  else {
    z *= 1 - 0.08 * dz * dz * (1 - Math.abs(dy))
    if (dy > 0.3) z *= 1 - 0.05 * (dy - 0.3)
  }
  return o.set(x, y + 0.085, z)
}
function headSkinTweak(p) {
  if (p.z < 0.03) return p
  const fz = smooth(0.03, 0.08, p.z)
  for (const sx of [-EYE.x, EYE.x]) {
    const d2 = (p.x - sx) ** 2 + ((p.y - EYE.y) * 1.25) ** 2
    p.z -= 0.006 * Math.exp(-d2 / (0.016 * 0.016)) * fz
  }
  p.z += 0.0035 * gauss(p.y - 0.104, 0.009) * gauss(Math.abs(p.x) - 0.03, 0.03) * fz
  p.z += 0.003 * gauss(p.y - 0.06, 0.016) * gauss(Math.abs(p.x) - 0.048, 0.016) * fz
  return p
}
function headSphere() {
  const g = new THREE.SphereGeometry(1, 24, 18)
  g.rotateY(-Math.PI / 2)
  return g
}
const FZT = {}
function faceZ(x, y, fem) {
  const key = fem ? 'f' : 'm'
  let tab = FZT[key]
  if (!tab) {
    tab = []
    const p = new V3()
    for (let i = 0; i <= 120; i++) for (let j = 0; j <= 80; j++) {
      const th = (i / 120) * Math.PI, ph = (j / 80) * Math.PI - Math.PI / 2
      headPoint(Math.sin(ph) * Math.sin(th), Math.cos(th), Math.cos(ph) * Math.sin(th), fem, p)
      tab.push(p.x, p.y, p.z)
    }
    FZT[key] = tab
  }
  let best = 1e9, bz = 0
  for (let k = 0; k < tab.length; k += 3) {
    const dx = tab[k] - x, dy = tab[k + 1] - y, d = dx * dx + dy * dy
    if (d < best) { best = d; bz = tab[k + 2] }
  }
  return bz
}

function headSkinGeo(fem, hair, beard) {
  return cachedGeo('headSkin' + fem + hair + beard, () => {
    const g = headSphere()
    const pa = g.attributes.position, p = new V3()
    const hs = HAIR_STYLES[hair], bs = BEARD_STYLES[beard]
    const hid = new Uint8Array(pa.count)
    for (let i = 0; i < pa.count; i++) {
      p.fromBufferAttribute(pa, i)
      headPoint(p.x, p.y, p.z, fem, p)
      const az = Math.atan2(p.x, p.z)
      if ((hs && hairSigned(hs, az, p.y) > 0.012) || (bs && beardSigned(bs, az, p.y) > 0.006)) hid[i] = 1
      headSkinTweak(p)
      pa.setXYZ(i, p.x, p.y, p.z)
    }
    weldNormals(g)
    keepTriangles(g, (a, b, c) => !(hid[a] && hid[b] && hid[c]))
    const parts = [{ g }]
    const nz = (x, y) => faceZ(x, y, fem)
    const ns = fem ? 0.88 : 1
    // nose: bridge, tip, wings
    parts.push({ g: ell(0.0098 * ns, 0.025 * ns, 0.011, 8, 6), m: mtx(0, 0.069, nz(0, 0.069) + 0.0005, -0.38) })
    parts.push({ g: ell(0.0108 * ns, 0.0098 * ns, 0.011 * ns, 8, 6), m: mtx(0, 0.0505, nz(0, 0.05) + 0.0125 * ns) })
    for (const s of [-1, 1]) parts.push({ g: ell(0.0075 * ns, 0.0068, 0.0078, 6, 4), m: mtx(s * 0.0118 * ns, 0.0475, nz(s * 0.012, 0.047) + 0.0035) })
    // ears
    for (const s of [-1, 1]) {
      parts.push({ g: ell(0.0075, 0.0285, 0.0165, 8, 6), m: mtx(s * 0.0735, 0.074, -0.006, 0, s * 0.42, s * 0.12) })
    }
    const out = mergeGeos(parts)
    return out
  })
}

function featureGeo(fem, browHex, lipHex, extra = '') {
  return cachedGeo('feat|' + fem + browHex + lipHex + extra, () => {
    const parts = []
    const nz = (x, y) => faceZ(x, y, fem)
    const ez = nz(EYE.x, EYE.y) - 0.0045
    for (const s of [-1, 1]) {
      const ex = s * EYE.x
      parts.push({ g: ell(EYE.r, EYE.r, EYE.r, 8, 6), m: mtx(ex, EYE.y, ez), c: '#ece6dc' })
      parts.push({ g: ell(0.0062, 0.0062, 0.0024, 10, 4), m: mtx(ex * 0.985, EYE.y - 0.0004, ez + EYE.r - 0.0012), c: '#3a2416' })
      parts.push({ g: ell(0.0029, 0.0029, 0.0012, 6, 3), m: mtx(ex * 0.985, EYE.y - 0.0004, ez + EYE.r + 0.0003), c: '#070505' })
      // brows
      const bw = fem ? 0.0026 : 0.0042
      const by = fem ? 0.1045 : 0.1035
      parts.push({ g: ell(0.0165, bw, 0.004, 8, 4), m: mtx(s * 0.031, by, nz(s * 0.031, by) + 0.0015, 0, 0, s * (fem ? -0.16 : -0.08)), c: browHex })
      parts.push({ g: ell(0.0075, bw * 0.95, 0.0035, 6, 4), m: mtx(s * 0.0175, by - 0.0008, nz(s * 0.018, by) + 0.0016, 0, 0, s * 0.12), c: browHex })
      if (fem) parts.push({ g: ell(0.0125, 0.0013, 0.003, 6, 3), m: mtx(ex, EYE.y + 0.0085, ez + 0.0085, 0.5, 0, s * -0.12), c: '#1a1210' })
    }
    // lips
    const lz = nz(0, 0.03)
    const lw = fem ? 0.019 : 0.021
    const smile = (g, k) => { const pa = g.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i); pa.setY(i, pa.getY(i) + k * x * x) } return g }
    parts.push({ g: smile(ell(lw, 0.0041, 0.006, 10, 4), 2.2), m: mtx(0, 0.0303, lz + 0.0016), c: lipHex })
    parts.push({ g: smile(ell(lw * 0.86, 0.005, 0.0066, 10, 4), 1.6), m: mtx(0, 0.0212, nz(0, 0.021) + 0.0017), c: lipHex })
    parts.push({ g: smile(ell(lw * 0.97, 0.0011, 0.004, 8, 3), 2.6), m: mtx(0, 0.0258, lz + 0.0028), c: '#3a201b' })
    const g = mergeGeos(parts, true)
    return g
  })
}
function lidGeo() {
  return cachedGeo('lids', () => {
    const parts = []
    for (const s of [-1, 1]) {
      const g = new THREE.SphereGeometry(EYE.r + 0.0011, 10, 3, 0, TAU, 0, Math.PI * 0.5)
      parts.push({ g, m: mtx(s * EYE.x, 0, 0) })
    }
    return mergeGeos(parts)
  })
}

// ---- hair & beard shells (same UV space as the head sphere)
const HAIR_STYLES = {
  groom: { line: [[0, 0.156], [0.4, 0.16], [0.66, 0.172], [0.95, 0.162], [1.18, 0.128], [1.26, 0.06], [1.4, 0.055], [1.48, 0.122], [1.84, 0.122], [2.06, 0.05], [3.2, -0.006]], top: 0.024, side: 0.004, back: 0.009, fwd: 0.4 },
  short: { line: [[0, 0.162], [0.5, 0.166], [0.95, 0.158], [1.18, 0.125], [1.26, 0.07], [1.4, 0.066], [1.48, 0.122], [1.84, 0.122], [2.06, 0.05], [3.2, 0.0]], top: 0.012, side: 0.004, back: 0.007, fwd: 0.2 },
  side: { line: [[0, 0.16], [0.5, 0.164], [0.95, 0.156], [1.18, 0.125], [1.26, 0.07], [1.4, 0.066], [1.48, 0.12], [1.84, 0.12], [2.06, 0.05], [3.2, 0.0]], top: 0.016, side: 0.005, back: 0.008, fwd: 0.1, part: 0.35 },
  receding: { line: [[0, 0.188], [0.45, 0.184], [0.62, 0.19], [0.95, 0.16], [1.18, 0.125], [1.26, 0.075], [1.4, 0.07], [1.48, 0.12], [1.84, 0.12], [2.06, 0.05], [3.2, 0.005]], top: 0.006, side: 0.004, back: 0.006, fwd: 0 },
  bald: { line: [[0, 0.5], [1.0, 0.5], [1.22, 0.11], [1.4, 0.075], [1.48, 0.118], [1.84, 0.118], [2.06, 0.045], [3.2, 0.01]], upper: [[0, 0.12], [1.3, 0.13], [2.2, 0.15], [3.2, 0.165]], top: 0.0, side: 0.004, back: 0.006, fwd: 0 },
  fem: { line: [[0, 0.168], [0.45, 0.164], [0.9, 0.142], [1.2, 0.1], [1.42, 0.084], [1.7, 0.08], [2.1, 0.03], [3.2, -0.012]], top: 0.008, side: 0.009, back: 0.012, fwd: 0, center: true },
  kid: { line: [[0, 0.148], [0.6, 0.152], [0.95, 0.15], [1.18, 0.125], [1.26, 0.075], [1.4, 0.07], [1.48, 0.12], [1.84, 0.12], [2.06, 0.05], [3.2, 0.0]], top: 0.014, side: 0.005, back: 0.008, fwd: 0.3 },
}
function hairSigned(st, az, y) {
  const a = Math.abs(az)
  let s = y - interp(st.line, a)
  if (st.upper) s = Math.min(s, interp(st.upper, a) - y)
  if (st.center && a < 0.03 && y > 0.14) s = Math.min(s, (a - 0.03) * 0.3)
  if (st.part && Math.abs(az - st.part) < 0.025 && y > 0.15) s = Math.min(s, (Math.abs(az - st.part) - 0.025) * 0.3)
  return s
}
function hairThick(st, az, y) {
  const a = Math.abs(az)
  const topW = smooth(0.12, 0.19, y)
  let t = lerp(st.side, st.back, smooth(1.4, 2.4, a))
  t += st.top * topW * (1 + st.fwd * Math.cos(az)) * (a < 1.3 ? 1 : lerp(1, 0.55, smooth(1.3, 2.6, a)))
  return t + 0.0025
}
const _hp = new V3()
function uvToHead(u, vv, fem) {
  const phi = u * TAU, th = vv * Math.PI
  return headPoint(-Math.sin(phi) * Math.sin(th), Math.cos(th), -Math.cos(phi) * Math.sin(th), fem, _hp)
}
function hairTex(styleName, fem) {
  const st = HAIR_STYLES[styleName]
  return TX.pixelTexture('hair|' + styleName + fem, 512, 256, (u, vv, out) => {
    const p = uvToHead(u, vv, fem)
    const az = Math.atan2(p.x, p.z)
    const s = hairSigned(st, az, p.y)
    const n = TX.vnoise(u * 180, vv * 60, 3) * 0.006 - 0.003
    const a = s + n > 0 ? 255 : 0
    const streak = TX.vnoise(u * 420, vv * 14, 9) * 0.55 + TX.vnoise(u * 90, vv * 6, 4) * 0.45
    const edge = smooth(0, 0.012, s)
    let v = 150 + 105 * streak
    v *= 0.75 + 0.25 * edge
    if (st.center || styleName === 'fem') v = 135 + 120 * Math.pow(streak, 1.4)
    out[0] = out[1] = out[2] = v; out[3] = a
  })
}
function hairGeo(styleName, fem) {
  return cachedGeo('hair|' + styleName + fem, () => {
    const st = HAIR_STYLES[styleName]
    const g = headSphere()
    const pa = g.attributes.position, p = new V3(), d = new V3()
    const sig = new Float32Array(pa.count)
    for (let i = 0; i < pa.count; i++) {
      d.fromBufferAttribute(pa, i)
      headPoint(d.x, d.y, d.z, fem, p)
      const az = Math.atan2(p.x, p.z)
      sig[i] = hairSigned(st, az, p.y)
      const t = hairThick(st, az, p.y)
      const dir = new V3(p.x, p.y - 0.085, p.z).normalize()
      p.addScaledVector(dir, t)
      pa.setXYZ(i, p.x, p.y, p.z)
    }
    keepTriangles(g, (a, b, c) => Math.max(sig[a], sig[b], sig[c]) > -0.012)
    weldNormals(g)
    return g
  })
}
function keepTriangles(g, fn) {
  const idx = g.index.array, keep = []
  for (let i = 0; i < idx.length; i += 3) if (fn(idx[i], idx[i + 1], idx[i + 2])) keep.push(idx[i], idx[i + 1], idx[i + 2])
  g.setIndex(keep)
}
const BEARD_STYLES = {
  full: { up: [[0, 0.046], [0.28, 0.045], [0.42, 0.036], [0.6, 0.043], [0.9, 0.056], [1.15, 0.07], [1.3, 0.075], [1.42, 0.062], [1.5, -0.04]], mouth: true, t: 0.0032, chin: 0.006 },
  white: { up: [[0, 0.046], [0.28, 0.045], [0.42, 0.038], [0.6, 0.045], [0.9, 0.058], [1.15, 0.07], [1.3, 0.075], [1.42, 0.062], [1.5, -0.04]], mouth: true, t: 0.004, chin: 0.02 },
  trim: { up: [[0, 0.046], [0.28, 0.045], [0.42, 0.034], [0.6, 0.032], [0.9, 0.04], [1.15, 0.055], [1.3, 0.065], [1.42, 0.05], [1.5, -0.04]], mouth: true, t: 0.0026, chin: 0.003 },
  moustache: { only: true, t: 0.0032, chin: 0 },
}
function beardSigned(st, az, y) {
  const a = Math.abs(az)
  if (st.only) return Math.min(0.046 - y, y - 0.0335, (0.36 - a) * 0.04, 0.004)
  let s = interp(st.up, a) - y
  if (a > 1.42) s = Math.min(s, (1.5 - a) * 0.1)
  if (st.mouth) {
    const dx = a / 0.29, dy = (y - 0.0255) / 0.0083
    s = Math.min(s, (Math.sqrt(dx * dx + dy * dy) - 1) * 0.008)
  }
  return s
}
function beardTex(name) {
  const st = BEARD_STYLES[name]
  return TX.pixelTexture('beard|' + name, 512, 256, (u, vv, out) => {
    const p = uvToHead(u, vv, false)
    const az = Math.atan2(p.x, p.z)
    const s = beardSigned(st, az, p.y)
    const n = TX.vnoise(u * 300, vv * 160, 5) * 0.004 - 0.002
    const v = 140 + 115 * TX.vnoise(u * 600, vv * 300, 7)
    out[0] = out[1] = out[2] = v
    out[3] = s + n > 0 ? 255 : 0
  })
}
function beardGeo(name) {
  return cachedGeo('beard|' + name, () => {
    const st = BEARD_STYLES[name]
    const g = headSphere()
    const pa = g.attributes.position, p = new V3(), d = new V3()
    const sig = new Float32Array(pa.count)
    for (let i = 0; i < pa.count; i++) {
      d.fromBufferAttribute(pa, i)
      headPoint(d.x, d.y, d.z, false, p)
      const az = Math.atan2(p.x, p.z)
      sig[i] = beardSigned(st, az, p.y)
      const chinW = smooth(0.03, -0.02, p.y) * (1 - smooth(0.6, 1.2, Math.abs(az)))
      const dir = new V3(p.x, p.y - 0.085, p.z).normalize()
      p.addScaledVector(dir, st.t + st.chin * chinW * 0.6)
      p.y -= st.chin * chinW * 0.8
      p.z += st.chin * chinW * 0.25
      pa.setXYZ(i, p.x, p.y, p.z)
    }
    keepTriangles(g, (a, b, c) => Math.max(sig[a], sig[b], sig[c]) > -0.006)
    weldNormals(g)
    return g
  })
}
function hairMat(hex, tex, key) {
  return cachedMat('hair|' + key + hex, () => {
    const m = new THREE.MeshStandardMaterial({ color: hex, map: tex, alphaTest: 0.5, roughness: 0.5, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })
    m.userData.cat = 'hair'
    return m
  })
}

function glassesGeo(thin) {
  return cachedGeo('glasses' + thin, () => {
    const w = 0.05, h = thin ? 0.034 : 0.04, t = thin ? 0.0025 : 0.0055, r = 0.009
    const rr = (s, W, H, R) => {
      s.moveTo(-W / 2 + R, -H / 2); s.lineTo(W / 2 - R, -H / 2); s.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + R)
      s.lineTo(W / 2, H / 2 - R); s.quadraticCurveTo(W / 2, H / 2, W / 2 - R, H / 2); s.lineTo(-W / 2 + R, H / 2)
      s.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - R); s.lineTo(-W / 2, -H / 2 + R); s.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + R, -H / 2)
    }
    const shape = new THREE.Shape(); rr(shape, w, h, r)
    const hole = new THREE.Path(); rr(hole, w - t * 2, h - t * 2, r * 0.7); shape.holes.push(hole)
    const rim = new THREE.ExtrudeGeometry(shape, { depth: thin ? 0.003 : 0.006, bevelEnabled: false, curveSegments: 3 })
    const fz = faceZ(EYE.x, EYE.y, false) + 0.014
    const parts = []
    for (const s of [-1, 1]) {
      parts.push({ g: rim, m: mtx(s * 0.0335, EYE.y + 0.001, fz, 0, s * -0.08, 0) })
      const temple = new THREE.BoxGeometry(0.0035, thin ? 0.003 : 0.006, 0.105)
      parts.push({ g: temple, m: mtx(s * 0.0745, EYE.y + 0.012, fz - 0.05, 0.08, s * -0.07, 0) })
    }
    parts.push({ g: new THREE.BoxGeometry(0.016, thin ? 0.0025 : 0.005, 0.005), m: mtx(0, EYE.y + 0.01, fz + 0.004) })
    return mergeGeos(parts)
  })
}

// ============================================================== hands & shoes
function handGeo() {
  return cachedGeo('hand', () => {
    // right hand: palm faces +X (toward body), thumb toward +Z
    const parts = [
      { g: limbGeo(0.05, [[0, 0.025], [1, 0.024]], { segs: 8, n: 1, top: 'open', bottom: 'open' }), m: mtx(0, 0.035, 0) },
      { g: ell(0.0175, 0.046, 0.04, 8, 6), m: mtx(0.002, -0.045, 0) },
      { g: ell(0.0145, 0.044, 0.037, 8, 6), m: mtx(0.009, -0.105, -0.002, 0, 0, 0.22) },
      { g: ell(0.0108, 0.028, 0.0115, 6, 4), m: mtx(0.016, -0.055, 0.03, 0.5, 0, 0.35) },
    ]
    const g = mergeGeos(parts)
    return g
  })
}
const SHOES = {
  sneaker: { upper: '#f2f2ee', sole: '#d9d9d4', accent: '#c9c9c4', point: 0, curl: 0, h: 1 },
  jutti: { upper: '#b8813f', sole: '#6e4a24', accent: '#d9b25f', point: 0.65, curl: 0.006, h: 0.85 },
  mojari: { upper: '#e6d3a8', sole: '#8a6a3a', accent: '#c9a14a', point: 0.75, curl: 0.016, h: 0.85 },
  formal: { upper: '#1c1712', sole: '#0d0b09', accent: '#2c241c', point: 0.2, curl: 0, h: 0.95 },
  brown: { upper: '#5a3a22', sole: '#2a1c10', accent: '#6b4a2c', point: 0.2, curl: 0, h: 0.95 },
  sandal: { upper: '#6b4a2e', sole: '#3a2818', accent: '#8a6440', point: 0.1, curl: 0, h: 0.7 },
  goldFlat: { upper: '#d6b56c', sole: '#7a5a2a', accent: '#efd9a0', point: 0.5, curl: 0.004, h: 0.7 },
  black: { upper: '#121212', sole: '#050505', accent: '#222', point: 0.1, curl: 0, h: 1 },
}
function shoeGeo(style, L) {
  return cachedGeo('shoe|' + style + L.ankleH, () => {
    const s = SHOES[style]
    const ah = L.ankleH
    const len = ah * 3.05
    const mk = (sx, sy, sz, cy, colTop) => {
      const g = new THREE.SphereGeometry(1, 11, colTop ? 3 : 6)
      const pa = g.attributes.position, p = new V3()
      for (let i = 0; i < pa.count; i++) {
        p.fromBufferAttribute(pa, i)
        const fr = p.z
        let x = p.x * sx, y = p.y, z = p.z * sz
        if (y < 0) y *= 0.25
        y *= sy
        if (fr > 0.2) { y *= 1 - 0.45 * (fr - 0.2) * s.h; x *= 1 - s.point * Math.pow(Math.max(0, fr - 0.45) / 0.55, 1.4) }
        if (fr > 0.8) y += s.curl * (fr - 0.8) / 0.2
        pa.setXYZ(i, x, y + cy, z + len * 0.27)
      }
      weldNormals(g)
      return g
    }
    const upper = mk(ah * 0.58, ah * 0.62, len * 0.5, -ah + ah * 0.18)
    const sole = mk(ah * 0.62, ah * 0.16, len * 0.52, -ah + ah * 0.1, true)
    const parts = [{ g: upper, c: s.upper }, { g: sole, c: s.sole }]
    if (style === 'sneaker') parts.push({ g: ell(ah * 0.3, ah * 0.08, ah * 0.6, 6, 3), m: mtx(0, -ah * 0.42, len * 0.3, -0.35), c: s.accent })
    else parts.push({ g: ell(ah * 0.5, ah * 0.1, ah * 0.5, 6, 3), m: mtx(0, -ah * 0.5, len * 0.42, -0.25), c: s.accent })
    return mergeGeos(parts, true)
  })
}

// ============================================================== skeleton & character
const JN = ['hips', 'spine', 'chest', 'neck', 'head', 'clavL', 'shoulderL', 'elbowL', 'wristL', 'clavR', 'shoulderR', 'elbowR', 'wristR', 'thighL', 'kneeL', 'ankleL', 'thighR', 'kneeR', 'ankleR']
const J = Object.fromEntries(JN.map((n, i) => [n, i]))
const NJ = JN.length
const EX = NJ * 3 // extras: hipX, hipZ, lift, seatY, grounded
const NP = EX + 5
const ORDERS = { hips: 'YXZ', spine: 'YXZ', chest: 'YXZ', neck: 'YXZ', head: 'YXZ', shoulderL: 'XZY', shoulderR: 'XZY', thighL: 'XZY', thighR: 'XZY', elbowL: 'XYZ', elbowR: 'XYZ' }

const BSPHERE = new THREE.Sphere(new V3(0, 0.9, 0), 1.25)
const BBOX = new THREE.Box3(new V3(-1, -0.2, -1), new V3(1, 2.1, 1))

class Char {
  constructor(role, outfit, seed) {
    this.role = role
    this.outfit = outfit
    this.seed = seed
    this.rnd = TX.mulberry32(seed * 7919 + 13)
    this.object3d = new THREE.Group()
    this.object3d.name = 'character:' + role
    this.body = new THREE.Group()
    this.object3d.add(this.body)
    this.skinned = []
    this.meshes = []
    this.props = []
    this.ownedMats = new Map()
    this.haldi = 0
    this.anim = null
  }

  // ------------------------------------------------ build steps
  setup(spec) {
    this.spec = spec
    const sex = spec.sex
    this.L = LAYOUT[sex]
    this.rows = bodyRows(sex, spec.build || 'avg')
    this.fem = sex === 'f'
    const L = this.L
    const B = (parent, x, y, z, name) => {
      const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z)
      if (ORDERS[name]) b.rotation.order = ORDERS[name]
      parent.add(b); return b
    }
    const j = {}
    j.hips = B(this.body, 0, L.hipY, 0, 'hips')
    j.spine = B(j.hips, 0, L.spineY - L.hipY, 0, 'spine')
    j.chest = B(j.spine, 0, L.chestY - L.spineY, 0, 'chest')
    j.neck = B(j.chest, 0, L.neckY - L.chestY, 0, 'neck')
    j.head = B(j.neck, 0, L.headY - L.neckY, 0, 'head')
    for (const [s, sg] of [['L', 1], ['R', -1]]) {
      j['clav' + s] = B(j.chest, sg * L.clavX, L.shoulderY - L.chestY, 0, 'clav' + s)
      j['shoulder' + s] = B(j['clav' + s], sg * (L.shoulderX - L.clavX), 0, 0, 'shoulder' + s)
      j['elbow' + s] = B(j['shoulder' + s], 0, -L.upperArm, 0, 'elbow' + s)
      j['wrist' + s] = B(j['elbow' + s], 0, -L.forearm, 0, 'wrist' + s)
      j['thigh' + s] = B(j.hips, sg * L.hipX, 0, 0, 'thigh' + s)
      j['knee' + s] = B(j['thigh' + s], 0, -L.thigh, 0, 'knee' + s)
      j['ankle' + s] = B(j['knee' + s], 0, -L.shin, 0, 'ankle' + s)
    }
    this.joints = j
    this.jointList = JN.map(n => j[n])
    this.headRoot = new THREE.Group()
    const hs = L.headScale * (spec.kid ? 1.28 : 1)
    this.headRoot.scale.setScalar(hs)
    j.head.add(this.headRoot)
    const top = L.headY + 0.198 * hs
    this.scale = spec.height / top
    this.body.scale.setScalar(this.scale)
    this.height = spec.height
  }

  mesh(geo, mat, parent, { cast = true, recv = true } = {}) {
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = cast; m.receiveShadow = recv
    parent.add(m)
    this.meshes.push(m)
    return m
  }
  skin(geo, mat) {
    const m = new THREE.SkinnedMesh(geo, mat)
    m.castShadow = true; m.receiveShadow = true
    m.boundingSphere = BSPHERE
    m.boundingBox = BBOX
    this.body.add(m)
    this.skinned.push(m)
    this.meshes.push(m)
    return m
  }
  finalize() {
    this.object3d.updateMatrixWorld(true)
    this.skeleton = new THREE.Skeleton(SKIN_BONES.map(n => this.joints[n]))
    for (const m of this.skinned) m.bind(this.skeleton)
    this.restHipY = this.L.hipY
  }

  /** Lathe garment following the body silhouette. */
  garment(key, o, mat) {
    const sex = this.spec.sex, build = this.spec.build || 'avg', L = this.L
    const gk = 'garm|' + sex + build + '|' + key + '|' + JSON.stringify(o)
    const geo = cachedGeo(gk, () => {
      const B = this.rows
      const thick = o.thick ?? 0.01
      const rows = []
      const infl = (r) => ({ y: r.y, rx: r.rx + thick, rz: r.rz + thick, zo: r.zo })
      if (o.top != null) rows.push(infl(sampleRows(B, o.top)))
      for (const r of B) {
        if (o.top != null && r.y >= o.top - 0.004) continue
        if (o.cut != null && r.y <= o.cut + 0.004) break
        if (!o.closed && o.cut == null && r.y <= o.hem + 0.004) break
        rows.push(infl(r))
      }
      let cutRow = null
      if (o.cut != null) {
        cutRow = infl(sampleRows(B, o.cut))
        rows.push(cutRow)
        const n = Math.max(3, Math.round((o.cut - o.hem) / (o.step ?? 0.07)))
        const ease = o.ease ?? 1
        for (let k = 1; k <= n; k++) {
          const t = k / n, e = ease === 1 ? t : 1 - Math.pow(1 - t, ease)
          rows.push({ y: lerp(o.cut, o.hem, t), rx: lerp(cutRow.rx, o.hemRx, e), rz: lerp(cutRow.rz, o.hemRz ?? o.hemRx * 0.8, e), zo: lerp(cutRow.zo, 0, t) })
        }
      } else if (!o.closed) {
        const h = infl(sampleRows(B, o.hem))
        rows.push(h)
        rows.push({ y: o.hem - 0.004, rx: h.rx + (o.flare ?? 0.006), rz: h.rz + (o.flare ?? 0.006), zo: h.zo })
      }
      if (o.pleats) {
        for (const r of rows) if (r.y < (o.cut ?? 2)) r.pleat = true
      }
      const cutY = o.cut ?? -1
      const g = latheGeo(rows, {
        segs: o.segs ?? 22,
        bulges: o.bulges || (this.fem && (o.top == null || o.top > 1.24) ? [{ y: 1.235, s: 0.05, a: 0.012 + (this.spec.bust || 0), p: 3 }] : null),
        deform: (v, phi, j) => {
          const r = rows[j]
          if (o.hemCurve && v.y < cutY) v.y += o.hemCurve * Math.pow(Math.sin(phi), 2) * ((cutY - r.y) / (cutY - o.hem))
          if (r.pleat && v.y < cutY) {
            const fr = Math.max(0, Math.cos(phi))
            const k = (cutY - v.y) / (cutY - o.hem + 1e-6)
            const w = o.pleats * k * (0.4 + 0.6 * fr)
            const rad = Math.sin(phi * (o.pleatN || 18)) * w
            v.x += Math.sin(phi) * rad; v.z += Math.cos(phi) * rad
          }
        },
      })
      addSkin(g, bodyWeights(L, o.legInfl ?? 0.6, o.legRange ?? 0.45))
      return g
    })
    return this.skin(geo, mat)
  }

  ribbon(key, ctrl, mat, opts = {}) {
    const gk = 'rib|' + this.spec.sex + (this.spec.build || 'avg') + '|' + key
    const geo = cachedGeo(gk, () => {
      const g = ribbonGeo(ctrl, opts)
      addSkin(g, bodyWeights(this.L, opts.legInfl ?? 0.55, 0.45))
      return g
    })
    return this.skin(geo, mat)
  }

  /** Chest-attached rigid mesh with coordinates given in body space. */
  onChest(geo, mat) {
    const m = this.mesh(geo, mat, this.joints.chest)
    m.position.set(0, -this.L.chestY, 0)
    return m
  }

  arms({ upper, fore, under = null, cuffs = null }) {
    const L = this.L, fs = this.fem ? 0.88 : 1, k = this.spec.build === 'heavy' ? 1.1 : 1
    const sc = (prof) => prof.map(([t, r]) => [t, r * fs * k])
    const skinUpper = [[0, 0.05], [0.4, 0.046], [1, 0.039]], skinFore = [[0, 0.04], [0.35, 0.042], [1, 0.028]]
    const skinM = skinMat(this.spec.skin)
    for (const s of ['L', 'R']) {
      const sh = this.joints['shoulder' + s], el = this.joints['elbow' + s]
      if (upper) {
        const geo = cachedGeo('uarm|' + JSON.stringify(sc(upper.prof)) + upper.len + (upper.open || ''), () =>
          limbGeo((upper.len ?? 1) * L.upperArm, sc(upper.prof), { bottom: upper.open ? 'open' : 'cap', segs: 10 }))
        this.mesh(geo, upper.mat, sh)
      }
      if (under?.upper) {
        const geo = cachedGeo('uarmS' + fs + k, () => limbGeo(L.upperArm, sc(skinUpper), { segs: 10 }))
        this.mesh(geo, skinM, sh)
      }
      if (fore) {
        const geo = cachedGeo('farm|' + JSON.stringify(sc(fore.prof)) + (fore.open || '') + L.forearm, () =>
          limbGeo(L.forearm, sc(fore.prof), { bottom: fore.open ? 'open' : 'cap', segs: 10 }))
        this.mesh(geo, fore.mat, el)
      }
      if (under?.fore) {
        const geo = cachedGeo('farmS' + fs + k + L.forearm, () => limbGeo(L.forearm, sc(skinFore), { segs: 10 }))
        this.mesh(geo, skinM, el)
      }
      if (cuffs) {
        const m = this.mesh(cuffs.geo, cuffs.mat, el)
        m.position.y = -L.forearm * (cuffs.at ?? 0.82)
      }
    }
  }

  legs({ thigh, shin, skinShin = false }) {
    const L = this.L, fs = this.fem ? 0.92 : 1, k = this.spec.build === 'heavy' ? 1.1 : 1
    const sc = (prof) => prof.map(([t, r]) => [t, r * fs * k])
    for (const s of ['L', 'R']) {
      const th = this.joints['thigh' + s], kn = this.joints['knee' + s]
      if (thigh) {
        const geo = cachedGeo('thigh|' + JSON.stringify(sc(thigh.prof)) + L.thigh, () => limbGeo(L.thigh, sc(thigh.prof), { segs: 10, topExt: 0.4 }))
        this.mesh(geo, thigh.mat, th)
      }
      if (skinShin) {
        const geo = cachedGeo('shinS' + fs + L.shin, () => limbGeo(L.shin, sc([[0, 0.054], [0.3, 0.056], [1, 0.037]]), { segs: 10 }))
        this.mesh(geo, skinMat(this.spec.skin), kn)
      }
      if (shin) {
        const geo = cachedGeo('shin|' + JSON.stringify(sc(shin.prof)) + L.shin + (shin.open || '') + (shin.ripple || 0) + (shin.len || 1), () =>
          limbGeo(L.shin * (shin.len || 1), sc(shin.prof), { segs: 10, bottom: shin.open ? 'open' : 'cap', ripple: shin.ripple || 0, rippleFrom: shin.rippleFrom ?? 0.6, n: shin.ripple ? 9 : 4 }))
        this.mesh(geo, shin.mat, kn)
      }
    }
  }

  pelvis(mat, thick = 0.008) {
    const L = this.L
    return this.garment('pelvis', { top: L.hipY + 0.09, closed: true, thick, segs: 14 }, mat)
  }

  hands(tint) {
    const L = this.L
    const geo = handGeo()
    const m = skinMat(this.spec.skin, tint)
    const s = L.hand * (this.spec.build === 'heavy' ? 1.05 : 1)
    for (const [side, sg] of [['L', -1], ['R', 1]]) {
      const h = this.mesh(geo, m, this.joints['wrist' + side])
      h.scale.set(sg * s, s, s)
      h.rotation.y = sg * 0.0
    }
  }

  neck() {
    const L = this.L
    const r = this.fem ? 0.041 : 0.05
    const len = (L.headY - L.neckY) + 0.07
    const geo = cachedGeo('neck' + this.fem + len, () => limbGeo(len, [[0, r * 0.95], [0.6, r], [1, r * 1.15]], { segs: 12, top: 'open', bottom: 'open' }))
    const m = this.mesh(geo, skinMat(this.spec.skin), this.joints.neck)
    m.position.y = L.headY - L.neckY + 0.025
  }

  shoes(style) {
    const geo = shoeGeo(style, this.L)
    for (const s of ['L', 'R']) this.mesh(geo, vcMat(), this.joints['ankle' + s])
  }

  head({ hair, hairColor, beard, beardColor, glasses, lip }) {
    const fem = this.fem
    const hr = this.headRoot
    const skinM = skinMat(this.spec.skin)
    this.mesh(headSkinGeo(fem, hair, beard), skinM, hr)
    const sk = new THREE.Color(this.spec.skin)
    const lipHex = lip || '#' + sk.clone().lerp(new THREE.Color(fem ? '#9c3a42' : '#7a3a34'), fem ? 0.5 : 0.35).multiplyScalar(0.85).getHexString()
    const browHex = hairColor === '#d8d4cc' || hairColor === '#b9b4ac' ? '#9a958e' : '#1d1612'
    this.mesh(featureGeo(fem, browHex, lipHex), vcMat(true), hr, { cast: false })
    const lids = this.mesh(lidGeo(), skinM, hr, { cast: false })
    lids.position.set(0, EYE.y, faceZ(EYE.x, EYE.y, fem) - 0.0045)
    lids.rotation.x = -0.25
    this.lids = lids
    if (hair) {
      const hm = hairMat(hairColor, hairTex(hair, fem), hair + fem)
      this.hairMesh = this.mesh(hairGeo(hair, fem), hm, hr)
    }
    if (beard) this.mesh(beardGeo(beard), hairMat(beardColor || hairColor, beardTex(beard), 'b' + beard), hr)
    if (glasses) this.mesh(glassesGeo(glasses === 'thin'), stdMat('glasses' + glasses, { color: glasses === 'thin' ? '#a88a4a' : '#121212', roughness: 0.3, metalness: glasses === 'thin' ? 0.6 : 0.1 }), hr, { cast: false })
  }

  // ------------------------------------------------ animation
  initAnim() {
    this.poseA = new Float32Array(NP)
    this.poseB = new Float32Array(NP)
    this.pose = new Float32Array(NP)
    this.cur = null; this.prev = null
    this.tCur = 0; this.tPrev = 0
    this.fade = 0; this.fadeT = 1
    this.speed = 1; this.prevSpeed = 1
    this.blink = 2 + this.rnd() * 3
    this.look = { yaw: 0, pitch: 0, target: null }
    this.ctx = { fem: this.fem, kid: !!this.spec.kid, ph: this.rnd() * TAU, L: this.L, scale: this.scale, stoop: this.spec.stoop || 0, role: this.role, holdBook: this.role === 'qazi' }
    this.setAnim('idle', { fade: 0 })
  }

  setAnim(name, { speed = 1, fade = 0.25 } = {}) {
    if (!ANIMS[name]) { console.warn('[Character] unknown animation', name); return }
    if (this.cur === name) { this.speed = speed; return }
    this.prev = this.cur; this.prevSpeed = this.speed; this.tPrev = this.tCur
    this.cur = name; this.speed = speed; this.tCur = 0
    this.fade = this.prev ? Math.max(0, fade) : 0; this.fadeT = 0
    for (const p of this.props) p.onAnim?.(name)
  }

  update(dt) {
    dt = Math.min(dt, 0.1)
    this.tCur += dt * this.speed
    this.tPrev += dt * this.prevSpeed
    this.fadeT += dt
    const w = this.fade > 0 ? smooth(0, 1, this.fadeT / this.fade) : 1
    const c = this.ctx
    evalAnim(this.cur, this.tCur, this.poseB, c)
    if (w < 1 && this.prev) {
      evalAnim(this.prev, this.tPrev, this.poseA, c)
      for (let i = 0; i < NP; i++) this.pose[i] = lerp(this.poseA[i], this.poseB[i], w)
    } else this.pose.set(this.poseB)
    this.applyPose(dt)
  }

  applyPose(dt) {
    const p = this.pose, L = this.L, jl = this.jointList
    for (let i = 0; i < NJ; i++) jl[i].rotation.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2])
    // ground contact: lowest foot point at y=0
    const hx = p[J.hips * 3]
    let minY = 1e9
    for (const s of ['L', 'R']) {
      const t = J['thigh' + s] * 3, k = J['knee' + s] * 3, a = J['ankle' + s] * 3
      const a1 = hx + p[t], a2 = a1 + p[k], a3 = a2 + p[a]
      const cz = Math.cos(p[t + 2])
      const ky = -(L.thigh * Math.cos(a1) + L.shin * Math.cos(a2)) * cz
      const ah = L.ankleH
      const heel = -ah * Math.cos(a3) + 0.055 * Math.sin(a3)
      const toe = -ah * Math.cos(a3) - ah * 2.2 * Math.sin(a3)
      minY = Math.min(minY, ky + Math.min(heel, toe))
    }
    const groundY = -minY
    const g = p[EX + 4]
    const hipY = g * groundY + (1 - g) * p[EX + 3] + p[EX + 2]
    const hips = this.joints.hips
    hips.position.set(p[EX], hipY, p[EX + 1])
    // look-at
    const lk = this.look
    let ty = 0, tp = 0
    if (lk.target) {
      const neck = this.joints.neck
      const local = neck.parent.worldToLocal(_v1.copy(lk.target))
      local.sub(neck.position)
      ty = clamp(Math.atan2(local.x, local.z), -1.2, 1.2)
      tp = clamp(-Math.atan2(local.y - 0.1, Math.hypot(local.x, local.z)), -0.5, 0.45)
    }
    const kk = Math.min(1, dt * 5)
    lk.yaw += (ty - lk.yaw) * kk; lk.pitch += (tp - lk.pitch) * kk
    if (Math.abs(lk.yaw) > 1e-3 || Math.abs(lk.pitch) > 1e-3) {
      this.joints.neck.rotation.y += lk.yaw * 0.4
      this.joints.head.rotation.y += lk.yaw * 0.6
      this.joints.head.rotation.x += lk.pitch * 0.8
    }
    // blink
    if (this.lids) {
      this.blink -= dt
      let b = 0
      if (this.blink < 0.14) b = Math.sin(clamp(this.blink / 0.14, 0, 1) * Math.PI)
      if (this.blink < 0) this.blink = 2 + this.rnd() * 4
      this.lids.rotation.x = -0.25 + b * 1.25
    }
    if (this.sehra) {
      const tt = this.tCur
      this.sehra.rotation.x = 0.03 * Math.sin(tt * 2.1) - this.joints.head.rotation.x * 0.3
      this.sehra.rotation.z = 0.02 * Math.sin(tt * 1.7)
    }
  }
}
const _v1 = new V3()

// ============================================================== poses
function P(a) { return new PoseW(a) }
class PoseW {
  constructor(a) { this.a = a }
  j(n, x = 0, y = 0, z = 0) { const i = J[n] * 3; this.a[i] = x; this.a[i + 1] = y; this.a[i + 2] = z; return this }
  add(n, x = 0, y = 0, z = 0) { const i = J[n] * 3; this.a[i] += x; this.a[i + 1] += y; this.a[i + 2] += z; return this }
  l(b, x = 0, y = 0, z = 0) { return this.j(b + 'L', x, y, z) }
  r(b, x = 0, y = 0, z = 0) { return this.j(b + 'R', x, -y, -z) }
  s(b, x = 0, y = 0, z = 0) { this.l(b, x, y, z); return this.r(b, x, y, z) }
  side(sd, b, x = 0, y = 0, z = 0) { return sd === 'L' ? this.l(b, x, y, z) : this.r(b, x, y, z) }
  get(n) { const i = J[n] * 3; return [this.a[i], this.a[i + 1], this.a[i + 2]] }
  hip(x, z) { this.a[EX] = x; this.a[EX + 1] = z; return this }
  lift(v) { this.a[EX + 2] = v; return this }
  seat(y) { this.a[EX + 3] = y; this.a[EX + 4] = 0; return this }
}
function relax(p, c) {
  p.a.fill(0); p.a[EX + 4] = 1
  p.s('shoulder', 0.03, 0, c.fem ? 0.075 : 0.1)
  p.s('elbow', -0.14)
  p.s('wrist', 0, 0, 0.05)
  if (c.stoop) { p.j('spine', c.stoop); p.j('neck', -c.stoop * 0.4); p.j('head', -c.stoop * 0.3) }
}
// 2-bone arm IK. T = wrist target in chest-local metres (layout units), pole = elbow hint direction.
const _ik = { T: new V3(), S: new V3(), D: new V3(), dir: new V3(), pp: new V3(), u: new V3(), E: new V3(), f: new V3(), w: new V3(), X: new V3(), Y: new V3(), Z: new V3(), m: new THREE.Matrix4(), e: new THREE.Euler(), q: new THREE.Quaternion(), ce: new THREE.Euler() }
function armIK(p, side, T, pole, L, twist = 0) {
  const sg = side === 'L' ? 1 : -1
  const k = _ik
  const ci = J['clav' + side] * 3
  k.ce.set(p.a[ci], p.a[ci + 1], p.a[ci + 2])
  k.q.setFromEuler(k.ce).invert()
  k.T.set(T[0] - sg * L.clavX, T[1] - (L.shoulderY - L.chestY), T[2]).applyQuaternion(k.q)
  k.S.set(sg * (L.shoulderX - L.clavX), 0, 0)
  const a = L.upperArm, b = L.forearm
  k.D.subVectors(k.T, k.S)
  let d = k.D.length()
  k.dir.copy(k.D).divideScalar(d || 1)
  d = clamp(d, Math.abs(a - b) + 0.02, a + b - 0.002)
  const al = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1))
  k.pp.set(pole[0], pole[1], pole[2]).applyQuaternion(k.q)
  k.pp.addScaledVector(k.dir, -k.pp.dot(k.dir))
  if (k.pp.lengthSq() < 1e-8) k.pp.set(0, -1, 0)
  k.pp.normalize()
  k.u.copy(k.dir).multiplyScalar(Math.cos(al)).addScaledVector(k.pp, Math.sin(al)).normalize()
  k.E.copy(k.S).addScaledVector(k.u, a)
  k.f.copy(k.S).addScaledVector(k.dir, d).sub(k.E).normalize()
  k.w.copy(k.f).addScaledVector(k.u, -k.f.dot(k.u))
  if (k.w.lengthSq() < 1e-8) k.w.copy(k.pp)
  k.w.normalize()
  k.Y.copy(k.u).negate(); k.Z.copy(k.w); k.X.crossVectors(k.Y, k.Z)
  k.m.makeBasis(k.X, k.Y, k.Z)
  k.e.setFromRotationMatrix(k.m, 'XZY')
  p.j('shoulder' + side, k.e.x, k.e.y, k.e.z)
  p.j('elbow' + side, -Math.acos(clamp(k.f.dot(k.u), -1, 1)), twist, 0)
}
function setLeg(p, sd, thigh, knee, footPitch, hx = 0, abd = 0) {
  p.side(sd, 'thigh', thigh, 0, abd)
  p.side(sd, 'knee', knee)
  p.side(sd, 'ankle', footPitch - (thigh + knee + hx))
}
const wrapPi = (x) => { x = (x + Math.PI) % TAU; if (x < 0) x += TAU; return x - Math.PI }
function bump(x, c, w) { return gauss(wrapPi(x - c), w) }
function gait(p, ph, A, kneeAmp, off = 0, hx = 0) {
  for (const [sd, o] of [['L', 0], ['R', Math.PI]]) {
    const q = ph + o
    const th = off - A * Math.sin(q)
    const kn = 0.06 + kneeAmp * Math.pow(Math.max(0, Math.cos(q + 0.35)), 1.8) + 0.14 * bump(q, Math.PI / 2 + 0.55, 0.5)
    const fp = 0.42 * bump(q, Math.PI * 1.42, 0.42) - 0.18 * bump(q, Math.PI * 0.45, 0.35)
    setLeg(p, sd, th, kn, fp, hx)
  }
}

const ANIMS = {
  idle(t, p, c) {
    relax(p, c)
    const b = Math.sin(t * 1.35 + c.ph), w = Math.sin(t * 0.42 + c.ph * 2)
    p.add('chest', -0.014 * b); p.add('spine', 0.008 * b)
    p.l('clav', 0, 0, 0.012 * b); p.r('clav', 0, 0, 0.012 * b)
    p.j('hips', 0, 0.04 * w, 0.022 * w)
    p.hip(0.012 * w, 0)
    const kL = 0.05 + 0.09 * Math.max(0, -w), kR = 0.05 + 0.09 * Math.max(0, w)
    setLeg(p, 'L', -kL * 0.45, kL, 0); setLeg(p, 'R', -kR * 0.45, kR, 0)
    p.add('thighL', 0, 0, -0.022 * w - 0.014 * w); p.add('thighR', 0, 0, -0.022 * w - 0.014 * w)
    p.add('ankleL', 0, 0, 0.014 * w); p.add('ankleR', 0, 0, 0.014 * w)
    p.add('spine', 0, -0.02 * w, -0.012 * w)
    p.add('head', 0.03 * Math.sin(t * 0.53 + c.ph), 0.14 * Math.sin(t * 0.29 + c.ph) - 0.02 * w, 0.02 * w)
    p.add('shoulderL', 0.03 * Math.sin(t * 0.7 + c.ph)); p.add('shoulderR', 0.03 * Math.sin(t * 0.63 + c.ph))
    if (c.holdBook) holdBook(p, c, t)
  },
  walk(t, p, c) {
    relax(p, c)
    const ph = t * TAU * (c.kid ? 1.2 : 0.95)
    const s = Math.sin(ph), co = Math.cos(ph)
    const A = c.fem ? 0.36 : 0.42
    p.j('spine', 0.04 + (c.stoop || 0)); p.j('hips', 0, -0.08 * s, -0.035 * co * (c.fem ? 1.6 : 1))
    gait(p, ph, A, 1.05, 0, 0)
    p.add('thighL', 0, 0, 0.035 * co * (c.fem ? 1.6 : 1)); p.add('thighR', 0, 0, 0.035 * co * (c.fem ? 1.6 : 1))
    p.j('chest', 0, 0.13 * s, 0); p.j('neck', 0, -0.05 * s, 0)
    const sw = c.fem ? 0.26 : 0.34
    p.l('shoulder', sw * s, 0, 0.08); p.r('shoulder', -sw * s, 0, 0.08)
    p.l('elbow', -0.2 - 0.3 * Math.max(0, -s)); p.r('elbow', -0.2 - 0.3 * Math.max(0, s))
    p.lift(0.008 * Math.cos(2 * ph))
    if (c.holdBook) holdBook(p, c, t, true)
  },
  run(t, p, c) {
    relax(p, c)
    const ph = t * TAU * 1.4
    const s = Math.sin(ph)
    p.j('spine', 0.16); p.j('hips', 0, -0.1 * s, 0); p.j('chest', 0.02, 0.16 * s, 0); p.j('neck', -0.1, -0.06 * s)
    gait(p, ph, 0.62, 1.7, -0.12, 0)
    p.l('shoulder', 0.6 * s - 0.1, 0, 0.12); p.r('shoulder', -0.6 * s - 0.1, 0, 0.12)
    p.l('elbow', -1.35 - 0.2 * s); p.r('elbow', -1.35 + 0.2 * s)
    p.lift(0.035 * Math.abs(Math.sin(ph)))
  },
  dance(t, p, c) {
    relax(p, c)
    const bpm = 2.0, bt = t * bpm
    const bounce = Math.abs(Math.sin(Math.PI * bt))
    const alt = Math.sin(Math.PI * bt * 0.5)
    p.l('shoulder', -0.35, 0, 2.45 + 0.25 * alt); p.r('shoulder', -0.35, 0, 2.45 - 0.25 * alt)
    p.s('elbow', -0.55); p.l('elbow', -0.55, 0.3 * alt); p.r('elbow', -0.55, -0.3 * alt)
    p.l('clav', 0, 0, 0.16 * bounce); p.r('clav', 0, 0, 0.16 * bounce)
    const step = Math.floor(bt) % 2, lp = bt % 1, lf = Math.sin(Math.PI * lp)
    const up = step ? 'L' : 'R', dn = step ? 'R' : 'L'
    setLeg(p, up, -0.15 - 0.6 * lf, 0.15 + 1.25 * lf, 0.25 * lf)
    setLeg(p, dn, -0.12 * bounce, 0.25 * bounce, 0)
    p.j('spine', 0.06 + 0.06 * bounce, 0.12 * alt); p.j('head', 0.08 * bounce, -0.1 * alt)
    p.lift(0.03 * bounce)
  },
  dance2(t, p, c) {
    relax(p, c)
    const sw = smooth(-0.2, 0.2, Math.sin(Math.PI * t / 4))
    const bulb = (sd, k) => {
      p.side(sd, 'shoulder', lerp(-0.7, -0.25, k), 0, lerp(0.2, 2.75, k))
      p.side(sd, 'elbow', lerp(-0.7, -0.35, k), lerp(0, 0.9 * Math.sin(t * TAU * 1.5), k))
      p.side(sd, 'wrist', lerp(0.5 * Math.sin(t * TAU * 3), 0, k), 0, 0)
    }
    bulb('R', sw); bulb('L', 1 - sw)
    const b = Math.sin(t * TAU)
    p.j('hips', 0, 0.22 * b, 0); p.j('chest', 0, -0.12 * b, 0)
    const kb = 0.25 * Math.abs(b)
    setLeg(p, 'L', -kb * 0.5, kb, 0); setLeg(p, 'R', -kb * 0.5, kb, 0)
    p.j('head', 0.05 * Math.abs(b), -0.15 * b, 0.08 * b)
  },
  dance3(t, p, c) {
    relax(p, c)
    const ph = t * TAU * 0.5, a = Math.sin(ph), a2 = Math.sin(ph * 2)
    p.j('hips', 0, 0.1 * a, 0.06 * a); p.hip(0.03 * a, 0)
    p.j('chest', 0.0, -0.12 * a, -0.05 * a)
    p.l('shoulder', -0.55 - 0.25 * a, 0.5, 1.05 + 0.55 * a); p.r('shoulder', -0.55 + 0.25 * a, 0.5, 1.05 - 0.55 * a)
    p.l('elbow', -0.95 + 0.25 * a, 0.4 * a2); p.r('elbow', -0.95 - 0.25 * a, -0.4 * a2)
    p.l('wrist', 0.45 * Math.sin(ph * 2 + 1), 0, 0.3 * Math.cos(ph * 2)); p.r('wrist', 0.45 * Math.sin(ph * 2), 0, 0.3 * Math.cos(ph * 2 + 1))
    const kL = 0.12 + 0.12 * Math.max(0, a), kR = 0.12 + 0.12 * Math.max(0, -a)
    setLeg(p, 'L', -kL * 0.5 - 0.05 * a, kL, 0); setLeg(p, 'R', -kR * 0.5 + 0.05 * a, kR, 0)
    p.add('thighL', 0, 0, -0.06 * a); p.add('thighR', 0, 0, -0.06 * a)
    p.j('head', 0.04, -0.18 * a, 0.1 * a)
  },
  wave(t, p, c) {
    ANIMS.idle(t, p, c)
    const w = Math.sin(t * TAU * 1.6)
    p.r('shoulder', -0.25, 0.9, 2.35 + 0.12 * w)
    p.r('elbow', -0.55 - 0.25 * w, 0.2)
    p.r('wrist', 0, 0, 0.25 * w)
    p.add('head', 0.02, -0.08, -0.06)
  },
  clap(t, p, c) {
    ANIMS.idle(t, p, c)
    const ph = t * TAU * 2.2
    const o = 0.012 + 0.07 * Math.pow(Math.max(0, Math.sin(ph)), 0.7)
    const L = c.L
    armIK(p, 'L', [o + 0.008, -0.02, 0.27], [0.4, -1, 0], L, -0.2)
    armIK(p, 'R', [-o - 0.008, -0.02, 0.27], [-0.4, -1, 0], L, 0.2)
    p.l('wrist', -0.2, 0, -0.2); p.r('wrist', -0.2, 0, -0.2)
    p.add('head', 0.05 * Math.abs(Math.sin(ph / 2)), 0, 0)
  },
  cheer(t, p, c) {
    relax(p, c)
    const b = Math.abs(Math.sin(t * TAU * 1.2))
    p.l('shoulder', -0.2, 0.3, 2.75 + 0.12 * b); p.r('shoulder', -0.2, 0.3, 2.75 + 0.12 * b)
    p.s('elbow', -0.3 - 0.2 * b)
    p.j('spine', -0.06 - 0.03 * b); p.j('head', -0.18)
    setLeg(p, 'L', -0.1 * (1 - b), 0.2 * (1 - b), 0); setLeg(p, 'R', -0.1 * (1 - b), 0.2 * (1 - b), 0)
    p.lift(0.05 * b)
  },
  namaste(t, p, c) {
    ANIMS.idle(t, p, c)
    const L = c.L
    armIK(p, 'L', [0.022, -0.03, 0.2], [0.8, -1, -0.2], L, -0.6)
    armIK(p, 'R', [-0.022, -0.03, 0.2], [-0.8, -1, -0.2], L, 0.6)
    p.l('wrist', -0.6, 0, -0.9); p.r('wrist', -0.6, 0, -0.9)
    p.add('head', 0.18, 0, 0); p.add('spine', 0.06)
  },
  sit(t, p, c) {
    relax(p, c)
    const L = c.L
    const seatY = 0.45 / c.scale + (c.fem ? 0.075 : 0.085)
    const th = -1.42
    const kneeY = seatY - L.thigh * Math.cos(th)
    const a2 = Math.acos(clamp((kneeY - L.ankleH) / L.shin, -1, 1)) * 0.9 + 0.05
    for (const sd of ['L', 'R']) { p.side(sd, 'thigh', th, 0, 0.07); p.side(sd, 'knee', a2 - th); p.side(sd, 'ankle', -a2) }
    p.seat(seatY)
    const b = Math.sin(t * 1.3 + c.ph)
    p.j('spine', 0.05 + 0.01 * b); p.j('chest', -0.02 * b)
    const chestY = seatY + (L.chestY - L.hipY)
    const kz = L.thigh * Math.sin(-th)
    armIK(p, 'L', [0.12, kneeY - chestY + 0.07, kz - 0.06], [0.6, -0.4, -1], L, 0.3)
    armIK(p, 'R', [-0.12, kneeY - chestY + 0.07, kz - 0.06], [-0.6, -0.4, -1], L, -0.3)
    p.s('wrist', 0.3, 0, 0)
    p.j('head', 0.03 * Math.sin(t * 0.5 + c.ph), 0.2 * Math.sin(t * 0.27 + c.ph))
    if (c.holdBook) holdBook(p, c, t)
  },
  drive(t, p, c) {
    relax(p, c)
    const L = c.L
    p.seat(L.hipY * 0.48)
    for (const sd of ['L', 'R']) { p.side(sd, 'thigh', -1.3, 0, 0.1); p.side(sd, 'knee', 1.05); p.side(sd, 'ankle', 0.1) }
    p.j('spine', -0.12); p.j('chest', 0.04); p.j('neck', 0.05); p.j('head', 0.03, 0.12 * Math.sin(t * 0.4 + c.ph))
    const s = 0.02 * Math.sin(t * 0.9)
    armIK(p, 'L', [0.17, -0.03 + s, 0.4], [1, -0.6, 0], L, 0.9)
    armIK(p, 'R', [-0.17, -0.03 - s, 0.4], [-1, -0.6, 0], L, -0.9)
    p.s('wrist', 0.15, 0, -0.2)
  },
  ride(t, p, c) {
    relax(p, c)
    const L = c.L
    p.seat(0.075)
    const b = Math.sin(t * 2.4)
    for (const sd of ['L', 'R']) { p.side(sd, 'thigh', -0.85, 0, 0.42); p.side(sd, 'knee', 1.25, 0, 0); p.side(sd, 'ankle', -0.25, 0, -0.15) }
    p.j('spine', -0.02 + 0.015 * b); p.j('head', 0.02, 0.1 * Math.sin(t * 0.33 + c.ph))
    armIK(p, 'L', [0.09, -0.27, 0.3], [1, -0.7, -0.3], L, 0.6)
    armIK(p, 'R', [-0.09, -0.27, 0.3], [-1, -0.7, -0.3], L, -0.6)
    p.s('wrist', 0.1, 0, -0.3)
  },
  applyHaldi(t, p, c) {
    ANIMS.idle(t, p, c)
    const L = c.L
    const ph = (t * 1.3) % 1
    const dab = Math.pow(Math.sin(Math.PI * clamp(ph * 2.2, 0, 1)), 2)
    p.j('spine', 0.12 + 0.05 * dab); p.add('chest', 0.03, -0.08)
    armIK(p, 'R', [-0.05, 0.14 + 0.03 * dab, 0.38 + 0.12 * dab], [-0.6, -1, 0], L, 0.4)
    p.r('wrist', -0.5, 0, 0.1)
    armIK(p, 'L', [0.06, -0.2, 0.26], [0.8, -1, -0.2], L, -1.4)
    p.l('wrist', 0.25, 0, 0)
    p.add('head', 0.1, -0.05)
  },
  duck(t, p, c) {
    relax(p, c)
    const L = c.L
    const j = 0.03 * Math.sin(t * 9)
    setLeg(p, 'L', -1.25, 1.95, 0, 0, 0.12); setLeg(p, 'R', -1.15, 1.85, 0, 0, 0.12)
    p.j('spine', 0.55 + j); p.j('chest', 0.15); p.j('neck', 0.2); p.j('head', 0.15, 0.2 * Math.sin(t * 3))
    armIK(p, 'L', [0.1, 0.36, 0.14], [1, 0.2, 0.3], L, 0)
    armIK(p, 'R', [-0.1, 0.36, 0.14], [-1, 0.2, 0.3], L, 0)
    p.s('wrist', -0.3, 0, 0)
  },
  playDhol(t, p, c) {
    relax(p, c)
    const L = c.L
    const bt = t * 2.2
    const strikeR = Math.pow(Math.max(0, Math.sin(Math.PI * bt)), 3)
    const strikeL = Math.pow(Math.max(0, Math.sin(Math.PI * (bt + 0.5))), 3)
    const yD = L.hipY + 0.04 - L.chestY
    armIK(p, 'R', [-0.31 + 0.06 * strikeR, yD + 0.12 - 0.08 * strikeR, 0.3], [-1, -0.3, -0.4], L, -0.4)
    armIK(p, 'L', [0.3 - 0.04 * strikeL, yD + 0.07 - 0.03 * strikeL, 0.27], [1, -0.4, -0.4], L, 0.4)
    p.r('wrist', 0.2 + 0.5 * strikeR, 0, 0.3); p.l('wrist', 0.2 + 0.3 * strikeL, 0, 0.2)
    marching(p, t, 0.5)
    p.j('head', 0.05 * strikeR, 0.12 * Math.sin(t * 0.7))
  },
  playTrumpet(t, p, c) {
    relax(p, c)
    const L = c.L
    const sw = 0.02 * Math.sin(t * 2.2)
    const hy = L.headY + 0.03 - L.chestY
    armIK(p, 'R', [-0.05, hy - 0.03 + sw, 0.24], [-1, -0.8, 0], L, 1.3)
    armIK(p, 'L', [0.04, hy - 0.06 + sw, 0.33], [1, -0.8, 0], L, -0.9)
    p.r('wrist', 0.1, 0, -0.3); p.l('wrist', 0.3, 0, 0.3)
    p.j('head', -0.06 + sw, 0); p.j('spine', -0.04)
    marching(p, t, 0.6)
  },
  photo(t, p, c) {
    ANIMS.idle(t, p, c)
    const L = c.L
    const hy = L.headY + 0.088 - L.chestY
    const k = Math.sin(t * 0.8) * 0.01
    armIK(p, 'R', [-0.085, hy - 0.035 + k, 0.13], [-1, -0.9, -0.2], L, 1.2)
    armIK(p, 'L', [0.035, hy - 0.07 + k, 0.16], [0.6, -1, -0.1], L, -1.2)
    p.r('wrist', 0.1, 0, 0.6); p.l('wrist', -0.3, 0, 0.9)
    p.j('head', 0.06, 0, 0); p.j('neck', 0.0)
  },
  talk(t, p, c) {
    ANIMS.idle(t, p, c)
    const L = c.L
    const g1 = Math.sin(t * 2.3 + c.ph), g2 = Math.sin(t * 1.7 + 1.3 + c.ph), g3 = Math.sin(t * 3.1)
    armIK(p, 'R', [-0.2 + 0.05 * g1, -0.2 + 0.07 * Math.max(0, g2), 0.25 + 0.04 * g3], [-1, -0.6, -0.2], L, -0.6 - 0.5 * Math.max(0, g1))
    p.r('wrist', -0.2 + 0.3 * g3, 0, 0.2)
    if (c.holdBook) holdBook(p, c, t)
    else {
      armIK(p, 'L', [0.18 - 0.03 * g2, -0.26 + 0.05 * Math.max(0, -g1), 0.2 + 0.05 * g2], [1, -0.6, -0.2], L, 0.6)
      p.l('wrist', -0.1, 0, 0.2)
    }
    p.add('head', 0.06 * Math.max(0, g3) - 0.02, 0.1 * g2, 0.04 * g1)
  },
}
function holdBook(p, c, t, walking = false) {
  const L = c.L
  armIK(p, 'L', walking ? [0.15, -0.3, 0.12] : [0.07, -0.16, 0.22], [1, -0.7, -0.2], L, -1.3)
  p.l('wrist', 0.15, 0, -0.15)
}
function marching(p, t, amp) {
  const ph = t * TAU * 1.1
  for (const [sd, o] of [['L', 0], ['R', Math.PI]]) {
    const l = Math.max(0, Math.sin(ph + o))
    setLeg(p, sd, -0.35 * l * amp, 0.7 * l * amp + 0.04, 0.1 * l)
  }
  p.j('hips', 0, 0.05 * Math.sin(ph), 0)
}
const ANIM_FNS = ANIMS
function evalAnim(name, t, out, c) { ANIM_FNS[name](t, P(out), c) }
export const ANIMATIONS = Object.keys(ANIMS)

// ============================================================== palettes
const SKIN = ['#8a5a3c', '#9a6646', '#a8734f', '#b47f5a', '#c18c66', '#cc9a74', '#7c4f34', '#b98563']
const HAIR = ['#14100e', '#1c1511', '#261b14', '#14100e']
const JEWEL = ['#1f6b4f', '#23407a', '#7a1f3d', '#5b3a7a', '#1f6f73', '#0f5a46', '#2d5a8c']
const PASTEL = ['#e7bdb5', '#bcdcca', '#b9cbe2', '#cdbbe0', '#e8d6b4', '#f0e6d4', '#e9c9d2', '#cfe3d9']
const MEN_KURTA = ['#efe7d6', '#e4dccb', '#cfdbe3', '#f2efe8', '#d9cfbd', '#bfcfc4', '#dcd2e2']
const JACKETS = ['#1f4f3c', '#1c2a44', '#3a3a3e', '#5a1f2c', '#7a6a4f', '#2b2b2b', '#24504f']
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length]

// ============================================================== shared part builders
function collar(ch, kind, mat) {
  const L = ch.L, R = ch.rows
  const top = R[0]
  const y0 = R[1].y - 0.005
  const key = 'collar|' + kind + ch.spec.sex + (ch.spec.build || 'avg')
  const geo = cachedGeo(key, () => {
    const parts = []
    const rx = top.rx + 0.012, rz = top.rz + 0.012
    if (kind === 'band' || kind === 'shirt' || kind === 'polo') {
      const h = kind === 'band' ? 0.042 : 0.032
      const rows = [{ y: y0 + h, rx: rx + 0.002, rz: rz + 0.004, zo: top.zo }, { y: y0, rx: rx + 0.006, rz: rz + 0.008, zo: top.zo - 0.004 }]
      parts.push({ g: latheGeo(rows, { segs: 20 }) })
    }
    if (kind === 'shirt' || kind === 'polo') {
      for (const s of [-1, 1]) {
        const shape = new THREE.Shape()
        shape.moveTo(0, 0); shape.lineTo(s * 0.055, -0.004); shape.lineTo(s * 0.02, -0.06); shape.lineTo(0, -0.01)
        const g = new THREE.ExtrudeGeometry(shape, { depth: 0.003, bevelEnabled: false })
        const fz = rz + top.zo + 0.006
        parts.push({ g, m: mtx(s * 0.006, y0 + 0.012, fz - 0.012, -0.55, 0, 0) })
      }
      if (kind === 'polo') {
        const rows = [{ y: y0 + 0.032, rx: rx + 0.004, rz: rz + 0.006, zo: top.zo }, { y: y0 + 0.002, rx: rx + 0.03, rz: rz + 0.026, zo: top.zo - 0.008 }]
        parts.push({ g: latheGeo(rows, { segs: 20 }) })
      }
    }
    return mergeGeos(parts)
  })
  return ch.onChest(geo, mat)
}
function placket(ch, mat, { len = 0.17, buttons = 3, w = 0.026, btnHex = '#efe9dc', thick = 0.012 } = {}) {
  const R = ch.rows
  const y0 = R[1].y - 0.012
  const key = 'placket|' + ch.spec.sex + (ch.spec.build || 'avg') + len + buttons + btnHex + thick + w
  const geo = cachedGeo(key, () => {
    const parts = []
    const n = 6
    for (let i = 0; i < n; i++) {
      const y = y0 - (i + 0.5) * len / n
      const [, , z] = surfPt(R, 0, y, 1, thick + 0.002)
      parts.push({ g: new THREE.BoxGeometry(w, len / n + 0.002, 0.003), m: mtx(0, y, z, 0, 0, 0), c: null })
    }
    const pg = mergeGeos(parts)
    return pg
  })
  ch.onChest(geo, mat)
  if (buttons) {
    const bkey = 'btn|' + key
    const bg = cachedGeo(bkey, () => {
      const parts = []
      for (let i = 0; i < buttons; i++) {
        const y = y0 - 0.02 - i * (len - 0.03) / Math.max(1, buttons - 1)
        const [, , z] = surfPt(R, 0, y, 1, thick + 0.004)
        parts.push({ g: new THREE.CylinderGeometry(0.0055, 0.0055, 0.003, 8), m: mtx(0, y, z, Math.PI / 2, 0, 0) })
      }
      return mergeGeos(parts)
    })
    ch.onChest(bg, stdMat('btn' + btnHex, { color: btnHex, roughness: 0.35 }))
  }
}
function neckDrape(ch, key, mat, { off = 0.012, endY = 0.6, width = 0.16, neckW = 0.1, spread = 0.11, oneSide = false } = {}) {
  // dupatta/stole draped around the back of the neck with both ends down the front
  const R = ch.rows, L = ch.L
  const top = R[0].y, shoulderTop = R[2].y + 0.018
  const sz = (x, y) => surfPt(ch.garRows || R, x, y, 1, off + 0.004)
  const ctrl = []
  const frontSide = (s, down) => {
    const ys = [endY, (endY + L.spineY) / 2, L.spineY + 0.02, L.chestY + 0.02, L.shoulderY - 0.02]
    const pts = ys.map((y, i) => ({ p: sz(s * (spread + (ys.length - 1 - i) * 0.004), y), n: [s * 0.15, 0.05, 1], w: lerp(width, neckW * 1.2, i / (ys.length - 1)) }))
    return down ? pts.reverse() : pts
  }
  ctrl.push(...frontSide(1, false))
  ctrl.push({ p: [0.105, shoulderTop + 0.012, -0.004], n: [0.25, 1, 0.1], w: neckW })
  ctrl.push({ p: [0.06, top - 0.02, -0.06], n: [0.3, 0.6, -1], w: neckW * 0.9 })
  ctrl.push({ p: [0, top - 0.028, -0.072], n: [0, 0.5, -1], w: neckW * 0.9 })
  ctrl.push({ p: [-0.06, top - 0.02, -0.06], n: [-0.3, 0.6, -1], w: neckW * 0.9 })
  ctrl.push({ p: [-0.105, shoulderTop + 0.012, -0.004], n: [-0.25, 1, 0.1], w: neckW })
  if (oneSide) {
    // over the left shoulder only: the other end falls down the back
    ctrl.splice(ctrl.length - 4)
    ctrl.push({ p: [0.09, L.chestY, -(R[6].rz + off + 0.012)], n: [0, 0, -1], w: neckW * 1.2 })
    ctrl.push({ p: [0.1, L.spineY, -(R[9].rz + off + 0.016)], n: [0, 0, -1], w: width })
    ctrl.push({ p: [0.11, endY + 0.1, -(R[12].rz + off + 0.03)], n: [0, 0, -1], w: width })
  } else ctrl.push(...frontSide(-1, true))
  return ch.ribbon(key, ctrl, mat, { segs: 48 })
}

/** Sash across the torso from right hip over left shoulder and down the back (saree pallu / bridal drape). */
function sash(ch, key, mat, { off = 0.012, width = 0.24, backEnd = 0.75, frontStart = null, head = false } = {}) {
  const R = ch.rows, L = ch.L
  const sp = (x, y, sg, o = off) => surfPt(R, x, y, sg, o)
  const fs = frontStart ?? L.hipY + 0.08
  const ctrl = [
    { p: sp(-0.13, fs, 1, off + 0.01), n: [-0.3, 0, 1], w: width * 0.9 },
    { p: sp(-0.05, (fs + L.chestY) / 2, 1, off + 0.012), n: [0, 0, 1], w: width },
    { p: sp(0.05, L.chestY + 0.02, 1, off + 0.016), n: [0.1, 0.1, 1], w: width * 0.85 },
    { p: sp(0.1, L.shoulderY - 0.03, 1, off + 0.01), n: [0.3, 0.6, 1], w: width * 0.55 },
    { p: [0.11, R[2].y + 0.03, -0.01], n: [0.3, 1, 0], w: width * 0.45 },
    { p: sp(0.1, L.shoulderY - 0.04, -1, off + 0.012), n: [0.2, 0.3, -1], w: width * 0.6 },
    { p: sp(0.1, L.chestY - 0.05, -1, off + 0.015), n: [0.1, 0, -1], w: width * 0.85 },
    { p: sp(0.1, L.spineY - 0.05, -1, off + 0.02), n: [0, 0, -1], w: width },
    { p: [0.1, backEnd, -(sampleRows(R, L.hipY).rz + off + 0.06)], n: [0, 0, -1], w: width * 1.05 },
  ]
  return ch.ribbon(key, ctrl, mat, { segs: 48, legInfl: 0.3 })
}

function garland(ch) {
  const R = ch.rows, L = ch.L
  const key = 'garland|' + ch.spec.sex + (ch.spec.build || 'avg') + (ch.garlandOff || 0)
  const geo = cachedGeo(key, () => {
    const off = 0.034 + (ch.garlandOff || 0)
    const pts = []
    const yb = L.spineY - 0.04
    const front = (x, y) => surfPt(R, x, y, 1, off)
    pts.push([0, R[0].y - 0.02, -(R[0].rz + 0.03)])
    pts.push([0.075, R[1].y, -0.03])
    pts.push([0.12, R[2].y + 0.016, 0.0])
    pts.push(front(0.13, L.shoulderY - 0.06))
    pts.push(front(0.12, L.chestY))
    pts.push(front(0.075, (L.chestY + yb) / 2))
    pts.push(front(0, yb))
    pts.push(front(-0.075, (L.chestY + yb) / 2))
    pts.push(front(-0.12, L.chestY))
    pts.push(front(-0.13, L.shoulderY - 0.06))
    pts.push([-0.12, R[2].y + 0.016, 0.0])
    pts.push([-0.075, R[1].y, -0.03])
    return garlandGeo(pts, { count: 44, r: 0.02, palette: ['#f29a12', '#f6b21b', '#ffffff', '#f29a12', '#c4122f', '#f6b21b', '#fff3d6'] })
  })
  const m = ch.onChest(geo, vcMat())
  return m
}

// ---- groom head extras
function safaAndSehra(ch) {
  const hr = ch.headRoot
  const group = new THREE.Group()
  hr.add(group)
  const safaGeo = cachedGeo('safa', () => {
    const rows = [
      [0.288, 0.002], [0.286, 0.05], [0.276, 0.085], [0.255, 0.104], [0.215, 0.114], [0.17, 0.114], [0.135, 0.104], [0.112, 0.092], [0.1, 0.086],
    ].map(([y, r]) => ({ y, rx: r, rz: r * 1.13, zo: -0.004 }))
    return latheGeo(rows, { segs: 28 })
  })
  const safaM = cloth('safa', '#ffffff', TX.safaTex('#ecd9c8', '#cfa75c', '#e3aba2'), { side: THREE.FrontSide, rough: 0.7 })
  const safa = ch.mesh(safaGeo, safaM, group)
  safa.rotation.x = -0.22
  safa.position.set(0, -0.004, -0.004)
  // gold band at the base + kalgi brooch with plume
  const deco = cachedGeo('safaDeco', () => {
    const parts = []
    parts.push({ g: new THREE.TorusGeometry(0.094, 0.0045, 6, 32), m: mtx(0, 0.103, -0.004, Math.PI / 2, 0, 0, 1, 1.13, 1) })
    parts.push({ g: ell(0.017, 0.022, 0.008, 12, 8), m: mtx(0, 0.18, 0.124) })
    parts.push({ g: ell(0.008, 0.012, 0.004, 8, 6), m: mtx(0, 0.152, 0.126) })
    return mergeGeos(parts)
  })
  const d = ch.mesh(deco, goldMat(), group); d.rotation.x = -0.22; d.position.copy(safa.position)
  const gems = cachedGeo('safaGems', () => mergeGeos([
    { g: ell(0.0085, 0.0085, 0.005, 10, 8), m: mtx(0, 0.18, 0.131), c: '#2e8a63' },
    { g: ell(0.006, 0.007, 0.006, 8, 6), m: mtx(0, 0.137, 0.127), c: '#fbf7ee' },
    ...[-1, 1].map(s => ({ g: ell(0.004, 0.004, 0.004, 6, 4), m: mtx(s * 0.012, 0.18, 0.128), c: '#fbf7ee' })),
  ], true))
  const gm = ch.mesh(gems, vcMat(true), group); gm.rotation.x = -0.22; gm.position.copy(safa.position)
  const plume = cachedGeo('plume', () => {
    const curve = new THREE.CatmullRomCurve3([new V3(0, 0.19, 0.12), new V3(0, 0.26, 0.11), new V3(0, 0.32, 0.085), new V3(0, 0.355, 0.05)])
    return sweepGeo(curve, (t) => [0.006 + 0.01 * Math.sin(Math.PI * Math.min(1, t * 1.2)), 0.004 + 0.003 * Math.sin(Math.PI * t)], { segs: 14, radial: 8, up: new V3(1, 0, 0), closeEnd: true })
  })
  const pl = ch.mesh(plume, cloth('plume', '#fbf6ea', null, { rough: 0.9 }), group); pl.rotation.x = -0.22; pl.position.copy(safa.position)
  // turban tail down the back
  const tail = cachedGeo('safaTail', () => ribbonGeo([
    { p: [0, 0.14, -0.105], n: [0, 0.2, -1], w: 0.07 },
    { p: [0, 0.05, -0.1], n: [0, 0, -1], w: 0.08 },
    { p: [0, -0.08, -0.1], n: [0, 0, -1], w: 0.09 },
    { p: [0, -0.24, -0.13], n: [0, 0, -1], w: 0.1 },
  ], { segs: 10, puff: 0.004 }))
  ch.mesh(tail, safaM.side === THREE.DoubleSide ? safaM : cloth('safaD', '#ffffff', TX.safaTex('#ecd9c8', '#cfa75c', '#e3aba2')), group)
  // sehra curtain (two layers of pearl/flower strands)
  const sehra = new THREE.Group()
  sehra.position.set(0, 0.12, -0.004)
  group.add(sehra)
  const sTex = TX.sehraTex()
  const sm = cachedMat('sehra', () => { const m = new THREE.MeshStandardMaterial({ map: sTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.35, color: '#ffffff' }); m.userData.cat = 'flower'; return m })
  for (const [r, off, k] of [[0.124, 0, 0], [0.132, 0.5, 1]]) {
    const geo = cachedGeo('sehra' + k, () => {
      const g = new THREE.CylinderGeometry(r, r + 0.03, 0.34, 40, 1, true, -Math.PI * 0.78 + Math.PI, Math.PI * 1.56)
      g.translate(0, -0.17, 0)
      g.scale(1, 1, 1.12)
      const uv = g.attributes.uv
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 3 + off)
      return g
    })
    const m = ch.mesh(geo, sm, sehra, { cast: true })
    m.rotation.x = -0.05
  }
  ch.sehra = sehra
  return group
}

// ---- bride / women head extras
function veil(ch, mat, { back = 0.95 } = {}) {
  const hr = ch.headRoot
  const cap = cachedGeo('veilCap', () => {
    const g = new THREE.SphereGeometry(1, 18, 8, 0, TAU, 0, Math.PI * 0.62)
    g.scale(0.098, 0.12, 0.115)
    return g
  })
  const m = ch.mesh(cap, mat, hr)
  m.position.set(0, 0.075, -0.012)
  m.rotation.x = -0.62
  // back fall: from the back of the head to the hips, skinned to the body
  const R = ch.rows, L = ch.L
  const key = 'veilBack|' + back
  const hs = L.headScale
  const ctrl = [
    { p: [0, L.headY + 0.15 * hs, -0.095], n: [0, 0.5, -1], w: 0.15 },
    { p: [0, L.headY + 0.03 * hs, -0.12], n: [0, 0, -1], w: 0.24 },
    { p: [0, L.neckY - 0.02, -(R[2].rz + 0.06)], n: [0, 0.2, -1], w: 0.36 },
    { p: [0, L.chestY, -(R[6].rz + 0.035)], n: [0, 0, -1], w: 0.44 },
    { p: [0, L.spineY - 0.04, -(R[10].rz + 0.045)], n: [0, 0, -1], w: 0.46 },
    { p: [0, back, -(R[12].rz + 0.09)], n: [0, 0, -1], w: 0.52 },
  ]
  ch.ribbon(key, ctrl, mat, { segs: 24, cols: 4, puff: 0.03, legInfl: 0.25 })
}
function jewellery(ch, { tikka = true, jhoomar = false, necklace = 'choker', earrings = true, nath = false, bangles = true }) {
  const hr = ch.headRoot
  const parts = []
  if (tikka) {
    parts.push({ g: new THREE.CylinderGeometry(0.0012, 0.0012, 0.05, 4), m: mtx(0, 0.2, 0.06, 0.95, 0, 0) })
    parts.push({ g: ell(0.0085, 0.0105, 0.004, 8, 5), m: mtx(0, 0.152, faceZ(0, 0.152, true) + 0.006, -0.25) })
  }
  if (jhoomar) {
    for (let i = 0; i < 4; i++) parts.push({ g: new THREE.CylinderGeometry(0.0013, 0.0013, 0.05 - i * 0.006, 4), m: mtx(0.06 + i * 0.004, 0.15 - i * 0.005, 0.03 - i * 0.012, 0.2, 0, -0.5 + i * 0.12) })
    parts.push({ g: ell(0.014, 0.01, 0.004, 8, 4), m: mtx(0.072, 0.13, 0.005, 0, 1.3, 0) })
  }
  if (earrings) for (const s of [-1, 1]) {
    parts.push({ g: new THREE.ConeGeometry(0.008, 0.014, 8, 1, true), m: mtx(s * 0.071, 0.034, 0.0, 0, 0, 0) })
    parts.push({ g: ell(0.0035, 0.0035, 0.0035, 4, 3), m: mtx(s * 0.071, 0.045, 0.0) })
  }
  if (nath) parts.push({ g: new THREE.TorusGeometry(0.008, 0.0009, 4, 16), m: mtx(0.012, 0.042, faceZ(0.012, 0.045, true) + 0.008, 0, 0.3, 0) })
  if (parts.length) ch.mesh(cachedGeo('jHead|' + JSON.stringify([tikka, jhoomar, earrings, nath]), () => mergeGeos(parts)), goldMat(), hr, { cast: false })
  if (necklace) {
    const R = ch.rows
    const geo = cachedGeo('neckl|' + necklace + ch.spec.sex + (ch.spec.build || 'avg'), () => {
      const ps = []
      const n0 = R[0], ny = R[1].y - 0.012
      ps.push({ g: new THREE.TorusGeometry(1, 0.11, 4, 24), m: mtx(0, ny, n0.zo + 0.004, Math.PI / 2 - 0.35, 0, 0, n0.rx + 0.012, (n0.rz + 0.02), 0.07) })
      if (necklace === 'haar') {
        const pts = []
        for (let i = 0; i <= 20; i++) {
          const a = (i / 20) * Math.PI
          const x = Math.cos(a) * 0.085
          const y = R[2].y - 0.02 - Math.sin(a) * 0.1
          pts.push(new V3(...surfPt(R, x, y, 1, 0.02)))
        }
        ps.push({ g: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.004, 4), m: null })
        const low = pts[10]
        ps.push({ g: ell(0.016, 0.02, 0.006, 7, 5), m: mtx(low.x, low.y - 0.012, low.z + 0.004) })
      }
      for (let i = -2; i <= 2; i++) ps.push({ g: ell(0.0045, 0.007, 0.003, 5, 3), m: mtx(i * 0.016, ny - 0.03 + Math.abs(i) * 0.004, surfPt(R, i * 0.016, ny - 0.03, 1, 0.012)[2]) })
      return mergeGeos(ps)
    })
    ch.onChest(geo, goldMat())
  }
  if (bangles) {
    const geo = cachedGeo('bangles', () => {
      const ps = []
      for (let i = 0; i < 3; i++) ps.push({ g: new THREE.TorusGeometry(0.036, 0.0045, 3, 11), m: mtx(0, -0.013 * i, 0, Math.PI / 2, 0, 0), c: i % 2 === 1 ? '#9e1b2c' : '#d9b25f' })
      return mergeGeos(ps, true)
    })
    for (const s of ['L', 'R']) {
      const m = ch.mesh(geo, vcMat(true), ch.joints['elbow' + s], { cast: false })
      m.position.y = -ch.L.forearm * 0.86
      m.scale.setScalar(ch.fem ? 0.88 : 1)
    }
  }
}
function bun(ch, hairM, gajra = false) {
  const geo = cachedGeo('bun', () => ell(0.044, 0.04, 0.034, 10, 7))
  const m = ch.mesh(geo, hairM, ch.headRoot)
  m.position.set(0, 0.07, -0.11)
  if (gajra) {
    const g = cachedGeo('gajra', () => new THREE.TorusGeometry(0.04, 0.009, 6, 18))
    const gm = ch.mesh(g, cloth('gajra', '#fbf8ef', null, { rough: 0.8 }), ch.headRoot)
    gm.position.set(0, 0.07, -0.098); gm.rotation.x = 0.15
  }
}
function braid(ch, hairM, len = 0.5) {
  const L = ch.L
  const geo = cachedGeo('braid' + len + ch.spec.sex, () => {
    const pts = [new V3(0, L.headY + 0.07, -0.085), new V3(0, L.headY - 0.04, -0.09), new V3(0, L.neckY - 0.06, -(ch.rows[3].rz + 0.03)), new V3(0, L.neckY - 0.06 - len * 0.5, -(ch.rows[6].rz + 0.03)), new V3(0, L.neckY - 0.06 - len, -(ch.rows[8].rz + 0.03))]
    const curve = new THREE.CatmullRomCurve3(pts)
    const g = sweepGeo(curve, (t) => {
      const r = lerp(0.03, 0.012, t) * (1 + 0.18 * Math.abs(Math.sin(t * 34)))
      return [r * 1.15, r * 0.85]
    }, { segs: 40, radial: 8, closeEnd: true })
    addSkin(g, bodyWeights(L, 0, 1))
    return g
  })
  ch.skin(geo, hairM)
}
function longHair(ch, hairM, len = 0.32) {
  const L = ch.L, R = ch.rows
  const geo = cachedGeo('longHair' + len, () => {
    const ctrl = [
      { p: [0, L.headY + 0.17, -0.06], n: [0, 1, -0.6], w: 0.13 },
      { p: [0, L.headY + 0.1, -0.11], n: [0, 0.3, -1], w: 0.16 },
      { p: [0, L.headY - 0.02, -0.105], n: [0, 0, -1], w: 0.17 },
      { p: [0, L.neckY - 0.04, -(R[3].rz + 0.02)], n: [0, 0.1, -1], w: 0.2 },
      { p: [0, L.neckY - 0.04 - len, -(R[7].rz + 0.02)], n: [0, 0, -1], w: 0.2 },
    ]
    const g = ribbonGeo(ctrl, { segs: 20, cols: 6, puff: 0.03 })
    addSkin(g, bodyWeights(L, 0, 1))
    return g
  })
  const m = ch.skin(geo, cachedMat('longHairM' + hairM.color.getHexString(), () => { const mm = hairM.clone(); mm.map = null; mm.alphaTest = 0; mm.side = THREE.DoubleSide; return mm }))
  return m
}

// ---- props
function prop(ch, geo, mat, carry, use) {
  const m = ch.mesh(geo, mat, ch.joints[carry.parent])
  const pr = {
    mesh: m,
    onAnim(name) {
      const cfg = use && use.anims.includes(name) ? use : carry
      ch.joints[cfg.parent].add(m)
      m.position.set(...cfg.pos)
      m.rotation.set(...(cfg.rot || [0, 0, 0]))
    },
  }
  pr.onAnim('idle')
  ch.props.push(pr)
  return pr
}
function bookGeo() {
  return cachedGeo('book', () => {
    const g = new THREE.BoxGeometry(0.03, 0.24, 0.17)
    return g
  })
}
function cameraGeo() {
  return cachedGeo('camera', () => mergeGeos([
    { g: new THREE.BoxGeometry(0.13, 0.085, 0.07), c: '#1b1b1d' },
    { g: new THREE.CylinderGeometry(0.034, 0.036, 0.08, 16), m: mtx(0, -0.004, 0.07, Math.PI / 2, 0, 0), c: '#141416' },
    { g: new THREE.CylinderGeometry(0.03, 0.03, 0.004, 16), m: mtx(0, -0.004, 0.112, Math.PI / 2, 0, 0), c: '#3a4a6a' },
    { g: new THREE.BoxGeometry(0.04, 0.025, 0.04), m: mtx(0, 0.05, 0.0), c: '#1b1b1d' },
    { g: new THREE.BoxGeometry(0.03, 0.08, 0.035), m: mtx(-0.055, -0.004, 0.025), c: '#232325' },
    { g: new THREE.BoxGeometry(0.025, 0.012, 0.004), m: mtx(0.035, 0.05, 0.022), c: '#bdbdbd' },
  ], true))
}
function trumpetGeo() {
  return cachedGeo('trumpet', () => {
    const parts = []
    const bell = latheGeo([[0, 0.006], [0.12, 0.009], [0.2, 0.02], [0.24, 0.045], [0.245, 0.047]].map(([y, r]) => ({ y: -y, rx: r, rz: r, zo: 0 })), { segs: 14 })
    parts.push({ g: bell, m: mtx(0, 0, 0.2, -Math.PI / 2, 0, 0) })
    parts.push({ g: new THREE.CylinderGeometry(0.006, 0.006, 0.25, 8), m: mtx(0, -0.035, 0.12, Math.PI / 2, 0, 0) })
    for (let i = 0; i < 3; i++) parts.push({ g: new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), m: mtx(0, -0.018, 0.1 + i * 0.022) })
    parts.push({ g: new THREE.CylinderGeometry(0.006, 0.004, 0.06, 8), m: mtx(0, 0, -0.01, Math.PI / 2, 0, 0) })
    parts.push({ g: new THREE.TorusGeometry(0.018, 0.005, 6, 12, Math.PI), m: mtx(0, -0.018, 0.247, 0, Math.PI / 2, Math.PI / 2) })
    return mergeGeos(parts)
  })
}
function dhol(ch) {
  const L = ch.L
  const geo = cachedGeo('dhol', () => {
    const rows = [[0, 0.15], [0.02, 0.16], [0.25, 0.175], [0.48, 0.16], [0.5, 0.15]].map(([y, r]) => ({ y: 0.25 - y, rx: r, rz: r, zo: 0 }))
    const g = latheGeo(rows, { segs: 22 })
    g.rotateZ(Math.PI / 2)
    return g
  })
  const m = ch.mesh(geo, cloth('dholBody', '#ffffff', TX.dholTex(), { side: THREE.FrontSide, rough: 0.6 }), ch.joints.hips)
  m.position.set(0, 0.04, 0.27)
  const heads = cachedGeo('dholHeads', () => mergeGeos([-1, 1].map(s => ({ g: new THREE.CylinderGeometry(0.15, 0.15, 0.01, 22), m: mtx(s * 0.252, 0, 0, 0, 0, Math.PI / 2) }))))
  const hm = ch.mesh(heads, cloth('dholHead', '#e9dcc0', null, { rough: 0.9 }), ch.joints.hips)
  hm.position.copy(m.position)
  // strap
  const R = ch.rows
  const strap = cachedGeo('dholStrap' + ch.spec.build, () => ribbonGeo([
    { p: [0.2, L.hipY + 0.06, 0.2], n: [1, 0, 0.5], w: 0.04 },
    { p: surfPt(R, 0.08, L.chestY + 0.05, 1, 0.025), n: [0, 0.3, 1], w: 0.045 },
    { p: [-0.11, R[2].y + 0.03, -0.0], n: [-0.3, 1, 0], w: 0.045 },
    { p: surfPt(R, -0.1, L.chestY, -1, 0.02), n: [0, 0, -1], w: 0.045 },
    { p: [0.14, L.hipY + 0.06, -0.1], n: [1, 0, -0.5], w: 0.04 },
  ], { segs: 24, puff: 0 }))
  ch.onChest(strap, cloth('strap', '#c8962f', null))
  const sticks = cachedGeo('dholSticks', () => new THREE.CylinderGeometry(0.006, 0.008, 0.3, 6).translate(0, -0.15, 0))
  for (const s of ['L', 'R']) {
    const st = ch.mesh(sticks, stdMat('stick', { color: '#6b4524', roughness: 0.6 }), ch.joints['wrist' + s])
    st.position.set(0, -0.1, 0.02); st.rotation.set(-1.35, 0, 0)
    if (s === 'L') st.scale.set(0.7, 0.9, 0.7)
  }
}

// ============================================================== outfits per role
const TRAVEL = {
  build(ch) {
    const polo = cloth('polo', '#bba383', TX.knit(), { rough: 0.9 })
    const jeans = cloth('jeans', '#34496d', TX.denim(), { rough: 0.85 })
    ch.garment('polo', { hem: 0.86, thick: 0.014, flare: 0.01 }, polo)
    ch.pelvis(jeans, 0.008)
    collar(ch, 'polo', polo)
    placket(ch, polo, { len: 0.13, buttons: 2, w: 0.03, btnHex: '#c2ad8c', thick: 0.016 })
    ch.arms({ upper: { prof: [[0, 0.064], [1, 0.06]], len: 0.52, open: true, mat: polo }, under: { upper: true, fore: true } })
    ch.legs({ thigh: { prof: [[0, 0.092], [0.5, 0.082], [1, 0.066]], mat: jeans }, shin: { prof: [[0, 0.064], [0.5, 0.06], [1, 0.057]], mat: jeans, open: true } })
    ch.shoes('sneaker')
  },
}

function kurtaPyjama(ch, { kurta, pyjama, hem, hemRx, sleeve = 'full', collarKind = 'band', placketOn = true, curve = 0, salwar = false, churidar = false, thick = 0.012, btn = '#efe9dc', btnN = 4, cut }) {
  const L = ch.L
  const k = ch.garment('kurta', { hem, thick, cut: cut ?? (L.hipY - 0.02), hemRx, hemRz: hemRx * 0.78, hemCurve: curve, ease: 1.2 }, kurta)
  ch.pelvis(pyjama)
  collar(ch, collarKind, kurta)
  if (placketOn) placket(ch, kurta, { len: ch.fem ? 0.13 : 0.2, buttons: btnN, btnHex: btn, thick: thick + 0.002 })
  if (sleeve === 'full') ch.arms({ upper: { prof: [[0, 0.064], [1, 0.057]], mat: kurta }, fore: { prof: [[0, 0.057], [0.8, 0.05], [1, 0.047]], mat: kurta, open: true } })
  else if (sleeve === 'half') ch.arms({ upper: { prof: [[0, 0.064], [1, 0.06]], len: 0.75, open: true, mat: kurta }, under: { upper: true, fore: true } })
  if (salwar) ch.legs({ thigh: { prof: [[0, 0.11], [0.5, 0.112], [1, 0.1]], mat: pyjama }, shin: { prof: [[0, 0.1], [0.5, 0.095], [0.85, 0.08], [0.93, 0.055], [1, 0.052]], mat: pyjama, ripple: 0.006, rippleFrom: 0.2, open: true } })
  else if (churidar) ch.legs({ thigh: { prof: [[0, 0.09], [0.5, 0.078], [1, 0.062]], mat: pyjama }, shin: { prof: [[0, 0.06], [0.4, 0.058], [1, 0.045]], mat: pyjama, ripple: 0.005, rippleFrom: 0.55 } })
  else ch.legs({ thigh: { prof: [[0, 0.1], [0.5, 0.092], [1, 0.082]], mat: pyjama }, shin: { prof: [[0, 0.078], [0.5, 0.074], [1, 0.07]], mat: pyjama, open: true } })
  ch.garRows = null
  return k
}
function jacket(ch, mat, { hem = 0.84, sleeveless = true, thick = 0.028 } = {}) {
  const L = ch.L
  ch.garment('jacket', { hem, thick, flare: 0.012, segs: 26 }, mat)
  if (!sleeveless) ch.arms({ upper: { prof: [[0, 0.068], [1, 0.06]], mat }, fore: { prof: [[0, 0.06], [1, 0.05]], mat, open: true } })
  collar(ch, 'band', mat)
}

function groomBuild(ch, outfit) {
  const L = ch.L
  if (outfit === 'travel') TRAVEL.build(ch)
  else if (outfit === 'haldi') {
    const kurta = cloth('pathani', '#f1ebdc', TX.plainWeave(), { rough: 0.85 })
    kurtaPyjama(ch, { kurta, pyjama: kurta, hem: 0.47, hemRx: 0.235, curve: 0.07, collarKind: 'shirt', salwar: true, btnN: 4 })
    const dupM = cloth('haldiDup', '#ffffff', TX.dupattaTex('#f7c600', '#e8920c', 'haldi', { butis: true }), { rough: 0.75 })
    ch.garRows = ch.rows.map(r => ({ ...r, rx: r.rx + 0.014, rz: r.rz + 0.014 }))
    const kr = ch.garRows
    // extend skirt rows so the dupatta clears the kurta
    for (const y of [0.85, 0.75, 0.65, 0.55]) kr.push({ y, rx: lerp(0.17, 0.235, (0.92 - y) / 0.45), rz: lerp(0.112, 0.18, (0.92 - y) / 0.45), zo: 0 })
    kr.sort((a, b) => b.y - a.y)
    neckDrape(ch, 'haldiDupatta', dupM, { off: 0.008, endY: 0.56, width: 0.17, neckW: 0.1, spread: 0.105 })
    ch.shoes('jutti')
  } else if (outfit === 'sherwani') {
    const tex = TX.sherwaniTex('#efe3c8', '#c9a659', '#e4d4b2')
    const sh = cloth('sherwani', '#ffffff', tex, { rough: 0.7 })
    const sleeveM = cloth('sherwaniSleeve', '#ffffff', TX.sleeveTex('#efe3c8', '#c9a659', '#e4d4b2', 'sher'), { rough: 0.7 })
    const chur = cloth('churidar', '#f3ecdc', TX.plainWeave(), { rough: 0.85 })
    ch.garment('sherwani', { hem: 0.47, thick: 0.018, cut: L.hipY - 0.03, hemRx: 0.235, hemRz: 0.19, ease: 1.1 }, sh)
    ch.pelvis(chur)
    collar(ch, 'band', cloth('sherCollar', '#ffffff', TX.motifTex('#efe3c8', '#c9a659', 'sc', { border: false, density: 2 }), { rough: 0.7 }))
    ch.arms({ upper: { prof: [[0, 0.066], [1, 0.058]], mat: sleeveM }, fore: { prof: [[0, 0.058], [0.8, 0.05], [1, 0.047]], mat: sleeveM, open: true } })
    ch.legs({ thigh: { prof: [[0, 0.09], [0.5, 0.078], [1, 0.062]], mat: chur }, shin: { prof: [[0, 0.06], [0.4, 0.057], [1, 0.045]], mat: chur, ripple: 0.005, rippleFrom: 0.55 } })
    const stole = cloth('stole', '#ffffff', TX.dupattaTex('#e8c3ba', '#caa45a', 'stole', { butis: true }), { rough: 0.75 })
    ch.garRows = ch.rows.map(r => ({ ...r, rx: r.rx + 0.02, rz: r.rz + 0.02 }))
    for (const y of [0.85, 0.75, 0.65, 0.55]) ch.garRows.push({ y, rx: lerp(0.18, 0.235, (0.91 - y) / 0.44), rz: lerp(0.12, 0.19, (0.91 - y) / 0.44), zo: 0 })
    ch.garRows.sort((a, b) => b.y - a.y)
    neckDrape(ch, 'stole', stole, { off: 0.012, endY: 0.62, width: 0.15, neckW: 0.095, spread: 0.12, oneSide: true })
    ch.shoes('mojari')
    ch.garlandOff = 0.008
  } else if (outfit === 'reception') {
    const navy = cloth('bandhgala', '#ffffff', TX.motifTex('#1a2238', '#262f4a', 'bandh', { border: false, density: 1.4 }), { rough: 0.62 })
    const trou = cloth('trousers', '#171e31', TX.plainWeave(), { rough: 0.7 })
    ch.garment('bandhgala', { hem: 0.8, thick: 0.02, flare: 0.016 }, navy)
    ch.pelvis(trou)
    collar(ch, 'band', navy)
    placket(ch, navy, { len: 0.42, buttons: 7, w: 0.004, btnHex: '#c9a14a', thick: 0.02 })
    ch.arms({ upper: { prof: [[0, 0.066], [1, 0.059]], mat: navy }, fore: { prof: [[0, 0.058], [1, 0.05]], mat: navy, open: true } })
    ch.legs({ thigh: { prof: [[0, 0.094], [0.5, 0.084], [1, 0.07]], mat: trou }, shin: { prof: [[0, 0.068], [1, 0.064]], mat: trou, open: true } })
    // pocket square
    const ps = cachedGeo('pocketSq', () => {
      const s = new THREE.Shape(); s.moveTo(-0.022, 0); s.lineTo(0.022, 0); s.lineTo(0.008, 0.022); s.lineTo(-0.004, 0.012); s.lineTo(-0.014, 0.02)
      const [x, y, z] = surfPt(ch.rows, 0.09, 1.32, 1, 0.024)
      return new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: false }).translate(0, 0, 0).applyMatrix4(mtx(x, y, z - 0.004, -0.1, 0.35, 0))
    })
    ch.onChest(ps, cloth('pocketSqM', '#e9c6c0', null, { rough: 0.6 }))
    ch.shoes('formal')
  }
}

function brideBuild(ch, outfit) {
  const L = ch.L
  if (outfit === 'receptionGown') {
    const base = '#e8c4bd'
    const bod = cloth('gownBod', '#ffffff', TX.motifTex(base, '#d8b26a', 'gownB', { border: false, sparkle: true }), { rough: 0.55 })
    const skirt = cloth('gownSkirt', '#ffffff', TX.lehengaTex('#ecccc4', '#d4b06a', '#d9aea6'), { rough: 0.6 })
    ch.garment('gownBodice', { hem: 1.0, thick: 0.008, flare: 0.004 }, bod)
    ch.garment('gownSkirt', { top: 1.03, hem: 0.0, thick: 0.01, cut: 1.0, hemRx: 0.58, hemRz: 0.56, ease: 1.7, legInfl: 0.3, segs: 28, pleats: 0.012, pleatN: 14, step: 0.09 }, skirt)
    ch.arms({ upper: { prof: [[0, 0.056], [1, 0.05]], len: 0.6, open: true, mat: bod }, under: { upper: true, fore: true } })
    ch.shoes('goldFlat')
    jewellery(ch, { tikka: false, necklace: 'haar', earrings: true, bangles: true })
    ch.wantLongHair = true
  } else {
    const red = '#7d1020', deep = '#4f0712', gold = '#d6b061'
    const choli = cloth('choli', '#ffffff', TX.motifTex(red, gold, 'choli', { density: 1.6 }), { rough: 0.6 })
    const lehenga = cloth('lehenga', '#ffffff', TX.lehengaTex(red, gold, deep), { rough: 0.62 })
    ch.garment('choli', { hem: 1.11, thick: 0.007, flare: 0.004 }, choli)
    ch.garment('midriff', { top: 1.13, hem: 1.0, thick: 0.0, flare: 0 }, skinMat(ch.spec.skin))
    ch.garment('lehenga', { top: 1.04, hem: 0.0, thick: 0.012, cut: 1.0, hemRx: 0.6, hemRz: 0.58, ease: 1.8, legInfl: 0.3, segs: 28, pleats: 0.014, pleatN: 14, step: 0.09 }, lehenga)
    ch.arms({ upper: { prof: [[0, 0.054], [1, 0.047]], mat: choli }, under: { fore: true } })
    ch.shoes('goldFlat')
    const dup = cloth('brideDup', '#ffffff', TX.dupattaTex('#8e1526', gold, 'bride', { butis: true, sheer: true }), { rough: 0.6 })
    dup.transparent = false
    veil(ch, dup, { back: 0.82 })
    sash(ch, 'brideSash', dup, { off: 0.01, width: 0.2, backEnd: 0.6, frontStart: 0.98 })
    jewellery(ch, { tikka: true, jhoomar: true, necklace: 'haar', earrings: true, nath: false, bangles: true })
  }
}

function womanOutfit(ch, kind, cols) {
  const L = ch.L
  const [base, accent, dupCol] = cols
  if (kind === 'saree') {
    const blouse = cloth('blouse' + accent, '#ffffff', TX.motifTex(accent, base, 'bl', { border: true, density: 1.2 }), { rough: 0.7 })
    const skirt = cloth('saree' + base, '#ffffff', TX.sareeSkirtTex(base, accent), { rough: 0.7 })
    ch.garment('blouse', { hem: 1.16, thick: 0.007, flare: 0.004 }, blouse)
    ch.garment('sareeWaist', { top: 1.17, hem: 1.0, thick: 0.004, flare: 0 }, skirt)
    ch.garment('sareeSkirt', { top: 1.03, hem: 0.0, thick: 0.012, cut: 0.95, hemRx: 0.27, hemRz: 0.24, ease: 1, legInfl: 0.5, pleats: 0.008, pleatN: 30 }, skirt)
    ch.arms({ upper: { prof: [[0, 0.054], [1, 0.048]], len: 0.5, open: true, mat: blouse }, under: { upper: true, fore: true } })
    const pallu = cloth('pallu' + base, '#ffffff', TX.dupattaTex(base, accent, 'pallu', { butis: true, endBand: true }), { rough: 0.7 })
    sash(ch, 'pallu', pallu, { off: 0.006, width: 0.26, backEnd: 0.62, frontStart: 0.97 })
  } else if (kind === 'sharara' || kind === 'gharara') {
    const top = cloth('kurti' + base + accent, '#ffffff', TX.motifTex(base, accent, 'kurti', { border: true, density: 1 }), { rough: 0.72 })
    const bottom = cloth('shar' + base + accent, '#ffffff', TX.sareeSkirtTex(base, accent), { rough: 0.72 })
    ch.garment('kurtiShort', { hem: 0.66, thick: 0.01, cut: L.hipY - 0.02, hemRx: 0.21, hemRz: 0.17, ease: 1.1 }, top)
    ch.pelvis(bottom, 0.012)
    collar(ch, 'band', top)
    ch.arms({ upper: { prof: [[0, 0.056], [1, 0.05]], mat: top }, fore: { prof: [[0, 0.05], [1, 0.044]], len: 0.85, mat: top, open: true }, under: { fore: true } })
    if (kind === 'sharara') ch.legs({ thigh: { prof: [[0, 0.11], [0.6, 0.12], [1, 0.13]], mat: bottom }, shin: { prof: [[0, 0.13], [0.5, 0.17], [1, 0.22]], len: 1.03, mat: bottom, open: true } })
    else ch.legs({ thigh: { prof: [[0, 0.1], [0.6, 0.09], [1, 0.075]], mat: bottom }, shin: { prof: [[0, 0.08], [0.08, 0.085], [0.1, 0.11], [0.5, 0.16], [1, 0.21]], len: 1.03, mat: bottom, open: true, ripple: 0.006, rippleFrom: 0.15 } })
    const dup = cloth('dup' + dupCol + accent, '#ffffff', TX.dupattaTex(dupCol, accent, 'dup', { butis: true, sheer: true }), { rough: 0.7 })
    return dup
  } else {
    // anarkali
    const top = cloth('anar' + base + accent, '#ffffff', TX.lehengaTex(base, accent, base), { rough: 0.68 })
    const bod = cloth('anarB' + base + accent, '#ffffff', TX.motifTex(base, accent, 'anB', { border: false, density: 1.4 }), { rough: 0.68 })
    const chur = cloth('chur' + accent, '#ffffff', TX.plainWeave(), { rough: 0.8 })
    chur.color.set(accent).lerp(new THREE.Color('#ffffff'), 0.5)
    ch.garment('anarBod', { hem: 1.02, thick: 0.008, flare: 0.002 }, bod)
    ch.garment('anarSkirt', { top: 1.05, hem: 0.2, thick: 0.01, cut: 1.02, hemRx: 0.42, hemRz: 0.4, ease: 1.6, legInfl: 0.4, pleats: 0.01, pleatN: 24 }, top)
    ch.arms({ upper: { prof: [[0, 0.055], [1, 0.049]], mat: bod }, fore: { prof: [[0, 0.049], [1, 0.043]], mat: bod, open: true } })
    ch.legs({ thigh: { prof: [[0, 0.085], [0.5, 0.074], [1, 0.058]], mat: chur }, shin: { prof: [[0, 0.056], [0.4, 0.054], [1, 0.043]], mat: chur, ripple: 0.005, rippleFrom: 0.55 } })
    collar(ch, 'band', bod)
    const dup = cloth('dupA' + dupCol + accent, '#ffffff', TX.dupattaTex(dupCol, accent, 'dup', { butis: true, sheer: true }), { rough: 0.7 })
    return dup
  }
  return null
}

const ROLE_BUILDERS = {
  groom(ch, outfit) {
    ch.setup({ sex: 'm', height: 1.75, skin: '#a8714f', build: 'avg' })
    groomBuild(ch, outfit)
    ch.head({ hair: 'groom', hairColor: '#17110e', beard: 'full', beardColor: '#17110e', glasses: true })
    ch.hands()
    ch.neck()
  },
  bride(ch, outfit) {
    ch.setup({ sex: 'f', height: 1.62, skin: '#b98563', build: 'avg' })
    brideBuild(ch, outfit)
    ch.head({ hair: 'fem', hairColor: '#17110e', lip: outfit === 'receptionGown' ? '#a5545a' : '#8e2a33' })
    const hm = ch.hairMesh.material
    if (ch.wantLongHair) longHair(ch, hm, 0.36)
    else bun(ch, hm, false)
    ch.hands('#7a2e14')
    ch.neck()
  },
  aunty(ch) {
    const r = ch.rnd
    ch.setup({ sex: 'f', height: 1.52 + r() * 0.1, skin: pick(r, SKIN), build: r() < 0.55 ? 'heavy' : 'avg', bust: 0.008 })
    const kinds = ['sharara', 'sharara', 'anarkali', 'anarkali', 'gharara', 'saree']
    const kind = pick(r, kinds)
    const jewel = r() < 0.6
    const base = jewel ? pick(r, JEWEL) : pick(r, PASTEL)
    const accent = r() < 0.7 ? '#d4b066' : '#e8e4dc'
    const dupCol = r() < 0.5 ? base : pick(r, jewel ? PASTEL : JEWEL)
    const dup = womanOutfit(ch, kind, [base, accent, dupCol])
    const grey = r() < 0.35
    const hairColor = grey ? '#5b5650' : pick(r, HAIR)
    ch.head({ hair: 'fem', hairColor })
    const overHead = dup && r() < 0.4
    if (dup) {
      if (overHead) { veil(ch, dup, { back: 0.85 }); neckDrape(ch, 'dupFront', dup, { off: 0.012, endY: 0.95, width: 0.16, neckW: 0.12, spread: 0.1 }) }
      else neckDrape(ch, 'dupFront2', dup, { off: 0.012, endY: 0.78, width: 0.18, neckW: 0.11, spread: 0.1 })
    }
    if (!overHead) bun(ch, ch.hairMesh.material, r() < 0.3)
    jewellery(ch, { tikka: false, necklace: r() < 0.6 ? 'choker' : null, earrings: true, bangles: r() < 0.6 })
    ch.shoes(r() < 0.5 ? 'goldFlat' : 'sandal')
    ch.hands()
    ch.neck()
  },
  youngWoman(ch) {
    const r = ch.rnd
    ch.setup({ sex: 'f', height: 1.55 + r() * 0.12, skin: pick(r, SKIN), build: r() < 0.2 ? 'heavy' : 'slim' })
    const kind = pick(r, ['anarkali', 'sharara', 'anarkali', 'gharara'])
    const jewel = r() < 0.45
    const base = jewel ? pick(r, JEWEL) : pick(r, PASTEL)
    const accent = r() < 0.6 ? '#d4b066' : '#efe9dc'
    const dup = womanOutfit(ch, kind, [base, accent, r() < 0.5 ? base : pick(r, PASTEL)])
    ch.head({ hair: 'fem', hairColor: pick(r, HAIR) })
    const hm = ch.hairMesh.material
    if (r() < 0.55) braid(ch, hm, 0.42 + r() * 0.12)
    else longHair(ch, hm, 0.25 + r() * 0.12)
    if (dup) neckDrape(ch, 'dupY', dup, { off: 0.012, endY: 0.72, width: 0.17, neckW: 0.1, spread: 0.1, oneSide: r() < 0.5 })
    jewellery(ch, { tikka: false, necklace: null, earrings: true, bangles: r() < 0.5 })
    ch.shoes(r() < 0.6 ? 'goldFlat' : 'sandal')
    ch.hands(r() < 0.3 ? '#7a2e14' : undefined)
    ch.neck()
  },
  uncle(ch) {
    const r = ch.rnd
    ch.setup({ sex: 'm', height: 1.64 + r() * 0.14, skin: pick(r, SKIN), build: r() < 0.5 ? 'heavy' : 'avg' })
    const pathani = r() < 0.3
    if (pathani) {
      const col = pick(r, ['#f1ece2', '#cfd3d6', '#2b3550', '#4a4f3a', '#1d1d20', '#d7cdb8'])
      const k = cloth('pathU' + col, col, TX.plainWeave(), { rough: 0.85 })
      kurtaPyjama(ch, { kurta: k, pyjama: k, hem: 0.47, hemRx: 0.24, curve: 0.07, collarKind: 'shirt', salwar: true })
    } else {
      const col = pick(r, MEN_KURTA)
      const k = cloth('kurtaU' + col, col, TX.plainWeave(), { rough: 0.85 })
      kurtaPyjama(ch, { kurta: k, pyjama: cloth('pyj', '#f1ede4', TX.plainWeave()), hem: 0.5, hemRx: 0.22, collarKind: 'band', placketOn: true })
      const jc = pick(r, JACKETS)
      jacket(ch, cloth('jacketU' + jc, '#ffffff', TX.motifTex(jc, '#' + new THREE.Color(jc).offsetHSL(0, 0, 0.08).getHexString(), 'jk', { border: false, density: 1.3 }), { rough: 0.65 }), { hem: 0.82 })
    }
    const hairColor = r() < 0.5 ? '#5b5650' : pick(r, HAIR)
    const style = pick(r, ['receding', 'short', 'receding', 'side'])
    const beard = r() < 0.5 ? 'moustache' : r() < 0.5 ? 'trim' : null
    ch.head({ hair: style, hairColor, beard, beardColor: hairColor, glasses: r() < 0.35 ? (r() < 0.5 ? 'thin' : true) : false })
    ch.shoes(pick(r, ['brown', 'sandal', 'jutti', 'formal']))
    ch.hands()
    ch.neck()
  },
  youngMan(ch) {
    const r = ch.rnd
    ch.setup({ sex: 'm', height: 1.68 + r() * 0.14, skin: pick(r, SKIN), build: r() < 0.25 ? 'heavy' : r() < 0.5 ? 'slim' : 'avg' })
    const col = pick(r, ['#f1ebdc', '#e8dfcc', '#c9d8e0', '#efe7f0', '#d6e4d8', '#1c2a44', '#e6d7c0'])
    const k = cloth('kurtaY' + col, col, TX.plainWeave(), { rough: 0.85 })
    const pathani = r() < 0.3
    if (pathani) kurtaPyjama(ch, { kurta: k, pyjama: k, hem: 0.47, hemRx: 0.235, curve: 0.07, collarKind: 'shirt', salwar: true })
    else {
      kurtaPyjama(ch, { kurta: k, pyjama: cloth('chY', '#f2eee6', TX.plainWeave()), hem: 0.5, hemRx: 0.215, churidar: true, collarKind: 'band' })
      const jc = pick(r, JACKETS)
      jacket(ch, cloth('jacketY' + jc, '#ffffff', TX.motifTex(jc, '#' + new THREE.Color(jc).offsetHSL(0, 0, 0.1).getHexString(), 'jy', { border: false, density: 1.5 }), { rough: 0.6 }), { hem: 0.83 })
    }
    const style = pick(r, ['short', 'side', 'groom', 'short'])
    const beard = r() < 0.4 ? 'trim' : r() < 0.3 ? 'full' : null
    const hc = pick(r, HAIR)
    ch.head({ hair: style, hairColor: hc, beard, beardColor: hc, glasses: r() < 0.2 })
    ch.shoes(pick(r, ['jutti', 'mojari', 'formal', 'brown']))
    ch.hands()
    ch.neck()
  },
  kid(ch) {
    const r = ch.rnd
    const girl = r() < 0.5
    ch.setup({ sex: girl ? 'f' : 'm', height: 1.0 + r() * 0.35, skin: pick(r, SKIN), build: 'slim', kid: true })
    if (girl) {
      const base = pick(r, PASTEL.concat(JEWEL))
      const frock = cloth('frock' + base, '#ffffff', TX.lehengaTex(base, '#d4b066', base), { rough: 0.7 })
      const bod = cloth('frockB' + base, '#ffffff', TX.motifTex(base, '#d4b066', 'fb', { border: false }), { rough: 0.7 })
      ch.garment('frockBod', { hem: 1.03, thick: 0.01 }, bod)
      ch.garment('frockSkirt', { top: 1.06, hem: 0.5, thick: 0.01, cut: 1.03, hemRx: 0.34, hemRz: 0.32, ease: 1.6, legInfl: 0.5, pleats: 0.01 }, frock)
      ch.arms({ upper: { prof: [[0, 0.058], [1, 0.054]], len: 0.4, open: true, mat: bod }, under: { upper: true, fore: true } })
      const leg = cloth('legging', '#f3eee4', TX.plainWeave())
      ch.legs({ thigh: { prof: [[0, 0.085], [1, 0.06]], mat: leg }, shin: { prof: [[0, 0.056], [1, 0.042]], mat: leg } })
      ch.head({ hair: 'fem', hairColor: pick(r, HAIR) })
      const hm = ch.hairMesh.material
      if (r() < 0.5) braid(ch, hm, 0.3); else longHair(ch, hm, 0.18)
      ch.shoes('goldFlat')
    } else {
      const col = pick(r, ['#f1ebdc', '#cfe0ea', '#f2dfb0', '#d7ead9', '#1c2a44'])
      const k = cloth('kurtaK' + col, col, TX.plainWeave(), { rough: 0.85 })
      kurtaPyjama(ch, { kurta: k, pyjama: cloth('pyjK', '#f3efe6', TX.plainWeave()), hem: 0.52, hemRx: 0.21, collarKind: 'band', btnN: 3 })
      if (r() < 0.5) { const jc = pick(r, JACKETS); jacket(ch, cloth('jacketK' + jc, jc, TX.brocade(), { rough: 0.65 }), { hem: 0.84 }) }
      ch.head({ hair: 'kid', hairColor: pick(r, HAIR) })
      ch.shoes(pick(r, ['jutti', 'sneaker']))
    }
    ch.hands()
    ch.neck()
  },
  elder(ch) {
    const r = ch.rnd
    const fem = r() < 0.4
    if (fem) {
      ch.setup({ sex: 'f', height: 1.5 + r() * 0.08, skin: pick(r, SKIN), build: r() < 0.5 ? 'heavy' : 'avg', stoop: 0.12 })
      const base = pick(r, ['#efe9dc', '#d9d4e2', '#cfdcd4', '#e6dccb'])
      const dup = womanOutfit(ch, r() < 0.5 ? 'saree' : 'anarkali', [base, '#c9c3b8', base])
      ch.head({ hair: 'fem', hairColor: '#d8d4cc', glasses: r() < 0.6 ? 'thin' : false })
      if (dup) { veil(ch, dup, { back: 0.9 }); neckDrape(ch, 'dupE', dup, { off: 0.012, endY: 0.95, width: 0.16, neckW: 0.12, spread: 0.1 }) }
      else bun(ch, ch.hairMesh.material)
      ch.shoes('sandal')
    } else {
      ch.setup({ sex: 'm', height: 1.6 + r() * 0.12, skin: pick(r, SKIN), build: r() < 0.4 ? 'heavy' : 'slim', stoop: 0.14 })
      const k = cloth('kurtaE', '#f4f2ec', TX.plainWeave(), { rough: 0.85 })
      kurtaPyjama(ch, { kurta: k, pyjama: k, hem: 0.48, hemRx: 0.22, collarKind: 'band' })
      if (r() < 0.6) {
        const sc = pick(r, ['#8a7a66', '#5a5048', '#3d4a5a', '#b5a58c'])
        neckDrape(ch, 'shawl', cloth('shawl' + sc, '#ffffff', TX.dupattaTex(sc, '#d8c9a8', 'shawl', { butis: false }), { rough: 0.95 }), { off: 0.014, endY: 0.85, width: 0.26, neckW: 0.16, spread: 0.12 })
      }
      const grey = r() < 0.5 ? '#d8d4cc' : '#b9b4ac'
      ch.head({ hair: r() < 0.5 ? 'bald' : 'receding', hairColor: grey, beard: r() < 0.6 ? 'moustache' : 'trim', beardColor: grey, glasses: r() < 0.6 ? 'thin' : false })
      ch.shoes('sandal')
    }
    ch.hands()
    ch.neck()
  },
  qazi(ch) {
    const r = ch.rnd
    ch.setup({ sex: 'm', height: 1.68 + r() * 0.06, skin: pick(r, SKIN.slice(1, 6)), build: 'avg', stoop: 0.05 })
    const k = cloth('kurtaQ', '#f6f4ee', TX.plainWeave(), { rough: 0.85 })
    kurtaPyjama(ch, { kurta: k, pyjama: k, hem: 0.45, hemRx: 0.23, collarKind: 'band' })
    const wc = r() < 0.5 ? '#232326' : '#55575c'
    jacket(ch, cloth('waistcoatQ' + wc, wc, TX.brocade(), { rough: 0.6 }), { hem: 0.84 })
    ch.head({ hair: 'short', hairColor: '#d8d4cc', beard: 'white', beardColor: '#e6e3dc', glasses: r() < 0.5 ? 'thin' : false })
    // simple white cap (topi)
    const cap = cachedGeo('topi', () => latheGeo([[0.225, 0.002], [0.224, 0.06], [0.215, 0.085], [0.17, 0.092], [0.15, 0.092]].map(([y, rr]) => ({ y, rx: rr, rz: rr * 1.12, zo: -0.004 })), { segs: 24 }))
    const cm = ch.mesh(cap, cloth('topiM', '#ffffff', TX.topiTex(), { rough: 0.9 }), ch.headRoot)
    cm.rotation.x = -0.12
    ch.shoes('jutti')
    ch.hands()
    ch.neck()
    prop(ch, bookGeo(), stdMat('bookM', { color: '#ffffff', map: TX.bookTex(), roughness: 0.6 }),
      { parent: 'wristL', pos: [-0.03, -0.1, 0.06], rot: [0, 0, 0] })
  },
  bandMember(ch) {
    const r = ch.rnd
    ch.setup({ sex: 'm', height: 1.66 + r() * 0.12, skin: pick(r, SKIN), build: r() < 0.3 ? 'heavy' : 'avg' })
    const red = cloth('bandJ', '#ffffff', TX.bandJacketTex(), { rough: 0.6 })
    const trou = cloth('bandT', '#f2efe8', TX.plainWeave(), { rough: 0.8 })
    ch.garment('bandJacket', { hem: 0.82, thick: 0.02, flare: 0.012 }, red)
    ch.pelvis(trou)
    collar(ch, 'band', cloth('bandCol', '#d9b04a', null, { rough: 0.5 }))
    const sl = cloth('bandSl', '#ffffff', TX.sleeveTex('#b3141e', '#e3bb4f', null, 'band'), { rough: 0.6 })
    ch.arms({ upper: { prof: [[0, 0.066], [1, 0.059]], mat: sl }, fore: { prof: [[0, 0.058], [1, 0.05]], mat: sl, open: true } })
    ch.legs({ thigh: { prof: [[0, 0.094], [1, 0.07]], mat: trou }, shin: { prof: [[0, 0.068], [1, 0.064]], mat: trou, open: true } })
    // epaulettes
    const ep = cachedGeo('epaulette', () => new THREE.BoxGeometry(0.07, 0.012, 0.09))
    for (const s of ['L', 'R']) { const m = ch.mesh(ep, goldMat(), ch.joints['shoulder' + s]); m.position.set(0, 0.06, 0) }
    ch.head({ hair: 'short', hairColor: pick(r, HAIR), beard: r() < 0.5 ? 'moustache' : null })
    const cap = cachedGeo('bandCap', () => {
      const parts = [{ g: latheGeo([[0.235, 0.002], [0.235, 0.1], [0.2, 0.1], [0.15, 0.093], [0.145, 0.093]].map(([y, rr]) => ({ y, rx: rr, rz: rr * 1.12, zo: 0 })), { segs: 24 }) }]
      return mergeGeos(parts)
    })
    const cm = ch.mesh(cap, cloth('bandCapM', '#ffffff', TX.capTex(), { side: THREE.FrontSide, rough: 0.6 }), ch.headRoot)
    cm.rotation.x = -0.08
    const visor = cachedGeo('visor', () => { const g = new THREE.CylinderGeometry(0.09, 0.1, 0.006, 16, 1, false, -0.9, 1.8); g.translate(0, 0.148, 0.03); return g })
    ch.mesh(visor, stdMat('visor', { color: '#111', roughness: 0.25 }), ch.headRoot)
    ch.shoes('black')
    ch.hands()
    ch.neck()
    prop(ch, trumpetGeo(), stdMat('brass', { color: '#e0b64e', roughness: 0.25, metalness: 0.6, emissive: new THREE.Color('#3a2a06') }),
      { parent: 'wristR', pos: [0.0, -0.08, 0.02], rot: [0.0, 0, 0] },
      { parent: 'head', pos: [0, 0.026, 0.105], rot: [0.06, 0, 0], anims: ['playTrumpet'] })
  },
  dholPlayer(ch) {
    const r = ch.rnd
    ch.setup({ sex: 'm', height: 1.66 + r() * 0.12, skin: pick(r, SKIN.slice(0, 5)), build: r() < 0.4 ? 'heavy' : 'avg' })
    const col = pick(r, [['#d9561e', '#f6d24a'], ['#1f6b4f', '#f3e3a0'], ['#7a1f3d', '#f2c14e'], ['#e3a21a', '#b1201f']])
    const k = cloth('dholK' + col[0], '#ffffff', TX.bandhani(col[0], col[1]), { rough: 0.85 })
    kurtaPyjama(ch, { kurta: k, pyjama: cloth('pyjD', '#f4efe2', TX.plainWeave()), hem: 0.52, hemRx: 0.22, collarKind: 'band' })
    const sash2 = cloth('waistSash' + col[1], col[1], null)
    ch.garment('waistSash', { top: ch.L.hipY + 0.11, hem: ch.L.hipY + 0.04, thick: 0.026, flare: 0 }, sash2)
    ch.head({ hair: 'short', hairColor: pick(r, HAIR), beard: r() < 0.6 ? 'moustache' : 'trim' })
    ch.shoes('jutti')
    ch.hands()
    ch.neck()
    dhol(ch)
  },
  photographer(ch) {
    const r = ch.rnd
    ch.setup({ sex: 'm', height: 1.7 + r() * 0.1, skin: pick(r, SKIN), build: 'avg' })
    const shirt = cloth('checkShirt', '#ffffff', TX.check('#3d5a7a', '#e8e4dc'), { rough: 0.85 })
    const jeans = cloth('jeansP', '#2c2f38', TX.denim(), { rough: 0.85 })
    ch.garment('shirt', { hem: 0.84, thick: 0.014, flare: 0.012 }, shirt)
    ch.pelvis(jeans)
    collar(ch, 'shirt', shirt)
    placket(ch, shirt, { len: 0.4, buttons: 6, w: 0.024, btnHex: '#e8e4dc', thick: 0.016 })
    ch.arms({ upper: { prof: [[0, 0.064], [1, 0.059]], len: 0.6, open: true, mat: shirt }, under: { upper: true, fore: true } })
    ch.legs({ thigh: { prof: [[0, 0.092], [1, 0.066]], mat: jeans }, shin: { prof: [[0, 0.064], [1, 0.058]], mat: jeans, open: true } })
    ch.head({ hair: pick(r, ['short', 'side']), hairColor: pick(r, HAIR), beard: r() < 0.5 ? 'trim' : null, glasses: r() < 0.3 })
    ch.shoes('sneaker')
    ch.hands()
    ch.neck()
    prop(ch, cameraGeo(), vcMat(true),
      { parent: 'wristR', pos: [0.02, -0.1, 0.05], rot: [0, -0.3, 0] },
      { parent: 'head', pos: [-0.015, EYE.y - 0.01, 0.15], rot: [0, 0, 0], anims: ['photo'] })
  },
}
ROLE_BUILDERS.guest = (ch) => {
  const roles = ['aunty', 'uncle', 'youngMan', 'youngWoman', 'elder', 'aunty', 'uncle']
  const role = roles[Math.floor(ch.rnd() * roles.length)]
  ch.role = role
  ROLE_BUILDERS[role](ch)
}

// ============================================================== public API
export function createCharacter({ role = 'guest', outfit, seed = 1 } = {}) {
  const ch = new Char(role, outfit, seed)
  const builder = ROLE_BUILDERS[role] || ROLE_BUILDERS.guest
  if (role === 'groom') builder(ch, outfit || 'travel')
  else if (role === 'bride') builder(ch, outfit || 'lehenga')
  else builder(ch)
  ch.finalize()
  ch.initAnim()
  ch.update(0)

  let sehraGroup = null, garlandMesh = null
  const api = {
    object3d: ch.object3d,
    get height() { return ch.height },
    role: ch.role,
    outfit: ch.outfit,
    joints: ch.joints,
    setAnim: (name, opts) => ch.setAnim(name, opts),
    update: (dt) => ch.update(dt),
    get anim() { return ch.cur },
    setHaldi(t) {
      t = clamp(t, 0, 1)
      ch.haldi = t
      if (!ch.haldiMats) ch.haldiMats = new Map()
      if (ch.haldiDirty !== false) {
        ch.haldiDirty = false
        ch.object3d.traverse(o => {
          if (!o.isMesh || o.material.userData.haldiClone) return
          const m = o.material
          let c = ch.haldiMats.get(m)
          if (!c) {
            c = { mat: m.clone(), orig: m.color.clone(), em: m.emissive ? m.emissive.clone() : null, cat: m.userData.cat }
            c.mat.userData = { haldiClone: true, cat: m.userData.cat }
            ch.haldiMats.set(m, c)
          }
          o.material = c.mat
        })
      }
      const K = { skin: 0.62, mehendi: 0.5, cloth: 0.5, hair: 0.28, feature: 0.18, flower: 0.1 }
      for (const c of ch.haldiMats.values()) {
        const k = (K[c.cat] ?? 0.05) * t
        c.mat.color.copy(c.orig).lerp(HALDI, k)
        if (c.cat === 'skin' && c.em) c.mat.emissive.copy(c.em).lerp(new THREE.Color('#3a2400'), k)
      }
    },
    setSehra(on) {
      if (ch.role !== 'groom') return
      if (on && !sehraGroup) {
        sehraGroup = safaAndSehra(ch)
        if (ch.haldiMats) { ch.haldiDirty = true; api.setHaldi(ch.haldi) }
      }
      if (sehraGroup) sehraGroup.visible = !!on
      if (ch.hairMesh) ch.hairMesh.visible = true
    },
    setGarland(on) {
      if (on && !garlandMesh) { garlandMesh = garland(ch); if (ch.haldiMats) { ch.haldiDirty = true; api.setHaldi(ch.haldi) } }
      if (garlandMesh) garlandMesh.visible = !!on
    },
    setLookAt(v) { ch.look.target = v ? (ch.look.target || new V3()).copy(v) : null },
    dispose() {
      ch.object3d.removeFromParent()
      if (ch.skeleton) ch.skeleton.dispose()
      if (ch.haldiMats) for (const c of ch.haldiMats.values()) c.mat.dispose()
    },
    /** triangles currently visible (for budgeting) */
    triangles() {
      let n = 0
      ch.object3d.traverse(o => {
        if (!o.isMesh || !o.visible) return
        let p = o.parent, vis = true
        while (p) { if (!p.visible) vis = false; p = p.parent }
        if (!vis) return
        const g = o.geometry
        n += (g.index ? g.index.count : g.attributes.position.count) / 3
      })
      return Math.round(n)
    },
  }
  return api
}

export const ROLES = ['groom', 'bride', 'aunty', 'uncle', 'youngMan', 'youngWoman', 'kid', 'elder', 'qazi', 'bandMember', 'dholPlayer', 'photographer', 'guest']
