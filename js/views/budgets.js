// ═══════════════════════════════════════════════════════════════
// PRESUPUESTOS POR EMPRESA + EVENTOS/PROYECTOS (admin)
// ═══════════════════════════════════════════════════════════════

import { getAllBudgets, saveBudget, deleteBudget, getAllEvents, saveEvent, deleteEvent, subscribeExpenses } from '../db.js';
import { openModal, showToast, confirmDialog, escapeHtml } from '../components/modal.js';
import { fmtEur, monthKey, todayIso } from '../utils/format.js';

let unsubscribe = null;
let currentExpenses = [];

export async function renderBudgets(container, state) {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (state.user.role !== 'admin') {
    container.innerHTML = `<div class="alert alert-danger">Acceso denegado.</div>`;
    return;
  }

  container.innerHTML = `
    <h2 style="margin:0 0 16px">Presupuestos y proyectos</h2>

    <div class="card mb-16">
      <div class="flex-between mb-8">
        <h3 style="margin:0">Presupuesto mensual por empresa</h3>
        <button id="btn-new-budget" class="btn btn-primary btn-sm">+ Nuevo</button>
      </div>
      <div id="budgets-list"></div>
    </div>

    <div class="card">
      <div class="flex-between mb-8">
        <h3 style="margin:0">Eventos / proyectos</h3>
        <button id="btn-new-event" class="btn btn-primary btn-sm">+ Nuevo evento</button>
      </div>
      <div id="events-list"></div>
    </div>
  `;

  unsubscribe = subscribeExpenses(state.user, (docs) => {
    currentExpenses = docs;
    loadBudgets(container);
    loadEvents(container);
  });

  container.querySelector('#btn-new-budget').addEventListener('click', () => {
    openBudgetDialog(null, () => loadBudgets(container));
  });
  container.querySelector('#btn-new-event').addEventListener('click', () => {
    openEventDialog(null, () => loadEvents(container));
  });
}

async function loadBudgets(container) {
  try {
    const budgets = await getAllBudgets();
    const list = container.querySelector('#budgets-list');
    if (budgets.length === 0) {
      list.innerHTML = '<p class="text-muted" style="padding:12px 0">No hay presupuestos configurados.</p>';
      return;
    }

    const thisMk = monthKey(new Date());

    list.innerHTML = budgets.map(b => {
      const gastado = currentExpenses
        .filter(e => e.empresa === b.empresa && monthKey(e.fecha) === thisMk)
        .reduce((s, e) => s + Number(e.total || 0), 0);
      const pct = b.monto > 0 ? (gastado / b.monto) * 100 : 0;
      const color = pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--success)';

      return `
        <div class="user-row" data-id="${b.id}" data-empresa="${escapeHtml(b.empresa)}">
          <div style="min-width:0">
            <div class="user-name">${escapeHtml(b.empresa)}</div>
            <div class="user-meta">Límite: ${fmtEur(b.monto)} · Gastado este mes: <strong style="color:${color}">${fmtEur(gastado)} (${pct.toFixed(0)}%)</strong></div>
            <div style="height:4px;background:var(--surface-2);border-radius:100px;margin-top:6px;overflow:hidden">
              <div style="height:100%;width:${Math.min(pct,100)}%;background:${color};transition:width .3s"></div>
            </div>
          </div>
          <div class="flex gap-8">
            <button class="btn btn-secondary btn-sm" data-act="edit">✎</button>
            <button class="btn btn-secondary btn-sm" data-act="delete" style="color:var(--danger)">🗑</button>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-act="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('[data-id]');
        const id = row.dataset.id;
        const budget = budgets.find(b => b.id === id);
        openBudgetDialog(budget, () => loadBudgets(container));
      });
    });
    list.querySelectorAll('[data-act="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('[data-id]');
        const ok = await confirmDialog(`¿Eliminar el presupuesto de ${row.dataset.empresa}?`, { danger: true, confirmText: 'Eliminar' });
        if (!ok) return;
        await deleteBudget(row.dataset.id);
        showToast('Presupuesto eliminado', 'success');
        loadBudgets(container);
      });
    });
  } catch (err) {
    container.querySelector('#budgets-list').innerHTML = `<div class="alert alert-danger">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function openBudgetDialog(budget, onSaved) {
  const isEdit = !!budget;
  const { close, content, footer } = openModal(isEdit ? 'Editar presupuesto' : 'Nuevo presupuesto', {
    footer: `<button class="btn btn-secondary" data-act="cancel">Cancelar</button>
             <button class="btn btn-primary" data-act="save">Guardar</button>`
  });
  content.innerHTML = `
    <div class="field">
      <label>Empresa</label>
      <input class="input" id="b-empresa" value="${escapeHtml(budget?.empresa || '')}" ${isEdit ? 'readonly' : ''} placeholder="Nombre de empresa">
    </div>
    <div class="field">
      <label>Límite mensual (€)</label>
      <input class="input" type="number" step="0.01" id="b-monto" value="${budget?.monto ?? ''}" placeholder="Ej: 5000">
    </div>
    <div class="alert alert-info" style="font-size:13px">
      Al superarse, los nuevos gastos de esta empresa quedan automáticamente en estado <strong>Pendiente</strong>.
    </div>
  `;
  footer.querySelector('[data-act="cancel"]').addEventListener('click', close);
  footer.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const empresa = content.querySelector('#b-empresa').value.trim();
    const monto = parseFloat(content.querySelector('#b-monto').value);
    if (!empresa || !monto || monto <= 0) {
      showToast('Rellena empresa y monto válido', 'error');
      return;
    }
    try {
      await saveBudget(empresa, monto);
      showToast('Presupuesto guardado', 'success');
      close();
      onSaved?.();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  });
}

async function loadEvents(container) {
  try {
    const events = await getAllEvents();
    const list = container.querySelector('#events-list');
    if (events.length === 0) {
      list.innerHTML = '<p class="text-muted" style="padding:12px 0">No hay eventos creados.</p>';
      return;
    }
    list.innerHTML = events.map(ev => {
      const gastado = currentExpenses
        .filter(e => e.eventoId === ev.id)
        .reduce((s, e) => s + Number(e.total || 0), 0);
      const ppt = Number(ev.presupuesto || 0);
      const pct = ppt > 0 ? (gastado / ppt) * 100 : 0;
      const color = pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--success)';
      return `
        <div class="user-row" data-id="${ev.id}">
          <div style="min-width:0">
            <div class="user-name">${escapeHtml(ev.nombre)}</div>
            <div class="user-meta">
              ${ev.fechaInicio ? `📅 ${ev.fechaInicio}${ev.fechaFin ? ' → ' + ev.fechaFin : ''}` : ''}
              ${ppt > 0 ? ` · PPT: ${fmtEur(ppt)} · Gastado: <strong style="color:${color}">${fmtEur(gastado)} (${pct.toFixed(0)}%)</strong>` : ` · Gastado: ${fmtEur(gastado)}`}
            </div>
            ${ppt > 0 ? `
              <div style="height:4px;background:var(--surface-2);border-radius:100px;margin-top:6px;overflow:hidden">
                <div style="height:100%;width:${Math.min(pct,100)}%;background:${color}"></div>
              </div>` : ''}
          </div>
          <div class="flex gap-8">
            <button class="btn btn-secondary btn-sm" data-act="edit-ev">✎</button>
            <button class="btn btn-secondary btn-sm" data-act="del-ev" style="color:var(--danger)">🗑</button>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-act="edit-ev"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('[data-id]').dataset.id;
        const ev = events.find(e => e.id === id);
        openEventDialog(ev, () => loadEvents(container));
      });
    });
    list.querySelectorAll('[data-act="del-ev"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('[data-id]').dataset.id;
        const ok = await confirmDialog('¿Eliminar este evento?', { danger: true, confirmText: 'Eliminar' });
        if (!ok) return;
        await deleteEvent(id);
        showToast('Evento eliminado', 'success');
        loadEvents(container);
      });
    });
  } catch (err) {
    container.querySelector('#events-list').innerHTML = `<div class="alert alert-danger">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function openEventDialog(ev, onSaved) {
  const isEdit = !!ev;
  const { close, content, footer } = openModal(isEdit ? 'Editar evento' : 'Nuevo evento', {
    footer: `<button class="btn btn-secondary" data-act="cancel">Cancelar</button>
             <button class="btn btn-primary" data-act="save">Guardar</button>`
  });
  content.innerHTML = `
    <div class="field">
      <label>Nombre del evento</label>
      <input class="input" id="ev-nombre" value="${escapeHtml(ev?.nombre || '')}" placeholder="Ej: MWC 2026">
    </div>
    <div class="field-row">
      <div class="field">
        <label>Fecha inicio</label>
        <input class="input" type="date" id="ev-inicio" value="${ev?.fechaInicio || ''}">
      </div>
      <div class="field">
        <label>Fecha fin</label>
        <input class="input" type="date" id="ev-fin" value="${ev?.fechaFin || ''}">
      </div>
    </div>
    <div class="field">
      <label>Presupuesto total (€)</label>
      <input class="input" type="number" step="0.01" id="ev-ppt" value="${ev?.presupuesto ?? ''}" placeholder="Opcional">
    </div>
    <div class="field">
      <label>Descripción</label>
      <textarea id="ev-desc" rows="2">${escapeHtml(ev?.descripcion || '')}</textarea>
    </div>
  `;
  footer.querySelector('[data-act="cancel"]').addEventListener('click', close);
  footer.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const nombre = content.querySelector('#ev-nombre').value.trim();
    if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }
    const data = {
      nombre,
      fechaInicio:  content.querySelector('#ev-inicio').value || null,
      fechaFin:     content.querySelector('#ev-fin').value || null,
      presupuesto:  parseFloat(content.querySelector('#ev-ppt').value) || 0,
      descripcion:  content.querySelector('#ev-desc').value.trim()
    };
    try {
      await saveEvent(data, ev?.id);
      showToast('Evento guardado', 'success');
      close();
      onSaved?.();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  });
}
