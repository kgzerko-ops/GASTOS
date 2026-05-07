// ═══════════════════════════════════════════════════════════════
// TUTORIAL — Tour guiado para usuarios nuevos
//
// Se lanza en el primer login (controlado por localStorage).
// 4 pasos breves que muestran las funciones principales.
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'gastospro-tutorial-completed';

const STEPS = [
  {
    title: '👋 Bienvenido a GastósPro',
    body: 'Vas a aprender en 30 segundos cómo cargar tu primer gasto. Es muy rápido.',
    cta: 'Empezar',
    target: null
  },
  {
    title: '📷 Foto del ticket',
    body: 'Pulsa el botón <strong>+</strong> abajo a la derecha para crear un gasto. Saca foto al ticket o sube una imagen.',
    cta: 'Siguiente',
    target: '#fab-new-expense',
    spotlight: true
  },
  {
    title: '🤖 Auto-rellenado',
    body: 'El OCR extrae proveedor, NIF, fecha, IVA y total automáticamente. Tú solo revisas y confirmas.',
    cta: 'Siguiente',
    target: null
  },
  {
    title: '📊 Panel y reportes',
    body: 'En la pestaña <strong>Panel</strong> ves el resumen del mes. En <strong>Gastos</strong>, todo el histórico con filtros.',
    cta: 'Siguiente',
    target: '.tabs',
    spotlight: true
  },
  {
    title: '✅ Listo',
    body: 'Si tienes dudas, en <strong>Ajustes</strong> puedes ver tu rol, configurar el OCR y más. ¡A por el primer ticket!',
    cta: 'Empezar a usar',
    target: null
  }
];

export function isTutorialCompleted() {
  return localStorage.getItem(STORAGE_KEY) === '1';
}

export function markTutorialCompleted() {
  localStorage.setItem(STORAGE_KEY, '1');
}

export function resetTutorial() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Lanza el tutorial. Devuelve una promesa que resuelve cuando termina.
 *
 * @param {Object} opts - { force: bool } - si true, ignora el flag
 * @returns {Promise<void>}
 */
export async function runTutorial(opts = {}) {
  if (!opts.force && isTutorialCompleted()) return;

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    await showStep(step, i + 1, STEPS.length);
  }

  markTutorialCompleted();
}

function showStep(step, current, total) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'tutorial-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.7);
      z-index: 3000; display: flex; align-items: center; justify-content: center;
      padding: 20px; animation: fadeIn 0.2s;
    `;

    let spotlightHtml = '';
    if (step.target && step.spotlight) {
      const el = document.querySelector(step.target);
      if (el) {
        const rect = el.getBoundingClientRect();
        spotlightHtml = `
          <div style="
            position:fixed;
            top:${rect.top - 6}px; left:${rect.left - 6}px;
            width:${rect.width + 12}px; height:${rect.height + 12}px;
            border-radius:12px;
            box-shadow: 0 0 0 4px #4ade80, 0 0 0 9999px rgba(15,23,42,0.7);
            pointer-events: none;
            animation: pulse 1.5s infinite;
            z-index: 3001;
          "></div>
          <style>
            @keyframes pulse {
              0%, 100% { box-shadow: 0 0 0 4px #4ade80, 0 0 0 9999px rgba(15,23,42,0.7); }
              50% { box-shadow: 0 0 0 8px #22c55e, 0 0 0 9999px rgba(15,23,42,0.7); }
            }
          </style>
        `;
        overlay.style.background = 'transparent';
      }
    }

    overlay.innerHTML = `
      ${spotlightHtml}
      <div style="
        background: white; padding: 24px; border-radius: 16px;
        max-width: 380px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        position: relative; z-index: 3002;
      ">
        <div style="
          font-size: 11px; color: #64748b; text-transform: uppercase;
          letter-spacing: 0.05em; font-weight: 600; margin-bottom: 8px;
        ">Paso ${current} de ${total}</div>

        <h2 style="margin: 0 0 12px; font-size: 20px; color: #0f172a">${step.title}</h2>
        <p style="margin: 0 0 20px; color: #475569; font-size: 14px; line-height: 1.6">${step.body}</p>

        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px">
          <button id="tut-skip" style="
            background: transparent; border: none; color: #94a3b8;
            font-size: 13px; cursor: pointer; padding: 8px;
          ">Saltar tutorial</button>
          <button id="tut-next" style="
            background: #1e40af; color: white; border: none;
            padding: 10px 20px; border-radius: 8px; font-weight: 600;
            cursor: pointer; font-size: 14px;
          ">${step.cta}</button>
        </div>

        <div style="
          display: flex; gap: 4px; margin-top: 16px; justify-content: center;
        ">
          ${Array.from({ length: total }).map((_, i) => `
            <div style="
              width: 6px; height: 6px; border-radius: 50%;
              background: ${i < current ? '#1e40af' : '#cbd5e1'};
            "></div>
          `).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = (skipped) => {
      try { document.body.removeChild(overlay); } catch {}
      if (skipped) {
        markTutorialCompleted();
        // Saltar todos los pasos restantes
        const stop = new Error('skipped');
        stop._skipped = true;
        // Simplemente resolvemos y dejamos que el for termine naturalmente
      }
      resolve();
    };

    overlay.querySelector('#tut-next').addEventListener('click', () => close(false));
    overlay.querySelector('#tut-skip').addEventListener('click', () => {
      // Saltar todo: marcar como completado y resolver inmediatamente
      markTutorialCompleted();
      close(true);
    });
  });
}
