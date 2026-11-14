// Procedural canvas textures for characters and the horse.
// Everything here is drawn with the 2D canvas API (no image files). Textures are cached by key
// and shared between all characters.
import * as THREE from 'three'

export function mulberry32(seed) {
  let a = (seed >>> 0) || 0x9e3779b9
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const cache = new Map()
export function cached(key, make) {
  let t = cache.get(key)
  if (!t) { t = make(); cache.set(key, t) }
  return t
}

function cv(w, h) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return [c, c.getContext('2d')]
}

function tex(c, { srgb = true, rx = 1, ry = 1, clampX = false, clampY = false } = {}) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.wrapS = clampX ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
  t.wrapT = clampY ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
  t.repeat.set(rx, ry)
  t.anisotropy = 8
  return t
}

/** Same image, different repeat (shares the canvas source). */
export function variant(base, key, rx, ry) {
  return cached(key, () => {
    const t = base.clone()
    t.repeat.set(rx, ry)
    return t
  })
}

// ---------------------------------------------------------------- drawing helpers
function grain(g, w, h, amt, seed = 1) {
  const r = mulberry32(seed)
  const img = g.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amt
    d[i] = Math.max(0, Math.min(255, d[i] + n))
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n))
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n))
  }
  g.putImageData(img, 0, 0)
}

function flower(g, x, y, r, petals, col, centre) {
  g.fillStyle = col
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2
    g.beginPath()
    g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, r * 0.28, a, 0, Math.PI * 2)
    g.fill()
  }
  if (centre) {
    g.fillStyle = centre
    g.beginPath(); g.arc(x, y, r * 0.25, 0, Math.PI * 2); g.fill()
  }
}

function paisley(g, x, y, s, rot, col, lineCol) {
  g.save()
  g.translate(x, y); g.rotate(rot); g.scale(s, s)
  g.beginPath()
  g.moveTo(0, -1)
  g.bezierCurveTo(0.9, -0.9, 0.9, 0.6, 0, 0.75)
  g.bezierCurveTo(-0.7, 0.8, -0.75, 0.0, -0.2, -0.2)
  g.bezierCurveTo(0.15, -0.45, 0.1, -0.8, 0, -1)
  g.fillStyle = col; g.fill()
  if (lineCol) {
    g.strokeStyle = lineCol; g.lineWidth = 0.12; g.stroke()
    g.beginPath(); g.arc(0.12, 0.2, 0.25, 0, Math.PI * 2); g.stroke()
  }
  g.restore()
}

function vineV(g, x, y0, y1, amp, wl, col, lw) {
  g.strokeStyle = col; g.lineWidth = lw
  g.beginPath()
  for (let y = y0; y <= y1; y += 1) {
    const px = x + Math.sin((y / wl) * Math.PI * 2) * amp
    if (y === y0) g.moveTo(px, y); else g.lineTo(px, y)
  }
  g.stroke()
  g.fillStyle = col
  for (let y = y0; y < y1; y += wl / 2) {
    const s = Math.sin((y / wl) * Math.PI * 2) >= 0 ? 1 : -1
    g.beginPath()
    g.ellipse(x + s * amp * 1.6, y + wl * 0.12, lw * 1.6, lw * 0.8, s * 0.6, 0, Math.PI * 2)
    g.fill()
  }
}

function vineH(g, y, x0, x1, amp, wl, col, lw) {
  g.strokeStyle = col; g.lineWidth = lw
  g.beginPath()
  for (let x = x0; x <= x1; x += 1) {
    const py = y + Math.sin((x / wl) * Math.PI * 2) * amp
    if (x === x0) g.moveTo(x, py); else g.lineTo(x, py)
  }
  g.stroke()
  g.fillStyle = col
  for (let x = x0; x < x1; x += wl / 2) {
    const s = Math.sin((x / wl) * Math.PI * 2) >= 0 ? 1 : -1
    g.beginPath()
    g.ellipse(x + wl * 0.12, y + s * amp * 1.6, lw * 0.8, lw * 1.6, s * 0.6, 0, Math.PI * 2)
    g.fill()
  }
}

function dots(g, w, h, step, r, col, jitter = 0, seed = 3) {
  const rnd = mulberry32(seed)
  g.fillStyle = col
  for (let y = step / 2, row = 0; y < h; y += step, row++) {
    for (let x = (row % 2) * step / 2; x < w + step; x += step) {
      g.beginPath()
      g.arc(x + (rnd() - 0.5) * jitter, y + (rnd() - 0.5) * jitter, r, 0, Math.PI * 2)
      g.fill()
    }
  }
}

function band(g, w, y, hgt, base, gold, deco = 'vine') {
  g.fillStyle = base; g.fillRect(0, y, w, hgt)
  g.fillStyle = gold
  g.fillRect(0, y, w, Math.max(1, hgt * 0.08))
  g.fillRect(0, y + hgt - Math.max(1, hgt * 0.08), w, Math.max(1, hgt * 0.08))
  if (deco === 'vine') vineH(g, y + hgt / 2, 0, w, hgt * 0.18, hgt * 1.4, gold, Math.max(1, hgt * 0.06))
  else if (deco === 'paisley') {
    for (let x = hgt * 0.5; x < w; x += hgt * 0.9) paisley(g, x, y + hgt * 0.52, hgt * 0.3, 0.5, gold)
  } else if (deco === 'dots') {
    for (let x = hgt * 0.3; x < w; x += hgt * 0.5) { g.beginPath(); g.arc(x, y + hgt / 2, hgt * 0.12, 0, 7); g.fill() }
  } else if (deco === 'flowers') {
    for (let x = hgt * 0.5; x < w; x += hgt * 0.9) flower(g, x, y + hgt / 2, hgt * 0.32, 6, gold, null)
  }
}

// ---------------------------------------------------------------- fabric bases (tinted by material colour)
export function plainWeave() {
  return cached('weave', () => {
    const W = 128
    const [c, g] = cv(W, W)
    g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, W, W)
    g.globalAlpha = 0.07
    for (let i = 0; i < W; i += 2) {
      g.fillStyle = '#000'; g.fillRect(0, i, W, 1)
      g.fillRect(i, 0, 1, W)
    }
    g.globalAlpha = 1
    grain(g, W, W, 14, 11)
    return tex(c, { rx: 6, ry: 6 })
  })
}

export function knit() {
  return cached('knit', () => {
    const W = 256
    const [c, g] = cv(W, W)
    g.fillStyle = '#dedede'; g.fillRect(0, 0, W, W)
    for (let x = 0; x < W; x += 8) {
      g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(x, 0, 1.5, W)
      const col = (x / 8) % 4
      for (let y = 0; y < W; y += 6) {
        const off = (col % 2) * 3
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x + 2, y + off, 4.5, 2)
        g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x + 2, y + off + 2.2, 4.5, 1)
      }
    }
    grain(g, W, W, 12, 5)
    return tex(c, { rx: 7, ry: 5 })
  })
}

export function denim() {
  return cached('denim', () => {
    const W = 256
    const [c, g] = cv(W, W)
    g.fillStyle = '#d6d6d6'; g.fillRect(0, 0, W, W)
    g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 1
    for (let i = -W; i < W * 2; i += 3) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + W * 0.6, W); g.stroke()
    }
    grain(g, W, W, 30, 9)
    return tex(c, { rx: 3, ry: 4 })
  })
}

/** Brocade / jacquard tone-on-tone small motif pattern, greyscale (tint with colour). */
export function brocade() {
  return cached('brocade', () => {
    const W = 256
    const [c, g] = cv(W, W)
    g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, W, W)
    for (let y = 16, r = 0; y < W + 32; y += 32, r++) {
      for (let x = (r % 2) * 16; x < W + 32; x += 32) {
        flower(g, x, y, 7, 6, 'rgba(255,255,255,0.75)', 'rgba(0,0,0,0.2)')
        g.fillStyle = 'rgba(0,0,0,0.12)'
        g.beginPath(); g.arc(x + 16, y, 1.6, 0, 7); g.fill()
      }
    }
    grain(g, W, W, 10, 21)
    return tex(c, { rx: 5, ry: 5 })
  })
}

/** Bandhani dots on a coloured base (colour baked). */
export function bandhani(base, dot) {
  return cached('bandhani|' + base + dot, () => {
    const W = 128
    const [c, g] = cv(W, W)
    g.fillStyle = base; g.fillRect(0, 0, W, W)
    dots(g, W, W, 10, 1.6, dot, 2, 7)
    grain(g, W, W, 10, 4)
    return tex(c, { rx: 6, ry: 6 })
  })
}

export function check(c1, c2) {
  return cached('check|' + c1 + c2, () => {
    const W = 128
    const [c, g] = cv(W, W)
    g.fillStyle = c1; g.fillRect(0, 0, W, W)
    g.globalAlpha = 0.45; g.fillStyle = c2
    for (let i = 0; i < W; i += 32) { g.fillRect(i, 0, 10, W); g.fillRect(0, i, W, 10) }
    g.globalAlpha = 0.25
    for (let i = 16; i < W; i += 32) { g.fillRect(i, 0, 2, W); g.fillRect(0, i, W, 2) }
    g.globalAlpha = 1
    grain(g, W, W, 10, 8)
    return tex(c, { rx: 6, ry: 6 })
  })
}

export function floralPrint(base, a, b) {
  return cached('floral|' + base + a + b, () => {
    const W = 128
    const [c, g] = cv(W, W)
    g.fillStyle = base; g.fillRect(0, 0, W, W)
    const r = mulberry32(17)
    for (let i = 0; i < 14; i++) {
      const x = r() * W, y = r() * W
      flower(g, x, y, 7 + r() * 4, 5, i % 2 ? a : b, '#fff6d8')
      flower(g, x + W, y, 7, 5, i % 2 ? a : b, '#fff6d8')
    }
    return tex(c, { rx: 4, ry: 4 })
  })
}

// ---------------------------------------------------------------- garment textures (colours baked)
/** Long coat (sherwani / achkan / anarkali bodice etc.) mapped over a lathe: u around (0.5 = front), v top->bottom. */
export function sherwaniTex(base = '#efe4cc', gold = '#c8a45a', tone = '#e3d3b0') {
  return cached('sherwani|' + base + gold, () => {
    const W = 512, H = 512
    const [c, g] = cv(W, H)
    g.fillStyle = base; g.fillRect(0, 0, W, H)
    // tone-on-tone jaal (lattice) pattern
    g.strokeStyle = tone; g.lineWidth = 1.2
    for (let i = -H; i < W + H; i += 22) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke()
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i - H, H); g.stroke()
    }
    for (let y = 11, r = 0; y < H; y += 22, r++) {
      for (let x = 0; x < W; x += 22) flower(g, x + 11, y, 4.5, 4, tone, null)
    }
    // subtle gold butis, denser toward the hem
    for (let y = 30, r = 0; y < H - 60; y += 34, r++) {
      for (let x = (r % 2) * 22; x < W; x += 44) {
        if (Math.random() < 0.15 + y / H * 0.6) flower(g, x + 6, y, 4 + y / H * 3, 5, gold, null)
      }
    }
    // front opening band
    const fx = W / 2
    g.fillStyle = gold; g.globalAlpha = 0.92
    g.fillRect(fx - 15, 0, 2, H); g.fillRect(fx + 13, 0, 2, H)
    g.globalAlpha = 1
    vineV(g, fx - 7, 0, H, 3, 26, gold, 1.6)
    vineV(g, fx + 7, 0, H, 3, 26, gold, 1.6)
    // buttons
    for (let y = 20; y < 260; y += 26) {
      g.fillStyle = '#9c7a35'; g.beginPath(); g.arc(fx, y, 4.2, 0, 7); g.fill()
      g.fillStyle = '#f2dd9a'; g.beginPath(); g.arc(fx - 1, y - 1, 2.2, 0, 7); g.fill()
    }
    // collar band + hem border
    band(g, W, 0, 10, base, gold, 'dots')
    band(g, W, H - 64, 54, base, gold, 'paisley')
    band(g, W, H - 10, 10, base, gold, 'dots')
    grain(g, W, H, 8, 2)
    return tex(c, { clampY: true })
  })
}

export function sleeveTex(base, gold, tone, key) {
  return cached('sleeve|' + key + base + gold, () => {
    const W = 128, H = 256
    const [c, g] = cv(W, H)
    g.fillStyle = base; g.fillRect(0, 0, W, H)
    if (tone) {
      g.strokeStyle = tone; g.lineWidth = 1
      for (let i = -H; i < W + H; i += 18) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke()
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i - H, H); g.stroke()
      }
    }
    if (gold) {
      for (let y = 20; y < H - 40; y += 30) for (let x = 10; x < W; x += 32) flower(g, x + (y % 60 ? 16 : 0), y, 3.5, 5, gold, null)
      band(g, W, H - 26, 22, base, gold, 'vine')
    }
    grain(g, W, H, 8, 6)
    return tex(c, { clampY: true })
  })
}

/** Lehenga skirt: base colour, kali panel lines, butis and a wide gold hem border. */
export function lehengaTex(base, gold, deep) {
  return cached('lehenga|' + base + gold, () => {
    const W = 1024, H = 512
    const [c, g] = cv(W, H)
    const grd = g.createLinearGradient(0, 0, 0, H)
    grd.addColorStop(0, base); grd.addColorStop(1, deep)
    g.fillStyle = grd; g.fillRect(0, 0, W, H)
    // kalis
    g.strokeStyle = gold; g.globalAlpha = 0.55; g.lineWidth = 1.5
    for (let i = 0; i < 16; i++) { const x = (i + 0.5) * W / 16; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke() }
    g.globalAlpha = 1
    // butis increasing density downwards
    const r = mulberry32(31)
    for (let y = 20; y < H - 150; y += 26) {
      const dens = 0.25 + (y / H) * 0.9
      for (let x = 0; x < W; x += 30) {
        if (r() < dens) flower(g, x + r() * 10, y + r() * 6, 3.5 + y / H * 4, 5, gold, null)
      }
    }
    // jaal above border
    for (let x = 0; x < W; x += 32) paisley(g, x + 16, H - 175, 9, 0.4, gold)
    band(g, W, H - 150, 14, deep, gold, 'dots')
    band(g, W, H - 132, 96, deep, gold, 'paisley')
    // dense zari fill of the border
    for (let x = 0; x < W; x += 12) for (let y = H - 128; y < H - 40; y += 12) {
      if ((x + y) % 24 === 0) { g.fillStyle = gold; g.globalAlpha = 0.5; g.fillRect(x, y, 2, 2); g.globalAlpha = 1 }
    }
    band(g, W, H - 34, 34, gold, deep, 'flowers')
    grain(g, W, H, 10, 12)
    return tex(c, { clampY: true })
  })
}

/** Small allover motif with a border at the bottom (choli, kurti, blouse, gown bodice). */
export function motifTex(base, accent, key, { border = true, density = 1, sparkle = false } = {}) {
  return cached('motif|' + key + base + accent, () => {
    const W = 512, H = 512
    const [c, g] = cv(W, H)
    g.fillStyle = base; g.fillRect(0, 0, W, H)
    const r = mulberry32(51)
    if (sparkle) {
      for (let i = 0; i < 2600 * density; i++) {
        const y = Math.pow(r(), 0.7) * H
        g.fillStyle = r() < 0.5 ? accent : 'rgba(255,255,255,0.8)'
        g.globalAlpha = 0.35 + r() * 0.6
        g.beginPath(); g.arc(r() * W, y, 0.8 + r() * 1.6, 0, 7); g.fill()
      }
      g.globalAlpha = 1
      for (let y = 40; y < H - 60; y += 46) for (let x = (y % 92 ? 23 : 0); x < W; x += 46) flower(g, x, y, 6, 6, accent, 'rgba(255,255,255,0.9)')
    } else {
      for (let y = 14, row = 0; y < H; y += 24 / density, row++) {
        for (let x = (row % 2) * 12 / density; x < W; x += 24 / density) flower(g, x, y, 4, 5, accent, null)
      }
    }
    if (border) {
      band(g, W, H - 40, 34, base, accent, 'vine')
      band(g, W, 0, 10, base, accent, 'dots')
    }
    grain(g, W, H, 8, 13)
    return tex(c, { clampY: true })
  })
}

/** Ribbon textures: u across the width, v along the length. Borders on both long edges. */
export function dupattaTex(base, border, key, { butis = true, sheer = false, endBand = false } = {}) {
  return cached('dupatta|' + key + base + border, () => {
    const W = 128, H = 512
    const [c, g] = cv(W, H)
    g.fillStyle = base; g.fillRect(0, 0, W, H)
    if (sheer) {
      g.globalAlpha = 0.18; g.fillStyle = '#ffffff'
      for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1)
      g.globalAlpha = 1
    }
    if (butis) for (let y = 12, r = 0; y < H; y += 26, r++) for (let x = 24 + (r % 2) * 20; x < W - 20; x += 40) flower(g, x, y, 4, 5, border, null)
    const bw = 18
    for (const x0 of [0, W - bw]) {
      g.fillStyle = border; g.fillRect(x0, 0, bw, H)
      g.fillStyle = base; g.globalAlpha = 0.45
      g.fillRect(x0 + 3, 0, 2, H); g.fillRect(x0 + bw - 5, 0, 2, H)
      g.globalAlpha = 1
      for (let y = 6; y < H; y += 14) { g.fillStyle = base; g.beginPath(); g.arc(x0 + bw / 2, y, 2.2, 0, 7); g.fill() }
    }
    if (endBand) {
      for (const y0 of [0, H - 50]) {
        g.fillStyle = border; g.fillRect(0, y0, W, 50)
        for (let x = 12; x < W; x += 26) paisley(g, x, y0 + 25, 9, 0.4, base)
      }
    }
    grain(g, W, H, 8, 15)
    return tex(c)
  })
}

export function sareeSkirtTex(base, border) {
  return cached('sareeSkirt|' + base + border, () => {
    const W = 512, H = 256
    const [c, g] = cv(W, H)
    g.fillStyle = base; g.fillRect(0, 0, W, H)
    for (let y = 14, r = 0; y < H - 60; y += 22, r++) for (let x = (r % 2) * 16; x < W; x += 32) flower(g, x, y, 3, 5, border, null)
    band(g, W, H - 48, 40, border, base, 'paisley')
    g.fillStyle = border; g.fillRect(0, H - 6, W, 6)
    // front pleat shading lines
    g.globalAlpha = 0.12; g.fillStyle = '#000'
    for (let x = W * 0.44; x < W * 0.56; x += 6) g.fillRect(x, 0, 2, H)
    g.globalAlpha = 1
    grain(g, W, H, 8, 16)
    return tex(c, { clampY: true })
  })
}

export function safaTex(base = '#ead7c6', stripe = '#d9b46a', accent = '#e9b9b0') {
  return cached('safa|' + base + stripe + accent, () => {
    const W = 256, H = 256
    const [c, g] = cv(W, H)
    g.fillStyle = base; g.fillRect(0, 0, W, H)
    // diagonal wrap folds
    for (let i = -H; i < W + H; i += 28) {
      const grd = g.createLinearGradient(i, 0, i + 28, 0)
      grd.addColorStop(0, 'rgba(0,0,0,0.10)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.10)'); grd.addColorStop(1, 'rgba(0,0,0,0.10)')
      g.save(); g.translate(i, 0); g.transform(1, 0, -0.55, 1, 0, 0)
      g.fillStyle = grd; g.fillRect(0, 0, 28, H * 1.2)
      g.fillStyle = stripe; g.fillRect(0, 0, 3, H * 1.2)
      g.fillStyle = accent; g.globalAlpha = 0.7; g.fillRect(9, 0, 2, H * 1.2); g.globalAlpha = 1
      g.restore()
    }
    dots(g, W, H, 14, 1.1, stripe, 0, 3)
    grain(g, W, H, 8, 18)
    return tex(c, { rx: 2, ry: 1 })
  })
}

/** Sehra: vertical strands of pearls and small white flowers on a transparent background. */
export function sehraTex() {
  return cached('sehra', () => {
    const W = 512, H = 512
    const [c, g] = cv(W, H)
    g.clearRect(0, 0, W, H)
    const n = 16
    const r = mulberry32(77)
    for (let s = 0; s < n; s++) {
      const x = (s + 0.5) * W / n
      const len = H * (0.86 + r() * 0.12)
      g.strokeStyle = 'rgba(240,236,225,0.9)'; g.lineWidth = 1.5
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, len); g.stroke()
      let y = 6
      let k = 0
      while (y < len - 8) {
        if (k % 7 === 3) {
          flower(g, x, y + 7, 11, 5, '#fbfaf5', '#e8d9a0')
          y += 16
        } else if (k % 7 === 6) {
          g.fillStyle = '#d9b76a'; g.beginPath(); g.arc(x, y + 4, 4, 0, 7); g.fill(); y += 9
        } else {
          const grd = g.createRadialGradient(x - 2, y + 3, 1, x, y + 5, 6)
          grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#cfcac0')
          g.fillStyle = grd; g.beginPath(); g.arc(x, y + 5, 5.5, 0, 7); g.fill(); y += 11
        }
        k++
      }
      // tassel bead
      g.fillStyle = '#d9b76a'; g.beginPath(); g.ellipse(x, len, 4, 7, 0, 0, 7); g.fill()
    }
    const t = tex(c, { rx: 3, ry: 1, clampY: true })
    return t
  })
}

export function bandJacketTex() {
  return cached('bandJacket', () => {
    const W = 512, H = 512
    const [c, g] = cv(W, H)
    g.fillStyle = '#b3141e'; g.fillRect(0, 0, W, H)
    const gold = '#e3bb4f'
    const fx = W / 2
    for (let y = 40; y < 300; y += 30) {
      g.fillStyle = gold
      g.fillRect(fx - 70, y, 140, 5)
      g.beginPath(); g.arc(fx - 70, y + 2.5, 6, 0, 7); g.arc(fx + 70, y + 2.5, 6, 0, 7); g.fill()
    }
    for (let y = 30; y < 420; y += 30) { g.fillStyle = '#f6dc8a'; g.beginPath(); g.arc(fx, y, 5, 0, 7); g.fill() }
    g.fillStyle = gold
    g.fillRect(0, H - 22, W, 8); g.fillRect(0, 0, W, 14)
    g.fillRect(fx - 3, 0, 6, H)
    grain(g, W, H, 10, 19)
    return tex(c, { clampY: true })
  })
}

export function capTex() {
  return cached('capTex', () => {
    const W = 256, H = 64
    const [c, g] = cv(W, H)
    g.fillStyle = '#b3141e'; g.fillRect(0, 0, W, H)
    g.fillStyle = '#e3bb4f'; g.fillRect(0, H - 22, W, 14)
    return tex(c, { clampY: true })
  })
}

/** Embroidered prayer-cap (topi) pattern: white with tone-on-tone crochet. */
export function topiTex() {
  return cached('topi', () => {
    const W = 256, H = 64
    const [c, g] = cv(W, H)
    g.fillStyle = '#f4f2ec'; g.fillRect(0, 0, W, H)
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1
    for (let x = 0; x < W; x += 8) { g.beginPath(); g.arc(x, H / 2, 6, 0, 7); g.stroke() }
    for (let y = 6; y < H; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke() }
    return tex(c)
  })
}

/** Horse saddle cloth: u runs around the barrel (0 and 1 = lower hems), v front->back. */
export function saddleTex() {
  return cached('saddle', () => {
    const W = 512, H = 256
    const [c, g] = cv(W, H)
    const base = '#8e1424', deep = '#5e0d18', gold = '#e0b85a'
    g.fillStyle = base; g.fillRect(0, 0, W, H)
    for (let y = 20, r = 0; y < H; y += 26, r++) for (let x = 60 + (r % 2) * 18; x < W - 60; x += 36) flower(g, x, y, 5, 6, gold, '#f7e6b0')
    for (const cx of [W * 0.2, W * 0.8]) {
      const cy = H * 0.5
      g.fillStyle = gold; g.beginPath(); g.arc(cx, cy, 46, 0, 7); g.fill()
      g.fillStyle = deep; g.beginPath(); g.arc(cx, cy, 39, 0, 7); g.fill()
      for (let i = 0; i < 8; i++) paisley(g, cx + Math.cos(i * 0.785) * 22, cy + Math.sin(i * 0.785) * 22, 8, i * 0.785 + 1.57, gold)
      flower(g, cx, cy, 11, 8, '#f3d27a', '#2e7d5b')
    }
    // borders: along both lower hems (x edges) and the front/back (y edges)
    for (const x0 of [0, W - 44]) {
      g.fillStyle = deep; g.fillRect(x0, 0, 44, H)
      g.fillStyle = gold; g.fillRect(x0 + (x0 ? 0 : 40), 0, 4, H); g.fillRect(x0 + (x0 ? 20 : 20), 0, 2, H)
      for (let y = 10; y < H; y += 22) paisley(g, x0 + 22, y, 7, x0 ? -1.57 : 1.57, gold)
    }
    for (const y0 of [0, H - 18]) { g.fillStyle = gold; g.fillRect(0, y0, W, 4); g.fillRect(0, y0 + 14, W, 4); g.fillStyle = deep; g.fillRect(0, y0 + 4, W, 10) }
    grain(g, W, H, 10, 22)
    return tex(c, { clampX: true, clampY: true })
  })
}

/** Soft hair strands for mane/tail (greyscale, tint with material colour). */
export function maneTex() {
  return cached('mane', () => {
    const W = 128, H = 256
    const [c, g] = cv(W, H)
    g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, W, H)
    const r = mulberry32(41)
    for (let i = 0; i < 260; i++) {
      const x = r() * W
      g.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.12)'
      g.lineWidth = 0.6 + r() * 1.4
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 10, H * 0.3, x + (r() - 0.5) * 14, H * 0.7, x + (r() - 0.5) * 18, H); g.stroke()
    }
    return tex(c)
  })
}

export function dholTex() {
  return cached('dhol', () => {
    const W = 256, H = 128
    const [c, g] = cv(W, H)
    g.fillStyle = '#a1361b'; g.fillRect(0, 0, W, H)
    g.fillStyle = '#e8b33c'; g.fillRect(0, 0, W, 12); g.fillRect(0, H - 12, W, 12)
    g.strokeStyle = '#f4e3c0'; g.lineWidth = 3
    g.beginPath()
    for (let x = 0, i = 0; x <= W; x += 16, i++) g.lineTo(x, i % 2 ? 14 : H - 14)
    g.stroke()
    grain(g, W, H, 12, 23)
    return tex(c)
  })
}

export function bookTex() {
  return cached('book', () => {
    const W = 128, H = 128
    const [c, g] = cv(W, H)
    g.fillStyle = '#1f4f3c'; g.fillRect(0, 0, W, H)
    g.strokeStyle = '#d6b45e'; g.lineWidth = 3; g.strokeRect(10, 10, W - 20, H - 20)
    g.lineWidth = 1.5; g.strokeRect(18, 18, W - 36, H - 36)
    flower(g, W / 2, H / 2, 16, 8, '#d6b45e', '#1f4f3c')
    return tex(c)
  })
}

// ---------------------------------------------------------------- hair / beard / face masks
/**
 * Paint a texture per pixel from fn(u, v) -> [r, g, b, a] (0..255). Used for hair and beard shells
 * where the mask is defined in the same UV space as the head sphere.
 */
export function pixelTexture(key, W, H, fn, opts = {}) {
  return cached(key, () => {
    const [c, g] = cv(W, H)
    const img = g.createImageData(W, H)
    const d = img.data
    const out = [0, 0, 0, 0]
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        fn((x + 0.5) / W, (y + 0.5) / H, out)
        const i = (y * W + x) * 4
        d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = out[3]
      }
    }
    g.putImageData(img, 0, 0)
    if (opts.post) opts.post(g, W, H)
    const t = tex(c, { srgb: opts.srgb !== false, clampY: true })
    return t
  })
}

/** Tiny smooth value noise for organic edges. */
export function vnoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const h = (a, b) => {
    let n = (a * 374761393 + b * 668265263 + seed * 1442695041) | 0
    n = Math.imul(n ^ (n >>> 13), 1274126177)
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296
  }
  const s = (t) => t * t * (3 - 2 * t)
  const a = h(xi, yi), b = h(xi + 1, yi), c2 = h(xi, yi + 1), d = h(xi + 1, yi + 1)
  const u = s(xf), v = s(yf)
  return a + (b - a) * u + (c2 - a) * v + (a - b - c2 + d) * u * v
}
