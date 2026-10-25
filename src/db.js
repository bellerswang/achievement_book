// IndexedDB (via idb) + localStorage settings for 成就本.

import { openDB } from 'idb';
import { PRESET_EXERCISES } from './presets.js';

const DB_NAME = 'achievement-book';
const DB_VERSION = 1;
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
      upgrade(db, oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains('exercises')) {
          db.createObjectStore('exercises', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('entries')) {
          const entries = db.createObjectStore('entries', { keyPath: 'id' });
          entries.createIndex('byExercise', 'exerciseId');
          entries.createIndex('byDate', 'date');
        }
        if (oldVersion < 1) {
          seedPresets(tx.objectStore('exercises'));
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

export async function getEntries() {
  const db = await openDatabase();
  const all = await db.getAll('entries');
  return Array.isArray(all) ? all : [];
}

export async function addEntry(entry) {
  const db = await openDatabase();
  const record = normalizeEntry(entry);
  await db.put('entries', record);
  return record;
}

export async function deleteEntry(id) {
  const db = await openDatabase();
  await db.delete('entries', id);
}

export async function clearEntries() {
  const db = await openDatabase();
  await db.clear('entries');
}

export async function bulkAddEntries(list) {
  const db = await openDatabase();
  const tx = db.transaction('entries', 'readwrite');
  const store = tx.objectStore('entries');
  const records = [];
  for (const item of list || []) {
    const record = normalizeEntry(item);
    records.push(record);
    store.put(record);
  }
  await tx.done;
  return records;
}

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
