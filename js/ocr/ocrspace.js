// ═══════════════════════════════════════════════════════════════
// OCR.SPACE API — free tier 25k requests/mes
// https://ocr.space/ocrapi
// ═══════════════════════════════════════════════════════════════

/**
 * Procesa imagen o PDF vía OCR.space.
 * apiKey: obténla gratis en https://ocr.space/ocrapi  (o usa "helloworld" para pruebas, muy limitada)
 */
export async function ocrWithOcrSpace(file, apiKey = 'helloworld') {
  const url = 'https://api.ocr.space/parse/image';

  const fd = new FormData();
  fd.append('file', file);
  fd.append('language', 'spa');
  fd.append('isOverlayRequired', 'false');
  fd.append('detectOrientation', 'true');
  fd.append('scale', 'true');
  fd.append('OCREngine', '2'); // Engine 2 es más preciso
  fd.append('apikey', apiKey);

  const res = await fetch(url, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('OCR.space HTTP ' + res.status);

  const json = await res.json();
  if (json.IsErroredOnProcessing) {
    throw new Error(json.ErrorMessage?.[0] || 'OCR.space error');
  }
  const parsed = (json.ParsedResults || []).map(r => r.ParsedText || '').join('\n');
  return parsed;
}
