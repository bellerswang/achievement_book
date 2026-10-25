/* 成就本 — 抓杠 (pull-up grab) flow, stage 1.
   Pure state helpers + HTML string renderers. No DOM access, no imports. */

const DEFAULT_ATTEMPTS = 5;
const MIN_ATTEMPTS = 1;
const MAX_ATTEMPTS = 10;

function normalizeAttempts(value) {
  if (value === null || value === undefined || value === '') return DEFAULT_ATTEMPTS;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return DEFAULT_ATTEMPTS;
  return Math.min(MAX_ATTEMPTS, Math.max(MIN_ATTEMPTS, n));
}

export function createGrabFlow(attempts) {
  return { attempts: normalizeAttempts(attempts), seq: [] };
}

export function isComplete(flow) {
  return Array.isArray(flow.seq) && flow.seq.length >= flow.attempts;
}

export function grabCount(flow) {
  return flow.seq.reduce((total, value) => (value === 1 ? total + 1 : total), 0);
}

export function currentAttempt(flow) {
  return Math.min(flow.seq.length + 1, flow.attempts);
}

export function recordAttempt(flow, grabbed) {
  if (isComplete(flow)) return flow;
  return { ...flow, seq: [...flow.seq, grabbed ? 1 : 0] };
}

export function undoAttempt(flow) {
  if (!flow.seq.length) return flow;
  return { ...flow, seq: flow.seq.slice(0, -1) };
}

export function resetFlow(flow) {
  return { ...flow, seq: [] };
}

export function flowToValues(flow) {
  if (!isComplete(flow)) return null;
  return {
    grabs: grabCount(flow),
    attempts: flow.attempts,
    sequence: [...flow.seq],
  };
}

export function flowFromSequence(sequence, attempts) {
  const base = createGrabFlow(attempts);
  const source = Array.isArray(sequence) ? sequence : [];
  const seq = [];
  for (const item of source) {
    if (seq.length >= base.attempts) break;
    if (item === 1 || item === 0) seq.push(item);
  }
  return { ...base, seq };
}

/* ------------------------------------------------------------------ */
/* HTML                                                                */
/* ------------------------------------------------------------------ */

const L10N = {
  zh: {
    hint: '家长提示：每次用同样高度的杠，中间休息同样长的时间。',
    dotsLabel: '抓杠记录',
    grabLabel: '抓住',
    missLabel: '没抓住',
    grabAria: (n) => `第 ${n} 下：抓住`,
    missAria: (n) => `第 ${n} 下：没抓住`,
    todoAria: (n) => `第 ${n} 下：还没做`,
    status: (n) => `第 ${n} 下`,
    resultSuffix: ' 抓住',
    yes: '✋ 抓住',
    no: '没抓住',
    yesAria: (n) => `第 ${n} 下 抓住`,
    noAria: (n) => `第 ${n} 下 没抓住`,
    undo: '↩︎ 撤销一下',
    reset: '重新来',
  },
  en: {
    hint: 'Parent tip: use the same bar height and the same rest time every time.',
    dotsLabel: 'Grab attempts',
    grabLabel: 'Got it',
    missLabel: 'Missed',
    grabAria: (n) => `Try ${n}: got it`,
    missAria: (n) => `Try ${n}: missed`,
    todoAria: (n) => `Try ${n}: not yet`,
    status: (n) => `Try ${n}`,
    resultSuffix: ' grabbed',
    yes: '✋ Got it',
    no: 'Missed',
    yesAria: (n) => `Try ${n}: got it`,
    noAria: (n) => `Try ${n}: missed`,
    undo: 'Undo',
    reset: 'Start over',
  },
};

function defaultEsc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

export function grabFlowHtml(flow, options) {
  const opts = options || {};
  const lang = opts.lang === 'en' ? 'en' : 'zh';
  const esc = typeof opts.esc === 'function' ? opts.esc : defaultEsc;
  const t = L10N[lang];

  const attempts = normalizeAttempts(flow && flow.attempts);
  const rawSeq = flow && Array.isArray(flow.seq) ? flow.seq : [];
  const seq = rawSeq.filter((v) => v === 1 || v === 0).slice(0, attempts);
  const complete = seq.length >= attempts;

  const parts = [];

  /* 1. parent hint */
  parts.push(`<p class="grab-hint">${esc(t.hint)}</p>`);

  /* 2. dots */
  const items = [];
  for (let i = 0; i < attempts; i += 1) {
    const n = i + 1;
    const value = i < seq.length ? seq[i] : null;
    let state;
    let glyph = '';
    let label;
    let aria;

    if (value === 1) {
      state = 'is-grab';
      glyph = '✓';
      label = t.grabLabel;
      aria = t.grabAria(n);
    } else if (value === 0) {
      state = 'is-miss';
      label = t.missLabel;
      aria = t.missAria(n);
    } else if (!complete && i === seq.length) {
      state = 'is-next';
      label = String(n);
      aria = t.todoAria(n);
    } else {
      state = 'is-todo';
      label = String(n);
      aria = t.todoAria(n);
    }

    items.push(
      `<li class="grab-dot ${state}" aria-label="${esc(aria)}">` +
        `<span class="dot" aria-hidden="true">${glyph}</span>` +
        `<span class="dot-label">${esc(label)}</span>` +
        `</li>`
    );
  }
  parts.push(`<ol class="grab-dots" aria-label="${esc(t.dotsLabel)}">${items.join('')}</ol>`);

  /* 3. live status */
  let status;
  if (complete) {
    status =
      `<span class="grab-result">${grabCount({ attempts, seq })} / ${attempts}</span>` +
      esc(t.resultSuffix);
  } else {
    status = esc(t.status(currentAttempt({ attempts, seq })));
  }
  parts.push(`<p class="grab-status" role="status" aria-live="polite">${status}</p>`);

  /* 4. big answer buttons */
  if (!complete) {
    const n = currentAttempt({ attempts, seq });
    parts.push(
      `<div class="grab-actions">` +
        `<button type="button" class="grab-btn grab-yes" data-r-grab="1" aria-label="${esc(
          t.yesAria(n)
        )}">${esc(t.yes)}</button>` +
        `<button type="button" class="grab-btn grab-no" data-r-grab="0" aria-label="${esc(
          t.noAria(n)
        )}">${esc(t.no)}</button>` +
        `</div>`
    );
  }

  /* 5. undo / reset */
  if (seq.length > 0) {
    parts.push(`<button type="button" class="grab-undo" data-r-undo="1">${esc(t.undo)}</button>`);
  }
  if (complete) {
    parts.push(`<button type="button" class="grab-undo" data-r-reset="1">${esc(t.reset)}</button>`);
  }

  return parts.join('\n');
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

export const GRAB_FLOW_CSS = `
.grab-hint {
  font-size: 1.125rem;
  color: #111;
  font-weight: 600;
  border-left: 4px solid #111;
  padding-left: 0.75rem;
  margin: 0 0 0.75rem;
}

.grab-dots {
  display: flex;
  gap: 0.5rem;
  justify-content: space-between;
  list-style: none;
  padding: 0;
  margin: 0;
}

.grab-dot {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1 1 0;
  min-width: 56px;
}

.grab-dot .dot {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 4px solid #111;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  font-weight: 900;
  box-sizing: border-box;
}

.is-grab .dot {
  background: #0B3D91;
  border-color: #0B3D91;
  color: #fff;
  animation: grab-pop 200ms ease-out;
}

.is-miss .dot {
  background: #fff;
  border: 4px solid #111;
}

.is-todo .dot {
  border: 3px dashed #111;
}

.is-next .dot {
  border: 5px solid #0B3D91;
}

.dot-label {
  font-size: 1.125rem;
  font-weight: 700;
  color: #111;
  margin-top: 0.25rem;
  white-space: nowrap;
}

.grab-status {
  font-size: 2rem;
  font-weight: 800;
  color: #111;
  margin: 0.75rem 0;
}

.grab-result {
  font-size: 4rem;
  font-weight: 900;
  color: #0B3D91;
  font-variant-numeric: tabular-nums;
  font-family: ui-rounded, "SF Pro Rounded", system-ui, monospace;
}

.grab-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.grab-btn {
  min-height: 96px;
  font-size: 1.75rem;
  font-weight: 800;
  border-radius: 1.25rem;
  border: 4px solid #111;
  cursor: pointer;
}

.grab-yes {
  background: #0B3D91;
  color: #fff;
  border-color: #0B3D91;
}

.grab-no {
  background: #fff;
  color: #111;
}

.grab-undo {
  min-height: 56px;
  background: none;
  border: 0;
  text-decoration: underline;
  font-size: 1.125rem;
  font-weight: 700;
  color: #0B3D91;
  cursor: pointer;
}

@keyframes grab-pop {
  from { transform: scale(0.6); }
  to { transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .is-grab .dot { animation: none; }
}
`;
