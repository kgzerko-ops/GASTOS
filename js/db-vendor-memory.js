// ═══════════════════════════════════════════════════════════════
// MEMORIA DE PROVEEDORES POR NIF
//
// Cada vez que un usuario guarda un gasto, alimentamos una
// "memoria" del proveedor identificado por su NIF. La próxima vez
// que aparezca ese NIF, pre-rellenamos los campos con lo más
// frecuente (proveedor, categoría, IVA habitual).
//
// Colección Firestore: vendorMemory/{nif}
// {
//   nif: "B12345678",
//   proveedor: "El Racó de l'Alba",
//   categoriaHabitual: "Restauración",
//   tipoIvaHabitual: 10,
//   formaPagoHabitual: "Tarjeta",
//   counts: { categoria: { Restauración: 4, Otros: 1 }, tipoIva: { 10: 5 } },
//   countTotal: 5,
//   updatedAt: timestamp
// }
// ═══════════════════════════════════════════════════════════════

import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getDb } from './db.js';
import { normalizeNif } from './utils/nif-validation.js';

const COLLECTION = 'vendorMemory';

/**
 * Obtiene la memoria de un proveedor por NIF.
 * Devuelve null si no existe.
 */
export async function getVendorMemory(nif) {
  const n = normalizeNif(nif);
  if (!n) return null;
  const db = getDb();
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, COLLECTION, n));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (err) {
    console.warn('[vendor-memory] read failed:', err);
    return null;
  }
}

/**
 * Registra un gasto en la memoria del proveedor.
 * Recalcula el "más frecuente" para los campos relevantes.
 *
 * @param {Object} expense - { nifProveedor, proveedor, categoria, tipoIva, formaPago }
 */
export async function rememberVendor(expense) {
  if (!expense || !expense.nifProveedor) return;
  const nif = normalizeNif(expense.nifProveedor);
  if (!nif) return;
  const db = getDb();
  if (!db) return;

  try {
    const ref = doc(db, COLLECTION, nif);
    const existing = await getDoc(ref);

    if (!existing.exists()) {
      const initialCounts = {
        categoria: expense.categoria ? { [expense.categoria]: 1 } : {},
        tipoIva: expense.tipoIva != null ? { [String(expense.tipoIva)]: 1 } : {},
        formaPago: expense.formaPago ? { [expense.formaPago]: 1 } : {}
      };
      await setDoc(ref, {
        nif,
        proveedor: expense.proveedor || '',
        categoriaHabitual: expense.categoria || 'Otros',
        tipoIvaHabitual: expense.tipoIva ?? 21,
        formaPagoHabitual: expense.formaPago || 'Tarjeta',
        counts: initialCounts,
        countTotal: 1,
        updatedAt: serverTimestamp()
      });
      return;
    }

    const data = existing.data();
    const counts = data.counts || { categoria: {}, tipoIva: {}, formaPago: {} };
    if (!counts.categoria) counts.categoria = {};
    if (!counts.tipoIva) counts.tipoIva = {};
    if (!counts.formaPago) counts.formaPago = {};

    if (expense.categoria) {
      counts.categoria[expense.categoria] = (counts.categoria[expense.categoria] || 0) + 1;
    }
    if (expense.tipoIva != null) {
      const k = String(expense.tipoIva);
      counts.tipoIva[k] = (counts.tipoIva[k] || 0) + 1;
    }
    if (expense.formaPago) {
      counts.formaPago[expense.formaPago] = (counts.formaPago[expense.formaPago] || 0) + 1;
    }

    const update = {
      counts,
      countTotal: (data.countTotal || 0) + 1,
      categoriaHabitual: maxKey(counts.categoria) || data.categoriaHabitual || 'Otros',
      tipoIvaHabitual: parseInt(maxKey(counts.tipoIva), 10) || data.tipoIvaHabitual || 21,
      formaPagoHabitual: maxKey(counts.formaPago) || data.formaPagoHabitual || 'Tarjeta',
      updatedAt: serverTimestamp()
    };

    // Solo actualizar el nombre del proveedor si es la primera vez o el actual está vacío
    if (expense.proveedor && (!data.proveedor || data.proveedor.length < expense.proveedor.length)) {
      update.proveedor = expense.proveedor;
    }

    await updateDoc(ref, update);
  } catch (err) {
    console.warn('[vendor-memory] write failed:', err);
  }
}

/**
 * Devuelve la clave con el contador más alto en un objeto { key: count }.
 */
function maxKey(obj) {
  if (!obj || typeof obj !== 'object') return null;
  let best = null;
  let bestCount = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (v > bestCount) { best = k; bestCount = v; }
  }
  return best;
}

/**
 * Sugerencias para autocompletar el formulario.
 * Devuelve { proveedor, categoria, tipoIva, formaPago, count } o null.
 */
export async function suggestFromMemory(nif) {
  const memory = await getVendorMemory(nif);
  if (!memory) return null;
  return {
    proveedor: memory.proveedor || '',
    categoria: memory.categoriaHabitual || 'Otros',
    tipoIva: memory.tipoIvaHabitual ?? 21,
    formaPago: memory.formaPagoHabitual || 'Tarjeta',
    count: memory.countTotal || 0
  };
}
