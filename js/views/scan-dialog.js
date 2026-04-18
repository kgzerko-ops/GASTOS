// ═══════════════════════════════════════════════════════════════
// DIÁLOGO DE ESCANEO — muestra progreso del OCR y permite editar antes de aplicar
// ═══════════════════════════════════════════════════════════════

import { openModal, showToast, escapeHtml } from '../components/modal.js';
import { scanTicket, getOcrSettings } from '../ocr/index.js';
import { fmtEur } from '../utils/format.js';

/**
 * Abre el modal de escaneo. Retorna los campos extraídos o null si cancela.
 */
export async function openScanDialog(file) {
  return new Promise((resolve) => {
    const { close, content, footer } = openModal('Escaneando ticket', {
      footer: `<button class="btn btn-secondary" data-act="cancel">Cancelar</button>`
    });

    const settings = getOcrSettings();

    content.innerHTML = `
      <div class="scan-progress">
        <div class="spinner"></div>
        <p id="scan-status">Iniciando…</p>
        <div class="progress-bar"><div class="progress-bar-fill" id="scan-bar" style="width:0%"></div></div>
        <p class="text-muted" style="font-size:12px">Motor: ${settings.provider || 'tesseract'}</p>
      </div>
    `;

    const bar = content.querySelector('#scan-bar');
    const status = content.querySelector('#scan-status');
    let cancelled = false;

    footer.querySelector('[data-act="cancel"]').addEventListener('click', () => {
      cancelled = true;
      close();
      resolve(null);
    });

    scanTicket(file, ({ status: s, progress }) => {
      if (cancelled) return;
      status.textContent = s;
      bar.style.width = Math.round(progress * 100) + '%';
    }).then((extracted) => {
      if (cancelled) return;
      renderReview(extracted);
    }).catch((err) => {
      if (cancelled) return;
      console.error(err);
      content.innerHTML = `
        <div class="alert alert-danger">
          <strong>Error en el OCR</strong><br>${escapeHtml(err.message)}
        </div>
        <p class="text-muted" style="font-size:13px">Puedes continuar rellenando el formulario manualmente.</p>
      `;
      footer.innerHTML = `<button class="btn btn-primary" data-act="ok">Continuar</button>`;
      footer.querySelector('[data-act="ok"]').addEventListener('click', () => {
        close();
        resolve({});
      });
    });

    function renderReview(ex) {
      content.innerHTML = `
        <div class="alert alert-success"><strong>✓ Datos extraídos.</strong> Revisa y ajusta antes de aplicar.</div>
        <div class="field">
          <label>Proveedor</label>
          <input class="input" id="r-prov" value="${escapeHtml(ex.proveedor || '')}">
        </div>
        <div class="field-row">
          <div class="field">
            <label>NIF/CIF</label>
            <input class="input" id="r-nif" value="${escapeHtml(ex.nifProveedor || '')}">
          </div>
          <div class="field">
            <label>Fecha</label>
            <input class="input" type="date" id="r-fecha" value="${ex.fecha || ''}">
          </div>
        </div>
        <div class="field">
          <label>Nº documento</label>
          <input class="input" id="r-num" value="${escapeHtml(ex.numeroDocumento || '')}">
        </div>
        <div class="field-row">
          <div class="field">
            <label>Base imponible</label>
            <input class="input" type="number" step="0.01" id="r-base" value="${ex.baseImponible || 0}">
          </div>
          <div class="field">
            <label>Tipo IVA (%)</label>
            <select class="select" id="r-tiva">
              ${[0,4,10,21].map(v => `<option value="${v}" ${v === (ex.tipoIva ?? 21) ? 'selected' : ''}>${v}%</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>IVA total</label>
            <input class="input" type="number" step="0.01" id="r-iva" value="${ex.ivaTotal || 0}">
          </div>
          <div class="field">
            <label>TOTAL</label>
            <input class="input" type="number" step="0.01" id="r-total" value="${ex.total || 0}" style="font-weight:700">
          </div>
        </div>
      `;
      footer.innerHTML = `
        <button class="btn btn-secondary" data-act="discard">Descartar</button>
        <button class="btn btn-primary" data-act="apply">Aplicar datos</button>
      `;
      footer.querySelector('[data-act="discard"]').addEventListener('click', () => {
        close();
        resolve({});
      });
      footer.querySelector('[data-act="apply"]').addEventListener('click', () => {
        const out = {
          proveedor:       content.querySelector('#r-prov').value.trim(),
          nifProveedor:    content.querySelector('#r-nif').value.trim().toUpperCase(),
          fecha:           content.querySelector('#r-fecha').value,
          numeroDocumento: content.querySelector('#r-num').value.trim(),
          baseImponible:   parseFloat(content.querySelector('#r-base').value) || 0,
          tipoIva:         parseInt(content.querySelector('#r-tiva').value) || 21,
          ivaTotal:        parseFloat(content.querySelector('#r-iva').value) || 0,
          total:           parseFloat(content.querySelector('#r-total').value) || 0
        };
        close();
        resolve(out);
      });
    }
  });
}
