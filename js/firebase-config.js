// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN — RELLENA ESTOS DATOS ANTES DE USAR LA APP
// ═══════════════════════════════════════════════════════════════
//
// 1. Crea proyecto en https://console.firebase.google.com/
// 2. Activa Authentication (Email/Password + Google)
// 3. Activa Firestore Database
// 4. Copia la config desde Project Settings > General > Your apps > SDK config
//
// Para Cloudinary:
// 1. Crea cuenta en https://cloudinary.com
// 2. Settings > Upload > Add upload preset > Unsigned
// 3. Copia cloud_name y el upload_preset_name
//
// Para OCR (opcional):
// - OCR.space: https://ocr.space/ocrapi (free tier 25k/mes, solo imágenes)
// - Gemini:    https://aistudio.google.com/apikey (free tier)
//
// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN FIREBASE + CLOUDINARY
// ═══════════════════════════════════════════════════════════════

export const firebaseConfig = {
  apiKey: "AIzaSyDlYo8e_GHhJCWvNyU5GGC2XUMk-76M08A",
  authDomain: "gastos-ticket.firebaseapp.com",
  projectId: "gastos-ticket",
  storageBucket: "gastos-ticket.firebasestorage.app",
  messagingSenderId: "304506437977",
  appId: "1:304506437977:web:845e58788a9a12aa730c48"
};

export const cloudinaryConfig = {
  cloudName: "dd7b5unem",
  uploadPreset: "u7s9ytmy"
};

export const bootstrapAdminEmail = "kgzerko@gmail.com";
export const defaultCompanyName = "SMART CONGRESS";

export const defaultOcrKeys = {
  gemini: "",
  ocrSpace: ""
};

// Primer email que al registrarse recibe rol "admin" automáticamente.
// Déjalo vacío ("") si prefieres asignar admin manualmente desde Firestore.
export const bootstrapAdminEmail = "";

// Nombre de empresa por defecto para usuarios nuevos sin asignación.
export const defaultCompanyName = "Mi Empresa";
