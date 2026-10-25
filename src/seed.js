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
const RUN_DISTANCES = [1, 1, 1, 2, 0.5, 3];

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

    // ---- pull-ups: three-stage story ----
    let doPullup = true;
    if (i < 61 && rng() < 0.18) doPullup = false;

    if (doPullup) {
      if (i <= 24) {
        // Stage 1: attempts 5, grabs 1 -> 5, unlock stage 2 around day 20.
        const base = 1 + 4 * (i / 24);
        const jitter = (rng() - 0.5) * 0.6;
        const grabs = Math.round(clamp(base + jitter, 1, 5));
        push('pullup', date, { grabs, attempts: 5 }, 0);
      } else if (i <= 60) {
        // Stage 2: hang 3 -> 18s, crossing 10s around day 50.
        const base =
          i <= 50
            ? 3 + 7 * ((i - 25) / 25)
            : 10 + 8 * ((i - 50) / 10);
        const jitter = (rng() - 0.5) * 1.2;
        const hang = Math.round(clamp(base + jitter, 2, 20));
        push('pullup', date, { hang }, 0);
      } else {
        // Stage 3: levels 25 -> 50 -> 75 in the last two weeks.
        const level = i < 65 ? 25 : i < 70 ? 50 : 75;
        push('pullup', date, { level }, 0);
      }

      // Keep stage 1 charting after stage 2 unlocks.
      if (i >= 21 && rng() < 0.35) {
        const grabs = Math.round(clamp(3 + rng() * 2, 1, 5));
        push('pullup', date, { grabs, attempts: 5 }, 1);
      }

      // Keep stage 2 charting after stage 3 unlocks.
      if (i >= 51 && rng() < 0.3) {
        const hang = Math.round(clamp(8 + rng() * 8, 2, 20));
        push('pullup', date, { hang }, 2);
      }
    }

    // ---- running: PB per distance, seconds, trending ~10% faster ----
    if (rng() < 0.55) {
      const distance = RUN_DISTANCES[Math.floor(rng() * RUN_DISTANCES.length)];
      const paceFactor = (1 - 0.1 * progress) * (1 + (rng() - 0.5) * 0.1);
      const duration = Math.max(1, Math.round(distance * 420 * paceFactor));
      push('run', date, { distance, duration }, 0);
    }

    // ---- jump rope: as before, duration in seconds ----
    if (rng() < 0.5) {
      const ropeReps = Math.round(clamp(20 + 100 * progress + (rng() - 0.5) * 24, 5, 300));
      const ropeTime = Math.round(ropeReps * (0.3 + rng() * 0.2));
      push('rope', date, { reps: ropeReps, duration: ropeTime }, 0);
    }
  }

  // Guarantee at least one record per exercise (keeps the UI happy).
  const fallback = {
    pullup: () => ({ grabs: 1, attempts: 5 }),
    run: () => ({ distance: 1, duration: 420 }),
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
