// ═══════════════════════════════════════════════════════════════
// APP BOOTSTRAP + ROUTER (v2)
// ═══════════════════════════════════════════════════════════════

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { initAuth, onAuthReady, signOut } from './auth.js';
import { initDb, subscribeExpenses, materializeRecurring } from './db.js';
import { firebaseConfig } from './firebase-config.js';
import { showToast, openModal } from './components/modal.js';
import { canCreate, isAdmin } from './roles.js';

import { renderPanel } from './views/dashboard.js';
import { renderExpenses, openExpenseForm } from './views/expenses.js';
import { renderUsers } from './views/users.js';
import { renderReports } from './views/reports.js';
import { renderBudgets } from './views/budgets.js';
import { renderSettings } from './views/settings.js';
import { renderClosures } from './views/closures.js';
import { renderIvaBook } from './views/iva.js';
import { renderRecurring } from './views/recurring.js';
import { openMileageDialog } from './views/mileage.js';

const state = {
  user: null,
  activeTab: 'panel',
  isAdmin: false,
  pendingCount: 0
};

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

let pendingUnsub = null;
function startPendingWatcher() {
  if (pendingUnsub) { pendingUnsub(); pendingUnsub = null; }
  if (!isAdmin(state.user)) return;
  pendingUnsub = subscribeExpenses(state.user, (docs) => {
    state.pendingCount = docs.filter(e => e.estado === 'pendiente').length;
    updatePendingBadge();
  });
}

function updatePendingBadge() {
  const tab = document.querySelector('.tab[data-tab="expenses"]');
  if (!tab) return;
  const existing = tab.querySelector('.tab-badge');
  if (state.pendingCount > 0) {
    const text = state.pendingCount > 99 ? '99+' : String(state.pendingCount);
    if (existing) existing.textContent = text;
    else {
      const b = document.createElement('span');
      b.className = 'tab-badge';
      b.textContent = text;
      tab.appendChild(b);
    }
  } else if (existing) {
    existing.remove();
  }
}

onAuthReady(async (user) => {
  document.getElementById('app-loading').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  if (!user) { showView('login'); return; }
  if (user.active === false) { showView('denied'); return; }

  state.user = user;
  state.isAdmin = isAdmin(user);

  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', !state.isAdmin);
  });

  const fab = document.getElementById('fab-new-expense');
  if (fab) fab.style.display = canCreate(user) ? '' : 'none';

  const empresa = user.empresa || '';
  const roleLabels = { admin: 'Admin', colaborador: 'Colaborador', visor: 'Visor', user: '' };
  const roleBadge = roleLabels[user.role] ? ` [${roleLabels[user.role]}]` : '';
  document.getElementById('user-info').textContent =
    `${user.displayName || user.email.split('@')[0]}${roleBadge}${empresa ? ' · ' + empresa : ''}`;

  showView('main');

  // Recurrentes: materializar 1x al día (solo admin)
  if (state.isAdmin) {
    const lastRun = localStorage.getItem('gastospro-recurring-lastrun');
    const today = new Date().toISOString().slice(0, 10);
    if (lastRun !== today) {
      try {
        const created = await materializeRecurring(user);
        if (created > 0) showToast(`${created} gastos recurrentes creados automáticamente`, 'info', 4000);
        localStorage.setItem('gastospro-recurring-lastrun', today);
      } catch (err) {
        console.warn('Recurrentes no procesadas:', err);
      }
    }
  }

  startPendingWatcher();
  await renderActiveTab();
});

function showView(name) {
  ['login', 'denied', 'main'].forEach(v => {
    document.getElementById('view-' + v).classList.toggle('hidden', v !== name);
  });
}

async function renderActiveTab() {
  const content = document.getElementById('app-content');
  content.innerHTML = '<div style="padding:40px;text-align:center"><div class="spinner"></div></div>';

  try {
    switch (state.activeTab) {
      case 'panel':      await renderPanel(content, state); break;
      case 'expenses':   await renderExpenses(content, state); break;
      case 'users':      await renderUsers(content, state); break;
      case 'reports':    await renderReports(content, state); break;
      case 'budgets':    await renderBudgets(content, state); break;
      case 'closures':   await renderClosures(content, state); break;
      case 'iva':        await renderIvaBook(content, state); break;
      case 'recurring':  await renderRecurring(content, state); break;
      case 'settings':   await renderSettings(content, state); break;
      default:           await renderPanel(content, state);
    }
  } catch (err) {
    console.error('Error render tab:', err);
    content.innerHTML = `<div class="alert alert-danger">Error al cargar: ${err.message}</div>`;
  }
}

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
  if (pendingUnsub) pendingUnsub();
  await signOut();
  location.reload();
});
document.getElementById('btn-logout-denied').addEventListener('click', async () => {
  await signOut();
  location.reload();
});

document.getElementById('fab-new-expense').addEventListener('click', () => {
  const { close, content } = openModal('¿Qué quieres añadir?');
  content.innerHTML = `
    <div style="display:grid;gap:8px">
      <button class="btn btn-primary btn-block" data-opt="expense" style="padding:16px;text-align:left">
        <div style="font-size:16px;font-weight:600">🧾 Ticket / Factura</div>
        <div style="font-size:13px;opacity:.9;margin-top:2px">Gasto normal con escaneo, imagen y datos fiscales</div>
      </button>
      <button class="btn btn-secondary btn-block" data-opt="mileage" style="padding:16px;text-align:left">
        <div style="font-size:16px;font-weight:600">🚗 Kilometraje</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:2px">Desplazamiento en vehículo propio (€/km)</div>
      </button>
    </div>
  `;
  content.querySelector('[data-opt="expense"]').addEventListener('click', () => {
    close();
    openExpenseForm(null, state, async () => {
      if (['panel', 'expenses', 'reports'].includes(state.activeTab)) await renderActiveTab();
      showToast('Gasto guardado', 'success');
    });
  });
  content.querySelector('[data-opt="mileage"]').addEventListener('click', () => {
    close();
    openMileageDialog(state, async () => {
      if (['panel', 'expenses', 'reports'].includes(state.activeTab)) await renderActiveTab();
    });
  });
});

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
