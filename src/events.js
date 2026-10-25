// Append-only event log for 成就本 — pure functions, no IO.
//
// The RECORDS are what matter; the shape of the app's data will change.
// So every change is stored as an immutable event of raw facts only
// (per-dot grab results, hang seconds, run time and laps, notes…), never
// derived values like "best" or "grab rate". Corrections and deletions are
// NEW events appended to the log; nothing is ever edited or removed.
//
// Fixed envelope (schemaVersion 1):
//   { id, timestamp, sport, eventType, schemaVersion, payload }
//   timestamp: ISO-8601 local time WITH offset, e.g. 2026-10-25T19:03:00.000+01:00

export const EVENT_SCHEMA_VERSION = 1;

export const EVENT_TYPES = Object.freeze({
  ADDED: 'record.added', //      payload { recordId, date, values, recordedAt?, note?, demo? }
  CORRECTED: 'record.corrected', // payload { recordId, date?, values?, note? }
  DELETED: 'record.deleted', //  payload { recordId, reason?, demo? }
});

const ENVELOPE_KEYS = ['id', 'timestamp', 'sport', 'eventType', 'schemaVersion', 'payload'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Derived values that must never be written into an event.
const DERIVED_KEYS = ['best', 'pb', 'ratio', 'grabRate', 'pace', 'rate'];

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function pad(n, w = 2) {
  return String(Math.abs(Math.trunc(n))).padStart(w, '0');
}

/** ISO-8601 in local time with the UTC offset, e.g. 2026-10-25T19:03:00.123+01:00 */
export function isoWithOffset(input) {
  const d = input instanceof Date ? input : new Date(input === undefined ? Date.now() : input);
  const off = -d.getTimezoneOffset(); // minutes east of UTC
  const sign = off >= 0 ? '+' : '-';
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
  );
}

export function genEventId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    try {
      return c.randomUUID();
    } catch {
      /* fall through */
    }
  }
  return `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Keep only raw observed facts from an entry's values.
 * - pull-up stage 1: the per-dot sequence (1 = grabbed, 0 = missed) + attempts;
 *   the grab count is derived from the sequence, so it is dropped when a
 *   sequence exists (kept only for legacy entries without one).
 * - never keeps best/ratio/rate style fields.
 */
export function rawValues(sport, values) {
  const out = {};
  if (!isObject(values)) return out;
  for (const [k, v] of Object.entries(values)) {
    if (DERIVED_KEYS.includes(k)) continue;
    if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v))) continue;
    out[k] = Array.isArray(v) ? v.slice() : v;
  }
  if (sport === 'pullup' && Array.isArray(out.sequence) && out.sequence.length) {
    out.sequence = out.sequence.map((x) => (x === 1 || x === true ? 1 : 0));
    if (typeof out.attempts !== 'number') out.attempts = out.sequence.length;
    delete out.grabs;
  }
  return out;
}

/** Re-derive what the UI expects from raw facts (inverse of rawValues). */
export function hydrateValues(sport, values) {
  const out = isObject(values) ? { ...values } : {};
  if (sport === 'pullup' && Array.isArray(out.sequence) && out.sequence.length) {
    out.grabs = out.sequence.filter((x) => x === 1).length;
    if (typeof out.attempts !== 'number') out.attempts = out.sequence.length;
  }
  return out;
}

let lastAutoTs = 0;
/** Wall-clock ms that never goes backwards within a session (keeps order stable). */
function monotonicNow() {
  const n = Date.now();
  lastAutoTs = n > lastAutoTs ? n : lastAutoTs + 1;
  return lastAutoTs;
}

export function makeEvent({ eventType, sport, payload, now, id } = {}) {
  return {
    id: id || genEventId(),
    timestamp: isoWithOffset(now === undefined ? monotonicNow() : now),
    sport: String(sport || 'unknown'),
    eventType: String(eventType),
    schemaVersion: EVENT_SCHEMA_VERSION,
    payload: isObject(payload) ? payload : {},
  };
}

export function addedEvent(entry, now) {
  const payload = {
    recordId: String(entry.id),
    date: entry.date,
    values: rawValues(entry.exerciseId, entry.values),
  };
  if (typeof entry.note === 'string' && entry.note.trim()) payload.note = entry.note.trim();
  if (entry.demo === true) payload.demo = true;
  // When the record was first made (may be earlier than this event, e.g. a
  // record restored from a JSON backup). A raw fact, not a derived value.
  if (typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)) {
    payload.recordedAt = isoWithOffset(entry.createdAt);
  }
  return makeEvent({ eventType: EVENT_TYPES.ADDED, sport: entry.exerciseId, payload, now });
}

export function deletedEvent(entry, reason, now) {
  const payload = { recordId: String(entry.id) };
  if (reason) payload.reason = String(reason);
  if (entry.demo === true) payload.demo = true;
  return makeEvent({ eventType: EVENT_TYPES.DELETED, sport: entry.exerciseId, payload, now });
}

export function correctedEvent(entry, changes, now) {
  const payload = { recordId: String(entry.id) };
  if (changes && DATE_RE.test(changes.date)) payload.date = changes.date;
  if (changes && isObject(changes.values)) payload.values = rawValues(entry.exerciseId, changes.values);
  if (changes && typeof changes.note === 'string') payload.note = changes.note.trim();
  if (entry.demo === true) payload.demo = true;
  return makeEvent({ eventType: EVENT_TYPES.CORRECTED, sport: entry.exerciseId, payload, now });
}

export function isValidEvent(ev) {
  if (!isObject(ev)) return false;
  for (const k of ENVELOPE_KEYS) if (!(k in ev)) return false;
  return (
    typeof ev.id === 'string' &&
    ev.id.length > 0 &&
    typeof ev.timestamp === 'string' &&
    !Number.isNaN(Date.parse(ev.timestamp)) &&
    typeof ev.sport === 'string' &&
    typeof ev.eventType === 'string' &&
    Number.isInteger(ev.schemaVersion) &&
    isObject(ev.payload)
  );
}

/** Keep exactly the envelope fields (what is stored locally and in Firestore). */
export function cleanEvent(ev) {
  const out = {};
  for (const k of ENVELOPE_KEYS) out[k] = ev[k];
  return JSON.parse(JSON.stringify(out));
}

export function isDemoEvent(ev) {
  return !!(ev && ev.payload && ev.payload.demo === true);
}

/** Stable order: real time first (offset-aware), then id as a tie-breaker. */
export function sortEvents(list) {
  return (Array.isArray(list) ? list : [])
    .filter(isValidEvent)
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.timestamp);
      const tb = Date.parse(b.timestamp);
      if (ta !== tb) return ta - tb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/** Union two logs by event id (events are immutable, so first copy wins). */
export function mergeEvents(a, b) {
  const map = new Map();
  for (const ev of [...(a || []), ...(b || [])]) {
    if (isValidEvent(ev) && !map.has(ev.id)) map.set(ev.id, ev);
  }
  return sortEvents([...map.values()]);
}

/**
 * Replay the log into the current list of records (the UI's "entries").
 * Unknown event types / future schema versions are skipped, not fatal.
 */
export function replay(events) {
  const records = new Map();
  for (const ev of sortEvents(events)) {
    if (ev.schemaVersion > EVENT_SCHEMA_VERSION) continue;
    const p = ev.payload;
    const rid = p && typeof p.recordId === 'string' ? p.recordId : null;
    if (!rid) continue;
    if (ev.eventType === EVENT_TYPES.ADDED) {
      if (!DATE_RE.test(p.date)) continue;
      const rec = {
        id: rid,
        exerciseId: ev.sport,
        date: p.date,
        createdAt:
          typeof p.recordedAt === 'string' && !Number.isNaN(Date.parse(p.recordedAt))
            ? Date.parse(p.recordedAt)
            : Date.parse(ev.timestamp),
        values: hydrateValues(ev.sport, p.values),
      };
      if (typeof p.note === 'string' && p.note) rec.note = p.note;
      if (p.demo === true) rec.demo = true;
      records.set(rid, rec);
    } else if (ev.eventType === EVENT_TYPES.CORRECTED) {
      const cur = records.get(rid);
      if (!cur) continue;
      const next = { ...cur };
      if (DATE_RE.test(p.date)) next.date = p.date;
      if (isObject(p.values)) next.values = hydrateValues(cur.exerciseId, p.values);
      if (typeof p.note === 'string') {
        if (p.note) next.note = p.note;
        else delete next.note;
      }
      records.set(rid, next);
    } else if (ev.eventType === EVENT_TYPES.DELETED) {
      records.delete(rid);
    }
  }
  return [...records.values()];
}

/** Events that should go to the cloud (demo data stays on the device). */
export function uploadable(events) {
  return (events || []).filter((ev) => isValidEvent(ev) && !isDemoEvent(ev));
}

/** { backedUp, pending } counts for the parent area. */
export function syncCounts(events, syncedIds) {
  const set = syncedIds instanceof Set ? syncedIds : new Set(syncedIds || []);
  let backedUp = 0;
  let pending = 0;
  for (const ev of uploadable(events)) {
    if (set.has(ev.id)) backedUp += 1;
    else pending += 1;
  }
  return { backedUp, pending };
}

/**
 * Events that turn `current` records into `target` records
 * (used by "import backup (replace)" so the log still tells the story).
 */
export function diffToEvents(current, target, reason, now) {
  const out = [];
  const cur = new Map((current || []).map((e) => [e.id, e]));
  const tgt = new Map((target || []).map((e) => [e.id, e]));
  const t = now === undefined ? Date.now() : now;
  for (const [id, e] of cur) if (!tgt.has(id)) out.push(deletedEvent(e, reason, t));
  for (const [id, e] of tgt) {
    const before = cur.get(id);
    if (!before) {
      out.push(addedEvent(e, t));
    } else if (
      JSON.stringify(rawValues(e.exerciseId, e.values)) !==
        JSON.stringify(rawValues(before.exerciseId, before.values)) ||
      e.date !== before.date ||
      (e.note || '') !== (before.note || '')
    ) {
      out.push(correctedEvent(before, { date: e.date, values: e.values, note: e.note || '' }, t));
    }
  }
  return out;
}

/**
 * Records that existed at some point but are deleted now (last known state),
 * excluding demo data — what "找回删除的记录" can bring back.
 */
export function deletedRecords(events) {
  const sorted = sortEvents(events);
  const everSeen = new Map();
  const live = new Set();
  for (const ev of sorted) {
    const rid = ev.payload && ev.payload.recordId;
    if (!rid) continue;
    if (ev.eventType === EVENT_TYPES.DELETED) live.delete(rid);
    else if (ev.eventType === EVENT_TYPES.ADDED) live.add(rid);
  }
  for (const rec of replayKeepDeleted(sorted)) everSeen.set(rec.id, rec);
  return [...everSeen.values()].filter((r) => !live.has(r.id) && r.demo !== true);
}

// Like replay(), but deletions do not remove the last known state.
function replayKeepDeleted(sorted) {
  const withoutDeletes = sorted.filter((ev) => ev.eventType !== EVENT_TYPES.DELETED);
  return replay(withoutDeletes);
}
