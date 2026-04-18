// ═══════════════════════════════════════════════════════════════
// DISPATCHER OCR — selecciona proveedor según ajustes del usuario
// ═══════════════════════════════════════════════════════════════

import { ocrWithTesseract } from './tesseract.js';
import { ocrWithOcrSpace } from './ocrspace.js';
import { ocrWithGemini } from './gemini.js';
import { parseTicketText } from './parser.js';
import { defaultOcrKeys } from '../firebase-config.js';

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
    // Fallback a Tesseract si no era ya Tesseract
    if (provider !== 'tesseract') {
      onProgress({ status: 'Reintentando con Tesseract…', progress: 0.1 });
      const text = await ocrWithTesseract(file, (p) => {
        if (p.status === 'recognizing text') {
          onProgress({ status: 'Leyendo ticket…', progress: 0.2 + p.progress * 0.7 });
        }
      });
      const parsed = parseTicketText(text);
      onProgress({ status: 'Listo (fallback)', progress: 1 });
      return parsed;
    }
    throw err;
  }
}
