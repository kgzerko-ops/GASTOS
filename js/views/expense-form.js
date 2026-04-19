// ═══════════════════════════════════════════════════════════════
// FORMULARIO DE GASTO v5 — multi-IVA, tags, abono, recargo,
// IRPF automático, claves AEAT, matrícula, hotel, rectificativa
// ═══════════════════════════════════════════════════════════════

import { openModal, showToast, confirmDialog, escapeHtml } from '../components/modal.js';
import { createExpense, updateExpense, getAllEvents, getAllBudgets, findDuplicate, isMonthClosed } from '../db.js';
import { uploadTicketImage, compressImage } from '../storage.js';
import { todayIso, validateNif, fmtEur, fmtDate, monthKey } from '../utils/format.js';
import { checkCoherencia } from '../utils/sanitize.js';
import { CATEGORIAS, FORMAS_PAGO } from '../utils/filters.js';
import {
  CLAVES_OPERACION, TIPOS_IRPF, RECARGO_EQUIVALENCIA,
  esNifPersonaFisica, sugerenciaIrpf, detectarPropina,
  CATEGORIAS_CON_MATRICULA, CATEGORIAS_HOTEL, validarMatricula
} from '../utils/fiscal.js';
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
    fecha:           prefill.fecha || todayIso(),
    proveedor:       prefill.proveedor || '',
    nifProveedor:    prefill.nifProveedor || '',
    concepto:        prefill.concepto || '',
    categoria:       prefill.categoria || 'Otros',
    baseImponible:   prefill.baseImponible ?? 0,
    tipoIva:         prefill.tipoIva ?? 21,
    ivaTotal:        prefill.ivaTotal ?? 0,
    tipoIrpf:        prefill.tipoIrpf ?? 0,
    irpfTotal:       prefill.irpfTotal ?? 0,
    recargoEquivalencia: prefill.recargoEquivalencia ?? 0,
    total:           prefill.total ?? 0,
    propina:         prefill.propina ?? 0,
    formaPago:       prefill.formaPago || 'Tarjeta',
    numeroDocumento: prefill.numeroDocumento || '',
    empresa:         prefill.empresa || companies[0] || user.empresa || '',
    eventoId:        prefill.eventoId || '',
    eventoNombre:    prefill.eventoNombre || '',
    estado:          prefill.estado || 'pendiente',
    ticketUrls:      urls,
    lineasIva:       Array.isArray(prefill.lineasIva) ? prefill.lineasIva : [],
    esIntracomunitario: !!prefill.esIntracomunitario,
    esAbono:         !!prefill.esAbono,
    numeroFacturaRectificativa: prefill.numeroFacturaRectificativa || '',
    claveOperacion:  prefill.claveOperacion || '01',
    tags:            Array.isArray(prefill.tags) ? prefill.tags.slice() : [],
    matricula:       prefill.matricula || '',
    fechaEntrada:    prefill.fechaEntrada || '',
    fechaSalida:     prefill.fechaSalida || '',
    noches:          prefill.noches || 0,
    habitacion:      prefill.habitacion || '',
    notas:           prefill.notas || ''
  };
}

export async function openExpenseForm(expense, state, onSave, prefill = null) {
  const user = state.user;
  const isEdit = !!expense;

  if (!canCreate(user) && !isEdit) {
    showToast('Tu rol no permite crear gastos', 'error');
    return;
  }

  const form = emptyForm(user, expense || prefill || {});
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

  content.innerHTML = renderFormHtml(form, companies, events);

  const $f = (name) => content.querySelector(`[name="${name}"]`);
  const gallery = content.querySelector('#tickets-gallery');

  // ── Galería de tickets ──
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
        form.ticketUrls.splice(parseInt(btn.dataset.remove, 10), 1);
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

  // ── Auto-cálculo ──
  const autoCalc = () => {
    const base = parseFloat($f('baseImponible').value) || 0;
    const tIva = parseFloat($f('tipoIva').value) || 0;
    const tIrpf = parseFloat($f('tipoIrpf').value) || 0;
    const ivaT = Math.round(base * tIva) / 100;
    const irpfT = Math.round(base * tIrpf) / 100;
    // Recargo equivalencia automático si está habilitado
    const recargoCheck = content.querySelector('#f-recargo-check');
    const recTasa = recargoCheck?.checked ? (RECARGO_EQUIVALENCIA[tIva] || 0) : 0;
    const recargoT = Math.round(base * recTasa) / 100;
    $f('ivaTotal').value = ivaT.toFixed(2);
    $f('irpfTotal').value = irpfT.toFixed(2);
    $f('recargoEquivalencia').value = recargoT.toFixed(2);
    const propina = parseFloat($f('propina').value) || 0;
    let total = base + ivaT - irpfT + recargoT + propina;
    if (form.esAbono) total = -Math.abs(total);
    $f('total').value = total.toFixed(2);
  };
  ['baseImponible', 'tipoIva', 'tipoIrpf', 'propina'].forEach(n => {
    $f(n).addEventListener('input', autoCalc);
    $f(n).addEventListener('change', autoCalc);
  });
  content.querySelector('#f-recargo-check')?.addEventListener('change', autoCalc);
  content.querySelector('#f-abono-check')?.addEventListener('change', (e) => {
    form.esAbono = e.target.checked;
    content.querySelector('#abono-banner').classList.toggle('hidden', !form.esAbono);
    autoCalc();
  });

  // ── NIF validación + sugerencia IRPF automática ──
  const nifField = $f('nifProveedor');
  const nifFb = content.querySelector('#nif-feedback');
  function updateNifAndIrpf() {
    const v = nifField.value.trim();
    if (!v) { nifFb.textContent = ''; return; }
    if (validateNif(v)) {
      nifFb.textContent = esNifPersonaFisica(v) ? '✓ NIF persona física' : '✓ CIF válido';
      nifFb.className = 'text-success';
    } else {
      nifFb.textContent = '⚠ Formato no válido';
      nifFb.className = 'text-warning';
    }
    // Sugerir IRPF
    const sug = sugerenciaIrpf({ categoria: $f('categoria').value, nifProveedor: v });
    const sugBox = content.querySelector('#irpf-sugerencia');
    if (sug && parseFloat($f('tipoIrpf').value) === 0) {
      sugBox.innerHTML = `
        <div class="alert alert-info" style="font-size:12px;margin:4px 0">
          💡 <strong>Sugerencia</strong>: ${escapeHtml(sug.motivo)}
          <button class="btn btn-sm btn-primary" id="btn-apply-irpf" style="margin-left:8px">Aplicar ${sug.tipo}%</button>
        </div>`;
      content.querySelector('#btn-apply-irpf').addEventListener('click', () => {
        $f('tipoIrpf').value = sug.tipo;
        autoCalc();
        sugBox.innerHTML = '';
      });
    } else {
      sugBox.innerHTML = '';
    }
  }
  nifField.addEventListener('input', updateNifAndIrpf);
  $f('categoria').addEventListener('change', () => {
    updateNifAndIrpf();
    updateCamposCondicionales();
  });
  updateNifAndIrpf();

  // ── Campos condicionales según categoría (matrícula, hotel) ──
  function updateCamposCondicionales() {
    const cat = $f('categoria').value;
    const matriculaBox = content.querySelector('#f-matricula-wrap');
    const hotelBox = content.querySelector('#f-hotel-wrap');
    matriculaBox.classList.toggle('hidden', !CATEGORIAS_CON_MATRICULA.includes(cat));
    hotelBox.classList.toggle('hidden', !CATEGORIAS_HOTEL.includes(cat));
  }
  updateCamposCondicionales();

  // ── Cálculo de noches al cambiar fechas ──
  ['fechaEntrada', 'fechaSalida'].forEach(n => {
    $f(n).addEventListener('change', () => {
      const e = $f('fechaEntrada').value;
      const s = $f('fechaSalida').value;
      if (e && s) {
        const ms = new Date(s) - new Date(e);
        const noches = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
        $f('noches').value = noches;
      }
    });
  });

  // ── Tags input ──
  const tagsWrap = content.querySelector('#tags-wrap');
  function renderTags() {
    tagsWrap.innerHTML = form.tags.map((t, i) => `
      <button type="button" class="tag tag-removable" data-tag-idx="${i}">${escapeHtml(t)}</button>
    `).join('') + `<input type="text" id="tag-input" placeholder="Añadir etiqueta y pulsa Enter…">`;
    tagsWrap.querySelectorAll('[data-tag-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        form.tags.splice(parseInt(btn.dataset.tagIdx, 10), 1);
        renderTags();
      });
    });
    const tagInput = tagsWrap.querySelector('#tag-input');
    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const v = tagInput.value.trim().toLowerCase().replace(/[,]/g, '');
        if (v && !form.tags.includes(v) && form.tags.length < 10) {
          form.tags.push(v);
          renderTags();
          tagsWrap.querySelector('#tag-input').focus();
        }
      }
    });
  }
  renderTags();

  // ── Duplicados ──
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
      const exacto = dup._duplicateType === 'exacto';
      box.innerHTML = `
        <div class="alert ${exacto ? 'alert-danger' : 'alert-warning'}">
          <strong>${exacto ? '⚠ Duplicado exacto' : '⚠ Gasto parecido'}</strong><br>
          <em>${escapeHtml(dup.proveedor || '(sin proveedor)')}</em> — ${fmtEur(dup.total)} — ${fmtDate(dup.fecha)}
        </div>`;
    } else { box.innerHTML = ''; }
  }
  ['nifProveedor', 'total', 'fecha'].forEach(n => $f(n).addEventListener('change', checkDuplicate));
  setTimeout(checkDuplicate, 300);

  // ── Cierre mensual ──
  let monthClosed = false;
  async function checkClosedMonth() {
    const box = content.querySelector('#closed-alert');
    const fecha = $f('fecha').value;
    const empresa = $f('empresa').value;
    if (!fecha || !empresa) { box.innerHTML = ''; monthClosed = false; return; }
    monthClosed = !!(await isMonthClosed(empresa, monthKey(fecha)));
    if (monthClosed && user.role !== 'admin') {
      box.innerHTML = `<div class="alert alert-danger">🔒 Mes cerrado. No se pueden añadir ni modificar gastos de ${monthKey(fecha)} en ${escapeHtml(empresa)}.</div>`;
    } else if (monthClosed) {
      box.innerHTML = `<div class="alert alert-warning">🔒 Mes cerrado. Solo el admin puede modificar gastos de este período.</div>`;
    } else { box.innerHTML = ''; }
  }
  $f('fecha').addEventListener('change', checkClosedMonth);
  $f('empresa').addEventListener('change', checkClosedMonth);
  checkClosedMonth();

  // ── Presupuesto ──
  async function checkBudget() {
    const alertBox = content.querySelector('#budget-alert');
    const empresa = $f('empresa').value;
    const total = Math.abs(parseFloat($f('total').value) || 0);
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
      alertBox.innerHTML = `<div class="alert alert-warning"><strong>Atención:</strong> ${fmtEur(nuevoTotal)} de ${fmtEur(budget.monto)} (${pct.toFixed(0)}%).</div>`;
    } else { alertBox.innerHTML = ''; }
  }
  $f('total').addEventListener('input', checkBudget);
  $f('empresa').addEventListener('change', checkBudget);
  $f('fecha').addEventListener('change', checkBudget);
  checkBudget();

  // ── Escanear ──
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
      showToast('Error al subir: ' + err.message, 'error', 4000);
      return;
    }
    if (!runOcr) return;
    const extracted = await openScanDialog(file);
    if (!extracted) return;

    // Aplicar campos
    if (extracted.proveedor && !$f('proveedor').value)         $f('proveedor').value = extracted.proveedor;
    if (extracted.nifProveedor && !$f('nifProveedor').value)   $f('nifProveedor').value = extracted.nifProveedor;
    if (extracted.fecha)                                       $f('fecha').value = extracted.fecha;
    if (extracted.numeroDocumento && !$f('numeroDocumento').value) $f('numeroDocumento').value = extracted.numeroDocumento;
    if (extracted.baseImponible)  $f('baseImponible').value = extracted.baseImponible;
    if (extracted.tipoIva != null) $f('tipoIva').value = extracted.tipoIva;
    if (extracted.ivaTotal)       $f('ivaTotal').value = extracted.ivaTotal;
    if (extracted.tipoIrpf != null && extracted.tipoIrpf > 0) $f('tipoIrpf').value = extracted.tipoIrpf;
    if (extracted.irpfTotal)      $f('irpfTotal').value = extracted.irpfTotal;
    if (extracted.total)          $f('total').value = extracted.total;

    // Recargo equivalencia
    if (extracted.recargoEquivalencia > 0) {
      content.querySelector('#f-recargo-check').checked = true;
      $f('recargoEquivalencia').value = extracted.recargoEquivalencia;
    }

    // Propina
    if (extracted.propina > 0) {
      $f('propina').value = extracted.propina;
      showToast(`Propina detectada: ${fmtEur(extracted.propina)}`, 'info', 3000);
    } else if (extracted.totalPagado > 0 && extracted.total > 0 && extracted.totalPagado > extracted.total) {
      const p = detectarPropina({ total: extracted.total, totalPagado: extracted.totalPagado });
      if (p) {
        $f('propina').value = p.propina;
        showToast(`Posible propina: ${fmtEur(p.propina)}`, 'info', 3000);
      }
    }

    // Matrícula
    if (extracted.matricula) {
      $f('matricula').value = extracted.matricula;
    }

    // Hotel
    if (extracted.fechaEntrada) $f('fechaEntrada').value = extracted.fechaEntrada;
    if (extracted.fechaSalida) $f('fechaSalida').value = extracted.fechaSalida;
    if (extracted.noches) $f('noches').value = extracted.noches;
    if (extracted.habitacion) $f('habitacion').value = extracted.habitacion;

    // Abono
    if (extracted.esAbono) {
      content.querySelector('#f-abono-check').checked = true;
      form.esAbono = true;
      content.querySelector('#abono-banner').classList.remove('hidden');
    }

    // Rectificativa
    if (extracted.numeroFacturaRectificativa) {
      $f('numeroFacturaRectificativa').value = extracted.numeroFacturaRectificativa;
    }

    // Clave de operación
    if (extracted.claveOperacion) $f('claveOperacion').value = extracted.claveOperacion;
    if (extracted.formaPago) $f('formaPago').value = extracted.formaPago;

    // Líneas IVA
    if (Array.isArray(extracted.lineasIva) && extracted.lineasIva.length > 0) {
      form.lineasIva = extracted.lineasIva;
      if (extracted.lineasIva.length > 1) {
        content.querySelector('#dup-alert').insertAdjacentHTML('beforebegin', `
          <div class="alert alert-info" style="font-size:13px">
            ℹ Ticket con <strong>${extracted.lineasIva.length} tipos de IVA</strong>. Van al Libro IVA desglosados.
          </div>
        `);
      }
    }
    if (extracted.esIntracomunitario) form.esIntracomunitario = true;

    updateNifAndIrpf();
    updateCamposCondicionales();
    checkBudget();
    checkDuplicate();
    autoCalc();
  }

  // ── Guardar ──
  footer.querySelector('[data-act="cancel"]').addEventListener('click', close);
  footer.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const data = {};
    ['fecha','proveedor','nifProveedor','concepto','categoria','formaPago',
     'numeroDocumento','empresa','eventoId','notas','claveOperacion',
     'matricula','fechaEntrada','fechaSalida','habitacion','numeroFacturaRectificativa']
      .forEach(n => data[n] = $f(n).value.trim());
    ['baseImponible','tipoIva','ivaTotal','tipoIrpf','irpfTotal',
     'recargoEquivalencia','total','propina','noches'].forEach(n => {
      data[n] = parseFloat($f(n).value) || 0;
    });
    data.nifProveedor = data.nifProveedor.toUpperCase();
    data.matricula = data.matricula.toUpperCase();

    if (!data.fecha || !data.proveedor || !data.total || !data.empresa) {
      showToast('Fecha, proveedor, total y empresa son obligatorios', 'error');
      return;
    }
    if (data.matricula && !validarMatricula(data.matricula)) {
      const ok = await confirmDialog('La matrícula no tiene formato español válido. ¿Guardar igualmente?', { confirmText: 'Guardar', cancelText: 'Corregir' });
      if (!ok) return;
    }
    if (monthClosed && user.role !== 'admin') {
      showToast('No se puede guardar: el mes está cerrado', 'error');
      return;
    }
    if (duplicateWarning) {
      const exacto = duplicateWarning._duplicateType === 'exacto';
      const titulo = exacto
        ? `⚠ Ya existe un gasto EXACTAMENTE igual (${duplicateWarning.proveedor}, ${fmtEur(duplicateWarning.total)}). ¿Guardar duplicado?`
        : `Hay un gasto muy parecido (${duplicateWarning.proveedor}, ${fmtEur(duplicateWarning.total)}). ¿Guardar igualmente?`;
      const ok = await confirmDialog(titulo, { confirmText: 'Guardar', cancelText: 'Revisar', danger: exacto });
      if (!ok) return;
    }

    // Validación coherencia
    const base = Array.isArray(form.lineasIva) && form.lineasIva.length > 0
      ? form.lineasIva.reduce((s, l) => s + Number(l.baseImponible || 0), 0)
      : data.baseImponible;
    const iva = Array.isArray(form.lineasIva) && form.lineasIva.length > 0
      ? form.lineasIva.reduce((s, l) => s + Number(l.ivaTotal || 0), 0)
      : data.ivaTotal;
    // Para abonos, comparamos en absoluto
    const totalAbs = Math.abs(data.total);
    const coh = checkCoherencia(base, iva, data.irpfTotal - data.recargoEquivalencia - data.propina, totalAbs);
    if (!coh.ok) {
      const ok = await confirmDialog(
        `Los importes no cuadran:\n${coh.message}\n\n¿Guardar igualmente?`,
        { confirmText: 'Guardar con aviso', cancelText: 'Revisar', danger: false }
      );
      if (!ok) return;
      data.avisosCoherencia = [coh.message];
    }

    if (data.eventoId) data.eventoNombre = events.find(e => e.id === data.eventoId)?.nombre || '';
    else data.eventoNombre = '';

    data.ticketUrls = form.ticketUrls;
    data.ticketUrl = form.ticketUrls[0]?.url || '';
    data.ticketPublicId = form.ticketUrls[0]?.publicId || '';
    data.lineasIva = Array.isArray(form.lineasIva) && form.lineasIva.length > 0
      ? form.lineasIva
      : (data.baseImponible > 0 ? [{ tipoIva: data.tipoIva, baseImponible: data.baseImponible, ivaTotal: data.ivaTotal }] : []);
    data.esIntracomunitario = !!form.esIntracomunitario;
    data.esAbono = !!form.esAbono;
    data.tags = form.tags;

    // Estado
    data.estado = expense?.estado || 'pendiente';
    const budget = budgets.find(b => b.empresa === data.empresa);
    if (budget && !data.esAbono) {
      const mk = monthKey(data.fecha);
      const all = window.__lastExpenses || [];
      const gastado = all.filter(e => e.empresa === data.empresa && monthKey(e.fecha) === mk && e.id !== expense?.id)
                          .reduce((s, e) => s + Number(e.total || 0), 0);
      data.superaPresupuesto = (gastado + totalAbs > budget.monto);
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
      showToast('Error: ' + err.message, 'error', 5000);
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit ? 'Guardar cambios' : 'Guardar gasto';
    }
  });
}

function renderFormHtml(form, companies, events) {
  return `
    <div class="mb-16">
      <button class="btn btn-secondary btn-block" data-act="scan" type="button">
        📷 Añadir ticket (foto o PDF)
      </button>
      <small class="text-muted" style="display:block;margin-top:4px">
        Hasta ${MAX_FOTOS} imágenes por gasto
      </small>
    </div>

    <div id="tickets-gallery" class="tickets-gallery"></div>
    <input type="file" id="file-input" accept="image/*,application/pdf" multiple class="hidden">

    <div id="closed-alert"></div>
    <div id="dup-alert"></div>
    <div id="budget-alert"></div>

    <div id="abono-banner" class="alert alert-warning ${form.esAbono ? '' : 'hidden'}" style="font-size:13px">
      🔄 <strong>Abono/Devolución</strong> — los importes se guardarán en negativo
    </div>

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

    <div id="irpf-sugerencia"></div>

    <div class="field">
      <label>Concepto</label>
      <input class="input" type="text" name="concepto" value="${escapeHtml(form.concepto)}" placeholder="Descripción del gasto">
    </div>

    <div class="field">
      <label>Etiquetas <small class="text-muted">(opcional, pulsa Enter para añadir)</small></label>
      <div id="tags-wrap" class="tag-input-wrap"></div>
    </div>

    <h3 style="margin:16px 0 8px">Importes</h3>

    <div class="field-row">
      <div class="field">
        <label>Base imponible (€)</label>
        <input class="input" type="number" step="0.01" name="baseImponible" value="${form.baseImponible}">
      </div>
      <div class="field">
        <label>Tipo IVA</label>
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
        <label>Tipo IRPF</label>
        <select class="select" name="tipoIrpf">
          ${TIPOS_IRPF.map(v => `<option value="${v.value}" ${v.value === form.tipoIrpf ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label>IRPF retenido (€)</label>
        <input class="input" type="number" step="0.01" name="irpfTotal" value="${form.irpfTotal}">
      </div>
      <div class="field">
        <label style="display:flex;align-items:center;gap:6px;font-weight:normal;text-transform:none;letter-spacing:0">
          <input type="checkbox" id="f-recargo-check" ${form.recargoEquivalencia > 0 ? 'checked' : ''}>
          <span>Recargo equivalencia</span>
        </label>
        <input class="input" type="number" step="0.01" name="recargoEquivalencia" value="${form.recargoEquivalencia}" readonly style="background:var(--surface-2)">
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label>Propina (€)</label>
        <input class="input" type="number" step="0.01" name="propina" value="${form.propina}">
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
        <label>Empresa *</label>
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
      <label>Clave operación AEAT (modelo 303)</label>
      <select class="select" name="claveOperacion">
        ${CLAVES_OPERACION.map(c => `<option value="${c.value}" ${c.value === form.claveOperacion ? 'selected' : ''}>${c.label}</option>`).join('')}
      </select>
    </div>

    <div id="f-matricula-wrap" class="field hidden">
      <label>Matrícula del vehículo</label>
      <input class="input" type="text" name="matricula" value="${escapeHtml(form.matricula)}" placeholder="1234ABC" style="text-transform:uppercase">
      <small class="text-muted">Justifica el desplazamiento con el kilometraje cruzado</small>
    </div>

    <div id="f-hotel-wrap" class="${CATEGORIAS_HOTEL.includes(form.categoria) ? '' : 'hidden'}">
      <h3 style="margin:16px 0 8px;font-size:13px;color:var(--text-muted);text-transform:uppercase">Datos del alojamiento</h3>
      <div class="field-row">
        <div class="field">
          <label>Entrada</label>
          <input class="input" type="date" name="fechaEntrada" value="${form.fechaEntrada}">
        </div>
        <div class="field">
          <label>Salida</label>
          <input class="input" type="date" name="fechaSalida" value="${form.fechaSalida}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Noches</label>
          <input class="input" type="number" min="0" name="noches" value="${form.noches}">
        </div>
        <div class="field">
          <label>Habitación</label>
          <input class="input" type="text" name="habitacion" value="${escapeHtml(form.habitacion)}">
        </div>
      </div>
    </div>

    <details style="margin:12px 0">
      <summary style="cursor:pointer;font-size:13px;color:var(--text-muted)">Opciones avanzadas</summary>
      <div style="padding:10px 0">
        <label style="display:flex;align-items:center;gap:8px;font-weight:normal;text-transform:none;letter-spacing:0;margin-bottom:8px">
          <input type="checkbox" id="f-abono-check" ${form.esAbono ? 'checked' : ''}>
          <span>Es un abono/devolución (importes en negativo)</span>
        </label>
        <div class="field">
          <label>Nº factura rectificativa</label>
          <input class="input" type="text" name="numeroFacturaRectificativa" value="${escapeHtml(form.numeroFacturaRectificativa)}" placeholder="Para facturas de corrección">
        </div>
      </div>
    </details>

    <div class="field">
      <label>Notas</label>
      <textarea name="notas" rows="2" placeholder="Observaciones opcionales">${escapeHtml(form.notas)}</textarea>
    </div>
  `;
}
