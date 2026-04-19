// ═══════════════════════════════════════════════════════════════
// EXPORT EXCEL v5 — con todos los campos fiscales
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

export async function exportExpensesToXlsx(expenses, filename = 'gastos.xlsx') {
  const XLSX = await ensureXlsx();

  const rows = expenses.map(e => ({
    'Fecha': e.fecha || '',
    'Proveedor': e.proveedor || '',
    'NIF Proveedor': e.nifProveedor || '',
    'Concepto': e.concepto || '',
    'Categoría': e.categoria || '',
    'Etiquetas': (e.tags || []).join(', '),
    'Empresa': e.empresa || '',
    'Evento': e.eventoNombre || '',
    'Clave AEAT': e.claveOperacion || '01',
    'Base imponible': Number(e.baseImponible || 0),
    'Tipo IVA (%)': Number(e.tipoIva ?? 0),
    'IVA total': Number(e.ivaTotal || 0),
    'Recargo equiv.': Number(e.recargoEquivalencia || 0),
    'IRPF (%)': Number(e.tipoIrpf ?? 0),
    'IRPF total': Number(e.irpfTotal || 0),
    'Propina': Number(e.propina || 0),
    'Total': Number(e.total || 0),
    'Forma de pago': e.formaPago || '',
    'Nº documento': e.numeroDocumento || '',
    'Rect. de': e.numeroFacturaRectificativa || '',
    'Tipo': e.esAbono ? 'ABONO' : (e.esIntracomunitario ? 'INTRA-UE' : (e.isKilometraje ? 'KILOMETRAJE' : 'NORMAL')),
    'Matrícula': e.matricula || '',
    'Hotel entrada': e.fechaEntrada || '',
    'Hotel salida': e.fechaSalida || '',
    'Noches': Number(e.noches || 0),
    'Habitación': e.habitacion || '',
    'Estado': e.estado || '',
    'Nota admin': e.notaAdmin || '',
    'Cargado por': e.createdByEmail || '',
    'URL ticket': e.ticketUrl || ''
  }));

  // Fila de totales
  const tot = rows.reduce((acc, r) => {
    acc['Base imponible'] += r['Base imponible'];
    acc['IVA total'] += r['IVA total'];
    acc['Recargo equiv.'] += r['Recargo equiv.'];
    acc['IRPF total'] += r['IRPF total'];
    acc['Propina'] += r['Propina'];
    acc['Total'] += r['Total'];
    return acc;
  }, { 'Base imponible': 0, 'IVA total': 0, 'Recargo equiv.': 0, 'IRPF total': 0, 'Propina': 0, 'Total': 0 });

  rows.push({});
  rows.push({
    'Fecha': 'TOTALES',
    'Base imponible': tot['Base imponible'],
    'IVA total': tot['IVA total'],
    'Recargo equiv.': tot['Recargo equiv.'],
    'IRPF total': tot['IRPF total'],
    'Propina': tot['Propina'],
    'Total': tot['Total']
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  // Anchos de columnas
  ws['!cols'] = [
    { wch: 11 }, { wch: 22 }, { wch: 12 }, { wch: 26 }, { wch: 15 }, { wch: 20 },
    { wch: 16 }, { wch: 16 }, { wch: 10 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 },
    { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 10 },
    { wch: 12 }, { wch: 22 }, { wch: 22 }, { wch: 30 }
  ];

  // Formato € en las columnas numéricas
  const range = XLSX.utils.decode_range(ws['!ref']);
  const euroColsIdx = [9, 11, 12, 14, 15, 16];  // Base, IVA, Recargo, IRPF, Propina, Total
  for (let R = 1; R <= range.e.r; ++R) {
    for (const col of euroColsIdx) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: col })];
      if (cell && typeof cell.v === 'number') cell.z = '#,##0.00 €';
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Gastos');

  XLSX.writeFile(wb, filename);
}
