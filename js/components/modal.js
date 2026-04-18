// ═══════════════════════════════════════════════════════════════
// MODAL + TOAST helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Abre un modal. Retorna { close, content } donde content es el <div> interno donde renderizar.
 */
export function openModal(title, { footer = null, size = 'md' } = {}) {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" data-size="${size}">
      <div class="modal-header">
        <h2>${escapeHtml(title)}</h2>
        <button class="modal-close" aria-label="Cerrar">×</button>
      </div>
      <div class="modal-body"></div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>
  `;

  const close = () => {
    backdrop.remove();
    document.body.style.overflow = '';
  };

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector('.modal-close').addEventListener('click', close);

  document.body.style.overflow = 'hidden';
  root.appendChild(backdrop);

  return {
    close,
    content: backdrop.querySelector('.modal-body'),
    footer: backdrop.querySelector('.modal-footer'),
    root: backdrop.querySelector('.modal')
  };
}

/**
 * Muestra un diálogo de confirmación. Retorna Promise<bool>.
 */
export function confirmDialog(message, { confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false } = {}) {
  return new Promise((resolve) => {
    const { close, content, footer } = openModal('Confirmar', {
      footer: `
        <button class="btn btn-secondary" data-act="cancel">${escapeHtml(cancelText)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${escapeHtml(confirmText)}</button>
      `
    });
    content.innerHTML = `<p>${escapeHtml(message)}</p>`;
    footer.querySelector('[data-act="cancel"]').addEventListener('click', () => { close(); resolve(false); });
    footer.querySelector('[data-act="ok"]').addEventListener('click', () => { close(); resolve(true); });
  });
}

/**
 * Muestra un toast temporal.
 */
export function showToast(message, type = 'info', duration = 3000) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
