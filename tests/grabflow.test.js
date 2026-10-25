import { describe, it, expect } from 'vitest';
import {
  createGrabFlow,
  recordAttempt,
  undoAttempt,
  resetFlow,
  isComplete,
  grabCount,
  currentAttempt,
  flowToValues,
  flowFromSequence,
  grabFlowHtml,
  GRAB_FLOW_CSS,
} from '../src/grabflow.js';

const liClasses = (html) =>
  [...html.matchAll(/<li class="grab-dot ([^"]+)"/g)].map((m) => m[1]);

const liHtml = (html) =>
  [...html.matchAll(/<li class="grab-dot [^"]+"[^>]*>[\s\S]*?<\/li>/g)].map((m) => m[0]);

describe('createGrabFlow', () => {
  it('defaults to 5 attempts with an empty sequence', () => {
    expect(createGrabFlow()).toEqual({ attempts: 5, seq: [] });
  });

  it('keeps a valid attempt count', () => {
    expect(createGrabFlow(3)).toEqual({ attempts: 3, seq: [] });
    expect(createGrabFlow(1).attempts).toBe(1);
    expect(createGrabFlow(10).attempts).toBe(10);
  });

  it('clamps out-of-range integers into 1..10', () => {
    expect(createGrabFlow(0).attempts).toBe(1);
    expect(createGrabFlow(-4).attempts).toBe(1);
    expect(createGrabFlow(42).attempts).toBe(10);
  });

  it('falls back to 5 for invalid values', () => {
    const bad = [undefined, null, NaN, Infinity, -Infinity, 'abc', 2.5, ''];
    for (const value of bad) {
      expect(createGrabFlow(value).attempts).toBe(5);
    }
  });
});

describe('recordAttempt', () => {
  it('appends 1 for grabbed and 0 for missed, keeping order', () => {
    const start = createGrabFlow(3);
    const a = recordAttempt(start, true);
    const b = recordAttempt(a, false);
    const c = recordAttempt(b, true);

    expect(a.seq).toEqual([1]);
    expect(b.seq).toEqual([1, 0]);
    expect(c.seq).toEqual([1, 0, 1]);
    expect(a).not.toBe(start);
    expect(start.seq).toEqual([]);
  });

  it('refuses to record past the attempt limit', () => {
    const two = createGrabFlow(2);
    const done = recordAttempt(recordAttempt(two, true), false);
    expect(isComplete(done)).toBe(true);

    const after = recordAttempt(done, true);
    expect(after).toBe(done);
    expect(after.seq).toEqual([1, 0]);
  });

  it('never mutates the input flow', () => {
    const flow = createGrabFlow(4);
    const next = recordAttempt(flow, false);
    expect(flow.seq).toEqual([]);
    expect(next.seq).toEqual([0]);
  });
});

describe('undoAttempt / resetFlow', () => {
  it('undo is a no-op on an empty flow', () => {
    const flow = createGrabFlow(3);
    expect(undoAttempt(flow).seq).toEqual([]);
  });

  it('removes only the last attempt', () => {
    const flow = flowFromSequence([1, 0, 1], 4);
    const undone = undoAttempt(flow);
    expect(undone.seq).toEqual([1, 0]);
    expect(flow.seq).toEqual([1, 0, 1]);
    expect(undone.attempts).toBe(4);
  });

  it('reset clears the sequence but keeps the attempt count', () => {
    const flow = flowFromSequence([1, 0, 1], 3);
    const cleared = resetFlow(flow);
    expect(cleared).toEqual({ attempts: 3, seq: [] });
    expect(flow.seq).toEqual([1, 0, 1]);
  });
});

describe('derived state', () => {
  it('tracks completeness, grabs and the current attempt', () => {
    const empty = createGrabFlow(3);
    expect(isComplete(empty)).toBe(false);
    expect(grabCount(empty)).toBe(0);
    expect(currentAttempt(empty)).toBe(1);

    const partial = flowFromSequence([1, 0], 3);
    expect(isComplete(partial)).toBe(false);
    expect(grabCount(partial)).toBe(1);
    expect(currentAttempt(partial)).toBe(3);

    const done = flowFromSequence([1, 0, 1], 3);
    expect(isComplete(done)).toBe(true);
    expect(grabCount(done)).toBe(2);
    expect(currentAttempt(done)).toBe(3);
  });
});

describe('flowToValues', () => {
  it('is null until the flow is complete', () => {
    expect(flowToValues(createGrabFlow(2))).toBeNull();
    expect(flowToValues(flowFromSequence([1], 2))).toBeNull();
  });

  it('returns grabs, attempts and a copy of the sequence', () => {
    const flow = flowFromSequence([1, 0, 1], 3);
    const values = flowToValues(flow);
    expect(values).toEqual({ grabs: 2, attempts: 3, sequence: [1, 0, 1] });

    values.sequence.push(1);
    expect(flow.seq).toEqual([1, 0, 1]);
  });
});

describe('flowFromSequence', () => {
  it('ignores non 0/1 items and truncates to the attempt limit', () => {
    expect(flowFromSequence([1, 'x', 0, 2, null, true, 1], 3).seq).toEqual([1, 0, 1]);
    expect(flowFromSequence([1, 1, 1, 1], 2).seq).toEqual([1, 1]);
  });

  it('handles missing or invalid inputs', () => {
    expect(flowFromSequence(undefined, 4)).toEqual({ attempts: 4, seq: [] });
    expect(flowFromSequence([1, 0], 'nope').attempts).toBe(5);
    expect(flowFromSequence([1], 99).attempts).toBe(10);
    expect(flowFromSequence('1101', 3).seq).toEqual([]);
  });

  it('can restore a complete flow', () => {
    const flow = flowFromSequence([1, 0, 1], 3);
    expect(isComplete(flow)).toBe(true);
    expect(flowToValues(flow)).toEqual({ grabs: 2, attempts: 3, sequence: [1, 0, 1] });
  });
});

describe('grabFlowHtml', () => {
  it('renders one dot per attempt plus the parent hint', () => {
    const html = grabFlowHtml(createGrabFlow(5));
    expect(liClasses(html).length).toBe(5);
    expect(html).toContain('<p class="grab-hint">');
    expect(html).toContain('<ol class="grab-dots"');
  });

  it('marks the dots in order: grabbed, missed, grabbed, next, todo', () => {
    const html = grabFlowHtml(flowFromSequence([1, 0, 1], 5));
    expect(liClasses(html)).toEqual(['is-grab', 'is-miss', 'is-grab', 'is-next', 'is-todo']);
  });

  it('uses ✓ for grabbed and a hollow ring for missed', () => {
    const html = grabFlowHtml(flowFromSequence([1, 0], 3));
    const lis = liHtml(html);
    expect(lis[0]).toContain('✓');
    expect(lis[1]).not.toContain('✓');
    expect(lis[1]).toContain('<span class="dot" aria-hidden="true"></span>');
  });

  it('labels every dot for screen readers', () => {
    const html = grabFlowHtml(flowFromSequence([1, 0, 1], 5));
    expect(html).toContain('aria-label="第 1 下：抓住"');
    expect(html).toContain('aria-label="第 2 下：没抓住"');
    expect(html).toContain('aria-label="第 4 下：还没做"');
    expect(html).toContain('aria-label="第 5 下：还没做"');
  });

  it('shows the next attempt number while in progress, with undo but no result', () => {
    const html = grabFlowHtml(flowFromSequence([1, 0, 1], 5));
    expect(html).toContain('<p class="grab-status" role="status" aria-live="polite">第 4 下</p>');
    expect(html).not.toContain('grab-result');
    expect(html).not.toContain('data-r-reset');
    expect(html).toContain('data-r-undo="1"');
  });

  it('renders two big answer buttons labelled with the attempt number', () => {
    const html = grabFlowHtml(flowFromSequence([1, 0], 5));
    expect(html).toContain('<div class="grab-actions">');
    expect(html).toContain(
      '<button type="button" class="grab-btn grab-yes" data-r-grab="1" aria-label="第 3 下 抓住">✋ 抓住</button>'
    );
    expect(html).toContain(
      '<button type="button" class="grab-btn grab-no" data-r-grab="0" aria-label="第 3 下 没抓住">没抓住</button>'
    );
  });

  it('has no undo button before the first attempt', () => {
    const html = grabFlowHtml(createGrabFlow(3));
    expect(html).not.toContain('data-r-undo');
    expect(html).not.toContain('data-r-reset');
  });

  it('shows the big result, hides the answer buttons and offers reset when complete', () => {
    const html = grabFlowHtml(flowFromSequence([1, 0, 1, 1, 0], 5));
    expect(html).toContain('<span class="grab-result">3 / 5</span>');
    expect(html).toContain('</span> 抓住');
    expect(html).not.toContain('data-r-grab');
    expect(html).not.toContain('grab-actions');
    expect(html).toContain('data-r-reset="1"');
    expect(html).toContain('重新来');
  });

  it('never renders crosses or the colour red', () => {
    const html = grabFlowHtml(flowFromSequence([1, 0, 1, 1, 0], 5));
    expect(html).not.toMatch(/✗|×|✕/);
    expect(html.toLowerCase()).not.toContain('red');
  });

  it('switches every label to English with lang en', () => {
    const html = grabFlowHtml(flowFromSequence([1, 0], 3), { lang: 'en' });
    expect(html).toContain('Parent tip: use the same bar height and the same rest time every time.');
    expect(html).toContain('Got it');
    expect(html).toContain('Missed');
    expect(html).toContain('aria-label="Try 1: got it"');
    expect(html).toContain('aria-label="Try 2: missed"');
    expect(html).toContain('aria-label="Try 3: not yet"');
    expect(html).toContain('aria-label="Try 3: got it"');
    expect(html).toContain('>Try 3<');
    expect(html).toContain('>Undo<');
  });

  it('shows the English result and reset button when complete', () => {
    const html = grabFlowHtml(flowFromSequence([1, 0, 1], 3), { lang: 'en' });
    expect(html).toContain('<span class="grab-result">2 / 3</span>');
    expect(html).toContain(' grabbed');
    expect(html).toContain('Start over');
  });

  it('uses the injected esc function for every piece of text', () => {
    const seen = [];
    const esc = (value) => {
      const text = String(value);
      seen.push(text);
      return `«${text}»`;
    };
    const html = grabFlowHtml(flowFromSequence([1], 2), { esc });

    expect(seen.length).toBeGreaterThan(0);
    expect(html).toContain('«家长提示：每次用同样高度的杠，中间休息同样长的时间。»');
    expect(html).toContain('«抓杠记录»');
    expect(html).toContain('«抓住»');
    expect(html).toContain('«第 1 下：抓住»');
  });

  it('defaults to a working escaper when none is provided', () => {
    const html = grabFlowHtml(flowFromSequence([1], 2));
    expect(html).toContain('第 1 下：抓住');
    expect(html).not.toContain('undefined');
  });
});

describe('GRAB_FLOW_CSS', () => {
  it('styles the dots, buttons, result and reduced-motion fallback', () => {
    expect(typeof GRAB_FLOW_CSS).toBe('string');

    const selectors = [
      '.grab-hint',
      '.grab-dots',
      '.grab-dot',
      '.dot-label',
      '.grab-status',
      '.grab-result',
      '.grab-actions',
      '.grab-btn',
      '.grab-yes',
      '.grab-no',
      '.grab-undo',
      '.is-grab .dot',
      '.is-miss .dot',
      '.is-todo .dot',
      '.is-next .dot',
    ];
    for (const selector of selectors) {
      expect(GRAB_FLOW_CSS).toContain(selector);
    }

    expect(GRAB_FLOW_CSS).toContain('#0B3D91');
    expect(GRAB_FLOW_CSS).toContain('min-height: 96px');
    expect(GRAB_FLOW_CSS).toContain('font-variant-numeric: tabular-nums');
    expect(GRAB_FLOW_CSS).toContain('scale(0.6)');
    expect(GRAB_FLOW_CSS).toContain('prefers-reduced-motion: reduce');
  });
});
