// Pure metric helpers for 成就本. No DOM, no Date.now().
// Dates are always local-date strings: 'YYYY-MM-DD'.

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
  return Math.max(...values);
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
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
        value: aggregate(bucket.values, exercise.aggregation),
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
/* formatting                                                          */
/* ------------------------------------------------------------------ */

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
