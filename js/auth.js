// ═══════════════════════════════════════════════════════════════
// AUTENTICACIÓN — Firebase Auth + perfil en Firestore (users/{uid})
// ═══════════════════════════════════════════════════════════════

import {
  getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut as fbSignOut, updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { bootstrapAdminEmail, defaultCompanyName } from './firebase-config.js';

let auth, db;
let currentProfile = null;
const listeners = [];

export function initAuth(fbApp) {
  auth = getAuth(fbApp);
  db = getFirestore(fbApp);

  onAuthStateChanged(auth, async (fbUser) => {
    if (!fbUser) {
      currentProfile = null;
      listeners.forEach(cb => cb(null));
      return;
    }

    // Cargar o crear perfil
    const profile = await loadOrCreateProfile(fbUser);
    currentProfile = profile;
    listeners.forEach(cb => cb(profile));
  });

  // Enganchar botones del login
  bindLoginForm();
}

async function loadOrCreateProfile(fbUser) {
  const ref = doc(db, 'users', fbUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return { uid: fbUser.uid, ...snap.data() };
  }

  // Usuario nuevo: crear perfil
  const isBootstrapAdmin = bootstrapAdminEmail && bootstrapAdminEmail.toLowerCase() === fbUser.email.toLowerCase();
  const newProfile = {
    email: fbUser.email,
    displayName: fbUser.displayName || fbUser.email.split('@')[0],
    role: isBootstrapAdmin ? 'admin' : 'user',
    empresa: defaultCompanyName,
    empresasVisibles: [defaultCompanyName],
    puedeVerTodos: isBootstrapAdmin,
    active: isBootstrapAdmin ? true : false,  // nuevos usuarios quedan pendientes de aprobación
    createdAt: serverTimestamp()
  };
  await setDoc(ref, newProfile);
  return { uid: fbUser.uid, ...newProfile };
}

export function onAuthReady(cb) {
  listeners.push(cb);
  if (currentProfile !== null || auth?.currentUser === null) {
    cb(currentProfile);
  }
}

export function getCurrentUser() {
  return currentProfile;
}

export async function signOut() {
  await fbSignOut(auth);
}

// ── Login UI ────────────────────────────────────
function bindLoginForm() {
  const emailInp = document.getElementById('login-email');
  const passInp  = document.getElementById('login-password');
  const errBox   = document.getElementById('login-error');

  const showErr = (msg) => { errBox.textContent = msg; };

  document.getElementById('btn-login-google').addEventListener('click', async () => {
    showErr('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      showErr('Error: ' + friendlyError(err));
    }
  });

  document.getElementById('btn-login-email').addEventListener('click', async () => {
    showErr('');
    const email = emailInp.value.trim();
    const pass  = passInp.value;
    if (!email || !pass) return showErr('Introduce email y contraseña');
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      showErr(friendlyError(err));
    }
  });

  document.getElementById('btn-register').addEventListener('click', async () => {
    showErr('');
    const email = emailInp.value.trim();
    const pass  = passInp.value;
    if (!email || !pass) return showErr('Introduce email y contraseña para crear cuenta');
    if (pass.length < 6) return showErr('La contraseña debe tener al menos 6 caracteres');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: email.split('@')[0] });
    } catch (err) {
      showErr(friendlyError(err));
    }
  });
}

function friendlyError(err) {
  const code = err.code || '';
  const map = {
    'auth/invalid-credential': 'Credenciales inválidas',
    'auth/user-not-found':     'Usuario no existe',
    'auth/wrong-password':     'Contraseña incorrecta',
    'auth/email-already-in-use': 'Email ya registrado',
    'auth/invalid-email':      'Email inválido',
    'auth/weak-password':      'Contraseña muy débil (mín. 6 caracteres)',
    'auth/popup-closed-by-user': 'Cancelado'
  };
  return map[code] || err.message || 'Error desconocido';
}
