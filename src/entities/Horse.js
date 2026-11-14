// Decorated white mare (ghodi) for the baraat, built from smooth procedural primitives.
// Origin at the ground between the hooves, faces +Z, ~1.6 m at the withers.
import * as THREE from 'three'
import * as TX from './charTextures.js'
import { sweepGeo, limbGeo, latheGeo, ribbonGeo, mergeGeos, mtx, ell, garlandGeo, cachedGeo, cachedMat, gridGeo } from './Character.js'

const V3 = THREE.Vector3
const TAU = Math.PI * 2
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

// body profile from rump to chest: [z, centreY, halfWidth, halfHeight]
const BODY = [
  [-0.92, 1.33, 0.1, 0.1], [-0.86, 1.32, 0.18, 0.17], [-0.74, 1.31, 0.245, 0.245], [-0.52, 1.27, 0.285, 0.305],
  [-0.22, 1.2, 0.29, 0.34], [0.08, 1.19, 0.285, 0.342], [0.33, 1.24, 0.255, 0.33], [0.52, 1.23, 0.215, 0.285],
  [0.66, 1.22, 0.16, 0.21], [0.73, 1.22, 0.08, 0.11],
]
function bodyAt(z) {
  if (z <= BODY[0][0]) return BODY[0]
  for (let i = 1; i < BODY.length; i++) {
    if (z <= BODY[i][0]) {
      const a = BODY[i - 1], b = BODY[i], t = (z - a[0]) / (b[0] - a[0])
      return [z, lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)]
    }
  }
  return BODY[BODY.length - 1]
}
const LEG = {
  front: { x: 0.15, y: 1.05, z: 0.42, upper: 0.47, cannon: 0.36, pastern: 0.22 },
  hind: { x: 0.165, y: 1.12, z: -0.56, upper: 0.57, cannon: 0.34, pastern: 0.22, rest: 0.22 },
}

function coatMat() { return cachedMat('horseCoat', () => new THREE.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.55, map: TX.variant(TX.plainWeave(), 'coatWeave', 2, 2) })) }
function gold() { return cachedMat('gold', () => new THREE.MeshStandardMaterial({ color: '#d9b25f', roughness: 0.32, metalness: 0.55, emissive: new THREE.Color('#3a2a08') })) }

function bodyGeo() {
  return cachedGeo('horseBody', () => {
    const curve = new THREE.CatmullRomCurve3(BODY.map(([z, y]) => new V3(0, y, z)))
    const n = BODY.length - 1
    return sweepGeo(curve, (t) => {
      const f = t * n, k = Math.min(Math.floor(f), n - 1), fr = f - k
      const a = BODY[k], b = BODY[k + 1]
      const s = fr * fr * (3 - 2 * fr) * 0.5 + fr * 0.5
      return [lerp(a[2], b[2], s), lerp(a[3], b[3], s)]
    }, { segs: 40, radial: 22, closeStart: true, closeEnd: true })
  })
}
function neckGeo() {
  return cachedGeo('horseNeck', () => {
    const pts = [[0.3, 1.28], [0.5, 1.5], [0.68, 1.74], [0.84, 1.94], [0.93, 2.03]].map(([z, y]) => new V3(0, y, z))
    const curve = new THREE.CatmullRomCurve3(pts)
    // [half depth (in the vertical plane), half width]
    return sweepGeo(curve, (t) => [lerp(0.3, 0.115, Math.pow(t, 0.8)) + 0.03 * Math.sin(Math.PI * t), lerp(0.17, 0.075, t)], { segs: 18, radial: 16, up: new V3(1, 0, 0) })
  })
}
function headGeo() {
  return cachedGeo('horseHead', () => {
    const pts = [[0.9, 2.06], [1.0, 1.95], [1.12, 1.8], [1.24, 1.64], [1.31, 1.54], [1.34, 1.5]].map(([z, y]) => new V3(0, y, z))
    const curve = new THREE.CatmullRomCurve3(pts)
    const g = sweepGeo(curve, (t) => {
      const d = t < 0.25 ? lerp(0.1, 0.125, t / 0.25) : t < 0.75 ? lerp(0.125, 0.075, (t - 0.25) / 0.5) : lerp(0.075, 0.08, (t - 0.75) / 0.25)
      const w = t < 0.3 ? lerp(0.085, 0.1, t / 0.3) : t < 0.8 ? lerp(0.1, 0.06, (t - 0.3) / 0.5) : lerp(0.06, 0.068, (t - 0.8) / 0.2)
      return [d, w]
    }, { segs: 20, radial: 16, up: new V3(1, 0, 0), closeStart: true, closeEnd: true })
    const parts = [{ g }]
    // jowls / cheeks
    for (const s of [-1, 1]) parts.push({ g: ell(0.05, 0.085, 0.08, 12, 10), m: mtx(s * 0.05, 1.86, 1.0, 0.6, 0, 0) })
    // ears
    for (const s of [-1, 1]) {
      const e = new THREE.ConeGeometry(0.032, 0.14, 8, 1)
      e.scale(1, 1, 0.55)
      parts.push({ g: e, m: mtx(s * 0.05, 2.15, 0.9, -0.15, s * 0.3, -s * 0.18) })
    }
    // forelock
    parts.push({ g: ell(0.04, 0.07, 0.02, 8, 6), m: mtx(0, 2.04, 0.99, 0.75, 0, 0) })
    return mergeGeos(parts)
  })
}
function faceDetailGeo() {
  return cachedGeo('horseFace', () => {
    const parts = []
    for (const s of [-1, 1]) {
      parts.push({ g: ell(0.02, 0.016, 0.018, 10, 8), m: mtx(s * 0.083, 1.93, 1.03), c: '#1a1412' })
      parts.push({ g: ell(0.011, 0.018, 0.01, 8, 6), m: mtx(s * 0.032, 1.53, 1.355, -0.6, 0, 0), c: '#2a2220' })
    }
    // grey muzzle tip
    parts.push({ g: ell(0.07, 0.075, 0.06, 14, 10), m: mtx(0, 1.5, 1.32, -0.7, 0, 0), c: '#b8aba5' })
    return mergeGeos(parts, true)
  })
}
function maneGeo() {
  return cachedGeo('horseMane', () => {
    const pts = []
    const crest = [[0.4, 1.62], [0.55, 1.72], [0.7, 1.86], [0.82, 1.98], [0.9, 2.07]]
    for (const [z, y] of crest) pts.push({ p: [-0.035, y - 0.04, z - 0.06], n: [-1, 0.2, -0.1], w: 0.2 })
    return ribbonGeo(pts, { segs: 20, cols: 3, puff: 0.03 })
  })
}
function tailGeo() {
  return cachedGeo('horseTail', () => {
    const curve = new THREE.CatmullRomCurve3([new V3(0, 0, 0), new V3(0, -0.02, -0.12), new V3(0, -0.25, -0.2), new V3(0, -0.6, -0.2), new V3(0, -0.92, -0.15)])
    return sweepGeo(curve, (t) => {
      const r = t < 0.15 ? lerp(0.05, 0.06, t / 0.15) : lerp(0.06, 0.1, smooth(0.15, 0.7, t)) * (1 - 0.7 * smooth(0.85, 1, t))
      return [r, r * 0.75]
    }, { segs: 18, radial: 10, up: new V3(1, 0, 0), closeEnd: true })
  })
}
function legGeos(kind) {
  const L = LEG[kind]
  return cachedGeo('hleg' + kind, () => {
    const upper = kind === 'front'
      ? limbGeo(L.upper, [[0, 0.11], [0.35, 0.09], [0.8, 0.062], [1, 0.064]], { segs: 12, n: 6 })
      : limbGeo(L.upper, [[0, 0.15], [0.3, 0.125], [0.75, 0.075], [1, 0.07]], { segs: 12, n: 6, aspect: 1.25 })
    const cannon = limbGeo(L.cannon, [[0, 0.055], [0.2, 0.046], [0.85, 0.045], [1, 0.056]], { segs: 10, n: 5 })
    const past = mergeGeos([
      { g: limbGeo(L.pastern - 0.075, [[0, 0.05], [1, 0.044]], { segs: 10, n: 3 }), m: mtx(0, 0, 0, 0.35, 0, 0) },
    ])
    return { upper, cannon, past }
  })
}
function hoofGeo() {
  return cachedGeo('hoof', () => {
    const g = latheGeo([[0, 0.0], [0.0, 0.046], [0.04, 0.052], [0.08, 0.062], [0.082, 0.0]].map(([y, r]) => ({ y: 0.08 - y, rx: r, rz: r * 1.08, zo: 0.01 })), { segs: 14 })
    return g
  })
}

function saddleClothGeo() {
  return cachedGeo('saddleCloth', () => {
    const nu = 26, nv = 10, amax = 1.95
    const P = [], U = []
    for (let j = 0; j <= nv; j++) {
      const z = lerp(0.36, -0.36, j / nv)
      const [, cy, hw, hh] = bodyAt(z)
      for (let i = 0; i <= nu; i++) {
        const a = lerp(-amax, amax, i / nu)
        const off = 0.016
        let x = Math.sin(a) * (hw + off), y = cy + Math.cos(a) * (hh + off)
        if (Math.abs(a) > 1.35) { const k = (Math.abs(a) - 1.35) / (amax - 1.35); x = Math.sign(a) * (hw + off) * lerp(Math.sin(1.35), 0.96, k); y = cy + (hh + off) * lerp(Math.cos(1.35), -0.55, k) }
        P.push(new V3(x, y, z)); U.push(i / nu, 1 - j / nv)
      }
    }
    return gridGeo(nu, nv, P, U, { flip: true })
  })
}
function tasselsGeo() {
  return cachedGeo('tassels', () => {
    const parts = []
    const amax = 1.95
    for (const s of [-1, 1]) {
      for (let k = 0; k <= 9; k++) {
        const z = lerp(0.34, -0.34, k / 9)
        const [, cy, hw, hh] = bodyAt(z)
        const x = s * (hw + 0.016) * 0.96, y = cy - (hh + 0.016) * 0.55
        parts.push({ g: new THREE.ConeGeometry(0.014, 0.06, 6), m: mtx(x, y - 0.035, z, Math.PI, 0, 0) })
        parts.push({ g: ell(0.011, 0.011, 0.011, 6, 4), m: mtx(x, y - 0.004, z) })
      }
    }
    return mergeGeos(parts)
  })
}
function saddleGeo() {
  return cachedGeo('saddle', () => {
    const [, cy, , hh] = bodyAt(0.02)
    const top = cy + hh + 0.02
    const seat = ell(0.2, 0.05, 0.26, 18, 10)
    const parts = [
      { g: seat, m: mtx(0, top + 0.01, 0.02), c: '#7a0f1f' },
      { g: ell(0.12, 0.07, 0.05, 12, 8), m: mtx(0, top + 0.05, 0.25, -0.3, 0, 0), c: '#d9b25f' },
      { g: ell(0.15, 0.07, 0.05, 12, 8), m: mtx(0, top + 0.05, -0.22, 0.3, 0, 0), c: '#7a0f1f' },
      { g: new THREE.TorusGeometry(0.2, 0.008, 4, 28), m: mtx(0, top + 0.02, 0.02, Math.PI / 2, 0, 0, 1, 1.3, 1), c: '#d9b25f' },
    ]
    // stirrup straps + irons
    for (const s of [-1, 1]) {
      parts.push({ g: new THREE.BoxGeometry(0.008, 0.5, 0.035), m: mtx(s * 0.3, top - 0.27, 0.06, 0, 0, s * 0.12), c: '#5a0a16' })
      parts.push({ g: new THREE.TorusGeometry(0.04, 0.007, 4, 12), m: mtx(s * 0.33, top - 0.54, 0.06, 0, Math.PI / 2, 0), c: '#d9b25f' })
    }
    return mergeGeos(parts, true)
  })
}
function bridleGeo() {
  return cachedGeo('bridle', () => {
    const parts = []
    const tube = (pts, r = 0.0065) => parts.push({ g: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new V3(...p))), 16, r, 5) })
    // noseband, browband, cheek pieces, throatlatch
    const ring = (cy, cz, rx, rz, tilt) => {
      const pts = []
      for (let i = 0; i <= 16; i++) { const a = (i / 16) * TAU; pts.push([Math.sin(a) * rx, cy + Math.cos(a) * rz * Math.sin(tilt), cz + Math.cos(a) * rz * Math.cos(tilt)]) }
      tube(pts)
    }
    ring(1.62, 1.22, 0.082, 0.1, 0.75)
    ring(2.03, 0.97, 0.1, 0.06, -0.6)
    for (const s of [-1, 1]) {
      tube([[s * 0.075, 1.6, 1.25], [s * 0.09, 1.8, 1.09], [s * 0.095, 1.98, 0.95], [s * 0.07, 2.08, 0.9]])
      tube([[s * 0.08, 1.95, 0.93], [s * 0.07, 1.82, 0.9], [0, 1.78, 0.88]].map((p, i) => i === 2 ? [s * 0.0, 1.78, 0.9] : p))
    }
    // mathapatti: gold face plate down the forehead
    parts.push({ g: ell(0.035, 0.08, 0.012, 10, 8), m: mtx(0, 1.92, 1.075, 0.72, 0, 0) })
    parts.push({ g: ell(0.02, 0.02, 0.01, 8, 6), m: mtx(0, 1.82, 1.15, 0.72, 0, 0) })
    // reins: bit -> saddle pommel
    for (const s of [-1, 1]) tube([[s * 0.075, 1.56, 1.27], [s * 0.15, 1.4, 1.0], [s * 0.14, 1.5, 0.6], [s * 0.1, 1.65, 0.34]], 0.006)
    // neck band
    const nb = []
    for (let i = 0; i <= 20; i++) { const a = (i / 20) * TAU; nb.push([Math.sin(a) * 0.15, 1.56 + Math.cos(a) * 0.06, 0.6 + Math.cos(a) * 0.22]) }
    tube(nb, 0.012)
    return mergeGeos(parts)
  })
}
function plumeGeo() {
  return cachedGeo('horsePlume', () => {
    const parts = []
    parts.push({ g: new THREE.CylinderGeometry(0.018, 0.026, 0.06, 10), m: mtx(0, 2.15, 0.95), c: '#d9b25f' })
    const feather = (col, dx, h, lean) => {
      const curve = new THREE.CatmullRomCurve3([new V3(dx, 2.17, 0.95), new V3(dx * 1.5, 2.17 + h * 0.5, 0.93 - lean * 0.4), new V3(dx * 2, 2.17 + h, 0.9 - lean)])
      parts.push({ g: sweepGeo(curve, (t) => [0.008 + 0.022 * Math.sin(Math.PI * Math.min(1, t * 1.1)), 0.006 + 0.004 * Math.sin(Math.PI * t)], { segs: 10, radial: 8, up: new V3(1, 0, 0), closeEnd: true }), c: col })
    }
    feather('#fbf6ea', 0, 0.34, 0.1)
    feather('#c4122f', -0.025, 0.27, 0.14)
    feather('#c4122f', 0.025, 0.27, 0.14)
    feather('#e8c25a', -0.012, 0.22, -0.02)
    feather('#e8c25a', 0.012, 0.22, -0.02)
    return mergeGeos(parts, true)
  })
}
function chestGarland() {
  return cachedGeo('horseGarland', () => {
    const pts = []
    for (let i = 0; i <= 12; i++) {
      const a = lerp(-1.25, 1.25, i / 12)
      const z = 0.5 + Math.cos(a) * 0.24
      const [, cy, hw, hh] = bodyAt(Math.min(z, 0.7))
      const x = Math.sin(a) * (hw + 0.04)
      const y = 1.38 - Math.cos(a) * 0.3
      pts.push([x, y, z + 0.03])
    }
    const g1 = garlandGeo(pts, { closed: false, count: 34, r: 0.026, pendant: true, palette: ['#f29a12', '#f6b21b', '#c4122f', '#f29a12', '#fff3d6', '#f6b21b'] })
    return g1
  })
}

class Horse {
  constructor({ decorated = true } = {}) {
    this.object3d = new THREE.Group()
    this.object3d.name = 'horse'
    this.body = new THREE.Group()
    this.object3d.add(this.body)
    const coat = coatMat()
    const vc = cachedMat('vc', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }))
    const vcg = cachedMat('vcg', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.2 }))
    const mesh = (g, m, parent) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o }
    // torso pivot near the middle of the barrel so it can pitch/roll
    this.torso = new THREE.Group()
    this.torso.position.set(0, 1.2, 0)
    this.body.add(this.torso)
    const inT = new THREE.Group(); inT.position.set(0, -1.2, 0); this.torso.add(inT)
    this.inT = inT
    mesh(bodyGeo(), coat, inT)
    // neck + head with pivot at the withers
    this.neck = new THREE.Group(); this.neck.position.set(0, 1.42, 0.42); inT.add(this.neck)
    const inN = new THREE.Group(); inN.position.set(0, -1.42, -0.42); this.neck.add(inN)
    mesh(neckGeo(), coat, inN)
    this.head = new THREE.Group(); this.head.position.set(0, 2.0, 0.9); inN.add(this.head)
    const inH = new THREE.Group(); inH.position.set(0, -2.0, -0.9); this.head.add(inH)
    mesh(headGeo(), coat, inH)
    mesh(faceDetailGeo(), vcg, inH)
    const maneM = cachedMat('mane', () => new THREE.MeshStandardMaterial({ color: '#eae6de', map: TX.maneTex(), roughness: 0.7, side: THREE.DoubleSide }))
    mesh(maneGeo(), maneM, inN)
    // tail
    this.tail = new THREE.Group(); this.tail.position.set(0, 1.44, -0.88); inT.add(this.tail)
    mesh(tailGeo(), maneM, this.tail)
    // legs
    this.legs = []
    const hoofM = cachedMat('hoof', () => new THREE.MeshStandardMaterial({ color: '#3b3631', roughness: 0.45 }))
    for (const kind of ['front', 'hind']) {
      const L = LEG[kind], G = legGeos(kind)
      for (const s of [1, -1]) {
        const top = new THREE.Group(); top.position.set(s * L.x, L.y, L.z); inT.add(top)
        mesh(G.upper, coat, top)
        const mid = new THREE.Group(); mid.position.set(0, -L.upper, 0); top.add(mid)
        mesh(G.cannon, coat, mid)
        const fet = new THREE.Group(); fet.position.set(0, -L.cannon, 0); mid.add(fet)
        mesh(G.past, coat, fet)
        const hoof = mesh(hoofGeo(), hoofM, fet)
        hoof.position.set(0, -(L.pastern - 0.075) * Math.cos(0.35) - 0.07, (L.pastern - 0.075) * Math.sin(0.35) * 0.0 + 0.045)
        this.legs.push({ kind, side: s, top, mid, fet, L })
      }
    }
    // seat anchor (rider origin = saddle contact point)
    const [, cy, , hh] = bodyAt(0.02)
    this.seat = new THREE.Object3D()
    this.seat.name = 'horseSeat'
    this.seat.position.set(0, cy + hh + 0.075, 0.02)
    inT.add(this.seat)
    if (decorated) {
      const cloth = cachedMat('saddleCloth', () => new THREE.MeshStandardMaterial({ color: '#ffffff', map: TX.saddleTex(), roughness: 0.65, side: THREE.DoubleSide }))
      mesh(saddleClothGeo(), cloth, inT)
      mesh(tasselsGeo(), gold(), inT)
      mesh(saddleGeo(), vcg, inT)
      mesh(bridleGeo(), gold(), inT).geometry
      // bridle parts on the head need to follow the head: split by re-parenting a head-only copy
      mesh(plumeGeo(), vc, inH)
      const g = mesh(chestGarland(), vc, inT)
      g.castShadow = true
    }
    this.anim = 'idle'
    this.t = 0
    this.blend = { walk: 0, trot: 0 }
    this.update(0)
  }
  setAnim(name) {
    if (!['idle', 'walk', 'trot'].includes(name)) { console.warn('[Horse] unknown animation', name); return }
    this.anim = name
  }
  update(dt) {
    dt = Math.min(dt, 0.1)
    this.t += dt
    const k = Math.min(1, dt * 3)
    this.blend.walk += ((this.anim === 'walk' ? 1 : 0) - this.blend.walk) * k
    this.blend.trot += ((this.anim === 'trot' ? 1 : 0) - this.blend.trot) * k
    const bw = this.blend.walk, bt = this.blend.trot, bi = Math.max(0, 1 - bw - bt)
    const t = this.t
    // phases (cycle fraction) for LF, RF, LH, RH
    const freq = lerp(lerp(0.9, 0.95, bw), 1.45, bt)
    this.cyc = (this.cyc || 0) + dt * freq
    const c = this.cyc * TAU
    let minY = 1e9
    for (const lg of this.legs) {
      const isF = lg.kind === 'front'
      const left = lg.side > 0
      const walkPh = isF ? (left ? 0.25 : 0.75) : (left ? 0 : 0.5)
      const trotPh = (isF === left) ? 0 : 0.5
      const ph = c + TAU * lerp(walkPh, trotPh, bt / Math.max(1e-3, bw + bt) || 0)
      const amp = 0.32 * bw + 0.4 * bt
      const swing = Math.max(0, Math.cos(ph + 0.4))
      const sw = Math.pow(swing, 1.5)
      let a1 = -amp * Math.sin(ph), a2 = 0, a3 = 0
      if (isF) {
        a2 = (0.9 * bw + 1.4 * bt) * sw
        a3 = (0.5 * bw + 0.8 * bt) * sw - 0.08 * (bw + bt) * (1 - sw)
      } else {
        a1 += LEG.hind.rest
        a2 = -LEG.hind.rest - (0.55 * bw + 0.9 * bt) * sw
        a3 = (0.7 * bw + 1.0 * bt) * sw
      }
      // idle weight shift: rest one hind leg
      if (!isF && left) { a2 -= 0.12 * bi; a3 += 0.35 * bi }
      lg.top.rotation.x = a1; lg.mid.rotation.x = a2; lg.fet.rotation.x = a3
      const L = lg.L
      const y = L.y - (L.upper * Math.cos(a1) + L.cannon * Math.cos(a1 + a2) + (L.pastern + 0.01) * Math.cos(a1 + a2 + a3))
      if (!(!isF && left && bi > 0.5)) minY = Math.min(minY, y)
    }
    const bounce = bt * 0.035 * Math.abs(Math.sin(c * 2)) + bw * 0.012 * Math.sin(c * 4)
    const breath = 0.006 * Math.sin(t * 1.6)
    this.body.position.y = -minY + bounce
    this.torso.rotation.x = bw * 0.012 * Math.sin(c * 2) + bt * 0.02 * Math.sin(c * 2 + 0.6)
    this.torso.rotation.z = bw * 0.012 * Math.sin(c) + 0.006 * bi * Math.sin(t * 0.4)
    this.torso.scale.set(1 + breath, 1 + breath * 0.6, 1)
    this.neck.rotation.x = 0.05 * bw * Math.sin(c * 2 + 1) + bi * (0.04 * Math.sin(t * 0.37) + 0.03) + 0.03 * bt * Math.sin(c * 2)
    this.neck.rotation.y = bi * 0.08 * Math.sin(t * 0.23)
    this.head.rotation.x = 0.03 * bw * Math.sin(c * 2 + 1.6) + bi * 0.04 * Math.sin(t * 0.5 + 1)
    this.tail.rotation.x = 0.25 + 0.06 * Math.sin(t * 1.3) + bt * 0.2
    this.tail.rotation.z = 0.12 * Math.sin(t * (bi > 0.5 ? 1.1 : 2.2)) + (bi > 0.5 ? 0.25 * Math.pow(Math.max(0, Math.sin(t * 0.7)), 8) : 0)
  }
}

export function createHorse(opts = {}) {
  const h = new Horse(opts)
  return {
    object3d: h.object3d,
    seat: h.seat,
    setAnim: (n) => h.setAnim(n),
    update: (dt) => h.update(dt),
    get anim() { return h.anim },
    dispose() { h.object3d.removeFromParent() },
  }
}
