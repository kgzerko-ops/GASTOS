// ═══════════════════════════════════════════════════════════════
// EXPORT ZIP — Excel + carpeta con imágenes de tickets
// ═══════════════════════════════════════════════════════════════

import { slug } from './format.js';

let jszipLoaded = null;
let xlsxLoaded = null;

async function ensureJSZip() {
  if (jszipLoaded) return jszipLoaded;
  jszipLoaded = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    s.onload = () => resolve(window.JSZip);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return jszipLoaded;
}

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

export async function exportExpensesToZip(expenses, filename = 'gastos.zip', onProgress = () => {}) {
  const [JSZip, XLSX] = await Promise.all([ensureJSZip(), ensureXlsx()]);
  const zip = new JSZip();
  const tickets = zip.folder('tickets');

  const expensesWithLocal = [];
  let done = 0;
  const total = expenses.length;
  const nameCount = {};

  for (const e of expenses) {
    const urls = e.ticketUrls && e.ticketUrls.length ? e.ticketUrls
                : (e.ticketUrl ? [{ url: e.ticketUrl }] : []);
    const archivos = [];
    for (let i = 0; i < urls.length; i++) {
      const t = urls[i];
      try {
        const ext = guessExt(t.url);
        const baseName = buildFileName(e);
        const suffix = urls.length > 1 ? `_p${i+1}` : '';
        const key = baseName + suffix;
        nameCount[key] = (nameCount[key] || 0) + 1;
        const dupSuffix = nameCount[key] > 1 ? `_${nameCount[key]}` : '';
        const fileName = `${key}${dupSuffix}${ext}`;

        onProgress(done, total, `Descargando: ${e.proveedor || 'ticket'}`);
        const blob = await fetchAsBlob(t.url);
        tickets.file(fileName, blob);
        archivos.push(`tickets/${fileName}`);
      } catch (err) {
        console.warn('No se pudo descargar ticket:', e.id, err);
        archivos.push('(no disponible)');
      }
    }
    expensesWithLocal.push({ ...e, _archivoLocal: archivos.join(' ; ') });
    done++;
    onProgress(done, total, '');
  }

  onProgress(total, total, 'Generando Excel…');
  zip.file('gastos.xlsx', buildXlsxBlob(XLSX, expensesWithLocal));

  zip.file('LEEME.txt',
`GASTÓSPRO — Exportación completa
${new Date().toLocaleString('es-ES')}

Contenido:
  · gastos.xlsx — listado de gastos con datos fiscales
  · tickets/    — imágenes originales de los tickets

La columna "Archivo ticket" del Excel indica el fichero correspondiente.
Total exportados: ${expenses.length}
`);

  onProgress(total, total, 'Comprimiendo…');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  triggerDownload(blob, filename);
  onProgress(total, total, 'Listo');
}

function buildFileName(e) {
  const fecha = (e.fecha || 'sinfecha').replace(/-/g, '');
  const prov = slug(e.proveedor || 'sin-proveedor').slice(0, 30);
  const nif = (e.nifProveedor || '').toUpperCase();
  const num = e.numeroDocumento ? '_' + slug(e.numeroDocumento).slice(0, 10) : '';
  return [fecha, prov, nif, num].filter(Boolean).join('_').replace(/_+/g, '_');
}

function guessExt(url) {
  const m = url.toLowerCase().match(/\.(jpg|jpeg|png|pdf|webp|gif)(?:\?|$)/);
  return m ? '.' + m[1] : '.jpg';
}

async function fetchAsBlob(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.blob();
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildXlsxBlob(XLSX, expenses) {
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
    'Archivo ticket': e._archivoLocal || '',
    'URL ticket (online)': e.ticketUrl || ''
  }));
  const tot = rows.reduce((acc, r) => {
    acc.base += r['Base imponible']; acc.iva += r['IVA total'];
    acc.irpf += r['IRPF total']; acc.total += r['Total'];
    return acc;
  }, { base: 0, iva: 0, irpf: 0, total: 0 });
  rows.push({});
  rows.push({ 'Fecha': 'TOTALES', 'Base imponible': tot.base, 'IVA total': tot.iva, 'IRPF total': tot.irpf, 'Total': tot.total });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Array(20).fill({ wch: 16 });
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let R = 1; R <= range.e.r; R++) {
    for (const col of [7, 9, 11, 12]) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: col })];
      if (cell && typeof cell.v === 'number') cell.z = '#,##0.00 €';
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Gastos');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/octet-stream' });
}
