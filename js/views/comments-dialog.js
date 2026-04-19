// ═══════════════════════════════════════════════════════════════
// DIÁLOGO DE COMENTARIOS
// ═══════════════════════════════════════════════════════════════

import { openModal, showToast, escapeHtml } from '../components/modal.js';
import { addComment, listComments } from '../db.js';
import { fmtEur, fmtDateTime } from '../utils/format.js';

export async function openCommentsDialog(expense, state) {
  const user = state.user;
  const { close, content, footer } = openModal(`Comentarios — ${expense.proveedor}`, {
    footer: `<button class="btn btn-secondary" data-act="close">Cerrar</button>`
  });

  content.innerHTML = `
    <p class="text-muted" style="font-size:13px;margin:0 0 12px">
      ${fmtEur(expense.total)} — ${escapeHtml(expense.empresa || '')}
    </p>
    <div id="comments-list" style="max-height:300px;overflow-y:auto;margin-bottom:12px">
      <div class="text-muted" style="text-align:center;padding:20px">Cargando…</div>
    </div>
    <div class="field">
      <textarea id="new-comment" class="input" rows="2" placeholder="Escribe un comentario…"></textarea>
    </div>
    <button id="btn-send" class="btn btn-primary btn-block">Enviar comentario</button>
  `;

  const list = content.querySelector('#comments-list');

  async function load() {
    try {
      const comments = await listComments(expense.id);
      if (comments.length === 0) {
        list.innerHTML = `<div class="text-muted" style="text-align:center;padding:20px;font-size:13px">Sin comentarios todavía</div>`;
        return;
      }
      list.innerHTML = comments.map(c => `
        <div style="padding:10px 12px;background:var(--surface-2);border-radius:8px;margin-bottom:6px">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:4px">
            <strong>${escapeHtml(c.name || c.email || '—')}</strong>
            <span>${fmtDateTime(c.createdAt)}</span>
          </div>
          <div style="font-size:14px;white-space:pre-wrap">${escapeHtml(c.text)}</div>
        </div>
      `).join('');
      list.scrollTop = list.scrollHeight;
    } catch (err) {
      list.innerHTML = `<div class="alert alert-danger">Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  content.querySelector('#btn-send').addEventListener('click', async () => {
    const txt = content.querySelector('#new-comment').value.trim();
    if (!txt) return;
    const btn = content.querySelector('#btn-send');
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      await addComment(expense.id, {
        uid: user.uid, email: user.email,
        name: user.displayName || user.email, text: txt
      });
      content.querySelector('#new-comment').value = '';
      await load();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Enviar comentario';
    }
  });

  footer.querySelector('[data-act="close"]').addEventListener('click', close);
  load();
}
