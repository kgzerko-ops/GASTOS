// ═══════════════════════════════════════════════════════════════
// LIBRO IVA SOPORTADO — trimestral (modelo 303 / 390)
// ═══════════════════════════════════════════════════════════════

let xlsxLoaded = null;
async function ensureXlsx() {
  if (xlsxLoaded) return xlsxLoaded;
  xlsxLoaded = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return xlsxLoaded;
}

export async function exportLibroIva(expenses, { empresa, year, trimestre }) {
  const XLSX = await ensureXlsx();
  const startMonth = (trimestre - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const data = expenses.filter(e => {
    if (e.estado !== 'aprobado') return false;
    if (empresa && e.empresa !== empresa) return false;
    const d = new Date(e.fecha);
    return d.getFullYear() === year && d.getMonth() + 1 >= startMonth && d.getMonth() + 1 <= endMonth;
  });
  data.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

  // ── Desglosar por líneas de IVA ────────────────
  // Cada gasto con varios tipos de IVA genera varias filas (una por tipo),
  // con el mismo nº de orden y factura, para que la gestoría vea el desglose.
  const facturas = [];
  let orden = 0;
  for (const e of data) {
    orden++;
    const lineas = Array.isArray(e.lineasIva) && e.lineasIva.length > 0
      ? e.lineasIva
      : [{ tipoIva: Number(e.tipoIva || 0), baseImponible: Number(e.baseImponible || 0), ivaTotal: Number(e.ivaTotal || 0) }];

    // Proporcionar el IRPF proporcionalmente a la primera línea (simplificación aceptada por gestorías)
    const totalBaseGasto = lineas.reduce((s, l) => s + Number(l.baseImponible || 0), 0);

    lineas.forEach((l, idx) => {
      const primeraLinea = idx === 0;
      const proporcIrpf = (totalBaseGasto > 0 && primeraLinea)
        ? Number(e.irpfTotal || 0)
        : 0;
      const totalFacturaRow = primeraLinea ? Number(e.total || 0) : 0;  // total solo en la primera línea

      facturas.push({
        'Nº Orden':          orden + (lineas.length > 1 ? (primeraLinea ? '' : '.' + (idx+1)) : ''),
        'Fecha expedición':  primeraLinea ? (e.fecha || '') : '',
        'Fecha operación':   primeraLinea ? (e.fecha || '') : '',
        'Nº factura':        primeraLinea ? (e.numeroDocumento || '') : '',
        'Nº rect. de':       primeraLinea ? (e.numeroFacturaRectificativa || '') : '',
        'NIF Proveedor':     primeraLinea ? (e.nifProveedor || '') : '',
        'Nombre Proveedor':  primeraLinea ? (e.proveedor || '') : '',
        'Concepto':          primeraLinea ? (e.concepto || '') : `(continuación tipo ${Number(l.tipoIva)}%)`,
        'Base Imponible':    Number(l.baseImponible || 0) * (e.esAbono ? -1 : 1),
        'Tipo IVA (%)':      Number(l.tipoIva || 0),
        'Cuota IVA':         Number(l.ivaTotal || 0) * (e.esAbono ? -1 : 1),
        'Recargo equiv.':    primeraLinea ? Number(e.recargoEquivalencia || 0) * (e.esAbono ? -1 : 1) : 0,
        'Tipo IRPF (%)':     primeraLinea ? Number(e.tipoIrpf || 0) : 0,
        'Retención IRPF':    proporcIrpf * (e.esAbono ? -1 : 1),
        'Total Factura':     totalFacturaRow,  // ya viene con signo si es abono
        'Deducible':         e.esAbono ? 'ABONO' : 'Sí',
        'Clave Operación':   e.claveOperacion || (e.esIntracomunitario ? '09' : '01'),
        'Categoría':         primeraLinea ? (e.categoria || '') : ''
      });
    });
  }

  const totalBase = facturas.reduce((s, r) => s + (r['Base Imponible'] || 0), 0);
  const totalIva = facturas.reduce((s, r) => s + (r['Cuota IVA'] || 0), 0);
  const totalRecargo = facturas.reduce((s, r) => s + (r['Recargo equiv.'] || 0), 0);
  const totalIrpf = facturas.reduce((s, r) => s + (r['Retención IRPF'] || 0), 0);
  const totalFact = facturas.reduce((s, r) => s + (r['Total Factura'] || 0), 0);

  facturas.push({});
  facturas.push({
    'Nº Orden': 'TOTALES',
    'Base Imponible': totalBase,
    'Cuota IVA': totalIva,
    'Recargo equiv.': totalRecargo,
    'Retención IRPF': totalIrpf,
    'Total Factura': totalFact
  });

  const ws1 = XLSX.utils.json_to_sheet(facturas);
  ws1['!cols'] = Array(16).fill({ wch: 14 });
  const range1 = XLSX.utils.decode_range(ws1['!ref']);
  for (let R = 1; R <= range1.e.r; R++) {
    for (const col of [7, 9, 11, 12]) {
      const cell = ws1[XLSX.utils.encode_cell({ r: R, c: col })];
      if (cell && typeof cell.v === 'number') cell.z = '#,##0.00 €';
    }
  }

  // Resumen por tipo IVA (desglosado desde lineasIva)
  const porTipo = {};
  data.forEach(e => {
    const lineas = Array.isArray(e.lineasIva) && e.lineasIva.length > 0
      ? e.lineasIva
      : [{ tipoIva: Number(e.tipoIva || 0), baseImponible: Number(e.baseImponible || 0), ivaTotal: Number(e.ivaTotal || 0) }];
    lineas.forEach(l => {
      const t = Number(l.tipoIva || 0);
      if (!porTipo[t]) porTipo[t] = { base: 0, cuota: 0, count: 0 };
      porTipo[t].base += Number(l.baseImponible || 0);
      porTipo[t].cuota += Number(l.ivaTotal || 0);
      porTipo[t].count++;
    });
  });
  const resumen = Object.entries(porTipo).sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([tipo, v]) => ({ 'Tipo IVA': tipo + '%', 'Nº líneas': v.count, 'Base imponible': v.base, 'Cuota IVA': v.cuota }));
  resumen.push({});
  resumen.push({ 'Tipo IVA': 'TOTAL', 'Nº líneas': Object.values(porTipo).reduce((s, v) => s + v.count, 0), 'Base imponible': totalBase, 'Cuota IVA': totalIva });

  const ws2 = XLSX.utils.json_to_sheet(resumen);
  ws2['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 14 }];
  const range2 = XLSX.utils.decode_range(ws2['!ref']);
  for (let R = 1; R <= range2.e.r; R++) {
    for (const col of [2, 3]) {
      const cell = ws2[XLSX.utils.encode_cell({ r: R, c: col })];
      if (cell && typeof cell.v === 'number') cell.z = '#,##0.00 €';
    }
  }

  const m303 = [
    { 'Casilla': '28 — Base IVA soportado régimen general', 'Importe': totalBase },
    { 'Casilla': '29 — Cuota IVA soportado régimen general', 'Importe': totalIva },
    { '': '' },
    { 'Casilla': 'Retenciones IRPF aplicadas', 'Importe': totalIrpf },
    { 'Casilla': 'Total pagado a proveedores', 'Importe': totalFact },
    { '': '' },
    { 'Empresa': empresa || '(todas)', 'Periodo': `${year} - T${trimestre}` }
  ];
  const ws3 = XLSX.utils.json_to_sheet(m303);
  ws3['!cols'] = [{ wch: 40 }, { wch: 16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Facturas recibidas');
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumen por IVA');
  XLSX.utils.book_append_sheet(wb, ws3, 'Modelo 303');

  const empresaSlug = (empresa || 'todas').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
  XLSX.writeFile(wb, `LibroIVA_${empresaSlug}_${year}T${trimestre}.xlsx`);
}
