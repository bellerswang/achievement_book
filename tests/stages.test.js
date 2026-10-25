import { describe, it, expect } from 'vitest';
import { PRESET_EXERCISES, PULLUP_DEFAULTS, LEVEL_OPTIONS } from '../src/presets.js';
import {
  entryValue,
  pullupSettings,
  stageOfEntry,
  stageProgress,
  formatGrab,
  distanceKey,
  runDistances,
  runBestByDistance,
  runTimeSeries,
  runCompareLast,
  formatDuration,
  formatDistance,
  formatFaster,
  stamps,
  newStampsForSave,
} from '../src/metrics.js';
import { makeDemoEntries, mulberry32 } from '../src/seed.js';
import { dailySeries, attemptsOnDay } from '../src/metrics.js';

const PULLUP = PRESET_EXERCISES.find((e) => e.id === 'pullup');
const RUN = PRESET_EXERCISES.find((e) => e.id === 'run');
const ROPE = PRESET_EXERCISES.find((e) => e.id === 'rope');

let uid = 0;
function makeEntry(exerciseId, date, values, createdAt) {
  uid += 1;
  return {
    id: `s${uid}`,
    exerciseId,
    date,
    createdAt: createdAt === undefined ? 1700000000000 + uid : createdAt,
    values,
  };
}

/* ------------------------------------------------------------------ */
/* grabRate / stages                                                   */
/* ------------------------------------------------------------------ */

// Stage unlocking is opt-in (parent switch); most stage tests run with it on.
const ON = { unlockNext: true };

describe('grabRate derivation', () => {
  it('rounds grabs / attempts to a whole percentage', () => {
    expect(
      entryValue(PULLUP, makeEntry('pullup', '2024-03-01', { grabs: 3, attempts: 5 }), 'grabRate')
    ).toBe(60);
    expect(
      entryValue(PULLUP, makeEntry('pullup', '2024-03-01', { grabs: 4, attempts: 5 }), 'grabRate')
    ).toBe(80);
    expect(
      entryValue(PULLUP, makeEntry('pullup', '2024-03-01', { grabs: 5, attempts: 5 }), 'grabRate')
    ).toBe(100);
    expect(
      entryValue(PULLUP, makeEntry('pullup', '2024-03-01', { grabs: 4, attempts: 6 }), 'grabRate')
    ).toBe(67);
  });

  it('is null when grabs or usable attempts are missing', () => {
    expect(
      entryValue(PULLUP, makeEntry('pullup', '2024-03-01', { grabs: 3 }), 'grabRate')
    ).toBe(null);
    expect(
      entryValue(PULLUP, makeEntry('pullup', '2024-03-01', { grabs: 3, attempts: 0 }), 'grabRate')
    ).toBe(null);
    expect(
      entryValue(PULLUP, makeEntry('pullup', '2024-03-01', { attempts: 5 }), 'grabRate')
    ).toBe(null);
  });
});

describe('stageOfEntry', () => {
  it('checks level, then hang, then grabs', () => {
    expect(stageOfEntry({ values: { grabs: 3 } })).toBe(1);
    expect(stageOfEntry({ values: { hang: 10 } })).toBe(2);
    expect(stageOfEntry({ values: { level: 50 } })).toBe(3);
    expect(stageOfEntry({ values: { grabs: 3, hang: 5 } })).toBe(2);
    expect(stageOfEntry({ values: { grabs: 3, hang: 5, level: 50 } })).toBe(3);
    expect(stageOfEntry({ values: {} })).toBe(null);
    expect(stageOfEntry(null)).toBe(null);
  });
});

describe('pullupSettings', () => {
  it('uses defaults and valid positive integer overrides', () => {
    expect(pullupSettings()).toEqual(PULLUP_DEFAULTS);
    expect(pullupSettings({ attempts: 8, stage1Grabs: 6, stage2Hang: 12 })).toEqual({
      attempts: 8,
      stage1Grabs: 6,
      stage2Hang: 12,
      unlockNext: false,
    });
    expect(pullupSettings({ unlockNext: true }).unlockNext).toBe(true);
  });

  it('clamps stage1Grabs to 1..attempts', () => {
    expect(pullupSettings({ attempts: 3, stage1Grabs: 10 }).stage1Grabs).toBe(3);
    expect(pullupSettings({ attempts: 5, stage1Grabs: 0 }).stage1Grabs).toBe(4);
    expect(pullupSettings({ attempts: 0 }).attempts).toBe(5);
  });
});

describe('stageProgress', () => {
  it('always unlocks stage 1 and reports first entry date', () => {
    const p = stageProgress(PULLUP, []);
    expect(p.current).toBe(1);
    expect(p.stages[0]).toMatchObject({
      n: 1,
      id: 'grab',
      unlocked: true,
      unlockedOn: null,
      entries: 0,
      best: null,
      latest: null,
    });
    expect(p.stages[1].unlocked).toBe(false);
    expect(p.stages[2].unlocked).toBe(false);

    const entries = [
      makeEntry('pullup', '2024-03-01', { grabs: 2, attempts: 5 }),
      makeEntry('pullup', '2024-03-02', { grabs: 3, attempts: 5 }),
    ];
    const p2 = stageProgress(PULLUP, entries, ON);
    expect(p2.current).toBe(1);
    expect(p2.stages[0]).toMatchObject({
      unlocked: true,
      unlockedOn: '2024-03-01',
      entries: 2,
      best: 60,
      latest: 60,
    });
    expect(p2.stages[1].unlocked).toBe(false);
  });

  it('unlocks stage 2 by grabs threshold and stays unlocked', () => {
    const entries = [
      makeEntry('pullup', '2024-03-01', { grabs: 2, attempts: 5 }),
      makeEntry('pullup', '2024-03-02', { grabs: 4, attempts: 5 }),
      makeEntry('pullup', '2024-03-03', { grabs: 1, attempts: 5 }),
    ];
    const p = stageProgress(PULLUP, entries, ON);
    expect(p.current).toBe(2);
    expect(p.stages[1]).toMatchObject({
      n: 2,
      id: 'hang',
      unlocked: true,
      unlockedOn: '2024-03-02',
      entries: 0,
      best: null,
      latest: null,
    });
    expect(p.stages[2].unlocked).toBe(false);
  });

  it('uses the earliest of threshold and first stage-2 entry', () => {
    const entries = [
      makeEntry('pullup', '2024-03-02', { grabs: 4, attempts: 5 }),
      makeEntry('pullup', '2024-03-01', { hang: 5 }),
    ];
    const p = stageProgress(PULLUP, entries, ON);
    expect(p.stages[1].unlocked).toBe(true);
    expect(p.stages[1].unlockedOn).toBe('2024-03-01');
    expect(p.stages[1].entries).toBe(1);
    expect(p.stages[1].best).toBe(5);
  });

  it('unlocks stage 3 by hang threshold', () => {
    const entries = [
      makeEntry('pullup', '2024-03-01', { grabs: 4, attempts: 5 }),
      makeEntry('pullup', '2024-03-02', { hang: 9 }),
      makeEntry('pullup', '2024-03-03', { hang: 10 }),
    ];
    const p = stageProgress(PULLUP, entries, ON);
    expect(p.current).toBe(3);
    expect(p.stages[2]).toMatchObject({
      n: 3,
      id: 'pull',
      unlocked: true,
      unlockedOn: '2024-03-03',
      entries: 0,
      best: null,
      latest: null,
    });
    expect(p.stages[1].best).toBe(10);
    expect(p.stages[1].latest).toBe(10);
  });

  it('honours custom settings', () => {
    const entries = [
      makeEntry('pullup', '2024-03-01', { grabs: 3, attempts: 3 }),
      makeEntry('pullup', '2024-03-02', { hang: 5 }),
    ];
    const p = stageProgress(PULLUP, entries, {
      unlockNext: true,
      attempts: 3,
      stage1Grabs: 3,
      stage2Hang: 5,
    });
    expect(p.current).toBe(3);
    expect(p.stages[1].unlockedOn).toBe('2024-03-01');
    expect(p.stages[2].unlockedOn).toBe('2024-03-02');
  });

  it('lets a stage-3 entry imply stage 2 unlock', () => {
    const entries = [makeEntry('pullup', '2024-03-10', { level: 50 })];
    const p = stageProgress(PULLUP, entries, ON);
    expect(p.current).toBe(3);
    expect(p.stages[1].unlocked).toBe(true);
    expect(p.stages[1].unlockedOn).toBe('2024-03-10');
    expect(p.stages[2].unlocked).toBe(true);
    expect(p.stages[2].unlockedOn).toBe('2024-03-10');
    expect(p.stages[2].entries).toBe(1);
    expect(p.stages[2].best).toBe(50);
    expect(p.stages[2].latest).toBe(50);
  });

  it('returns null for exercises without stages', () => {
    expect(stageProgress(RUN, [])).toBe(null);
    expect(stageProgress(ROPE, [])).toBe(null);
  });
});

describe('formatGrab', () => {
  it('formats grabs over attempts', () => {
    expect(formatGrab({ values: { grabs: 3, attempts: 5 } })).toBe('3/5');
    expect(formatGrab({ values: { grabs: 0, attempts: 5 } })).toBe('0/5');
  });

  it('uses an en dash for invalid data', () => {
    expect(formatGrab({ values: { grabs: 3 } })).toBe('–');
    expect(formatGrab({ values: { attempts: 5 } })).toBe('–');
    expect(formatGrab({ values: { grabs: 3, attempts: 0 } })).toBe('–');
    expect(formatGrab(null)).toBe('–');
  });
});

/* ------------------------------------------------------------------ */
/* running helpers                                                     */
/* ------------------------------------------------------------------ */

describe('distanceKey', () => {
  it('rounds metres to an integer string and rejects non-positive values', () => {
    expect(distanceKey(400)).toBe('400');
    expect(distanceKey(400.4)).toBe('400');
    expect(distanceKey(400.6)).toBe('401');
    expect(distanceKey(1000)).toBe('1000');
    expect(distanceKey('200')).toBe('200');
    expect(distanceKey(0)).toBe('');
    expect(distanceKey(-1)).toBe('');
    expect(distanceKey(null)).toBe('');
  });
});

describe('runBestByDistance', () => {
  it('keeps the fastest time per metre distance, earliest wins ties', () => {
    const e1 = makeEntry('run', '2024-03-01', { distance: 400, duration: 420 });
    const e2 = makeEntry('run', '2024-03-02', { distance: 400, duration: 400 });
    const e3 = makeEntry('run', '2024-03-03', { distance: 400, duration: 400 });
    const e4 = makeEntry('run', '2024-03-01', { distance: 800, duration: 900 });
    const e5 = makeEntry('run', '2024-03-01', { distance: 100, duration: 0 });

    const best = runBestByDistance(RUN, [e1, e2, e3, e4, e5]);
    expect(best['400']).toEqual({ seconds: 400, date: '2024-03-02', entryId: e2.id });
    expect(best['800'].seconds).toBe(900);
    expect(best['100']).toBeUndefined();
    expect(runDistances(RUN, [e1, e2, e3, e4, e5])).toEqual([400, 800]);
  });
});

describe('runTimeSeries', () => {
  it('returns daily minimum seconds for one metre distance', () => {
    const entries = [
      makeEntry('run', '2024-03-01', { distance: 400, duration: 430 }),
      makeEntry('run', '2024-03-01', { distance: 400, duration: 410 }),
      makeEntry('run', '2024-03-02', { distance: 400, duration: 420 }),
      makeEntry('run', '2024-03-01', { distance: 800, duration: 900 }),
    ];
    expect(runTimeSeries(RUN, entries, 400)).toEqual([
      { date: '2024-03-01', value: 410, count: 2 },
      { date: '2024-03-02', value: 420, count: 1 },
    ]);
  });
});

describe('runCompareLast', () => {
  it('compares a faster latest run with the previous same-distance run', () => {
    const a = makeEntry('run', '2024-03-01', { distance: 400, duration: 420 });
    const b = makeEntry('run', '2024-03-02', { distance: 400, duration: 400 });
    const result = runCompareLast(RUN, [a, b]);
    expect(result).toMatchObject({
      distance: 400,
      seconds: 400,
      previous: 420,
      fasterBy: 20,
      best: 400,
      isPB: true,
    });
  });

  it('returns null fasterBy when slower or equal', () => {
    const a = makeEntry('run', '2024-03-01', { distance: 400, duration: 400 });
    const slower = makeEntry('run', '2024-03-02', { distance: 400, duration: 430 });
    expect(runCompareLast(RUN, [a, slower])).toMatchObject({
      previous: 400,
      fasterBy: null,
      best: 400,
      isPB: false,
    });

    const equal = makeEntry('run', '2024-03-03', { distance: 400, duration: 400 });
    // equal to the most recent same-distance run → no "faster" text
    expect(runCompareLast(RUN, [a, equal])).toMatchObject({
      previous: 400,
      fasterBy: null,
      isPB: false,
    });
    // compared with the most recent earlier run (430), so 400 is 30 s faster but not a PB (ties 400)
    expect(runCompareLast(RUN, [a, slower, equal])).toMatchObject({
      previous: 430,
      fasterBy: 30,
      isPB: false,
    });
  });

  it('never compares different distances', () => {
    const a = makeEntry('run', '2024-03-01', { distance: 400, duration: 400 });
    const b = makeEntry('run', '2024-03-02', { distance: 800, duration: 500 });
    expect(runCompareLast(RUN, [a, b])).toMatchObject({
      distance: 800,
      seconds: 500,
      previous: null,
      fasterBy: null,
      best: 500,
      isPB: false,
    });
  });

  it('returns null with no valid runs', () => {
    expect(runCompareLast(RUN, [])).toBe(null);
    expect(runCompareLast(RUN, [makeEntry('run', '2024-03-01', { distance: 0, duration: 0 })])).toBe(null);
  });
});

/* ------------------------------------------------------------------ */
/* formatting                                                          */
/* ------------------------------------------------------------------ */

describe('formatDistance', () => {
  it('always formats as metres', () => {
    expect(formatDistance(400, 'zh')).toBe('400 米');
    expect(formatDistance(400, 'en')).toBe('400 m');
    expect(formatDistance(1000, 'zh')).toBe('1000 米');
    expect(formatDistance(1000, 'en')).toBe('1000 m');
  });
});

describe('formatDuration', () => {
  it('formats seconds as m:ss', () => {
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(120)).toBe('2:00');
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(null)).toBe('–');
  });
});

describe('formatFaster', () => {
  it('formats Chinese wording including exact minutes', () => {
    expect(formatFaster(5, 'zh')).toBe('快了 5 秒');
    expect(formatFaster(65, 'zh')).toBe('快了 1 分 5 秒');
    expect(formatFaster(120, 'zh')).toBe('快了 2 分');
    expect(formatFaster(61, 'zh')).toBe('快了 1 分 1 秒');
  });

  it('formats English wording including exact minutes', () => {
    expect(formatFaster(5, 'en')).toBe('faster by 5 s');
    expect(formatFaster(65, 'en')).toBe('faster by 1 min 5 s');
    expect(formatFaster(120, 'en')).toBe('faster by 2 min');
    expect(formatFaster(61, 'en')).toBe('faster by 1 min 1 s');
  });

  it('never produces negative wording', () => {
    expect(formatFaster(0, 'zh')).toBe('');
    expect(formatFaster(-5, 'zh')).toBe('');
    expect(formatFaster(null, 'en')).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/* stamps                                                              */
/* ------------------------------------------------------------------ */

describe('stamps', () => {
  it('emits pull-up stage, level and PB stamps in order', () => {
    const s1 = makeEntry('pullup', '2024-03-01', { grabs: 2, attempts: 5 });
    const s2 = makeEntry('pullup', '2024-03-02', { grabs: 4, attempts: 5 });
    const s3 = makeEntry('pullup', '2024-03-03', { hang: 12 });
    const s4 = makeEntry('pullup', '2024-03-04', { level: 25 });
    const s5 = makeEntry('pullup', '2024-03-05', { level: 75 });

    const list = stamps(PULLUP, [s1, s2, s3, s4, s5], ON);
    expect(list.map((s) => s.id)).toEqual([
      'stage:1',
      'stage:2',
      'stage:3',
      'goal:grab:1',
      'level:25',
      'level:50',
      'level:75',
      'pb:grabRate:80',
      'pb:hang:12',
    ]);

    expect(list[0]).toMatchObject({
      id: 'stage:1',
      kind: 'stage',
      icon: '✋',
      label: '第1关 抓杠',
      labelEn: 'Stage 1 · Grab the bar',
      date: '2024-03-01',
    });
    expect(list[1]).toMatchObject({
      id: 'stage:2',
      kind: 'stage',
      icon: '⏱️',
      label: '第2关 悬挂',
      labelEn: 'Stage 2 · Hang',
      date: '2024-03-02',
    });
    expect(list[2]).toMatchObject({
      id: 'stage:3',
      kind: 'stage',
      icon: '💪',
      label: '第3关 引体向上',
      labelEn: 'Stage 3 · Pull up',
      date: '2024-03-03',
    });

    const level75 = list.find((s) => s.id === 'level:75');
    expect(level75).toMatchObject({
      kind: 'level',
      icon: '💪',
      label: '75%',
      valueText: LEVEL_OPTIONS[2].label,
      date: '2024-03-05',
      entryId: s5.id,
    });

    expect(list.find((s) => s.id === 'pb:grabRate:80')).toMatchObject({
      kind: 'pb',
      icon: '✋',
      label: '抓杠最佳',
      labelEn: 'Best grabs',
      valueText: '4/5',
      date: '2024-03-02',
      entryId: s2.id,
    });

    expect(list.find((s) => s.id === 'pb:hang:12')).toMatchObject({
      kind: 'pb',
      icon: '⏱️',
      label: '悬挂最佳',
      labelEn: 'Best hang',
      valueText: '12 秒',
      valueTextEn: '12 s',
      date: '2024-03-03',
      entryId: s3.id,
    });
  });

  it('emits run PB stamps per metre distance', () => {
    const r1 = makeEntry('run', '2024-03-01', { distance: 400, duration: 400 });
    const r2 = makeEntry('run', '2024-03-02', { distance: 400, duration: 380 });
    const r3 = makeEntry('run', '2024-03-01', { distance: 800, duration: 900 });

    const list = stamps(RUN, [r1, r2, r3]);
    expect(list.map((s) => s.id)).toEqual(['pb:run:400:380', 'pb:run:800:900']);
    expect(list[0]).toMatchObject({
      kind: 'pb',
      icon: '🏃',
      label: '400 米最佳',
      labelEn: 'Best 400 m',
      valueText: '6:20',
      date: '2024-03-02',
      entryId: r2.id,
    });
  });

  it('emits a rope reps PB stamp', () => {
    const p1 = makeEntry('rope', '2024-03-01', { reps: 40, duration: 16 });
    const p2 = makeEntry('rope', '2024-03-02', { reps: 60, duration: 20 });
    const list = stamps(ROPE, [p1, p2]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 'pb:reps:60',
      kind: 'pb',
      icon: '🪢',
      label: '跳绳最佳',
      labelEn: 'Best jump rope',
      valueText: '60 次',
      valueTextEn: '60 reps',
      date: '2024-03-02',
      entryId: p2.id,
    });
  });
});

describe('newStampsForSave', () => {
  it('does not emit a PB for the very first record, but does emit stage 1', () => {
    const first = makeEntry('pullup', '2024-03-01', { grabs: 1, attempts: 5 });
    const created = newStampsForSave(PULLUP, [], first, ON);
    expect(created.map((s) => s.id)).toContain('stage:1');
    expect(created.some((s) => s.kind === 'pb')).toBe(false);
  });

  it('emits a PB stamp for a better hang', () => {
    const previous = [
      makeEntry('pullup', '2024-03-01', { grabs: 4, attempts: 5 }),
      makeEntry('pullup', '2024-03-02', { hang: 8 }),
    ];
    const better = makeEntry('pullup', '2024-03-03', { hang: 12 });
    const created = newStampsForSave(PULLUP, previous, better, { unlockNext: true, stage2Hang: 20 });
    expect(created.map((s) => s.id)).toContain('pb:hang:12');
  });

  it('returns [] for a worse hang', () => {
    const previous = [
      makeEntry('pullup', '2024-03-01', { grabs: 4, attempts: 5 }),
      makeEntry('pullup', '2024-03-02', { hang: 12 }),
    ];
    const worse = makeEntry('pullup', '2024-03-03', { hang: 8 });
    expect(newStampsForSave(PULLUP, previous, worse, ON)).toEqual([]);
  });

  it('emits stage:2 when the grab threshold is reached', () => {
    const previous = [makeEntry('pullup', '2024-03-01', { grabs: 3, attempts: 5 })];
    const entry = makeEntry('pullup', '2024-03-02', { grabs: 4, attempts: 5 });
    const created = newStampsForSave(PULLUP, previous, entry, ON);
    expect(created.map((s) => s.id)).toContain('stage:2');
  });

  it('emits level:75 when level 75 is reached', () => {
    const previous = [
      makeEntry('pullup', '2024-03-01', { grabs: 4, attempts: 5 }),
      makeEntry('pullup', '2024-03-02', { hang: 10 }),
    ];
    const entry = makeEntry('pullup', '2024-03-03', { level: 75 });
    const created = newStampsForSave(PULLUP, previous, entry, ON);
    expect(created.map((s) => s.id)).toContain('level:75');
  });
});

/* ------------------------------------------------------------------ */
/* demo seed                                                           */
/* ------------------------------------------------------------------ */

describe('demo seed stages', () => {
  const today = '2024-03-06';

  it('is deterministic with a seeded rng', () => {
    const a = makeDemoEntries(today, mulberry32(1));
    const b = makeDemoEntries(today, mulberry32(1));
    expect(a).toEqual(b);
  });

  it('reaches stage 3 with default settings', () => {
    const entries = makeDemoEntries(today, mulberry32(1));
    const progress = stageProgress(PULLUP, entries, ON);
    expect(progress.current).toBe(3);
    expect(progress.stages[2].unlocked).toBe(true);

    const levels = entries
      .filter((e) => e.exerciseId === 'pullup' && typeof e.values.level === 'number')
      .map((e) => e.values.level);
    expect(Math.max(...levels)).toBe(75);
  });
});

import { bestSoFarSeries, bestBefore } from '../src/metrics.js';

describe('bestSoFarSeries (progress-only curve)', () => {
  const s = [
    { date: '2026-10-01', value: 5 },
    { date: '2026-10-02', value: 3 },
    { date: '2026-10-04', value: 8 },
    { date: '2026-10-05', value: 7 },
  ];
  it('never goes down and marks new-best days', () => {
    const out = bestSoFarSeries(s);
    expect(out.map((p) => p.value)).toEqual([5, 5, 8, 8]);
    expect(out.map((p) => p.isNewBest)).toEqual([true, false, true, false]);
    for (let i = 1; i < out.length; i += 1) expect(out[i].value).toBeGreaterThanOrEqual(out[i - 1].value);
  });
  it('lower-is-better (run time) only improves downward in value', () => {
    const out = bestSoFarSeries([{ date: 'a', value: 400 }, { date: 'b', value: 420 }, { date: 'c', value: 390 }], { lowerIsBetter: true });
    expect(out.map((p) => p.value)).toEqual([400, 400, 390]);
  });
  it('respects the best before the visible range', () => {
    const prior = bestBefore(s, '2026-10-04');
    expect(prior).toBe(5);
    const out = bestSoFarSeries(s.slice(2), { priorBest: prior });
    expect(out.map((p) => p.isNewBest)).toEqual([true, false]);
    expect(bestSoFarSeries([{ date: 'x', value: 4 }], { priorBest: 6 })[0]).toMatchObject({ value: 6, isNewBest: false });
  });
});


describe('challenge mode (stage 1 only, goal stamps)', () => {
  const ch = (date, grabs, id, sequence) =>
    ({ ...makeEntry('pullup', date, { grabs, attempts: 5, ...(sequence ? { sequence } : {}) }), id });

  it('does not unlock stage 2 by default even at 5/5', () => {
    const p = stageProgress(PULLUP, [ch('2024-03-01', 5, 'a')]);
    expect(p.current).toBe(1);
    expect(p.stages[1].unlocked).toBe(false);
    expect(stamps(PULLUP, [ch('2024-03-01', 5, 'a')]).some((s) => s.id === 'stage:2')).toBe(false);
  });

  it('awards a goal stamp for each challenge reaching >= 4/5', () => {
    const a = ch('2024-03-01', 3, 'a', [1, 0, 1, 0, 1]);
    const b = ch('2024-03-01', 4, 'b', [1, 1, 0, 1, 1]);
    expect(newStampsForSave(PULLUP, [a], b).map((s) => s.id)).toContain('goal:grab:1');
    const c = ch('2024-03-02', 5, 'c');
    const fresh = newStampsForSave(PULLUP, [a, b], c);
    expect(fresh.map((s) => s.id)).toContain('goal:grab:2');
    const goal = stamps(PULLUP, [a, b, c]).find((s) => s.kind === 'goal');
    expect(goal.valueText).toBe('4/5 ×2');
    // a 3/5 after that earns nothing new
    expect(newStampsForSave(PULLUP, [a, b, c], ch('2024-03-03', 3, 'd'))).toEqual([]);
  });

  it('keeps several challenges per day; chart uses the best of the day', () => {
    const list = [ch('2024-03-01', 2, 'a'), ch('2024-03-01', 4, 'b'), ch('2024-03-01', 3, 'c')];
    const series = dailySeries(PULLUP, list, 'grabRate');
    expect(series).toEqual([{ date: '2024-03-01', value: 80, count: 3 }]);
    expect(attemptsOnDay(list, 'pullup', '2024-03-01')).toBe(3);
  });
});

describe('locked stages keep their stickers hidden', () => {
  it('no hang / level stickers while unlocking is off', () => {
    const list = [
      makeEntry('pullup', '2024-03-01', { grabs: 2, attempts: 5 }),
      makeEntry('pullup', '2024-03-02', { hang: 12 }),
      makeEntry('pullup', '2024-03-03', { level: 50 }),
    ];
    const ids = stamps(PULLUP, list).map((s) => s.id);
    expect(ids.some((id) => id.startsWith('level:') || id.startsWith('pb:hang'))).toBe(false);
    const on = stamps(PULLUP, list, { unlockNext: true }).map((s) => s.id);
    expect(on).toContain('level:50');
    expect(on.some((id) => id.startsWith('pb:hang'))).toBe(true);
  });
});
