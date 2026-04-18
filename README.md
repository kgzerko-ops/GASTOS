# GastósPro

Gestión de gastos con formato legal español. Stack: **ES6 nativo + Firestore + Cloudinary + OCR híbrido**. Sin bundler, sin framework. Listo para GitHub Pages.

---

## Características

- **Autenticación** Google + email/password con roles `admin` / `user`
- **Escaneo de tickets** con 3 motores OCR intercambiables (Gemini, OCR.space, Tesseract local)
- **Campos fiscales españoles**: NIF/CIF, base imponible, IVA (0/4/10/21%), IRPF, forma de pago
- **Multi-usuario** en tiempo real con permisos granulares (ver solo los míos / por empresa / todos)
- **Eventos/proyectos** con presupuesto y tracking de gasto
- **Presupuesto mensual por empresa** con alertas y fuerza de estado pendiente al superarse
- **Panel con KPIs**, gráficos mensuales, reportes admin con comparativa mes actual vs anterior
- **Export a Excel** real (.xlsx) con totales y formato de euros
- **Filtros**: Hoy / Semana / Mes / Personalizado / Todos + búsqueda + estado + categoría + empresa + evento
- **PWA instalable** en móvil y escritorio
- **Caché IndexedDB** para consulta offline

---

## Setup (10 minutos)

### 1. Firebase

1. Ir a [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
2. En el proyecto:
   - **Authentication** → Sign-in method → habilitar **Google** y **Email/Password**
   - **Firestore Database** → Create database → modo **production** (region: europe-west)
3. **Project Settings** (⚙️) → **Your apps** → icono `</>` → registrar app web y copiar el objeto `firebaseConfig`

### 2. Cloudinary

1. Cuenta gratuita en [cloudinary.com](https://cloudinary.com) (25 GB free)
2. **Settings** → **Upload** → **Add upload preset**
   - Signing Mode: **Unsigned**
   - Folder: `gastospro/tickets` (opcional)
   - Guardar y copiar el **preset name**
3. Anotar también el **Cloud name** (Dashboard → Account Details)

### 3. Configurar la app

Editar `js/firebase-config.js`:

```js
export const firebaseConfig = {
  apiKey: "…", authDomain: "…", projectId: "…",
  storageBucket: "…", messagingSenderId: "…", appId: "…"
};

export const cloudinaryConfig = {
  cloudName:    "tu-cloud-name",
  uploadPreset: "tu-preset-unsigned"
};

export const bootstrapAdminEmail = "tu@email.com";  // se auto-crea como admin al registrarse
export const defaultCompanyName = "Mi Empresa SL";
```

### 4. Reglas de Firestore

**Firestore Database → Rules**, pegar y publicar:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }
    function isActive() {
      return isSignedIn() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.active == true;
    }
    function isAdmin() {
      return isActive() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    function canSeeAll() {
      return isActive() && (isAdmin() ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.puedeVerTodos == true);
    }

    // Perfiles: cada usuario lee/crea el suyo; admin modifica cualquiera
    match /users/{uid} {
      allow read: if isSignedIn() && (request.auth.uid == uid || isAdmin());
      allow create: if isSignedIn() && request.auth.uid == uid;
      allow update, delete: if isAdmin() ||
        (request.auth.uid == uid &&
         !(request.resource.data.role != resource.data.role ||
           request.resource.data.active != resource.data.active ||
           request.resource.data.puedeVerTodos != resource.data.puedeVerTodos));
    }

    // Gastos
    match /expenses/{id} {
      allow read: if isActive() &&
        (canSeeAll() || resource.data.createdByUid == request.auth.uid);
      allow create: if isActive() &&
        request.resource.data.createdByUid == request.auth.uid;
      allow update: if isActive() &&
        (isAdmin() || resource.data.createdByUid == request.auth.uid);
      allow delete: if isActive() &&
        (isAdmin() || resource.data.createdByUid == request.auth.uid);
    }

    // Presupuestos y eventos: solo admin escribe, activos leen
    match /budgets/{id} {
      allow read: if isActive();
      allow write: if isAdmin();
    }
    match /events/{id} {
      allow read: if isActive();
      allow write: if isActive();
    }
  }
}
```

### 5. Probar local

```bash
# Cualquier servidor HTTP estático sirve (no abras el index.html como file:// porque los módulos ES6 no cargan)
python3 -m http.server 8080
# o
npx serve .
```

Abrir `http://localhost:8080`.

### 6. Desplegar en GitHub Pages

```bash
git init
git add .
git commit -m "GastósPro v1"
git remote add origin git@github.com:tu-usuario/gastospro.git
git push -u origin main
```

En el repo → **Settings → Pages → Source: main / root**. Tarda 1-2 min.

**Añadir el dominio de Pages a Firebase:**
Authentication → Settings → Authorized domains → `tu-usuario.github.io`.

---

## OCR: cómo elegir el motor

| Motor | Precisión en tickets ES | Setup | Coste |
|---|---|---|---|
| **Gemini 2.0 Flash** | ⭐⭐⭐⭐⭐ | API key gratis | Free tier generoso |
| **OCR.space** | ⭐⭐⭐ | API key opcional | 25k req/mes gratis |
| **Tesseract.js** | ⭐⭐ | 0 config | Totalmente local |

Cada usuario elige el suyo desde la pestaña **Ajustes** → no hace falta recompilar.

---

## Arquitectura

```
index.html                → shell + importmap
css/styles.css            → tema oscuro profesional
js/
├── app.js                → bootstrap + router de pestañas
├── firebase-config.js    → ⚠️ credenciales
├── auth.js               → login + perfil users/{uid}
├── db.js                 → Firestore wrapper + caché IndexedDB
├── storage.js            → upload a Cloudinary con compresión
├── ocr/
│   ├── index.js          → dispatcher con fallback
│   ├── tesseract.js      → local (CDN)
│   ├── ocrspace.js       → API REST
│   ├── gemini.js         → API con extracción JSON estructurada
│   └── parser.js         → regex para texto OCR → campos
├── views/
│   ├── dashboard.js      → panel con KPIs
│   ├── expenses.js       → lista + filtros + acciones
│   ├── expense-form.js   → formulario alta/edición
│   ├── scan-dialog.js    → modal de progreso OCR
│   ├── users.js          → admin: gestión de usuarios
│   ├── reports.js        → admin: gráficos + comparativa
│   ├── budgets.js        → admin: presupuestos + eventos
│   └── settings.js       → OCR provider + API keys
├── components/
│   ├── modal.js          → modal + toast + confirm
│   └── charts.js         → Chart.js wrapper
└── utils/
    ├── format.js         → €, fechas, NIF validator
    ├── filters.js        → filtrado por período + totales
    └── export-xlsx.js    → SheetJS
```

---

## Flujo de usuarios nuevos

1. Usuario abre la URL y se registra (Google o email)
2. Se crea perfil en `users/{uid}` con `active: false`
3. Usuario ve pantalla **"Acceso pendiente"**
4. El admin va a pestaña **Usuarios** → abre al usuario → marca **Activo** + configura empresa + permisos
5. El usuario recarga y ya entra normal

El email de `bootstrapAdminEmail` es la excepción: al registrarse se crea activo y admin.

---

## Licencia

MIT. Úsalo, modifícalo, véndelo.
