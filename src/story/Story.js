// Story presentation layer: dialogue, captions, date cards, fades, letterbox, panels. All promise-based.
import { drawAvatar } from './avatars.js';
import { SPEAKERS } from './script.js';

let audio = null;
export function setStoryAudio(a) { audio = a; }

export class Story {
  constructor(root) {
    this.root = root;
    const mk = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; root.appendChild(d); return d; };
    this.$lbT = mk('letterbox top passthrough'); this.$lbB = mk('letterbox bottom passthrough');
    this.$fade = mk('fade passthrough');
    this.$date = mk('datecard passthrough', `<div class="inner"><div class="date"></div><div class="chap"></div><div class="tag"></div><div class="flourish"></div><div class="place"></div></div>`);
    this.$cap = mk('caption passthrough', '<small></small><span></span>');
    this.$dlg = mk('dialogue', `<div class="avatar"><canvas></canvas></div><div class="box"><div class="name"></div><div class="text"></div><div class="choices"></div><div class="next">TAP ▸</div></div>`);
    this.$skip = mk('btn small ghost skip-btn', 'Skip ▸▸');
    this.$skip.style.display = 'none';
    this.$skip.addEventListener('click', () => { this.skipping = true; this._advance?.(); });
    this.skipping = false;
    this.avatarCache = new Map();
    this._advance = null;
    this.$dlg.addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON') this._advance?.(); });
  }

  // Cutscene mode shows letterbox + skip button.
  cutscene(on) {
    this.$lbT.classList.toggle('on', on); this.$lbB.classList.toggle('on', on);
    this.$skip.style.display = on ? '' : 'none';
    if (!on) this.skipping = false;
  }

  wait(s) { if (this.skipping) return Promise.resolve(); return new Promise((r) => { const t = setTimeout(r, s * 1000); this._advance = () => { clearTimeout(t); r(); }; }); }

  fade(on, dur = 0.8, ivory = false) {
    this.$fade.classList.toggle('ivory', ivory);
    this.$fade.style.transitionDuration = `${dur}s`;
    this.$fade.classList.toggle('on', on);
    return new Promise((r) => setTimeout(r, dur * 1000));
  }

  // Make sure the 3D scene is visible (lifts a leftover black fade).
  reveal(dur = 0.8) { return this.$fade.classList.contains('on') ? this.fade(false, dur) : Promise.resolve(); }

  async dateCard({ date, title, tag = '', place = '' }, seconds = 3.2) {
    const d = this.$date;
    d.querySelector('.date').textContent = date; d.querySelector('.chap').textContent = title;
    d.querySelector('.tag').textContent = tag; d.querySelector('.place').textContent = place;
    d.classList.add('on');
    audio?.sfx('bell', { volume: 0.5 });
    await new Promise((r) => setTimeout(r, 1000));
    // the card now fully covers the screen: lift any black fade left by the previous chapter,
    // so the new scene is revealed when the card fades out
    this.$fade.style.transitionDuration = '0s';
    this.$fade.classList.remove('on');
    await this.wait(seconds);
    d.classList.remove('on');
    await new Promise((r) => setTimeout(r, 900));
  }

  async caption(text, kicker = '', seconds = 3) {
    this.$cap.querySelector('small').textContent = kicker;
    this.$cap.querySelector('small').style.display = kicker ? '' : 'none';
    this.$cap.querySelector('span').textContent = text;
    this.$cap.classList.add('on');
    await this.wait(seconds);
    this.$cap.classList.remove('on');
    await new Promise((r) => setTimeout(r, this.skipping ? 0 : 500));
  }

  avatar(who) {
    if (!this.avatarCache.has(who.id + (who.variant || ''))) {
      const c = document.createElement('canvas'); drawAvatar(c, who.avatar);
      this.avatarCache.set(who.id + (who.variant || ''), c);
    }
    return this.avatarCache.get(who.id + (who.variant || ''));
  }

  // say('ammi', 'text') or say({id, name, avatar}, text). Returns chosen index when choices are given.
  say(speaker, text, { choices = null, auto = 0 } = {}) {
    const who = typeof speaker === 'string' ? SPEAKERS[speaker] : speaker;
    if (this.skipping && !choices) return Promise.resolve(0);
    const d = this.$dlg;
    const av = d.querySelector('.avatar');
    av.style.display = who?.avatar ? '' : 'none';
    if (who?.avatar) { const src = this.avatar(who); const dst = av.querySelector('canvas'); dst.width = src.width; dst.height = src.height; dst.getContext('2d').drawImage(src, 0, 0); }
    d.querySelector('.name').textContent = who?.name || '';
    const $t = d.querySelector('.text'), $c = d.querySelector('.choices'), $n = d.querySelector('.next');
    $c.innerHTML = ''; $n.style.display = choices ? 'none' : '';
    d.classList.add('on');
    return new Promise((resolve) => {
      let i = 0, typing = true;
      const full = text;
      $t.textContent = '';
      const iv = setInterval(() => {
        i += 2; $t.textContent = full.slice(0, i);
        if (i % 6 === 0) audio?.sfx('typing', { volume: 0.15 });
        if (i >= full.length) { clearInterval(iv); typing = false; showChoices(); }
      }, 18);
      const finish = (val) => {
        clearInterval(iv); removeEventListener('keydown', onKey); this._advance = null;
        d.classList.remove('on');
        audio?.sfx('click', { volume: 0.3 });
        setTimeout(() => resolve(val), 160);
      };
      const showChoices = () => {
        if (!choices) { if (auto) setTimeout(() => finish(0), auto * 1000); return; }
        choices.forEach((ch, k) => {
          const b = document.createElement('button'); b.textContent = ch;
          b.addEventListener('click', (e) => { e.stopPropagation(); finish(k); });
          $c.appendChild(b);
        });
      };
      this._advance = () => {
        if (typing) { clearInterval(iv); typing = false; $t.textContent = full; showChoices(); return; }
        if (!choices) finish(0);
      };
      const onKey = (e) => {
        if (e.repeat) return;
        if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this._advance?.(); }
        if (choices && !typing) { const k = parseInt(e.key, 10) - 1; if (k >= 0 && k < choices.length) finish(k); }
      };
      addEventListener('keydown', onKey);
    });
  }

  // Run a list of lines: [['ammi','text'], ['groom','text'], ...]
  async lines(list) { for (const [who, text] of list) { await this.say(who, text); if (this.skipping) break; } }

  // Show an HTML panel; resolves with the value passed to close(value).
  panel(build) {
    const el = document.createElement('div'); el.className = 'panel';
    this.root.appendChild(el);
    return new Promise((resolve) => {
      const close = (v) => { el.remove(); resolve(v); };
      build(el, close);
    });
  }
}
