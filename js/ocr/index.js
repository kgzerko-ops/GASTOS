// ═══════════════════════════════════════════════════════════════
// DISPATCHER OCR — selecciona proveedor según ajustes del usuario
// ═══════════════════════════════════════════════════════════════

import { ocrWithTesseract } from './tesseract.js';
import { ocrWithOcrSpace } from './ocrspace.js';
import { ocrWithGemini } from './gemini.js';
import { parseTicketText } from './parser.js';
import { defaultOcrKeys } from '../firebase-config.js';
import { hashFile } from '../utils/sanitize.js';

// Caché en memoria del OCR por hash (duración: 1 sesión de navegador)
const ocrCache = new Map();

export const OCR_PROVIDERS = [
  { id: 'gemini',    label: '🏆 Gemini Vision (recomendado)',   needsKey: true,  keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'ocrspace',  label: '⚡ OCR.space (25k/mes gratis)',    needsKey: false, keyUrl: 'https://ocr.space/ocrapi' },
  { id: 'tesseract', label: '💾 Tesseract.js (local, gratis)',  needsKey: false, keyUrl: null }
];

function getUserOcrSettings() {
  const raw = localStorage.getItem('gastospro-ocr-settings');
  if (!raw) return { provider: 'tesseract', keys: {} };
  try {
    return JSON.parse(raw);
  } catch {
    return { provider: 'tesseract', keys: {} };
  }
}

export function saveUserOcrSettings(settings) {
  localStorage.setItem('gastospro-ocr-settings', JSON.stringify(settings));
}

export function getOcrSettings() {
  return getUserOcrSettings();
}

/**
 * Procesa un ticket con el proveedor configurado. Si falla, hace fallback a Tesseract.
 * @param {File} file - imagen o PDF
 * @param {Function} onProgress - callback({ status, progress 0..1 })
 * @returns {Object} - campos extraídos (ver parser.js)
 */
export async function scanTicket(file, onProgress = () => {}) {
  const settings = getUserOcrSettings();
  const provider = settings.provider || 'tesseract';

  // Cache por hash del archivo (evita llamar a OCR 2 veces al mismo ticket)
  let cacheKey;
  try {
    cacheKey = `${provider}-${await hashFile(file)}`;
    if (ocrCache.has(cacheKey)) {
      onProgress({ status: 'Usando caché…', progress: 1 });
      return ocrCache.get(cacheKey);
    }
  } catch {}

  const doScan = async () => {
    try {
      if (provider === 'gemini') {
        const apiKey = settings.keys?.gemini || defaultOcrKeys.gemini;
        if (!apiKey) throw new Error('Falta API key de Gemini en ajustes');
        onProgress({ status: 'Analizando con Gemini…', progress: 0.3 });
        const result = await ocrWithGemini(file, apiKey);
        onProgress({ status: 'Listo', progress: 1 });
        return result;
      }

      if (provider === 'ocrspace') {
        const apiKey = settings.keys?.ocrSpace || defaultOcrKeys.ocrSpace || 'helloworld';
        onProgress({ status: 'Enviando a OCR.space…', progress: 0.3 });
        const text = await ocrWithOcrSpace(file, apiKey);
        onProgress({ status: 'Extrayendo datos…', progress: 0.8 });
        const parsed = parseTicketText(text);
        onProgress({ status: 'Listo', progress: 1 });
        return parsed;
      }

      // Tesseract por defecto
      onProgress({ status: 'Cargando motor OCR…', progress: 0.1 });
      const text = await ocrWithTesseract(file, (p) => {
        if (p.status === 'recognizing text') {
          onProgress({ status: 'Leyendo ticket…', progress: 0.2 + p.progress * 0.7 });
        }
      });
      onProgress({ status: 'Extrayendo datos…', progress: 0.95 });
      const parsed = parseTicketText(text);
      onProgress({ status: 'Listo', progress: 1 });
      return parsed;

    } catch (err) {
      console.warn(`OCR ${provider} falló:`, err);

      // Detectar error de cuota de Gemini para mensaje claro
      const msg = String(err?.message || '');
      if (msg.includes('429') || msg.toLowerCase().includes('quota')) {
        throw new Error(
          'Has superado la cuota gratuita de Gemini (15 peticiones/min o 1.500/día).\n\n' +
          'Opciones:\n' +
          '• Espera unos minutos o hasta mañana\n' +
          '• Cambia a "OCR.space" en Ajustes (25k/mes gratis)\n' +
          '• Genera una nueva API key en aistudio.google.com/apikey'
        );
      }
      if (msg.includes('401') || msg.toLowerCase().includes('api key')) {
        throw new Error(
          'La clave de Gemini no es válida.\n\n' +
          'Ve a Ajustes y verifica que la API key está bien pegada (empieza por AIzaSy).'
        );
      }

      // Tesseract NO sabe leer PDFs — no intentar fallback en ese caso
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
      if (provider !== 'tesseract' && !isPdf) {
        onProgress({ status: 'Reintentando con Tesseract…', progress: 0.1 });
        try {
          const text = await ocrWithTesseract(file, (p) => {
            if (p.status === 'recognizing text') {
              onProgress({ status: 'Leyendo ticket…', progress: 0.2 + p.progress * 0.7 });
            }
          });
          const parsed = parseTicketText(text);
          onProgress({ status: 'Listo (fallback)', progress: 1 });
          return parsed;
        } catch (fallbackErr) {
          console.warn('Fallback Tesseract también falló:', fallbackErr);
          throw err;  // lanzamos el error original (más informativo)
        }
      }
      if (isPdf && provider !== 'gemini') {
        throw new Error('Este proveedor OCR no soporta PDFs. Cambia a Gemini en Ajustes, o sube el ticket como imagen JPG/PNG.');
      }
      throw err;
    }
  };

  const result = await doScan();
  if (cacheKey) ocrCache.set(cacheKey, result);
  return result;
}
