// ═══════════════════════════════════════════════════════════════
// GEMINI VISION API (v2) — prompt endurecido + multi-IVA + saneado
// https://aistudio.google.com/apikey
// ═══════════════════════════════════════════════════════════════

import { parseAnyNumber, parseAnyDate, normalizeNif, snapTipoIva } from '../utils/sanitize.js';

const MODEL = 'gemini-2.0-flash';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const res = r.result;
      const idx = res.indexOf(',');
      resolve(idx >= 0 ? res.substring(idx + 1) : res);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/**
 * Extrae campos fiscales de un ticket con Gemini.
 * Retorna estructura normalizada y coherente.
 */
export async function ocrWithGemini(file, apiKey) {
  if (!apiKey) throw new Error('Falta API key de Gemini');

  const b64 = await fileToBase64(file);
  const mime = file.type || 'image/jpeg';

  const prompt = `Eres un experto en análisis de tickets y facturas españolas. Extrae los datos fiscales de este documento.

REGLAS ESTRICTAS:
1. Responde EXCLUSIVAMENTE con un JSON válido. Nada de markdown ni texto adicional.
2. Todos los importes: números con PUNTO decimal, sin símbolos, sin separador de miles. Ejemplo: 14.94, no "14,94€".
3. La fecha en formato ISO "YYYY-MM-DD". Si el ticket dice "13/04/2026", devuelve "2026-04-13".
4. NIF/CIF sin guiones ni espacios, sin prefijo ES. "A-80546088" → "A80546088".
5. El TOTAL es el importe FINAL pagado (incluye IVA). NO confundir con precio unitario.
6. Si NO ves un dato con claridad, pon "" para strings y 0 para números. No inventes.

MÚLTIPLES TIPOS DE IVA:
- Supermercados (Alcampo, Carrefour, Mercadona) pueden tener 4%/10%/21% en un mismo ticket.
- Devuelve array "lineasIva" con una entrada por tipo.
- "tipoIva" + "baseImponible" + "ivaTotal" = la línea DOMINANTE (mayor base).

CAMPOS ADICIONALES (solo si los detectas claramente):
- "tipoIrpf" + "irpfTotal": si la factura tiene retención IRPF visible.
- "recargoEquivalencia": importe del recargo de equivalencia si aparece (comerciantes minoristas).
- "propina" o "totalPagado": si el recibo muestra propina/tip/service o total pagado mayor al total factura.
- "matricula": si es gasolinera o taxi y aparece la matrícula del vehículo.
- "fechaEntrada" + "fechaSalida" + "noches": si es hotel (formato ISO).
- "habitacion": nº de habitación si aparece.
- "numeroFacturaRectificativa": si es una factura rectificativa que corrige otra.
- "esAbono": true si el ticket es un abono/devolución (importes negativos o texto "abono", "devolución").

ESTRUCTURA EXACTA:
{
  "proveedor": "...",
  "nifProveedor": "...",
  "fecha": "YYYY-MM-DD",
  "numeroDocumento": "...",
  "lineasIva": [{ "tipoIva": 21, "baseImponible": 77.40, "ivaTotal": 16.27 }],
  "tipoIva": 21,
  "baseImponible": 77.40,
  "ivaTotal": 16.27,
  "tipoIrpf": 0,
  "irpfTotal": 0,
  "recargoEquivalencia": 0,
  "total": 108.82,
  "totalPagado": 108.82,
  "propina": 0,
  "matricula": "",
  "fechaEntrada": "",
  "fechaSalida": "",
  "noches": 0,
  "habitacion": "",
  "formaPago": "Tarjeta",
  "esIntracomunitario": false,
  "esAbono": false,
  "numeroFacturaRectificativa": "",
  "claveOperacion": "01",
  "confianza": "alta"
}

CLAVE OPERACIÓN: "01"=interior general, "09"=intracomunitario UE, "11"=arrendamiento con retención, "12"=arrendamiento sin retención, "13"=importación, "14"=ISP. Por defecto "01".

FORMA DE PAGO: "Tarjeta" / "Efectivo" / "Bizum" / "Transferencia" / "Domiciliación".

CONFIANZA: "alta" / "media" / "baja" según nitidez del ticket.

VALIDA: (baseImponible + ivaTotal - irpfTotal + recargoEquivalencia) ≈ total. Si esAbono, todos los importes son negativos.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mime, data: b64 } }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error('Gemini HTTP ' + res.status + ': ' + errText.slice(0, 200));
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Gemini: respuesta vacía');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const clean = text.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  }

  // ── Saneado ────────────────────────────────
  const lineasRaw = Array.isArray(parsed.lineasIva) ? parsed.lineasIva : [];
  const lineasIva = lineasRaw
    .map(l => ({
      tipoIva: snapTipoIva(l.tipoIva),
      baseImponible: parseAnyNumber(l.baseImponible),
      ivaTotal: parseAnyNumber(l.ivaTotal)
    }))
    .filter(l => l.baseImponible > 0 || l.ivaTotal > 0);

  // Si solo hay una línea, usarla como principal
  let tipoIva = snapTipoIva(parsed.tipoIva);
  let baseImponible = parseAnyNumber(parsed.baseImponible);
  let ivaTotal = parseAnyNumber(parsed.ivaTotal);

  // Si hay líneas pero el dominante está vacío, usar la línea mayor
  if (lineasIva.length > 0 && baseImponible === 0) {
    const dominante = lineasIva.reduce((a, b) => a.baseImponible > b.baseImponible ? a : b);
    tipoIva = dominante.tipoIva;
    baseImponible = dominante.baseImponible;
    ivaTotal = dominante.ivaTotal;
  }

  // Si no hay líneas pero sí dominante, crear una línea
  let lineasFinales = lineasIva;
  if (lineasFinales.length === 0 && baseImponible > 0) {
    lineasFinales = [{ tipoIva, baseImponible, ivaTotal }];
  }

  return {
    proveedor:       String(parsed.proveedor || '').trim(),
    nifProveedor:    normalizeNif(parsed.nifProveedor),
    fecha:           parseAnyDate(parsed.fecha),
    numeroDocumento: String(parsed.numeroDocumento || '').trim(),
    lineasIva:       lineasFinales,
    tipoIva,
    baseImponible,
    ivaTotal,
    tipoIrpf:        parseAnyNumber(parsed.tipoIrpf),
    irpfTotal:       parseAnyNumber(parsed.irpfTotal),
    recargoEquivalencia: parseAnyNumber(parsed.recargoEquivalencia),
    total:           parseAnyNumber(parsed.total),
    totalPagado:     parseAnyNumber(parsed.totalPagado) || parseAnyNumber(parsed.total),
    propina:         parseAnyNumber(parsed.propina),
    matricula:       String(parsed.matricula || '').toUpperCase().trim(),
    fechaEntrada:    parseAnyDate(parsed.fechaEntrada),
    fechaSalida:     parseAnyDate(parsed.fechaSalida),
    noches:          parseAnyNumber(parsed.noches),
    habitacion:      String(parsed.habitacion || '').trim(),
    formaPago:       String(parsed.formaPago || '').trim() || 'Tarjeta',
    esIntracomunitario: !!parsed.esIntracomunitario,
    esAbono:         !!parsed.esAbono,
    numeroFacturaRectificativa: String(parsed.numeroFacturaRectificativa || '').trim(),
    claveOperacion:  String(parsed.claveOperacion || '01').trim(),
    confianza:       String(parsed.confianza || 'media'),
    rawText:         text,
    _structured:     true
  };
}
