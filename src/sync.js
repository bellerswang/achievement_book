// Cloud backup of the append-only event log to Firestore.
//
//   users/{uid}/achievement_events/{eventId}
//
// - Parents only: Google sign-in. May never needs to log in; the app works
//   fully offline and the local log is always written first.
// - Upload = set each not-yet-synced event (rules allow create, or an
//   identical rewrite, never a change or delete — the cloud log is append-only).
// - Download = read the whole collection and add any events this device
//   lacks (a new phone / a wiped browser gets everything back on sign-in).
// - Firebase is loaded lazily so the kid-facing screens never wait for it.
// - Uses firestore/lite (plain HTTPS, no extra offline cache): the local
//   IndexedDB log is the offline store.

import { FIREBASE_CONFIG, EVENTS_COLLECTION } from './firebase-config.js';
import { uploadable, cleanEvent } from './events.js';

let fbPromise = null;

function loadFirebase() {
  if (!fbPromise) {
    fbPromise = Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore/lite'),
    ])
      .then(([appMod, authMod, fsMod]) => {
        const app = appMod.initializeApp(FIREBASE_CONFIG, 'achievement-book');
        const auth = authMod.getAuth(app);
        const db = fsMod.getFirestore(app);
        return { app, auth, db, authMod, fsMod };
      })
      .catch((err) => {
        fbPromise = null; // allow a retry later (e.g. when back online)
        throw err;
      });
  }
  return fbPromise;
}

/** Subscribe to parent sign-in state. cb(user|null). Returns an unsubscribe fn. */
export async function watchAuth(cb) {
  const { auth, authMod } = await loadFirebase();
  try {
    // Finish a redirect sign-in if one was started (fallback path).
    await authMod.getRedirectResult(auth);
  } catch {
    /* ignore — reported through status when the user retries */
  }
  return authMod.onAuthStateChanged(auth, (user) =>
    cb(user ? { uid: user.uid, email: user.email || '', name: user.displayName || '' } : null)
  );
}

export async function signInParent() {
  const { auth, authMod } = await loadFirebase();
  const provider = new authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await authMod.signInWithPopup(auth, provider);
  } catch (err) {
    const code = err && err.code;
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment' ||
      code === 'auth/web-storage-unsupported'
    ) {
      await authMod.signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
}

export async function signOutParent() {
  const { auth, authMod } = await loadFirebase();
  await authMod.signOut(auth);
}

function eventsCol(fs, db, uid) {
  return fs.collection(db, 'users', uid, EVENTS_COLLECTION);
}

/**
 * Two-way sync. `store` provides getEvents, getSyncedIds, markSynced,
 * importRemoteEvents (from db.js). Returns { uploaded, downloaded }.
 */
export async function syncNow(uid, store) {
  if (!uid) throw new Error('not signed in');
  const { db, fsMod: fs } = await loadFirebase();

  // 1) upload what the cloud doesn't have yet (demo events stay local)
  const [events, synced] = await Promise.all([store.getEvents(), store.getSyncedIds()]);
  const pending = uploadable(events).filter((ev) => !synced.has(ev.id));
  let uploaded = 0;
  for (let i = 0; i < pending.length; i += 400) {
    const chunk = pending.slice(i, i + 400);
    const batch = fs.writeBatch(db);
    for (const ev of chunk) batch.set(fs.doc(eventsCol(fs, db, uid), ev.id), cleanEvent(ev));
    await batch.commit();
    await store.markSynced(chunk.map((ev) => ev.id));
    uploaded += chunk.length;
  }

  // 2) download anything another device (or a previous install) wrote
  const snap = await fs.getDocs(eventsCol(fs, db, uid));
  const remote = [];
  snap.forEach((d) => remote.push(d.data()));
  const downloaded = await store.importRemoteEvents(remote);

  return { uploaded, downloaded, remoteTotal: remote.length };
}
