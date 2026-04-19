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

const firebaseConfig = {
  apiKey: "AIzaSyDlxwt3s6RuJBpHI6JcVVt_sYOJWlwv61g",
  authDomain: "gastospro-final.firebaseapp.com",
  projectId: "gastospro-final",
  storageBucket: "gastospro-final.firebasestorage.app",
  messagingSenderId: "305811655043",
  appId: "1:305811655043:web:42b9baae6b829c33634eb6"
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
