// ═══════════════════════════════════════════════════════════════
// CAMERA HELPER — Apertura de cámara nativa con guías visuales
//
// En móvil, abre la cámara directamente con un overlay que muestra
// un rectángulo guía para encuadrar el ticket bien.
//
// En escritorio, abre el selector de archivos normal.
// ═══════════════════════════════════════════════════════════════

import { shouldUseMobileUx } from './device.js';

/**
 * Abre el input file con `capture="environment"` en móvil.
 * Devuelve una promesa que resuelve con el File seleccionado.
 *
 * @param {Object} opts - { showGuide: bool, accept: string }
 * @returns {Promise<File|null>}
 */
export function openCameraOrPicker(opts = {}) {
  const accept = opts.accept || 'image/*,application/pdf';
  const useCamera = shouldUseMobileUx() && opts.preferCamera !== false;

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (useCamera) {
      input.setAttribute('capture', 'environment'); // cámara trasera
    }
    input.style.display = 'none';
    document.body.appendChild(input);

    let resolved = false;
    const cleanup = () => {
      try { document.body.removeChild(input); } catch {}
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0] || null;
      cleanup();
      resolved = true;
      resolve(file);
    });

    // Si el usuario cancela, no hay evento change. Usamos focus como heurística.
    window.addEventListener('focus', () => {
      setTimeout(() => {
        if (!resolved) {
          cleanup();
          resolved = true;
          resolve(null);
        }
      }, 500);
    }, { once: true });

    input.click();
  });
}

/**
 * Muestra un overlay con guía visual ANTES de abrir la cámara.
 * Útil para usuarios novatos: enseña dónde colocar el ticket.
 *
 * @returns {Promise<boolean>} - true si el usuario procede, false si cancela
 */
export function showCameraGuide() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.92);
      z-index: 3000; display: flex; flex-direction: column;
      align-items: center; justify-content: center; padding: 20px;
      animation: fadeIn 0.2s;
    `;

    overlay.innerHTML = `
      <div style="
        position: relative;
        width: min(80vw, 320px);
        aspect-ratio: 3/4;
        border: 3px dashed #4ade80;
        border-radius: 12px;
        margin-bottom: 24px;
        background: rgba(74, 222, 128, 0.05);
      ">
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:white;font-size:13px;text-align:center;padding:16px">
          📄<br><br>Encuadra el ticket dentro del rectángulo
        </div>
        <div style="position:absolute;top:-2px;left:-2px;width:20px;height:20px;border-top:4px solid #4ade80;border-left:4px solid #4ade80"></div>
        <div style="position:absolute;top:-2px;right:-2px;width:20px;height:20px;border-top:4px solid #4ade80;border-right:4px solid #4ade80"></div>
        <div style="position:absolute;bottom:-2px;left:-2px;width:20px;height:20px;border-bottom:4px solid #4ade80;border-left:4px solid #4ade80"></div>
        <div style="position:absolute;bottom:-2px;right:-2px;width:20px;height:20px;border-bottom:4px solid #4ade80;border-right:4px solid #4ade80"></div>
      </div>

      <ul style="color:white;font-size:14px;list-style:none;padding:0;margin:0 0 24px;line-height:1.8;text-align:left">
        <li>✓ Buena luz, sin sombras</li>
        <li>✓ Ticket plano, sin arrugas</li>
        <li>✓ Rellena el rectángulo</li>
        <li>✓ Móvil paralelo al ticket</li>
      </ul>

      <div style="display:flex;gap:12px;width:100%;max-width:320px">
        <button id="cam-cancel" style="
          flex:1;padding:14px;border-radius:10px;border:1px solid #475569;
          background:transparent;color:white;font-size:15px;cursor:pointer
        ">Cancelar</button>
        <button id="cam-proceed" style="
          flex:1;padding:14px;border-radius:10px;border:none;
          background:#4ade80;color:#0f172a;font-weight:700;font-size:15px;cursor:pointer
        ">📸 Abrir cámara</button>
      </div>

      <p style="color:#94a3b8;font-size:11px;margin:16px 0 0">
        Esta guía aparece la primera vez. Puedes desactivarla en Ajustes.
      </p>
    `;

    document.body.appendChild(overlay);
    const close = (val) => {
      try { document.body.removeChild(overlay); } catch {}
      resolve(val);
    };
    overlay.querySelector('#cam-cancel').addEventListener('click', () => close(false));
    overlay.querySelector('#cam-proceed').addEventListener('click', () => close(true));
  });
}

/**
 * Conveniencia: muestra guía + abre cámara. Para usuarios novatos.
 * La guía solo se muestra una vez por sesión (controlado por localStorage).
 */
export async function captureWithGuide(opts = {}) {
  const seenKey = 'gastospro-camera-guide-seen';
  const alreadySeen = localStorage.getItem(seenKey) === '1';

  if (!alreadySeen && shouldUseMobileUx()) {
    const proceed = await showCameraGuide();
    if (!proceed) return null;
    localStorage.setItem(seenKey, '1');
  }

  return await openCameraOrPicker(opts);
}

/**
 * Resetea la flag de "guía vista" — útil si el usuario lo pide en ajustes.
 */
export function resetCameraGuideFlag() {
  localStorage.removeItem('gastospro-camera-guide-seen');
}
