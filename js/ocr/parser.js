// ═══════════════════════════════════════════════════════════════
// PARSER OCR → Campos fiscales españoles
// Extrae NIF, fecha, base imponible, IVA, total, proveedor, etc.
// ═══════════════════════════════════════════════════════════════

export function parseTicketText(rawText) {
  const text = rawText.replace(/\r/g, '');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  return {
    proveedor:      extractProveedor(lines),
    nifProveedor:   extractNif(text),
    fecha:          extractFecha(text),
    numeroDocumento: extractNumDoc(text),
    baseImponible:  extractNumero(text, ['base imponible', 'base\\s*imp', 'subtotal', 'base']),
    ivaTotal:       extractNumero(text, ['iva\\s*\\(?\\s*21', 'iva\\s*\\(?\\s*10', 'iva\\s*\\(?\\s*4', 'iva total', 'i\\.?v\\.?a\\.?', 'iva']),
    tipoIva:        extractTipoIva(text),
    total:          extractNumero(text, ['total\\s*a?\\s*pagar', 'total\\s*factura', 'importe\\s*total', 'total']),
    rawText:        text
  };
}

// ── Proveedor: primera línea significativa ─────
function extractProveedor(lines) {
  for (const l of lines) {
    if (l.length < 3 || l.length > 60) continue;
    if (/^[\d\s\.\-\/€]+$/.test(l)) continue;
    if (/^(ticket|factura|recibo|simplificada)/i.test(l)) continue;
    return l.replace(/\s+/g, ' ').trim();
  }
  return '';
}

// ── NIF/CIF ────────────────────────────────────
function extractNif(text) {
  // Con prefijo
  const m1 = text.match(/(?:NIF|CIF|N\.I\.F\.?|C\.I\.F\.?)[\s:.\-]*([A-HJNP-SUVW]?\d{7,8}[A-Z0-9])/i);
  if (m1) return m1[1].toUpperCase();
  // Sin prefijo: CIF
  const m2 = text.match(/\b([ABCDEFGHJNPQRSUVW]\d{7}[A-J0-9])\b/);
  if (m2) return m2[1].toUpperCase();
  // DNI
  const m3 = text.match(/\b(\d{8}[A-Z])\b/);
  if (m3) return m3[1].toUpperCase();
  return '';
}

// ── Fecha ──────────────────────────────────────
function extractFecha(text) {
  // dd/mm/yyyy o dd-mm-yyyy
  const m1 = text.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/);
  if (m1) {
    let [, d, mo, y] = m1;
    if (y.length === 2) y = '20' + y;
    d = d.padStart(2, '0'); mo = mo.padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  // yyyy-mm-dd
  const m2 = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return '';
}

// ── Número de documento ───────────────────────
function extractNumDoc(text) {
  const m = text.match(/(?:factura|ticket|recibo|n[º°o]|num(?:ero)?)[\s:.\-#]*([A-Z0-9][A-Z0-9\-\/]{2,20})/i);
  return m ? m[1] : '';
}

// ── Tipo de IVA detectado ─────────────────────
function extractTipoIva(text) {
  // Busca porcentaje más frecuente/visible
  const m = text.match(/\biva\s*\(?\s*(\d{1,2})\s*%?\s*\)?/i);
  if (m) {
    const v = parseInt(m[1], 10);
    if ([0, 4, 10, 21].includes(v)) return v;
  }
  if (/\b21\s*%/.test(text)) return 21;
  if (/\b10\s*%/.test(text)) return 10;
  if (/\b4\s*%/.test(text)) return 4;
  return 21; // default
}

// ── Extractor genérico de número junto a etiqueta ──
function extractNumero(text, etiquetas) {
  for (const et of etiquetas) {
    const re = new RegExp(et + '[\\s:]*([\\d\\.,]+)\\s*€?', 'i');
    const m = text.match(re);
    if (m) {
      const n = parseNumeroES(m[1]);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return 0;
}

/**
 * Convierte string en formato ES ("1.234,56") a número.
 */
export function parseNumeroES(s) {
  if (!s) return NaN;
  let x = String(s).trim().replace(/\s/g, '').replace(/€/g, '');
  // Si tiene ambos, el último es el decimal
  const lastDot = x.lastIndexOf('.');
  const lastComma = x.lastIndexOf(',');
  if (lastDot > -1 && lastComma > -1) {
    if (lastComma > lastDot) {
      // "1.234,56" → 1234.56
      x = x.replace(/\./g, '').replace(',', '.');
    } else {
      // "1,234.56" → 1234.56
      x = x.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    x = x.replace(',', '.');
  }
  return parseFloat(x);
}
