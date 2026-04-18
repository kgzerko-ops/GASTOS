// ═══════════════════════════════════════════════════════════════
// OCR LOCAL — Tesseract.js (gratis, offline, español)
// ═══════════════════════════════════════════════════════════════

let tesseractLoaded = null;

async function ensureTesseract() {
  if (tesseractLoaded) return tesseractLoaded;
  tesseractLoaded = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js';
    s.onload = () => resolve(window.Tesseract);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return tesseractLoaded;
}

/**
 * Procesa una imagen con Tesseract y retorna el texto crudo.
 * onProgress recibe { status, progress (0-1) }.
 */
export async function ocrWithTesseract(imageFile, onProgress) {
  const Tesseract = await ensureTesseract();
  const url = imageFile instanceof Blob ? URL.createObjectURL(imageFile) : imageFile;
  try {
    const result = await Tesseract.recognize(url, 'spa', {
      logger: (m) => {
        if (onProgress && typeof m.progress === 'number') {
          onProgress({ status: m.status, progress: m.progress });
        }
      }
    });
    return result.data.text || '';
  } finally {
    if (imageFile instanceof Blob) URL.revokeObjectURL(url);
  }
}
