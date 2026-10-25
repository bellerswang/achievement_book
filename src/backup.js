// Pure backup / migration helpers for 成就本.
//
// Backup schema 3 also carries the full append-only event log (`events`),
// which is the real source of truth. `entries` is kept as a readable
// snapshot and for importing older (schema 1–2) backups.

import { isValidEvent, cleanEvent } from './events.js';

export const SCHEMA_VERSION = 3;

const APP_ID = 'achievement-book';
const INVALID_BACKUP = '无效的备份文件 / Invalid backup file';
const SETTINGS_KEYS = ['lang', 'celebration', 'pullup', 'showHidden'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function coerceValues(values) {
  const out = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string' && value.trim() !== '') {
      const n = Number(value);
      if (Number.isFinite(n)) {
        out[key] = n;
        continue;
      }
    }
    out[key] = value;
  }
  return out;
}

function sourceSchemaOf(raw) {
  const value = raw && raw.schema;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 1;
}

/**
 * Migrate one entry to the current schema. Never mutates the input.
 * v1 stored run distance in km; v2 stores integer metres.
 *
 * @param {object} entry
 * @param {number} fromVersion
 * @returns {object}
 */
export function migrateEntry(entry, fromVersion) {
  if (!isObject(entry)) return entry;

  const next = {
    ...entry,
    values: isObject(entry.values) ? { ...entry.values } : {},
  };

  const numericVersion = Number(fromVersion);
  const version = Number.isFinite(numericVersion) ? numericVersion : 0;

  if (version < 2 && next.exerciseId === 'run') {
    const distance = next.values.distance;
    if (
      typeof distance === 'number' &&
      Number.isFinite(distance) &&
      distance > 0 &&
      distance < 50
    ) {
      next.values.distance = Math.round(distance * 1000);
    }
  }

  return next;
}

export function migrateEntries(list, fromVersion) {
  if (!Array.isArray(list)) return [];
  return list.map((entry) => migrateEntry(entry, fromVersion));
}

export function makeBackup({ entries, events, settings, now } = {}) {
  const out = {
    app: APP_ID,
    schema: SCHEMA_VERSION,
    exportedAt: new Date(now).toISOString(),
    entries: Array.isArray(entries)
      ? entries.map((entry) =>
          isObject(entry)
            ? { ...entry, values: isObject(entry.values) ? { ...entry.values } : {} }
            : entry
        )
      : [],
    settings: isObject(settings) ? { ...settings } : {},
  };
  if (Array.isArray(events)) out.events = events.filter(isValidEvent).map(cleanEvent);
  return out;
}

export function parseBackup(textOrObject) {
  let raw;

  if (typeof textOrObject === 'string') {
    try {
      raw = JSON.parse(textOrObject);
    } catch {
      throw new Error(INVALID_BACKUP);
    }
  } else {
    raw = textOrObject;
  }

  if (!isObject(raw) || raw.app !== APP_ID || !Array.isArray(raw.entries)) {
    throw new Error(INVALID_BACKUP);
  }

  const schema = sourceSchemaOf(raw);
  const entries = [];

  for (const candidate of raw.entries) {
    if (!isObject(candidate)) continue;
    if (typeof candidate.id !== 'string' || candidate.id === '') continue;
    if (typeof candidate.exerciseId !== 'string' || candidate.exerciseId === '') continue;
    if (typeof candidate.date !== 'string' || !DATE_RE.test(candidate.date)) continue;
    if (!isObject(candidate.values)) continue;

    const base = { ...candidate, values: coerceValues(candidate.values) };
    entries.push(migrateEntry(base, schema));
  }

  const settings = {};
  if (isObject(raw.settings)) {
    for (const key of SETTINGS_KEYS) {
      if (Object.prototype.hasOwnProperty.call(raw.settings, key)) {
        settings[key] = raw.settings[key];
      }
    }
  }

  const events = Array.isArray(raw.events) ? raw.events.filter(isValidEvent).map(cleanEvent) : [];

  return { entries, events, settings, schema };
}

export function isDemoEntry(entry) {
  return !!entry && entry.demo === true;
}
