// IndexedDB (via idb) + localStorage settings for 成就本.
//
// Records are never edited or removed in place: every save, deletion,
// demo-clear, clear-all and import appends events to the log, and the list
// of records the UI shows is replay(events).

import { openDB } from 'idb';
import { PRESET_EXERCISES } from './presets.js';
import { migrateEntry, makeBackup, parseBackup } from './backup.js';
import {
  addedEvent,
  deletedEvent,
  diffToEvents,
  replay,
  mergeEvents,
  isValidEvent,
  cleanEvent,
  isDemoEvent,
  deletedRecords,
} from './events.js';

// v1: entries · v2: run km→m · v3: append-only `events` log (source of truth)
// + `synced` (which event ids are safely in Firestore). The old `entries`
// store is left untouched as a frozen pre-v3 snapshot; it is never cleared.
const DB_NAME = 'achievement-book';
const DB_VERSION = 3;
const SETTINGS_PREFIX = 'ab:';

let dbPromise = null;

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function genId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    try {
      return c.randomUUID();
    } catch {
      /* fall through */
    }
  }
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function seedPresets(store) {
  for (const exercise of PRESET_EXERCISES) store.put(clone(exercise));
}

function normalizeEntry(entry) {
  const source = entry || {};
  return {
    ...source,
    id: source.id || genId(),
    createdAt: typeof source.createdAt === 'number' ? source.createdAt : Date.now(),
    values: { ...(source.values || {}) },
  };
}

export function openDatabase() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains('exercises')) {
          db.createObjectStore('exercises', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('entries')) {
          const entries = db.createObjectStore('entries', { keyPath: 'id' });
          entries.createIndex('byExercise', 'exerciseId');
          entries.createIndex('byDate', 'date');
        }
        if (!db.objectStoreNames.contains('events')) {
          db.createObjectStore('events', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('synced')) {
          db.createObjectStore('synced', { keyPath: 'id' });
        }
        if (oldVersion < 1) {
          seedPresets(tx.objectStore('exercises'));
        }
        if (oldVersion >= 1 && oldVersion < 2) {
          const store = tx.objectStore('entries');
          let cursor = await store.openCursor();
          while (cursor) {
            await cursor.update(migrateEntry(cursor.value, oldVersion));
            cursor = await cursor.continue();
          }
        }
        if (oldVersion >= 1 && oldVersion < 3) {
          // Backfill: every pre-v3 record becomes a `record.added` event,
          // timestamped when it was originally created.
          const entries = await tx.objectStore('entries').getAll();
          const events = tx.objectStore('events');
          for (const entry of entries || []) {
            if (!entry || !entry.id || !entry.exerciseId || !entry.date) continue;
            const when = typeof entry.createdAt === 'number' ? entry.createdAt : Date.now();
            await events.put(addedEvent(entry, when));
          }
        }
      },
      terminated() {
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

export async function getExercises() {
  const db = await openDatabase();
  // Presets are the source of truth for built-in exercises: refresh them on
  // every load so preset changes ship without a DB migration.
  const tx = db.transaction('exercises', 'readwrite');
  seedPresets(tx.objectStore('exercises'));
  await tx.done;
  const all = await db.getAll('exercises');
  return all.sort((a, b) => (a.order || 0) - (b.order || 0));
}

/* ---------------- event log ---------------- */

export async function getEvents() {
  const db = await openDatabase();
  const all = await db.getAll('events');
  return Array.isArray(all) ? all : [];
}

/** Append events (never overwrites an existing id). Returns the ones added. */
export async function appendEvents(list) {
  const db = await openDatabase();
  const tx = db.transaction('events', 'readwrite');
  const store = tx.objectStore('events');
  const added = [];
  for (const raw of list || []) {
    if (!isValidEvent(raw)) continue;
    const ev = cleanEvent(raw);
    const exists = await store.getKey(ev.id);
    if (exists !== undefined) continue;
    await store.add(ev);
    added.push(ev);
  }
  await tx.done;
  return added;
}

export async function getSyncedIds() {
  const db = await openDatabase();
  const keys = await db.getAllKeys('synced');
  return new Set(keys || []);
}

export async function markSynced(ids, at = Date.now()) {
  const db = await openDatabase();
  const tx = db.transaction('synced', 'readwrite');
  for (const id of ids || []) tx.store.put({ id, syncedAt: at });
  await tx.done;
}

/** Events fetched from the cloud: add the ones we lack and mark all as synced. */
export async function importRemoteEvents(list, at = Date.now()) {
  const valid = (list || []).filter(isValidEvent);
  const added = await appendEvents(valid);
  await markSynced(
    valid.map((ev) => ev.id),
    at
  );
  return added.length;
}

/* ---------------- records (= replay of the log) ---------------- */

export async function getEntries() {
  return replay(await getEvents());
}

export async function addEntry(entry) {
  const record = normalizeEntry(entry);
  const ev = addedEvent(record);
  await appendEvents([ev]);
  return replay([ev])[0] || record;
}

export async function deleteEntry(id, reason = 'user') {
  return deleteEntries([id], reason);
}

export async function deleteEntries(ids, reason = 'user') {
  const want = new Set((ids || []).filter((id) => id !== undefined && id !== null).map(String));
  if (!want.size) return 0;
  const current = await getEntries();
  const events = current.filter((e) => want.has(String(e.id))).map((e) => deletedEvent(e, reason));
  await appendEvents(events);
  return events.length;
}

/** "Clear all": appends a deletion per record. The log (and cloud) keep everything. */
export async function clearEntries(reason = 'clear-all') {
  const current = await getEntries();
  await appendEvents(current.map((e) => deletedEvent(e, reason)));
  return current.length;
}

export async function bulkAddEntries(list) {
  const records = (list || []).map(normalizeEntry);
  await appendEvents(records.map((r) => addedEvent(r)));
  return replay(await getEvents()).filter((e) => records.some((r) => r.id === e.id));
}

export async function replaceAllEntries(list, reason = 'import') {
  const current = await getEntries();
  const target = (list || []).map(normalizeEntry);
  await appendEvents(diffToEvents(current, target, reason));
  return getEntries();
}

export async function clearDemoEntries() {
  const all = await getEntries();
  const ids = all.filter((entry) => entry && entry.demo === true).map((entry) => entry.id);
  if (!ids.length) return 0;
  return deleteEntries(ids, 'demo-clear');
}

/* ---------------- JSON backup (second safety net) ---------------- */

export async function exportBackup(settings) {
  const events = await getEvents();
  return makeBackup({ entries: replay(events), events, settings, now: Date.now() });
}

/**
 * Import a JSON backup.
 * - Schema 3 (has `events`): the logs are merged (union) — nothing is lost.
 * - Older backups (entries only): the current records are replaced, but via
 *   appended add/correct/delete events, so the log still has everything.
 */
export async function importBackup(textOrObj, options = {}) {
  const parsed = parseBackup(textOrObj);
  if (parsed.events.length) {
    // 1) union the logs (adds any history this device never had)
    const added = await appendEvents(mergeEvents([], parsed.events));
    // 2) every record that was live in the backup must be live again
    //    (e.g. restoring after "clear all"): re-add the missing ones.
    const current = new Set((await getEntries()).map((e) => e.id));
    const missing = replay(parsed.events).filter((r) => !current.has(r.id));
    await appendEvents(missing.map((r) => addedEvent(r)));
    return {
      count: replay(parsed.events).length,
      added: added.length,
      restored: missing.length,
      settings: parsed.settings,
      mode: 'merge',
    };
  }
  const mode = options && options.mode === 'merge' ? 'merge' : 'replace';
  const records =
    mode === 'merge' ? await bulkAddEntries(parsed.entries) : await replaceAllEntries(parsed.entries);
  return { count: records.length, settings: parsed.settings, mode };
}

/** Bring back every real record that was deleted (they are all still in the log). */
export async function restoreDeleted() {
  const gone = deletedRecords(await getEvents());
  await appendEvents(gone.map((r) => addedEvent(r)));
  return gone.length;
}

export async function countDeleted() {
  return deletedRecords(await getEvents()).length;
}

export { isDemoEvent };

export function getSetting(key, fallback) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return fallback;
    const raw = storage.getItem(SETTINGS_PREFIX + key);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setSetting(key, value) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    storage.setItem(SETTINGS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable / quota — ignore */
  }
}

/** Forget which events are in the cloud (e.g. a different parent account signed in). */
export async function clearSynced() {
  const db = await openDatabase();
  await db.clear('synced');
}
