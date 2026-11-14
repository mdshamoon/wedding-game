// Original compositions, written in sargam and compiled into per-step event lists.
//
// Sargam: S r R g G m M P d D n N  (lowercase = komal / lower variant; m = shuddha Ma, M = tivra Ma)
//   suffix '  -> upper octave, suffix , -> lower octave, prefix ~ -> meend (slide from previous note)
//   suffix !  -> accent, suffix < -> soft;  '-' holds the previous note, '_' or '.' is a rest.
// Drum strings use bols (see BOL) one token per `unit` steps.
// Every bar string must fill exactly one bar; the builder warns otherwise.

const DEG = { S: 0, r: 1, R: 2, g: 3, G: 4, m: 5, M: 6, P: 7, d: 8, D: 9, n: 10, N: 11 }
const BIL = [0, 2, 4, 5, 7, 9, 11]
const L1 = 0.35, L2 = 0.7

// bol -> [[drum, velocity, offset-in-unit]]
const BOL = {
  // dhol
  D: [['dagga', 1]], d: [['dagga', 0.6]], T: [['tilli', 1]], t: [['tilli', 0.55]],
  X: [['dagga', 1], ['tilli', 0.9]], x: [['dagga', 0.6], ['tilli', 0.5]],
  r: [['tilli', 0.55, 0], ['tilli', 0.42, 0.5]],
  // tabla / dholak
  dha: [['ge', 0.9], ['na', 0.75]], dhin: [['ge', 0.9], ['tin', 0.7]], ge: [['ge', 0.85]], gh: [['ge', 0.5]],
  na: [['na', 0.75]], ta: [['ta', 0.8]], ti: [['ta', 0.6]], tin: [['tin', 0.7]], ka: [['ka', 0.7]],
  tete: [['ta', 0.5, 0], ['ta', 0.42, 0.5]],
  // hands, metal, shakers
  C: [['clap', 1]], c: [['clap', 0.55]], M: [['manjira', 0.9]], m: [['manjiraC', 0.7]],
  J: [['ghungroo', 0.9]], j: [['ghungroo', 0.5]], s: [['shaker', 0.6]], S: [['shaker', 1]], K: [['kick', 1]],
}

function parseNote(tok) {
  let i = 0, slide = false, acc = 1
  if (tok[0] === '~') { slide = true; i = 1 }
  const c = tok[i]
  if (!(c in DEG)) return null
  let deg = DEG[c]
  for (let j = i + 1; j < tok.length; j++) {
    const ch = tok[j]
    if (ch === "'") deg += 12
    else if (ch === ',') deg -= 12
    else if (ch === '!') acc = 1.15
    else if (ch === '<') acc = 0.6
  }
  return { deg, slide, acc }
}

function diatonic(deg, scale, steps) {
  const oct = Math.floor(deg / 12), pc = ((deg % 12) + 12) % 12
  let idx = scale.indexOf(pc)
  if (idx < 0) idx = Math.max(0, scale.findIndex((x) => x > pc) - 1)
  const j = idx + steps
  const o = oct + Math.floor(j / scale.length)
  return o * 12 + scale[((j % scale.length) + scale.length) % scale.length]
}

class Builder {
  constructor(def, name) {
    this.def = def; this.name = name; this.ev = []
    this.spb = def.spb; this.spBar = def.spb * 4
  }
  pos(bar, beat = 0) { return bar * this.spBar + Math.round(beat * this.spb) }
  sa(o) { return (o.sa ?? this.def.sa) + 12 * (o.oct || 0) }
  note(i, s, m, d, v = 0.7, L = 0) { this.ev.push({ s, i, m, d, v, L }) }
  toks(str, unit, where) {
    const t = str.trim().split(/\s+/).filter((x) => x && x !== '|')
    if (t.length * unit !== this.spBar && typeof console !== 'undefined') console.warn(`[audio] ${this.name} ${where}: "${str}" fills ${t.length * unit}/${this.spBar} steps`)
    return t
  }
  mel(i, bar, str, o = {}) {
    if (!str) return
    const unit = o.unit ?? this.spb / 2
    const base = this.pos(bar, o.beat || 0), sa = this.sa(o)
    let cur = null, curH = null
    this.toks(str, unit, `${i} bar ${bar}`).forEach((tok, k) => {
      const s = base + k * unit
      if (tok === '-') { if (cur) cur.d += unit; if (curH) curH.d += unit; return }
      cur = curH = null
      if (tok === '_' || tok === '.') return
      const p = parseNote(tok)
      if (!p) return
      cur = { s, i, m: sa + p.deg, d: unit, v: (o.vel ?? 0.75) * p.acc, L: o.L || 0, sl: p.slide }
      this.ev.push(cur)
      if (o.harm) {
        const h = o.harm
        curH = { s, i: h.i || i, m: sa + diatonic(p.deg, h.scale || BIL, h.steps ?? -2), d: unit, v: cur.v * (h.vel ?? 0.8), L: h.L ?? cur.L }
        this.ev.push(curH)
      }
    })
  }
  bars(i, start, arr, o) { arr.forEach((str, k) => this.mel(i, start + k, str, o)) }
  drum(bar, str, o = {}) {
    const unit = o.unit ?? 1, base = this.pos(bar)
    this.toks(str, unit, `drum bar ${bar}`).forEach((tok, k) => {
      const hits = BOL[tok.replace(/[!<]$/, '')]
      if (!hits) return
      const acc = tok.endsWith('!') ? 1.2 : tok.endsWith('<') ? 0.55 : 1
      for (const [name, vm, off = 0] of hits) {
        const so = off * unit
        this.ev.push({ s: base + k * unit + Math.floor(so), o: so - Math.floor(so), i: name, d: 1, v: (o.vel ?? 0.8) * vm * acc, L: o.L || 0 })
      }
    })
  }
  chord(i, bar, beat, degs, beats, o = {}) {
    const sa = this.sa(o)
    for (const dg of degs) this.note(i, this.pos(bar, beat), sa + dg, Math.round(beats * this.spb), o.vel ?? 0.5, o.L || 0)
  }
  // arpeggio over chord degrees; pattern indices extend by octaves (negative = below)
  arp(i, bar, degs, pat, o = {}) {
    const unit = o.unit ?? this.spb / 2, base = this.pos(bar, o.beat || 0), sa = this.sa(o), n = degs.length
    pat.forEach((ix, k) => {
      if (ix == null) return
      const deg = degs[((ix % n) + n) % n] + 12 * Math.floor(ix / n)
      this.note(i, base + k * unit, sa + deg, Math.round((o.len ?? 1) * unit), (o.vel ?? 0.45) * (k === 0 ? 1.1 : 1), o.L || 0)
    })
  }
  drone(bar, degs, o = {}) {
    const sa = this.sa(o)
    degs.forEach((dg, k) => dg != null && this.note('tanpura', this.pos(bar, k), sa + dg, Math.round((o.len ?? 6) * this.spb), o.vel ?? 0.5, 0))
  }
}

// ------------------------------------------------------------------ shared material
const TITLE_A = [ // Yaman
  '_ _ N, R G - M G',
  'R - ~G R S - - -',
  '_ _ G M D - N D',
  'P - M G ~R - - -',
  "_ _ M D N - S' -",
  "R' S' N D P - M G",
  'M D N D P M G R',
  'G - R - S - - -',
]
const TITLE_B = [
  '_ _ N, R G - M G',
  'R G M G ~R - S -',
  '_ _ G M D - N D',
  'P M G M ~G R - -',
  "_ _ N R' G' - R' S'",
  'N - D P ~M - G -',
  "R G M D N - ~S' -",
  'N D P M G R S -',
]
// Yaman progression (relative to Sa, used one octave down): I I II V vi V II I
const YC = { I: [0, 4, 7, 12], II: [2, 6, 9, 14], V: [-5, -1, 2, 7], vi: [-3, 0, 4, 9] }
const YAMAN_PROG = ['I', 'I', 'II', 'V', 'vi', 'V', 'II', 'I'].map((k) => YC[k])
const YAMAN_ROOT = [0, 0, 2, -5, -3, -5, 2, 0]

const TABLA_A = 'dha . ge . na . tin . na . ka . dhin . na .'
const TABLA_B = 'dha . ge na na . tin . na . ka . dhin . na gh'
const TABLA_FILL = 'dha . ge na tin . tete tete dha . ge na dhin . na .'

export const TRACKS = {
  // Sufi-romantic, elegant: harmonium lead in Yaman, tanpura, soft chorus pad, gentle tabla, clean bass.
  title: {
    bpm: 80, spb: 4, bars: 8, sa: 62, passes: 2, gain: 1.7, delayBeats: 0.75,
    build(b, p) {
      for (let bar = 0; bar < 8; bar++) {
        b.drone(bar, [-5, 0, 0, -12], { oct: -1, vel: 0.42 })
        b.chord('choir', bar, 0, YAMAN_PROG[bar], 4, { oct: -1, vel: p ? 0.24 : 0.16 })
        if (p || bar >= 2) {
          b.drum(bar, bar === 7 ? TABLA_FILL : bar % 2 ? TABLA_B : TABLA_A, { vel: 0.38 })
          b.note('bass', b.pos(bar, 0), b.def.sa - 24 + YAMAN_ROOT[bar], 8, 0.42)
          b.note('bass', b.pos(bar, 2.5), b.def.sa - 24 + YAMAN_ROOT[bar], 4, 0.3)
        }
        if (p) b.drum(bar, '. . . . c . . . . . . . c . c< .', { vel: 0.5 })
        if (p && bar % 4 < 2) b.arp('rubab', bar, YAMAN_PROG[bar].slice(0, 3), [0, null, 2, null, 3, null, 2, null], { vel: 0.32 })
      }
      b.bars('harmlead', 0, p ? TITLE_B : TITLE_A, { vel: 0.85 })
    },
  },

  // Dialogue: soft harmonium pad + bansuri, light rubab on the second pass.
  story: {
    bpm: 70, spb: 4, bars: 8, sa: 60, passes: 2, gain: 1.1,
    build(b, p) {
      const C = { I: [[0, 4, 7], 0], IV: [[0, 5, 9], 5], V: [[-1, 2, 7], 7], vi: [[0, 4, 9], 9] }
      const prog = ['I', 'IV', 'I', 'V', 'vi', 'IV', 'V', 'I']
      prog.forEach((k, bar) => {
        const [v, r] = C[k]
        b.chord('harmonium', bar, 0, v, 4, { oct: -1, vel: 0.36 })
        b.note('harmonium', b.pos(bar), b.def.sa - 24 + r + 12, 16, 0.22)
        b.note('bass', b.pos(bar), b.def.sa - 24 + r, 12, 0.35)
        if (p) b.arp('rubab', bar, v, [0, null, 1, 2, null, 3, null, null], { vel: 0.26, oct: 0 })
      })
      b.bars('flute', 0, p ? [
        '_ _ _ _ P - D -', "S' - D P G - - -", "_ _ G P D - S' D", 'P - - - _ _ _ _',
        "_ _ S' - R' - S' D", "P - D - S' - - -", 'D - P G R - G -', 'S - - - - - _ _',
      ] : [
        '_ _ _ _ G - P -', 'D - P G R - - -', '_ _ S R G - P G', 'R - - - _ _ _ _',
        "_ _ D - S' - D P", 'G - P - D - - -', 'P - G R G - R -', 'S - - - - - _ _',
      ], { vel: 0.7 })
    },
  },

  // Upbeat road groove (100 bpm). Intensity adds tilli/claps/hook, then flute + shaker + kick.
  drive: {
    bpm: 100, spb: 4, bars: 16, sa: 64, passes: 2, intensity: 0.45, delayBeats: 0.75,
    build(b, p) {
      const CH = { I: [0, 4, 7, 12], bVII: [-2, 2, 5, 10], IV: [0, 5, 9, 12] }
      const BASS = { I: "S _ S' S _ S S' _", bVII: 'n, _ n n, _ n, n _', IV: "m _ m' m _ m m' _" }
      const prog = ['I', 'I', 'bVII', 'IV']
      for (let bar = 0; bar < 16; bar++) {
        const k = prog[bar % 4]
        b.chord('harmonium', bar, 0, CH[k], 4, { oct: -1, vel: 0.26 })
        b.mel('bass', bar, BASS[k], { oct: -2, vel: 0.72 })
        b.drum(bar, bar % 4 === 0 ? 'X . . . D . . . D . . . D . . .' : 'D . . . D . . . D . . . D . . .', { vel: 0.72 })
        b.drum(bar, '. . s . . . s . . . s . . . s .', { vel: 0.45 })
        b.drum(bar, bar % 4 === 3 ? '. . . T . . . T . . T T . T T r' : '. . . T . . . T . . . T . . . T', { vel: 0.62, L: L1 })
        b.drum(bar, '. . . . C . . . . . . . C . . .', { vel: 0.62, L: L1 })
        b.drum(bar, 's s . s s s . s s s . s s s . s', { vel: 0.3, L: L2 })
        b.drum(bar, '. t . . . t . . . t . . . t . .', { vel: 0.45, L: L2 })
        b.drum(bar, 'K . . . . . . . K . . . . . . .', { vel: 0.6, L: L2 })
        b.mel('flute', bar, ["G' - - - - - R' S'", "R' - - - S' - - -", "R' - - - n - m -", "S' - - - D - - -"][bar % 4], { vel: 0.5, L: L2 })
      }
      const A = ["P P S' P G - P -", "S' - n P G R S -", "m m n m R - m -", "D - S' D m G R G"]
      const AEND = "D - S' D ~S' - - -"
      const B = ["S' S' G' S' P - S' -", "R' S' n S' P G P -", "n n R' n m - n -", "S' - D m G R S -"]
      const plan = p ? [B, A, B, A] : [A, A, B, A]
      plan.forEach((ph, q) => ph.forEach((str, k) => {
        const last = k === 3 && (q === 1 || q === 3)
        b.mel('tumbi', q * 4 + k, last ? AEND : str, { vel: 0.85, L: L1 })
      }))
    },
  },

  // Playful folk: dholak, claps, ghungroo, bansuri; santoor answers.
  haldi: {
    bpm: 112, spb: 4, bars: 16, sa: 67, passes: 2,
    build(b, p) {
      const C = { I: [[0, 4, 7], 0], IV: [[0, 5, 9], 5], V: [[-1, 2, 7], -5], vi: [[-3, 0, 4], -3] }
      const prog = ['I', 'vi', 'I', 'V', 'I', 'I', 'vi', 'V', 'vi', 'V', 'IV', 'V', 'I', 'IV', 'vi', 'I']
      const DA = 'dha . . na ge . na . dha . . na ge na ti na'
      const DB = 'dha . ge na ge . na . dha . . na ge . dha .'
      const DF = 'dha . tete tete dha . tete tete dha ge na ge dha . . .'
      prog.forEach((k, bar) => {
        const [v, r] = C[k]
        b.chord('harmonium', bar, 0, v, 1.5, { oct: -1, vel: 0.3 })
        b.chord('harmonium', bar, 2, v, 1.5, { oct: -1, vel: 0.26 })
        b.note('bass', b.pos(bar, 0), b.def.sa - 24 + r, 4, 0.5)
        b.note('bass', b.pos(bar, 2), b.def.sa - 24 + r, 4, 0.4)
        b.drum(bar, bar % 8 === 7 ? DF : bar % 2 ? DB : DA, { vel: 0.72 })
        b.drum(bar, 'c . . . C . . . c . . . C . . .', { vel: 0.55 })
        b.drum(bar, 'j . J . j . J . j . J . j . J .', { vel: 0.5 })
      })
      const A = ['G - G P G R S -', 'R - R G R S D, -', 'S - S R G P D P', 'G - R - S - - -',
        'P - P D P G R G', "P - D S' D P G -", 'G P D P G R S R', 'G - R - S - _ _']
      const B = ["D - S' - D P G P", 'D - - - P G R G', "P - D - S' R' S' D", 'P - - - _ _ _ _',
        "S' - D P G - P D", "S' - R' S' D - P -", "G P D S' D P G R", 'S - - - - - _ _']
      if (p) b.bars('santoor', 0, A, { vel: 0.62 })
      else b.bars('flute', 0, A, { vel: 0.72 })
      b.bars('flute', 8, B, { vel: 0.72 })
      b.mel('santoor', 11, "_ _ _ _ G P D S'", { vel: 0.5 })
      b.mel('santoor', 15, "_ _ _ _ _ _ G' R'", { vel: 0.45 })
      if (p) { b.mel('flute', 3, '_ _ _ _ _ _ D -', { vel: 0.4 }); b.mel('flute', 7, '_ _ _ _ _ _ P -', { vel: 0.4 }) }
    },
  },

  // Emotional: shehnai over harmonium and tanpura, Kafi/Bhairavi colour.
  sehra: {
    bpm: 76, spb: 4, bars: 8, sa: 61, passes: 2, gain: 1.5,
    build(b, p) {
      const C = { i: [[0, 3, 7], 0], iv: [[0, 5, 8], 5], VII: [[-2, 2, 5], -2], VI: [[-4, 0, 3], -4] }
      const prog = p ? ['i', 'i', 'VII', 'iv', 'i', 'i', 'VII', 'i'] : ['i', 'i', 'VII', 'iv', 'VI', 'i', 'VII', 'i']
      prog.forEach((k, bar) => {
        const [v, r] = C[k]
        b.drone(bar, [-5, 0, 0, -12], { oct: -1, vel: 0.45 })
        if (p || bar >= 2) {
          b.chord('harmonium', bar, 0, v, 4, { oct: -1, vel: 0.42 })
          b.note('harmonium', b.pos(bar), b.def.sa - 24 + r + 12, 16, 0.24)
          b.drum(bar, 'ge . . . . . gh . na . . . . . . .', { vel: 0.4 })
        }
        if (p && bar >= 4) b.chord('choir', bar, 0, v, 4, { oct: 0, vel: 0.14 })
      })
      b.bars('shehnai', 0, p ? [
        '_ _ S R ~g - m g', 'R - ~g R S - - -', '_ _ n, S R g m P', '~d - P - m g R -',
        "_ _ S' R' ~g' - R' S'", 'n d P d ~m - g -', 'R g m P g - R S', 'n, - ~S - - - - -',
      ] : [
        '_ _ S R ~g - - -', 'm g R - S - - -', '_ _ n, S R g m P', '~d - P - m g R -',
        "_ _ P d n - ~S' -", 'n d P - m - g -', 'R g m P g - R S', 'n, - S - - - - -',
      ], { vel: 0.74 })
    },
  },

  // Band-baaja + heavy dhol, exactly 120 bpm, dagga on every beat (downbeats always clear).
  baraat: {
    bpm: 120, spb: 4, bars: 16, sa: 58, passes: 2, gain: 0.9, intensity: 0.55, delayBeats: 0.75,
    build(b, p) {
      const prog = ['I', 'I', 'IV', 'V', 'I', 'I', 'IVV', 'I', 'IV', 'I', 'IV', 'V', 'I', 'IV', 'V', 'I']
      const STAB = { I: [4, 7, 12], IV: [5, 9, 12], V: [7, 11, 14] }
      const TUBA = { I: 'S _ P, _', IV: 'm _ S _', V: 'P, _ R _', IVV: 'm _ P, _' }
      const DH = 'X . . t D . . t D . . t D . . t'
      const FILL = 'X . . t D . t t D t T t D T r r'
      const HALF = 'X . . t D . . t D . . t D t T t'
      prog.forEach((k, bar) => {
        b.mel('tuba', bar, TUBA[k], { oct: -1, vel: 0.8, unit: 4 })
        const fill = bar % 8 === 7 ? FILL : p && bar % 8 === 3 ? HALF : DH
        b.drum(bar, fill, { vel: 0.86 })
        if (bar % 4 === 0) b.drum(bar, 'M . . . . . . . . . . . . . . .', { vel: 0.7 })
        b.drum(bar, '. . t . . . t . . . t . . . t .', { vel: 0.45, L: L1 })
        b.drum(bar, '. . . . C . . . . . . . C . . .', { vel: 0.7, L: L1 })
        const st = STAB[k === 'IVV' ? 'IV' : k], st2 = STAB[k === 'IVV' ? 'V' : k]
        b.chord('brass', bar, 1, st, 0.25, { vel: 0.42, L: L1 })
        b.chord('brass', bar, 3, st2, 0.25, { vel: 0.42, L: L1 })
        b.drum(bar, '. . M . . . m . . . M . . . m .', { vel: 0.5, L: L2 })
        b.drum(bar, 'K . . . K . . . K . . . K . . .', { vel: 0.65, L: L2 })
      })
      const A = ["S' - S' - R' S' N S'", "G' - - R' S' - P -", 'm - m - P m G m', "R' - - S' N - P -",
        "S' - S' - R' S' N S'", "G' - - R' G' - P' -", "G' R' S' D N - R' -", p ? "S' - - - _ P D N" : "S' - - - _ _ _ _"]
      const B = ["D - D S' D P m -", 'P - - G S - G P', "D - D S' R' S' D -", "P - - - N - R' -",
        "S' R' G' R' S' N D P", "m - D - S' - D -", "P N R' N P - N R'", p ? "S' - - - _ P N R'" : "S' - - - _ _ _ _"]
      const harm = { scale: BIL, steps: -2, vel: 0.75, L: L1 }
      b.bars('brass', 0, A, { vel: 0.78, harm })
      b.bars('brass', 8, B, { vel: 0.78, harm })
      b.bars('brass', 0, A, { vel: 0.28, oct: 1, L: L2 })
      b.bars('brass', 8, B, { vel: 0.28, oct: 1, L: L2 })
    },
  },

  // Nikah: serene and graceful. Rubab/santoor plucks, soft pad, gentle tabla (Bhupali colour).
  nikah: {
    bpm: 66, spb: 4, bars: 8, sa: 64, passes: 2, gain: 1.5, delayBeats: 1,
    build(b, p) {
      const C = { I: [[0, 4, 7], 0], vi: [[-3, 0, 4], -3], IV: [[0, 5, 9], 5], ii: [[2, 5, 9], 2], V: [[-5, -1, 2], -5] }
      const prog = ['I', 'vi', 'IV', 'I', 'ii', 'IV', 'V', 'I']
      prog.forEach((k, bar) => {
        const [v, r] = C[k]
        b.chord('strings', bar, 0, v, 4, { oct: -1, vel: 0.24 })
        b.chord('choir', bar, 0, v, 4, { oct: 0, vel: p ? 0.14 : 0.1 })
        b.note('bass', b.pos(bar), b.def.sa - 24 + r, 12, 0.3)
        if (p || bar >= 2) b.drum(bar, bar === 7 ? 'dha ge na tin tete ka dhin na' : 'dha ge na tin na ka dhin na', { vel: 0.26, unit: 2 })
        if (!p) b.arp('santoor', bar, v, [0, 1, 2, 3, 4, 3, 2, 1], { vel: 0.26, oct: 0 })
        else b.arp('rubab', bar, v, [-3, null, null, null, -1, null, null, null], { vel: 0.4, oct: 0, len: 4 })
      })
      if (!p) b.bars('rubab', 0, [
        'G - - R G - P -', 'D - - P G - R -', "D - - S' D - P -", 'G - - - - - _ _',
        'R - - G P - R -', "D - - P D - S' -", "R' - - S' D - P -", "S' - - - - - _ _",
      ], { vel: 0.72 })
      else b.bars('santoor', 0, [
        'P - G R G - P D', "S' - D P G - - -", "D - S' R' S' - D -", 'P - - - G - - -',
        'R - G P D - P -', "S' - D - P - D -", "R' - - - D - R' -", "S' - - - - - _ _",
      ], { vel: 0.62 })
    },
  },

  // Romantic piano + strings with a gentle melody (Yaman touch over V).
  reception: {
    bpm: 84, spb: 4, bars: 8, sa: 65, passes: 2, gain: 1.35,
    build(b, p) {
      const C = { I: [0, 4, 7], iii: [4, 7, 11], IV: [5, 9, 12], vi: [-3, 0, 4], V: [-5, -1, 2] }
      const prog = ['I', 'iii', 'IV', 'I', 'vi', 'IV', 'V', 'I']
      prog.forEach((k, bar) => {
        b.arp('piano', bar, C[k], [-3, -1, 0, 1, 2, 1, 0, -1], { oct: -1, vel: 0.34, len: 3 })
        b.chord('strings', bar, 0, C[k], 4, { oct: -1, vel: 0.22 })
        if (p) b.chord('choir', bar, 0, C[k], 4, { oct: 0, vel: 0.1 })
      })
      if (p) b.bars('flute', 0, [
        "_ _ G P D - S' -", 'G - P - D - P -', "S' - - R' S' - D -", 'P - - - G - P -',
        "R' - - S' D - S' -", 'D - - - P - D -', "R' - - - M - R' -", "S' - - - - - _ _",
      ], { vel: 0.62 })
      else b.bars('piano', 0, [
        '_ _ G P D - P -', 'G - - - R G P -', "D - - S' D - P -", 'G - - - - - _ _',
        "_ _ D S' R' - S' -", 'D - - P m P D -', 'P - M G R - G R', 'S - - - - - _ _',
      ], { vel: 0.55, len: 2 })
    },
  },

  // Reprise of the title melody, slower and softer.
  ending: {
    bpm: 72, spb: 4, bars: 8, sa: 62, passes: 2, gain: 1.15, delayBeats: 1,
    build(b, p) {
      for (let bar = 0; bar < 8; bar++) {
        b.drone(bar, [-5, 0, 0, -12], { oct: -1, vel: 0.34 })
        b.chord('strings', bar, 0, YAMAN_PROG[bar], 4, { oct: -1, vel: 0.24 })
        b.chord('choir', bar, 0, YAMAN_PROG[bar].slice(0, 3), 4, { oct: 0, vel: 0.1 })
        b.note('bass', b.pos(bar), b.def.sa - 24 + YAMAN_ROOT[bar], 14, 0.35)
        if (p) b.arp('santoor', bar, YAMAN_PROG[bar].slice(0, 3), [0, 1, 2, 3, null, null, null, null], { vel: 0.24 })
      }
      if (p) b.bars('harmlead', 0, TITLE_B, { vel: 0.6 })
      else b.bars('flute', 0, TITLE_A, { vel: 0.7 })
    },
  },

  // Light road-trip tune for the animated map.
  map: {
    bpm: 96, spb: 4, bars: 8, sa: 57, passes: 2, gain: 1.1,
    build(b, p) {
      const C = { I: [[0, 4, 7], 0], IV: [[5, 9, 12], 5], V: [[-5, -1, 2], -5], vi: [[-3, 0, 4], -3] }
      const prog = ['I', 'IV', 'I', 'V', 'vi', 'IV', 'V', 'I']
      prog.forEach((k, bar) => {
        const [v, r] = C[k]
        b.arp('santoor', bar, v, [0, 1, 2, 3, 4, 3, 2, 1], { vel: p ? 0.26 : 0.34 })
        b.note('bass', b.pos(bar, 0), b.def.sa - 12 + r, 4, 0.55)
        b.note('bass', b.pos(bar, 2), b.def.sa - 12 + r, 4, 0.42)
        b.drum(bar, bar === 7 ? 'dha ge na ti tete ka dhin na' : 'dha ge na ti na ka dhin na', { vel: 0.48, unit: 2 })
        b.drum(bar, '. s s s . s s s . s s s . s s s', { vel: 0.28 })
        if (p) b.chord('harmonium', bar, 0, v, 4, { oct: -1, vel: 0.2 })
      })
      const A = ['G - P G R S R G', "D - - P D S' D P", "G - P D S' - D P", 'R - P - R - - -',
        "D - S' - D P G -", "P - D - S' - D -", 'P - - G R - P -', 'S - - - - - _ _']
      const B = ["S' - D P G - P -", "D - S' - D - P -", "G - P - D - S' -", "R' - - - P - - -",
        "D - S' D P - G -", "P - D P D - S' -", "R' - - S' D - P -", "S' - - - - - _ _"]
      b.bars('flute', 0, p ? B : A, { vel: 0.68, oct: 1 })
      if (p) b.bars('santoor', 0, A, { vel: 0.4, oct: 1 })
    },
  },
}

// Compile every pass into an index: step-in-loop -> events[]
export function compileTrack(name) {
  const def = TRACKS[name]
  if (!def) return null
  const loopSteps = def.bars * def.spb * 4
  const passes = []
  for (let p = 0; p < (def.passes || 1); p++) {
    const b = new Builder(def, name)
    def.build(b, p)
    const index = new Array(loopSteps).fill(null)
    for (const e of b.ev) {
      const s = ((e.s % loopSteps) + loopSteps) % loopSteps
      ;(index[s] || (index[s] = [])).push(e)
    }
    passes.push(index)
  }
  return { def, loopSteps, passes }
}
