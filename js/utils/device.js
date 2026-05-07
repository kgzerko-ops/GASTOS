// ═══════════════════════════════════════════════════════════════
// DEVICE DETECTION — Móvil vs escritorio
//
// Combina User-Agent, ancho de viewport y capacidad táctil.
// Robusto para tablets, móviles, portátiles con touch.
// ═══════════════════════════════════════════════════════════════

const MOBILE_BREAKPOINT = 768;

const MOBILE_UA_RE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i;

export function isMobileUserAgent() {
  if (typeof navigator === 'undefined') return false;
  return MOBILE_UA_RE.test(navigator.userAgent || '');
}

export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return !!(('ontouchstart' in window) ||
            (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
            (navigator.msMaxTouchPoints && navigator.msMaxTouchPoints > 0));
}

export function isSmallViewport() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

/**
 * Devuelve 'mobile' | 'tablet' | 'desktop'.
 * Tablet = táctil + viewport grande.
 */
export function getDeviceType() {
  const small = isSmallViewport();
  const touch = isTouchDevice();
  const ua = isMobileUserAgent();
  if (small && (touch || ua)) return 'mobile';
  if (touch && !small) return 'tablet';
  return 'desktop';
}

/**
 * Devuelve true si conviene usar la UX móvil (stepper, full-screen, etc.).
 * Incluye tablets en orientación retrato.
 */
export function shouldUseMobileUx() {
  const type = getDeviceType();
  if (type === 'mobile') return true;
  if (type === 'tablet' && isSmallViewport()) return true;
  return false;
}

/**
 * Suscribe a cambios (rotación, resize). Retorna unsub.
 */
export function onDeviceTypeChange(callback) {
  if (typeof window === 'undefined') return () => {};
  let lastType = getDeviceType();
  const handler = () => {
    const newType = getDeviceType();
    if (newType !== lastType) {
      lastType = newType;
      try { callback(newType); } catch (err) { console.warn(err); }
    }
  };
  window.addEventListener('resize', handler);
  window.addEventListener('orientationchange', handler);
  return () => {
    window.removeEventListener('resize', handler);
    window.removeEventListener('orientationchange', handler);
  };
}
