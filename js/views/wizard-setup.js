// ═══════════════════════════════════════════════════════════════
// SETUP WIZARD — Configuración inicial para admin nuevo
//
// Se lanza la primera vez que entra un admin y detecta que NO hay:
//   - Empresas configuradas
//   - Presupuesto configurado
//   - Otros usuarios
//
// 4 pasos:
//   1. Bienvenida + nombre de empresa principal
//   2. Configurar primer presupuesto mensual (opcional)
//   3. Invitar a colaboradores (opcional)
//   4. Recomendaciones de OCR + activar features sugeridas
// ═══════════════════════════════════════════════════════════════

import { openModal, showToast, escapeHtml } from '../components/modal.js';
import { saveBudget, getAllBudgets } from '../db.js';
import { isAdmin } from '../roles.js';
import { FEATURES, enableFeature, isFeatureEnabled } from '../utils/feature-flags.js';

const WIZARD_DONE_KEY = 'gastospro-wizard-completed';

export function isWizardCompleted() {
  return localStorage.getItem(WIZARD_DONE_KEY) === '1';
}

export function markWizardCompleted() {
  localStorage.setItem(WIZARD_DONE_KEY, '1');
}

export function resetWizard() {
  localStorage.removeItem(WIZARD_DONE_KEY);
}

/**
 * Comprueba si el wizard debe lanzarse (admin + no hay configuración + flag no marcada).
 *
 * @param {Object} state
 * @returns {Promise<boolean>}
 */
export async function shouldLaunchWizard(state) {
  if (!isAdmin(state.user)) return false;
  if (isWizardCompleted()) return false;
  // Si ya hay budgets configurados, asumimos que ya se configuró antes
  try {
    const budgets = await getAllBudgets();
    if (budgets && budgets.length > 0) {
      markWizardCompleted();
      return false;
    }
  } catch {
    // Si falla la lectura, no bloqueamos
  }
  return true;
}

/**
 * Lanza el wizard. Devuelve cuando el usuario lo completa o salta.
 */
export async function runSetupWizard(state) {
  const wizardData = {
    empresa: state.user.empresa || '',
    presupuesto: 0,
    invitarEmails: '',
    activarFeatures: true
  };

  // Paso 1
  const step1Result = await runStep1(wizardData);
  if (step1Result === 'skip') { markWizardCompleted(); return; }
  if (step1Result === null) return; // cancelado

  // Paso 2
  const step2Result = await runStep2(wizardData);
  if (step2Result === 'skip') { markWizardCompleted(); return; }
  if (step2Result === null) return;

  // Paso 3
  const step3Result = await runStep3(wizardData);
  if (step3Result === 'skip') { markWizardCompleted(); return; }
  if (step3Result === null) return;

  // Paso 4
  await runStep4(wizardData, state);
  markWizardCompleted();
}

function wizardModalShell(title, current, total, bodyHtml, opts = {}) {
  return new Promise((resolve) => {
    const ctaPrimary = opts.ctaPrimary || 'Siguiente';
    const ctaSecondary = opts.ctaSecondary || 'Saltar';

    const { close, content, footer } = openModal(title, {
      footer: `
        <button class="btn btn-link" data-act="skip" style="margin-right:auto">${ctaSecondary}</button>
        ${opts.ctaBack ? '<button class="btn btn-secondary" data-act="back">Atrás</button>' : ''}
        <button class="btn btn-primary" data-act="next">${ctaPrimary}</button>
      `
    });

    const dotsHtml = Array.from({ length: total }).map((_, i) => `
      <div style="width:8px;height:8px;border-radius:50%;background:${i < current ? '#1e40af' : '#cbd5e1'}"></div>
    `).join('');

    content.innerHTML = `
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;font-weight:600;margin-bottom:8px">
          Paso ${current} de ${total}
        </div>
        <div style="display:flex;justify-content:center;gap:6px">${dotsHtml}</div>
      </div>
      ${bodyHtml}
    `;

    footer.querySelector('[data-act="next"]').addEventListener('click', () => {
      const data = {};
      content.querySelectorAll('[data-collect]').forEach(el => {
        data[el.dataset.collect] = el.value;
      });
      close();
      resolve({ action: 'next', data });
    });
    footer.querySelector('[data-act="skip"]').addEventListener('click', () => {
      close();
      resolve('skip');
    });
  });
}

async function runStep1(wizardData) {
  const result = await wizardModalShell(
    '👋 Configuración inicial',
    1, 4,
    `
    <p style="color:#475569;font-size:14px;margin:0 0 16px;line-height:1.6">
      Vamos a configurar tu instalación de GastósPro en menos de 1 minuto.
      Empezamos con el nombre de tu empresa principal.
    </p>
    <div class="field">
      <label>Nombre de tu empresa</label>
      <input class="input" data-collect="empresa" value="${escapeHtml(wizardData.empresa)}" placeholder="Mi Empresa S.L.">
    </div>
    <p style="font-size:12px;color:#94a3b8;margin:8px 0 0">
      Más adelante puedes añadir más empresas en el panel de Usuarios.
    </p>
    `
  );
  if (result === 'skip') return 'skip';
  if (!result || !result.data) return null;
  wizardData.empresa = result.data.empresa || wizardData.empresa;
  return 'ok';
}

async function runStep2(wizardData) {
  const result = await wizardModalShell(
    '💰 Presupuesto mensual',
    2, 4,
    `
    <p style="color:#475569;font-size:14px;margin:0 0 16px;line-height:1.6">
      ¿Cuánto puede gastar <strong>${escapeHtml(wizardData.empresa)}</strong> al mes?
      Cuando se acerque al 80% recibirás un aviso.
    </p>
    <div class="field">
      <label>Presupuesto mensual (€)</label>
      <input class="input" type="number" step="100" data-collect="presupuesto" value="${wizardData.presupuesto || ''}" placeholder="3000">
    </div>
    <p style="font-size:12px;color:#94a3b8;margin:8px 0 0">
      Puedes dejarlo en blanco y configurarlo después en la pestaña Presupuestos.
    </p>
    `
  );
  if (result === 'skip') return 'skip';
  if (!result || !result.data) return null;
  wizardData.presupuesto = parseFloat(result.data.presupuesto) || 0;

  if (wizardData.presupuesto > 0 && wizardData.empresa) {
    try {
      await saveBudget(wizardData.empresa, wizardData.presupuesto);
      showToast(`Presupuesto guardado: ${wizardData.presupuesto} €/mes`, 'success', 2000);
    } catch (err) {
      showToast('Presupuesto no guardado: ' + err.message, 'warning', 3000);
    }
  }
  return 'ok';
}

async function runStep3(wizardData) {
  const result = await wizardModalShell(
    '👥 Equipo',
    3, 4,
    `
    <p style="color:#475569;font-size:14px;margin:0 0 16px;line-height:1.6">
      ¿Quieres invitar a más usuarios? Cuando se registren con su email,
      podrás activarlos desde la pestaña <strong>Usuarios</strong>.
    </p>
    <div class="field">
      <label>Emails (separados por coma, opcional)</label>
      <textarea class="input" rows="3" data-collect="invitarEmails" placeholder="juan@empresa.com, maria@empresa.com"></textarea>
    </div>
    <p style="font-size:12px;color:#94a3b8;margin:8px 0 0">
      Solo es para tu referencia. GastósPro no envía emails automáticos.
      Comparte el enlace de la app manualmente con tu equipo.
    </p>
    `
  );
  if (result === 'skip') return 'skip';
  if (!result || !result.data) return null;
  wizardData.invitarEmails = result.data.invitarEmails || '';
  return 'ok';
}

async function runStep4(wizardData, state) {
  const result = await wizardModalShell(
    '🚀 Listo',
    4, 4,
    `
    <p style="color:#475569;font-size:14px;margin:0 0 16px;line-height:1.6">
      Tu instalación está casi a punto. Te recomendamos activar estas funciones
      para mejorar la experiencia:
    </p>
    <ul style="font-size:14px;line-height:1.8;color:#475569;padding-left:20px;margin:0 0 16px">
      <li>📌 Memoria de proveedores</li>
      <li>✓ Validación de NIF reforzada</li>
      <li>📷 Pre-procesado de imagen</li>
      <li>📱 Detección móvil automática</li>
    </ul>
    <label style="display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:16px">
      <input type="checkbox" data-collect="activarFeatures" checked value="1">
      <span>Activar funciones recomendadas</span>
    </label>

    <div class="alert alert-info" style="font-size:13px">
      💡 <strong>Tip:</strong> Para escanear tickets con la mejor calidad,
      configura tu API key gratuita de Gemini en <strong>Ajustes</strong>.
    </div>
    `,
    { ctaPrimary: 'Empezar a usar', ctaSecondary: 'Cerrar' }
  );

  // Activar features recomendadas si el usuario lo deja marcado
  const checkbox = document.querySelector('[data-collect="activarFeatures"]');
  if (!result || result === 'skip' || !checkbox || checkbox.checked) {
    enableFeature(FEATURES.VENDOR_MEMORY);
    enableFeature(FEATURES.NIF_VALIDATION);
    enableFeature(FEATURES.IMAGE_PREPROCESS);
    enableFeature(FEATURES.DEVICE_DETECT);
    showToast('Funciones recomendadas activadas', 'success', 3000);
  }
}
