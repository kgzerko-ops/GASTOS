// ═══════════════════════════════════════════════════════════════
// KILOMETRAJE — gasto especial con auto-cálculo
// Tarifa por defecto: 0,26 €/km (Orden HFP/792/2023)
// ═══════════════════════════════════════════════════════════════

import { openModal, showToast, escapeHtml } from '../components/modal.js';
import { createExpense } from '../db.js';
import { todayIso, fmtEur } from '../utils/format.js';
import { availableCompanies } from '../roles.js';

const TARIFA_DEFAULT = 0.26;
const STORAGE_KEY = 'gastospro-mileage-rate';

function getStoredRate() {
  const v = parseFloat(localStorage.getItem(STORAGE_KEY));
  return isNaN(v) || v <= 0 ? TARIFA_DEFAULT : v;
}

export function openMileageDialog(state, onSaved) {
  const user = state.user;
  const companies = availableCompanies(user);
  if (companies.length === 0) companies.push(user.empresa || 'Mi Empresa');
  const rate = getStoredRate();

  const { close, content, footer } = openModal('Nuevo gasto — Kilometraje', {
    footer: `
      <button class="btn btn-secondary" data-act="cancel">Cancelar</button>
      <button class="btn btn-primary" data-act="save">Guardar</button>
    `
  });

  content.innerHTML = `
    <div class="alert alert-info" style="font-size:13px">
      💡 Kilometraje exento de IRPF hasta <strong>0,26 €/km</strong> desde julio 2023 (Orden HFP/792/2023).
    </div>

    <div class="field">
      <label>Fecha *</label>
      <input class="input" type="date" name="fecha" value="${todayIso()}" required>
    </div>

    <div class="field">
      <label>Empresa *</label>
      <select class="select" name="empresa">
        ${companies.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('')}
      </select>
    </div>

    <div class="field-row">
      <div class="field">
        <label>Origen</label>
        <input class="input" name="origen" placeholder="Madrid">
      </div>
      <div class="field">
        <label>Destino</label>
        <input class="input" name="destino" placeholder="Barcelona">
      </div>
    </div>

    <div class="field">
      <label>Motivo del desplazamiento</label>
      <input class="input" name="motivo" placeholder="Visita cliente, obra, formación…">
    </div>

    <div class="field-row">
      <div class="field">
        <label>Km recorridos *</label>
        <input class="input" type="number" step="0.1" min="0" name="km" value="0" required>
      </div>
      <div class="field">
        <label>Tarifa (€/km)</label>
        <input class="input" type="number" step="0.01" name="tarifa" value="${rate}">
        <small class="text-muted">Se guarda como preferencia</small>
      </div>
    </div>

    <div class="field">
      <label style="display:flex;align-items:center;gap:8px;font-weight:normal;text-transform:none;letter-spacing:0">
        <input type="checkbox" name="ida_vuelta">
        <span>Duplicar kilometraje (ida + vuelta)</span>
      </label>
    </div>

    <div id="mileage-summary" class="alert alert-info" style="font-size:14px">
      Total: <strong>0,00 €</strong>
    </div>
  `;

  const $ = (sel) => content.querySelector(sel);
  const updateTotal = () => {
    let km = parseFloat($('[name=km]').value) || 0;
    const tarifa = parseFloat($('[name=tarifa]').value) || 0;
    if ($('[name=ida_vuelta]').checked) km *= 2;
    const total = km * tarifa;
    $('#mileage-summary').innerHTML = `
      ${km.toFixed(1)} km × ${tarifa.toFixed(2)} €/km = <strong>${fmtEur(total)}</strong>
      ${$('[name=ida_vuelta]').checked ? ' <em style="font-size:12px">(ida+vuelta)</em>' : ''}
    `;
  };
  ['km','tarifa','ida_vuelta'].forEach(n => {
    $(`[name=${n}]`).addEventListener('input', updateTotal);
    $(`[name=${n}]`).addEventListener('change', updateTotal);
  });

  footer.querySelector('[data-act=cancel]').addEventListener('click', close);
  footer.querySelector('[data-act=save]').addEventListener('click', async () => {
    let km = parseFloat($('[name=km]').value) || 0;
    const tarifa = parseFloat($('[name=tarifa]').value) || 0;
    if ($('[name=ida_vuelta]').checked) km *= 2;
    const total = +(km * tarifa).toFixed(2);
    if (km <= 0 || total <= 0) return showToast('Indica los km recorridos', 'error');

    localStorage.setItem(STORAGE_KEY, String(tarifa));

    const origen = $('[name=origen]').value.trim();
    const destino = $('[name=destino]').value.trim();
    const motivo = $('[name=motivo]').value.trim();

    const proveedor = [origen, destino].filter(Boolean).join(' → ') || 'Kilometraje';
    const concepto = [motivo, `${km.toFixed(1)} km × ${tarifa} €`].filter(Boolean).join(' — ');

    const data = {
      fecha: $('[name=fecha]').value,
      proveedor,
      nifProveedor: '',
      concepto,
      categoria: 'Transporte',
      empresa: $('[name=empresa]').value,
      formaPago: 'Kilometraje',
      baseImponible: total,
      tipoIva: 0,
      ivaTotal: 0,
      tipoIrpf: 0,
      irpfTotal: 0,
      total,
      numeroDocumento: '',
      estado: 'pendiente',
      isKilometraje: true,
      kmRecorridos: km,
      tarifaKm: tarifa,
      origen,
      destino,
      ticketUrls: [],
      createdByUid: user.uid,
      createdByEmail: user.email,
      createdByName: user.displayName || user.email
    };

    const btn = footer.querySelector('[data-act=save]');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await createExpense(data);
      close();
      onSaved?.();
      showToast('Kilometraje guardado', 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
      btn.disabled = false; btn.textContent = 'Guardar';
    }
  });

  updateTotal();
}
