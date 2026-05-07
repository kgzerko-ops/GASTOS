// ═══════════════════════════════════════════════════════════════
// PANTALLA EXPERIMENTAL — Activar/desactivar features
//
// Solo visible para admin. Cada toggle activa una feature flag
// que controla si una mejora se ejecuta o no.
//
// Si una feature da problemas, se desactiva sin redeploy.
// ═══════════════════════════════════════════════════════════════

import {
  FEATURES, FEATURE_LABELS, isFeatureEnabled, enableFeature, disableFeature, getAllFlags
} from '../utils/feature-flags.js';
import { getDeviceType, isTouchDevice, isSmallViewport } from '../utils/device.js';
import { showToast, escapeHtml } from '../components/modal.js';
import { isAdmin } from '../roles.js';

export async function renderExperimental(container, state) {
  if (!isAdmin(state.user)) {
    container.innerHTML = `
      <div class="card">
        <h2>Acceso restringido</h2>
        <p class="text-muted">Esta pantalla solo está disponible para administradores.</p>
      </div>
    `;
    return;
  }

  const flags = getAllFlags();
  const deviceInfo = `${getDeviceType()} · viewport ${window.innerWidth}px · ${isTouchDevice() ? 'táctil' : 'no táctil'}`;

  const featuresHtml = Object.values(FEATURES).map(f => {
    const label = FEATURE_LABELS[f] || { name: f, desc: '' };
    const enabled = !!flags[f];
    return `
      <div class="exp-feature" data-feature="${f}">
        <div class="exp-feature-info">
          <div class="exp-feature-name">${escapeHtml(label.name)}</div>
          <div class="exp-feature-desc">${escapeHtml(label.desc)}</div>
        </div>
        <label class="exp-toggle">
          <input type="checkbox" data-toggle="${f}" ${enabled ? 'checked' : ''}>
          <span class="exp-slider"></span>
        </label>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <h2 style="margin:0 0 8px">🧪 Experimental</h2>
    <p class="text-muted" style="font-size:13px;margin:0 0 16px">
      Funciones nuevas en pruebas. Activa una a una y prueba el comportamiento.
      Si algo falla, se desactiva automáticamente o puedes apagarla aquí.
    </p>

    <div class="card mb-16">
      <h3>Tu dispositivo</h3>
      <p style="font-size:13px;margin:0;font-family:ui-monospace,monospace">
        ${escapeHtml(deviceInfo)}
      </p>
    </div>

    <div class="card mb-16">
      <h3>Features disponibles</h3>
      <div class="exp-list">
        ${featuresHtml}
      </div>
    </div>

    <div class="card">
      <h3>Acciones rápidas</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" id="exp-enable-all">Activar todas</button>
        <button class="btn btn-secondary btn-sm" id="exp-disable-all">Desactivar todas</button>
        <button class="btn btn-secondary btn-sm" id="exp-recommended">Activar recomendadas</button>
      </div>
      <p class="text-muted" style="font-size:12px;margin:12px 0 0">
        Recomendadas: memoria de proveedores, validación NIF, detección de dispositivo, pre-procesar imagen.
      </p>
    </div>

    <style>
      .exp-list { display: flex; flex-direction: column; gap: 4px; }
      .exp-feature {
        display: flex; justify-content: space-between; align-items: center;
        padding: 12px 0; border-bottom: 1px solid var(--border); gap: 16px;
      }
      .exp-feature:last-child { border-bottom: none; }
      .exp-feature-info { flex: 1; }
      .exp-feature-name { font-weight: 600; font-size: 14px; margin-bottom: 2px; }
      .exp-feature-desc { font-size: 12px; color: var(--text-muted); line-height: 1.4; }
      .exp-toggle { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
      .exp-toggle input { opacity: 0; width: 0; height: 0; }
      .exp-slider {
        position: absolute; cursor: pointer; inset: 0;
        background: var(--border); border-radius: 100px; transition: .2s;
      }
      .exp-slider::before {
        content: ''; position: absolute; height: 18px; width: 18px;
        left: 3px; top: 3px; background: white; border-radius: 50%; transition: .2s;
      }
      .exp-toggle input:checked + .exp-slider { background: var(--success); }
      .exp-toggle input:checked + .exp-slider::before { transform: translateX(20px); }
    </style>
  `;

  container.querySelectorAll('[data-toggle]').forEach(input => {
    input.addEventListener('change', (e) => {
      const feature = e.target.dataset.toggle;
      if (e.target.checked) {
        enableFeature(feature);
        showToast(`Feature activada: ${FEATURE_LABELS[feature]?.name || feature}`, 'success');
      } else {
        disableFeature(feature);
        showToast(`Feature desactivada: ${FEATURE_LABELS[feature]?.name || feature}`, 'info');
      }
    });
  });

  container.querySelector('#exp-enable-all').addEventListener('click', () => {
    Object.values(FEATURES).forEach(f => enableFeature(f));
    showToast('Todas las features activadas', 'success');
    renderExperimental(container, state);
  });

  container.querySelector('#exp-disable-all').addEventListener('click', () => {
    Object.values(FEATURES).forEach(f => disableFeature(f));
    showToast('Todas las features desactivadas', 'info');
    renderExperimental(container, state);
  });

  container.querySelector('#exp-recommended').addEventListener('click', () => {
    [
      FEATURES.VENDOR_MEMORY,
      FEATURES.NIF_VALIDATION,
      FEATURES.DEVICE_DETECT,
      FEATURES.IMAGE_PREPROCESS
    ].forEach(f => enableFeature(f));
    showToast('Features recomendadas activadas', 'success');
    renderExperimental(container, state);
  });
}
