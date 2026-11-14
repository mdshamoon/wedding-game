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
  speckle(ctx, w, h, 9000, ['#3d3d3f', '#58585a', '#8a8a88', '#6c6a66', '#2f2f31'], 1, 2.4, r);
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
    asphaltBase(ctx, 256, 512, 68, 3);
    // dusty edges
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(150,130,100,0.55)'); g.addColorStop(0.06, 'rgba(150,130,100,0)');
    g.addColorStop(0.94, 'rgba(150,130,100,0)'); g.addColorStop(1, 'rgba(150,130,100,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 512);
    ctx.fillStyle = 'rgba(235,235,225,0.85)';
    ctx.fillRect(14, 0, 5, 512); ctx.fillRect(237, 0, 5, 512);
    ctx.fillStyle = 'rgba(240,240,230,0.9)';
    ctx.fillRect(125, 0, 6, 190);
    return tex(c);
  }),
  // Town street: worn asphalt, no markings, dusty fade at the edges. 1 repeat = 8 m.
  street: () => once('rstreet', () => {
    const [c, ctx] = canvas(256, 256);
    asphaltBase(ctx, 256, 256, 82, 7);
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
