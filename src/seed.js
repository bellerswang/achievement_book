// Deterministic-ish demo data generator for 成就本.

import { addDays } from './metrics.js';

/**
 * Small, fast seeded PRNG (mulberry32).
 * @param {number} seed
 * @returns {() => number} values in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAYS = 75;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function round(v, digits) {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

function dateMs(dateStr) {
  const parts = dateStr.split('-').map(Number);
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

/**
 * Build demo entries for the last ~75 days.
 * Pure + deterministic when a seeded rng is passed.
 *
 * @param {string} today 'YYYY-MM-DD'
 * @param {() => number} [rng]
 * @returns {Array<{id:string,exerciseId:string,date:string,createdAt:number,values:object}>}
 */
export function makeDemoEntries(today, rng = Math.random) {
  const entries = [];
  const seen = new Set();

  const push = (exerciseId, date, values, attempt) => {
    const id = `demo-${exerciseId}-${date}-${attempt}`;
    if (seen.has(id)) return;
    seen.add(id);
    entries.push({
      id,
      exerciseId,
      date,
      createdAt: dateMs(date) + 9 * 3600 * 1000 + attempt * 60 * 1000,
      values,
    });
  };

  for (let i = 0; i < DAYS; i += 1) {
    const date = addDays(today, -(DAYS - 1 - i));
    const progress = i / (DAYS - 1); // 0 = oldest, 1 = today

    // realistic gaps: skip ~35% of days entirely
    if (rng() < 0.35) continue;

    // ---- pull-ups (hang 3s -> 25s, reps 0-1 -> 2-3) ----
    const hang = Math.round(clamp(3 + 22 * progress + (rng() - 0.5) * 5, 2, 40));
    const repsCap = progress < 0.35 ? 1 : progress < 0.7 ? 2 : 3;
    const reps = Math.floor(rng() * (repsCap + 1));
    const sets = 1 + Math.floor(rng() * 2);
    push('pullup', date, { hang, reps, sets }, 0);

    // some days have a second attempt
    if (rng() < 0.3) {
      const hang2 = Math.max(1, Math.round(hang * (0.6 + rng() * 0.3)));
      const reps2 = Math.max(0, reps - 1 + Math.floor(rng() * 2));
      push('pullup', date, { hang: hang2, reps: reps2, sets: 1 }, 1);
    }

    // ---- running (0.8km -> 2.5km, ~7.5 min/km) ----
    if (rng() < 0.45) {
      const distance = round(clamp(0.8 + 1.7 * progress + (rng() - 0.5) * 0.4, 0.3, 6), 2);
      const duration = round(distance * 7.5 * (1 + (rng() - 0.5) * 0.12), 1);
      push('run', date, { distance, duration }, 0);
    }

    // ---- jump rope (20 -> 120 reps) ----
    if (rng() < 0.5) {
      const ropeReps = Math.round(clamp(20 + 100 * progress + (rng() - 0.5) * 24, 5, 300));
      const ropeTime = Math.round(ropeReps * (0.3 + rng() * 0.2));
      push('rope', date, { reps: ropeReps, duration: ropeTime }, 0);
    }
  }

  // guarantee at least one record per exercise (keeps the UI happy)
  const fallback = {
    pullup: () => ({ hang: 8, reps: 1, sets: 1 }),
    run: () => ({ distance: 1.2, duration: 9 }),
    rope: () => ({ reps: 40, duration: 16 }),
  };
  for (const exerciseId of ['pullup', 'run', 'rope']) {
    if (!entries.some((e) => e.exerciseId === exerciseId)) {
      push(exerciseId, today, fallback[exerciseId](), 9);
    }
  }

  entries.sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return a.createdAt - b.createdAt;
  });

  return entries;
}
