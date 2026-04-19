// ═══════════════════════════════════════════════════════════════
// VISTA USUARIOS (solo admin) — lista + invitaciones por código
// ═══════════════════════════════════════════════════════════════

import {
  getAllUsers, updateUserProfile, deleteUserProfile,
  createInvite, getAllInvites, deleteInvite
} from '../db.js';
import { openModal, showToast, confirmDialog, escapeHtml } from '../components/modal.js';
import { fmtDateTime } from '../utils/format.js';
import { ROLE_LABELS } from '../roles.js';

export async function renderUsers(container, state) {
  if (state.user.role !== 'admin') {
    container.innerHTML = `<div class="alert alert-danger">Acceso denegado. Solo administradores.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="flex-between mb-16">
      <div>
        <h2 style="margin:0">Usuarios</h2>
        <p class="text-muted" style="margin:2px 0 0;font-size:13px">Gestiona accesos y permisos</p>
      </div>
      <button id="btn-invite" class="btn btn-primary btn-sm">+ Invitar por código</button>
    </div>

    <div class="card mb-16" id="invites-card">
      <h3>Invitaciones activas</h3>
      <div id="invites-list" class="text-muted" style="padding:10px;font-size:13px">Cargando…</div>
    </div>

    <div class="card" id="users-card">
      <p class="text-muted" style="text-align:center;padding:20px">Cargando…</p>
    </div>
  `;

  container.querySelector('#btn-invite').addEventListener('click', () =>
    openInviteForm(state, () => { loadInvites(container); loadUsers(container); })
  );

  await Promise.all([loadUsers(container), loadInvites(container)]);
}

// ── Lista de invitaciones ──────────────────────────
async function loadInvites(container) {
  const listEl = container.querySelector('#invites-list');
  try {
    const invites = await getAllInvites();
    const now = Date.now();
    // Filtrar caducadas y usadas para mostrar solo activas
    const active = invites.filter(i => !i.used && (!i.expiresAt || i.expiresAt > now));
    const expired = invites.filter(i => i.expiresAt && i.expiresAt <= now && !i.used);

    if (active.length === 0 && expired.length === 0) {
      listEl.innerHTML = `<p style="text-align:center;margin:0">Sin invitaciones activas. Pulsa "+ Invitar por código" para crear una.</p>`;
      return;
    }

    const baseUrl = location.origin + location.pathname;

    listEl.innerHTML = `
      ${active.map(inv => {
        const diasRestantes = inv.expiresAt ? Math.max(0, Math.ceil((inv.expiresAt - now) / (1000*60*60*24))) : '∞';
        const link = `${baseUrl}?invite=${inv.code}`;
        return `
          <div class="user-row" data-code="${inv.code}">
            <div style="min-width:0">
              <div class="user-name">
                <code style="background:var(--surface-2);padding:2px 8px;border-radius:4px;font-size:14px;letter-spacing:.1em">${inv.code}</code>
                <span style="margin-left:8px">${escapeHtml(inv.email)}</span>
              </div>
              <div class="user-meta">
                ${escapeHtml(ROLE_LABELS[inv.role] || inv.role)} · ${escapeHtml(inv.empresa || '—')} · caduca en ${diasRestantes} días
              </div>
            </div>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              <button class="btn btn-primary btn-sm" data-act="copy-link">📋 Copiar link</button>
              <button class="btn btn-secondary btn-sm" data-act="copy-code">Solo código</button>
              <button class="btn btn-secondary btn-sm" data-act="delete" style="color:var(--danger)">🗑</button>
            </div>
          </div>
        `;
      }).join('')}
      ${expired.length > 0 ? `
        <details style="margin-top:12px">
          <summary style="cursor:pointer;font-size:13px;color:var(--text-muted)">${expired.length} caducada(s)</summary>
          ${expired.map(inv => `
            <div class="user-row" data-code="${inv.code}">
              <div><div class="user-name" style="opacity:.6"><code>${inv.code}</code> ${escapeHtml(inv.email)}</div>
              <div class="user-meta">Caducado · ${fmtDateTime(inv.createdAt)}</div></div>
              <button class="btn btn-secondary btn-sm" data-act="delete" style="color:var(--danger)">🗑</button>
            </div>
          `).join('')}
        </details>
      ` : ''}
    `;

    // Bindings
    listEl.querySelectorAll('[data-code]').forEach(row => {
      const code = row.dataset.code;
      const inv = invites.find(x => x.code === code);
      const link = `${baseUrl}?invite=${code}`;

      row.querySelector('[data-act="copy-link"]')?.addEventListener('click', () => {
        navigator.clipboard.writeText(link).then(() => showToast('Link copiado', 'success'));
      });
      row.querySelector('[data-act="copy-code"]')?.addEventListener('click', () => {
        navigator.clipboard.writeText(code).then(() => showToast('Código copiado', 'success'));
      });
      row.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
        const ok = await confirmDialog(`¿Eliminar invitación ${code}?`, { confirmText: 'Eliminar', danger: true });
        if (!ok) return;
        try {
          await deleteInvite(code);
          showToast('Invitación eliminada', 'success');
          await loadInvites(document.querySelector('#app-content'));
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
      });
    });
  } catch (err) {
    listEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
}

// ── Formulario de invitación ───────────────────────
async function openInviteForm(state, onCreated) {
  const { close, content, footer } = openModal('Invitar nuevo usuario', {
    footer: `
      <button class="btn btn-secondary" data-act="cancel">Cancelar</button>
      <button class="btn btn-primary" data-act="create">Generar código</button>
    `
  });

  content.innerHTML = `
    <p class="text-muted" style="font-size:13px;margin:0 0 12px">
      Generaremos un código de 6 caracteres (válido 7 días, un solo uso). Compártelo con el invitado.
    </p>

    <div class="field">
      <label>Email del invitado *</label>
      <input class="input" id="inv-email" type="email" placeholder="persona@empresa.com" required>
      <small class="text-muted">El código solo funcionará con este email exacto</small>
    </div>

    <div class="field">
      <label>Nombre visible</label>
      <input class="input" id="inv-name" placeholder="Carlos Reyes">
    </div>

    <div class="field-row">
      <div class="field">
        <label>Rol *</label>
        <select class="select" id="inv-role">
          ${Object.entries(ROLE_LABELS).map(([v, l]) => `<option value="${v}" ${v === 'user' ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Empresa por defecto</label>
        <input class="input" id="inv-empresa" placeholder="Mi Empresa">
      </div>
    </div>

    <div class="field">
      <label>Empresas visibles (una por línea, vacío = solo la de arriba)</label>
      <textarea id="inv-empresas" rows="2" placeholder="Empresa A&#10;Empresa B"></textarea>
    </div>

    <div class="field">
      <label style="display:flex;align-items:center;gap:8px;font-weight:normal;text-transform:none;letter-spacing:0">
        <input type="checkbox" id="inv-vertodos">
        <span>Ve gastos de todas las empresas y usuarios</span>
      </label>
    </div>
  `;

  footer.querySelector('[data-act="cancel"]').addEventListener('click', close);
  footer.querySelector('[data-act="create"]').addEventListener('click', async () => {
    const email = content.querySelector('#inv-email').value.trim().toLowerCase();
    if (!email || !email.includes('@')) return showToast('Email inválido', 'error');

    const payload = {
      email,
      displayName: content.querySelector('#inv-name').value.trim(),
      role: content.querySelector('#inv-role').value,
      empresa: content.querySelector('#inv-empresa').value.trim(),
      empresasVisibles: content.querySelector('#inv-empresas').value.split('\n').map(s => s.trim()).filter(Boolean),
      puedeVerTodos: content.querySelector('#inv-vertodos').checked
    };

    const btn = footer.querySelector('[data-act="create"]');
    btn.disabled = true; btn.textContent = 'Generando…';

    try {
      const { code } = await createInvite(payload, { uid: state.user.uid, email: state.user.email });
      close();
      onCreated?.();
      showInviteResult(code, email);
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
      btn.disabled = false; btn.textContent = 'Generar código';
    }
  });
}

function showInviteResult(code, email) {
  const { close, content, footer } = openModal('✅ Invitación creada', {
    footer: `<button class="btn btn-primary" data-act="close">Hecho</button>`
  });
  const link = location.origin + location.pathname + '?invite=' + code;
  content.innerHTML = `
    <p>Comparte este link con <strong>${escapeHtml(email)}</strong>:</p>

    <div class="field">
      <input class="input" id="inv-link" value="${escapeHtml(link)}" readonly style="font-size:12px" onfocus="this.select()">
    </div>
    <button id="btn-copy-link" class="btn btn-primary btn-block mb-16">📋 Copiar link</button>

    <div class="alert alert-info" style="font-size:13px">
      <strong>Código: <code style="font-size:16px;letter-spacing:.2em">${code}</code></strong><br>
      Si el invitado prefiere, puede entrar a la app y poner solo el código.
    </div>
    <button id="btn-copy-code" class="btn btn-secondary btn-block">Copiar solo el código</button>

    <p class="text-muted" style="font-size:12px;margin-top:12px">
      Este código caduca en <strong>7 días</strong> y solo se puede usar <strong>una vez</strong>.
    </p>
  `;
  content.querySelector('#btn-copy-link').addEventListener('click', () => {
    navigator.clipboard.writeText(link).then(() => showToast('Link copiado', 'success'));
  });
  content.querySelector('#btn-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(code).then(() => showToast('Código copiado', 'success'));
  });
  footer.querySelector('[data-act="close"]').addEventListener('click', close);
}

// ── Lista de usuarios ───────────────────────────
async function loadUsers(container) {
  try {
    const users = await getAllUsers();
    users.sort((a, b) => {
      if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
      if ((a.active === false) !== (b.active === false)) return a.active === false ? 1 : -1;
      return (a.email || '').localeCompare(b.email || '');
    });

    const stats = {
      total: users.length,
      admins: users.filter(u => u.role === 'admin').length,
      pendientes: users.filter(u => u.active === false).length,
      activos: users.filter(u => u.active !== false).length
    };

    const card = container.querySelector('#users-card');
    card.innerHTML = `
      <div class="stats-grid" style="margin-bottom:16px">
        <div class="stat-card"><div class="stat-label">Total</div><div class="stat-value">${stats.total}</div></div>
        <div class="stat-card"><div class="stat-label">Activos</div><div class="stat-value text-success">${stats.activos}</div></div>
        <div class="stat-card"><div class="stat-label">Pendientes</div><div class="stat-value text-warning">${stats.pendientes}</div></div>
        <div class="stat-card"><div class="stat-label">Admins</div><div class="stat-value">${stats.admins}</div></div>
      </div>

      ${users.map(u => `
        <div class="user-row" data-uid="${u.uid}">
          <div style="min-width:0">
            <div class="user-name">
              ${escapeHtml(u.displayName || u.email)}
              ${u.role === 'admin' ? '<span class="badge badge-approved" style="margin-left:6px">ADMIN</span>' : ''}
              ${u.role === 'colaborador' ? '<span class="badge" style="margin-left:6px;background:#eef2ff;color:#4338ca">COLABORADOR</span>' : ''}
              ${u.role === 'visor' ? '<span class="badge" style="margin-left:6px;background:#f5f5f4;color:#57534e">VISOR</span>' : ''}
              ${u.active === false ? '<span class="badge badge-pending" style="margin-left:6px">PENDIENTE</span>' : ''}
              ${u.puedeVerTodos ? '<span class="badge badge-approved" style="margin-left:6px;background:#ecfdf5">VE TODO</span>' : ''}
            </div>
            <div class="user-meta">${escapeHtml(u.email)} · ${escapeHtml(u.empresa || '—')}</div>
          </div>
          <div class="flex gap-8" style="flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm" data-act="edit">Configurar</button>
            <button class="btn btn-secondary btn-sm" data-act="delete" style="color:var(--danger)">🗑</button>
          </div>
        </div>
      `).join('')}
    `;

    card.querySelectorAll('[data-uid]').forEach(row => {
      const uid = row.dataset.uid;
      const u = users.find(x => x.uid === uid);

      row.querySelector('[data-act="edit"]').addEventListener('click', () => {
        openUserEditor(u, () => loadUsers(container));
      });

      row.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        if (u.uid === (window.GastosPro?.getState?.()?.user?.uid)) {
          showToast('No puedes eliminarte a ti mismo', 'error');
          return;
        }
        const ok = await confirmDialog(
          `¿Eliminar el perfil de ${u.email}?\n\nEsto borra su acceso a la app. Los gastos que cargó seguirán registrados.\n\nNota: la cuenta de Google/email queda en Firebase Auth. Si el usuario vuelve a entrar, creará un nuevo perfil pendiente.`,
          { confirmText: 'Eliminar perfil', danger: true }
        );
        if (!ok) return;
        try {
          await deleteUserProfile(uid);
          showToast('Perfil eliminado', 'success');
          await loadUsers(container);
        } catch (err) {
          showToast('Error: ' + err.message, 'error');
        }
      });
    });
  } catch (err) {
    container.querySelector('#users-card').innerHTML = `<div class="alert alert-danger">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function openUserEditor(user, onSaved) {
  const { close, content, footer } = openModal(`Configurar: ${user.email}`, {
    footer: `
      <button class="btn btn-secondary" data-act="cancel">Cancelar</button>
      <button class="btn btn-primary" data-act="save">Guardar</button>
    `
  });

  content.innerHTML = `
    <div class="field">
      <label>Nombre visible</label>
      <input class="input" id="u-name" value="${escapeHtml(user.displayName || '')}">
    </div>
    <div class="field">
      <label>Email (no editable)</label>
      <input class="input" value="${escapeHtml(user.email)}" disabled>
    </div>
    <div class="field">
      <label>Empresa por defecto</label>
      <input class="input" id="u-empresa" value="${escapeHtml(user.empresa || '')}" placeholder="Nombre de empresa">
    </div>
    <div class="field">
      <label>Empresas visibles (una por línea)</label>
      <textarea id="u-empresas" rows="3" placeholder="Mi Empresa SL&#10;Otra SA">${(user.empresasVisibles || []).join('\n')}</textarea>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Rol</label>
        <select class="select" id="u-role">
          ${Object.entries(ROLE_LABELS).map(([value, label]) => `
            <option value="${value}" ${user.role === value || (value === 'user' && !user.role) ? 'selected' : ''}>${label}</option>
          `).join('')}
        </select>
      </div>
      <div class="field">
        <label>Acceso</label>
        <select class="select" id="u-active">
          <option value="true" ${user.active !== false ? 'selected' : ''}>✓ Activo</option>
          <option value="false" ${user.active === false ? 'selected' : ''}>✗ Bloqueado</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label style="display:flex;align-items:center;gap:8px;text-transform:none">
        <input type="checkbox" id="u-vertodos" ${user.puedeVerTodos ? 'checked' : ''}>
        <span>Puede ver todos los gastos (de todas las empresas/usuarios)</span>
      </label>
    </div>
    <div class="alert alert-info" style="font-size:12px">
      <strong>Roles:</strong><br>
      · <b>Administrador</b>: ve y aprueba todo, gestiona usuarios, cierra meses.<br>
      · <b>Colaborador</b>: ve gastos de empresas en "Empresas visibles"; al cargar elige de esa lista.<br>
      · <b>Usuario</b>: solo ve y carga gastos propios en su empresa por defecto.<br>
      · <b>Visor</b>: solo lectura de las empresas visibles, no puede cargar nada.
    </div>
  `;

  footer.querySelector('[data-act="cancel"]').addEventListener('click', close);
  footer.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const data = {
      displayName:     content.querySelector('#u-name').value.trim(),
      empresa:         content.querySelector('#u-empresa').value.trim(),
      empresasVisibles: content.querySelector('#u-empresas').value.split('\n').map(s => s.trim()).filter(Boolean),
      role:            content.querySelector('#u-role').value,
      active:          content.querySelector('#u-active').value === 'true',
      puedeVerTodos:   content.querySelector('#u-vertodos').checked
    };
    try {
      await updateUserProfile(user.uid, data);
      showToast('Usuario actualizado', 'success');
      close();
      onSaved?.();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}
