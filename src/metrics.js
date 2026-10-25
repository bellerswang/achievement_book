// Pure metric helpers for 成就本. No DOM, no Date.now().
// Dates are always local-date strings: 'YYYY-MM-DD'.

import { PULLUP_DEFAULTS, LEVEL_OPTIONS } from './presets.js';

const DAY_MS = 86400000;

/* ------------------------------------------------------------------ */
/* small internals                                                     */
/* ------------------------------------------------------------------ */

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toNum(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function roundTo(n, digits) {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

function dateToUTC(dateStr) {
  if (typeof dateStr !== 'string') return NaN;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return NaN;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return NaN;
  return Date.UTC(y, m - 1, d);
}

function utcToDateStr(ms) {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function metricOf(exercise, key) {
  if (!exercise || !Array.isArray(exercise.metrics)) return null;
  return exercise.metrics.find((m) => m && m.key === key) || null;
}

function higherIsBetterOf(exercise, key) {
  const m = metricOf(exercise, key);
  if (!m) return true;
  return m.higherIsBetter !== false;
}

function aggregate(values, mode) {
  if (!values.length) return null;
  if (mode === 'sum') return values.reduce((a, b) => a + b, 0);
  if (mode === 'avg') return values.reduce((a, b) => a + b, 0) / values.length;
  if (mode === 'min') return Math.min(...values);
  return Math.max(...values);
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function firstDate(list) {
  return list.length ? list[0].date : null;
}

function minDateStr(values) {
  const valid = values.filter((v) => typeof v === 'string' && v !== '');
  if (!valid.length) return null;
  return valid.slice().sort()[0];
}

function validRun(entry) {
  if (!entry) return null;
  const values = entry.values || {};
  const distance = toNum(values.distance);
  const seconds = toNum(values.duration);
  if (distance === null || seconds === null) return null;
  if (distance <= 0 || seconds <= 0) return null;
  return { distance, seconds };
}

/* ------------------------------------------------------------------ */
/* date helpers (all UTC math, timezone safe)                          */
/* ------------------------------------------------------------------ */

export function addDays(dateStr, n) {
  const base = dateToUTC(dateStr);
  if (!Number.isFinite(base)) return dateStr;
  return utcToDateStr(base + Math.trunc(n) * DAY_MS);
}

export function daysBetween(a, b) {
  const da = dateToUTC(a);
  const db = dateToUTC(b);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return NaN;
  return Math.round((db - da) / DAY_MS);
}

export function toDateStr(dateObj) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return '';
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
}

export function startOfWeek(dateStr) {
  const base = dateToUTC(dateStr);
  if (!Number.isFinite(base)) return dateStr;
  const dow = new Date(base).getUTCDay(); // 0 = Sunday ... 6 = Saturday
  const back = (dow + 6) % 7; // days since Monday
  return utcToDateStr(base - back * DAY_MS);
}

/* ------------------------------------------------------------------ */
/* entries                                                             */
/* ------------------------------------------------------------------ */

export function entryValue(exercise, entry, key) {
  if (!exercise || !entry) return null;
  const values = entry.values || {};

  if (key === 'pace') {
    const distance = toNum(values.distance);
    const duration = toNum(values.duration);
    if (distance === null || duration === null) return null;
    if (distance <= 0) return null;
    return duration / distance;
  }

  if (key === 'grabRate') {
    const grabs = toNum(values.grabs);
    const attempts = toNum(values.attempts);
    if (grabs === null || attempts === null || attempts <= 0) return null;
    return Math.round((grabs / attempts) * 100);
  }

  const metric = metricOf(exercise, key);
  if (metric && metric.derived) return null;

  return toNum(values[key]);
}

export function entriesFor(entries, exerciseId) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((e) => e && e.exerciseId === exerciseId)
    .sort((a, b) => {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
}

/* ------------------------------------------------------------------ */
/* series                                                              */
/* ------------------------------------------------------------------ */

export function dailySeries(exercise, entries, key) {
  if (!exercise) return [];
  const list = entriesFor(entries, exercise.id);
  const buckets = new Map();
  const metric = metricOf(exercise, key);
  const forceMin =
    !!metric && metric.higherIsBetter === false && exercise.aggregation === 'sum';

  for (const e of list) {
    let bucket = buckets.get(e.date);
    if (!bucket) {
      bucket = { date: e.date, values: [], dur: 0, dist: 0, paceCount: 0 };
      buckets.set(e.date, bucket);
    }

    if (key === 'pace') {
      const distance = toNum((e.values || {}).distance);
      const duration = toNum((e.values || {}).duration);
      if (distance !== null && duration !== null && distance > 0) {
        bucket.dur += duration;
        bucket.dist += distance;
        bucket.paceCount += 1;
      }
    } else {
      const v = entryValue(exercise, e, key);
      if (v !== null) bucket.values.push(v);
    }
  }

  const out = [];
  for (const bucket of buckets.values()) {
    if (key === 'pace') {
      if (bucket.paceCount === 0 || bucket.dist <= 0) continue;
      out.push({ date: bucket.date, value: bucket.dur / bucket.dist, count: bucket.paceCount });
    } else {
      if (bucket.values.length === 0) continue;
      out.push({
        date: bucket.date,
        value: aggregate(bucket.values, forceMin ? 'min' : exercise.aggregation),
        count: bucket.values.length,
      });
    }
  }

  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

export function movingAverage(values, window = 7) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const w = Math.max(1, Math.floor(window) || 1);
  const out = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= w) sum -= values[i - w];
    const start = Math.max(0, i - w + 1);
    out.push(sum / (i - start + 1));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* highlights                                                          */
/* ------------------------------------------------------------------ */

export function personalBest(exercise, entries, key) {
  const list = entriesFor(entries, exercise && exercise.id);
  const hib = higherIsBetterOf(exercise, key);
  let best = null;
  for (const e of list) {
    const v = entryValue(exercise, e, key);
    if (v === null) continue;
    if (best === null || (hib ? v > best.value : v < best.value)) {
      best = { value: v, date: e.date, entryId: e.id };
    }
  }
  return best;
}

export function cumulativeTotal(exercise, entries, key) {
  if (key === 'pace') return null;
  const metric = metricOf(exercise, key);
  if (metric && metric.derived) return null;
  if (exercise && exercise.id === 'run' && key === 'duration') return null;

  const list = entriesFor(entries, exercise && exercise.id);
  let sum = 0;
  let any = false;
  for (const e of list) {
    const v = entryValue(exercise, e, key);
    if (v === null) continue;
    sum += v;
    any = true;
  }
  return any ? roundTo(sum, 6) : 0;
}

export function streakDays(entries, today) {
  if (!Array.isArray(entries) || !today) return 0;
  const days = new Set(entries.filter((e) => e && e.date).map((e) => e.date));
  let anchor = days.has(today) ? today : addDays(today, -1);
  if (!days.has(anchor)) return 0;

  let count = 0;
  let cursor = anchor;
  while (days.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

export function latestAndPrevious(exercise, entries, key) {
  const list = entriesFor(entries, exercise && exercise.id);
  const found = [];
  for (let i = list.length - 1; i >= 0 && found.length < 2; i -= 1) {
    const v = entryValue(exercise, list[i], key);
    if (v === null) continue;
    found.push({ value: v, date: list[i].date });
  }
  const latest = found[0] || null;
  const previous = found[1] || null;
  const diff = latest && previous ? roundTo(latest.value - previous.value, 6) : null;
  return { latest, previous, diff };
}

export function vsLastMonth(exercise, entries, key, today) {
  const series = dailySeries(exercise, entries, key);
  const curFrom = addDays(today, -29);
  const prevFrom = addDays(today, -59);
  const prevTo = addDays(today, -30);

  const current = series.filter((p) => p.date >= curFrom && p.date <= today);
  const previous = series.filter((p) => p.date >= prevFrom && p.date <= prevTo);

  if (!current.length || !previous.length) return { pct: null, direction: null };

  const currentMean = mean(current.map((p) => p.value));
  const previousMean = mean(previous.map((p) => p.value));

  if (previousMean === null || previousMean === 0) return { pct: null, direction: null };

  let signed = ((currentMean - previousMean) / previousMean) * 100;
  if (higherIsBetterOf(exercise, key) === false) signed = -signed;

  const pct = Math.round(signed);
  const direction = Math.abs(signed) < 1 ? 'flat' : signed > 0 ? 'up' : 'down';
  return { pct, direction };
}

export function bestInPeriod(exercise, entries, key, fromDate, toDate) {
  const list = entriesFor(entries, exercise && exercise.id);
  const hib = higherIsBetterOf(exercise, key);
  let best = null;
  for (const e of list) {
    if (e.date < fromDate || e.date > toDate) continue;
    const v = entryValue(exercise, e, key);
    if (v === null) continue;
    if (best === null || (hib ? v > best : v < best)) best = v;
  }
  return best;
}

export function attemptsOnDay(entries, exerciseId, day) {
  if (!Array.isArray(entries)) return 0;
  let count = 0;
  for (const e of entries) {
    if (!e || e.date !== day) continue;
    if (exerciseId !== undefined && exerciseId !== null && e.exerciseId !== exerciseId) continue;
    count += 1;
  }
  return count;
}

export function weeklySummary(exercises, entries, today) {
  const from = startOfWeek(today);
  const list = Array.isArray(exercises) ? exercises : [];
  return list.map((exercise) => {
    const inWeek = entriesFor(entries, exercise.id).filter((e) => e.date >= from && e.date <= today);
    const weekly = exercise.weekly || {};
    if (weekly.mode === 'count' || !weekly.metric) {
      return { exerciseId: exercise.id, value: inWeek.length };
    }
    let sum = 0;
    for (const e of inWeek) {
      const v = entryValue(exercise, e, weekly.metric);
      if (v !== null) sum += v;
    }
    return { exerciseId: exercise.id, value: roundTo(sum, 6) };
  });
}

export function milestones(total, steps = [100, 500, 1000]) {
  const t = typeof total === 'number' && Number.isFinite(total) ? total : 0;
  const sorted = [...steps].sort((a, b) => a - b);
  const reached = sorted.filter((s) => t >= s);
  const next = sorted.find((s) => t < s);
  return { reached, next: next === undefined ? null : next };
}

export function filterRange(series, range, today) {
  const list = Array.isArray(series) ? series : [];
  if (range === 'all') return list.slice();
  const span = range === '30d' ? 30 : 7;
  const from = addDays(today, -(span - 1));
  return list.filter((p) => p && p.date >= from && p.date <= today);
}

export function isNewPB(exercise, previousEntries, newEntry) {
  if (!exercise || !newEntry) return [];
  const keys = Array.isArray(exercise.chartMetrics) ? exercise.chartMetrics : [];
  const previous = Array.isArray(previousEntries) ? previousEntries : [];
  const out = [];

  for (const key of keys) {
    const newValue = entryValue(exercise, newEntry, key);
    if (newValue === null) continue;

    const prevValues = previous
      .filter((e) => e && e.id !== newEntry.id)
      .map((e) => entryValue(exercise, e, key))
      .filter((v) => v !== null);

    const hib = higherIsBetterOf(exercise, key);

    if (prevValues.length === 0) {
      if (newValue > 0) out.push(key);
      continue;
    }

    const beats = hib
      ? prevValues.every((v) => newValue > v)
      : prevValues.every((v) => newValue < v);
    if (beats) out.push(key);
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* pull-up stage helpers                                               */
/* ------------------------------------------------------------------ */

export function pullupSettings(raw) {
  const out = { ...PULLUP_DEFAULTS };
  const src = raw && typeof raw === 'object' ? raw : {};

  for (const key of ['attempts', 'stage1Grabs', 'stage2Hang']) {
    const n = toNum(src[key]);
    if (n !== null && Number.isInteger(n) && n > 0) out[key] = n;
  }

  out.stage1Grabs = Math.min(out.attempts, Math.max(1, out.stage1Grabs));
  return out;
}

export function stageOfEntry(entry) {
  if (!entry) return null;
  const values = entry.values || {};
  if (toNum(values.level) !== null) return 3;
  if (toNum(values.hang) !== null) return 2;
  if (toNum(values.grabs) !== null) return 1;
  return null;
}

export function stageProgress(exercise, entries, settingsRaw) {
  if (!exercise || !Array.isArray(exercise.stages) || exercise.stages.length === 0) return null;

  const settings = pullupSettings(settingsRaw);
  const list = entriesFor(entries, exercise.id);
  const buckets = new Map();

  for (const stage of exercise.stages) buckets.set(stage.n, []);
  for (const entry of list) {
    const n = stageOfEntry(entry);
    if (n !== null && buckets.has(n)) buckets.get(n).push(entry);
  }

  const stage1 = buckets.get(1) || [];
  const stage2 = buckets.get(2) || [];
  const stage3 = buckets.get(3) || [];

  const firstStage1 = firstDate(stage1);
  const firstStage2 = firstDate(stage2);
  const firstStage3 = firstDate(stage3);

  let threshold2 = null;
  for (const entry of stage1) {
    const values = entry.values || {};
    const grabs = toNum(values.grabs);
    if (grabs === null) continue;
    const rawAttempts = toNum(values.attempts);
    const attempts = rawAttempts !== null && rawAttempts > 0 ? rawAttempts : settings.attempts;
    if (attempts > 0 && grabs / attempts >= settings.stage1Grabs / settings.attempts) {
      threshold2 = entry.date;
      break;
    }
  }

  const stage2Candidates = [];
  if (threshold2) stage2Candidates.push(threshold2);
  if (firstStage2) stage2Candidates.push(firstStage2);
  if (firstStage3) stage2Candidates.push(firstStage3);

  const stage2Unlocked = stage2Candidates.length > 0;
  const stage2On = stage2Unlocked ? minDateStr(stage2Candidates) : null;

  let threshold3 = null;
  for (const entry of stage2) {
    const hang = toNum((entry.values || {}).hang);
    if (hang !== null && hang >= settings.stage2Hang) {
      threshold3 = entry.date;
      break;
    }
  }

  const stage3Candidates = [];
  if (stage2Unlocked) {
    if (threshold3) stage3Candidates.push(threshold3);
    if (firstStage3) stage3Candidates.push(firstStage3);
  }

  const stage3Unlocked = stage3Candidates.length > 0;
  const stage3On = stage3Unlocked ? minDateStr(stage3Candidates) : null;

  const statsFor = (stage, stageEntries) => {
    const metric = metricOf(exercise, stage.metric);
    const hib = metric ? metric.higherIsBetter !== false : true;
    let best = null;
    let latest = null;

    for (const entry of stageEntries) {
      const v = entryValue(exercise, entry, stage.metric);
      if (v === null) continue;
      if (best === null || (hib ? v > best : v < best)) best = v;
      latest = v;
    }

    return { entries: stageEntries.length, best, latest };
  };

  const stages = exercise.stages.map((stage) => {
    let unlocked = false;
    let unlockedOn = null;

    if (stage.n === 1) {
      unlocked = true;
      unlockedOn = firstStage1;
    } else if (stage.n === 2) {
      unlocked = stage2Unlocked;
      unlockedOn = stage2Unlocked ? stage2On : null;
    } else if (stage.n === 3) {
      unlocked = stage3Unlocked;
      unlockedOn = stage3Unlocked ? stage3On : null;
    }

    const stats = statsFor(stage, buckets.get(stage.n) || []);
    return {
      n: stage.n,
      id: stage.id,
      unlocked,
      unlockedOn,
      entries: stats.entries,
      best: stats.best,
      latest: stats.latest,
    };
  });

  let current = 1;
  if (stage2Unlocked) current = 2;
  if (stage3Unlocked) current = 3;

  return { current, stages };
}

export function formatGrab(entry) {
  if (!entry) return '–';
  const values = entry.values || {};
  const grabs = toNum(values.grabs);
  const attempts = toNum(values.attempts);
  if (grabs === null || attempts === null || attempts <= 0) return '–';
  return `${Math.round(grabs)}/${Math.round(attempts)}`;
}

/* ------------------------------------------------------------------ */
/* running helpers                                                     */
/* ------------------------------------------------------------------ */

export function distanceKey(km) {
  const n = toNum(km);
  if (n === null) return '';
  return String(roundTo(n, 1));
}

export function runDistances(exercise, entries) {
  const list = entriesFor(entries, exercise && exercise.id);
  const seen = new Set();
  const out = [];

  for (const entry of list) {
    const run = validRun(entry);
    if (!run) continue;
    const key = distanceKey(run.distance);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(roundTo(run.distance, 1));
  }

  out.sort((a, b) => a - b);
  return out;
}

export function runBestByDistance(exercise, entries) {
  const list = entriesFor(entries, exercise && exercise.id);
  const best = {};

  for (const entry of list) {
    const run = validRun(entry);
    if (!run) continue;
    const key = distanceKey(run.distance);
    const current = best[key];

    if (
      !current ||
      run.seconds < current.seconds ||
      (run.seconds === current.seconds && entry.date < current.date)
    ) {
      best[key] = { seconds: run.seconds, date: entry.date, entryId: entry.id };
    }
  }

  return best;
}

export function runTimeSeries(exercise, entries, km) {
  const target = distanceKey(km);
  if (!target) return [];

  const list = entriesFor(entries, exercise && exercise.id);
  const buckets = new Map();

  for (const entry of list) {
    const run = validRun(entry);
    if (!run) continue;
    if (distanceKey(run.distance) !== target) continue;

    let bucket = buckets.get(entry.date);
    if (!bucket) {
      bucket = { date: entry.date, value: null, count: 0 };
      buckets.set(entry.date, bucket);
    }

    bucket.value = bucket.value === null ? run.seconds : Math.min(bucket.value, run.seconds);
    bucket.count += 1;
  }

  return Array.from(buckets.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );
}

export function runCompareLast(exercise, entries) {
  const list = entriesFor(entries, exercise && exercise.id).filter((e) => validRun(e));
  if (!list.length) return null;

  const latest = list[list.length - 1];
  const latestRun = validRun(latest);
  const key = distanceKey(latestRun.distance);

  const earlier = list.slice(0, -1);
  let previous = null;
  for (let i = earlier.length - 1; i >= 0; i -= 1) {
    const run = validRun(earlier[i]);
    if (run && distanceKey(run.distance) === key) {
      previous = run.seconds;
      break;
    }
  }

  const sameEarlier = earlier
    .map((e) => validRun(e))
    .filter(Boolean)
    .filter((run) => distanceKey(run.distance) === key);

  const bestMap = runBestByDistance(exercise, entries);
  const best = bestMap[key] ? bestMap[key].seconds : latestRun.seconds;

  const isPB =
    sameEarlier.length > 0 && sameEarlier.every((run) => latestRun.seconds < run.seconds);
  const fasterBy =
    previous !== null && latestRun.seconds < previous ? previous - latestRun.seconds : null;

  return {
    distance: roundTo(latestRun.distance, 1),
    seconds: latestRun.seconds,
    previous,
    fasterBy,
    best,
    isPB,
  };
}

/* ------------------------------------------------------------------ */
/* formatting                                                          */
/* ------------------------------------------------------------------ */

export function formatDuration(sec) {
  const n = toNum(sec);
  if (n === null) return '–';

  const negative = n < 0;
  const total = Math.round(Math.abs(n));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${negative ? '-' : ''}${m}:${pad2(s)}`;
}

export function formatFaster(sec, lang) {
  const n = toNum(sec);
  if (n === null || n <= 0) return '';

  const total = Math.round(n);
  if (total <= 0) return '';

  const m = Math.floor(total / 60);
  const s = total % 60;

  if (lang === 'en') {
    if (total < 60) return `faster by ${total} s`;
    if (s === 0) return `faster by ${m} min`;
    return `faster by ${m} min ${s} s`;
  }

  if (total < 60) return `快了 ${total} 秒`;
  if (s === 0) return `快了 ${m} 分`;
  return `快了 ${m} 分 ${s} 秒`;
}

export function formatValue(metric, value) {
  const n = toNum(value);
  if (n === null) return '–';

  const isPace = !!metric && (metric.key === 'pace' || metric.unitEn === 'min/km');
  if (isPace) {
    const totalSeconds = Math.round(Math.abs(n) * 60);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${n < 0 ? '-' : ''}${m}:${pad2(s)}`;
  }

  if (metric && metric.inputType === 'int') return String(Math.round(n));
  return String(roundTo(n, 2));
}

/* ------------------------------------------------------------------ */
/* achievement stamps                                                  */
/* ------------------------------------------------------------------ */

function stageDefOf(exercise, n) {
  if (!exercise || !Array.isArray(exercise.stages)) return null;
  return exercise.stages.find((stage) => stage && stage.n === n) || null;
}

function hasEarlierPBValue(exercise, previousEntries, stampId) {
  const list = entriesFor(previousEntries, exercise && exercise.id);

  if (stampId.startsWith('pb:grabRate:')) {
    return list.some((entry) => entryValue(exercise, entry, 'grabRate') !== null);
  }
  if (stampId.startsWith('pb:hang:')) {
    return list.some((entry) => entryValue(exercise, entry, 'hang') !== null);
  }
  if (stampId.startsWith('pb:reps:')) {
    return list.some((entry) => entryValue(exercise, entry, 'reps') !== null);
  }
  if (stampId.startsWith('pb:run:')) {
    const parts = stampId.split(':');
    const key = parts[2];
    return list.some((entry) => {
      const run = validRun(entry);
      return !!run && distanceKey(run.distance) === key;
    });
  }

  return false;
}

export function stamps(exercise, entries, settingsRaw) {
  if (!exercise) return [];

  const out = [];
  const list = entriesFor(entries, exercise.id);

  if (Array.isArray(exercise.stages) && exercise.stages.length > 0) {
    const progress = stageProgress(exercise, entries, settingsRaw);
    if (progress) {
      for (const stage of progress.stages) {
        const def = stageDefOf(exercise, stage.n);
        if (!def) continue;
        if (stage.n === 1 && stage.entries === 0) continue;
        if (stage.n > 1 && !stage.unlocked) continue;

        out.push({
          id: `stage:${stage.n}`,
          kind: 'stage',
          icon: def.icon,
          label: `第${stage.n}关 ${def.name}`,
          labelEn: `Stage ${stage.n} · ${def.nameEn}`,
          valueText: '',
          valueTextEn: '',
          date: stage.unlockedOn,
        });
      }

      for (const option of LEVEL_OPTIONS) {
        const firstReached = list.find((entry) => {
          const level = toNum((entry.values || {}).level);
          return level !== null && level >= option.value;
        });

        if (firstReached) {
          out.push({
            id: `level:${option.value}`,
            kind: 'level',
            icon: '💪',
            label: `${option.value}%`,
            labelEn: `${option.value}%`,
            valueText: option.label,
            valueTextEn: option.labelEn,
            date: firstReached.date,
            entryId: firstReached.id,
          });
        }
      }

      const bestGrab = personalBest(exercise, entries, 'grabRate');
      if (bestGrab) {
        const bestEntry = list.find((entry) => entry.id === bestGrab.entryId) || null;
        const grabText = formatGrab(bestEntry);
        out.push({
          id: `pb:grabRate:${bestGrab.value}`,
          kind: 'pb',
          icon: '✋',
          label: '抓杠最佳',
          labelEn: 'Best grabs',
          valueText: grabText,
          valueTextEn: grabText,
          date: bestGrab.date,
          entryId: bestGrab.entryId,
        });
      }

      const bestHang = personalBest(exercise, entries, 'hang');
      if (bestHang) {
        const hangMetric = metricOf(exercise, 'hang');
        const hangText = formatValue(hangMetric, bestHang.value);
        out.push({
          id: `pb:hang:${bestHang.value}`,
          kind: 'pb',
          icon: '⏱️',
          label: '悬挂最佳',
          labelEn: 'Best hang',
          valueText: `${hangText} 秒`,
          valueTextEn: `${hangText} s`,
          date: bestHang.date,
          entryId: bestHang.entryId,
        });
      }
    }
  } else if (exercise.id === 'run') {
    const bestMap = runBestByDistance(exercise, entries);
    const distances = runDistances(exercise, entries);

    for (const km of distances) {
      const key = distanceKey(km);
      const best = bestMap[key];
      if (!best) continue;

      const timeText = formatDuration(best.seconds);
      out.push({
        id: `pb:run:${key}:${best.seconds}`,
        kind: 'pb',
        icon: '🏃',
        label: `${key} 公里最佳`,
        labelEn: `Best ${key} km`,
        valueText: timeText,
        valueTextEn: timeText,
        date: best.date,
        entryId: best.entryId,
      });
    }
  } else if (exercise.id === 'rope') {
    const best = personalBest(exercise, entries, 'reps');
    if (best) {
      const repsMetric = metricOf(exercise, 'reps');
      const repsText = formatValue(repsMetric, best.value);
      out.push({
        id: `pb:reps:${best.value}`,
        kind: 'pb',
        icon: '🪢',
        label: '跳绳最佳',
        labelEn: 'Best jump rope',
        valueText: `${repsText} 次`,
        valueTextEn: `${repsText} reps`,
        date: best.date,
        entryId: best.entryId,
      });
    }
  }

  return out;
}

export function newStampsForSave(exercise, previousEntries, newEntry, settingsRaw) {
  if (!exercise || !newEntry) return [];

  const previous = Array.isArray(previousEntries) ? previousEntries : [];
  const beforeIds = new Set(stamps(exercise, previous, settingsRaw).map((stamp) => stamp.id));
  const after = stamps(exercise, [...previous, newEntry], settingsRaw);
  const out = [];

  for (const stamp of after) {
    if (beforeIds.has(stamp.id)) continue;

    if (stamp.kind === 'pb') {
      if (stamp.entryId !== newEntry.id) continue;
      if (!hasEarlierPBValue(exercise, previous, stamp.id)) continue;
    }

    out.push(stamp);
  }

  return out;
}
