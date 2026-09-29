// Data layer. Two backends with the same interface:
//  - local:    localStorage on this device (used while firebase-config.js is null)
//  - firebase: Firestore (offline persistence) + Auth (anonymous first, upgrade to email/password)
// All timestamps are stored as milliseconds since epoch.

import { firebaseConfig, FIREBASE_VERSION } from "./firebase-config.js";

export const state = {
  mode: firebaseConfig ? "firebase" : "local",
  ready: false,
  user: null, // { uid, email, isAnonymous }
  people: [],
  events: [],
  error: null,
};

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
let emitQueued = false;
function emit() {
  if (emitQueued) return;
  emitQueued = true;
  queueMicrotask(() => {
    emitQueued = false;
    listeners.forEach((fn) => fn(state));
  });
}

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

function upsertLocal(col, obj) {
  const list = state[col];
  const i = list.findIndex((x) => x.id === obj.id);
  if (i >= 0) list[i] = obj;
  else list.push(obj);
}
function removeLocal(col, id) {
  state[col] = state[col].filter((x) => x.id !== id);
}

/* ---------------- Local backend ---------------- */

const LS_KEY = "nameapp:v1";
let memoryFallback = null;

const local = {
  async init() {
    let data = null;
    try {
      data = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    } catch {
      data = memoryFallback;
    }
    state.people = data?.people || [];
    state.events = data?.events || [];
    state.user = { uid: "local", email: null, isAnonymous: true };
    state.ready = true;
    emit();
  },
  save() {
    const data = { people: state.people, events: state.events };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch {
      memoryFallback = data;
    }
  },
  put(col, obj) {
    upsertLocal(col, obj);
    this.save();
    emit();
  },
  remove(col, id) {
    removeLocal(col, id);
    this.save();
    emit();
  },
  async removeAll() {
    state.people = [];
    state.events = [];
    this.save();
    emit();
  },
};

/* ---------------- Firebase backend ---------------- */

const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
let fb = null; // { auth, db, a: authModule, f: firestoreModule }
let unsubs = [];

const firebase = {
  async init() {
    const [appM, a, f] = await Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-auth.js`),
      import(`${CDN}/firebase-firestore.js`),
    ]);
    const app = appM.initializeApp(firebaseConfig);
    const auth = a.getAuth(app);
    let db;
    try {
      db = f.initializeFirestore(app, {
        localCache: f.persistentLocalCache({ tabManager: f.persistentMultipleTabManager() }),
      });
    } catch {
      db = f.getFirestore(app);
    }
    fb = { auth, db, a, f };

    a.onAuthStateChanged(auth, async (user) => {
      unsubs.forEach((u) => u());
      unsubs = [];
      if (!user) {
        state.user = null;
        state.people = [];
        state.events = [];
        emit();
        try {
          await a.signInAnonymously(auth);
        } catch (e) {
          state.error = friendlyError(e);
          state.ready = true;
          emit();
        }
        return;
      }
      state.user = { uid: user.uid, email: user.email, isAnonymous: user.isAnonymous };
      for (const col of ["people", "events"]) {
        const ref = f.collection(db, "users", user.uid, col);
        unsubs.push(
          f.onSnapshot(
            ref,
            (snap) => {
              state[col] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
              state.ready = true;
              emit();
            },
            (err) => {
              state.error = friendlyError(err);
              state.ready = true;
              emit();
            }
          )
        );
      }
    });
  },
  ref(col, id) {
    return fb.f.doc(fb.db, "users", state.user.uid, col, id);
  },
  put(col, obj) {
    upsertLocal(col, obj);
    emit();
    const { id, ...data } = obj;
    // Not awaited: Firestore queues writes offline and syncs later.
    fb.f.setDoc(this.ref(col, id), data).catch((e) => console.warn("write failed", e));
  },
  remove(col, id) {
    removeLocal(col, id);
    emit();
    fb.f.deleteDoc(this.ref(col, id)).catch((e) => console.warn("delete failed", e));
  },
  async removeAll() {
    const docs = [
      ...state.people.map((p) => ["people", p.id]),
      ...state.events.map((e) => ["events", e.id]),
    ];
    state.people = [];
    state.events = [];
    emit();
    for (let i = 0; i < docs.length; i += 400) {
      const batch = fb.f.writeBatch(fb.db);
      docs.slice(i, i + 400).forEach(([col, id]) => batch.delete(this.ref(col, id)));
      await batch.commit();
    }
  },
};

const backend = state.mode === "firebase" ? firebase : local;

export async function init() {
  try {
    await backend.init();
  } catch (e) {
    console.error(e);
    state.error = "Couldn't connect to the sync service. Check your connection and reload.";
    state.ready = true;
    emit();
  }
}

/* ---------------- Public data API ---------------- */

export function putPerson(p) {
  backend.put("people", { ...p, updatedAt: Date.now() });
}
export function deletePerson(id) {
  backend.remove("people", id);
}
export function putEvent(e) {
  backend.put("events", e);
}
export function deleteEvent(id) {
  backend.remove("events", id);
}
export function getPerson(id) {
  return state.people.find((p) => p.id === id);
}
export function getEvent(id) {
  return state.events.find((e) => e.id === id);
}
export async function deleteAllData() {
  await backend.removeAll();
}
export function exportData() {
  return {
    app: "NameApp",
    exportedAt: new Date().toISOString(),
    people: state.people,
    events: state.events,
  };
}

/* ---------------- Account (Firebase mode only) ---------------- */

function friendlyError(e) {
  const code = e?.code || "";
  const map = {
    "auth/email-already-in-use": "That email already has an account. Use “I already have an account” instead.",
    "auth/credential-already-in-use": "That email already has an account. Use “I already have an account” instead.",
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/weak-password": "Please use a password with at least 6 characters.",
    "auth/invalid-credential": "Email or password is wrong.",
    "auth/wrong-password": "Email or password is wrong.",
    "auth/user-not-found": "Email or password is wrong.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "No connection. Try again when you're online.",
    "auth/requires-recent-login": "For safety, please sign in again and then repeat this.",
    "auth/operation-not-allowed": "This sign-in method isn't enabled in the Firebase console yet.",
    "auth/admin-restricted-operation": "Anonymous sign-in isn't enabled in the Firebase console yet.",
    "permission-denied": "Access denied. Check the Firestore security rules.",
  };
  return map[code] || e?.message || "Something went wrong.";
}

export async function createAccount(email, password) {
  const { a, auth } = fb;
  try {
    const cred = a.EmailAuthProvider.credential(email, password);
    const res = await a.linkWithCredential(auth.currentUser, cred);
    state.user = { uid: res.user.uid, email: res.user.email, isAnonymous: false };
    emit();
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

export async function signIn(email, password) {
  const { a, auth } = fb;
  // Carry over anything captured before signing in.
  const carry = auth.currentUser?.isAnonymous
    ? { people: [...state.people], events: [...state.events] }
    : null;
  try {
    await a.signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    throw new Error(friendlyError(e));
  }
  if (carry && (carry.people.length || carry.events.length)) {
    await waitFor(() => state.user && !state.user.isAnonymous);
    carry.events.forEach((ev) => firebase.put("events", ev));
    carry.people.forEach((p) => firebase.put("people", p));
  }
}

export async function resetPassword(email) {
  try {
    await fb.a.sendPasswordResetEmail(fb.auth, email);
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

export async function signOut() {
  await fb.a.signOut(fb.auth);
}

export async function deleteAccount() {
  try {
    await firebase.removeAll();
    await fb.a.deleteUser(fb.auth.currentUser);
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

function waitFor(cond, timeout = 8000) {
  return new Promise((resolve) => {
    if (cond()) return resolve();
    const start = Date.now();
    const unsub = subscribe(() => {
      if (cond() || Date.now() - start > timeout) {
        unsub();
        resolve();
      }
    });
    setTimeout(() => {
      unsub();
      resolve();
    }, timeout);
  });
}
