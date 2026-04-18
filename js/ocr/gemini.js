// ═══════════════════════════════════════════════════════════════
// GEMINI VISION API — free tier (extrae JSON estructurado directo)
// https://aistudio.google.com/apikey
// ═══════════════════════════════════════════════════════════════

const MODEL = 'gemini-2.0-flash';

/**
 * Convierte File → base64 (solo el contenido, sin el prefijo data:).
 */
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
 * Retorna { proveedor, nifProveedor, fecha, baseImponible, tipoIva, ivaTotal, total, numeroDocumento, rawText }.
 */
export async function ocrWithGemini(file, apiKey) {
  if (!apiKey) throw new Error('Falta API key de Gemini');

  const b64 = await fileToBase64(file);
  const mime = file.type || 'image/jpeg';

  const prompt = `Analiza este ticket o factura español y extrae los datos fiscales.
Responde EXCLUSIVAMENTE con un JSON válido sin markdown, con esta estructura:
{
  "proveedor": "nombre del comercio",
  "nifProveedor": "NIF/CIF del emisor (formato español)",
  "fecha": "YYYY-MM-DD",
  "numeroDocumento": "número de ticket o factura",
  "baseImponible": 0.00,
  "tipoIva": 21,
  "ivaTotal": 0.00,
  "total": 0.00
}
Reglas importantes:
- Si un dato no aparece claramente, pon "" para strings y 0 para números.
- tipoIva debe ser 0, 4, 10 o 21 (porcentaje entero).
- Los importes en euros, con punto decimal (no coma).
- No inventes datos que no veas.`;

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
    // quizá incluye markdown fences
    const clean = text.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  }

  return {
    proveedor:      parsed.proveedor      || '',
    nifProveedor:   parsed.nifProveedor   || '',
    fecha:          parsed.fecha          || '',
    numeroDocumento: parsed.numeroDocumento || '',
    baseImponible:  Number(parsed.baseImponible) || 0,
    tipoIva:        Number(parsed.tipoIva) || 21,
    ivaTotal:       Number(parsed.ivaTotal) || 0,
    total:          Number(parsed.total) || 0,
    rawText:        text,
    _structured:    true
  };
}
