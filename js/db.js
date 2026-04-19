// ═══════════════════════════════════════════════════════════════
// DATA LAYER — Firestore + caché local en IndexedDB
// ═══════════════════════════════════════════════════════════════

import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp, getDoc, setDoc, limit
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { filterVisibleExpenses } from './roles.js';

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
 * Seguridad real en las Reglas de Firestore; aquí filtramos cliente para UI.
 */
export function subscribeExpenses(user, callback) {
  const q = query(collection(db, 'expenses'), orderBy('fecha', 'desc'));

  const unsub = onSnapshot(q, (snap) => {
    const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const visible = filterVisibleExpenses(allDocs, user);
    window.__lastExpenses = visible;
    idbSet('expenses-' + user.uid, visible).catch(() => {});
    callback(visible);
  }, async (err) => {
    console.error('subscribeExpenses error:', err);
    const cached = await idbGet('expenses-' + user.uid);
    if (cached) callback(cached);
  });

  return unsub;
}

/**
 * Busca un posible duplicado: mismo NIF + mismo total + misma fecha.
 */
export async function findDuplicate({ nifProveedor, total, fecha, excludeId = null }) {
  if (!nifProveedor || !total || !fecha) return null;
  try {
    const q = query(
      collection(db, 'expenses'),
      where('nifProveedor', '==', nifProveedor),
      where('fecha', '==', fecha),
      limit(5)
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      if (d.id === excludeId) continue;
      const data = d.data();
      if (Math.abs(Number(data.total) - Number(total)) < 0.02) {
        return { id: d.id, ...data };
      }
    }
  } catch (err) {
    console.warn('findDuplicate falló:', err);
  }
  return null;
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

// ── Cierres mensuales ───────────────────────────
function closureId(empresa, yyyymm) {
  const slug = String(empresa).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${slug}__${yyyymm}`;
}

export async function isMonthClosed(empresa, yyyymm) {
  try {
    const snap = await getDoc(doc(db, 'closures', closureId(empresa, yyyymm)));
    return snap.exists() && snap.data().closed === true;
  } catch { return false; }
}

export async function getAllClosures() {
  const snap = await getDocs(collection(db, 'closures'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function closeMonth(empresa, yyyymm, adminUid, adminEmail) {
  await setDoc(doc(db, 'closures', closureId(empresa, yyyymm)), {
    empresa, yyyymm, closed: true,
    closedBy: adminEmail, closedByUid: adminUid,
    closedAt: serverTimestamp()
  });
}

export async function reopenMonth(empresa, yyyymm) {
  await deleteDoc(doc(db, 'closures', closureId(empresa, yyyymm)));
}

// ── Comentarios ─────────────────────────────────
export async function addComment(expenseId, { uid, email, name, text }) {
  await addDoc(collection(db, 'expenses', expenseId, 'comments'), {
    uid, email, name, text,
    createdAt: serverTimestamp()
  });
}

export async function listComments(expenseId) {
  const q = query(collection(db, 'expenses', expenseId, 'comments'), orderBy('createdAt', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Recurrentes ─────────────────────────────────
export async function getAllRecurring() {
  const snap = await getDocs(collection(db, 'recurring'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveRecurring(data, id = null) {
  if (id) {
    await updateDoc(doc(db, 'recurring', id), { ...data, updatedAt: serverTimestamp() });
    return id;
  }
  const ref = await addDoc(collection(db, 'recurring'), {
    ...data, createdAt: serverTimestamp(), active: true
  });
  return ref.id;
}

export async function deleteRecurring(id) {
  await deleteDoc(doc(db, 'recurring', id));
}

// ── Invitaciones por código ─────────────────────
function generateInviteCode() {
  // 6 caracteres alfanuméricos sin ambiguos (0/O, I/1)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Crea un código de invitación. El documento id ES el código.
 * @param {Object} payload - { email, displayName, role, empresa, empresasVisibles, puedeVerTodos }
 * @param {Object} creator - { uid, email }
 * @returns {Object} - { code, expiresAt }
 */
export async function createInvite(payload, creator) {
  // Intenta hasta 5 veces generar un código único
  for (let i = 0; i < 5; i++) {
    const code = generateInviteCode();
    const ref = doc(db, 'invites', code);
    const existing = await getDoc(ref);
    if (existing.exists()) continue;

    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 días
    await setDoc(ref, {
      email: (payload.email || '').toLowerCase().trim(),
      displayName: payload.displayName || '',
      role: payload.role || 'user',
      empresa: payload.empresa || '',
      empresasVisibles: payload.empresasVisibles || [],
      puedeVerTodos: !!payload.puedeVerTodos,
      used: false,
      usedBy: null,
      usedAt: null,
      createdBy: creator.email,
      createdByUid: creator.uid,
      createdAt: serverTimestamp(),
      expiresAt
    });
    return { code, expiresAt };
  }
  throw new Error('No se pudo generar un código único');
}

export async function getAllInvites() {
  const snap = await getDocs(collection(db, 'invites'));
  return snap.docs.map(d => ({ code: d.id, ...d.data() }));
}

export async function getInvite(code) {
  if (!code) return null;
  const snap = await getDoc(doc(db, 'invites', code.toUpperCase()));
  if (!snap.exists()) return null;
  return { code: snap.id, ...snap.data() };
}

/**
 * Valida una invitación. Lanza error si es inválida.
 */
export async function validateInvite(code, email) {
  const inv = await getInvite(code);
  if (!inv) throw new Error('Código de invitación no válido');
  if (inv.used) throw new Error('Este código ya fue utilizado');
  if (inv.expiresAt && Date.now() > inv.expiresAt) throw new Error('Este código ha caducado');
  if (email && inv.email && inv.email.toLowerCase() !== email.toLowerCase()) {
    throw new Error(`Este código es para ${inv.email}, no para ${email}`);
  }
  return inv;
}

/**
 * Marca un código como consumido. Lo llama auth.js tras crear el perfil.
 */
export async function consumeInvite(code, uid, email) {
  await updateDoc(doc(db, 'invites', code.toUpperCase()), {
    used: true,
    usedBy: email,
    usedByUid: uid,
    usedAt: serverTimestamp()
  });
}

export async function deleteInvite(code) {
  await deleteDoc(doc(db, 'invites', code.toUpperCase()));
}

// ── Borrado de usuario (admin) ──────────────────
/**
 * Borra el perfil del usuario en Firestore. NO borra la cuenta de Auth
 * (solo Firebase Admin SDK puede, y necesita backend).
 * El usuario quedará autenticado pero sin perfil → verá pantalla de acceso denegado.
 * Para limpieza total: el usuario debe borrar su propia cuenta desde la app (opción futura).
 */
export async function deleteUserProfile(uid) {
  await deleteDoc(doc(db, 'users', uid));
}

/**
 * Materializa recurrentes: crea un gasto mensual si aún no existe.
 * Se llama una vez al día al arrancar la app (solo admin).
 */
export async function materializeRecurring(user) {
  const recurrings = await getAllRecurring();
  if (recurrings.length === 0) return 0;

  const today = new Date();
  const yyyymm = today.toISOString().slice(0, 7);
  const dayStr = today.toISOString().slice(0, 10);

  // Buscar gastos ya materializados este mes
  const q = query(
    collection(db, 'expenses'),
    where('fecha', '>=', yyyymm + '-01'),
    where('fecha', '<=', yyyymm + '-31')
  );
  const snap = await getDocs(q);
  const existing = new Set(
    snap.docs.map(d => d.data().recurringId).filter(Boolean)
  );

  let created = 0;
  for (const r of recurrings) {
    if (r.active === false) continue;
    const dia = Number(r.diaMes || 1);
    if (today.getDate() < dia) continue;
    if (existing.has(r.id)) continue;

    const fechaAlta = `${yyyymm}-${String(Math.min(dia, 28)).padStart(2, '0')}`;
    await addDoc(collection(db, 'expenses'), {
      fecha: fechaAlta,
      proveedor: r.proveedor,
      nifProveedor: r.nifProveedor || '',
      concepto: r.concepto || '',
      categoria: r.categoria || 'Otros',
      empresa: r.empresa,
      formaPago: r.formaPago || 'Domiciliación',
      baseImponible: Number(r.baseImponible || 0),
      tipoIva: Number(r.tipoIva || 21),
      ivaTotal: Number(r.ivaTotal || 0),
      tipoIrpf: Number(r.tipoIrpf || 0),
      irpfTotal: Number(r.irpfTotal || 0),
      total: Number(r.total || 0),
      estado: 'pendiente',
      recurringId: r.id,
      recurringName: r.nombre || r.proveedor,
      ticketUrls: [],
      createdByUid: user.uid,
      createdByEmail: user.email,
      createdByName: 'Auto (recurrente)',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    created++;
  }
  return created;
}
