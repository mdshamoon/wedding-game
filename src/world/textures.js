// Procedural canvas textures (no image files).
import * as THREE from 'three';

let maxAniso = 4;
export function setMaxAnisotropy(a) { maxAniso = a; }

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909), (s ^= s >>> 16) >>> 0) / 4294967296);
}

function speckle(ctx, w, h, n, colors, rmin, rmax, r = Math.random) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(r() * colors.length) | 0];
    const s = rmin + r() * (rmax - rmin);
    ctx.fillRect(r() * w, r() * h, s, s);
  }
}

function tex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const cache = {};
const once = (k, f) => cache[k] || (cache[k] = f());

// Base asphalt: grey with aggregate speckle and patches. 512x512 covers 8 m x 8 m.
function asphaltBase(ctx, w, h, tone = 72, seed = 1) {
  const r = rng(seed);
  ctx.fillStyle = `rgb(${tone},${tone},${tone + 2})`;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 14; i++) { // repair patches
    const g = tone + (r() * 26 - 13);
    ctx.fillStyle = `rgba(${g},${g},${g},0.55)`;
    ctx.beginPath();
    ctx.ellipse(r() * w, r() * h, 20 + r() * 70, 14 + r() * 50, r() * 3, 0, 7);
    ctx.fill();
  }
  const t = (d) => { const v = Math.max(0, Math.min(255, tone + d)); return `rgb(${v},${v},${v + 1})`; };
  speckle(ctx, w, h, 9000, [t(-16), t(-8), t(8), t(14), t(-22)], 1, 2, r); // aggregate, low contrast
  for (let i = 0; i < 22; i++) { // settled dust
    ctx.fillStyle = `rgba(${150 + r() * 20},${132 + r() * 18},${105 + r() * 15},${0.03 + r() * 0.05})`;
    ctx.beginPath(); ctx.ellipse(r() * w, r() * h, 8 + r() * 30, 30 + r() * 90, r() * 0.2, 0, 7); ctx.fill();
  }
  ctx.fillStyle = 'rgba(25,25,25,0.12)'; // tyre-polished wheel tracks
  ctx.fillRect(w * 0.22, 0, w * 0.12, h); ctx.fillRect(w * 0.66, 0, w * 0.12, h);
  ctx.strokeStyle = 'rgba(30,30,30,0.35)'; ctx.lineWidth = 1.2; // cracks
  for (let i = 0; i < 10; i++) {
    let x = r() * w, y = r() * h; ctx.beginPath(); ctx.moveTo(x, y);
    for (let j = 0; j < 8; j++) { x += r() * 30 - 15; y += r() * 30 - 15; ctx.lineTo(x, y); }
    ctx.stroke();
  }
}

// Road textures are mapped: u across the road (0..1), v along the road in metres / repeatLen.
export const roadTextures = {
  // Highway / main road: edge lines + dashed centre. 1 texture repeat = 12 m along.
  major: () => once('rmajor', () => {
    const [c, ctx] = canvas(256, 512);
    asphaltBase(ctx, 256, 512, 84, 3);
    // dusty edges
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(150,130,100,0.7)'); g.addColorStop(0.09, 'rgba(150,130,100,0)');
    g.addColorStop(0.91, 'rgba(150,130,100,0)'); g.addColorStop(1, 'rgba(150,130,100,0.7)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 512);
    // worn paint: broken edge lines and a faded dashed centre
    const r = rng(9);
    for (const x of [14, 237]) for (let y = 0; y < 512; y += 8) { ctx.fillStyle = `rgba(230,228,215,${r() < 0.25 ? 0.12 : 0.45 + r() * 0.2})`; ctx.fillRect(x, y, 5, 8); }
    for (let y = 0; y < 190; y += 6) { ctx.fillStyle = `rgba(232,230,218,${r() < 0.2 ? 0.15 : 0.55 + r() * 0.2})`; ctx.fillRect(125, y, 6, 6); }
    return tex(c);
  }),
  // Town street: worn asphalt, no markings, dusty fade at the edges. 1 repeat = 8 m.
  street: () => once('rstreet', () => {
    const [c, ctx] = canvas(256, 256);
    asphaltBase(ctx, 256, 256, 96, 7);
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(160,140,110,0.9)'); g.addColorStop(0.12, 'rgba(160,140,110,0.0)');
    g.addColorStop(0.88, 'rgba(160,140,110,0.0)'); g.addColorStop(1, 'rgba(160,140,110,0.9)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    return tex(c);
  }),
  // Dirt track with tyre ruts, alpha-faded edges.
  dirt: () => once('rdirt', () => {
    const [c, ctx] = canvas(128, 256);
    const r = rng(11);
    ctx.fillStyle = '#9c8466'; ctx.fillRect(0, 0, 128, 256);
    speckle(ctx, 128, 256, 2500, ['#8a7258', '#ad977a', '#7d6850', '#b9a588'], 1, 3, r);
    ctx.fillStyle = 'rgba(90,72,52,0.35)';
    ctx.fillRect(30, 0, 14, 256); ctx.fillRect(84, 0, 14, 256);
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    ctx.globalCompositeOperation = 'destination-in';
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.2, 'rgba(0,0,0,1)'); g.addColorStop(0.8, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 256);
    return tex(c);
  }),
  // Dusty shoulder strip under main roads (alpha fades outward).
  shoulder: () => once('rshoulder', () => {
    const [c, ctx] = canvas(128, 128);
    const r = rng(5);
    ctx.fillStyle = '#a08a6c'; ctx.fillRect(0, 0, 128, 128);
    speckle(ctx, 128, 128, 1500, ['#8c7860', '#b39f82', '#6f6250'], 1, 2.5, r);
    ctx.globalCompositeOperation = 'destination-in';
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.25, 'rgba(0,0,0,0.9)'); g.addColorStop(0.75, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    return tex(c);
  }),
};

// Facade textures: one tile = one bay (3.5 m) x one floor (3.2 m). White-ish so vertex colours tint the paint.
// Facade textures: one tile = 4 bays (4 x 3.5 m) x 2 floors (2 x 3.2 m). White-ish so vertex colours tint the paint.
// Each style also has an emissive twin where a random subset of windows glows warm at night.
export const FACADE_U = 14, FACADE_V = 6.4;
export const facadeTextures = {
  plain: () => once('fplain', () => facade(1).map),
  balcony: () => once('fbalc', () => facade(2).map),
  arched: () => once('farch', () => facade(3).map),
};
export const facadeEmissive = {
  plain: () => once('fplainE', () => facade(1).emissive),
  balcony: () => once('fbalcE', () => facade(2).emissive),
  arched: () => once('farchE', () => facade(3).emissive),
};

const facadeCache = {};
function facade(style) {
  if (facadeCache[style]) return facadeCache[style];
  const BW = 256, BH = 234, NX = 4, NY = 2; // one bay = 3.5 m x 3.2 m
  const W = BW * NX, H = BH * NY;
  const [c, ctx] = canvas(W, H);
  const [ce, cte] = canvas(W, H);
  const r = rng(style * 17);
  ctx.fillStyle = '#f1ede6'; ctx.fillRect(0, 0, W, H);
  cte.fillStyle = '#000'; cte.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 6400, ['#e2ddd3', '#f8f5ef', '#d9d3c8'], 1, 3, r);
  for (let i = 0; i < 40; i++) { // rain streaks / grime
    const x = r() * W, y0 = (r() < 0.5 ? 0 : BH) + BH * 0.35; const g = ctx.createLinearGradient(0, y0, 0, y0 + BH * 0.65);
    g.addColorStop(0, 'rgba(90,85,75,0)'); g.addColorStop(1, 'rgba(90,85,75,0.18)');
    ctx.fillStyle = g; ctx.fillRect(x, y0, 3 + r() * 8, BH * 0.65);
  }
  const warm = ['#ffd28a', '#ffe0a8', '#ffc670', '#fff0c8', '#b8d8ff'];
  for (let by = 0; by < NY; by++) for (let bx = 0; bx < NX; bx++) {
    const ox = bx * BW, oy = by * BH;
    ctx.fillStyle = 'rgba(120,110,95,0.5)'; ctx.fillRect(ox, oy, BW, 6); // floor band
    const wx = ox + 84, wy = oy + 66, ww = 88, wh = 92;
    const path = (cx2) => {
      cx2.beginPath();
      if (style === 3) { cx2.moveTo(wx, wy + wh); cx2.lineTo(wx, wy + 30); cx2.arc(ox + BW / 2, wy + 30, ww / 2, Math.PI, 0); cx2.lineTo(wx + ww, wy + wh); cx2.closePath(); }
      else cx2.rect(wx, wy, ww, wh);
    };
    ctx.fillStyle = '#d8d0c0';
    if (style === 3) { ctx.beginPath(); ctx.moveTo(wx - 8, wy + wh + 6); ctx.lineTo(wx - 8, wy + 30); ctx.arc(ox + BW / 2, wy + 30, ww / 2 + 8, Math.PI, 0); ctx.lineTo(wx + ww + 8, wy + wh + 6); ctx.fill(); }
    else ctx.fillRect(wx - 8, wy - 8, ww + 16, wh + 16);
    ctx.fillStyle = '#2b3236'; path(ctx); ctx.fill();
    const gg = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
    gg.addColorStop(0, 'rgba(160,190,205,0.35)'); gg.addColorStop(0.5, 'rgba(60,80,95,0.1)'); gg.addColorStop(1, 'rgba(160,190,205,0.25)');
    ctx.fillStyle = gg; path(ctx); ctx.fill();
    // lit windows at night (emissive twin)
    if (r() < 0.45) {
      const col = warm[(r() * warm.length) | 0];
      const eg = cte.createRadialGradient(wx + ww / 2, wy + wh / 2, 4, wx + ww / 2, wy + wh / 2, ww * 0.8);
      eg.addColorStop(0, col); eg.addColorStop(1, 'rgba(120,70,20,0.6)');
      cte.fillStyle = eg; path(cte); cte.fill();
    }
    ctx.strokeStyle = 'rgba(30,30,30,0.85)'; ctx.lineWidth = 3; cte.strokeStyle = '#000'; cte.lineWidth = 3;
    for (let x = wx + 14; x < wx + ww; x += 16) for (const k of [ctx, cte]) { k.beginPath(); k.moveTo(x, wy + (style === 3 ? 20 : 0)); k.lineTo(x, wy + wh); k.stroke(); }
    for (const k of [ctx, cte]) { k.beginPath(); k.moveTo(wx, wy + wh / 2); k.lineTo(wx + ww, wy + wh / 2); k.stroke(); }
    ctx.fillStyle = 'rgba(80,72,62,0.55)'; ctx.fillRect(wx - 16, wy - 18, ww + 32, 8); // sunshade
    if (style === 2) { // balcony railing
      ctx.fillStyle = 'rgba(70,70,70,0.9)';
      ctx.fillRect(ox + 10, oy + BH - 60, BW - 20, 5); ctx.fillRect(ox + 10, oy + BH - 18, BW - 20, 6);
      for (let x = ox + 14; x < ox + BW - 10; x += 12) ctx.fillRect(x, oy + BH - 58, 3, 42);
    }
  }
  facadeCache[style] = { map: tex(c), emissive: tex(ce) };
  return facadeCache[style];
}

// Shop ground floor: shutters + glass + a blank sign band (signboards are separate meshes). 1 tile = 4 m x 3.2 m.
export const shopTexture = () => once('shop', () => {
  const W = 256, H = 205;
  const [c, ctx] = canvas(W, H);
  const r = rng(77);
  ctx.fillStyle = '#e9e3d8'; ctx.fillRect(0, 0, W, H);
  // rolling shutter (half open) + shop interior
  ctx.fillStyle = '#2a2420'; ctx.fillRect(16, 60, W - 32, H - 60);
  ctx.fillStyle = '#9aa0a3';
  for (let y = 60; y < 120; y += 6) { ctx.fillRect(16, y, W - 32, 4); }
  // goods on shelves
  // shelves with small goods
  ctx.fillStyle = '#5a4634'; for (const y of [140, 162, 184]) ctx.fillRect(20, y, W - 40, 3);
  for (let i = 0; i < 90; i++) {
    const shelf = [126, 148, 170][(r() * 3) | 0];
    ctx.fillStyle = `hsl(${(r() * 360) | 0},${25 + r() * 25}%,${35 + r() * 25}%)`;
    ctx.fillRect(22 + r() * (W - 50), shelf + r() * 4, 3 + r() * 5, 6 + r() * 8);
  }
  ctx.fillStyle = 'rgba(255,220,150,0.18)'; ctx.fillRect(16, 120, W - 32, H - 120);
  ctx.fillStyle = 'rgba(90,85,75,0.5)'; ctx.fillRect(0, 50, W, 10);
  return tex(c);
});
export const shopEmissive = () => once('shopE', () => {
  const W = 256, H = 205;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 120, 0, H);
  g.addColorStop(0, '#ffe6b0'); g.addColorStop(1, '#b07030');
  ctx.fillStyle = g; ctx.fillRect(16, 120, W - 32, H - 120);
  return tex(c);
});

const SHOPS = [
  ['Kichha Sweets', 'मिठाई', '#b3261e'], ['Royal Bakers', 'बेकरी', '#1d4e89'], ['Al-Noor Medical', 'दवाखाना', '#0b7a3e'],
  ['Gupta Kirana Store', 'किराना', '#d9a400'], ['Sai Mobile Care', 'मोबाइल', '#c2185b'], ['Bismillah Tailors', 'टेलर्स', '#00695c'],
  ['Sharma Electricals', 'इलेक्ट्रिकल', '#283593'], ['Taj Biryani Corner', 'बिरयानी', '#e65100'], ['New Fashion Point', 'फैशन', '#6a1b9a'],
  ['Janta Footwear', 'जूते', '#37474f'], ['Hafiz Dry Fruits', 'मेवे', '#795548'], ['Star Hardware', 'हार्डवेयर', '#455a64'],
  ['Jai Hind Dhaba', 'ढाबा', '#bf360c'], ['Raza Optical', 'चश्मे', '#00838f'], ['Kumar Cloth House', 'कपड़ा', '#ad1457'],
  ['City Pharmacy', 'फार्मेसी', '#2e7d32'], ['Noor Jewellers', 'ज्वैलर्स', '#8d6e00'], ['Pahadi Tea Stall', 'चाय', '#4e342e'],
  ['Shiv Auto Parts', 'ऑटो', '#1565c0'], ['Ansari Steel', 'स्टील', '#546e7a'], ['Bharat Gas Agency', 'गैस', '#d84315'],
  ['Laxmi Bartan Bhandar', 'बर्तन', '#9e9d24'], ['Zam Zam Restaurant', 'रेस्टोरेंट', '#00796b'], ['Tara Book Depot', 'किताबें', '#5d4037'],
  ['Mehtab Gift Centre', 'गिफ्ट', '#c62828'], ['Uttarakhand Cyber Cafe', 'साइबर', '#303f9f'], ['Ramesh Sweet House', 'मिठाई', '#e53935'],
  ['Khan Furniture', 'फर्नीचर', '#6d4c41'], ['Green Valley Dairy', 'डेयरी', '#43a047'], ['Fresh Fruit Corner', 'फल', '#fb8c00'],
  ['Sunrise Studio', 'स्टूडियो', '#3949ab'], ['Kichha Motors', 'मोटर्स', '#212121'],
];
export const SIGN_COLS = 4, SIGN_ROWS = 8;
export const signTexture = () => once('signs', () => {
  const CW = 512, CH = 96;
  const [c, ctx] = canvas(CW * SIGN_COLS, CH * SIGN_ROWS);
  SHOPS.forEach(([en, hi, col], i) => {
    const x = (i % SIGN_COLS) * CW, y = ((i / SIGN_COLS) | 0) * CH;
    ctx.fillStyle = col; ctx.fillRect(x, y, CW, CH);
    const g = ctx.createLinearGradient(0, y, 0, y + CH);
    g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g; ctx.fillRect(x, y, CW, CH);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 4; ctx.strokeRect(x + 6, y + 6, CW - 12, CH - 12);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 40px Poppins, Arial, sans-serif';
    let fs = 40; while (ctx.measureText(en).width > CW - 130 && fs > 20) { fs -= 2; ctx.font = `bold ${fs}px Poppins, Arial, sans-serif`; }
    ctx.fillText(en, x + CW / 2 + 40, y + CH / 2 + 2);
    ctx.font = 'bold 26px sans-serif'; ctx.fillStyle = 'rgba(255,255,230,0.95)';
    ctx.fillText(hi, x + 62, y + CH / 2 + 2);
  });
  const t = tex(c, { repeat: false });
  return t;
});

export const roofTexture = () => once('roof', () => {
  const [c, ctx] = canvas(256, 256);
  const r = rng(31);
  ctx.fillStyle = '#9c968c'; ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, 4000, ['#8a857c', '#aaa59b', '#7c776f', '#b5afa4'], 1, 3, r);
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = `rgba(60,58,52,${0.05 + r() * 0.12})`;
    ctx.beginPath(); ctx.ellipse(r() * 256, r() * 256, 20 + r() * 60, 10 + r() * 40, r() * 3, 0, 7); ctx.fill();
  }
  return tex(c);
});

// Soft radial blob used for fake contact shadows / glows.
export const blobTexture = () => once('blob', () => {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return tex(c, { repeat: false, srgb: false });
});

export const glowTexture = () => once('glow', () => {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,240,200,0.6)'); g.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return tex(c, { repeat: false });
});

// Generic fabric/pattern helpers for decor (drapes etc.)
export function stripeTexture(c1, c2, n = 8) {
  const [c, ctx] = canvas(256, 16);
  for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? c2 : c1; ctx.fillRect((i * 256) / n, 0, 256 / n + 1, 16); }
  return tex(c);
}

export function textTexture(text, { w = 1024, h = 256, font = '600 120px Marcellus, serif', color = '#f8f2e4', bg = null, stroke = null } = {}) {
  const [c, ctx] = canvas(w, h);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 8; ctx.strokeText(text, w / 2, h / 2); }
  ctx.fillStyle = color; ctx.fillText(text, w / 2, h / 2);
  return tex(c, { repeat: false });
}

// ------------------------------------------------------------------ Kichha facade atlas
// One texture holds every wall style as horizontal bands. Each band is ONE floor (3.2 m) tall and
// 4 bays (14 m) wide; walls repeat in u and pick a band in v, so a whole chunk of town can share a
// single material. Painted bands are near-white so per-building vertex colours tint the plaster.
export const ATLAS = { U: 14, BANDS: 8, UPPER: 0, BALCONY: 1, ARCHED: 2, GROUND: 3, SHOP: 4, BRICK: 5, BLANK: 6, SHEET: 7 };
export const facadeAtlas = () => once('atlas', () => {
  const W = 1024, BH = 256, H = BH * ATLAS.BANDS, BW = 256;
  const [c, ctx] = canvas(W, H);
  const [ce, cte] = canvas(W, H);
  const r = rng(2027);
  cte.fillStyle = '#000'; cte.fillRect(0, 0, W, H);
  const warm = ['#ffd28a', '#ffe0a8', '#ffc670', '#fff0c8', '#cfe3ff', '#ffb35c'];

  // weathered plaster: speckle, damp patches, run-off streaks, dirty base
  const plaster = (oy, base = '#f2eee6', dirt = 1) => {
    ctx.fillStyle = base; ctx.fillRect(0, oy, W, BH);
    ctx.save(); ctx.translate(0, oy);
    speckle(ctx, W, BH, 5200, ['#e4dfd5', '#faf8f3', '#d8d1c4', '#ece6db'], 1, 3, r);
    for (let i = 0; i < 14 * dirt; i++) { // damp / repaint patches
      ctx.fillStyle = `rgba(${150 + r() * 40},${140 + r() * 35},${120 + r() * 30},${0.06 + r() * 0.08})`;
      ctx.beginPath(); ctx.ellipse(r() * W, r() * BH, 20 + r() * 70, 10 + r() * 40, r() * 3, 0, 7); ctx.fill();
    }
    for (let i = 0; i < 46 * dirt; i++) { // vertical rain streaks
      const x = r() * W, y0 = r() < 0.6 ? 0 : r() * BH * 0.5, h = BH * (0.3 + r() * 0.7);
      const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
      g.addColorStop(0, `rgba(70,64,55,${0.12 + r() * 0.18})`); g.addColorStop(1, 'rgba(70,64,55,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y0, 2 + r() * 7, h);
    }
    ctx.restore();
  };
  const band = (oy, h = 7) => { ctx.fillStyle = 'rgba(110,100,86,0.45)'; ctx.fillRect(0, oy, W, h); };
  const grill = (k, x, y, w, h, kind) => {
    k.save(); k.beginPath(); k.rect(x, y, w, h); k.clip();
    k.strokeStyle = 'rgba(28,28,30,0.9)'; k.lineWidth = 3;
    if (kind === 0) for (let gx = x + 14; gx < x + w; gx += 14) { k.beginPath(); k.moveTo(gx, y); k.lineTo(gx, y + h); k.stroke(); }
    else if (kind === 1) { // diamond lattice
      for (let gx = x - h; gx < x + w + h; gx += 28) { k.beginPath(); k.moveTo(gx, y); k.lineTo(gx + h, y + h); k.stroke(); k.beginPath(); k.moveTo(gx + h, y); k.lineTo(gx, y + h); k.stroke(); }
    } else { for (let gx = x + 18; gx < x + w; gx += 18) { k.beginPath(); k.moveTo(gx, y); k.lineTo(gx, y + h); k.stroke(); } for (let gy = y + 22; gy < y + h; gy += 22) { k.beginPath(); k.moveTo(x, gy); k.lineTo(x + w, gy); k.stroke(); } }
    k.restore();
    k.strokeStyle = 'rgba(28,28,30,0.9)'; k.lineWidth = 4; k.strokeRect(x, y, w, h);
  };
  // a window with frame, glass/curtain, grill, concrete chhajja (sunshade) and its stain
  const windowAt = (oy, ox, wx, wy, ww, wh, arched = false, lit = 0.45) => {
    const path = (k) => { k.beginPath(); if (arched) { k.moveTo(wx, wy + wh); k.lineTo(wx, wy + ww / 2); k.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0); k.lineTo(wx + ww, wy + wh); k.closePath(); } else k.rect(wx, wy, ww, wh); };
    ctx.fillStyle = 'rgba(205,196,180,0.9)'; ctx.fillRect(wx - 7, wy - 6, ww + 14, wh + 12);
    ctx.fillStyle = '#262b2e'; path(ctx); ctx.fill();
    const curtain = ['#7a3b3b', '#3d5a7a', '#8a7a3a', '#5a7a5a', '#6a4a7a', '#9a6a4a'][(r() * 6) | 0];
    if (r() < 0.55) { ctx.fillStyle = curtain; ctx.globalAlpha = 0.75; ctx.fillRect(wx + 4, wy + 4, ww * (0.3 + r() * 0.5), wh - 8); ctx.globalAlpha = 1; }
    const gg = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
    gg.addColorStop(0, 'rgba(170,195,210,0.35)'); gg.addColorStop(1, 'rgba(60,80,95,0.08)');
    ctx.fillStyle = gg; path(ctx); ctx.fill();
    if (r() < lit) {
      const col = warm[(r() * warm.length) | 0];
      const eg = cte.createRadialGradient(wx + ww / 2, wy + wh / 2, 4, wx + ww / 2, wy + wh / 2, ww * 0.85);
      eg.addColorStop(0, col); eg.addColorStop(1, 'rgba(120,70,20,0.55)');
      cte.fillStyle = eg; path(cte); cte.fill();
    }
    grill(ctx, wx, wy, ww, wh, (r() * 3) | 0);
    // chhajja + the dark stain it leaves
    ctx.fillStyle = 'rgba(95,88,76,0.75)'; ctx.fillRect(wx - 18, wy - 16, ww + 36, 9);
    ctx.fillStyle = 'rgba(60,55,48,0.25)'; ctx.fillRect(wx - 18, wy - 7, ww + 36, 5);
    const sg = ctx.createLinearGradient(0, wy + wh, 0, wy + wh + 40); sg.addColorStop(0, 'rgba(70,64,55,0.28)'); sg.addColorStop(1, 'rgba(70,64,55,0)');
    ctx.fillStyle = sg; ctx.fillRect(wx + 4, wy + wh + 6, ww - 8, 40);
  };

  // 0 UPPER: grilled windows, odd blank bay, AC unit now and then
  let oy = ATLAS.UPPER * BH; plaster(oy); band(oy);
  for (let b = 0; b < 4; b++) {
    const ox = b * BW;
    if (b === 2) { windowAt(oy, ox, ox + 100, oy + 80, 56, 70); continue; } // small bathroom window
    windowAt(oy, ox, ox + 70, oy + 66, 116, 104);
    if (b === 1) { ctx.fillStyle = '#d9d6cf'; ctx.fillRect(ox + 196, oy + 120, 50, 34); ctx.fillStyle = '#9a978f'; for (let i = 0; i < 6; i++) ctx.fillRect(ox + 200, oy + 124 + i * 5, 42, 2); }
  }
  // 1 BALCONY: door + window, railing slab
  oy = ATLAS.BALCONY * BH; plaster(oy); band(oy);
  for (let b = 0; b < 4; b++) {
    const ox = b * BW;
    if (b % 2 === 0) { // balcony door
      ctx.fillStyle = '#5a3d2a'; ctx.fillRect(ox + 86, oy + 60, 84, 180);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(ox + 126, oy + 64, 3, 172);
      if (r() < 0.4) { cte.fillStyle = '#ffcf85'; cte.fillRect(ox + 90, oy + 64, 76, 60); }
    } else windowAt(oy, ox, ox + 70, oy + 66, 116, 100);
    ctx.fillStyle = 'rgba(120,112,98,0.9)'; ctx.fillRect(ox, oy + 236, BW, 14); // slab edge
    ctx.fillStyle = 'rgba(40,40,42,0.9)'; ctx.fillRect(ox + 6, oy + 176, BW - 12, 5);
    for (let x = ox + 10; x < ox + BW - 6; x += 11) ctx.fillRect(x, oy + 178, 3, 58);
    if (r() < 0.5) { ctx.fillStyle = ['#b8423a', '#3a6ab8', '#e0b030', '#3a9a6a'][(r() * 4) | 0]; ctx.globalAlpha = 0.8; ctx.fillRect(ox + 20 + r() * 120, oy + 150, 40 + r() * 40, 30); ctx.globalAlpha = 1; } // laundry
  }
  // 2 ARCHED: older-style arched windows with jaali
  oy = ATLAS.ARCHED * BH; plaster(oy); band(oy);
  for (let b = 0; b < 4; b++) windowAt(oy, b * BW, b * BW + 78, oy + 52, 100, 128, true);
  // 3 GROUND (house): door, grilled window, dirty plinth, meter box
  oy = ATLAS.GROUND * BH; plaster(oy, '#f0ebe2', 1.4);
  for (let b = 0; b < 4; b++) {
    const ox = b * BW;
    if (b === 1) {
      const dc = ['#6b4a32', '#3f5f7a', '#6a6a6a', '#2f5a3e'][(r() * 4) | 0];
      ctx.fillStyle = 'rgba(205,196,180,0.9)'; ctx.fillRect(ox + 72, oy + 54, 112, 202);
      ctx.fillStyle = dc; ctx.fillRect(ox + 80, oy + 62, 96, 194);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3; ctx.strokeRect(ox + 88, oy + 72, 36, 70); ctx.strokeRect(ox + 132, oy + 72, 36, 70); ctx.strokeRect(ox + 88, oy + 156, 36, 80); ctx.strokeRect(ox + 132, oy + 156, 36, 80);
      ctx.fillStyle = 'rgba(95,88,76,0.75)'; ctx.fillRect(ox + 60, oy + 40, 136, 10);
      ctx.fillStyle = '#7a1f1f'; ctx.fillRect(ox + 210, oy + 120, 24, 30); // meter box
    } else windowAt(oy, ox, ox + 74, oy + 78, 108, 96, false, 0.5);
  }
  const plinth = ctx.createLinearGradient(0, oy + BH - 34, 0, oy + BH); plinth.addColorStop(0, 'rgba(90,78,62,0.0)'); plinth.addColorStop(0.3, 'rgba(90,78,62,0.45)'); plinth.addColorStop(1, 'rgba(70,60,48,0.7)');
  ctx.fillStyle = plinth; ctx.fillRect(0, oy + BH - 34, W, 34);
  // 4 SHOP: rolling shutters (open with goods, half or closed), lintel for the signboard
  oy = ATLAS.SHOP * BH; plaster(oy, '#ebe6dc', 1.4);
  ctx.fillStyle = 'rgba(100,92,80,0.55)'; ctx.fillRect(0, oy + 36, W, 12);
  for (let b = 0; b < 4; b++) {
    const ox = b * BW + 10, sw = BW - 20, top = oy + 50;
    const state = r(); const open = state < 0.62 ? 1 : state < 0.82 ? 0.45 : 0;
    // interior
    ctx.fillStyle = '#2a231d'; ctx.fillRect(ox, top, sw, BH - 50);
    ctx.fillStyle = '#5a4634'; for (const y of [top + 80, top + 120, top + 160]) ctx.fillRect(ox + 4, y, sw - 8, 4);
    for (let i = 0; i < 70; i++) { ctx.fillStyle = `hsl(${(r() * 360) | 0},${30 + r() * 40}%,${35 + r() * 30}%)`; ctx.fillRect(ox + 6 + r() * (sw - 16), top + 60 + ((r() * 3) | 0) * 40 + r() * 8, 4 + r() * 8, 8 + r() * 14); }
    ctx.fillStyle = 'rgba(255,225,160,0.16)'; ctx.fillRect(ox, top, sw, BH - 50);
    cte.fillStyle = '#000';
    if (open > 0) { const g = cte.createLinearGradient(0, top, 0, oy + BH); g.addColorStop(0, '#ffe9b8'); g.addColorStop(1, '#a86a2c'); cte.fillStyle = g; cte.fillRect(ox, top + (BH - 50) * (1 - open), sw, (BH - 50) * open); }
    // shutter slats
    const shc = ['#8f969a', '#6f8fa8', '#7d9a7d', '#a3a3a3', '#5d7c99'][(r() * 5) | 0];
    const sh = (BH - 50) * (1 - open);
    ctx.fillStyle = shc; ctx.fillRect(ox, top, sw, sh);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = top; y < top + sh; y += 7) ctx.fillRect(ox, y, sw, 2);
    if (sh > 10) { ctx.fillStyle = 'rgba(40,40,40,0.6)'; ctx.fillRect(ox, top + sh - 6, sw, 6); }
    ctx.fillStyle = 'rgba(60,60,60,0.8)'; ctx.fillRect(ox - 4, top, 4, BH - 50); ctx.fillRect(ox + sw, top, 4, BH - 50);
  }
  // 5 BRICK: exposed red brick (unplastered house / unfinished floor) with plain openings
  oy = ATLAS.BRICK * BH;
  ctx.fillStyle = '#9c5a3c'; ctx.fillRect(0, oy, W, BH);
  for (let y = 0; y < BH; y += 9) for (let x = (y / 9) % 2 ? -14 : 0; x < W; x += 28) {
    const t = r(); ctx.fillStyle = `rgb(${140 + t * 40},${70 + t * 25},${48 + t * 18})`; ctx.fillRect(x + 1, oy + y + 1, 26, 7);
  }
  ctx.fillStyle = 'rgba(200,190,170,0.18)'; for (let y = 0; y < BH; y += 9) ctx.fillRect(0, oy + y, W, 1.5);
  for (let b = 0; b < 4; b++) if (b !== 2) {
    const ox = b * BW; ctx.fillStyle = '#9a9488'; ctx.fillRect(ox + 66, oy + 58, 124, 8); // concrete lintel
    ctx.fillStyle = '#1e1c1a'; ctx.fillRect(ox + 74, oy + 66, 108, 100);
    if (r() < 0.35) { cte.fillStyle = '#ffc878'; cte.fillRect(ox + 74, oy + 66, 108, 100); }
    grill(ctx, ox + 74, oy + 66, 108, 100, 0);
  }
  ctx.fillStyle = 'rgba(120,118,112,0.9)'; ctx.fillRect(0, oy, W, 10); // slab band
  // 6 BLANK: side walls / parapets / stair rooms, with a faded painted wall-ad on one bay
  oy = ATLAS.BLANK * BH; plaster(oy, '#f0ece4', 1.6);
  ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#c0392b'; ctx.fillRect(560, oy + 70, 300, 110);
  ctx.fillStyle = '#f5e6c8'; ctx.font = 'bold 44px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('सीमेंट', 710, oy + 110); ctx.font = 'bold 22px sans-serif'; ctx.fillText('मज़बूत घर के लिए', 710, oy + 152); ctx.restore();
  for (let i = 0; i < 5; i++) { ctx.strokeStyle = 'rgba(70,64,55,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); let x = r() * W, y = oy + r() * BH; ctx.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 30; y += 8 + r() * 12; ctx.lineTo(x, y); } ctx.stroke(); }
  // 7 SHEET: corrugated metal (sheds, godowns)
  oy = ATLAS.SHEET * BH;
  for (let x = 0; x < W; x += 16) { const g = ctx.createLinearGradient(x, 0, x + 16, 0); g.addColorStop(0, '#d8dcdc'); g.addColorStop(0.5, '#f4f6f6'); g.addColorStop(1, '#b8bcbc'); ctx.fillStyle = g; ctx.fillRect(x, oy, 16, BH); }
  for (let i = 0; i < 26; i++) { ctx.fillStyle = `rgba(130,80,40,${0.05 + r() * 0.12})`; ctx.fillRect(r() * W, oy + r() * BH, 10 + r() * 50, 6 + r() * 40); }
  ctx.fillStyle = 'rgba(80,80,80,0.5)'; for (let x = 0; x < W; x += 256) ctx.fillRect(x, oy, 3, BH);

  const map = tex(c), emissive = tex(ce);
  for (const t of [map, emissive]) { t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; }
  return { map, emissive };
});

// Flat-roof concrete, near-white so the satellite-sampled roof colour shows through.
export const roofTextureLight = () => once('roofL', () => {
  const [c, ctx] = canvas(256, 256);
  const r = rng(41);
  ctx.fillStyle = '#e6e2da'; ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, 5000, ['#d6d1c8', '#f2efe9', '#cbc5ba', '#ece8e0'], 1, 3, r);
  for (let i = 0; i < 12; i++) { ctx.fillStyle = `rgba(80,76,68,${0.05 + r() * 0.1})`; ctx.beginPath(); ctx.ellipse(r() * 256, r() * 256, 16 + r() * 50, 8 + r() * 30, r() * 3, 0, 7); ctx.fill(); }
  ctx.strokeStyle = 'rgba(90,86,78,0.18)'; ctx.lineWidth = 2; for (let i = 0; i <= 256; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke(); }
  return tex(c);
});

// Highway median: dusty soil with clumps of grass and oleander-like shrubs. u across, v along (4 m).
export const medianTexture = () => once('median', () => {
  const [c, ctx] = canvas(128, 256);
  const r = rng(61);
  ctx.fillStyle = '#8f7c5e'; ctx.fillRect(0, 0, 128, 256);
  speckle(ctx, 128, 256, 1800, ['#7d6b50', '#a08d6e', '#6f6048'], 1, 3, r);
  for (let i = 0; i < 26; i++) {
    const x = 20 + r() * 88, y = r() * 256, rad = 8 + r() * 18;
    ctx.fillStyle = ['#4f6b33', '#5d7a3a', '#3f5a2a', '#6b8a45'][(r() * 4) | 0];
    ctx.beginPath(); ctx.ellipse(x, y, rad, rad * 1.4, 0, 0, 7); ctx.fill();
    if (r() < 0.3) { ctx.fillStyle = r() < 0.5 ? '#d9568a' : '#f2f0e6'; for (let k = 0; k < 5; k++) ctx.fillRect(x + (r() - 0.5) * rad, y + (r() - 0.5) * rad, 3, 3); }
  }
  ctx.fillStyle = '#d8d2c4'; ctx.fillRect(0, 0, 6, 256); ctx.fillRect(122, 0, 6, 256); // kerb tops
  return tex(c);
});
