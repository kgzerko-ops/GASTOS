// ═══════════════════════════════════════════════════════════════
// REPORTES (admin) — pies por empresa/categoría + comparativa mes actual vs anterior
// ═══════════════════════════════════════════════════════════════

import { subscribeExpenses } from '../db.js';
import { renderPieChart, renderBarChart } from '../components/charts.js';
import { fmtEur, monthKey } from '../utils/format.js';

let unsubscribe = null;

export async function renderReports(container, state) {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (state.user.role !== 'admin') {
    container.innerHTML = `<div class="alert alert-danger">Acceso denegado. Solo administradores.</div>`;
    return;
  }

  container.innerHTML = `
    <h2 style="margin:0 0 16px">Reportes</h2>

    <div class="card mb-16">
      <h3>Gastos por mes (aprobados vs pendientes)</h3>
      <div class="chart-container"><canvas id="rep-bar"></canvas></div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:16px">
      <div class="card">
        <h3>Por empresa</h3>
        <div class="chart-container"><canvas id="rep-empresa"></canvas></div>
      </div>
      <div class="card">
        <h3>Por categoría</h3>
        <div class="chart-container"><canvas id="rep-categoria"></canvas></div>
      </div>
    </div>

    <div class="card mb-16">
      <h3>Comparativa por categoría: este mes vs anterior</h3>
      <div id="rep-compare" style="margin-top:8px"></div>
    </div>

    <div class="card">
      <h3>Ranking por colaborador (este mes)</h3>
      <div id="rep-ranking" style="margin-top:8px"></div>
    </div>
  `;

  unsubscribe = subscribeExpenses(state.user, async (docs) => {
    await updateBar(container, docs);
    await updatePies(container, docs);
    updateComparison(container, docs);
    updateRanking(container, docs);
  });
}

async function updateBar(container, expenses) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(d), label: d.toLocaleDateString('es-ES', { month: 'short' }) });
  }
  const aprob = Object.fromEntries(months.map(m => [m.key, 0]));
  const pend  = Object.fromEntries(months.map(m => [m.key, 0]));
  const rej   = Object.fromEntries(months.map(m => [m.key, 0]));

  for (const e of expenses) {
    const mk = monthKey(e.fecha);
    if (!(mk in aprob)) continue;
    const t = Number(e.total || 0);
    if (e.estado === 'aprobado') aprob[mk] += t;
    else if (e.estado === 'rechazado') rej[mk] += t;
    else pend[mk] += t;
  }

  await renderBarChart(container.querySelector('#rep-bar'), {
    stacked: true,
    labels: months.map(m => m.label),
    datasets: [
      { label: 'Aprobados',  data: months.map(m => aprob[m.key]), backgroundColor: '#059669' },
      { label: 'Pendientes', data: months.map(m => pend[m.key]),  backgroundColor: '#d97706' },
      { label: 'Rechazados', data: months.map(m => rej[m.key]),   backgroundColor: '#dc2626' }
    ]
  });
}

async function updatePies(container, expenses) {
  const byEmp = {}, byCat = {};
  for (const e of expenses) {
    const t = Number(e.total || 0);
    if (e.empresa)   byEmp[e.empresa]   = (byEmp[e.empresa]   || 0) + t;
    if (e.categoria) byCat[e.categoria] = (byCat[e.categoria] || 0) + t;
  }
  const empEntries = Object.entries(byEmp).sort((a,b) => b[1]-a[1]);
  const catEntries = Object.entries(byCat).sort((a,b) => b[1]-a[1]);

  await renderPieChart(container.querySelector('#rep-empresa'), {
    labels: empEntries.map(e => e[0]),
    values: empEntries.map(e => e[1])
  });
  await renderPieChart(container.querySelector('#rep-categoria'), {
    labels: catEntries.map(e => e[0]),
    values: catEntries.map(e => e[1])
  });
}

function updateComparison(container, expenses) {
  const now = new Date();
  const thisMk = monthKey(now);
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMk = monthKey(prev);

  const byCatThis = {}, byCatPrev = {};
  for (const e of expenses) {
    const mk = monthKey(e.fecha);
    const cat = e.categoria || 'Otros';
    const t = Number(e.total || 0);
    if (mk === thisMk) byCatThis[cat] = (byCatThis[cat] || 0) + t;
    else if (mk === prevMk) byCatPrev[cat] = (byCatPrev[cat] || 0) + t;
  }

  const cats = [...new Set([...Object.keys(byCatThis), ...Object.keys(byCatPrev)])];
  cats.sort((a, b) => (byCatThis[b] || 0) - (byCatThis[a] || 0));

  const wrap = container.querySelector('#rep-compare');
  if (cats.length === 0) {
    wrap.innerHTML = '<p class="text-muted">Sin datos para comparar.</p>';
    return;
  }

  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:8px;font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:600;padding:8px 0;border-bottom:1px solid var(--border)">
      <div>Categoría</div><div class="text-right">Mes anterior</div><div class="text-right">Este mes</div><div class="text-right">Variación</div>
    </div>
    ${cats.map(cat => {
      const a = byCatThis[cat] || 0;
      const b = byCatPrev[cat] || 0;
      const diff = a - b;
      const pct = b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100;
      const color = pct > 30 ? 'var(--danger)' : pct > 0 ? 'var(--warning)' : pct < 0 ? 'var(--success)' : 'var(--text-muted)';
      const sign = pct > 0 ? '+' : '';
      return `
        <div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:8px;font-size:13px;padding:10px 0;border-bottom:1px solid var(--border);align-items:center">
          <div style="font-weight:600">${escape(cat)}</div>
          <div class="text-right">${fmtEur(b)}</div>
          <div class="text-right" style="font-weight:600">${fmtEur(a)}</div>
          <div class="text-right" style="color:${color};font-weight:600">${b === 0 ? '—' : sign + pct.toFixed(0) + '%'}</div>
        </div>
      `;
    }).join('')}
  `;
}

function updateRanking(container, expenses) {
  const wrap = container.querySelector('#rep-ranking');
  const now = new Date();
  const mk = monthKey(now);
  const thisMonth = expenses.filter(e => monthKey(e.fecha) === mk);

  const byUser = {};
  for (const e of thisMonth) {
    const key = e.createdByEmail || e.createdByUid || 'desconocido';
    if (!byUser[key]) {
      byUser[key] = {
        name: e.createdByName || (e.createdByEmail || '—').split('@')[0],
        total: 0, count: 0, pendientes: 0
      };
    }
    byUser[key].total += Number(e.total || 0);
    byUser[key].count++;
    if (e.estado === 'pendiente') byUser[key].pendientes++;
  }

  const rows = Object.values(byUser).sort((a, b) => b.total - a.total);
  if (rows.length === 0) {
    wrap.innerHTML = `<p class="text-muted" style="text-align:center;padding:20px;font-size:13px">Sin gastos este mes</p>`;
    return;
  }

  const maxTotal = rows[0].total || 1;

  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 60px 60px;gap:8px;font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:600;padding:8px 0;border-bottom:1px solid var(--border)">
      <div>Colaborador</div>
      <div class="text-right">Total</div>
      <div class="text-right">Nº</div>
      <div class="text-right">Pend.</div>
    </div>
    ${rows.map((r, idx) => {
      const pct = (r.total / maxTotal) * 100;
      const medal = idx === 0 ? '🥇 ' : idx === 1 ? '🥈 ' : idx === 2 ? '🥉 ' : '';
      return `
        <div style="padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="display:grid;grid-template-columns:1fr 1fr 60px 60px;gap:8px;font-size:13px;align-items:center">
            <div style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><strong>${medal}${escape(r.name)}</strong></div>
            <div class="text-right" style="font-weight:700">${fmtEur(r.total)}</div>
            <div class="text-right">${r.count}</div>
            <div class="text-right">${r.pendientes > 0 ? '<span class="text-warning">' + r.pendientes + '</span>' : '0'}</div>
          </div>
          <div style="height:4px;background:var(--surface-2);border-radius:2px;overflow:hidden;margin-top:6px">
            <div style="height:100%;width:${pct}%;background:var(--primary)"></div>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function escape(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
