// Hand-drawn (procedural canvas) avatar portraits for dialogue. No photos.
// spec: { skin, hair, hairStyle, beard, glasses, outfit, outfitTrim, head (dupatta/cap/safa/sehra), jewel, age }
const W = 184, H = 224;

export function drawAvatar(canvas, spec) {
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  // background: ivory paper with soft gold glow
  const bg = c.createRadialGradient(W / 2, 60, 10, W / 2, 90, 170);
  bg.addColorStop(0, '#fdfaf3'); bg.addColorStop(1, '#ead9b6');
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(184,145,43,0.18)'; c.lineWidth = 1;
  for (let y = -20; y < H; y += 28) for (let x = -14; x < W; x += 28) { c.beginPath(); c.arc(x + ((y / 28) % 2 ? 14 : 0), y, 14, 0, Math.PI * 2); c.stroke(); }

  const s = spec;
  const cx = W / 2, headY = 96, hr = 34;
  const skin = s.skin || '#c08a64';
  const shade = darken(skin, 0.14);
  // shoulders / outfit
  c.fillStyle = s.outfit || '#f3ead8';
  c.beginPath(); c.moveTo(cx - 80, H); c.quadraticCurveTo(cx - 76, 156, cx - 30, 150); c.lineTo(cx + 30, 150); c.quadraticCurveTo(cx + 76, 156, cx + 80, H); c.closePath(); c.fill();
  if (s.outfitTrim) { c.strokeStyle = s.outfitTrim; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, 152); c.lineTo(cx, H); c.stroke(); for (let y = 164; y < H; y += 14) { c.fillStyle = s.outfitTrim; c.beginPath(); c.arc(cx, y, 2.2, 0, 7); c.fill(); } }
  if (s.dupatta) { c.fillStyle = s.dupatta; c.beginPath(); c.moveTo(cx - 64, H); c.quadraticCurveTo(cx - 54, 170, cx - 22, 150); c.lineTo(cx - 10, 156); c.quadraticCurveTo(cx - 40, 180, cx - 40, H); c.fill(); c.beginPath(); c.moveTo(cx + 64, H); c.quadraticCurveTo(cx + 54, 170, cx + 22, 150); c.lineTo(cx + 10, 156); c.quadraticCurveTo(cx + 40, 180, cx + 40, H); c.fill(); }
  // neck
  c.fillStyle = shade; c.fillRect(cx - 12, headY + 24, 24, 30);
  // collar
  if (s.collar) { c.fillStyle = s.collar; c.beginPath(); c.moveTo(cx - 20, 148); c.lineTo(cx, 166); c.lineTo(cx + 20, 148); c.lineTo(cx + 14, 142); c.lineTo(cx, 156); c.lineTo(cx - 14, 142); c.fill(); }
  // back hair / head covering behind
  if (s.head === 'dupatta' || s.head === 'bridal') {
    c.fillStyle = s.headColor || '#9e1b32';
    c.beginPath(); c.ellipse(cx, headY + 6, hr + 16, hr + 26, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(cx - hr - 16, headY + 10); c.quadraticCurveTo(cx - 60, 170, cx - 70, H); c.lineTo(cx - 30, H); c.lineTo(cx - 20, headY + 40); c.fill();
    c.beginPath(); c.moveTo(cx + hr + 16, headY + 10); c.quadraticCurveTo(cx + 60, 170, cx + 70, H); c.lineTo(cx + 30, H); c.lineTo(cx + 20, headY + 40); c.fill();
    if (s.headTrim) { c.strokeStyle = s.headTrim; c.lineWidth = 4; c.beginPath(); c.ellipse(cx, headY + 6, hr + 13, hr + 23, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke(); }
  } else if (s.hairStyle === 'long' || s.hairStyle === 'bun') {
    c.fillStyle = s.hair || '#1d1410';
    c.beginPath(); c.ellipse(cx, headY + (s.hairStyle === 'long' ? 18 : 0), hr + 6, hr + (s.hairStyle === 'long' ? 30 : 8), 0, 0, Math.PI * 2); c.fill();
    if (s.hairStyle === 'bun') { c.beginPath(); c.arc(cx, headY - hr - 6, 14, 0, 7); c.fill(); }
  }
  // ears
  c.fillStyle = skin;
  c.beginPath(); c.ellipse(cx - hr + 1, headY + 4, 6, 10, 0, 0, 7); c.fill();
  c.beginPath(); c.ellipse(cx + hr - 1, headY + 4, 6, 10, 0, 0, 7); c.fill();
  // face
  const fg = c.createLinearGradient(cx - hr, 0, cx + hr, 0); fg.addColorStop(0, shade); fg.addColorStop(0.35, skin); fg.addColorStop(1, darken(skin, 0.06));
  c.fillStyle = fg; c.beginPath(); c.ellipse(cx, headY, hr - 3, hr + 4, 0, 0, Math.PI * 2); c.fill();
  if (s.haldi) { c.fillStyle = `rgba(245,190,20,${0.35 * s.haldi})`; c.beginPath(); c.ellipse(cx, headY, hr - 3, hr + 4, 0, 0, Math.PI * 2); c.fill(); }
  // beard
  if (s.beard) {
    c.fillStyle = s.beardColor || '#1d1410';
    c.globalAlpha = s.beard === 'stubble' ? 0.45 : 0.92;
    c.beginPath(); c.moveTo(cx - hr + 4, headY + 2); c.quadraticCurveTo(cx - hr + 4, headY + hr + 8, cx, headY + hr + 12); c.quadraticCurveTo(cx + hr - 4, headY + hr + 8, cx + hr - 4, headY + 2);
    c.quadraticCurveTo(cx + 18, headY + 16, cx, headY + 18); c.quadraticCurveTo(cx - 18, headY + 16, cx - hr + 4, headY + 2); c.fill();
    c.globalAlpha = 1;
    // lips area clear
    c.fillStyle = skin; c.beginPath(); c.ellipse(cx, headY + 22, 9, 4, 0, 0, 7); c.fill();
    // moustache
    c.fillStyle = s.beardColor || '#1d1410';
    c.beginPath(); c.moveTo(cx - 14, headY + 19); c.quadraticCurveTo(cx, headY + 12, cx + 14, headY + 19); c.quadraticCurveTo(cx, headY + 16, cx - 14, headY + 19); c.fill();
  }
  // hair (front)
  if (s.head !== 'dupatta' && s.head !== 'bridal' && s.head !== 'safa' && s.head !== 'sehra' && s.head !== 'cap') {
    c.fillStyle = s.hair || '#1d1410';
    if (s.hairStyle === 'short' || !s.hairStyle) {
      c.beginPath(); c.moveTo(cx - hr + 1, headY - 2); c.quadraticCurveTo(cx - hr - 2, headY - hr - 10, cx - 4, headY - hr - 12); c.quadraticCurveTo(cx + hr + 4, headY - hr - 10, cx + hr - 1, headY - 2);
      c.quadraticCurveTo(cx + hr - 8, headY - hr + 6, cx + 6, headY - hr + 2); c.quadraticCurveTo(cx - 14, headY - hr + 8, cx - hr + 1, headY - 2); c.fill();
    } else if (s.hairStyle === 'grey') {
      c.fillStyle = '#b9b4ac'; c.beginPath(); c.ellipse(cx, headY - hr + 4, hr - 2, 12, 0, Math.PI, 0); c.fill();
    } else {
      c.beginPath(); c.ellipse(cx, headY - hr + 6, hr, 16, 0, Math.PI, 0); c.fill();
      c.beginPath(); c.moveTo(cx - 2, headY - hr - 6); c.lineTo(cx + 2, headY - hr - 6); c.lineTo(cx, headY - hr + 10); c.fill();
    }
  }
  // head coverings
  if (s.head === 'cap') { c.fillStyle = '#f7f4ec'; c.beginPath(); c.ellipse(cx, headY - hr + 6, hr - 1, 15, 0, Math.PI, 0); c.fill(); c.strokeStyle = '#d9d2c2'; c.lineWidth = 1; for (let i = -3; i <= 3; i++) { c.beginPath(); c.arc(cx + i * 8, headY - hr - 1, 2, 0, 7); c.stroke(); } }
  if (s.head === 'safa' || s.head === 'sehra') {
    c.fillStyle = s.headColor || '#f1d9c8';
    c.beginPath(); c.ellipse(cx, headY - hr + 2, hr + 6, 24, 0, Math.PI, 0); c.fill();
    c.beginPath(); c.ellipse(cx, headY - hr + 2, hr + 6, 8, 0, 0, Math.PI); c.fill();
    c.strokeStyle = '#c9a24a'; c.lineWidth = 2;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(cx, headY - hr + 2 - i * 5, hr + 5 - i, 8, -0.15 + i * 0.1, Math.PI, 0); c.stroke(); }
    // kalgi brooch
    c.fillStyle = '#d4af37'; c.beginPath(); c.arc(cx, headY - hr - 8, 6, 0, 7); c.fill(); c.fillStyle = '#9e1b32'; c.beginPath(); c.arc(cx, headY - hr - 8, 3, 0, 7); c.fill();
    c.strokeStyle = '#f7f0e1'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, headY - hr - 12); c.quadraticCurveTo(cx + 12, headY - hr - 36, cx + 4, headY - hr - 44); c.stroke();
  }
  // eyes, brows, nose, mouth
  const eyeY = headY - 2;
  if (s.head !== 'sehra') {
    c.fillStyle = '#fff'; for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(cx + sx * 12, eyeY, 6.5, 3.6, 0, 0, 7); c.fill(); }
    c.fillStyle = '#2b1a10'; for (const sx of [-1, 1]) { c.beginPath(); c.arc(cx + sx * 12, eyeY, 2.8, 0, 7); c.fill(); }
    if (s.kajal) { c.strokeStyle = '#1a1010'; c.lineWidth = 1.6; for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(cx + sx * 12, eyeY, 7, 3.8, 0, 0, 7); c.stroke(); } }
    c.strokeStyle = s.hair === '#b9b4ac' ? '#8d877c' : '#24180f'; c.lineWidth = 2.6; c.lineCap = 'round';
    for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(cx + sx * 6, eyeY - 9); c.quadraticCurveTo(cx + sx * 12, eyeY - 12, cx + sx * 19, eyeY - 8); c.stroke(); }
    c.strokeStyle = darken(skin, 0.3); c.lineWidth = 1.6; c.beginPath(); c.moveTo(cx - 1, eyeY + 4); c.quadraticCurveTo(cx - 5, eyeY + 14, cx + 2, eyeY + 15); c.stroke();
    c.strokeStyle = s.lips || '#8a3b33'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(cx - 8, headY + 22); c.quadraticCurveTo(cx, headY + 27, cx + 8, headY + 22); c.stroke();
    if (s.glasses) {
      c.strokeStyle = '#111'; c.lineWidth = 3.4;
      for (const sx of [-1, 1]) { roundRect(c, cx + sx * 12 - 11, eyeY - 8, 22, 15, 4); c.stroke(); }
      c.beginPath(); c.moveTo(cx - 1, eyeY - 2); c.lineTo(cx + 1, eyeY - 2); c.stroke();
      c.beginPath(); c.moveTo(cx - 23, eyeY - 3); c.lineTo(cx - hr + 1, eyeY - 4); c.moveTo(cx + 23, eyeY - 3); c.lineTo(cx + hr - 1, eyeY - 4); c.stroke();
    }
  }
  // jewellery
  if (s.jewel === 'bridal') {
    c.fillStyle = '#d4af37';
    c.beginPath(); c.moveTo(cx, headY - hr - 4); c.lineTo(cx, headY - hr + 10); c.lineWidth = 1.5; c.strokeStyle = '#d4af37'; c.stroke();
    c.beginPath(); c.arc(cx, headY - hr + 14, 5, 0, 7); c.fill(); // maang tikka
    for (const sx of [-1, 1]) { c.beginPath(); c.arc(cx + sx * (hr - 1), headY + 18, 4.5, 0, 7); c.fill(); }
    c.beginPath(); c.ellipse(cx, 156, 26, 9, 0, 0, Math.PI); c.lineWidth = 5; c.stroke();
  } else if (s.jewel === 'earrings') {
    c.fillStyle = '#d4af37'; for (const sx of [-1, 1]) { c.beginPath(); c.arc(cx + sx * (hr - 1), headY + 16, 3, 0, 7); c.fill(); }
  }
  if (s.garland) { for (let i = 0; i < 22; i++) { const a = Math.PI * (0.08 + 0.84 * (i / 21)); c.fillStyle = i % 2 ? '#ffffff' : '#e9b8b5'; c.beginPath(); c.arc(cx + Math.cos(a) * 46, 142 + Math.sin(a) * 40, 6, 0, 7); c.fill(); } }
  // sehra strands over the face
  if (s.head === 'sehra') {
    for (let x = cx - hr - 4; x <= cx + hr + 4; x += 6) {
      for (let y = headY - hr + 10; y < headY + hr + 30; y += 7) { c.fillStyle = (Math.floor(y / 7) + Math.floor(x / 6)) % 3 ? '#ffffff' : '#f7e3b0'; c.beginPath(); c.arc(x, y, 2.6, 0, 7); c.fill(); }
    }
  }
  // gold frame
  c.strokeStyle = 'rgba(184,145,43,0.7)'; c.lineWidth = 2; c.strokeRect(4, 4, W - 8, H - 8);
  return canvas;
}

function darken(hex, k) {
  const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.round(v * (1 - k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
