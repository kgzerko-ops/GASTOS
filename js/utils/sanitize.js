// ═══════════════════════════════════════════════════════════════
// SANEADORES — limpieza de datos provenientes del OCR
// ═══════════════════════════════════════════════════════════════

/**
 * Convierte cualquier representación de número a float.
 * Acepta: "14,94", "14.94", "1.234,56", "1,234.56", "58,00€", "  €9.30 ", 9.3, null, undefined.
 */
export function parseAnyNumber(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;

  let s = String(v).trim();
  // Quitar símbolos de moneda y letras
  s = s.replace(/[€$£¥\s]/g, '').replace(/EUR/gi, '').replace(/eur/g, '');
  // Quitar cualquier letra residual
  s = s.replace(/[a-zA-Z]/g, '');
  if (!s) return 0;

  // Signo
  const neg = s.startsWith('-');
  if (neg) s = s.substring(1);

  // Caso mixto: último separador decimal, el resto son miles
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot > -1 && lastComma > -1) {
    if (lastComma > lastDot) {
      // Formato ES: "1.234,56" → decimal es coma
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato US: "1,234.56" → decimal es punto
      s = s.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    // Solo coma: asumir decimal europeo
    s = s.replace(',', '.');
  }
  // Si solo hay puntos, puede ser separador de miles ("1.234") o decimal ("14.94")
  // Heurística: si hay más de un punto, son miles
  if (s.split('.').length > 2) {
    s = s.replace(/\./g, '');
  }

  const n = parseFloat(s);
  if (!isFinite(n)) return 0;
  return neg ? -n : n;
}

/**
 * Normaliza una fecha a formato ISO "YYYY-MM-DD".
 * Acepta: "13/04/2026", "13-04-2026", "2026-04-13", "17Apr'26", "17 Apr 2026",
 *         "17 abr 2026", "April 17, 2026", Date object.
 */
export function parseAnyDate(v) {
  if (!v) return '';
  if (v instanceof Date) {
    if (isNaN(v)) return '';
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return '';

  // Ya ISO
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;

  // dd/mm/yyyy o dd-mm-yyyy o dd.mm.yyyy
  m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = (parseInt(y) > 70 ? '19' : '20') + y;
    return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  // 17Apr'26 / 17 Apr 2026 / 17-Apr-26 / 17 abr 26
  const months = {
    ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
    jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
    jan: 1, apr: 4, aug: 8
  };
  m = s.match(/(\d{1,2})\s*[-\/\.']?\s*([A-Za-z]{3})\w*\s*[-\/\.']?\s*(\d{2,4})/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = months[m[2].toLowerCase().slice(0,3)];
    if (mo) {
      let y = m[3];
      if (y.length === 2) y = (parseInt(y) > 70 ? '19' : '20') + y;
      return `${y}-${String(mo).padStart(2,'0')}-${d}`;
    }
  }

  // April 17, 2026
  m = s.match(/([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mo = months[m[1].toLowerCase().slice(0,3)];
    if (mo) {
      return `${m[3]}-${String(mo).padStart(2,'0')}-${m[2].padStart(2,'0')}`;
    }
  }

  // Último recurso: Date.parse
  const parsed = Date.parse(s);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }

  return '';
}

/**
 * Normaliza un NIF/CIF: quita espacios, guiones y prefijo ES.
 * "A-80546088" → "A80546088"
 * "ESB66239997" → "B66239997"
 * "B 66239997" → "B66239997"
 */
export function normalizeNif(v) {
  if (!v) return '';
  let s = String(v).toUpperCase().trim();
  s = s.replace(/[\s\-\.\/]/g, '');
  if (s.startsWith('ES') && s.length === 11) s = s.substring(2);
  return s;
}

/**
 * Redondea un tipo de IVA a los permitidos (0, 4, 10, 21).
 * Si el valor es sospechoso (ej 5 → probablemente 4), corrige.
 */
export function snapTipoIva(v) {
  const n = parseAnyNumber(v);
  if (n <= 1) return 0;
  if (n <= 6) return 4;
  if (n <= 13) return 10;
  return 21;
}

/**
 * Verifica que los importes cuadran: total ≈ base + iva - irpf (tolerancia 5%)
 * Retorna { ok, diff, message }.
 */
export function checkCoherencia(base, ivaTotal, irpfTotal, total) {
  base = parseAnyNumber(base);
  ivaTotal = parseAnyNumber(ivaTotal);
  irpfTotal = parseAnyNumber(irpfTotal);
  total = parseAnyNumber(total);

  if (total === 0) return { ok: true };  // sin total, no validamos

  const calc = base + ivaTotal - irpfTotal;
  const diff = Math.abs(calc - total);
  const diffPct = total > 0 ? (diff / total) * 100 : 0;

  if (diff < 0.05) return { ok: true };   // céntimo arriba/abajo es redondeo
  if (diffPct < 5) return { ok: true };   // tolerancia

  return {
    ok: false,
    diff,
    diffPct,
    message: `Base ${base.toFixed(2)} + IVA ${ivaTotal.toFixed(2)} - IRPF ${irpfTotal.toFixed(2)} = ${calc.toFixed(2)} €, pero el total leído es ${total.toFixed(2)} € (difiere ${diffPct.toFixed(1)}%)`
  };
}

/**
 * Hash simple de un File/Blob (para cachear OCR).
 */
export async function hashFile(file) {
  try {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  } catch {
    return String(file.size) + '-' + String(file.lastModified || 0);
  }
}
