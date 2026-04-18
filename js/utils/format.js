// ═══════════════════════════════════════════════════════════════
// FORMATTERS — fechas, euros, NIF
// ═══════════════════════════════════════════════════════════════

const eurFmt = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2
});

export function fmtEur(n) {
  if (n == null || isNaN(n)) return '0,00 €';
  return eurFmt.format(Number(n));
}

export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = dateStr.toDate ? dateStr.toDate() : new Date(dateStr);
  if (isNaN(d)) return '—';
  return d.toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Valida formato NIF/CIF español. Retorna true/false.
 */
export function validateNif(nif) {
  if (!nif) return false;
  const n = nif.toUpperCase().replace(/[\s-]/g, '');
  // DNI
  const dniRe = /^(\d{8})([A-Z])$/;
  const m = n.match(dniRe);
  if (m) {
    const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
    return letters[parseInt(m[1], 10) % 23] === m[2];
  }
  // NIE
  const nieRe = /^[XYZ]\d{7}[A-Z]$/;
  if (nieRe.test(n)) return true;
  // CIF
  const cifRe = /^[ABCDEFGHJNPQRSUVW]\d{7}[A-J0-9]$/;
  if (cifRe.test(n)) return true;
  return false;
}

export function slug(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Devuelve YYYY-MM del Date o string
 */
export function monthKey(d) {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}
