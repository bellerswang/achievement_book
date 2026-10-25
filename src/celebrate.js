// Simple, dependency-free celebration effects for 成就本.

const STYLE_ID = 'celebrate-styles';

const CONFETTI_COLORS = ['#0B3D91', '#1E5BC6', '#0A6B2E', '#123E7C', '#333333'];

function injectStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.celebrate-overlay{position:fixed;inset:0;pointer-events:none;z-index:300;overflow:hidden}
.celebrate-particle{position:absolute;will-change:transform,opacity;line-height:1}
.celebrate-star{left:50%;top:50%;font-size:2.25rem;animation:cel-burst var(--dur,1.5s) cubic-bezier(.2,.7,.3,1) var(--delay,0s) forwards}
@keyframes cel-burst{
  0%{transform:translate(-50%,-50%) scale(.2) rotate(0deg);opacity:0}
  15%{opacity:1;transform:translate(-50%,-50%) scale(1.15) rotate(0deg)}
  100%{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(.5) rotate(var(--rot));opacity:0}
}
.celebrate-twinkle{font-size:2rem;animation:cel-twinkle var(--dur,1.4s) ease-in-out var(--delay,0s) forwards;opacity:0}
@keyframes cel-twinkle{
  0%{opacity:0;transform:scale(.3) rotate(0deg)}
  30%{opacity:1;transform:scale(1.3) rotate(12deg)}
  65%{opacity:.95;transform:scale(.95) rotate(-8deg)}
  100%{opacity:0;transform:scale(.4) rotate(0deg)}
}
.celebrate-confetti{top:-4vh;width:12px;height:20px;border-radius:3px;animation:cel-fall var(--dur,1.7s) linear var(--delay,0s) forwards}
@keyframes cel-fall{
  0%{transform:translateY(-10vh) rotate(0deg);opacity:0}
  10%{opacity:1}
  100%{transform:translateY(112vh) rotate(var(--rot));opacity:.85}
}
.celebrate-static{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);font-size:6rem;line-height:1}
`;
  document.head.appendChild(style);
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function prefersReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

function vibrate(pattern) {
  try {
    if (navigator && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

function buildStars(overlay) {
  const count = 24;
  for (let i = 0; i < count; i += 1) {
    const el = document.createElement('span');
    el.className = 'celebrate-particle celebrate-star';
    el.textContent = '⭐';
    const angle = (Math.PI * 2 * i) / count + rand(-0.2, 0.2);
    const dist = rand(90, 220);
    el.style.setProperty('--dx', `${Math.round(Math.cos(angle) * dist)}px`);
    el.style.setProperty('--dy', `${Math.round(Math.sin(angle) * dist)}px`);
    el.style.setProperty('--rot', `${Math.round(rand(-180, 180))}deg`);
    el.style.setProperty('--dur', `${(rand(1.1, 1.6)).toFixed(2)}s`);
    el.style.setProperty('--delay', `${(rand(0, 0.25)).toFixed(2)}s`);
    el.style.fontSize = `${rand(1.6, 3).toFixed(2)}rem`;
    overlay.appendChild(el);
  }
}

function buildSparkles(overlay) {
  const count = 28;
  for (let i = 0; i < count; i += 1) {
    const el = document.createElement('span');
    el.className = 'celebrate-particle celebrate-twinkle';
    el.textContent = '✨';
    el.style.left = `${rand(4, 92).toFixed(1)}%`;
    el.style.top = `${rand(6, 86).toFixed(1)}%`;
    el.style.setProperty('--dur', `${rand(0.9, 1.5).toFixed(2)}s`);
    el.style.setProperty('--delay', `${rand(0, 0.7).toFixed(2)}s`);
    el.style.fontSize = `${rand(1.4, 3.2).toFixed(2)}rem`;
    overlay.appendChild(el);
  }
}

function buildConfetti(overlay) {
  const count = 60;
  for (let i = 0; i < count; i += 1) {
    const el = document.createElement('span');
    el.className = 'celebrate-particle celebrate-confetti';
    el.style.left = `${rand(0, 98).toFixed(1)}%`;
    el.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    el.style.setProperty('--rot', `${Math.round(rand(-720, 720))}deg`);
    el.style.setProperty('--dur', `${rand(1.1, 1.7).toFixed(2)}s`);
    el.style.setProperty('--delay', `${rand(0, 0.5).toFixed(2)}s`);
    el.style.width = `${Math.round(rand(8, 16))}px`;
    el.style.height = `${Math.round(rand(14, 26))}px`;
    overlay.appendChild(el);
  }
}

/**
 * Play a celebration.
 * @param {'stars'|'sparkle'|'confetti'} kind
 */
export function celebrate(kind = 'stars') {
  if (typeof document === 'undefined' || !document.body) return;
  injectStyles();

  const reduced = prefersReducedMotion();
  const overlay = document.createElement('div');
  overlay.className = 'celebrate-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  if (reduced) {
    const el = document.createElement('span');
    el.className = 'celebrate-static';
    el.textContent = '⭐';
    overlay.appendChild(el);
    document.body.appendChild(overlay);
    vibrate([20]);
    window.setTimeout(() => overlay.remove(), 1200);
    return;
  }

  const type = kind === 'sparkle' || kind === 'confetti' ? kind : 'stars';

  if (type === 'confetti') buildConfetti(overlay);
  else if (type === 'sparkle') buildSparkles(overlay);
  else buildStars(overlay);

  document.body.appendChild(overlay);
  vibrate(type === 'confetti' ? [20, 30, 20, 30, 40] : [25, 35, 25]);
  window.setTimeout(() => overlay.remove(), 1800);
}
