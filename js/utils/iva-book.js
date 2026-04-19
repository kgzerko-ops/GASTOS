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

  const facturas = data.map((e, i) => ({
    'Nº Orden':          i + 1,
    'Fecha expedición':  e.fecha || '',
    'Fecha operación':   e.fecha || '',
    'Nº factura':        e.numeroDocumento || '',
    'NIF Proveedor':     e.nifProveedor || '',
    'Nombre Proveedor':  e.proveedor || '',
    'Concepto':          e.concepto || '',
    'Base Imponible':    Number(e.baseImponible || 0),
    'Tipo IVA (%)':      Number(e.tipoIva || 0),
    'Cuota IVA':         Number(e.ivaTotal || 0),
    'Tipo IRPF (%)':     Number(e.tipoIrpf || 0),
    'Retención IRPF':    Number(e.irpfTotal || 0),
    'Total Factura':     Number(e.total || 0),
    'Deducible':         'Sí',
    'Clave Operación':   '01',
    'Categoría':         e.categoria || ''
  }));

  const totalBase = facturas.reduce((s, r) => s + r['Base Imponible'], 0);
  const totalIva = facturas.reduce((s, r) => s + r['Cuota IVA'], 0);
  const totalIrpf = facturas.reduce((s, r) => s + r['Retención IRPF'], 0);
  const totalFact = facturas.reduce((s, r) => s + r['Total Factura'], 0);

  facturas.push({});
  facturas.push({
    'Nº Orden': 'TOTALES', 'Base Imponible': totalBase,
    'Cuota IVA': totalIva, 'Retención IRPF': totalIrpf, 'Total Factura': totalFact
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

  // Resumen por tipo IVA
  const porTipo = {};
  data.forEach(e => {
    const t = Number(e.tipoIva || 0);
    if (!porTipo[t]) porTipo[t] = { base: 0, cuota: 0, count: 0 };
    porTipo[t].base += Number(e.baseImponible || 0);
    porTipo[t].cuota += Number(e.ivaTotal || 0);
    porTipo[t].count++;
  });
  const resumen = Object.entries(porTipo).sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([tipo, v]) => ({ 'Tipo IVA': tipo + '%', 'Nº facturas': v.count, 'Base imponible': v.base, 'Cuota IVA': v.cuota }));
  resumen.push({});
  resumen.push({ 'Tipo IVA': 'TOTAL', 'Nº facturas': data.length, 'Base imponible': totalBase, 'Cuota IVA': totalIva });

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
