// ═══════════════════════════════════════════════════════════════
// VISTA GASTOS v5 — filtros guardados, tags, duplicar, avatar, breakdown
// ═══════════════════════════════════════════════════════════════

import { subscribeExpenses, deleteExpense, updateExpense, getAllEvents } from '../db.js';
import { applyFilters, computeTotals, computeBreakdown, CATEGORIAS, ESTADOS } from '../utils/filters.js';
import { fmtEur, fmtDate } from '../utils/format.js';
import { openExpenseForm } from './expense-form.js';
import { exportExpensesToXlsx } from '../utils/export-xlsx.js';
import { showToast, confirmDialog, openModal, escapeHtml } from '../components/modal.js';
import { avatarHtml } from '../utils/avatar.js';

let unsubscribe = null;

// Filtros guardados en localStorage por usuario
function getSavedFilters(uid) {
  try { return JSON.parse(localStorage.getItem('gastospro-savedfilters-' + uid) || '[]'); }
  catch { return []; }
}
function setSavedFilters(uid, list) {
  localStorage.setItem('gastospro-savedfilters-' + uid, JSON.stringify(list.slice(0, 10)));
}

export async function renderExpenses(container, state) {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }

  container.innerHTML = `
    <div class="filters">
      <div id="saved-filters-bar" style="margin-bottom:8px"></div>

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
          <input type="text" id="f-search" class="input" placeholder="Buscar proveedor, concepto, NIF, matrícula, etiqueta…">
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
        <select id="f-tag" class="select" style="width:auto;margin:0">
          <option value="todas">Todas las etiquetas</option>
        </select>
        <select id="f-evento" class="select" style="width:auto;margin:0">
          <option value="todos">Todos los eventos</option>
        </select>
        <button id="btn-save-filter" class="btn btn-secondary btn-sm">★ Guardar filtro</button>
        <button id="btn-export" class="btn btn-secondary btn-sm">⬇ Excel</button>
        <button id="btn-export-zip" class="btn btn-secondary btn-sm">📦 Excel + Tickets</button>
      </div>
    </div>

    <div class="totals-bar">
      <div class="total-chip"><div class="label">Base imponible</div><div class="value" id="t-base">0,00 €</div></div>
      <div class="total-chip"><div class="label">IVA total</div><div class="value" id="t-iva">0,00 €</div></div>
      <div class="total-chip"><div class="label">Total con IVA</div><div class="value" id="t-total" style="color:var(--primary)">0,00 €</div></div>
    </div>

    <div id="breakdown-by-cat"></div>

    <div id="expenses-list" class="expense-list"></div>
  `;

  const filters = {
    period: 'mes',
    customFrom: null, customTo: null,
    search: '',
    estado: 'todos',
    categoria: 'todas',
    empresa: 'todas',
    eventoId: 'todos',
    tag: 'todas'
  };

  let allExpenses = [];
  let events = [];
  try { events = await getAllEvents(); } catch {}

  const evSel = container.querySelector('#f-evento');
  events.forEach(ev => {
    const opt = document.createElement('option');
    opt.value = ev.id;
    opt.textContent = ev.nombre;
    evSel.appendChild(opt);
  });

  renderSavedFilters();

  unsubscribe = subscribeExpenses(state.user, (docs) => {
    allExpenses = docs;
    window.__lastExpenses = docs;
    // Empresas únicas
    const empresas = [...new Set(docs.map(d => d.empresa).filter(Boolean))];
    const empSel = container.querySelector('#f-empresa');
    const curEmp = empSel.value;
    empSel.innerHTML = `<option value="todas">Todas las empresas</option>` +
      empresas.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('');
    empSel.value = curEmp || 'todas';
    // Tags únicos
    const tagsSet = new Set();
    docs.forEach(d => (d.tags || []).forEach(t => tagsSet.add(t)));
    const tagSel = container.querySelector('#f-tag');
    const curTag = tagSel.value;
    tagSel.innerHTML = `<option value="todas">Todas las etiquetas</option>` +
      [...tagsSet].sort().map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
    tagSel.value = curTag || 'todas';
    render();
  });

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
  ['estado','categoria','empresa','evento','tag'].forEach(key => {
    const sel = container.querySelector('#f-' + key);
    sel.addEventListener('change', () => {
      filters[key === 'evento' ? 'eventoId' : key] = sel.value;
      render();
    });
  });

  container.querySelector('#btn-save-filter').addEventListener('click', () => {
    const name = prompt('Nombre del filtro guardado:');
    if (!name) return;
    const saved = getSavedFilters(state.user.uid);
    saved.push({ name: name.trim().slice(0, 30), filters: { ...filters } });
    setSavedFilters(state.user.uid, saved);
    renderSavedFilters();
    showToast('Filtro guardado', 'success');
  });

  container.querySelector('#btn-export').addEventListener('click', async () => {
    const filtered = applyFilters(allExpenses, filters);
    if (filtered.length === 0) return showToast('No hay gastos', 'warning');
    try {
      await exportExpensesToXlsx(filtered, `gastos-${new Date().toISOString().slice(0,10)}.xlsx`);
      showToast('Excel descargado', 'success');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  });

  container.querySelector('#btn-export-zip').addEventListener('click', async () => {
    const filtered = applyFilters(allExpenses, filters);
    if (filtered.length === 0) return showToast('No hay gastos', 'warning');
    const { exportExpensesToZip } = await import('../utils/export-zip.js');
    const mdl = openModal('Generando ZIP…');
    const conTickets = filtered.filter(e => e.ticketUrl || (e.ticketUrls && e.ticketUrls.length));
    mdl.content.innerHTML = `
      <p style="font-size:14px">Descargando tickets (${filtered.length} gastos, ${conTickets.length} con imagen)…</p>
      <div class="progress-bar"><div class="progress-bar-fill" id="zip-bar" style="width:0%"></div></div>
      <p id="zip-msg" class="text-muted" style="font-size:12px;text-align:center;margin:8px 0 0"></p>
    `;
    try {
      await exportExpensesToZip(filtered, `gastos-${new Date().toISOString().slice(0,10)}.zip`, (done, total, msg) => {
        const pct = total ? Math.round((done / total) * 100) : 0;
        const bar = mdl.content.querySelector('#zip-bar');
        const m = mdl.content.querySelector('#zip-msg');
        if (bar) bar.style.width = pct + '%';
        if (m) m.textContent = msg || `${done} / ${total}`;
      });
      mdl.close();
      showToast('ZIP descargado', 'success');
    } catch (err) {
      mdl.close();
      showToast('Error: ' + err.message, 'error');
    }
  });

  function renderSavedFilters() {
    const bar = container.querySelector('#saved-filters-bar');
    const saved = getSavedFilters(state.user.uid);
    if (saved.length === 0) { bar.innerHTML = ''; return; }
    bar.innerHTML = saved.map((s, i) => `
      <span class="saved-filter-chip" data-idx="${i}">
        ★ ${escapeHtml(s.name)}
        <span class="remove" data-rm="${i}">×</span>
      </span>
    `).join('');
    bar.querySelectorAll('[data-idx]').forEach(chip => {
      chip.addEventListener('click', (ev) => {
        if (ev.target.classList.contains('remove')) return;
        const idx = parseInt(chip.dataset.idx);
        Object.assign(filters, saved[idx].filters);
        // Aplicar a los controles
        container.querySelector('#f-search').value = filters.search || '';
        container.querySelector('#f-estado').value = filters.estado;
        container.querySelector('#f-categoria').value = filters.categoria;
        container.querySelector('#f-empresa').value = filters.empresa;
        container.querySelector('#f-tag').value = filters.tag || 'todas';
        container.querySelector('#f-evento').value = filters.eventoId;
        container.querySelectorAll('.period-tab').forEach(t => t.classList.toggle('active', t.dataset.p === filters.period));
        render();
      });
    });
    bar.querySelectorAll('[data-rm]').forEach(x => {
      x.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const idx = parseInt(x.dataset.rm);
        const s = getSavedFilters(state.user.uid);
        s.splice(idx, 1);
        setSavedFilters(state.user.uid, s);
        renderSavedFilters();
      });
    });
  }

  function render() {
    const filtered = applyFilters(allExpenses, filters);
    const totals = computeTotals(filtered);

    container.querySelector('#t-base').textContent = fmtEur(totals.baseImponible);
    container.querySelector('#t-iva').textContent = fmtEur(totals.iva);
    container.querySelector('#t-total').textContent = fmtEur(totals.total);

    // Breakdown por categoría (top 4)
    const breakdown = computeBreakdown(filtered, 'categoria').slice(0, 4);
    const breakdownEl = container.querySelector('#breakdown-by-cat');
    if (breakdown.length > 1) {
      breakdownEl.innerHTML = `
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;font-size:12px">
          ${breakdown.map(b => `
            <span style="background:var(--surface);border:1px solid var(--border);padding:4px 10px;border-radius:100px">
              <strong>${escapeHtml(b.key)}</strong>: ${fmtEur(b.total)}
            </span>
          `).join('')}
        </div>`;
    } else {
      breakdownEl.innerHTML = '';
    }

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
  const numTickets = (e.ticketUrls && e.ticketUrls.length) || (e.ticketUrl ? 1 : 0);
  const avatar = avatarHtml(e.createdByName || e.createdByEmail, 'sm');
  const isNegative = Number(e.total || 0) < 0;

  return `
    <div class="expense-item" data-id="${e.id}">
      <div class="title-line">
        <span class="proveedor">${escapeHtml(e.proveedor || '(Sin proveedor)')}</span>
        <span class="total" style="${isNegative ? 'color:var(--danger)' : ''}">${fmtEur(e.total)}</span>
      </div>
      <div class="meta">
        <span>📅 ${fmtDate(e.fecha)}</span>
        ${e.categoria ? `<span>🏷 ${escapeHtml(e.categoria)}</span>` : ''}
        ${e.empresa ? `<span>🏢 ${escapeHtml(e.empresa)}</span>` : ''}
        ${e.eventoNombre ? `<span>📌 ${escapeHtml(e.eventoNombre)}</span>` : ''}
        <span class="badge badge-${e.estado}">${e.estado}</span>
        ${isAdmin ? `<span style="display:inline-flex;align-items:center;gap:4px">${avatar}</span>` : ''}
        ${e.superaPresupuesto ? '<span class="badge badge-rejected" title="Supera presupuesto">⚠ PPT</span>' : ''}
        ${e.recurringId ? '<span class="badge" style="background:#eef2ff;color:#4338ca">🔁</span>' : ''}
        ${e.isKilometraje ? '<span class="badge" style="background:#ecfdf5;color:#065f46">🚗</span>' : ''}
        ${e.esAbono ? '<span class="badge badge-rejected">🔄 ABONO</span>' : ''}
        ${e.esIntracomunitario ? '<span class="badge" style="background:#fff7ed;color:#9a3412">🇪🇺 INTRA</span>' : ''}
        ${e.propina > 0 ? `<span class="text-muted" style="font-size:11px">+propina ${fmtEur(e.propina)}</span>` : ''}
        ${e.matricula ? `<span class="text-muted" style="font-size:11px">🚙 ${escapeHtml(e.matricula)}</span>` : ''}
      </div>
      ${e.concepto ? `<div style="font-size:13px;color:var(--text-muted);grid-column:1/-1">${escapeHtml(e.concepto)}</div>` : ''}
      ${Array.isArray(e.tags) && e.tags.length > 0 ? `
        <div style="grid-column:1/-1">
          ${e.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
        </div>
      ` : ''}
      ${e.notaAdmin ? `<div style="font-size:12px;color:var(--warning);grid-column:1/-1">📝 <em>${escapeHtml(e.notaAdmin)}</em></div>` : ''}
      <div class="actions">
        ${numTickets > 0 ? `<button class="btn btn-secondary btn-sm" data-act="view-ticket">🖼 ${numTickets > 1 ? numTickets + ' imgs' : 'Ver'}</button>` : ''}
        <button class="btn btn-secondary btn-sm" data-act="comments">💬</button>
        <button class="btn btn-secondary btn-sm" data-act="duplicate" title="Duplicar">⎘</button>
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

    item.querySelector('[data-act="duplicate"]')?.addEventListener('click', () => {
      // Abrir formulario con los datos precargados (sin id ni estado)
      const { id, estado, notaAdmin, createdAt, updatedAt, createdByUid, createdByEmail, createdByName,
              ticketUrl, ticketUrls, ticketPublicId, ...rest } = expense;
      openExpenseForm(null, state, () => showToast('Gasto duplicado', 'success'), rest);
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
      const imgs = expense.ticketUrls && expense.ticketUrls.length
        ? expense.ticketUrls
        : (expense.ticketUrl ? [{ url: expense.ticketUrl }] : []);
      if (imgs.length === 0) return;
      const { content } = openModal(`Ticket de ${expense.proveedor}`);
      content.innerHTML = imgs.map((t, i) => `
        <div style="margin-bottom:12px">
          ${imgs.length > 1 ? `<div class="text-muted" style="font-size:12px;margin-bottom:4px">Imagen ${i+1} de ${imgs.length}</div>` : ''}
          <a href="${escapeHtml(t.url)}" target="_blank" rel="noopener">
            <img src="${escapeHtml(t.url)}" style="width:100%;border-radius:8px;border:1px solid var(--border)">
          </a>
        </div>
      `).join('');
    });

    item.querySelector('[data-act="comments"]')?.addEventListener('click', async () => {
      const { openCommentsDialog } = await import('./comments-dialog.js');
      openCommentsDialog(expense, state);
    });

    item.querySelector('[data-act="approve"]')?.addEventListener('click', async () => {
      try {
        await updateExpense(id, { estado: 'aprobado', notaAdmin: expense.notaAdmin || '', resueltoEn: Date.now() });
        showToast('Gasto aprobado', 'success');
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    });

    item.querySelector('[data-act="reject"]')?.addEventListener('click', () => {
      openApprovalDialog(expense, 'rechazar', async (nota) => {
        try {
          await updateExpense(id, { estado: 'rechazado', notaAdmin: nota, resueltoEn: Date.now() });
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
      showToast('Indica el motivo del rechazo', 'error');
      return;
    }
    close();
    onConfirm(nota);
  });
}

export { openExpenseForm };
