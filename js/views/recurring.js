// ═══════════════════════════════════════════════════════════════
// GASTOS RECURRENTES
// ═══════════════════════════════════════════════════════════════

import { getAllRecurring, saveRecurring, deleteRecurring, getAllBudgets } from '../db.js';
import { openModal, showToast, confirmDialog, escapeHtml } from '../components/modal.js';
import { fmtEur } from '../utils/format.js';
import { CATEGORIAS, FORMAS_PAGO } from '../utils/filters.js';
import { isAdmin } from '../roles.js';

export async function renderRecurring(container, state) {
  if (!isAdmin(state.user)) {
    container.innerHTML = `<div class="alert alert-danger">Solo el administrador puede gestionar recurrentes.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="flex-between mb-16">
      <div>
        <h2 style="margin:0">Gastos recurrentes</h2>
        <p class="text-muted" style="margin:2px 0 0;font-size:13px">Se crean automáticamente cada mes (alquileres, nóminas…)</p>
      </div>
      <button id="btn-new" class="btn btn-primary btn-sm">+ Nuevo</button>
    </div>
    <div class="card"><div id="rec-list"><div class="text-muted" style="text-align:center;padding:20px">Cargando…</div></div></div>
  `;

  container.querySelector('#btn-new').addEventListener('click', () => openRecurringForm(null, load));
  await load();

  async function load() {
    const listEl = container.querySelector('#rec-list');
    try {
      const items = await getAllRecurring();
      if (items.length === 0) {
        listEl.innerHTML = `<div class="text-muted" style="text-align:center;padding:20px;font-size:13px">Sin gastos recurrentes definidos</div>`;
        return;
      }
      items.sort((a, b) => (a.nombre || a.proveedor || '').localeCompare(b.nombre || b.proveedor || ''));
      listEl.innerHTML = items.map(r => `
        <div class="user-row" data-id="${r.id}">
          <div>
            <div class="user-name">${r.active === false ? '⏸️' : '🔁'} ${escapeHtml(r.nombre || r.proveedor)}</div>
            <div class="user-meta">
              ${escapeHtml(r.empresa || '')} · ${fmtEur(r.total)} · día ${r.diaMes || 1} de cada mes
              ${r.categoria ? ' · ' + escapeHtml(r.categoria) : ''}
            </div>
          </div>
          <div style="display:flex;gap:4px">
            <button class="btn btn-secondary btn-sm" data-act="edit">✎</button>
            <button class="btn btn-secondary btn-sm" data-act="toggle">${r.active === false ? '▶' : '⏸'}</button>
            <button class="btn btn-secondary btn-sm" data-act="delete" style="color:var(--danger)">🗑</button>
          </div>
        </div>
      `).join('');

      listEl.querySelectorAll('[data-id]').forEach(row => {
        const id = row.dataset.id;
        const item = items.find(x => x.id === id);
        row.querySelector('[data-act="edit"]').addEventListener('click', () => openRecurringForm(item, load));
        row.querySelector('[data-act="toggle"]').addEventListener('click', async () => {
          try {
            await saveRecurring({ ...item, active: item.active === false ? true : false }, id);
            showToast(item.active === false ? 'Activado' : 'Pausado', 'success');
            await load();
          } catch (err) { showToast(err.message, 'error'); }
        });
        row.querySelector('[data-act="delete"]').addEventListener('click', async () => {
          const ok = await confirmDialog(`¿Eliminar "${item.nombre || item.proveedor}"?`, { danger: true, confirmText: 'Eliminar' });
          if (!ok) return;
          try {
            await deleteRecurring(id);
            showToast('Eliminado', 'success');
            await load();
          } catch (err) { showToast(err.message, 'error'); }
        });
      });
    } catch (err) {
      listEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  }
}

async function openRecurringForm(existing, onSaved) {
  const budgets = await getAllBudgets();
  const empresas = [...new Set(budgets.map(b => b.empresa).filter(Boolean))];

  const d = existing || {
    nombre: '', proveedor: '', nifProveedor: '', concepto: '', categoria: 'Suministros',
    empresa: empresas[0] || '', formaPago: 'Domiciliación',
    baseImponible: 0, tipoIva: 21, ivaTotal: 0, tipoIrpf: 0, irpfTotal: 0, total: 0,
    diaMes: 1, active: true
  };

  const { close, content, footer } = openModal(existing ? 'Editar recurrente' : 'Nuevo recurrente', {
    footer: `<button class="btn btn-secondary" data-act="cancel">Cancelar</button>
             <button class="btn btn-primary" data-act="save">Guardar</button>`
  });

  content.innerHTML = `
    <div class="field">
      <label>Nombre</label>
      <input class="input" name="nombre" value="${escapeHtml(d.nombre)}" placeholder="ej: Alquiler oficina">
    </div>
    <div class="field-row">
      <div class="field"><label>Proveedor *</label><input class="input" name="proveedor" value="${escapeHtml(d.proveedor)}" required></div>
      <div class="field"><label>NIF</label><input class="input" name="nifProveedor" value="${escapeHtml(d.nifProveedor || '')}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Empresa *</label><input class="input" name="empresa" value="${escapeHtml(d.empresa)}" required></div>
      <div class="field">
        <label>Categoría</label>
        <select class="select" name="categoria">
          ${CATEGORIAS.map(c => `<option value="${c}" ${c===d.categoria?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field">
      <label>Concepto</label>
      <input class="input" name="concepto" value="${escapeHtml(d.concepto || '')}">
    </div>
    <div class="field-row">
      <div class="field"><label>Base (€)</label><input class="input" type="number" step="0.01" name="baseImponible" value="${d.baseImponible}"></div>
      <div class="field">
        <label>Tipo IVA</label>
        <select class="select" name="tipoIva">
          ${[0,4,10,21].map(v => `<option value="${v}" ${v===d.tipoIva?'selected':''}>${v}%</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Total (€) *</label><input class="input" type="number" step="0.01" name="total" value="${d.total}" required></div>
      <div class="field"><label>Día del mes</label><input class="input" type="number" min="1" max="28" name="diaMes" value="${d.diaMes}"></div>
    </div>
    <div class="field">
      <label>Forma de pago</label>
      <select class="select" name="formaPago">
        ${FORMAS_PAGO.map(f => `<option value="${f}" ${f===d.formaPago?'selected':''}>${f}</option>`).join('')}
      </select>
    </div>
  `;

  const autoCalc = () => {
    const base = parseFloat(content.querySelector('[name=baseImponible]').value) || 0;
    const tIva = parseFloat(content.querySelector('[name=tipoIva]').value) || 0;
    const iva = Math.round(base * tIva) / 100;
    content.querySelector('[name=total]').value = (base + iva).toFixed(2);
  };
  ['baseImponible', 'tipoIva'].forEach(n => {
    content.querySelector(`[name=${n}]`).addEventListener('input', autoCalc);
    content.querySelector(`[name=${n}]`).addEventListener('change', autoCalc);
  });

  footer.querySelector('[data-act=cancel]').addEventListener('click', close);
  footer.querySelector('[data-act=save]').addEventListener('click', async () => {
    const data = {};
    ['nombre','proveedor','nifProveedor','concepto','categoria','empresa','formaPago']
      .forEach(n => data[n] = content.querySelector(`[name=${n}]`).value.trim());
    ['baseImponible','tipoIva','total','diaMes'].forEach(n => {
      data[n] = parseFloat(content.querySelector(`[name=${n}]`).value) || 0;
    });
    data.ivaTotal = Math.round(data.baseImponible * data.tipoIva) / 100;
    data.tipoIrpf = 0; data.irpfTotal = 0;
    if (!data.proveedor || !data.empresa || !data.total) {
      showToast('Proveedor, empresa y total son obligatorios', 'error');
      return;
    }
    try {
      await saveRecurring(data, existing?.id || null);
      close(); onSaved?.(); showToast('Guardado', 'success');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  });
}
