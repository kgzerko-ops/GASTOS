// ═══════════════════════════════════════════════════════════════
// EXPORT A EXCEL (SheetJS)
// ═══════════════════════════════════════════════════════════════

let xlsxLoaded = null;

async function ensureXlsx() {
  if (xlsxLoaded) return xlsxLoaded;
  // Cargar SheetJS desde CDN
  xlsxLoaded = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return xlsxLoaded;
}

export async function exportExpensesToXlsx(expenses, filename = 'gastos.xlsx') {
  const XLSX = await ensureXlsx();

  const rows = expenses.map(e => ({
    'Fecha': e.fecha || '',
    'Proveedor': e.proveedor || '',
    'NIF Proveedor': e.nifProveedor || '',
    'Concepto': e.concepto || '',
    'Categoría': e.categoria || '',
    'Empresa': e.empresa || '',
    'Evento': e.eventoNombre || '',
    'Base imponible': Number(e.baseImponible || 0),
    'Tipo IVA (%)': Number(e.tipoIva ?? 0),
    'IVA total': Number(e.ivaTotal || 0),
    'IRPF (%)': Number(e.tipoIrpf ?? 0),
    'IRPF total': Number(e.irpfTotal || 0),
    'Total': Number(e.total || 0),
    'Forma de pago': e.formaPago || '',
    'Nº documento': e.numeroDocumento || '',
    'Estado': e.estado || '',
    'Nota admin': e.notaAdmin || '',
    'Cargado por': e.createdByEmail || '',
    'URL ticket': e.ticketUrl || ''
  }));

  // Fila de totales
  const tot = rows.reduce((acc, r) => {
    acc['Base imponible'] += r['Base imponible'];
    acc['IVA total'] += r['IVA total'];
    acc['IRPF total'] += r['IRPF total'];
    acc['Total'] += r['Total'];
    return acc;
  }, { 'Base imponible': 0, 'IVA total': 0, 'IRPF total': 0, 'Total': 0 });

  rows.push({});
  rows.push({
    'Fecha': 'TOTALES',
    'Base imponible': tot['Base imponible'],
    'IVA total': tot['IVA total'],
    'IRPF total': tot['IRPF total'],
    'Total': tot['Total']
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  // Ancho de columnas
  ws['!cols'] = [
    { wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 28 }, { wch: 16 },
    { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
    { wch: 12 }, { wch: 24 }, { wch: 22 }, { wch: 32 }
  ];

  // Formato de euros en columnas numéricas
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let R = 1; R <= range.e.r; ++R) {
    for (const col of [7, 9, 11, 12]) { // Base, IVA, IRPF, Total
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: col })];
      if (cell && typeof cell.v === 'number') cell.z = '#,##0.00 €';
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Gastos');

  XLSX.writeFile(wb, filename);
}
