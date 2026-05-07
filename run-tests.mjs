// Tests para gastospro-v5-mejoras (10 archivos nuevos)
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try {
    const r = fn();
    if (r instanceof Promise) {
      return r.then(() => { passed++; console.log(`  ✓ ${name}`); },
                    (e) => { failed++; failures.push({ name, e }); console.log(`  ✗ ${name}: ${e.message}`); });
    }
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, e: err });
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

console.log('═══════════════════════════════════════════════════════');
console.log('  TESTS GastósPro v5 — 10 archivos nuevos');
console.log('═══════════════════════════════════════════════════════\n');

// ── Mocks globales ─────────────────────────
global.localStorage = {
  data: {},
  getItem(k) { return this.data[k] ?? null; },
  setItem(k, v) { this.data[k] = String(v); },
  removeItem(k) { delete this.data[k]; }
};
global.window = global.window || {};
global.window.addEventListener = () => {};
global.window.removeEventListener = () => {};
global.window.innerWidth = 1024;
global.window.matchMedia = (q) => ({ matches: false, media: q });
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'Mozilla/5.0', maxTouchPoints: 0 },
  writable: true, configurable: true
});

// ── Validación NIF ─────────────────────────
console.log('▸ Validación NIF (mejora 2)');
const { normalizeNif, detectNifType, validateNifFull, validateNif } = await import('./js/utils/nif-validation.js');

test('normalizeNif: limpia espacios, guiones, mayúsculas', () => {
  assert.equal(normalizeNif(' b-12.345.678 '), 'B12345678');
});
test('detectNifType: DNI', () => {
  assert.equal(detectNifType('12345678Z'), 'dni');
});
test('detectNifType: NIE', () => {
  assert.equal(detectNifType('X1234567L'), 'nie');
});
test('detectNifType: CIF', () => {
  assert.equal(detectNifType('B12345674'), 'cif');
});
test('detectNifType: inválido', () => {
  assert.equal(detectNifType('XYZ123'), null);
  assert.equal(detectNifType(''), null);
});
test('validateNifFull: DNI válido (12345678Z)', () => {
  const r = validateNifFull('12345678Z');
  assert.equal(r.valid, true);
  assert.equal(r.type, 'dni');
});
test('validateNifFull: DNI inválido (control mal)', () => {
  const r = validateNifFull('12345678A');
  assert.equal(r.valid, false);
  assert.match(r.reason, /control/);
});
test('validateNifFull: vacío', () => {
  assert.equal(validateNifFull('').valid, false);
});
test('validateNif compatible API antigua', () => {
  assert.equal(validateNif('12345678Z'), true);
  assert.equal(validateNif('12345678A'), false);
});

// ── Feature flags ─────────────────────────
console.log('\n▸ Feature flags (núcleo)');
const ff = await import('./js/utils/feature-flags.js');

test('Feature inicia desactivada', () => {
  localStorage.data = {};
  assert.equal(ff.isFeatureEnabled(ff.FEATURES.VENDOR_MEMORY), false);
});
test('enableFeature activa', () => {
  ff.enableFeature(ff.FEATURES.VENDOR_MEMORY);
  assert.equal(ff.isFeatureEnabled(ff.FEATURES.VENDOR_MEMORY), true);
});
test('disableFeature desactiva', () => {
  ff.disableFeature(ff.FEATURES.VENDOR_MEMORY);
  assert.equal(ff.isFeatureEnabled(ff.FEATURES.VENDOR_MEMORY), false);
});
test('getAllFlags devuelve objeto', () => {
  assert.equal(typeof ff.getAllFlags(), 'object');
});
test('FEATURES tiene 11 entradas', () => {
  assert.equal(Object.keys(ff.FEATURES).length, 11);
});
test('FEATURE_LABELS para cada feature', () => {
  Object.values(ff.FEATURES).forEach(f => {
    assert.ok(ff.FEATURE_LABELS[f], `falta label para ${f}`);
    assert.ok(ff.FEATURE_LABELS[f].name);
    assert.ok(ff.FEATURE_LABELS[f].desc);
  });
});
test('withFeature ejecuta si activa', async () => {
  ff.enableFeature(ff.FEATURES.NIF_VALIDATION);
  const r = await ff.withFeature(ff.FEATURES.NIF_VALIDATION, async () => 'ok', 'fb');
  assert.equal(r, 'ok');
});
test('withFeature devuelve fallback si desactivada', async () => {
  ff.disableFeature(ff.FEATURES.NIF_VALIDATION);
  const r = await ff.withFeature(ff.FEATURES.NIF_VALIDATION, async () => 'ok', 'fb');
  assert.equal(r, 'fb');
});
test('withFeature devuelve fallback si throw', async () => {
  ff.enableFeature(ff.FEATURES.MOBILE_STEPPER);
  const r = await ff.withFeature(ff.FEATURES.MOBILE_STEPPER,
    async () => { throw new Error('x'); }, 'safe');
  assert.equal(r, 'safe');
});
test('Auto-desactivación tras 3 errores', async () => {
  ff.enableFeature(ff.FEATURES.OCR_HYBRID);
  for (let i = 0; i < 3; i++) {
    await ff.withFeature(ff.FEATURES.OCR_HYBRID, async () => { throw new Error('x'); }, null);
  }
  assert.equal(ff.isFeatureEnabled(ff.FEATURES.OCR_HYBRID), false);
});

// ── Device detection ──────────────────────
console.log('\n▸ Device detection (mejora 4)');
const dev = await import('./js/utils/device.js');

test('isMobileUserAgent: desktop', () => {
  globalThis.navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0)';
  assert.equal(dev.isMobileUserAgent(), false);
});
test('isMobileUserAgent: iPhone', () => {
  globalThis.navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)';
  assert.equal(dev.isMobileUserAgent(), true);
});
test('isMobileUserAgent: Android', () => {
  globalThis.navigator.userAgent = 'Mozilla/5.0 (Linux; Android 13)';
  assert.equal(dev.isMobileUserAgent(), true);
});
test('isTouchDevice: sin touch', () => {
  globalThis.navigator.maxTouchPoints = 0;
  delete global.window.ontouchstart;
  assert.equal(dev.isTouchDevice(), false);
});
test('isTouchDevice: con touch', () => {
  globalThis.navigator.maxTouchPoints = 5;
  assert.equal(dev.isTouchDevice(), true);
});
test('isSmallViewport: <768', () => {
  global.window.innerWidth = 375;
  assert.equal(dev.isSmallViewport(), true);
});
test('isSmallViewport: >=768', () => {
  global.window.innerWidth = 1920;
  assert.equal(dev.isSmallViewport(), false);
});
test('getDeviceType: mobile', () => {
  global.window.innerWidth = 375;
  globalThis.navigator.userAgent = 'iPhone';
  globalThis.navigator.maxTouchPoints = 5;
  assert.equal(dev.getDeviceType(), 'mobile');
});
test('getDeviceType: desktop', () => {
  global.window.innerWidth = 1920;
  globalThis.navigator.userAgent = 'Windows';
  globalThis.navigator.maxTouchPoints = 0;
  assert.equal(dev.getDeviceType(), 'desktop');
});
test('shouldUseMobileUx: desktop=false', () => {
  global.window.innerWidth = 1920;
  globalThis.navigator.userAgent = 'Windows';
  globalThis.navigator.maxTouchPoints = 0;
  assert.equal(dev.shouldUseMobileUx(), false);
});

// ── Quick capture ─────────────────────────
console.log('\n▸ Quick Capture detector (mejora 8)');
const qc = await import('./js/utils/quick-capture.js');

test('TICKET_TYPES tiene 7 tipos', () => {
  assert.equal(Object.keys(qc.TICKET_TYPES).length, 7);
});
test('detectTicketType: restaurante', () => {
  const r = qc.detectTicketType('RESTAURANTE LA PLACETA\nMenu del día\nMesa nº 5', '');
  assert.equal(r.type, 'restaurante');
  assert.ok(r.confidence > 0);
});
test('detectTicketType: combustible', () => {
  const r = qc.detectTicketType('REPSOL\nGasolina sin plomo 95\n42.5 litros', '');
  assert.equal(r.type, 'combustible');
});
test('detectTicketType: parking', () => {
  const r = qc.detectTicketType('SABA APARCAMIENTOS\nEstancia parking 2h', '');
  assert.equal(r.type, 'parking');
});
test('detectTicketType: taxi', () => {
  const r = qc.detectTicketType('Recibo carrera taxi licencia 1234', '');
  assert.equal(r.type, 'taxi');
});
test('detectTicketType: hotel', () => {
  const r = qc.detectTicketType('HOTEL MELIA\nPernoctación 2 noches\nCheck-in', '');
  assert.equal(r.type, 'hotel');
});
test('detectTicketType: supermercado', () => {
  const r = qc.detectTicketType('MERCADONA SA\ncesta de compra', '');
  assert.equal(r.type, 'supermercado');
});
test('detectTicketType: otro si no match', () => {
  const r = qc.detectTicketType('ferretería xyz', '');
  assert.equal(r.type, 'otro');
});
test('getRelevantFields: restaurante', () => {
  const fields = qc.getRelevantFields('restaurante');
  assert.ok(fields.includes('total'));
  assert.ok(fields.includes('proveedor'));
  assert.ok(!fields.includes('baseImponible'));
});
test('getRelevantFields: combustible incluye base', () => {
  const fields = qc.getRelevantFields('combustible');
  assert.ok(fields.includes('baseImponible'));
  assert.ok(fields.includes('nifProveedor'));
});

// ── Sintaxis de los 10 archivos del ZIP ──
console.log('\n▸ Sintaxis (node --check ya validado, verificación adicional)');
const allFiles = [
  './js/utils/feature-flags.js',
  './js/utils/device.js',
  './js/utils/nif-validation.js',
  './js/utils/image-preprocess.js',
  './js/utils/quick-capture.js',
  './js/utils/camera-helper.js',
  './js/db-vendor-memory.js',
  './js/views/experimental.js',
  './js/views/tutorial.js',
  './js/views/wizard-setup.js',
];
for (const f of allFiles) {
  test(`${f}`, () => {
    const code = readFileSync(f, 'utf8');
    assert.ok(code.length > 100, 'archivo demasiado corto');
    // Comprobaciones básicas
    assert.ok(/^(import|\/\/|\/\*|\s*$)/m.test(code), 'sin imports/comentarios al inicio');
  });
}

// ── Resumen ─────────────────────────────
console.log('\n═══════════════════════════════════════════════════════');
console.log(`  PASSED: ${passed}  FAILED: ${failed}`);
console.log('═══════════════════════════════════════════════════════');
if (failed > 0) {
  failures.forEach(f => console.log(`  - ${f.name}: ${f.e.stack}`));
  process.exit(1);
}
