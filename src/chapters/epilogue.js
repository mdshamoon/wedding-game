import { SCRIPT } from '../story/script.js';
import { CONFIG } from '../config.js';

const S = SCRIPT.epilogue;

export async function runEpilogue(game) {
  const { ui, audio, story } = game;
  audio.playMusic('ending');
  audio.setAmbience(null);
  const el = document.createElement('div');
  el.className = 'paper';
  el.style.cssText = 'position:fixed;inset:0;z-index:28;overflow:auto;opacity:0;transition:opacity 1.2s;text-align:center;padding:40px 16px calc(40px + env(safe-area-inset-bottom,0px))';
  const shots = game.album.slice(-12);
  el.innerHTML = `
    <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
    <div style="font-family:var(--display);letter-spacing:.32em;font-size:12px;color:var(--accent)">OUR ALBUM</div>
    <div style="font-family:var(--script);font-size:clamp(48px,10vw,80px);line-height:1.1" class="gold-text">${CONFIG.groomName} &amp; ${CONFIG.brideName}</div>
    <div class="flourish"></div>
    <div class="album" style="display:flex;flex-wrap:wrap;gap:18px;justify-content:center;max-width:1000px;margin:18px auto"></div>
    <div class="verse" style="max-width:640px;margin:30px auto 0;opacity:0;transition:opacity 1.5s">
      <div style="font-family:var(--serif);font-style:italic;font-size:clamp(19px,3.6vw,24px);color:var(--muted);line-height:1.45">${S.verse}</div>
      <div style="font-family:var(--serif);font-size:16px;color:var(--muted2);margin-top:8px">${S.verseRef}</div>
      <div class="flourish"></div>
      <div style="font-family:var(--display);letter-spacing:.26em;font-size:12px;color:var(--accent)">${CONFIG.dates.nikah.toUpperCase()}</div>
      <div style="font-family:var(--serif);font-style:italic;font-size:22px;color:var(--ink);margin-top:10px">${S.thanks}</div>
      <div style="margin-top:28px;font-size:13px;color:var(--muted2);font-family:var(--serif)">A playable story made with love for the wedding of ${CONFIG.groomFull} &amp; ${CONFIG.brideFull}.<br/>${CONFIG.tiles.attribution}</div>
      <div style="margin-top:22px"><button class="btn">Play Again</button></div>
    </div>`;
  ui.appendChild(el);
  requestAnimationFrame(() => (el.style.opacity = 1));
  await story.fade(false, 0.4);
  const album = el.querySelector('.album');
  const list = shots.length ? shots : [{ caption: 'Kichha · March 2027', url: null }];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const card = document.createElement('div');
    const rot = (Math.random() - 0.5) * 6;
    card.style.cssText = `background:#fffcf5;padding:10px 10px 12px;box-shadow:0 10px 30px #785a1e40;transform:rotate(${rot}deg) translateY(20px);opacity:0;transition:all .8s;width:min(280px,80vw)`;
    card.innerHTML = `${s.url ? `<img src="${s.url}" style="width:100%;display:block" alt="">` : '<div style="height:160px;background:#ece0c8"></div>'}<div style="font-family:var(--serif);font-style:italic;color:var(--ink);font-size:17px;margin-top:8px">${s.caption}</div>`;
    album.appendChild(card);
    requestAnimationFrame(() => { card.style.opacity = 1; card.style.transform = `rotate(${rot}deg)`; });
    await new Promise((r) => setTimeout(r, 650));
  }
  el.querySelector('.verse').style.opacity = 1;
  await new Promise((resolve) => { el.querySelector('.btn').onclick = () => { audio.sfx('confirm'); resolve(); }; });
}
