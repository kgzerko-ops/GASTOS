// ═══════════════════════════════════════════════════════════════
// STORAGE — Cloudinary (unsigned upload)
// ═══════════════════════════════════════════════════════════════

import { cloudinaryConfig } from './firebase-config.js';

/**
 * Sube un File/Blob a Cloudinary.
 * Retorna { secure_url, public_id, format, bytes }.
 */
export async function uploadTicketImage(file, onProgress) {
  if (!cloudinaryConfig.cloudName || cloudinaryConfig.cloudName === 'TU_CLOUD_NAME') {
    throw new Error('Cloudinary no configurado (edita js/firebase-config.js)');
  }

  const url = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/auto/upload`;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', cloudinaryConfig.uploadPreset);
  fd.append('folder', 'gastospro/tickets');

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error('Upload falló: ' + xhr.responseText));
      }
    };
    xhr.onerror = () => reject(new Error('Error de red al subir'));
    xhr.send(fd);
  });
}

/**
 * Comprime imagen antes de subir (reduce a max 1600px lado mayor, JPEG 0.85).
 */
export async function compressImage(file) {
  if (!file.type.startsWith('image/')) return file;
  if (file.size < 300 * 1024) return file;  // < 300KB no comprime

  const img = await loadImage(file);
  const MAX = 1600;
  let { width, height } = img;
  if (width > MAX || height > MAX) {
    const ratio = Math.min(MAX / width, MAX / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve(file);
      resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.85);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Garantiza un File JPEG válido para OCR, aunque el original sea HEIC/WEBP/etc.
 * Si la conversión local falla (típico en iPhone con HEIC), descarga desde Cloudinary
 * la URL forzando formato JPG (Cloudinary siempre convierte correctamente).
 */
export async function ensureJpegForOcr(file, cloudinaryUrl) {
  // Si es PDF, Gemini lo lee nativamente, lo devolvemos tal cual
  if (file.type === 'application/pdf') return file;

  // Intento 1: conversión local vía canvas
  try {
    const img = await loadImage(file);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    if (canvas.width === 0 || canvas.height === 0) throw new Error('Imagen vacía');
    canvas.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
    if (blob && blob.size > 1000) {
      return new File([blob], 'ticket.jpg', { type: 'image/jpeg' });
    }
    throw new Error('Blob vacío tras conversión');
  } catch (err) {
    console.warn('Conversión local a JPG falló, uso fallback Cloudinary:', err?.message);
  }

  // Intento 2: descargar desde Cloudinary forzando JPG
  if (cloudinaryUrl) {
    try {
      // Cloudinary: insertar /f_jpg/ en la URL para forzar conversión a JPG
      const jpgUrl = cloudinaryUrl.replace('/upload/', '/upload/f_jpg,q_auto/');
      const res = await fetch(jpgUrl);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      return new File([blob], 'ticket.jpg', { type: 'image/jpeg' });
    } catch (err) {
      console.warn('Fallback Cloudinary también falló:', err?.message);
    }
  }

  // Último recurso: devolver el original y rezar
  return file;
}
