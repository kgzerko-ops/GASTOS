// ═══════════════════════════════════════════════════════════════
// PANEL — resumen KPIs + gráficos
// ═══════════════════════════════════════════════════════════════

import { subscribeExpenses } from '../db.js';
import { fmtEur, monthKey } from '../utils/format.js';
import { renderBarChart } from '../components/charts.js';

let unsubscribe = null;

export async function renderPanel(container, state) {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }

  container.innerHTML = `
    <h2 style="margin:0 0 4px">Panel de control</h2>
    <p class="text-muted mb-16" style="margin-top:0;font-size:13px">Resumen de gastos</p>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon accent">€</div>
        <div class="stat-label">Total acumulado</div>
        <div class="stat-value" id="kpi-total">—</div>
        <div class="stat-sub" id="kpi-total-sub">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon success">📈</div>
        <div class="stat-label">Este mes</div>
        <div class="stat-value" id="kpi-mes">—</div>
        <div class="stat-sub" id="kpi-mes-sub">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon warning">⏳</div>
        <div class="stat-label">Pendientes</div>
        <div class="stat-value" id="kpi-pend">—</div>
        <div class="stat-sub" id="kpi-pend-sub">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon success">✓</div>
        <div class="stat-label">Aprobados</div>
        <div class="stat-value" id="kpi-apro">—</div>
        <div class="stat-sub">este mes</div>
      </div>
    </div>

    <div class="card mb-16">
      <h3>Gastos por mes (últimos 6 meses)</h3>
      <div class="chart-container"><canvas id="chart-mensual"></canvas></div>
    </div>

    <div class="card">
      <h3>Últimos gastos</h3>
      <div id="recent-list"></div>
    </div>
  `;

  unsubscribe = subscribeExpenses(state.user, (docs) => {
    window.__lastExpenses = docs;
    updateKpis(container, docs);
    updateChart(container, docs);
    updateRecent(container, docs);
  });
}

function updateKpis(container, expenses) {
  const now = new Date();
  const thisMk = monthKey(now);

  let totalAll = 0, totalMes = 0, pend = 0, aproMes = 0, countMes = 0;
  for (const e of expenses) {
    totalAll += Number(e.total || 0);
    if (monthKey(e.fecha) === thisMk) {
      totalMes += Number(e.total || 0);
      countMes++;
      if (e.estado === 'aprobado') aproMes += Number(e.total || 0);
    }
    if (e.estado === 'pendiente') pend += Number(e.total || 0);
  }

  container.querySelector('#kpi-total').textContent = fmtEur(totalAll);
  container.querySelector('#kpi-total-sub').textContent = `${expenses.length} tickets`;
  container.querySelector('#kpi-mes').textContent = fmtEur(totalMes);
  container.querySelector('#kpi-mes-sub').textContent = `${countMes} tickets este mes`;
  container.querySelector('#kpi-pend').textContent = fmtEur(pend);
  container.querySelector('#kpi-pend-sub').textContent = `${expenses.filter(e => e.estado === 'pendiente').length} por aprobar`;
  container.querySelector('#kpi-apro').textContent = fmtEur(aproMes);
}

async function updateChart(container, expenses) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: monthKey(d),
      label: d.toLocaleDateString('es-ES', { month: 'short' })
    });
  }

  const byMonth = Object.fromEntries(months.map(m => [m.key, 0]));
  for (const e of expenses) {
    const mk = monthKey(e.fecha);
    if (mk in byMonth) byMonth[mk] += Number(e.total || 0);
  }

  const canvas = container.querySelector('#chart-mensual');
  await renderBarChart(canvas, {
    labels: months.map(m => m.label),
    datasets: [{
      label: 'Gasto mensual (€)',
      data: months.map(m => byMonth[m.key]),
      backgroundColor: '#1e40af',
      borderRadius: 6
    }]
  });
}

function updateRecent(container, expenses) {
  const recent = [...expenses].slice(0, 5);
  const listEl = container.querySelector('#recent-list');
  if (recent.length === 0) {
    listEl.innerHTML = '<p class="text-muted" style="padding:16px 0">Sin gastos registrados</p>';
    return;
  }
  listEl.innerHTML = recent.map(e => `
    <div style="padding:10px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:12px">
      <div style="min-width:0;flex:1">
        <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escape(e.proveedor || '—')}</div>
        <div style="font-size:12px;color:var(--text-muted)">${e.fecha} · <span class="badge badge-${e.estado}">${e.estado}</span></div>
      </div>
      <div style="font-weight:700;color:var(--primary)">${fmtEur(e.total)}</div>
    </div>
  `).join('');
}

function escape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
