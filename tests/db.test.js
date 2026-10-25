// IndexedDB flows against fake-indexeddb: v2 → v3 backfill, append-only
// behaviour, clear-all keeps the log, import merge.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { openDB } from 'idb';

const legacy = [
  { id: 'old1', exerciseId: 'run', date: '2026-10-01', createdAt: 1000, values: { distance: 400, duration: 130 } },
  { id: 'old2', exerciseId: 'pullup', date: '2026-10-02', createdAt: 2000, values: { grabs: 2, attempts: 5, sequence: [1, 1, 0, 0, 0] } },
];

let db;
beforeAll(async () => {
  // Simulate an existing v2 install with records in the old `entries` store.
  const old = await openDB('achievement-book', 2, {
    upgrade(d) {
      d.createObjectStore('exercises', { keyPath: 'id' });
      const e = d.createObjectStore('entries', { keyPath: 'id' });
      e.createIndex('byExercise', 'exerciseId');
      e.createIndex('byDate', 'date');
    },
  });
  for (const r of legacy) await old.put('entries', r);
  old.close();
  db = await import('../src/db.js');
});

describe('db (event log)', () => {
  it('backfills existing records into the log on upgrade', async () => {
    const events = await db.getEvents();
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.eventType === 'record.added')).toBe(true);
    const entries = await db.getEntries();
    expect(entries.map((e) => e.id).sort()).toEqual(['old1', 'old2']);
    expect(entries.find((e) => e.id === 'old2').values.grabs).toBe(2);
  });

  it('add + delete append events; clear-all keeps the history', async () => {
    const rec = await db.addEntry({ exerciseId: 'run', date: '2026-10-03', values: { distance: 100, duration: 30 } });
    expect((await db.getEntries()).some((e) => e.id === rec.id)).toBe(true);
    await db.deleteEntry(rec.id);
    expect((await db.getEntries()).some((e) => e.id === rec.id)).toBe(false);
    const n = await db.clearEntries();
    expect(n).toBe(2);
    expect(await db.getEntries()).toEqual([]);
    const events = await db.getEvents();
    expect(events.length).toBe(2 + 1 + 1 + 2); // nothing was removed
  });

  it('importing a schema-3 backup restores records by merging logs', async () => {
    const events = await db.getEvents();
    const firstTwo = events.filter((e) => e.eventType === 'record.added').slice(0, 2);
    // a backup taken before the clear (only the add events)
    const backup = { app: 'achievement-book', schema: 3, entries: [], events: firstTwo, settings: {} };
    const res = await db.importBackup(backup);
    expect(res.added).toBe(0); // same events already in the log → union adds nothing
  });

  it('old (entries-only) backup import re-adds records after a clear', async () => {
    const res = await db.importBackup({ app: 'achievement-book', schema: 2, entries: legacy });
    expect(res.count).toBe(2);
    expect((await db.getEntries()).map((e) => e.id).sort()).toEqual(['old1', 'old2']);
  });

  it('tracks synced ids and imports remote events', async () => {
    const events = await db.getEvents();
    await db.markSynced([events[0].id]);
    const ids = await db.getSyncedIds();
    expect(ids.has(events[0].id)).toBe(true);
    const remote = {
      id: 'remote-1',
      timestamp: '2026-10-24T10:00:00.000+01:00',
      sport: 'run',
      eventType: 'record.added',
      schemaVersion: 1,
      payload: { recordId: 'cloud1', date: '2026-10-24', values: { distance: 200, duration: 60 } },
    };
    expect(await db.importRemoteEvents([remote])).toBe(1);
    expect(await db.importRemoteEvents([remote])).toBe(0);
    expect((await db.getSyncedIds()).has('remote-1')).toBe(true);
    expect((await db.getEntries()).some((e) => e.id === 'cloud1')).toBe(true);
  });
});

describe('db restore paths', () => {
  it('schema-3 backup restores records after clear-all; restoreDeleted brings back the rest', async () => {
    const backup = await db.exportBackup({});
    const liveBefore = (await db.getEntries()).length;
    expect(liveBefore).toBeGreaterThan(0);
    await db.clearEntries();
    expect(await db.getEntries()).toEqual([]);
    const res = await db.importBackup(JSON.stringify(backup));
    expect(res.restored).toBe(liveBefore);
    expect((await db.getEntries()).length).toBe(liveBefore);
    await db.clearEntries();
    expect(await db.countDeleted()).toBeGreaterThanOrEqual(liveBefore);
    await db.restoreDeleted();
    expect(await db.countDeleted()).toBe(0);
  });
});
