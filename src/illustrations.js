// Sticker-book illustrations for 成就本.
// Pure string helpers: no DOM, no side effects.

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

const LEVEL_KEYS = [
  { v: 0, chin: 74, bend: 0.05 },
  { v: 25, chin: 60, bend: 0.15 },
  { v: 50, chin: 42, bend: 1 },
  { v: 75, chin: 26, bend: 0.55 },
  { v: 100, chin: 8, bend: 0.15 },
];

function valueAt(value, key) {
  const v = clamp(Number.isFinite(Number(value)) ? Number(value) : 0, 0, 100);

  for (let i = 0; i < LEVEL_KEYS.length - 1; i += 1) {
    const a = LEVEL_KEYS[i];
    const b = LEVEL_KEYS[i + 1];
    if (v >= a.v && v <= b.v) {
      const t = (v - a.v) / (b.v - a.v || 1);
      return lerp(a[key], b[key], t);
    }
  }

  return LEVEL_KEYS[LEVEL_KEYS.length - 1][key];
}

/**
 * Draw the pull-up level illustration.
 * The figure rises toward the bar as `value` goes from 0 to 100.
 *
 * @param {number} value any number, clamped to 0–100
 * @returns {string} inline SVG
 */
export function pullupLevelSvg(value) {
  const v = clamp(Number.isFinite(Number(value)) ? Number(value) : 0, 0, 100);
  const chinY = valueAt(v, 'chin');
  const bend = valueAt(v, 'bend');

  const headR = 9;
  const headCy = chinY - headR;
  const shoulderY = chinY + 6;
  const hipY = Math.min(94, chinY + 34);
  const footY = Math.min(108, hipY + 16);

  const leftHandX = 36;
  const rightHandX = 64;
  const leftShoulderX = 44;
  const rightShoulderX = 56;

  const leftCx = leftHandX - 12 * bend;
  const rightCx = rightHandX + 12 * bend;
  const armCy = (12 + shoulderY) / 2;

  return `<svg class="pullup-svg" viewBox="0 -18 100 128" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
    <line x1="10" y1="12" x2="90" y2="12" stroke="#111111" stroke-width="6" stroke-linecap="round" />
    <line x1="18" y1="${chinY.toFixed(2)}" x2="82" y2="${chinY.toFixed(2)}" stroke="#0B3D91" stroke-width="2" stroke-dasharray="4 3" stroke-linecap="round" />
    <circle cx="50" cy="${headCy.toFixed(2)}" r="${headR}" fill="#FFFFFF" stroke="#111111" stroke-width="4" />
    <path d="M50 ${chinY.toFixed(2)} L50 ${hipY.toFixed(2)}" fill="none" stroke="#111111" stroke-width="4" stroke-linecap="round" />
    <path d="M${leftHandX} 12 Q ${leftCx.toFixed(2)} ${armCy.toFixed(2)} ${leftShoulderX} ${shoulderY.toFixed(
    2
  )}" fill="none" stroke="#111111" stroke-width="4" stroke-linecap="round" />
    <path d="M${rightHandX} 12 Q ${rightCx.toFixed(2)} ${armCy.toFixed(2)} ${rightShoulderX} ${shoulderY.toFixed(
    2
  )}" fill="none" stroke="#111111" stroke-width="4" stroke-linecap="round" />
    <path d="M50 ${hipY.toFixed(2)} L42 ${footY.toFixed(2)}" fill="none" stroke="#111111" stroke-width="4" stroke-linecap="round" />
    <path d="M50 ${hipY.toFixed(2)} L58 ${footY.toFixed(2)}" fill="none" stroke="#111111" stroke-width="4" stroke-linecap="round" />
    <circle cx="${leftHandX}" cy="12" r="3" fill="none" stroke="#111111" stroke-width="4" />
    <circle cx="${rightHandX}" cy="12" r="3" fill="none" stroke="#111111" stroke-width="4" />
  </svg>`;
}

/**
 * Optional decorative road helper. The accessible road in the UI is an <ol>;
 * this SVG is only for the thick outline behind it.
 */
export function roadSvg() {
  return `<svg viewBox="0 0 40 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path d="M20 100 C20 72 20 30 20 0" fill="none" stroke="#111111" stroke-width="4" stroke-linecap="round" />
  </svg>`;
}
