import { describe, it, expect } from 'vitest';
import {
  EVENT_TYPES,
  EVENT_SCHEMA_VERSION,
  isoWithOffset,
  rawValues,
  hydrateValues,
  makeEvent,
  addedEvent,
  deletedEvent,
  correctedEvent,
  isValidEvent,
  replay,
  mergeEvents,
  syncCounts,
  diffToEvents,
  uploadable,
} from '../src/events.js';
import { makeBackup, parseBackup } from '../src/backup.js';

const grabEntry = {
  id: 'r1',
  exerciseId: 'pullup',
  date: '2026-10-20',
  createdAt: Date.UTC(2026, 9, 20, 17, 0, 0),
  values: { grabs: 3, attempts: 5, sequence: [1, 0, 1, 1, 0], grabRate: 60 },
};
const runEntry = {
  id: 'r2',
  exerciseId: 'run',
  date: '2026-10-21',
  createdAt: Date.UTC(2026, 9, 21, 17, 0, 0),
  values: { distance: 200, duration: 61, laps: 2 },
};

describe('event envelope', () => {
  it('timestamps carry a timezone offset', () => {
    const ts = isoWithOffset(Date.UTC(2026, 9, 25, 18, 3, 0));
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    expect(Date.parse(ts)).toBe(Date.UTC(2026, 9, 25, 18, 3, 0));
  });

  it('has exactly the fixed fields', () => {
    const ev = makeEvent({ eventType: EVENT_TYPES.ADDED, sport: 'run', payload: { a: 1 } });
    expect(Object.keys(ev).sort()).toEqual(
      ['eventType', 'id', 'payload', 'schemaVersion', 'sport', 'timestamp'].sort()
    );
    expect(ev.schemaVersion).toBe(EVENT_SCHEMA_VERSION);
    expect(isValidEvent(ev)).toBe(true);
    expect(isValidEvent({ ...ev, payload: null })).toBe(false);
    expect(isValidEvent({ id: 'x' })).toBe(false);
  });

  it('auto timestamps never go backwards', () => {
    const a = makeEvent({ eventType: 'x', sport: 'run' });
    const b = makeEvent({ eventType: 'x', sport: 'run' });
    expect(Date.parse(b.timestamp)).toBeGreaterThan(Date.parse(a.timestamp));
  });
});

describe('raw facts only', () => {
  it('keeps the per-dot sequence and drops derived grab count / rate', () => {
    expect(rawValues('pullup', grabEntry.values)).toEqual({ attempts: 5, sequence: [1, 0, 1, 1, 0] });
    const ev = addedEvent(grabEntry);
    expect(ev.payload.values.grabs).toBeUndefined();
    expect(ev.payload.values.grabRate).toBeUndefined();
    expect(hydrateValues('pullup', ev.payload.values).grabs).toBe(3);
  });

  it('keeps run time and laps, hang seconds, level %', () => {
    expect(rawValues('run', runEntry.values)).toEqual({ distance: 200, duration: 61, laps: 2 });
    expect(rawValues('pullup', { hang: 12 })).toEqual({ hang: 12 });
    expect(rawValues('pullup', { level: 35, best: 50 })).toEqual({ level: 35 });
  });

  it('keeps a note (e.g. bar height / rest)', () => {
    const ev = addedEvent({ ...runEntry, note: ' bar 1.2m, rest 1min ' });
    expect(ev.payload.note).toBe('bar 1.2m, rest 1min');
    expect(replay([ev])[0].note).toBe('bar 1.2m, rest 1min');
  });
});

describe('replay', () => {
  it('rebuilds records from added / corrected / deleted', () => {
    const a = addedEvent(grabEntry, Date.UTC(2026, 9, 20, 17, 0, 0));
    const b = addedEvent(runEntry, Date.UTC(2026, 9, 21, 17, 0, 0));
    const c = correctedEvent(runEntry, { values: { distance: 200, duration: 58, laps: 2 } }, Date.UTC(2026, 9, 21, 18));
    let list = replay([c, b, a]); // order on disk doesn't matter
    expect(list.map((e) => e.id)).toEqual(['r1', 'r2']);
    expect(list[0].values).toEqual({ attempts: 5, sequence: [1, 0, 1, 1, 0], grabs: 3 });
    expect(list[0].createdAt).toBe(grabEntry.createdAt);
    expect(list[1].values.duration).toBe(58);

    const d = deletedEvent(runEntry, 'user', Date.UTC(2026, 9, 22));
    list = replay([a, b, c, d]);
    expect(list.map((e) => e.id)).toEqual(['r1']);
  });

  it('a record re-added after deletion comes back (re-import)', () => {
    const a = addedEvent(runEntry, 1000);
    const d = deletedEvent(runEntry, 'clear-all', 2000);
    const again = addedEvent(runEntry, 3000);
    const list = replay([a, d, again]);
    expect(list).toHaveLength(1);
    expect(list[0].createdAt).toBe(runEntry.createdAt); // original time kept
  });

  it('skips unknown types and future schema versions', () => {
    const a = addedEvent(runEntry, 1000);
    const weird = { ...makeEvent({ eventType: 'record.added', sport: 'run', payload: {} }), schemaVersion: 99 };
    const other = makeEvent({ eventType: 'something.else', sport: 'run', payload: { recordId: 'r2' } });
    expect(replay([a, weird, other])).toHaveLength(1);
  });
});

describe('merge + sync counts', () => {
  it('merges logs by id with no duplicates', () => {
    const a = addedEvent(grabEntry, 1000);
    const b = addedEvent(runEntry, 2000);
    const merged = mergeEvents([a], [a, b]);
    expect(merged.map((e) => e.id)).toEqual([a.id, b.id]);
  });

  it('counts backed-up vs pending, ignoring demo events', () => {
    const a = addedEvent(grabEntry, 1000);
    const b = addedEvent(runEntry, 2000);
    const demo = addedEvent({ ...runEntry, id: 'd1', demo: true }, 3000);
    expect(uploadable([a, b, demo])).toHaveLength(2);
    expect(syncCounts([a, b, demo], new Set([a.id]))).toEqual({ backedUp: 1, pending: 1 });
  });
});

describe('diffToEvents (import replace keeps history)', () => {
  it('emits delete / add / correct only where needed', () => {
    const current = [grabEntry, runEntry];
    const target = [
      { ...runEntry, values: { distance: 200, duration: 55, laps: 2 } },
      { id: 'r3', exerciseId: 'run', date: '2026-10-22', values: { distance: 100, duration: 25 } },
    ];
    const evs = diffToEvents(current, target, 'import', 5000);
    expect(evs.map((e) => e.eventType).sort()).toEqual(
      [EVENT_TYPES.ADDED, EVENT_TYPES.CORRECTED, EVENT_TYPES.DELETED].sort()
    );
    const base = [addedEvent(grabEntry, 1000), addedEvent(runEntry, 2000)];
    const after = replay([...base, ...evs]);
    expect(after.map((e) => e.id).sort()).toEqual(['r2', 'r3']);
    expect(after.find((e) => e.id === 'r2').values.duration).toBe(55);
  });

  it('no-op when nothing changed', () => {
    expect(diffToEvents([grabEntry], [grabEntry], 'import', 1)).toEqual([]);
  });
});

describe('backup carries the event log', () => {
  it('round-trips events', () => {
    const evs = [addedEvent(grabEntry, 1000), addedEvent(runEntry, 2000)];
    const backup = makeBackup({ entries: replay(evs), events: evs, settings: {}, now: 0 });
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.events).toEqual(evs);
    expect(parsed.schema).toBe(3);
  });

  it('older backups have no events', () => {
    const parsed = parseBackup({ app: 'achievement-book', schema: 2, entries: [runEntry] });
    expect(parsed.events).toEqual([]);
  });
});

import { deletedRecords } from '../src/events.js';
describe('deletedRecords', () => {
  it('lists real records that are deleted now, with their last state', () => {
    const a = addedEvent(grabEntry, 1000);
    const b = addedEvent(runEntry, 2000);
    const c = correctedEvent(runEntry, { values: { distance: 200, duration: 50 } }, 2500);
    const d1 = deletedEvent(runEntry, 'clear-all', 3000);
    const demo = addedEvent({ ...runEntry, id: 'dm', demo: true }, 3100);
    const d2 = deletedEvent({ ...runEntry, id: 'dm', demo: true }, 'demo-clear', 3200);
    const gone = deletedRecords([a, b, c, d1, demo, d2]);
    expect(gone.map((r) => r.id)).toEqual(['r2']);
    expect(gone[0].values.duration).toBe(50);
    const back = addedEvent(gone[0], 4000);
    expect(deletedRecords([a, b, c, d1, back])).toEqual([]);
    expect(replay([a, b, c, d1, back]).find((r) => r.id === 'r2').values.duration).toBe(50);
  });
});
