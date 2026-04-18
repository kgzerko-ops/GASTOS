// ═══════════════════════════════════════════════════════════════
// FORMULARIO DE GASTO — alta / edición
// ═══════════════════════════════════════════════════════════════

import { openModal, showToast, escapeHtml } from '../components/modal.js';
import { createExpense, updateExpense, getAllEvents, getAllBudgets } from '../db.js';
import { uploadTicketImage, compressImage } from '../storage.js';
import { todayIso, validateNif } from '../utils/format.js';
import { CATEGORIAS, FORMAS_PAGO } from '../utils/filters.js';
import { openScanDialog } from './scan-dialog.js';
import { fmtEur, monthKey } from '../utils/format.js';

function emptyForm(user, prefill = {}) {
  return {
    fecha:          prefill.fecha || todayIso(),
    proveedor:      prefill.proveedor || '',
    nifProveedor:   prefill.nifProveedor || '',
    concepto:       prefill.concepto || '',
    categoria:      prefill.categoria || 'Otros',
    baseImponible:  prefill.baseImponible ?? 0,
    tipoIva:        prefill.tipoIva ?? 21,
    ivaTotal:       prefill.ivaTotal ?? 0,
    tipoIrpf:       prefill.tipoIrpf ?? 0,
    irpfTotal:      prefill.irpfTotal ?? 0,
    total:          prefill.total ?? 0,
    formaPago:      prefill.formaPago || 'Tarjeta',
    numeroDocumento: prefill.numeroDocumento || '',
    empresa:        prefill.empresa || user.empresa || '',
    eventoId:       prefill.eventoId || '',
    eventoNombre:   prefill.eventoNombre || '',
    estado:         prefill.estado || 'pendiente',
    ticketUrl:      prefill.ticketUrl || '',
    ticketPublicId: prefill.ticketPublicId || '',
    notas:          prefill.notas || ''
  };
}

/**
 * Abre el formulario. Si expense es null → crear. Si no → editar.
 * onSave: callback() tras guardar con éxito.
 */
export async function openExpenseForm(expense, state, onSave) {
  const user = state.user;
  const isEdit = !!expense;
  const form = emptyForm(user, expense || {});

  let events = [];
  let budgets = [];
  try {
    [events, budgets] = await Promise.all([getAllEvents(), getAllBudgets()]);
  } catch (e) { console.warn('No se pudieron cargar eventos/presupuestos', e); }

  const { close, content, footer } = openModal(isEdit ? 'Editar gasto' : 'Nuevo gasto', {
    footer: `
      <button class="btn btn-secondary" data-act="cancel">Cancelar</button>
      <button class="btn btn-primary" data-act="save">${isEdit ? 'Guardar cambios' : 'Guardar gasto'}</button>
    `
  });

  const empresasOpciones = [...new Set([
    user.empresa,
    ...(user.empresasVisibles || []),
    ...(budgets.map(b => b.empresa))
  ].filter(Boolean))];

  content.innerHTML = `
    <div class="mb-16">
      <button class="btn btn-secondary btn-block" data-act="scan" type="button">
        📷 Escanear ticket (foto o PDF)
      </button>
    </div>

    <div id="ticket-preview-wrap" class="${form.ticketUrl ? '' : 'hidden'}">
      <img id="ticket-preview" class="ticket-preview-full" src="${escapeHtml(form.ticketUrl)}" alt="Ticket">
    </div>
    <input type="file" id="file-input" accept="image/*,application/pdf" class="hidden">

    <div id="budget-alert"></div>

    <div class="field-row">
      <div class="field">
        <label>Fecha *</label>
        <input class="input" type="date" name="fecha" value="${form.fecha}" required>
      </div>
      <div class="field">
        <label>Nº documento</label>
        <input class="input" type="text" name="numeroDocumento" value="${escapeHtml(form.numeroDocumento)}">
      </div>
    </div>

    <div class="field">
      <label>Proveedor *</label>
      <input class="input" type="text" name="proveedor" value="${escapeHtml(form.proveedor)}" required>
    </div>

    <div class="field-row">
      <div class="field">
        <label>NIF / CIF proveedor</label>
        <input class="input" type="text" name="nifProveedor" value="${escapeHtml(form.nifProveedor)}" placeholder="B12345678">
        <small id="nif-feedback" class="text-muted"></small>
      </div>
      <div class="field">
        <label>Categoría</label>
        <select class="select" name="categoria">
          ${CATEGORIAS.map(c => `<option value="${c}" ${c === form.categoria ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="field">
      <label>Concepto</label>
      <input class="input" type="text" name="concepto" value="${escapeHtml(form.concepto)}" placeholder="Descripción del gasto">
    </div>

    <h3 style="margin:16px 0 8px">Importes</h3>

    <div class="field-row">
      <div class="field">
        <label>Base imponible (€)</label>
        <input class="input" type="number" step="0.01" name="baseImponible" value="${form.baseImponible}">
      </div>
      <div class="field">
        <label>Tipo IVA (%)</label>
        <select class="select" name="tipoIva">
          ${[0, 4, 10, 21].map(v => `<option value="${v}" ${v === form.tipoIva ? 'selected' : ''}>${v}%</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label>IVA total (€)</label>
        <input class="input" type="number" step="0.01" name="ivaTotal" value="${form.ivaTotal}">
      </div>
      <div class="field">
        <label>Tipo IRPF (%)</label>
        <select class="select" name="tipoIrpf">
          ${[0, 7, 15, 19].map(v => `<option value="${v}" ${v === form.tipoIrpf ? 'selected' : ''}>${v}%</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label>IRPF total (€)</label>
        <input class="input" type="number" step="0.01" name="irpfTotal" value="${form.irpfTotal}">
      </div>
      <div class="field">
        <label>TOTAL (€) *</label>
        <input class="input" type="number" step="0.01" name="total" value="${form.total}" required style="font-weight:700">
      </div>
    </div>

    <h3 style="margin:16px 0 8px">Detalles</h3>

    <div class="field-row">
      <div class="field">
        <label>Forma de pago</label>
        <select class="select" name="formaPago">
          ${FORMAS_PAGO.map(f => `<option value="${f}" ${f === form.formaPago ? 'selected' : ''}>${f}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Empresa</label>
        <select class="select" name="empresa">
          ${empresasOpciones.map(e => `<option value="${escapeHtml(e)}" ${e === form.empresa ? 'selected' : ''}>${escapeHtml(e)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="field">
      <label>Evento / Proyecto</label>
      <select class="select" name="eventoId">
        <option value="">— Sin asignar —</option>
        ${events.map(ev => `<option value="${ev.id}" ${ev.id === form.eventoId ? 'selected' : ''}>${escapeHtml(ev.nombre)}</option>`).join('')}
      </select>
    </div>

    <div class="field">
      <label>Notas</label>
      <textarea name="notas" rows="2" placeholder="Observaciones opcionales">${escapeHtml(form.notas)}</textarea>
    </div>
  `;

  const getField = (name) => content.querySelector(`[name="${name}"]`);

  // Auto-cálculo de IVA/IRPF/Total cuando cambia base o tipos
  const autoCalc = () => {
    const base = parseFloat(getField('baseImponible').value) || 0;
    const tIva = parseFloat(getField('tipoIva').value) || 0;
    const tIrpf = parseFloat(getField('tipoIrpf').value) || 0;
    const ivaT = Math.round(base * tIva) / 100;
    const irpfT = Math.round(base * tIrpf) / 100;
    getField('ivaTotal').value = ivaT.toFixed(2);
    getField('irpfTotal').value = irpfT.toFixed(2);
    getField('total').value = (base + ivaT - irpfT).toFixed(2);
  };
  ['baseImponible', 'tipoIva', 'tipoIrpf'].forEach(n => {
    getField(n).addEventListener('input', autoCalc);
    getField(n).addEventListener('change', autoCalc);
  });

  // Validación NIF en vivo
  const nifField = getField('nifProveedor');
  const nifFb = content.querySelector('#nif-feedback');
  nifField.addEventListener('input', () => {
    const v = nifField.value.trim();
    if (!v) { nifFb.textContent = ''; return; }
    if (validateNif(v)) {
      nifFb.textContent = '✓ NIF válido';
      nifFb.className = 'text-success';
    } else {
      nifFb.textContent = '⚠ Formato no válido';
      nifFb.className = 'text-warning';
    }
  });

  // Escanear
  const fileInput = content.querySelector('#file-input');
  content.querySelector('[data-act="scan"]').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Subir imagen primero en paralelo con OCR
    handleTicketFile(file);
  });

  async function handleTicketFile(file) {
    // Preview inmediato
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      content.querySelector('#ticket-preview').src = url;
      content.querySelector('#ticket-preview-wrap').classList.remove('hidden');
    }

    // Lanzar OCR
    const extracted = await openScanDialog(file);
    if (!extracted) return;

    // Precargar campos
    if (extracted.proveedor)      getField('proveedor').value = extracted.proveedor;
    if (extracted.nifProveedor)   getField('nifProveedor').value = extracted.nifProveedor;
    if (extracted.fecha)          getField('fecha').value = extracted.fecha;
    if (extracted.numeroDocumento) getField('numeroDocumento').value = extracted.numeroDocumento;
    if (extracted.baseImponible)  getField('baseImponible').value = extracted.baseImponible;
    if (extracted.tipoIva != null) getField('tipoIva').value = extracted.tipoIva;
    if (extracted.ivaTotal)       getField('ivaTotal').value = extracted.ivaTotal;
    if (extracted.total)          getField('total').value = extracted.total;

    // Subir imagen a Cloudinary en background
    try {
      showToast('Subiendo imagen…', 'info', 1500);
      const compressed = await compressImage(file);
      const upload = await uploadTicketImage(compressed);
      form.ticketUrl = upload.secure_url;
      form.ticketPublicId = upload.public_id;
      content.querySelector('#ticket-preview').src = upload.secure_url;
    } catch (err) {
      console.error('Upload error:', err);
      showToast('Error al subir imagen: ' + err.message, 'error', 4000);
    }

    checkBudget();
    nifField.dispatchEvent(new Event('input'));
  }

  // Chequeo de presupuesto al cambiar total o empresa
  async function checkBudget() {
    const alertBox = content.querySelector('#budget-alert');
    const empresa = getField('empresa').value;
    const total = parseFloat(getField('total').value) || 0;
    const fecha = getField('fecha').value;
    const budget = budgets.find(b => b.empresa === empresa);
    if (!budget || !empresa || !total || !fecha) {
      alertBox.innerHTML = '';
      return;
    }
    // Cargar gastos del mes desde caché (Firestore se consulta via subscribeExpenses en la vista)
    const state = window.GastosPro?.getState?.();
    const all = window.__lastExpenses || [];
    const mk = monthKey(fecha);
    const gastadoMes = all
      .filter(e => e.empresa === empresa && monthKey(e.fecha) === mk && e.id !== (expense?.id))
      .reduce((s, e) => s + Number(e.total || 0), 0);
    const nuevoTotal = gastadoMes + total;
    const pct = (nuevoTotal / budget.monto) * 100;

    if (pct >= 100) {
      alertBox.innerHTML = `
        <div class="alert alert-danger">
          <strong>⚠ Presupuesto superado</strong><br>
          ${fmtEur(nuevoTotal)} de ${fmtEur(budget.monto)} (${pct.toFixed(0)}%). Este gasto quedará <strong>pendiente</strong> de aprobación.
        </div>`;
    } else if (pct >= 80) {
      alertBox.innerHTML = `
        <div class="alert alert-warning">
          <strong>Atención:</strong> ${fmtEur(nuevoTotal)} de ${fmtEur(budget.monto)} (${pct.toFixed(0)}% del presupuesto mensual).
        </div>`;
    } else {
      alertBox.innerHTML = '';
    }
  }
  getField('total').addEventListener('input', checkBudget);
  getField('empresa').addEventListener('change', checkBudget);
  getField('fecha').addEventListener('change', checkBudget);
  checkBudget();

  // Guardar
  footer.querySelector('[data-act="cancel"]').addEventListener('click', close);
  footer.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const data = {};
    ['fecha','proveedor','nifProveedor','concepto','categoria','formaPago',
     'numeroDocumento','empresa','eventoId','notas'].forEach(n => data[n] = getField(n).value.trim());
    ['baseImponible','tipoIva','ivaTotal','tipoIrpf','irpfTotal','total'].forEach(n => {
      data[n] = parseFloat(getField(n).value) || 0;
    });

    if (!data.fecha || !data.proveedor || !data.total) {
      showToast('Fecha, proveedor y total son obligatorios', 'error');
      return;
    }

    // Evento nombre
    if (data.eventoId) {
      const ev = events.find(e => e.id === data.eventoId);
      data.eventoNombre = ev?.nombre || '';
    } else {
      data.eventoNombre = '';
    }

    // Ticket
    data.ticketUrl = form.ticketUrl;
    data.ticketPublicId = form.ticketPublicId;

    // Estado — si supera presupuesto, forzar pendiente
    data.estado = form.estado || 'pendiente';
    const budget = budgets.find(b => b.empresa === data.empresa);
    if (budget) {
      const mk = monthKey(data.fecha);
      const all = window.__lastExpenses || [];
      const gastado = all.filter(e => e.empresa === data.empresa && monthKey(e.fecha) === mk && e.id !== expense?.id)
                          .reduce((s, e) => s + Number(e.total || 0), 0);
      if (gastado + data.total > budget.monto) {
        data.estado = 'pendiente';
        data.superaPresupuesto = true;
      }
    }

    // Metadata usuario
    if (!isEdit) {
      data.createdByUid = user.uid;
      data.createdByEmail = user.email;
      data.createdByName = user.displayName || user.email;
    }

    const saveBtn = footer.querySelector('[data-act="save"]');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando…';

    try {
      if (isEdit) {
        await updateExpense(expense.id, data);
      } else {
        await createExpense(data);
      }
      close();
      onSave?.();
    } catch (err) {
      console.error(err);
      showToast('Error al guardar: ' + err.message, 'error', 5000);
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit ? 'Guardar cambios' : 'Guardar gasto';
    }
  });
}
