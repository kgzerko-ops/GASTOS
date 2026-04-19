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

export const firebaseConfig = {
  apiKey:            "TU_API_KEY",
  authDomain:        "tu-proyecto.firebaseapp.com",
  projectId:         "tu-proyecto",
  storageBucket:     "tu-proyecto.appspot.com",
  messagingSenderId: "000000000000",
  appId:             "1:000000000000:web:xxxxxxxxxxxxxx"
};

export const cloudinaryConfig = {
  cloudName:    "TU_CLOUD_NAME",
  uploadPreset: "TU_UPLOAD_PRESET"   // unsigned preset
};

// OCR — claves opcionales. Si no las pones, se usa Tesseract local.
// El usuario también puede configurarlas desde la pestaña "Ajustes".
export const defaultOcrKeys = {
  ocrSpace: "",   // https://ocr.space/ocrapi  (usa "helloworld" para probar, tiene límite muy bajo)
  gemini:   ""    // https://aistudio.google.com/apikey
};

// Primer email que al registrarse recibe rol "admin" automáticamente.
// Déjalo vacío ("") si prefieres asignar admin manualmente desde Firestore.
export const bootstrapAdminEmail = "";

// Nombre de empresa por defecto para usuarios nuevos sin asignación.
export const defaultCompanyName = "Mi Empresa";
