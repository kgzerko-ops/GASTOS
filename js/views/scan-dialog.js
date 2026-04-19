// ═══════════════════════════════════════════════════════════════
// DIÁLOGO DE ESCANEO v2 — multi-IVA + confianza + validación
// ═══════════════════════════════════════════════════════════════

import { openModal, showToast, escapeHtml } from '../components/modal.js';
import { scanTicket, getOcrSettings } from '../ocr/index.js';
import { fmtEur } from '../utils/format.js';
import { checkCoherencia } from '../utils/sanitize.js';

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
      console.error('Error OCR:', err);
      const fullMsg = String(err?.message || err || 'Error desconocido');
      const stack = String(err?.stack || '').split('\n').slice(0, 3).join('\n');
      content.innerHTML = `
        <div class="alert alert-danger" style="margin-bottom:12px">
          <strong>⚠ Error en el OCR</strong>
        </div>
        <div class="field">
          <label>Mensaje de error completo</label>
          <textarea readonly rows="4" style="font-family:monospace;font-size:11px;width:100%">${escapeHtml(fullMsg + (stack ? '\n\n' + stack : ''))}</textarea>
        </div>
        <p class="text-muted" style="font-size:13px">
          Puedes continuar rellenando el formulario manualmente o reintentar el escaneo.
        </p>
        <p class="text-muted" style="font-size:12px">
          <strong>Diagnóstico rápido:</strong><br>
          · Si dice "HTTP 401" o "API key" → la clave Gemini está mal en Ajustes<br>
          · Si dice "HTTP 429" → has superado el límite gratis de Gemini (espera unos minutos)<br>
          · Si dice "HTTP 400" o "inline_data" → el archivo es demasiado grande o el formato no es válido<br>
          · Si dice "Failed to fetch" → problema de red / CORS
        </p>
      `;
      footer.innerHTML = `
        <button class="btn btn-secondary" data-act="copy">📋 Copiar error</button>
        <button class="btn btn-primary" data-act="ok">Continuar sin OCR</button>
      `;
      footer.querySelector('[data-act="copy"]').addEventListener('click', () => {
        navigator.clipboard.writeText(fullMsg + '\n\n' + stack);
        showToast('Error copiado', 'success');
      });
      footer.querySelector('[data-act="ok"]').addEventListener('click', () => {
        close();
        resolve({});
      });
    });

    function renderReview(ex) {
      // Líneas de IVA
      const lineas = (ex.lineasIva && ex.lineasIva.length > 0)
        ? ex.lineasIva
        : [{ tipoIva: ex.tipoIva ?? 21, baseImponible: ex.baseImponible || 0, ivaTotal: ex.ivaTotal || 0 }];

      const totalBase = lineas.reduce((s, l) => s + Number(l.baseImponible || 0), 0);
      const totalIva = lineas.reduce((s, l) => s + Number(l.ivaTotal || 0), 0);

      // Confianza y coherencia
      const coherencia = checkCoherencia(totalBase, totalIva, ex.irpfTotal || 0, ex.total);
      const confBadge = {
        alta: '<span class="badge badge-approved">CONFIANZA ALTA</span>',
        media: '<span class="badge badge-pending">CONFIANZA MEDIA</span>',
        baja: '<span class="badge badge-rejected">CONFIANZA BAJA</span>'
      }[ex.confianza || 'media'];

      content.innerHTML = `
        <div class="alert alert-success" style="margin-bottom:12px">
          <strong>✓ Datos extraídos.</strong> ${confBadge}<br>
          <small>Revisa y ajusta antes de aplicar.</small>
        </div>

        ${!coherencia.ok ? `
          <div class="alert alert-warning" style="font-size:12px">
            <strong>⚠ Revisa los importes:</strong> ${escapeHtml(coherencia.message)}
          </div>
        ` : ''}

        ${ex.esIntracomunitario ? `
          <div class="alert alert-info" style="font-size:12px">
            📦 Posible factura intracomunitaria (UE). Verifica el NIF y tipo de IVA.
          </div>
        ` : ''}

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

        <h3 style="margin:16px 0 6px;font-size:13px;color:var(--text-muted);text-transform:uppercase">
          Líneas de IVA ${lineas.length > 1 ? `<span class="badge" style="background:#eef2ff;color:#4338ca;font-size:10px">${lineas.length} TIPOS</span>` : ''}
        </h3>
        <div id="lineas-iva"></div>
        <button id="btn-add-linea" class="btn btn-secondary btn-sm btn-block" style="margin-bottom:12px">+ Añadir línea de IVA</button>

        <div class="field-row">
          <div class="field">
            <label>Tipo IRPF (%)</label>
            <select class="select" id="r-tirpf">
              ${[0,7,15,19].map(v => `<option value="${v}" ${v === (ex.tipoIrpf ?? 0) ? 'selected' : ''}>${v}%</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>IRPF retenido</label>
            <input class="input" type="number" step="0.01" id="r-irpf" value="${ex.irpfTotal || 0}">
          </div>
        </div>

        <div class="field">
          <label>TOTAL * <small class="text-muted">(importe pagado)</small></label>
          <input class="input" type="number" step="0.01" id="r-total" value="${ex.total || 0}" style="font-weight:700;font-size:18px">
        </div>

        <div id="r-resumen" class="alert alert-info" style="font-size:13px;margin-top:8px"></div>
      `;

      // Render dinámico de líneas
      const lineasEl = content.querySelector('#lineas-iva');
      let estadoLineas = lineas.map(l => ({ ...l }));
      function renderLineas() {
        lineasEl.innerHTML = estadoLineas.map((l, i) => `
          <div class="linea-iva" data-idx="${i}" style="display:grid;grid-template-columns:80px 1fr 1fr 30px;gap:6px;margin-bottom:6px;align-items:end">
            <div class="field" style="margin:0">
              ${i === 0 ? '<label style="font-size:10px">Tipo</label>' : ''}
              <select class="select" data-f="tipoIva" style="padding:6px">
                ${[0,4,10,21].map(v => `<option value="${v}" ${v === l.tipoIva ? 'selected' : ''}>${v}%</option>`).join('')}
              </select>
            </div>
            <div class="field" style="margin:0">
              ${i === 0 ? '<label style="font-size:10px">Base</label>' : ''}
              <input class="input" type="number" step="0.01" data-f="baseImponible" value="${l.baseImponible}" style="padding:6px">
            </div>
            <div class="field" style="margin:0">
              ${i === 0 ? '<label style="font-size:10px">Cuota IVA</label>' : ''}
              <input class="input" type="number" step="0.01" data-f="ivaTotal" value="${l.ivaTotal}" style="padding:6px">
            </div>
            <button class="btn-icon" data-act="del-linea" title="Quitar" style="background:transparent;border:none;color:var(--danger);cursor:pointer;padding:6px;font-size:18px">×</button>
          </div>
        `).join('');

        lineasEl.querySelectorAll('.linea-iva').forEach(row => {
          const idx = Number(row.dataset.idx);
          row.querySelectorAll('[data-f]').forEach(inp => {
            inp.addEventListener('input', () => {
              estadoLineas[idx][inp.dataset.f] = inp.dataset.f === 'tipoIva'
                ? parseInt(inp.value)
                : parseFloat(inp.value) || 0;
              // Auto-calcular IVA si cambia base o tipo
              if (inp.dataset.f !== 'ivaTotal') {
                const l = estadoLineas[idx];
                const cuota = Math.round(l.baseImponible * l.tipoIva) / 100;
                estadoLineas[idx].ivaTotal = cuota;
                row.querySelector('[data-f=ivaTotal]').value = cuota.toFixed(2);
              }
              updateResumen();
            });
          });
          row.querySelector('[data-act=del-linea]').addEventListener('click', () => {
            if (estadoLineas.length === 1) return showToast('Debe quedar al menos una línea', 'warning');
            estadoLineas.splice(idx, 1);
            renderLineas();
            updateResumen();
          });
        });
      }

      function updateResumen() {
        const base = estadoLineas.reduce((s, l) => s + (l.baseImponible || 0), 0);
        const iva = estadoLineas.reduce((s, l) => s + (l.ivaTotal || 0), 0);
        const irpf = parseFloat(content.querySelector('#r-irpf').value) || 0;
        const calc = base + iva - irpf;
        const total = parseFloat(content.querySelector('#r-total').value) || 0;
        const diff = Math.abs(calc - total);
        const ok = total > 0 ? (diff < 0.05 || diff / total < 0.05) : true;
        content.querySelector('#r-resumen').innerHTML = `
          Base: <strong>${fmtEur(base)}</strong> + IVA: <strong>${fmtEur(iva)}</strong>
          ${irpf > 0 ? ' − IRPF: <strong>' + fmtEur(irpf) + '</strong>' : ''}
          = <strong>${fmtEur(calc)}</strong>
          ${total > 0 && !ok ? `<br><span class="text-warning">⚠ No coincide con el total (${fmtEur(total)})</span>` : ''}
        `;
      }

      content.querySelector('#btn-add-linea').addEventListener('click', () => {
        estadoLineas.push({ tipoIva: 21, baseImponible: 0, ivaTotal: 0 });
        renderLineas();
        updateResumen();
      });
      content.querySelector('#r-total').addEventListener('input', updateResumen);
      content.querySelector('#r-irpf').addEventListener('input', updateResumen);
      content.querySelector('#r-tirpf').addEventListener('change', () => {
        const base = estadoLineas.reduce((s, l) => s + (l.baseImponible || 0), 0);
        const tirpf = parseFloat(content.querySelector('#r-tirpf').value) || 0;
        const irpf = Math.round(base * tirpf) / 100;
        content.querySelector('#r-irpf').value = irpf.toFixed(2);
        updateResumen();
      });

      renderLineas();
      updateResumen();

      footer.innerHTML = `
        <button class="btn btn-secondary" data-act="discard">Descartar</button>
        <button class="btn btn-primary" data-act="apply">Aplicar datos</button>
      `;
      footer.querySelector('[data-act="discard"]').addEventListener('click', () => {
        close();
        resolve({});
      });
      footer.querySelector('[data-act="apply"]').addEventListener('click', () => {
        // Dominante = línea con mayor base
        const dominante = estadoLineas.length > 0
          ? estadoLineas.reduce((a, b) => a.baseImponible > b.baseImponible ? a : b)
          : { tipoIva: 21, baseImponible: 0, ivaTotal: 0 };
        const baseTotal = estadoLineas.reduce((s, l) => s + (l.baseImponible || 0), 0);
        const ivaTotal = estadoLineas.reduce((s, l) => s + (l.ivaTotal || 0), 0);
        const out = {
          proveedor:       content.querySelector('#r-prov').value.trim(),
          nifProveedor:    content.querySelector('#r-nif').value.trim().toUpperCase(),
          fecha:           content.querySelector('#r-fecha').value,
          numeroDocumento: content.querySelector('#r-num').value.trim(),
          lineasIva:       estadoLineas.filter(l => l.baseImponible > 0 || l.ivaTotal > 0),
          // Compatibilidad con v2: enviamos también el dominante
          tipoIva:         dominante.tipoIva,
          baseImponible:   baseTotal,
          ivaTotal:        ivaTotal,
          tipoIrpf:        parseInt(content.querySelector('#r-tirpf').value) || 0,
          irpfTotal:       parseFloat(content.querySelector('#r-irpf').value) || 0,
          total:           parseFloat(content.querySelector('#r-total').value) || 0
        };
        close();
        resolve(out);
      });
    }
  });
}
