// ═══════════════════════════════════════════════════════════════
// AJUSTES — OCR, tema (claro/oscuro), cuenta
// ═══════════════════════════════════════════════════════════════

import { OCR_PROVIDERS, getOcrSettings, saveUserOcrSettings } from '../ocr/index.js';
import { showToast, escapeHtml } from '../components/modal.js';

const THEME_KEY = 'gastospro-theme';

export function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'light';
}
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

// Aplicar tema al cargar la app
applyTheme(getTheme());

export async function renderSettings(container, state) {
  const settings = getOcrSettings();
  const theme = getTheme();

  container.innerHTML = `
    <h2 style="margin:0 0 16px">Ajustes</h2>

    <div class="card mb-16">
      <h3>Apariencia</h3>
      <div class="field">
        <label>Tema</label>
        <div style="display:flex;gap:8px">
          <button class="btn ${theme === 'light' ? 'btn-primary' : 'btn-secondary'}" data-theme="light" style="flex:1">☀ Claro</button>
          <button class="btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}" data-theme="dark" style="flex:1">🌙 Oscuro</button>
        </div>
      </div>
    </div>

    <div class="card mb-16">
      <h3>Motor de OCR</h3>
      <p class="text-muted" style="font-size:13px;margin:0 0 12px">
        Selecciona qué servicio usa el escaneo de tickets. Si el elegido falla, cae a Tesseract automáticamente.
      </p>

      <div class="field">
        <label>Proveedor</label>
        <select class="select" id="ocr-provider">
          ${OCR_PROVIDERS.map(p => `
            <option value="${p.id}" ${p.id === (settings.provider || 'tesseract') ? 'selected' : ''}>${p.label}</option>
          `).join('')}
        </select>
      </div>

      <div class="field">
        <label>API Key Gemini</label>
        <input class="input" type="password" id="key-gemini" value="${escapeHtml(settings.keys?.gemini || '')}" placeholder="AIza…">
        <small class="text-muted">Obtener gratis: <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com/apikey</a></small>
      </div>

      <div class="field">
        <label>API Key OCR.space</label>
        <input class="input" type="password" id="key-ocrspace" value="${escapeHtml(settings.keys?.ocrSpace || '')}" placeholder="Déjalo vacío para usar la clave de pruebas">
        <small class="text-muted">Obtener gratis (25k/mes): <a href="https://ocr.space/ocrapi" target="_blank">ocr.space/ocrapi</a></small>
      </div>

      <div class="alert alert-info" style="font-size:13px">
        <strong>💡 Recomendación:</strong> Gemini da los mejores resultados en tickets españoles. Tesseract funciona sin configuración pero con menor precisión.
      </div>

      <button id="btn-save" class="btn btn-primary">Guardar ajustes</button>
    </div>

    <div class="card mb-16">
      <h3>Cuenta</h3>
      <div class="user-row" style="border:none;padding:4px 0">
        <div>
          <div class="user-name">${escapeHtml(state.user.displayName || state.user.email)}</div>
          <div class="user-meta">${escapeHtml(state.user.email)}</div>
          <div class="user-meta">Rol: <strong>${state.user.role}</strong> · Empresa: <strong>${escapeHtml(state.user.empresa || '—')}</strong></div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Sobre GastósPro v5</h3>
      <p style="font-size:13px;color:var(--text-muted);margin:0 0 8px">
        Aplicación para gestión de gastos con formato legal español.<br>
        Stack: ES6 + Firestore + Cloudinary + OCR híbrido.
      </p>
    </div>
  `;

  // Theme switcher
  container.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
      container.querySelectorAll('[data-theme]').forEach(b => {
        b.classList.toggle('btn-primary', b.dataset.theme === btn.dataset.theme);
        b.classList.toggle('btn-secondary', b.dataset.theme !== btn.dataset.theme);
      });
      showToast(`Tema: ${btn.dataset.theme === 'dark' ? 'oscuro' : 'claro'}`, 'success');
    });
  });

  container.querySelector('#btn-save').addEventListener('click', () => {
    const provider = container.querySelector('#ocr-provider').value;
    const keys = {
      gemini:   container.querySelector('#key-gemini').value.trim(),
      ocrSpace: container.querySelector('#key-ocrspace').value.trim()
    };
    saveUserOcrSettings({ provider, keys });
    showToast('Ajustes guardados', 'success');
  });
}
