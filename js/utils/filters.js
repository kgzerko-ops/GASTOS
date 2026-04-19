// ═══════════════════════════════════════════════════════════════
// FILTROS DE PERÍODO + BÚSQUEDA
// ═══════════════════════════════════════════════════════════════

export function getPeriodRange(period, customFrom = null, customTo = null) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === 'hoy') {
    return { from: today, to: endOfDay(today) };
  }
  if (period === 'semana') {
    const day = today.getDay() || 7; // lunes=1, domingo=7
    const monday = new Date(today);
    monday.setDate(today.getDate() - (day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: monday, to: endOfDay(sunday) };
  }
  if (period === 'mes') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return { from, to };
  }
  if (period === 'custom' && customFrom && customTo) {
    return { from: new Date(customFrom), to: endOfDay(new Date(customTo)) };
  }
  if (period === 'custom' && customFrom) {
    return { from: new Date(customFrom), to: endOfDay(new Date(customFrom)) };
  }
  return { from: null, to: null }; // todos
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function applyFilters(expenses, filters) {
  const { period, customFrom, customTo, search, estado, categoria, empresa, eventoId, tag } = filters;
  const { from, to } = getPeriodRange(period, customFrom, customTo);
  const s = (search || '').toLowerCase().trim();

  return expenses.filter(e => {
    if (from || to) {
      const d = new Date(e.fecha);
      if (from && d < from) return false;
      if (to && d > to) return false;
    }
    if (estado && estado !== 'todos' && e.estado !== estado) return false;
    if (categoria && categoria !== 'todas' && e.categoria !== categoria) return false;
    if (empresa && empresa !== 'todas' && e.empresa !== empresa) return false;
    if (eventoId && eventoId !== 'todos' && e.eventoId !== eventoId) return false;
    if (tag && tag !== 'todas') {
      const tags = Array.isArray(e.tags) ? e.tags : [];
      if (!tags.includes(tag)) return false;
    }
    if (s) {
      const hay = [e.proveedor, e.concepto, e.nifProveedor, e.empresa, e.matricula, ...(e.tags || [])]
        .map(x => (x || '').toLowerCase()).join(' ');
      if (!hay.includes(s)) return false;
    }
    return true;
  });
}

export function computeTotals(expenses) {
  let baseImponible = 0, iva = 0, total = 0, pendientes = 0;
  for (const e of expenses) {
    baseImponible += Number(e.baseImponible || 0);
    iva += Number(e.ivaTotal || 0);
    total += Number(e.total || 0);
    if (e.estado === 'pendiente') pendientes += Number(e.total || 0);
  }
  return { baseImponible, iva, total, pendientes, count: expenses.length };
}

export const CATEGORIAS = [
  'Combustible', 'Comida', 'Alojamiento', 'Transporte',
  'Material', 'Suministros', 'Servicios profesionales',
  'Formación', 'Marketing', 'Comunicaciones', 'Abono/Devolución', 'Otros'
];

export const ESTADOS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'aprobado',  label: 'Aprobado' },
  { value: 'rechazado', label: 'Rechazado' }
];

export const FORMAS_PAGO = [
  'Efectivo', 'Tarjeta', 'Transferencia', 'Bizum', 'Domiciliación', 'Kilometraje', 'Otro'
];

/**
 * Calcula totales por categoría/empresa/tag/usuario para barra resumen.
 */
export function computeBreakdown(expenses, field = 'categoria') {
  const byKey = {};
  for (const e of expenses) {
    let key;
    if (field === 'tags') {
      const tags = Array.isArray(e.tags) && e.tags.length > 0 ? e.tags : ['(sin etiquetas)'];
      for (const t of tags) {
        byKey[t] = (byKey[t] || 0) + Number(e.total || 0);
      }
      continue;
    }
    key = e[field] || '(sin definir)';
    byKey[key] = (byKey[key] || 0) + Number(e.total || 0);
  }
  return Object.entries(byKey)
    .map(([key, total]) => ({ key, total }))
    .sort((a, b) => b.total - a.total);
}
