// ═══════════════════════════════════════════════════════════════
// AUTENTICACIÓN — Firebase Auth + perfil Firestore + invitaciones
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
import { validateInvite, consumeInvite } from './db.js';

let auth, db;
let currentProfile = null;
const listeners = [];

// ── Parseo de query string ──────────────────────
function getInviteCodeFromUrl() {
  const params = new URLSearchParams(location.search);
  const code = params.get('invite');
  return code ? code.toUpperCase() : null;
}

export function initAuth(fbApp) {
  auth = getAuth(fbApp);
  db = getFirestore(fbApp);

  onAuthStateChanged(auth, async (fbUser) => {
    if (!fbUser) {
      currentProfile = null;
      listeners.forEach(cb => cb(null));
      return;
    }
    try {
      const profile = await loadOrCreateProfile(fbUser);
      currentProfile = profile;
      listeners.forEach(cb => cb(profile));
    } catch (err) {
      console.error('loadOrCreateProfile error:', err);
      // Sin perfil, forzamos logout para evitar limbo
      await fbSignOut(auth);
      alert('Error al cargar tu perfil: ' + err.message);
    }
  });

  bindLoginForm();
}

async function loadOrCreateProfile(fbUser) {
  const ref = doc(db, 'users', fbUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return { uid: fbUser.uid, ...snap.data() };
  }

  // ── Usuario nuevo: comprobar si es bootstrap admin o si trae invitación ─────
  const isBootstrapAdmin = bootstrapAdminEmail &&
    bootstrapAdminEmail.toLowerCase() === fbUser.email.toLowerCase();

  if (isBootstrapAdmin) {
    const profile = {
      email: fbUser.email,
      displayName: fbUser.displayName || fbUser.email.split('@')[0],
      role: 'admin',
      empresa: defaultCompanyName,
      empresasVisibles: [defaultCompanyName],
      puedeVerTodos: true,
      active: true,
      createdAt: serverTimestamp()
    };
    await setDoc(ref, profile);
    return { uid: fbUser.uid, ...profile };
  }

  // Si hay código de invitación en la URL, validarlo y crear perfil activado
  const inviteCode = getInviteCodeFromUrl();
  if (inviteCode) {
    const inv = await validateInvite(inviteCode, fbUser.email);  // lanza si es inválido
    const profile = {
      email: fbUser.email,
      displayName: inv.displayName || fbUser.displayName || fbUser.email.split('@')[0],
      role: inv.role || 'user',
      empresa: inv.empresa || defaultCompanyName,
      empresasVisibles: (inv.empresasVisibles && inv.empresasVisibles.length)
        ? inv.empresasVisibles
        : [inv.empresa || defaultCompanyName].filter(Boolean),
      puedeVerTodos: !!inv.puedeVerTodos,
      active: true,   // activación automática por invitación
      invitedBy: inv.createdBy || null,
      inviteCode,
      createdAt: serverTimestamp()
    };
    await setDoc(ref, profile);
    await consumeInvite(inviteCode, fbUser.uid, fbUser.email);
    return { uid: fbUser.uid, ...profile };
  }

  // Sin bootstrap ni invitación: creamos un perfil mínimo INACTIVO para que
  // vea la pantalla de "acceso denegado" y el admin pueda limpiarlo si quiere.
  const pendingProfile = {
    email: fbUser.email,
    displayName: fbUser.displayName || fbUser.email.split('@')[0],
    role: 'user',
    empresa: '',
    empresasVisibles: [],
    puedeVerTodos: false,
    active: false,
    createdAt: serverTimestamp()
  };
  await setDoc(ref, pendingProfile);
  return { uid: fbUser.uid, ...pendingProfile };
}

export function onAuthReady(cb) {
  listeners.push(cb);
  if (currentProfile !== null || auth?.currentUser === null) {
    cb(currentProfile);
  }
}

export function getCurrentUser() { return currentProfile; }
export async function signOut() { await fbSignOut(auth); }

// ── Login UI ────────────────────────────────────
function bindLoginForm() {
  const inviteCode = getInviteCodeFromUrl();
  const loginCard = document.querySelector('.login-card');
  const errBox = document.getElementById('login-error');
  const showErr = (msg) => { if (errBox) errBox.textContent = msg; };

  // Si hay código en la URL, mostramos UI simplificada
  if (inviteCode) {
    renderInviteLogin(inviteCode, loginCard);
    return;
  }

  // Login normal (sin email/contraseña, solo Google + invitaciones)
  renderStandardLogin(loginCard);
}

function renderStandardLogin(card) {
  card.innerHTML = `
    <h1>GastósPro</h1>
    <p class="subtitle">Gestión de gastos con formato legal español</p>

    <button id="btn-login-google" class="btn btn-primary btn-block">
      <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      Entrar con Google
    </button>

    <div class="login-divider"><span>o con código de invitación</span></div>

    <input type="text" id="invite-input" placeholder="Código de invitación (6 caracteres)" class="input" style="text-transform:uppercase;letter-spacing:.3em;text-align:center;font-weight:600" maxlength="6">
    <button id="btn-go-invite" class="btn btn-secondary btn-block">Usar código</button>

    <p id="login-error" class="error-msg"></p>

    <p class="text-muted" style="font-size:12px;text-align:center;margin-top:12px">
      El registro está restringido. Solicita una invitación al administrador.
    </p>
  `;

  const errBox = document.getElementById('login-error');
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

  document.getElementById('btn-go-invite').addEventListener('click', () => {
    const code = document.getElementById('invite-input').value.trim().toUpperCase();
    if (!code || code.length !== 6) return showErr('El código debe tener 6 caracteres');
    // Redirigir a la misma URL pero con el parámetro invite
    location.search = '?invite=' + encodeURIComponent(code);
  });

  document.getElementById('invite-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-go-invite').click();
  });
}

async function renderInviteLogin(code, card) {
  card.innerHTML = `
    <h1>GastósPro</h1>
    <p class="subtitle">Aceptar invitación</p>
    <div style="text-align:center;padding:20px"><div class="spinner"></div></div>
  `;

  // Validar el código antes de mostrar el formulario
  try {
    const inv = await validateInvite(code);

    const roleLabels = { admin: 'Administrador', colaborador: 'Colaborador', user: 'Usuario', visor: 'Visor' };
    card.innerHTML = `
      <h1>GastósPro</h1>
      <p class="subtitle">Te han invitado</p>

      <div class="alert alert-info" style="font-size:13px;margin-bottom:16px">
        <strong>${escapeHtml(inv.email)}</strong><br>
        Rol: <strong>${roleLabels[inv.role] || inv.role}</strong><br>
        Empresa: <strong>${escapeHtml(inv.empresa || '—')}</strong>
      </div>

      <p style="font-size:14px;margin-bottom:12px">Elige cómo crear tu cuenta:</p>

      <button id="btn-invite-google" class="btn btn-primary btn-block">
        Continuar con Google
      </button>

      <div class="login-divider"><span>o</span></div>

      <input type="password" id="invite-pass" placeholder="Crea una contraseña (mín. 6)" class="input">
      <input type="password" id="invite-pass2" placeholder="Repite la contraseña" class="input">
      <button id="btn-invite-email" class="btn btn-secondary btn-block">Crear cuenta con contraseña</button>

      <p id="login-error" class="error-msg"></p>

      <button id="btn-cancel-invite" class="btn btn-link btn-block" style="margin-top:8px;font-size:13px">Cancelar</button>
    `;

    const errBox = document.getElementById('login-error');
    const showErr = (msg) => { errBox.textContent = msg; };

    document.getElementById('btn-invite-google').addEventListener('click', async () => {
      showErr('');
      try {
        const provider = new GoogleAuthProvider();
        // Sugerimos el email pero Google decide
        provider.setCustomParameters({ login_hint: inv.email });
        await signInWithPopup(auth, provider);
      } catch (err) {
        showErr('Error: ' + friendlyError(err));
      }
    });

    document.getElementById('btn-invite-email').addEventListener('click', async () => {
      showErr('');
      const p1 = document.getElementById('invite-pass').value;
      const p2 = document.getElementById('invite-pass2').value;
      if (p1.length < 6) return showErr('La contraseña debe tener al menos 6 caracteres');
      if (p1 !== p2) return showErr('Las contraseñas no coinciden');
      try {
        const cred = await createUserWithEmailAndPassword(auth, inv.email, p1);
        await updateProfile(cred.user, { displayName: inv.displayName || inv.email.split('@')[0] });
      } catch (err) {
        showErr(friendlyError(err));
      }
    });

    document.getElementById('btn-cancel-invite').addEventListener('click', () => {
      location.href = location.pathname;  // volver a la URL base
    });

  } catch (err) {
    card.innerHTML = `
      <h1>GastósPro</h1>
      <div class="alert alert-danger" style="margin:16px 0">
        <strong>⚠ Invitación no válida</strong><br>
        ${escapeHtml(err.message)}
      </div>
      <button onclick="location.href=location.pathname" class="btn btn-secondary btn-block">Volver al inicio</button>
    `;
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function friendlyError(err) {
  const code = err.code || '';
  const map = {
    'auth/invalid-credential': 'Credenciales inválidas',
    'auth/user-not-found':     'Usuario no existe',
    'auth/wrong-password':     'Contraseña incorrecta',
    'auth/email-already-in-use': 'Email ya registrado. Inicia sesión en lugar de crear cuenta.',
    'auth/invalid-email':      'Email inválido',
    'auth/weak-password':      'Contraseña muy débil (mín. 6 caracteres)',
    'auth/popup-closed-by-user': 'Cancelado'
  };
  return map[code] || err.message || 'Error desconocido';
}
