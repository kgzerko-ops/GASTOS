// ═══════════════════════════════════════════════════════════════
// CIERRES MENSUALES
// ═══════════════════════════════════════════════════════════════

import { getAllClosures, closeMonth, reopenMonth, subscribeExpenses } from '../db.js';
import { showToast, confirmDialog, escapeHtml } from '../components/modal.js';
import { fmtEur, fmtDateTime, monthKey } from '../utils/format.js';
import { isAdmin } from '../roles.js';

let unsub = null;

export async function renderClosures(container, state) {
  if (!isAdmin(state.user)) {
    container.innerHTML = `<div class="alert alert-danger">Solo el administrador puede gestionar cierres.</div>`;
    return;
  }
  if (unsub) { unsub(); unsub = null; }

  container.innerHTML = `
    <h2 style="margin:0 0 4px">Cierres mensuales</h2>
    <p class="text-muted" style="margin:0 0 16px;font-size:13px">
      Bloquea un mes tras presentar impuestos. Nadie (salvo tú) podrá crear, editar o eliminar gastos de ese período.
    </p>

    <div class="card mb-16">
      <h3>Cerrar un mes</h3>
      <div class="field-row">
        <div class="field">
          <label>Empresa</label>
          <select id="c-empresa" class="select"></select>
        </div>
        <div class="field">
          <label>Mes</label>
          <input id="c-mes" class="input" type="month" value="${monthKey(new Date())}">
        </div>
      </div>
      <div id="c-resumen" class="alert alert-info" style="font-size:13px">Selecciona empresa y mes para ver el resumen.</div>
      <button id="btn-cerrar" class="btn btn-warning btn-block">🔒 Cerrar este mes</button>
    </div>

    <div class="card">
      <h3>Meses cerrados</h3>
      <div id="closures-list">
        <div class="text-muted" style="text-align:center;padding:20px">Cargando…</div>
      </div>
    </div>
  `;

  let allExpenses = [];
  unsub = subscribeExpenses(state.user, (docs) => {
    allExpenses = docs;
    const empresas = [...new Set(docs.map(d => d.empresa).filter(Boolean))].sort();
    const sel = container.querySelector('#c-empresa');
    if (sel.options.length === 0 || empresas.length !== sel.options.length) {
      sel.innerHTML = empresas.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('');
    }
    updateResumen();
  });

  function updateResumen() {
    const empresa = container.querySelector('#c-empresa').value;
    const mes = container.querySelector('#c-mes').value;
    const box = container.querySelector('#c-resumen');
    if (!empresa || !mes) { box.innerHTML = 'Selecciona empresa y mes.'; return; }
    const filt = allExpenses.filter(e => e.empresa === empresa && monthKey(e.fecha) === mes);
    const total = filt.reduce((s, e) => s + Number(e.total || 0), 0);
    const pendientes = filt.filter(e => e.estado === 'pendiente').length;
    box.innerHTML = `
      <strong>${filt.length}</strong> gastos · Total: <strong>${fmtEur(total)}</strong>
      ${pendientes > 0 ? `<br><span class="text-warning">⚠ Quedan ${pendientes} pendientes de aprobar</span>` : ''}
    `;
  }
  container.querySelector('#c-empresa').addEventListener('change', updateResumen);
  container.querySelector('#c-mes').addEventListener('change', updateResumen);

  container.querySelector('#btn-cerrar').addEventListener('click', async () => {
    const empresa = container.querySelector('#c-empresa').value;
    const mes = container.querySelector('#c-mes').value;
    if (!empresa || !mes) return;
    const ok = await confirmDialog(
      `¿Cerrar ${mes} para ${empresa}? Solo tú podrás reabrirlo o modificar gastos.`,
      { confirmText: 'Cerrar mes', danger: true }
    );
    if (!ok) return;
    try {
      await closeMonth(empresa, mes, state.user.uid, state.user.email);
      showToast(`Mes ${mes} cerrado`, 'success');
      await loadClosures();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  });

  async function loadClosures() {
    const listEl = container.querySelector('#closures-list');
    try {
      const closures = await getAllClosures();
      if (closures.length === 0) {
        listEl.innerHTML = `<div class="text-muted" style="text-align:center;padding:20px;font-size:13px">Sin meses cerrados</div>`;
        return;
      }
      closures.sort((a, b) => (b.yyyymm || '').localeCompare(a.yyyymm || ''));
      listEl.innerHTML = closures.map(c => `
        <div class="user-row" data-id="${c.id}">
          <div>
            <div class="user-name">🔒 ${escapeHtml(c.empresa)} — ${c.yyyymm}</div>
            <div class="user-meta">Cerrado por ${escapeHtml(c.closedBy || '—')} · ${fmtDateTime(c.closedAt)}</div>
          </div>
          <button class="btn btn-secondary btn-sm" data-act="reopen">Reabrir</button>
        </div>
      `).join('');
      listEl.querySelectorAll('[data-act="reopen"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const row = btn.closest('[data-id]');
          const cl = closures.find(x => x.id === row.dataset.id);
          const ok = await confirmDialog(
            `¿Reabrir ${cl.yyyymm} de ${cl.empresa}?`,
            { confirmText: 'Reabrir' }
          );
          if (!ok) return;
          try {
            await reopenMonth(cl.empresa, cl.yyyymm);
            showToast('Mes reabierto', 'success');
            await loadClosures();
          } catch (err) { showToast('Error: ' + err.message, 'error'); }
        });
      });
    } catch (err) {
      listEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  }

  await loadClosures();
}
