import { describe, it, expect } from 'vitest';
import {
  addDays,
  daysBetween,
  toDateStr,
  startOfWeek,
  entryValue,
  entriesFor,
  dailySeries,
  movingAverage,
  personalBest,
  cumulativeTotal,
  streakDays,
  latestAndPrevious,
  vsLastMonth,
  bestInPeriod,
  attemptsOnDay,
  weeklySummary,
  milestones,
  filterRange,
  isNewPB,
  formatValue,
} from '../src/metrics.js';
import { PRESET_EXERCISES, getMetric } from '../src/presets.js';
import { makeDemoEntries, mulberry32 } from '../src/seed.js';
import { t } from '../src/i18n.js';

const PULLUP = PRESET_EXERCISES.find((e) => e.id === 'pullup');
const RUN = PRESET_EXERCISES.find((e) => e.id === 'run');
const ROPE = PRESET_EXERCISES.find((e) => e.id === 'rope');

let uid = 0;
function makeEntry(exerciseId, date, values, createdAt) {
  uid += 1;
  return {
    id: `t${uid}`,
    exerciseId,
    date,
    createdAt: createdAt === undefined ? 1700000000000 + uid : createdAt,
    values,
  };
}

/* ------------------------------------------------------------------ */
/* presets                                                             */
/* ------------------------------------------------------------------ */

describe('presets', () => {
  it('lists pull-up first and all three sports', () => {
    expect(PRESET_EXERCISES.map((e) => e.id)).toEqual(['pullup', 'run', 'rope']);
    expect(PRESET_EXERCISES[0].icon).toBe('🧗');
  });

  it('uses the single brand color', () => {
    for (const ex of PRESET_EXERCISES) expect(ex.color).toBe('#0B3D91');
  });

  it('describes weekly goals', () => {
    expect(PULLUP.weekly).toEqual({ metric: null, mode: 'count' });
    expect(RUN.weekly).toEqual({ metric: 'distance', mode: 'sum' });
    expect(ROPE.weekly).toEqual({ metric: 'reps', mode: 'sum' });
  });

  it('marks pace as derived and lower-is-better', () => {
    const pace = getMetric(RUN, 'pace');
    expect(pace.derived).toBe(true);
    expect(pace.input).toBe(false);
    expect(pace.higherIsBetter).toBe(false);
    expect(RUN.chartMetrics).toEqual(['distance', 'pace']);
    expect(RUN.defaultChartMetric).toBe('distance');
  });

  it('getMetric returns null for unknown keys', () => {
    expect(getMetric(RUN, 'nope')).toBe(null);
    expect(getMetric(null, 'distance')).toBe(null);
    expect(getMetric(RUN, 'distance').unitEn).toBe('km');
  });
});

/* ------------------------------------------------------------------ */
/* dates                                                               */
/* ------------------------------------------------------------------ */

describe('date helpers', () => {
  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01');
    expect(addDays('2023-12-31', 1)).toBe('2024-01-01');
    expect(addDays('2024-01-01', -1)).toBe('2023-12-31');
    expect(addDays('2024-03-10', 1)).toBe('2024-03-11');
    expect(addDays('2024-03-10', 0)).toBe('2024-03-10');
    expect(addDays('2024-03-10', -30)).toBe('2024-02-09');
  });

  it('is timezone safe around DST switches', () => {
    expect(addDays('2024-03-09', 1)).toBe('2024-03-10');
    expect(addDays('2024-11-03', 1)).toBe('2024-11-04');
    expect(daysBetween('2024-03-09', '2024-03-11')).toBe(2);
  });

  it('computes daysBetween', () => {
    expect(daysBetween('2024-03-11', '2024-03-09')).toBe(-2);
    expect(daysBetween('2024-03-09', '2024-03-09')).toBe(0);
    expect(daysBetween('2023-12-31', '2024-01-01')).toBe(1);
  });

  it('formats a local Date object', () => {
    expect(toDateStr(new Date(2024, 2, 5, 23, 30))).toBe('2024-03-05');
    expect(toDateStr(new Date(2024, 0, 1, 0, 0))).toBe('2024-01-01');
  });

  it('startOfWeek lands on Monday', () => {
    expect(startOfWeek('2024-03-06')).toBe('2024-03-04'); // Wed
    expect(startOfWeek('2024-03-04')).toBe('2024-03-04'); // Mon
    expect(startOfWeek('2024-03-10')).toBe('2024-03-04'); // Sun
    expect(startOfWeek('2024-01-01')).toBe('2024-01-01'); // Mon
  });
});

/* ------------------------------------------------------------------ */
/* entryValue                                                          */
/* ------------------------------------------------------------------ */

describe('entryValue', () => {
  it('reads plain values', () => {
    expect(entryValue(PULLUP, makeEntry('pullup', '2024-03-01', { hang: 12 }), 'hang')).toBe(12);
    expect(entryValue(ROPE, makeEntry('rope', '2024-03-01', { reps: '30' }), 'reps')).toBe(30);
  });

  it('returns null for missing / invalid values', () => {
    expect(entryValue(PULLUP, makeEntry('pullup', '2024-03-01', {}), 'hang')).toBe(null);
    expect(entryValue(PULLUP, makeEntry('pullup', '2024-03-01', { hang: 'abc' }), 'hang')).toBe(null);
    expect(entryValue(PULLUP, makeEntry('pullup', '2024-03-01', { hang: null }), 'hang')).toBe(null);
    expect(entryValue(PULLUP, null, 'hang')).toBe(null);
  });

  it('derives pace from duration / distance', () => {
    const e = makeEntry('run', '2024-03-01', { distance: 2, duration: 15 });
    expect(entryValue(RUN, e, 'pace')).toBe(7.5);
  });

  it('derives no pace when distance is zero or missing', () => {
    expect(entryValue(RUN, makeEntry('run', '2024-03-01', { distance: 0, duration: 15 }), 'pace')).toBe(null);
    expect(entryValue(RUN, makeEntry('run', '2024-03-01', { distance: 2 }), 'pace')).toBe(null);
    expect(entryValue(RUN, makeEntry('run', '2024-03-01', { duration: 15 }), 'pace')).toBe(null);
  });
});

/* ------------------------------------------------------------------ */
/* entriesFor                                                          */
/* ------------------------------------------------------------------ */

describe('entriesFor', () => {
  it('filters by exercise and sorts by date then createdAt', () => {
    const a = makeEntry('pullup', '2024-03-02', { hang: 1 }, 500);
    const b = makeEntry('pullup', '2024-03-01', { hang: 2 }, 400);
    const c = makeEntry('pullup', '2024-03-01', { hang: 3 }, 300);
    const d = makeEntry('run', '2024-03-01', { distance: 1 }, 100);

    const sorted = entriesFor([a, b, c, d], 'pullup');
    expect(sorted.map((e) => e.id)).toEqual([c.id, b.id, a.id]);
  });

  it('returns [] for empty input', () => {
    expect(entriesFor([], 'pullup')).toEqual([]);
    expect(entriesFor(undefined, 'pullup')).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* dailySeries                                                         */
/* ------------------------------------------------------------------ */

describe('dailySeries', () => {
  it('aggregates with exercise max and counts attempts', () => {
    const entries = [
      makeEntry('pullup', '2024-03-02', { hang: 12 }),
      makeEntry('pullup', '2024-03-01', { hang: 10 }),
      makeEntry('pullup', '2024-03-01', { hang: 15 }),
    ];
    const series = dailySeries(PULLUP, entries, 'hang');
    expect(series).toEqual([
      { date: '2024-03-01', value: 15, count: 2 },
      { date: '2024-03-02', value: 12, count: 1 },
    ]);
  });

  it('sums distances per day for running', () => {
    const entries = [
      makeEntry('run', '2024-03-01', { distance: 1, duration: 8 }),
      makeEntry('run', '2024-03-01', { distance: 2, duration: 16 }),
    ];
    const series = dailySeries(RUN, entries, 'distance');
    expect(series).toEqual([{ date: '2024-03-01', value: 3, count: 2 }]);
  });

  it('aggregates pace as sum(duration)/sum(distance) per day', () => {
    const entries = [
      makeEntry('run', '2024-03-01', { distance: 1, duration: 8 }),
      makeEntry('run', '2024-03-01', { distance: 2, duration: 16 }),
      makeEntry('run', '2024-03-03', { distance: 1, duration: 6 }),
    ];
    const series = dailySeries(RUN, entries, 'pace');
    expect(series).toEqual([
      { date: '2024-03-01', value: 8, count: 2 },
      { date: '2024-03-03', value: 6, count: 1 },
    ]);
  });

  it('skips days where the metric is missing', () => {
    const entries = [
      makeEntry('pullup', '2024-03-01', { reps: 1 }),
      makeEntry('pullup', '2024-03-02', { hang: 9 }),
    ];
    const series = dailySeries(PULLUP, entries, 'hang');
    expect(series).toEqual([{ date: '2024-03-02', value: 9, count: 1 }]);
  });

  it('supports avg aggregation', () => {
    const squat = { id: 'squat', aggregation: 'avg', metrics: [{ key: 'v', higherIsBetter: true }] };
    const entries = [
      makeEntry('squat', '2024-03-01', { v: 2 }),
      makeEntry('squat', '2024-03-01', { v: 3 }),
    ];
    expect(dailySeries(squat, entries, 'v')).toEqual([{ date: '2024-03-01', value: 2.5, count: 2 }]);
  });

  it('returns [] when there are no entries', () => {
    expect(dailySeries(PULLUP, [], 'hang')).toEqual([]);
    expect(dailySeries(PULLUP, undefined, 'hang')).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* movingAverage                                                       */
/* ------------------------------------------------------------------ */

describe('movingAverage', () => {
  it('averages what is available at the start', () => {
    expect(movingAverage([1, 2, 3, 4], 2)).toEqual([1, 1.5, 2.5, 3.5]);
    expect(movingAverage([1, 2, 3, 4], 3)).toEqual([1, 1.5, 2, 3]);
  });

  it('defaults to a 7 point window', () => {
    const values = Array.from({ length: 8 }, (_, i) => i + 1);
    const ma = movingAverage(values);
    expect(ma.length).toBe(8);
    expect(ma[6]).toBeCloseTo(4, 10);
    expect(ma[7]).toBeCloseTo(5, 10);
  });

  it('handles empty input', () => {
    expect(movingAverage([], 7)).toEqual([]);
    expect(movingAverage(undefined)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* personalBest / cumulativeTotal                                      */
/* ------------------------------------------------------------------ */

describe('personalBest', () => {
  it('picks the max for higher-is-better metrics', () => {
    const entries = [
      makeEntry('pullup', '2024-03-01', { hang: 10 }),
      makeEntry('pullup', '2024-03-02', { hang: 15 }),
      makeEntry('pullup', '2024-03-03', { hang: 15 }),
    ];
    const pb = personalBest(PULLUP, entries, 'hang');
    expect(pb).toEqual({ value: 15, date: '2024-03-02', entryId: entries[1].id });
  });

  it('picks the min for pace (lower is better)', () => {
    const entries = [
      makeEntry('run', '2024-03-01', { distance: 1, duration: 8 }),
      makeEntry('run', '2024-03-02', { distance: 1, duration: 6 }),
      makeEntry('run', '2024-03-03', { distance: 1, duration: 7 }),
    ];
    const pb = personalBest(RUN, entries, 'pace');
    expect(pb.value).toBe(6);
    expect(pb.date).toBe('2024-03-02');
  });

  it('returns null with no data', () => {
    expect(personalBest(PULLUP, [], 'hang')).toBe(null);
  });
});

describe('cumulativeTotal', () => {
  it('sums all entry values', () => {
    const entries = [
      makeEntry('pullup', '2024-03-01', { hang: 10 }),
      makeEntry('pullup', '2024-03-02', { hang: 5 }),
      makeEntry('pullup', '2024-03-02', { reps: 2 }),
    ];
    expect(cumulativeTotal(PULLUP, entries, 'hang')).toBe(15);
  });

  it('returns 0 with no data', () => {
    expect(cumulativeTotal(PULLUP, [], 'hang')).toBe(0);
  });

  it('returns null for pace', () => {
    const entries = [makeEntry('run', '2024-03-01', { distance: 1, duration: 8 })];
    expect(cumulativeTotal(RUN, entries, 'pace')).toBe(null);
  });
});

/* ------------------------------------------------------------------ */
/* streakDays                                                          */
/* ------------------------------------------------------------------ */

describe('streakDays', () => {
  const today = '2024-03-10';

  it('counts consecutive days ending today', () => {
    const entries = [
      makeEntry('pullup', '2024-03-08', { hang: 5 }),
      makeEntry('pullup', '2024-03-09', { hang: 6 }),
      makeEntry('pullup', '2024-03-10', { hang: 7 }),
    ];
    expect(streakDays(entries, today)).toBe(3);
  });

  it('counts ending yesterday when today is empty', () => {
    const entries = [
      makeEntry('pullup', '2024-03-08', { hang: 5 }),
      makeEntry('run', '2024-03-09', { distance: 1 }),
    ];
    expect(streakDays(entries, today)).toBe(2);
  });

  it('returns 0 when today and yesterday are both empty', () => {
    const entries = [makeEntry('pullup', '2024-03-07', { hang: 5 })];
    expect(streakDays(entries, today)).toBe(0);
  });

  it('breaks on gaps and ignores duplicate days', () => {
    const gapped = [
      makeEntry('pullup', '2024-03-10', { hang: 5 }),
      makeEntry('pullup', '2024-03-08', { hang: 5 }),
    ];
    expect(streakDays(gapped, today)).toBe(1);

    const dupes = [
      makeEntry('pullup', '2024-03-10', { hang: 5 }),
      makeEntry('pullup', '2024-03-10', { hang: 6 }),
      makeEntry('pullup', '2024-03-09', { hang: 6 }),
    ];
    expect(streakDays(dupes, today)).toBe(2);
  });

  it('returns 0 for no data', () => {
    expect(streakDays([], today)).toBe(0);
    expect(streakDays(undefined, today)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* latestAndPrevious                                                   */
/* ------------------------------------------------------------------ */

describe('latestAndPrevious', () => {
  it('uses entry order, not array order', () => {
    const older = makeEntry('pullup', '2024-03-01', { hang: 5 });
    const newer = makeEntry('pullup', '2024-03-05', { hang: 8 });
    const result = latestAndPrevious(PULLUP, [newer, older], 'hang');
    expect(result.latest).toEqual({ value: 8, date: '2024-03-05' });
    expect(result.previous).toEqual({ value: 5, date: '2024-03-01' });
    expect(result.diff).toBe(3);
  });

  it('skips entries without a value', () => {
    const entries = [
      makeEntry('pullup', '2024-03-01', { hang: 4 }),
      makeEntry('pullup', '2024-03-02', { reps: 1 }),
      makeEntry('pullup', '2024-03-03', { hang: 9 }),
    ];
    const result = latestAndPrevious(PULLUP, entries, 'hang');
    expect(result.latest.value).toBe(9);
    expect(result.previous.value).toBe(4);
  });

  it('returns nulls when there is only one value', () => {
    const result = latestAndPrevious(PULLUP, [makeEntry('pullup', '2024-03-01', { hang: 4 })], 'hang');
    expect(result.latest).toEqual({ value: 4, date: '2024-03-01' });
    expect(result.previous).toBe(null);
    expect(result.diff).toBe(null);
  });

  it('returns nulls with no data', () => {
    expect(latestAndPrevious(PULLUP, [], 'hang')).toEqual({ latest: null, previous: null, diff: null });
  });
});

/* ------------------------------------------------------------------ */
/* vsLastMonth                                                         */
/* ------------------------------------------------------------------ */

function fillDays(exerciseId, values, fromDate, toDate) {
  const out = [];
  let cursor = fromDate;
  let guard = 0;
  while (cursor <= toDate && guard < 200) {
    out.push(makeEntry(exerciseId, cursor, values));
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return out;
}

describe('vsLastMonth', () => {
  const today = '2024-03-10'; // current 2024-02-10..2024-03-10, previous 2024-01-11..2024-02-09

  it('reports an improvement for higher-is-better metrics', () => {
    const entries = [
      ...fillDays('pullup', { hang: 10 }, '2024-02-10', today),
      ...fillDays('pullup', { hang: 5 }, '2024-01-11', '2024-02-09'),
    ];
    const result = vsLastMonth(PULLUP, entries, 'hang', today);
    expect(result.pct).toBe(100);
    expect(result.direction).toBe('up');
  });

  it('treats a lower pace as an improvement', () => {
    const entries = [
      ...fillDays('run', { distance: 1, duration: 6 }, '2024-02-10', today),
      ...fillDays('run', { distance: 1, duration: 8 }, '2024-01-11', '2024-02-09'),
    ];
    const result = vsLastMonth(RUN, entries, 'pace', today);
    expect(result.pct).toBe(25);
    expect(result.direction).toBe('up');
  });

  it('reports down when the pace gets worse', () => {
    const entries = [
      ...fillDays('run', { distance: 1, duration: 9 }, '2024-02-10', today),
      ...fillDays('run', { distance: 1, duration: 6 }, '2024-01-11', '2024-02-09'),
    ];
    const result = vsLastMonth(RUN, entries, 'pace', today);
    expect(result.direction).toBe('down');
    expect(result.pct).toBe(-50);
  });

  it('is flat for equal means and for sub-1% changes', () => {
    const equal = [
      ...fillDays('pullup', { hang: 10 }, '2024-02-10', today),
      ...fillDays('pullup', { hang: 10 }, '2024-01-11', '2024-02-09'),
    ];
    expect(vsLastMonth(PULLUP, equal, 'hang', today)).toEqual({ pct: 0, direction: 'flat' });

    const tiny = [
      ...fillDays('pullup', { hang: 100.5 }, '2024-02-10', today),
      ...fillDays('pullup', { hang: 100 }, '2024-01-11', '2024-02-09'),
    ];
    expect(vsLastMonth(PULLUP, tiny, 'hang', today).direction).toBe('flat');
  });

  it('returns null when a window is empty', () => {
    const onlyCurrent = fillDays('pullup', { hang: 10 }, '2024-02-10', today);
    expect(vsLastMonth(PULLUP, onlyCurrent, 'hang', today)).toEqual({ pct: null, direction: null });
    expect(vsLastMonth(PULLUP, [], 'hang', today)).toEqual({ pct: null, direction: null });
  });

  it('returns null when the previous mean is zero', () => {
    const entries = [
      ...fillDays('pullup', { hang: 10 }, '2024-02-10', today),
      ...fillDays('pullup', { hang: 0 }, '2024-01-11', '2024-02-09'),
    ];
    expect(vsLastMonth(PULLUP, entries, 'hang', today)).toEqual({ pct: null, direction: null });
  });
});

/* ------------------------------------------------------------------ */
/* bestInPeriod / attemptsOnDay                                        */
/* ------------------------------------------------------------------ */

describe('bestInPeriod', () => {
  it('is inclusive on both ends', () => {
    const entries = [
      makeEntry('pullup', '2024-03-01', { hang: 5 }),
      makeEntry('pullup', '2024-03-05', { hang: 12 }),
      makeEntry('pullup', '2024-03-10', { hang: 8 }),
    ];
    expect(bestInPeriod(PULLUP, entries, 'hang', '2024-03-02', '2024-03-10')).toBe(12);
    expect(bestInPeriod(PULLUP, entries, 'hang', '2024-03-01', '2024-03-01')).toBe(5);
    expect(bestInPeriod(PULLUP, entries, 'hang', '2024-03-06', '2024-03-09')).toBe(null);
  });

  it('takes the minimum for pace', () => {
    const entries = [
      makeEntry('run', '2024-03-01', { distance: 1, duration: 7 }),
      makeEntry('run', '2024-03-05', { distance: 1, duration: 6 }),
      makeEntry('run', '2024-03-10', { distance: 1, duration: 9 }),
    ];
    expect(bestInPeriod(RUN, entries, 'pace', '2024-03-01', '2024-03-10')).toBe(6);
  });
});

describe('attemptsOnDay', () => {
  it('counts attempts only for the given exercise and day', () => {
    const entries = [
      makeEntry('pullup', '2024-03-01', { hang: 5 }),
      makeEntry('pullup', '2024-03-01', { hang: 6 }),
      makeEntry('run', '2024-03-01', { distance: 1 }),
      makeEntry('pullup', '2024-03-02', { hang: 7 }),
    ];
    expect(attemptsOnDay(entries, 'pullup', '2024-03-01')).toBe(2);
    expect(attemptsOnDay(entries, 'run', '2024-03-01')).toBe(1);
    expect(attemptsOnDay(entries, 'rope', '2024-03-01')).toBe(0);
    expect(attemptsOnDay(entries, null, '2024-03-01')).toBe(3);
    expect(attemptsOnDay([], 'pullup', '2024-03-01')).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* weeklySummary / milestones / filterRange                            */
/* ------------------------------------------------------------------ */

describe('weeklySummary', () => {
  const today = '2024-03-06'; // Wednesday, week starts 2024-03-04

  it('counts tries for pull-up and sums metrics for run and rope', () => {
    const entries = [
      makeEntry('pullup', '2024-03-03', { hang: 5 }), // previous week
      makeEntry('pullup', '2024-03-04', { hang: 6 }),
      makeEntry('pullup', '2024-03-06', { hang: 7 }),
      makeEntry('run', '2024-03-05', { distance: 1.5, duration: 11 }),
      makeEntry('run', '2024-03-06', { distance: 2, duration: 14 }),
      makeEntry('run', '2024-03-07', { distance: 5, duration: 30 }), // after today
    ];
    const summary = weeklySummary(PRESET_EXERCISES, entries, today);
    expect(summary).toEqual([
      { exerciseId: 'pullup', value: 2 },
      { exerciseId: 'run', value: 3.5 },
      { exerciseId: 'rope', value: 0 },
    ]);
  });

  it('handles empty input', () => {
    const summary = weeklySummary([], [], today);
    expect(summary).toEqual([]);
  });
});

describe('milestones', () => {
  it('lists reached steps and the next goal', () => {
    expect(milestones(0)).toEqual({ reached: [], next: 100 });
    expect(milestones(99)).toEqual({ reached: [], next: 100 });
    expect(milestones(100)).toEqual({ reached: [100], next: 500 });
    expect(milestones(600)).toEqual({ reached: [100, 500], next: 1000 });
    expect(milestones(5000)).toEqual({ reached: [100, 500, 1000], next: null });
  });

  it('accepts custom steps and bad input', () => {
    expect(milestones(30, [10, 20, 50])).toEqual({ reached: [10, 20], next: 50 });
    expect(milestones(null)).toEqual({ reached: [], next: 100 });
  });
});

describe('filterRange', () => {
  const today = '2024-03-10';
  const series = [
    { date: '2024-01-01', value: 1, count: 1 },
    { date: '2024-02-10', value: 2, count: 1 },
    { date: '2024-03-04', value: 3, count: 1 },
    { date: '2024-03-10', value: 4, count: 1 },
  ];

  it('filters the last 7 days including today', () => {
    expect(filterRange(series, '7d', today).map((p) => p.date)).toEqual(['2024-03-04', '2024-03-10']);
  });

  it('filters the last 30 days including today', () => {
    expect(filterRange(series, '30d', today).map((p) => p.date)).toEqual([
      '2024-02-10',
      '2024-03-04',
      '2024-03-10',
    ]);
  });

  it('returns everything for "all"', () => {
    expect(filterRange(series, 'all', today)).toHaveLength(4);
    expect(filterRange([], '7d', today)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* isNewPB                                                             */
/* ------------------------------------------------------------------ */

describe('isNewPB', () => {
  it('detects a new best for every chart metric', () => {
    const previous = [
      makeEntry('pullup', '2024-03-01', { hang: 10, reps: 1 }),
      makeEntry('pullup', '2024-03-02', { hang: 8, reps: 2 }),
    ];
    const next = makeEntry('pullup', '2024-03-03', { hang: 12, reps: 3 });
    expect(isNewPB(PULLUP, previous, next)).toEqual(['hang', 'reps']);
  });

  it('requires strictly beating previous values', () => {
    const previous = [makeEntry('pullup', '2024-03-01', { hang: 10 })];
    const tied = makeEntry('pullup', '2024-03-02', { hang: 10 });
    expect(isNewPB(PULLUP, previous, tied)).toEqual([]);
  });

  it('counts a first positive value but not a zero', () => {
    const zero = makeEntry('pullup', '2024-03-01', { hang: 0, reps: 0 });
    expect(isNewPB(PULLUP, [], zero)).toEqual([]);

    const first = makeEntry('pullup', '2024-03-01', { hang: 5, reps: 0 });
    expect(isNewPB(PULLUP, [], first)).toEqual(['hang']);
  });

  it('treats a lower pace as a new PB', () => {
    const previous = [makeEntry('run', '2024-03-01', { distance: 1, duration: 8 })];
    const faster = makeEntry('run', '2024-03-02', { distance: 1, duration: 6 });
    const slower = makeEntry('run', '2024-03-03', { distance: 1, duration: 9 });
    expect(isNewPB(RUN, previous, faster)).toContain('pace');
    expect(isNewPB(RUN, previous, slower)).not.toContain('pace');
  });

  it('ignores missing metrics in the new entry', () => {
    const previous = [makeEntry('pullup', '2024-03-01', { hang: 10, reps: 1 })];
    const next = makeEntry('pullup', '2024-03-02', { hang: 12 });
    expect(isNewPB(PULLUP, previous, next)).toEqual(['hang']);
  });
});

/* ------------------------------------------------------------------ */
/* formatValue                                                         */
/* ------------------------------------------------------------------ */

describe('formatValue', () => {
  const hangMetric = getMetric(PULLUP, 'hang');
  const distanceMetric = getMetric(RUN, 'distance');
  const paceMetric = getMetric(RUN, 'pace');

  it('renders an en dash for missing values', () => {
    expect(formatValue(hangMetric, null)).toBe('–');
    expect(formatValue(hangMetric, undefined)).toBe('–');
    expect(formatValue(hangMetric, NaN)).toBe('–');
  });

  it('rounds int metrics', () => {
    expect(formatValue(hangMetric, 12)).toBe('12');
    expect(formatValue(hangMetric, 5.6)).toBe('6');
  });

  it('trims decimals to at most 2 places', () => {
    expect(formatValue(distanceMetric, 5.2)).toBe('5.2');
    expect(formatValue(distanceMetric, 5.0)).toBe('5');
    expect(formatValue(distanceMetric, '1.256')).toBe('1.26');
  });

  it('renders pace as m:ss', () => {
    expect(formatValue(paceMetric, 6.5)).toBe('6:30');
    expect(formatValue(paceMetric, 6)).toBe('6:00');
    expect(formatValue(paceMetric, 10)).toBe('10:00');
    expect(formatValue(paceMetric, 6.05)).toBe('6:03');
  });
});

/* ------------------------------------------------------------------ */
/* i18n                                                                */
/* ------------------------------------------------------------------ */

describe('i18n', () => {
  it('translates with params', () => {
    expect(t('triesToday', 'zh', { n: 3 })).toBe('今天试了 3 次');
    expect(t('triesToday', 'en', { n: 3 })).toBe('3 tries today');
  });

  it('leaves missing params untouched', () => {
    expect(t('triesToday', 'en')).toBe('{n} tries today');
    expect(t('triesToday', 'en', { other: 1 })).toBe('{n} tries today');
  });

  it('falls back to zh and then to the key', () => {
    expect(t('save', 'fr')).toBe('保存');
    expect(t('unknown_key_xyz', 'en')).toBe('unknown_key_xyz');
  });
});

/* ------------------------------------------------------------------ */
/* seed                                                                */
/* ------------------------------------------------------------------ */

describe('seed', () => {
  const today = '2024-03-06';

  it('is deterministic with a seeded rng', () => {
    const a = makeDemoEntries(today, mulberry32(1));
    const b = makeDemoEntries(today, mulberry32(1));
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(20);
  });

  it('produces entries for all three exercises', () => {
    const entries = makeDemoEntries(today, mulberry32(1));
    const ids = new Set(entries.map((e) => e.exerciseId));
    expect(ids.has('pullup')).toBe(true);
    expect(ids.has('run')).toBe(true);
    expect(ids.has('rope')).toBe(true);
  });

  it('stays inside the last 75 days and uses unique ids', () => {
    const entries = makeDemoEntries(today, mulberry32(7));
    const ids = new Set(entries.map((e) => e.id));
    expect(ids.size).toBe(entries.length);

    for (const e of entries) {
      expect(e.date >= '2023-12-23').toBe(true);
      expect(e.date <= today).toBe(true);
      expect(typeof e.createdAt).toBe('number');
      expect(e.values).toBeTypeOf('object');
    }
  });

  it('has a gentle upward trend for pull-up hang', () => {
    const entries = makeDemoEntries(today, mulberry32(3)).filter((e) => e.exerciseId === 'pullup');
    const first = entries.slice(0, 5);
    const last = entries.slice(-5);
    const avg = (list) => list.reduce((sum, e) => sum + e.values.hang, 0) / list.length;
    expect(avg(last)).toBeGreaterThan(avg(first));
  });

  it('keeps run duration close to distance * 7.5', () => {
    const runs = makeDemoEntries(today, mulberry32(1)).filter((e) => e.exerciseId === 'run');
    for (const r of runs) {
      const expected = r.values.distance * 7.5;
      expect(Math.abs(r.values.duration - expected)).toBeLessThanOrEqual(expected * 0.1 + 0.05);
    }
  });

  it('works with Math.random too', () => {
    const entries = makeDemoEntries(today);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('mulberry32 stays within [0, 1)', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 200; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
