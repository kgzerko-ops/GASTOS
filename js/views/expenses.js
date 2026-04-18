// ═══════════════════════════════════════════════════════════════
// VISTA DE GASTOS — lista, filtros, export, edit/delete/aprobación
// ═══════════════════════════════════════════════════════════════

import { subscribeExpenses, deleteExpense, updateExpense, getAllEvents } from '../db.js';
import { applyFilters, computeTotals, CATEGORIAS, ESTADOS } from '../utils/filters.js';
import { fmtEur, fmtDate } from '../utils/format.js';
import { openExpenseForm } from './expense-form.js';
import { exportExpensesToXlsx } from '../utils/export-xlsx.js';
import { showToast, confirmDialog, openModal, escapeHtml } from '../components/modal.js';

let unsubscribe = null;

export async function renderExpenses(container, state) {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }

  container.innerHTML = `
    <div class="filters">
      <div class="filter-row mb-8">
        <div class="period-tabs" id="period-tabs">
          <button class="period-tab" data-p="hoy">Hoy</button>
          <button class="period-tab" data-p="semana">Semana</button>
          <button class="period-tab active" data-p="mes">Mes</button>
          <button class="period-tab" data-p="custom">Personalizado</button>
          <button class="period-tab" data-p="todos">Todos</button>
        </div>
      </div>
      <div class="filter-row mb-8" id="custom-range" style="display:none">
        <input type="date" id="f-from" class="input" style="margin:0;flex:1;min-width:140px">
        <span>→</span>
        <input type="date" id="f-to" class="input" style="margin:0;flex:1;min-width:140px">
      </div>
      <div class="filter-row">
        <div class="search-box">
          <input type="text" id="f-search" class="input" placeholder="Buscar proveedor, concepto, NIF…">
        </div>
        <select id="f-estado" class="select" style="width:auto;margin:0">
          <option value="todos">Todos los estados</option>
          ${ESTADOS.map(e => `<option value="${e.value}">${e.label}</option>`).join('')}
        </select>
        <select id="f-categoria" class="select" style="width:auto;margin:0">
          <option value="todas">Todas las categorías</option>
          ${CATEGORIAS.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <select id="f-empresa" class="select" style="width:auto;margin:0">
          <option value="todas">Todas las empresas</option>
        </select>
        <select id="f-evento" class="select" style="width:auto;margin:0">
          <option value="todos">Todos los eventos</option>
        </select>
        <button id="btn-export" class="btn btn-secondary btn-sm">⬇ Excel</button>
      </div>
    </div>

    <div class="totals-bar">
      <div class="total-chip"><div class="label">Base imponible</div><div class="value" id="t-base">0,00 €</div></div>
      <div class="total-chip"><div class="label">IVA total</div><div class="value" id="t-iva">0,00 €</div></div>
      <div class="total-chip"><div class="label">Total con IVA</div><div class="value" id="t-total" style="color:var(--primary)">0,00 €</div></div>
    </div>

    <div id="expenses-list" class="expense-list"></div>
  `;

  const filters = {
    period: 'mes',
    customFrom: null,
    customTo: null,
    search: '',
    estado: 'todos',
    categoria: 'todas',
    empresa: 'todas',
    eventoId: 'todos'
  };

  let allExpenses = [];
  let events = [];

  try { events = await getAllEvents(); } catch {}

  // Llenar select de eventos
  const evSel = container.querySelector('#f-evento');
  events.forEach(ev => {
    const opt = document.createElement('option');
    opt.value = ev.id;
    opt.textContent = ev.nombre;
    evSel.appendChild(opt);
  });

  // Suscripción en tiempo real
  unsubscribe = subscribeExpenses(state.user, (docs) => {
    allExpenses = docs;
    window.__lastExpenses = docs; // para el budget check del formulario
    // Rellenar empresas únicas
    const empresas = [...new Set(docs.map(d => d.empresa).filter(Boolean))];
    const empSel = container.querySelector('#f-empresa');
    const currentVal = empSel.value;
    empSel.innerHTML = `<option value="todas">Todas las empresas</option>` +
      empresas.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('');
    empSel.value = currentVal || 'todas';
    render();
  });

  // Eventos de filtros
  container.querySelector('#period-tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.period-tab');
    if (!t) return;
    container.querySelectorAll('.period-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    filters.period = t.dataset.p;
    container.querySelector('#custom-range').style.display = filters.period === 'custom' ? 'flex' : 'none';
    render();
  });

  ['f-from','f-to'].forEach(id => {
    container.querySelector('#' + id).addEventListener('change', () => {
      filters.customFrom = container.querySelector('#f-from').value;
      filters.customTo = container.querySelector('#f-to').value;
      render();
    });
  });

  container.querySelector('#f-search').addEventListener('input', (e) => {
    filters.search = e.target.value;
    render();
  });
  ['estado','categoria','empresa','evento'].forEach(key => {
    const sel = container.querySelector('#f-' + key);
    sel.addEventListener('change', () => {
      filters[key === 'evento' ? 'eventoId' : key] = sel.value;
      render();
    });
  });

  container.querySelector('#btn-export').addEventListener('click', async () => {
    const filtered = applyFilters(allExpenses, filters);
    if (filtered.length === 0) return showToast('No hay gastos para exportar', 'warning');
    try {
      await exportExpensesToXlsx(filtered, `gastos-${new Date().toISOString().slice(0,10)}.xlsx`);
      showToast('Archivo Excel descargado', 'success');
    } catch (err) {
      showToast('Error al exportar: ' + err.message, 'error');
    }
  });

  function render() {
    const filtered = applyFilters(allExpenses, filters);
    const totals = computeTotals(filtered);

    container.querySelector('#t-base').textContent = fmtEur(totals.baseImponible);
    container.querySelector('#t-iva').textContent = fmtEur(totals.iva);
    container.querySelector('#t-total').textContent = fmtEur(totals.total);

    const listEl = container.querySelector('#expenses-list');
    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="icon">📭</div>
          <p><strong>No hay gastos</strong></p>
          <p>No hay registros con los filtros aplicados.</p>
        </div>`;
      return;
    }

    listEl.innerHTML = filtered.map(e => renderRow(e, state)).join('');
    bindRowActions(listEl, filtered, state);
  }
}

function renderRow(e, state) {
  const isAdmin = state.user.role === 'admin';
  const isMine = e.createdByUid === state.user.uid;
  const canEdit = isMine || isAdmin;
  const canApprove = isAdmin && e.estado === 'pendiente';
  const userShort = (e.createdByEmail || '').split('@')[0] || '—';

  return `
    <div class="expense-item" data-id="${e.id}">
      <div class="title-line">
        <span class="proveedor">${escapeHtml(e.proveedor || '(Sin proveedor)')}</span>
        <span class="total">${fmtEur(e.total)}</span>
      </div>
      <div class="meta">
        <span>📅 ${fmtDate(e.fecha)}</span>
        ${e.categoria ? `<span>🏷 ${escapeHtml(e.categoria)}</span>` : ''}
        ${e.empresa ? `<span>🏢 ${escapeHtml(e.empresa)}</span>` : ''}
        ${e.eventoNombre ? `<span>📌 ${escapeHtml(e.eventoNombre)}</span>` : ''}
        <span class="badge badge-${e.estado}">${e.estado}</span>
        ${isAdmin ? `<span style="color:var(--text-muted)">👤 ${escapeHtml(userShort)}</span>` : ''}
        ${e.superaPresupuesto ? '<span class="badge badge-rejected" title="Supera presupuesto">⚠ PPT</span>' : ''}
      </div>
      ${e.concepto ? `<div style="font-size:13px;color:var(--text-muted);grid-column:1/-1">${escapeHtml(e.concepto)}</div>` : ''}
      ${e.notaAdmin ? `<div style="font-size:12px;color:var(--warning);grid-column:1/-1">📝 <em>${escapeHtml(e.notaAdmin)}</em></div>` : ''}
      <div class="actions">
        ${e.ticketUrl ? `<button class="btn btn-secondary btn-sm" data-act="view-ticket">🖼 Ver</button>` : ''}
        ${canApprove ? `<button class="btn btn-success btn-sm" data-act="approve">✓</button>
                       <button class="btn btn-danger btn-sm" data-act="reject">✗</button>` : ''}
        ${canEdit ? `<button class="btn btn-secondary btn-sm" data-act="edit">✎</button>
                    <button class="btn btn-secondary btn-sm" data-act="delete" style="color:var(--danger)">🗑</button>` : ''}
      </div>
    </div>
  `;
}

function bindRowActions(listEl, expenses, state) {
  listEl.querySelectorAll('.expense-item').forEach(item => {
    const id = item.dataset.id;
    const expense = expenses.find(x => x.id === id);
    if (!expense) return;

    item.querySelector('[data-act="edit"]')?.addEventListener('click', () => {
      openExpenseForm(expense, state, () => showToast('Gasto actualizado', 'success'));
    });

    item.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
      const ok = await confirmDialog(`¿Eliminar el gasto de ${expense.proveedor}?`, {
        confirmText: 'Eliminar', danger: true
      });
      if (!ok) return;
      try {
        await deleteExpense(id);
        showToast('Gasto eliminado', 'success');
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });

    item.querySelector('[data-act="view-ticket"]')?.addEventListener('click', () => {
      const { content } = openModal('Ticket');
      content.innerHTML = `<img src="${escapeHtml(expense.ticketUrl)}" style="width:100%;border-radius:8px">`;
    });

    item.querySelector('[data-act="approve"]')?.addEventListener('click', async () => {
      try {
        await updateExpense(id, { estado: 'aprobado', notaAdmin: expense.notaAdmin || '' });
        showToast('Gasto aprobado', 'success');
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    });

    item.querySelector('[data-act="reject"]')?.addEventListener('click', async () => {
      openApprovalDialog(expense, 'rechazar', async (nota) => {
        try {
          await updateExpense(id, { estado: 'rechazado', notaAdmin: nota });
          showToast('Gasto rechazado', 'success');
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
      });
    });
  });
}

function openApprovalDialog(expense, accion, onConfirm) {
  const { close, content, footer } = openModal(
    accion === 'rechazar' ? 'Rechazar gasto' : 'Aprobar gasto',
    {
      footer: `
        <button class="btn btn-secondary" data-act="cancel">Cancelar</button>
        <button class="btn ${accion === 'rechazar' ? 'btn-danger' : 'btn-success'}" data-act="ok">Confirmar</button>
      `
    }
  );
  content.innerHTML = `
    <p><strong>${escapeHtml(expense.proveedor)}</strong> — ${fmtEur(expense.total)}</p>
    <div class="field">
      <label>Nota de observación ${accion === 'rechazar' ? '(obligatoria)' : '(opcional)'}</label>
      <textarea id="nota" rows="3" placeholder="Motivo…"></textarea>
    </div>
  `;
  footer.querySelector('[data-act="cancel"]').addEventListener('click', close);
  footer.querySelector('[data-act="ok"]').addEventListener('click', () => {
    const nota = content.querySelector('#nota').value.trim();
    if (accion === 'rechazar' && !nota) {
      showToast('Debes indicar el motivo del rechazo', 'error');
      return;
    }
    close();
    onConfirm(nota);
  });
}

export { openExpenseForm };
