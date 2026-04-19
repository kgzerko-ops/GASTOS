// ═══════════════════════════════════════════════════════════════
// LIBRO IVA — UI trimestral
// ═══════════════════════════════════════════════════════════════

import { subscribeExpenses } from '../db.js';
import { exportLibroIva } from '../utils/iva-book.js';
import { showToast, escapeHtml } from '../components/modal.js';
import { fmtEur } from '../utils/format.js';
import { isAdmin } from '../roles.js';

let unsub = null;

export async function renderIvaBook(container, state) {
  if (!isAdmin(state.user)) {
    container.innerHTML = `<div class="alert alert-danger">Solo el administrador puede generar el libro IVA.</div>`;
    return;
  }
  if (unsub) { unsub(); unsub = null; }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentTrim = Math.floor(now.getMonth() / 3) + 1;

  container.innerHTML = `
    <h2 style="margin:0 0 4px">Libro IVA soportado</h2>
    <p class="text-muted" style="margin:0 0 16px;font-size:13px">
      Excel trimestral para la gestoría con 3 hojas: Facturas recibidas, Resumen por IVA, Casillas modelo 303.
      <strong>Solo incluye gastos aprobados.</strong>
    </p>

    <div class="card mb-16">
      <div class="field-row">
        <div class="field">
          <label>Empresa</label>
          <select id="iva-empresa" class="select"><option value="">Todas</option></select>
        </div>
        <div class="field">
          <label>Año</label>
          <select id="iva-year" class="select">
            ${Array.from({length:5}, (_,i) => currentYear - i).map(y =>
              `<option value="${y}" ${y===currentYear?'selected':''}>${y}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label>Trimestre</label>
        <div style="display:flex;gap:6px">
          ${[1,2,3,4].map(t => `
            <button class="btn ${t===currentTrim?'btn-primary':'btn-secondary'} btn-sm iva-trim" data-t="${t}" style="flex:1">
              T${t} — ${['Ene-Mar','Abr-Jun','Jul-Sep','Oct-Dic'][t-1]}
            </button>`).join('')}
        </div>
      </div>
      <div id="iva-preview" class="alert alert-info">Selecciona período.</div>
      <button id="btn-gen" class="btn btn-primary btn-block">⬇ Descargar Libro IVA (Excel)</button>
    </div>
  `;

  let allExpenses = [];
  let selectedTrim = currentTrim;
  let selectedYear = currentYear;
  let selectedEmpresa = '';

  container.querySelectorAll('.iva-trim').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.iva-trim').forEach(b => {
        b.classList.remove('btn-primary'); b.classList.add('btn-secondary');
      });
      btn.classList.remove('btn-secondary'); btn.classList.add('btn-primary');
      selectedTrim = parseInt(btn.dataset.t, 10);
      updatePreview();
    });
  });
  container.querySelector('#iva-year').addEventListener('change', (e) => {
    selectedYear = parseInt(e.target.value, 10); updatePreview();
  });
  container.querySelector('#iva-empresa').addEventListener('change', (e) => {
    selectedEmpresa = e.target.value; updatePreview();
  });

  unsub = subscribeExpenses(state.user, (docs) => {
    allExpenses = docs;
    const empresas = [...new Set(docs.map(d => d.empresa).filter(Boolean))].sort();
    const sel = container.querySelector('#iva-empresa');
    const cur = sel.value;
    sel.innerHTML = `<option value="">Todas</option>` +
      empresas.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('');
    sel.value = cur;
    updatePreview();
  });

  function updatePreview() {
    const box = container.querySelector('#iva-preview');
    const startMonth = (selectedTrim - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const filt = allExpenses.filter(e => {
      if (e.estado !== 'aprobado') return false;
      if (selectedEmpresa && e.empresa !== selectedEmpresa) return false;
      const d = new Date(e.fecha);
      return d.getFullYear() === selectedYear && d.getMonth() + 1 >= startMonth && d.getMonth() + 1 <= endMonth;
    });
    const base = filt.reduce((s, e) => s + Number(e.baseImponible || 0), 0);
    const iva = filt.reduce((s, e) => s + Number(e.ivaTotal || 0), 0);
    const total = filt.reduce((s, e) => s + Number(e.total || 0), 0);
    const pendientes = allExpenses.filter(e => {
      if (e.estado === 'aprobado') return false;
      if (selectedEmpresa && e.empresa !== selectedEmpresa) return false;
      const d = new Date(e.fecha);
      return d.getFullYear() === selectedYear && d.getMonth() + 1 >= startMonth && d.getMonth() + 1 <= endMonth;
    }).length;
    box.innerHTML = `
      <strong>${filt.length}</strong> facturas aprobadas — ${selectedYear} T${selectedTrim}
      ${selectedEmpresa ? ' · ' + escapeHtml(selectedEmpresa) : ''}<br>
      Base: <strong>${fmtEur(base)}</strong> · IVA: <strong>${fmtEur(iva)}</strong> · Total: <strong>${fmtEur(total)}</strong>
      ${pendientes > 0 ? `<br><span class="text-warning">⚠ ${pendientes} gastos no aprobados NO se incluirán.</span>` : ''}
    `;
  }

  container.querySelector('#btn-gen').addEventListener('click', async () => {
    try {
      await exportLibroIva(allExpenses, { empresa: selectedEmpresa, year: selectedYear, trimestre: selectedTrim });
      showToast('Libro IVA descargado', 'success');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  });
}
