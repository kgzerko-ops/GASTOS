# GastósPro v5 + 11 mejoras — Repo completo

✅ **44 archivos JS validados** con `node --check`
✅ **49/49 tests** funcionales pasados
✅ **Lógica fiscal v5 intacta** (recargo equivalencia, IRPF auto, claves AEAT, propinas, abonos, hoteles, multi-IVA, modo oscuro, avatares, tags, invitaciones)

---

## Cómo subir esto a tu repo

### Opción A — Reemplazo completo (recomendado, 30 segundos)

1. Descomprime este ZIP en una carpeta temporal
2. Copia todo el contenido encima de tu repo local (sobreescribe lo viejo)
3. ```bash
   cd /ruta/a/tu/repo
   git tag v5-antes-mejoras  # backup en git por si quieres volver
   git push origin v5-antes-mejoras
   git add .
   git commit -m "v5 + 11 mejoras con feature flags"
   git push
   ```
4. Espera 1-2 min al deploy de GitHub Pages
5. Login admin → tab **🧪** → "Activar recomendadas"

### Opción B — Solo subir lo nuevo

Si quieres preservar los archivos exactamente como están en tu repo y solo añadir las mejoras, copia únicamente estos archivos del ZIP a tu repo (mantienen las rutas relativas):

**Archivos NUEVOS (no chocan con nada):**
- `js/utils/feature-flags.js`
- `js/utils/device.js`
- `js/utils/nif-validation.js`
- `js/utils/image-preprocess.js`
- `js/utils/quick-capture.js`
- `js/utils/camera-helper.js`
- `js/db-vendor-memory.js`
- `js/views/experimental.js`
- `js/views/tutorial.js`
- `js/views/wizard-setup.js`

**Archivos MODIFICADOS (sustituyen los tuyos):**
- `index.html` (+1 tab Experimental)
- `js/app.js` (+ imports + tutorial + wizard + experimental routing)
- `js/views/expense-form.js` (+ memoria proveedor + validación NIF reforzada)
- `js/views/scan-dialog.js` (+ preview imagen + score confianza)
- `js/views/settings.js` (+ card Experimental para admin)
- `js/ocr/index.js` (+ pre-procesado imagen opcional)
- `js/ocr/parser.js` (+ función attachStructuredConfidence al final)

---

## Las 11 mejoras (todas con feature flag, OFF por defecto)

| # | Mejora | Feature flag |
|---|---|---|
| 1 | Memoria por NIF (auto-completa proveedores) | `vendor-memory` |
| 2 | Validación NIF reforzada (DNI/NIE/CIF + dígito de control) | `nif-validation-enhanced` |
| 3 | Modal OCR híbrido con preview imagen | `ocr-hybrid-modal` |
| 4 | Detección móvil/escritorio | `device-detect` |
| 5 | Stepper móvil guiado | `mobile-stepper` (no integrado en v5*) |
| 6 | Cámara nativa con guías | `camera-guides` (helper disponible*) |
| 7 | Score de confianza por campo | `confidence-score` |
| 8 | Captura rápida por tipo | `quick-capture` (helper disponible*) |
| 9 | Tutorial interactivo primer uso | `tutorial-first-use` |
| 10 | Wizard configuración inicial admin | `setup-wizard` |
| 11 | Pre-procesar imagen antes OCR | `image-preprocess` |

\* Las features 5, 6, 8 tienen el código disponible pero **no están enchufadas al flujo principal de v5** porque tu v5 ya tiene un flujo OCR avanzado (multi-IVA, propinas, recargo equivalencia, hoteles, matrículas) que es mucho mejor que un stepper genérico. Si quieres usarlas, llámalas manualmente desde tu código o pídeme integración específica.

---

## Antes de subir

### 1. Reglas Firestore

Añade el bloque de `FIRESTORE-RULES.txt` a tus reglas existentes en Firebase Console → Firestore → Rules. Sin esto, la memoria por NIF no funcionará (la app no se rompe, solo esa feature concreta).

### 2. Backup en Git (recomendado)

```bash
cd /ruta/a/tu/repo
git tag v5-antes-mejoras
git push origin v5-antes-mejoras
```

Si algo falla después, vuelves con: `git reset --hard v5-antes-mejoras && git push --force`

---

## Auto-protección

Cada feature está envuelta en `withFeature(name, fn, fallback)`. Si una falla 3 veces en una sesión:
1. Se desactiva sola
2. Toast: "Feature desactivada por errores"
3. App vuelve al comportamiento v5 normal

Cero riesgo para tu lógica fiscal.

---

## Cómo verificar después de subir

1. Login carga normalmente con Google ✓
2. Ves el tab **🧪** en la barra superior (solo si admin) ✓
3. Tu lógica fiscal v5 sigue intacta:
   - Recargo equivalencia funciona ✓
   - IRPF auto sugerido funciona ✓
   - Multi-IVA en scan-dialog funciona ✓
   - Hoteles con pernoctas funciona ✓
   - Modo oscuro funciona ✓
4. Click en **🧪** → ves los 11 toggles
5. Activa "Activar recomendadas" → 4 features fundacionales activas:
   - Memoria proveedores
   - Validación NIF reforzada
   - Detección dispositivo
   - Pre-procesado imagen

## Si algo falla

1. Tab **🧪** → desactiva la feature problemática
2. Recarga
3. La app vuelve al comportamiento v5 normal

Si persiste un error grave: `git reset --hard v5-antes-mejoras && git push --force` en 30 segundos.

---

## Archivos del ZIP

```
gastospro-v5-completo/
├── README.md (este archivo)
├── FIRESTORE-RULES.txt
├── tests-output.txt
├── run-tests.mjs
├── index.html (modificado: +tab 🧪)
├── manifest.json
├── README.md  ← TU README v5 original (sobrescribirá éste si descomprimes encima — ojo)
├── css/
│   └── styles.css (sin tocar)
└── js/
    ├── app.js (modificado)
    ├── auth.js (sin tocar)
    ├── db.js (sin tocar)
    ├── db-vendor-memory.js (NUEVO)
    ├── firebase-config.js (sin tocar)
    ├── roles.js (sin tocar)
    ├── storage.js (sin tocar)
    ├── components/
    │   ├── modal.js (sin tocar)
    │   └── charts.js (sin tocar)
    ├── ocr/
    │   ├── index.js (modificado: pre-procesado)
    │   ├── parser.js (modificado: +attachStructuredConfidence al final)
    │   ├── gemini.js (sin tocar)
    │   ├── ocrspace.js (sin tocar)
    │   └── tesseract.js (sin tocar)
    ├── utils/
    │   ├── avatar.js (sin tocar)
    │   ├── format.js (sin tocar)
    │   ├── filters.js (sin tocar)
    │   ├── fiscal.js (sin tocar)
    │   ├── sanitize.js (sin tocar)
    │   ├── iva-book.js (sin tocar)
    │   ├── export-xlsx.js (sin tocar)
    │   ├── export-zip.js (sin tocar)
    │   ├── feature-flags.js (NUEVO)
    │   ├── device.js (NUEVO)
    │   ├── nif-validation.js (NUEVO)
    │   ├── image-preprocess.js (NUEVO)
    │   ├── quick-capture.js (NUEVO)
    │   └── camera-helper.js (NUEVO)
    └── views/
        ├── dashboard.js (sin tocar)
        ├── expenses.js (sin tocar)
        ├── expense-form.js (modificado: +memoria proveedor +validación NIF reforzada)
        ├── scan-dialog.js (modificado: +preview imagen +confidence score)
        ├── users.js (sin tocar)
        ├── reports.js (sin tocar)
        ├── budgets.js (sin tocar)
        ├── settings.js (modificado: +card Experimental para admin)
        ├── closures.js (sin tocar)
        ├── iva.js (sin tocar)
        ├── recurring.js (sin tocar)
        ├── mileage.js (sin tocar)
        ├── comments-dialog.js (sin tocar)
        ├── experimental.js (NUEVO)
        ├── tutorial.js (NUEVO)
        └── wizard-setup.js (NUEVO)
```

⚠️ **Importante**: este `README.md` que estás leyendo es el del paquete de instalación. Si descomprimes el ZIP **encima** de tu repo, sobrescribirá tu README v5. Renombra este `README.md` a `INSTALAR-MEJORAS.md` antes de copiar, o simplemente no copies el README.
