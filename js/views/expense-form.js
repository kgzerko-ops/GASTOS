// ═══════════════════════════════════════════════════════════════
// FORMULARIO DE GASTO — alta / edición (v2)
// Multi-fotos, duplicados, empresa según rol, bloqueo cierres
// ═══════════════════════════════════════════════════════════════

import { openModal, showToast, confirmDialog, escapeHtml } from '../components/modal.js';
import { createExpense, updateExpense, getAllEvents, getAllBudgets, findDuplicate, isMonthClosed } from '../db.js';
import { uploadTicketImage, compressImage } from '../storage.js';
import { todayIso, validateNif, fmtEur, fmtDate, monthKey } from '../utils/format.js';
import { CATEGORIAS, FORMAS_PAGO } from '../utils/filters.js';
import { openScanDialog } from './scan-dialog.js';
import { availableCompanies, canCreate } from '../roles.js';

const MAX_FOTOS = 5;

function emptyForm(user, prefill = {}) {
  let urls = [];
  if (prefill.ticketUrls && Array.isArray(prefill.ticketUrls)) {
    urls = prefill.ticketUrls.slice();
  } else if (prefill.ticketUrl) {
    urls = [{ url: prefill.ticketUrl, publicId: prefill.ticketPublicId || '' }];
  }
  const companies = availableCompanies(user);
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
    empresa:        prefill.empresa || companies[0] || user.empresa || '',
    eventoId:       prefill.eventoId || '',
    eventoNombre:   prefill.eventoNombre || '',
    estado:         prefill.estado || 'pendiente',
    ticketUrls:     urls,
    notas:          prefill.notas || ''
  };
}

export async function openExpenseForm(expense, state, onSave) {
  const user = state.user;
  const isEdit = !!expense;

  if (!canCreate(user) && !isEdit) {
    showToast('Tu rol no permite crear gastos', 'error');
    return;
  }

  const form = emptyForm(user, expense || {});
  let events = [], budgets = [];
  try {
    [events, budgets] = await Promise.all([getAllEvents(), getAllBudgets()]);
  } catch (e) { console.warn(e); }

  const companies = availableCompanies(user);
  if (isEdit && form.empresa && !companies.includes(form.empresa)) companies.unshift(form.empresa);
  if (companies.length === 0) companies.push(user.empresa || 'Mi Empresa');

  const { close, content, footer } = openModal(isEdit ? 'Editar gasto' : 'Nuevo gasto', {
    footer: `
      <button class="btn btn-secondary" data-act="cancel">Cancelar</button>
      <button class="btn btn-primary" data-act="save">${isEdit ? 'Guardar cambios' : 'Guardar gasto'}</button>
    `
  });

  content.innerHTML = `
    <div class="mb-16">
      <button class="btn btn-secondary btn-block" data-act="scan" type="button">
        📷 Añadir ticket (foto o PDF)
      </button>
      <small class="text-muted" style="display:block;margin-top:4px">
        Hasta ${MAX_FOTOS} imágenes por gasto (anverso/reverso, facturas multipágina, etc.)
      </small>
    </div>

    <div id="tickets-gallery" class="tickets-gallery"></div>
    <input type="file" id="file-input" accept="image/*,application/pdf" multiple class="hidden">

    <div id="closed-alert"></div>
    <div id="dup-alert"></div>
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
        <label>Empresa * <small class="text-muted">(a quién rindes)</small></label>
        <select class="select" name="empresa">
          ${companies.map(e => `<option value="${escapeHtml(e)}" ${e === form.empresa ? 'selected' : ''}>${escapeHtml(e)}</option>`).join('')}
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

  const $f = (name) => content.querySelector(`[name="${name}"]`);
  const gallery = content.querySelector('#tickets-gallery');

  function renderGallery() {
    if (form.ticketUrls.length === 0) { gallery.innerHTML = ''; return; }
    gallery.innerHTML = form.ticketUrls.map((t, i) => `
      <div class="ticket-thumb-wrap" data-idx="${i}">
        <img src="${escapeHtml(t.url)}" alt="ticket ${i+1}" class="ticket-thumb-big">
        <button class="ticket-remove" data-remove="${i}" title="Quitar">×</button>
        <div class="ticket-idx">${i+1}/${form.ticketUrls.length}</div>
      </div>
    `).join('');
    gallery.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.remove, 10);
        form.ticketUrls.splice(idx, 1);
        renderGallery();
      });
    });
    gallery.querySelectorAll('.ticket-thumb-big').forEach((img, i) => {
      img.addEventListener('click', () => {
        const { content: pvContent } = openModal(`Ticket ${i+1} de ${form.ticketUrls.length}`);
        pvContent.innerHTML = `<img src="${escapeHtml(form.ticketUrls[i].url)}" style="width:100%;border-radius:8px">`;
      });
    });
  }
  renderGallery();

  const autoCalc = () => {
    const base = parseFloat($f('baseImponible').value) || 0;
    const tIva = parseFloat($f('tipoIva').value) || 0;
    const tIrpf = parseFloat($f('tipoIrpf').value) || 0;
    const ivaT = Math.round(base * tIva) / 100;
    const irpfT = Math.round(base * tIrpf) / 100;
    $f('ivaTotal').value = ivaT.toFixed(2);
    $f('irpfTotal').value = irpfT.toFixed(2);
    $f('total').value = (base + ivaT - irpfT).toFixed(2);
  };
  ['baseImponible', 'tipoIva', 'tipoIrpf'].forEach(n => {
    $f(n).addEventListener('input', autoCalc);
    $f(n).addEventListener('change', autoCalc);
  });

  const nifField = $f('nifProveedor');
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

  // Duplicados
  let duplicateWarning = null;
  async function checkDuplicate() {
    const box = content.querySelector('#dup-alert');
    duplicateWarning = null;
    const nif = $f('nifProveedor').value.trim().toUpperCase();
    const total = parseFloat($f('total').value) || 0;
    const fecha = $f('fecha').value;
    if (!nif || !total || !fecha) { box.innerHTML = ''; return; }
    const dup = await findDuplicate({ nifProveedor: nif, total, fecha, excludeId: expense?.id || null });
    if (dup) {
      duplicateWarning = dup;
      box.innerHTML = `
        <div class="alert alert-warning">
          <strong>⚠ Posible duplicado</strong><br>
          Ya existe un gasto con mismo NIF, fecha y total:
          <em>${escapeHtml(dup.proveedor || '(sin proveedor)')}</em> — ${fmtEur(dup.total)} — ${fmtDate(dup.fecha)}.
        </div>`;
    } else { box.innerHTML = ''; }
  }
  ['nifProveedor', 'total', 'fecha'].forEach(n => $f(n).addEventListener('change', checkDuplicate));
  setTimeout(checkDuplicate, 300);

  // Cierre mensual
  let monthClosed = false;
  async function checkClosedMonth() {
    const box = content.querySelector('#closed-alert');
    const fecha = $f('fecha').value;
    const empresa = $f('empresa').value;
    if (!fecha || !empresa) { box.innerHTML = ''; monthClosed = false; return; }
    monthClosed = !!(await isMonthClosed(empresa, monthKey(fecha)));
    if (monthClosed && user.role !== 'admin') {
      box.innerHTML = `<div class="alert alert-danger">🔒 <strong>Mes cerrado.</strong> No se pueden añadir ni modificar gastos de ${monthKey(fecha)} en ${escapeHtml(empresa)}.</div>`;
    } else if (monthClosed) {
      box.innerHTML = `<div class="alert alert-warning">🔒 <strong>Mes cerrado.</strong> Solo el admin puede modificar gastos de este período.</div>`;
    } else { box.innerHTML = ''; }
  }
  $f('fecha').addEventListener('change', checkClosedMonth);
  $f('empresa').addEventListener('change', checkClosedMonth);
  checkClosedMonth();

  // File input multi
  const fileInput = content.querySelector('#file-input');
  content.querySelector('[data-act="scan"]').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    fileInput.value = '';
    for (const file of files) {
      if (form.ticketUrls.length >= MAX_FOTOS) {
        showToast(`Máximo ${MAX_FOTOS} imágenes`, 'warning');
        break;
      }
      await handleTicketFile(file, form.ticketUrls.length === 0);
    }
  });

  async function handleTicketFile(file, runOcr) {
    try {
      showToast('Subiendo imagen…', 'info', 1500);
      const compressed = file.type.startsWith('image/') ? await compressImage(file) : file;
      const upload = await uploadTicketImage(compressed);
      form.ticketUrls.push({ url: upload.secure_url, publicId: upload.public_id });
      renderGallery();
    } catch (err) {
      console.error(err);
      showToast('Error al subir: ' + err.message, 'error', 4000);
      return;
    }
    if (!runOcr) return;
    const extracted = await openScanDialog(file);
    if (!extracted) return;
    if (extracted.proveedor && !$f('proveedor').value)         $f('proveedor').value = extracted.proveedor;
    if (extracted.nifProveedor && !$f('nifProveedor').value)   $f('nifProveedor').value = extracted.nifProveedor;
    if (extracted.fecha)                                       $f('fecha').value = extracted.fecha;
    if (extracted.numeroDocumento && !$f('numeroDocumento').value) $f('numeroDocumento').value = extracted.numeroDocumento;
    if (extracted.baseImponible)  $f('baseImponible').value = extracted.baseImponible;
    if (extracted.tipoIva != null) $f('tipoIva').value = extracted.tipoIva;
    if (extracted.ivaTotal)       $f('ivaTotal').value = extracted.ivaTotal;
    if (extracted.total)          $f('total').value = extracted.total;
    checkBudget(); checkDuplicate();
    nifField.dispatchEvent(new Event('input'));
  }

  async function checkBudget() {
    const alertBox = content.querySelector('#budget-alert');
    const empresa = $f('empresa').value;
    const total = parseFloat($f('total').value) || 0;
    const fecha = $f('fecha').value;
    const budget = budgets.find(b => b.empresa === empresa);
    if (!budget || !empresa || !total || !fecha) { alertBox.innerHTML = ''; return; }
    const all = window.__lastExpenses || [];
    const mk = monthKey(fecha);
    const gastadoMes = all
      .filter(e => e.empresa === empresa && monthKey(e.fecha) === mk && e.id !== (expense?.id))
      .reduce((s, e) => s + Number(e.total || 0), 0);
    const nuevoTotal = gastadoMes + total;
    const pct = (nuevoTotal / budget.monto) * 100;
    if (pct >= 100) {
      alertBox.innerHTML = `<div class="alert alert-danger"><strong>⚠ Presupuesto superado</strong><br>${fmtEur(nuevoTotal)} de ${fmtEur(budget.monto)} (${pct.toFixed(0)}%). Quedará <strong>pendiente</strong>.</div>`;
    } else if (pct >= 80) {
      alertBox.innerHTML = `<div class="alert alert-warning"><strong>Atención:</strong> ${fmtEur(nuevoTotal)} de ${fmtEur(budget.monto)} (${pct.toFixed(0)}% del presupuesto).</div>`;
    } else { alertBox.innerHTML = ''; }
  }
  $f('total').addEventListener('input', checkBudget);
  $f('empresa').addEventListener('change', checkBudget);
  $f('fecha').addEventListener('change', checkBudget);
  checkBudget();

  footer.querySelector('[data-act="cancel"]').addEventListener('click', close);
  footer.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const data = {};
    ['fecha','proveedor','nifProveedor','concepto','categoria','formaPago',
     'numeroDocumento','empresa','eventoId','notas'].forEach(n => data[n] = $f(n).value.trim());
    ['baseImponible','tipoIva','ivaTotal','tipoIrpf','irpfTotal','total'].forEach(n => {
      data[n] = parseFloat($f(n).value) || 0;
    });
    data.nifProveedor = data.nifProveedor.toUpperCase();

    if (!data.fecha || !data.proveedor || !data.total || !data.empresa) {
      showToast('Fecha, proveedor, total y empresa son obligatorios', 'error');
      return;
    }
    if (monthClosed && user.role !== 'admin') {
      showToast('No se puede guardar: el mes está cerrado', 'error');
      return;
    }
    if (duplicateWarning) {
      const ok = await confirmDialog(
        `Hay un gasto muy parecido (${duplicateWarning.proveedor}, ${fmtEur(duplicateWarning.total)}, ${fmtDate(duplicateWarning.fecha)}). ¿Guardar igualmente?`,
        { confirmText: 'Guardar', cancelText: 'Revisar' }
      );
      if (!ok) return;
    }

    if (data.eventoId) data.eventoNombre = events.find(e => e.id === data.eventoId)?.nombre || '';
    else data.eventoNombre = '';

    data.ticketUrls = form.ticketUrls;
    data.ticketUrl = form.ticketUrls[0]?.url || '';
    data.ticketPublicId = form.ticketUrls[0]?.publicId || '';
    data.estado = expense?.estado || 'pendiente';

    const budget = budgets.find(b => b.empresa === data.empresa);
    if (budget) {
      const mk = monthKey(data.fecha);
      const all = window.__lastExpenses || [];
      const gastado = all.filter(e => e.empresa === data.empresa && monthKey(e.fecha) === mk && e.id !== expense?.id)
                          .reduce((s, e) => s + Number(e.total || 0), 0);
      data.superaPresupuesto = (gastado + data.total > budget.monto);
      if (data.superaPresupuesto && !isEdit) data.estado = 'pendiente';
    }

    if (!isEdit) {
      data.createdByUid = user.uid;
      data.createdByEmail = user.email;
      data.createdByName = user.displayName || user.email;
    }

    const saveBtn = footer.querySelector('[data-act="save"]');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando…';

    try {
      if (isEdit) await updateExpense(expense.id, data);
      else await createExpense(data);
      close();
      onSave?.();
    } catch (err) {
      console.error(err);
      showToast('Error: ' + err.message, 'error', 5000);
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit ? 'Guardar cambios' : 'Guardar gasto';
    }
  });
}
