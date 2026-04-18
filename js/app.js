// ═══════════════════════════════════════════════════════════════
// APP BOOTSTRAP + ROUTER
// ═══════════════════════════════════════════════════════════════

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { initAuth, onAuthReady, signOut, getCurrentUser } from './auth.js';
import { initDb } from './db.js';
import { firebaseConfig } from './firebase-config.js';
import { showToast } from './components/modal.js';

// Vistas
import { renderPanel } from './views/dashboard.js';
import { renderExpenses, openExpenseForm } from './views/expenses.js';
import { renderUsers } from './views/users.js';
import { renderReports } from './views/reports.js';
import { renderBudgets } from './views/budgets.js';
import { renderSettings } from './views/settings.js';

// ── Estado global de la UI ──────────────────────
const state = {
  user: null,          // { uid, email, displayName, role, empresa, ... }
  activeTab: 'panel',
  isAdmin: false
};

// ── Inicialización Firebase ─────────────────────
if (firebaseConfig.apiKey === 'TU_API_KEY') {
  document.getElementById('app-loading').innerHTML = `
    <div style="max-width:440px;padding:24px;text-align:center">
      <h2>⚙️ Configuración pendiente</h2>
      <p style="color:#64748b;font-size:14px;line-height:1.6">
        Abre <code>js/firebase-config.js</code> y rellena las credenciales de Firebase
        y Cloudinary antes de usar la app.<br><br>
        Consulta el archivo <code>README.md</code> para las instrucciones paso a paso.
      </p>
    </div>`;
  throw new Error('Config pendiente');
}

const fbApp = initializeApp(firebaseConfig);
initAuth(fbApp);
initDb(fbApp);

// ── Listener de autenticación ───────────────────
onAuthReady(async (user) => {
  document.getElementById('app-loading').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  if (!user) {
    showView('login');
    return;
  }

  // user.active=false → acceso denegado
  if (user.active === false) {
    showView('denied');
    return;
  }

  state.user = user;
  state.isAdmin = user.role === 'admin';

  // Mostrar elementos admin-only
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', !state.isAdmin);
  });

  // Info usuario en header
  const empresa = user.empresa || '';
  document.getElementById('user-info').textContent =
    `${user.displayName || user.email.split('@')[0]}${empresa ? ' · ' + empresa : ''}`;

  showView('main');
  await renderActiveTab();
});

// ── Router de vistas principales ────────────────
function showView(name) {
  ['login', 'denied', 'main'].forEach(v => {
    document.getElementById('view-' + v).classList.toggle('hidden', v !== name);
  });
}

// ── Renderizar tab activa ───────────────────────
async function renderActiveTab() {
  const content = document.getElementById('app-content');
  content.innerHTML = '<div style="padding:40px;text-align:center"><div class="spinner"></div></div>';

  try {
    switch (state.activeTab) {
      case 'panel':    await renderPanel(content, state); break;
      case 'expenses': await renderExpenses(content, state); break;
      case 'users':    await renderUsers(content, state); break;
      case 'reports':  await renderReports(content, state); break;
      case 'budgets':  await renderBudgets(content, state); break;
      case 'settings': await renderSettings(content, state); break;
    }
  } catch (err) {
    console.error('Error render tab:', err);
    content.innerHTML = `<div class="alert alert-danger">Error al cargar: ${err.message}</div>`;
  }
}

// ── Eventos UI ──────────────────────────────────
document.getElementById('app-tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  const tabName = tab.dataset.tab;
  if (tabName === state.activeTab) return;

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  state.activeTab = tabName;
  renderActiveTab();
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await signOut();
  location.reload();
});
document.getElementById('btn-logout-denied').addEventListener('click', async () => {
  await signOut();
  location.reload();
});

document.getElementById('fab-new-expense').addEventListener('click', () => {
  openExpenseForm(null, state, async () => {
    // Tras guardar, refrescar la tab activa si procede
    if (['panel', 'expenses', 'reports'].includes(state.activeTab)) {
      await renderActiveTab();
    }
    showToast('Gasto guardado correctamente', 'success');
  });
});

// Exponer navegación a otras vistas
window.GastosPro = {
  navigateTo: (tab) => {
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    state.activeTab = tab;
    renderActiveTab();
  },
  refresh: renderActiveTab,
  getState: () => state
};
