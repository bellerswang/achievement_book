// Public Firebase web config (identifies the project; not a secret).
// Security comes from Firestore rules (see firestore.rules) + Google sign-in.
// Never put service-account keys or tokens in this repo.
export const FIREBASE_CONFIG = {
  "apiKey": "AIzaSyBuomy6us4CFDW9C5ZDiEbfgkUGAdiaYcE",
  "authDomain": "mercurial-weft-455321-v6.firebaseapp.com",
  "projectId": "mercurial-weft-455321-v6",
  "storageBucket": "mercurial-weft-455321-v6.firebasestorage.app",
  "messagingSenderId": "765248078203",
  "appId": "1:765248078203:web:327ac1238a79268dfbbdde"
};

// Where this app's events live. The project also has other collections
// (e.g. `records` for voice notes) — this app never touches them.
export const EVENTS_COLLECTION = 'achievement_events'; // users/{uid}/achievement_events/{eventId}
