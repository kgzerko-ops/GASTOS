// ═══════════════════════════════════════════════════════════════
// DATA LAYER — Firestore + caché local en IndexedDB
// ═══════════════════════════════════════════════════════════════

import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp, getDoc, setDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

let db;
const listeners = new Map(); // key → unsubscribe

export function initDb(fbApp) {
  db = getFirestore(fbApp);
}

export function getDb() { return db; }

// ── IndexedDB caché ─────────────────────────────
const DB_NAME = 'gastospro-cache';
const DB_VERSION = 1;
const STORE = 'docs';

function openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) {
        d.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const d = await openIdb();
  return new Promise((resolve) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ key, value, ts: Date.now() });
    tx.oncomplete = () => resolve();
  });
}

async function idbGet(key) {
  const d = await openIdb();
  return new Promise((resolve) => {
    const tx = d.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => resolve(null);
  });
}

// ── Expenses ────────────────────────────────────
export async function createExpense(data) {
  const ref = await addDoc(collection(db, 'expenses'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateExpense(id, data) {
  await updateDoc(doc(db, 'expenses', id), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function deleteExpense(id) {
  await deleteDoc(doc(db, 'expenses', id));
}

export async function getExpense(id) {
  const snap = await getDoc(doc(db, 'expenses', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Suscribe a los gastos aplicando los filtros de permisos del usuario.
 * Retorna función para desuscribir.
 */
export function subscribeExpenses(user, callback) {
  let q = collection(db, 'expenses');

  if (user.role !== 'admin' && !user.puedeVerTodos) {
    // Usuario normal: solo sus propios gastos
    q = query(q, where('createdByUid', '==', user.uid), orderBy('fecha', 'desc'));
  } else {
    q = query(q, orderBy('fecha', 'desc'));
  }

  const unsub = onSnapshot(q, (snap) => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    idbSet('expenses-' + user.uid, docs).catch(() => {});
    callback(docs);
  }, async (err) => {
    console.error('subscribeExpenses error:', err);
    // Fallback a caché
    const cached = await idbGet('expenses-' + user.uid);
    if (cached) callback(cached);
  });

  return unsub;
}

// ── Users (admin) ───────────────────────────────
export async function getAllUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

export async function updateUserProfile(uid, data) {
  await updateDoc(doc(db, 'users', uid), data);
}

// ── Budgets ─────────────────────────────────────
export async function getAllBudgets() {
  const snap = await getDocs(collection(db, 'budgets'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveBudget(empresa, monto) {
  // id = empresa slugificada
  const id = empresa.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await setDoc(doc(db, 'budgets', id), {
    empresa, monto: Number(monto), updatedAt: serverTimestamp()
  });
}

export async function deleteBudget(id) {
  await deleteDoc(doc(db, 'budgets', id));
}

// ── Events / Proyectos ──────────────────────────
export async function getAllEvents() {
  const snap = await getDocs(collection(db, 'events'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveEvent(data, id = null) {
  if (id) {
    await updateDoc(doc(db, 'events', id), data);
    return id;
  }
  const ref = await addDoc(collection(db, 'events'), {
    ...data, createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function deleteEvent(id) {
  await deleteDoc(doc(db, 'events', id));
}
