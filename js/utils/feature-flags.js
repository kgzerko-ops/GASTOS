// ═══════════════════════════════════════════════════════════════
// FEATURE FLAGS — Sistema de activación/desactivación de features
// experimentales sin tener que hacer redeploy.
//
// Almacenamiento: localStorage (por usuario, por dispositivo).
// Auto-desactivación: si una feature lanza 3 errores seguidos, se
// desactiva automáticamente para proteger al usuario.
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'gastospro-feature-flags';
const ERROR_THRESHOLD = 3;
const errorCounters = new Map();

export const FEATURES = {
  VENDOR_MEMORY:    'vendor-memory',
  NIF_VALIDATION:   'nif-validation-enhanced',
  DEVICE_DETECT:    'device-detect',
  IMAGE_PREPROCESS: 'image-preprocess',
  OCR_HYBRID:       'ocr-hybrid-modal',
  CONFIDENCE_SCORE: 'confidence-score',
  MOBILE_STEPPER:   'mobile-stepper',
  CAMERA_GUIDES:    'camera-guides',
  QUICK_CAPTURE:    'quick-capture',
  TUTORIAL:         'tutorial-first-use',
  WIZARD:           'setup-wizard'
};

export const FEATURE_LABELS = {
  [FEATURES.VENDOR_MEMORY]:    { name: 'Memoria de proveedores',         desc: 'Aprende los proveedores tras la primera factura. Próximas facturas se rellenan automáticamente.' },
  [FEATURES.NIF_VALIDATION]:   { name: 'Validación NIF reforzada',       desc: 'Verifica formato + dígito de control. Para CIFs UE, opcional VIES.' },
  [FEATURES.DEVICE_DETECT]:    { name: 'Detección móvil/escritorio',     desc: 'Adapta la interfaz según el dispositivo (necesario para otras features).' },
  [FEATURES.IMAGE_PREPROCESS]: { name: 'Pre-procesar imagen antes OCR',  desc: 'Comprime, rota y mejora la imagen antes de enviar al OCR. Reduce coste y mejora precisión.' },
  [FEATURES.OCR_HYBRID]:       { name: 'Modal OCR híbrido con preview',  desc: 'Si OCR falla, muestra la imagen y permite editar manualmente.' },
  [FEATURES.CONFIDENCE_SCORE]: { name: 'Score de confianza por campo',   desc: 'Marca cada campo en verde/amarillo/rojo según seguridad del OCR.' },
  [FEATURES.MOBILE_STEPPER]:   { name: 'Stepper móvil guiado',           desc: 'En móvil, pregunta uno a uno los campos en lugar de mostrar todo el formulario.' },
  [FEATURES.CAMERA_GUIDES]:    { name: 'Cámara nativa con guías',        desc: 'Abre cámara directamente con overlay para encuadrar el ticket.' },
  [FEATURES.QUICK_CAPTURE]:    { name: 'Captura rápida por tipo',        desc: 'Detecta tipo de ticket (restaurante/parking/etc) y solo pide los datos críticos.' },
  [FEATURES.TUTORIAL]:         { name: 'Tutorial interactivo',           desc: 'Guía paso a paso para usuarios nuevos en su primer uso.' },
  [FEATURES.WIZARD]:           { name: 'Wizard configuración inicial',   desc: 'Onboarding admin: empresa, primer usuario, plantillas básicas.' }
};

function readFlags() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeFlags(flags) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch (err) {
    console.warn('No se pudo guardar feature flags:', err);
  }
}

export function isFeatureEnabled(name) {
  if (!name) return false;
  const flags = readFlags();
  return flags[name] === true;
}

export function enableFeature(name) {
  if (!name) return;
  const flags = readFlags();
  flags[name] = true;
  writeFlags(flags);
  errorCounters.set(name, 0);
}

export function disableFeature(name) {
  if (!name) return;
  const flags = readFlags();
  flags[name] = false;
  writeFlags(flags);
}

export function getAllFlags() {
  return readFlags();
}

/**
 * Ejecuta un bloque de código bajo una feature. Si falla, registra
 * el error. Si la feature falla 3 veces, se autodesactiva.
 *
 * @param {string} featureName - identificador de la feature
 * @param {Function} fn - función async a ejecutar (puede devolver Promise)
 * @param {*} fallback - valor a devolver si la feature está apagada o falla
 * @returns {Promise<*>} - resultado de fn() o fallback
 */
export async function withFeature(featureName, fn, fallback = null) {
  if (!isFeatureEnabled(featureName)) return fallback;
  try {
    return await fn();
  } catch (err) {
    console.warn(`[feature ${featureName}] error:`, err);
    const count = (errorCounters.get(featureName) || 0) + 1;
    errorCounters.set(featureName, count);
    if (count >= ERROR_THRESHOLD) {
      console.warn(`[feature ${featureName}] auto-desactivada tras ${ERROR_THRESHOLD} errores`);
      disableFeature(featureName);
      try { showAutoDisableNotice(featureName); } catch {}
    }
    return fallback;
  }
}

function showAutoDisableNotice(featureName) {
  const label = FEATURE_LABELS[featureName]?.name || featureName;
  if (typeof window !== 'undefined' && window.__gastosproToast) {
    window.__gastosproToast(`Feature "${label}" desactivada por errores. Revisa Ajustes → Experimental.`, 'warning', 6000);
  }
}

/**
 * Listener global de errores para detectar fallos en features.
 * Llamar una vez en el bootstrap.
 */
export function installErrorTracking() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    const msg = e?.message || '';
    Object.values(FEATURES).forEach(f => {
      if (msg.includes(`[feature ${f}]`)) {
        const count = (errorCounters.get(f) || 0) + 1;
        errorCounters.set(f, count);
        if (count >= ERROR_THRESHOLD) disableFeature(f);
      }
    });
  });
}
