import { describe, it, expect } from 'vitest';
import {
  SCHEMA_VERSION,
  migrateEntry,
  migrateEntries,
  makeBackup,
  parseBackup,
  isDemoEntry,
} from '../src/backup.js';
import { PRESET_EXERCISES, getMetric } from '../src/presets.js';
import { makeDemoEntries, mulberry32 } from '../src/seed.js';

const RUN = PRESET_EXERCISES.find((e) => e.id === 'run');

function runEntry(values, overrides = {}) {
  return {
    id: 'r1',
    exerciseId: 'run',
    date: '2024-03-01',
    createdAt: 1700000000000,
    values,
    ...overrides,
  };
}

describe('migrateEntry', () => {
  it('converts v1 kilometres to metres without mutating the input', () => {
    const entry = runEntry({ distance: 1.5, duration: 400 });
    const migrated = migrateEntry(entry, 1);

    expect(migrated.values.distance).toBe(1500);
    expect(migrated.values.duration).toBe(400);
    expect(entry.values.distance).toBe(1.5);
    expect(migrated).not.toBe(entry);
    expect(migrated.values).not.toBe(entry.values);
  });

  it('leaves metre entries alone', () => {
    const entry = runEntry({ distance: 400, duration: 132 });
    expect(migrateEntry(entry, 1).values.distance).toBe(400);
    expect(migrateEntry(runEntry({ distance: 50, duration: 20 }), 1).values.distance).toBe(50);
  });

  it('leaves non-run entries alone', () => {
    const entry = {
      id: 'p1',
      exerciseId: 'pullup',
      date: '2024-03-01',
      values: { distance: 1.5, grabs: 3 },
    };
    expect(migrateEntry(entry, 1).values).toEqual({ distance: 1.5, grabs: 3 });
  });

  it('is idempotent for v2 entries', () => {
    const entry = runEntry({ distance: 1.5, duration: 400 });
    expect(migrateEntry(entry, 2).values.distance).toBe(1.5);

    const alreadyMigrated = migrateEntry(runEntry({ distance: 1.5 }), 1);
    expect(migrateEntry(alreadyMigrated, 2).values.distance).toBe(1500);
  });

  it('migrates lists without mutating', () => {
    const list = [runEntry({ distance: 1.5 }), runEntry({ distance: 400 }, { id: 'r2' })];
    const migrated = migrateEntries(list, 1);
    expect(migrated.map((e) => e.values.distance)).toEqual([1500, 400]);
    expect(list[0].values.distance).toBe(1.5);
  });
});

describe('makeBackup / parseBackup', () => {
  it('round-trips entries and settings', () => {
    const now = Date.UTC(2024, 2, 1, 12, 0, 0);
    const entries = [
      runEntry({ distance: 1500, duration: 300 }, { demo: true }),
      {
        id: 'p1',
        exerciseId: 'pullup',
        date: '2024-03-02',
        createdAt: 1700000000001,
        values: { grabs: 3, attempts: 5 },
      },
    ];
    const settings = { lang: 'en', celebration: 'stars' };

    const backup = makeBackup({ entries, settings, now });
    expect(backup.app).toBe('achievement-book');
    expect(backup.schema).toBe(SCHEMA_VERSION);
    expect(backup.exportedAt).toBe(new Date(now).toISOString());
    expect(backup.entries).toEqual(entries);
    expect(backup.settings).toEqual(settings);

    const parsed = parseBackup(backup);
    expect(parsed.entries).toEqual(entries);
    expect(parsed.settings).toEqual(settings);
    expect(parsed.schema).toBe(SCHEMA_VERSION);

    expect(parseBackup(JSON.stringify(backup)).entries).toEqual(entries);
  });

  it('rejects wrong app, bad JSON and non-array entries', () => {
    expect(() => parseBackup('{')).toThrow('无效的备份文件 / Invalid backup file');
    expect(() => parseBackup({ app: 'other', entries: [] })).toThrow(
      '无效的备份文件 / Invalid backup file'
    );
    expect(() => parseBackup({ app: 'achievement-book', entries: {} })).toThrow(
      '无效的备份文件 / Invalid backup file'
    );
  });

  it('drops malformed entries and numeric-coerces values', () => {
    const raw = {
      app: 'achievement-book',
      schema: 1,
      entries: [
        {
          id: 'ok',
          exerciseId: 'run',
          date: '2024-03-01',
          values: { distance: '1.5', duration: '400' },
        },
        { id: 123, exerciseId: 'run', date: '2024-03-01', values: {} },
        { id: 'bad-date', exerciseId: 'run', date: '2024/03/01', values: {} },
        { id: 'no-values', exerciseId: 'run', date: '2024-03-01' },
        { id: 'array-values', exerciseId: 'run', date: '2024-03-01', values: [] },
        { id: 'no-exercise', date: '2024-03-01', values: {} },
      ],
    };

    const parsed = parseBackup(raw);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].id).toBe('ok');
    expect(parsed.entries[0].values.distance).toBe(1500);
    expect(parsed.entries[0].values.duration).toBe(400);
  });

  it('migrates v1 backups and treats missing schema as v1', () => {
    const v1 = {
      app: 'achievement-book',
      schema: 1,
      entries: [runEntry({ distance: 1.5, duration: 300 })],
      settings: {},
    };
    expect(parseBackup(v1).entries[0].values.distance).toBe(1500);

    const noSchema = {
      app: 'achievement-book',
      entries: [runEntry({ distance: 1.5, duration: 300 })],
    };
    expect(parseBackup(noSchema).entries[0].values.distance).toBe(1500);
  });

  it('keeps only whitelisted settings keys', () => {
    const parsed = parseBackup({
      app: 'achievement-book',
      schema: 2,
      entries: [],
      settings: {
        lang: 'en',
        celebration: 'confetti',
        pullup: { attempts: 8 },
        showHidden: true,
        unexpected: 'x',
      },
    });

    expect(parsed.settings).toEqual({
      lang: 'en',
      celebration: 'confetti',
      pullup: { attempts: 8 },
      showHidden: true,
    });
  });
});

describe('isDemoEntry', () => {
  it('only matches the boolean demo flag', () => {
    expect(isDemoEntry({ demo: true })).toBe(true);
    expect(isDemoEntry({ demo: false })).toBe(false);
    expect(isDemoEntry({ demo: 'true' })).toBe(false);
    expect(isDemoEntry({})).toBe(false);
    expect(isDemoEntry(null)).toBe(false);
  });
});

describe('seeded demo data', () => {
  const today = '2024-03-06';

  it('marks every entry as demo data', () => {
    const entries = makeDemoEntries(today, mulberry32(9));
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.demo === true)).toBe(true);
  });

  it('uses metre distances from the run preset and adds laps for 200m+', () => {
    const entries = makeDemoEntries(today, mulberry32(9));
    const runs = entries.filter((entry) => entry.exerciseId === 'run');
    const options = getMetric(RUN, 'distance').options;

    expect(runs.length).toBeGreaterThan(0);
    for (const entry of runs) {
      expect(options.includes(entry.values.distance)).toBe(true);
      expect(Number.isInteger(entry.values.distance)).toBe(true);
      expect(entry.values.distance).toBeGreaterThanOrEqual(100);

      if (entry.values.distance >= 200) {
        expect(entry.values.laps).toBe(Math.ceil(entry.values.distance / 200));
      } else {
        expect(entry.values.laps).toBeUndefined();
      }
    }
  });
});
