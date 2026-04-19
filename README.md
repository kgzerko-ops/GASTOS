# GastósPro v2

Gestión de gastos con formato legal español. Multi-usuario en tiempo real, OCR de tickets, roles granulares, export Excel/ZIP, libro IVA trimestral, cierres mensuales, recurrentes, kilometraje, presupuestos, aprobaciones.

Stack: **ES6 nativo** (sin bundler) · **Firestore** · **Cloudinary** · **GitHub Pages** · OCR híbrido (Gemini / OCR.space / Tesseract).

---

## 🆕 Novedades de v2

- **4 roles** (admin / colaborador / usuario / visor) con permisos diferenciados
- **ZIP con tickets** — Excel + carpeta de imágenes para la gestoría
- **Detección de duplicados** al guardar (mismo NIF + fecha + total)
- **Múltiples fotos por gasto** (hasta 5) — anverso/reverso, multipágina
- **Libro IVA trimestral** (modelo 303) con 3 hojas: facturas, resumen por tipo, casillas
- **Cierres mensuales** bloqueados — solo admin modifica gastos cerrados
- **Gastos recurrentes** — alquileres, nóminas, suministros generados auto cada mes
- **Kilometraje** con tarifa €/km configurable (0,26 € por defecto, RD 2023)
- **Comentarios** por gasto — hilo entre cargador y aprobador
- **Ranking colaboradores** — admin ve quién ha cargado más este mes
- **Badge rojo** en tab "Gastos" con pendientes de aprobar (solo admin)
- **Kilometraje** como tipo especial de gasto (FAB con menú)

---

## 🚀 Puesta en marcha

### 1. Firebase

1. Crea proyecto en https://console.firebase.google.com/
2. **Authentication** → Sign-in method → activa Email/Password + Google
3. **Firestore Database** → Create → modo producción, región `eur3`
4. **Project settings** (⚙️) → Your apps → Add web app → copia la config

Aplica estas **reglas de seguridad** (Firestore Rules):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function getUser() { return get(/databases/$(database)/documents/users/$(request.auth.uid)).data; }
    function isAdmin() { return isSignedIn() && getUser().role == 'admin'; }
    function isActive() { return isSignedIn() && getUser().active == true; }
    function isVisor() { return isSignedIn() && getUser().role == 'visor'; }
    function canWrite() { return isActive() && !isVisor(); }

    match /users/{uid} {
      allow read:   if isSignedIn() && (request.auth.uid == uid || isAdmin());
      allow create: if isSignedIn() && request.auth.uid == uid;
      allow update: if isAdmin() || (request.auth.uid == uid
                       && !('role' in request.resource.data.diff(resource.data).affectedKeys())
                       && !('active' in request.resource.data.diff(resource.data).affectedKeys())
                       && !('puedeVerTodos' in request.resource.data.diff(resource.data).affectedKeys()));
      allow delete: if isAdmin();
    }

    match /expenses/{id} {
      allow read:   if isActive();
      allow create: if canWrite() && request.resource.data.createdByUid == request.auth.uid;
      allow update: if isAdmin() || (canWrite() && resource.data.createdByUid == request.auth.uid);
      allow delete: if isAdmin() || (canWrite() && resource.data.createdByUid == request.auth.uid);

      match /comments/{cid} {
        allow read:   if isActive();
        allow create: if canWrite() && request.resource.data.uid == request.auth.uid;
        allow delete: if isAdmin();
      }
    }

    match /budgets/{id} {
      allow read:  if isSignedIn();
      allow write: if isAdmin();
    }

    match /events/{id} {
      allow read:  if isActive();
      allow write: if canWrite();
    }

    match /closures/{id} {
      allow read:  if isSignedIn();
      allow write: if isAdmin();
    }

    match /recurring/{id} {
      allow read:  if isActive();
      allow write: if isAdmin();
    }

    match /invites/{code} {
      // Cualquiera autenticado puede LEER una invitación (necesario para validarla
      // al crear perfil tras registrarse). Solo admin crea/borra. El propio
      // usuario recién creado marca la invitación como "used".
      allow read:   if isSignedIn();
      allow create: if isAdmin();
      allow delete: if isAdmin();
      allow update: if isSignedIn()
                    && resource.data.email == request.auth.token.email
                    && !resource.data.used
                    && request.resource.data.used == true;
    }
  }
}
```

### 2. Cloudinary

1. Crea cuenta gratis en https://cloudinary.com (25 GB)
2. **Settings → Upload → Upload presets → Add upload preset**
3. Signing Mode: **Unsigned** ⚠️ importante
4. Folder: `gastospro/tickets`
5. Copia el **cloud_name** (Dashboard arriba) y el **preset name**

### 3. Configurar la app

Edita `js/firebase-config.js` con tus valores:

```javascript
export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "xxx.firebaseapp.com",
  projectId: "xxx",
  storageBucket: "xxx.appspot.com",
  messagingSenderId: "00000",
  appId: "1:00000:web:xxx"
};

export const cloudinaryConfig = {
  cloudName: "tu-cloud",
  uploadPreset: "tu-preset"
};

export const bootstrapAdminEmail = "tu@email.com";
export const defaultCompanyName = "Mi Empresa";
```

### 4. Deploy en GitHub Pages

```bash
git add .
git commit -m "GastósPro v2"
git push
```

En GitHub: **Settings → Pages → Source: main / root** → Save.

⚠️ Añade tu dominio (`tu-usuario.github.io`) a **Firebase Auth → Settings → Authorized domains**.

### 5. OCR (opcional)

Desde **Ajustes** dentro de la app, elige el motor y añade la API key si procede:
- **Gemini Vision** (mejor precisión): https://aistudio.google.com/apikey
- **OCR.space** (25k/mes gratis): https://ocr.space/ocrapi
- **Tesseract.js** (local, sin key, por defecto)

---

## 👥 Roles

| Rol | Cargar | Ver | Aprobar | Admin |
|-----|--------|-----|---------|-------|
| **Administrador** | todo | todo | sí | sí |
| **Colaborador** | en empresas visibles | de empresas visibles | no | no |
| **Usuario** | su empresa | sus gastos | no | no |
| **Visor** | no | empresas visibles | no | no |

## 🎟 Sistema de invitaciones

El registro abierto está desactivado. Los usuarios nuevos solo entran de dos maneras:

**1. Login con Google directo** (para quien ya sabe que está autorizado)
Si se loguean con Google sin código de invitación, crean un perfil automático pero **inactivo**. El admin debe activarlos manualmente desde la pestaña Usuarios, o simplemente eliminarlos si son desconocidos.

**2. Invitación por código (recomendado)**
- El admin va a **Usuarios → + Invitar por código** y rellena: email, rol, empresa, etc.
- Se genera un código de 6 caracteres y un link `https://tu-app/?invite=A3K9M2`
- El admin comparte el link por WhatsApp/email con el invitado
- El invitado abre el link, elige entre Google o crear contraseña, y queda activado automáticamente con el rol y empresa preconfigurados
- Cada código **caduca a los 7 días** y solo puede usarse **una vez**
- Los códigos activos se listan en la parte superior de la pestaña Usuarios, donde pueden revocarse en cualquier momento

---

## 📋 Funcionalidades principales

- Login email/contraseña o Google con aprobación manual del admin
- **Panel** con KPIs y gráfico últimos 6 meses
- Tickets con campos legales ES (NIF, IVA 0/4/10/21%, IRPF, forma pago)
- **Escaneo OCR** con extracción automática y confirmación antes de guardar
- Multi-foto por gasto (anverso/reverso o factura multipágina)
- Filtros Hoy/Semana/Mes/Personalizado + búsqueda + estado + categoría + empresa + evento
- Export **Excel** simple o **ZIP** (Excel + imágenes en carpeta)
- **Libro IVA trimestral** (modelo 303) con 3 hojas
- **Presupuesto mensual por empresa** con alerta 80% y pendiente al 100%
- **Cierres mensuales** — admin bloquea meses tras presentar impuestos
- **Recurrentes** — alquileres/suministros se crean automáticos cada mes
- **Kilometraje** con auto-cálculo €/km
- **Comentarios** por gasto — hilo conversacional
- **Eventos/proyectos** para agrupar gastos
- **Aprobación** con nota obligatoria en rechazos
- **Ranking** colaboradores del mes (solo admin)
- Detección de duplicados al guardar
- Tiempo real con `onSnapshot` + caché offline IndexedDB
- PWA instalable

---

## 🗂 Estructura

```
gastospro/
├── index.html
├── manifest.json
├── css/styles.css
├── README.md
└── js/
    ├── app.js              # router + bootstrap
    ├── firebase-config.js  # ⚠ rellenar
    ├── auth.js             # Firebase Auth + perfiles
    ├── db.js               # Firestore + IndexedDB + cierres + recurrentes
    ├── roles.js            # 4 roles y permisos
    ├── storage.js          # upload Cloudinary
    ├── ocr/
    │   ├── index.js        # dispatcher
    │   ├── tesseract.js
    │   ├── ocrspace.js
    │   ├── gemini.js
    │   └── parser.js       # texto → campos fiscales
    ├── views/
    │   ├── dashboard.js    # Panel
    │   ├── expenses.js     # Lista de gastos + ZIP
    │   ├── expense-form.js # Formulario crear/editar
    │   ├── scan-dialog.js  # Progreso OCR
    │   ├── users.js        # Admin usuarios (4 roles)
    │   ├── reports.js      # Reportes + ranking
    │   ├── budgets.js      # Presupuestos por empresa
    │   ├── settings.js     # Ajustes OCR
    │   ├── closures.js     # Cierres mensuales
    │   ├── iva.js          # Libro IVA trimestral
    │   ├── recurring.js    # Gastos recurrentes
    │   ├── mileage.js      # Kilometraje
    │   └── comments-dialog.js
    ├── components/
    │   ├── modal.js
    │   └── charts.js
    └── utils/
        ├── format.js       # € / fechas / NIF
        ├── filters.js      # Filtros por período
        ├── export-xlsx.js  # Excel simple
        ├── export-zip.js   # ZIP con tickets
        └── iva-book.js     # Modelo 303
```

---

## 🛠 Troubleshooting

- **"Configuración pendiente"** → edita `js/firebase-config.js`
- **Spinner infinito** → revisa consola; suele ser Firestore sin crear o reglas mal
- **auth/invalid-api-key** → key mal pegada, debe empezar por `AIzaSy`
- **auth/unauthorized-domain** → añade tu dominio GH Pages a Firebase Auth → Settings → Authorized domains
- **Permission denied en Firestore** → reglas + usuario con `active: true`
- **No soy admin** → Firestore Console → `users/{uid}` → `role: "admin"`, `active: true`
- **Cloudinary 401** → preset debe ser **Unsigned**
- **Índice Firestore** → si pide crear un índice compuesto, la consola da link directo

---

Licencia: uso propio. Integrable con BeUnifyT / ControlUnificado.
