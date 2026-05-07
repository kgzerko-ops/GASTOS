// ═══════════════════════════════════════════════════════════════
// VALIDACIÓN NIF/CIF/NIE — algoritmos de control oficiales
//
// CRÍTICO: AEAT NO tiene API pública gratuita para obtener el
// nombre del titular desde un NIF. Eso requiere certificado digital
// o servicios de pago (einforma, axesor, etc.).
//
// Lo que SÍ podemos hacer 100% gratis:
//   1. Validar formato exacto (regex)
//   2. Validar dígito de control (algoritmo oficial)
//   3. Para CIFs intracomunitarios (formato ESA12345678), VIES API
//      oficial UE (gratuita, sin API key)
// ═══════════════════════════════════════════════════════════════

const VIES_CACHE_KEY = 'gastospro-vies-cache';
const VIES_CACHE_DAYS = 30;

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const NIE_PREFIX = { X: '0', Y: '1', Z: '2' };
const CIF_LETTERS = 'JABCDEFGHI';

/**
 * Normaliza un NIF: mayúsculas, sin espacios ni guiones.
 */
export function normalizeNif(nif) {
  if (!nif) return '';
  return String(nif).toUpperCase().replace(/[\s\-\.]/g, '');
}

/**
 * Detecta el tipo: 'dni' | 'nie' | 'cif' | null
 */
export function detectNifType(nif) {
  const n = normalizeNif(nif);
  if (/^\d{8}[A-Z]$/.test(n)) return 'dni';
  if (/^[XYZ]\d{7}[A-Z]$/.test(n)) return 'nie';
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[A-J0-9]$/.test(n)) return 'cif';
  return null;
}

/**
 * Valida DNI: 8 dígitos + letra calculada.
 */
function isValidDni(nif) {
  const m = nif.match(/^(\d{8})([A-Z])$/);
  if (!m) return false;
  const expected = DNI_LETTERS[parseInt(m[1], 10) % 23];
  return expected === m[2];
}

/**
 * Valida NIE: X/Y/Z se sustituye por 0/1/2 y se aplica algoritmo DNI.
 */
function isValidNie(nif) {
  const m = nif.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (!m) return false;
  const num = NIE_PREFIX[m[1]] + m[2];
  const expected = DNI_LETTERS[parseInt(num, 10) % 23];
  return expected === m[3];
}

/**
 * Valida CIF: algoritmo de control oficial.
 * Letra inicial determina si el control es letra o número.
 */
function isValidCif(nif) {
  const m = nif.match(/^([ABCDEFGHJNPQRSUVW])(\d{7})([A-J0-9])$/);
  if (!m) return false;
  const [, letterStart, num, control] = m;

  let evenSum = 0;
  let oddSum = 0;
  for (let i = 0; i < num.length; i++) {
    const digit = parseInt(num[i], 10);
    if (i % 2 === 0) {
      const doubled = digit * 2;
      oddSum += doubled > 9 ? Math.floor(doubled / 10) + (doubled % 10) : doubled;
    } else {
      evenSum += digit;
    }
  }
  const total = evenSum + oddSum;
  const lastDigit = total % 10;
  const controlNumber = lastDigit === 0 ? 0 : 10 - lastDigit;
  const controlLetter = CIF_LETTERS[controlNumber];

  // Letras que solo aceptan número, solo letra, o ambos
  const onlyLetter = ['P', 'Q', 'R', 'S', 'W'].includes(letterStart);
  const onlyNumber = ['A', 'B', 'E', 'H'].includes(letterStart);

  if (onlyLetter) return control === controlLetter;
  if (onlyNumber) return control === String(controlNumber);
  return control === controlLetter || control === String(controlNumber);
}

/**
 * Valida formato + dígito de control. Devuelve un objeto con detalles.
 *
 * @returns {Object} { valid: boolean, type: string|null, normalized: string, reason: string }
 */
export function validateNifFull(nif) {
  if (!nif || !String(nif).trim()) {
    return { valid: false, type: null, normalized: '', reason: 'vacío' };
  }
  const n = normalizeNif(nif);
  const type = detectNifType(n);
  if (!type) {
    return { valid: false, type: null, normalized: n, reason: 'formato no reconocido' };
  }
  let valid = false;
  if (type === 'dni') valid = isValidDni(n);
  else if (type === 'nie') valid = isValidNie(n);
  else if (type === 'cif') valid = isValidCif(n);
  return {
    valid,
    type,
    normalized: n,
    reason: valid ? 'ok' : 'dígito de control incorrecto'
  };
}

/**
 * Wrapper compatible con el validateNif() existente (true/false).
 */
export function validateNif(nif) {
  return validateNifFull(nif).valid;
}

// ── VIES (CIFs intracomunitarios UE) ─────────────────────────

function readViesCache() {
  try {
    return JSON.parse(localStorage.getItem(VIES_CACHE_KEY) || '{}');
  } catch { return {}; }
}

function writeViesCache(cache) {
  try { localStorage.setItem(VIES_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

function isCacheFresh(entry) {
  if (!entry || !entry.ts) return false;
  const ageMs = Date.now() - entry.ts;
  return ageMs < VIES_CACHE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Consulta VIES (servicio oficial UE) para validar un CIF intracomunitario.
 * Sólo aplicable a CIFs en formato "ES" + identificador.
 *
 * VIES no requiere API key, pero puede tener CORS restrictivo.
 * Si falla, devolvemos null (no bloqueante).
 *
 * @param {string} nif - sin prefijo ES
 * @returns {Promise<{valid: boolean, name?: string} | null>}
 */
export async function validateNifVies(nif) {
  const n = normalizeNif(nif);
  const type = detectNifType(n);
  if (type !== 'cif') return null; // VIES sólo para empresas

  const cache = readViesCache();
  if (cache[n] && isCacheFresh(cache[n])) {
    return { valid: cache[n].valid, name: cache[n].name };
  }

  try {
    // Endpoint REST público de VIES (no oficial pero el oficial es SOAP).
    // Como puede tener CORS, usamos un timeout corto y caemos a null si falla.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const url = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/ES/vat/${encodeURIComponent(n)}`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const data = await response.json();
    const result = {
      valid: !!data.isValid,
      name: data.name || ''
    };
    cache[n] = { ...result, ts: Date.now() };
    writeViesCache(cache);
    return result;
  } catch (err) {
    // CORS / timeout / red — no bloqueante
    return null;
  }
}

/**
 * Validación completa: formato + control + VIES si es CIF y se pide.
 * Pensado para ser llamado en el evento input/change del campo NIF.
 *
 * @param {string} nif
 * @param {Object} opts - { useVies: boolean }
 * @returns {Promise<Object>} - resultado detallado
 */
export async function validateNifEnhanced(nif, opts = {}) {
  const result = validateNifFull(nif);
  if (!result.valid) return result;

  if (opts.useVies && result.type === 'cif') {
    const viesResult = await validateNifVies(result.normalized);
    if (viesResult) {
      return {
        ...result,
        viesValid: viesResult.valid,
        viesName: viesResult.name || null,
        viesChecked: true
      };
    }
    return { ...result, viesChecked: false };
  }

  return result;
}
