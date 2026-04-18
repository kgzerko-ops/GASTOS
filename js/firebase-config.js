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
  authDomain:        "https://console.firebase.google.com/project/gastos-ticket/overview",
  projectId:         "gastos-ticket",
  storageBucket:     "gastos-ticket.appspot.com",
  messagingSenderId: "123456789012",
  appId:             "1:123456789012:web:abc123def456"
};

export const cloudinaryConfig = {
  cloudName:    "dd7b5unem",
  uploadPreset: "gastospro_unsigned"   // unsigned preset
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
