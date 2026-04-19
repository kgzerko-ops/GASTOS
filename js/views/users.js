// ═══════════════════════════════════════════════════════════════
// VISTA USUARIOS (solo admin) — listar, activar/desactivar, cambiar rol, empresa
// ═══════════════════════════════════════════════════════════════

import { getAllUsers, updateUserProfile } from '../db.js';
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
      <button id="btn-invite" class="btn btn-primary btn-sm">📧 Invitar</button>
    </div>

    <div class="alert alert-info mb-16" style="font-size:13px">
      <strong>ℹ Cómo invitar usuarios:</strong> comparte la URL de la app con el usuario.
      Al registrarse quedará <strong>pendiente</strong> hasta que lo actives aquí.
    </div>

    <div class="card" id="users-card">
      <p class="text-muted" style="text-align:center;padding:20px">Cargando…</p>
    </div>
  `;

  container.querySelector('#btn-invite').addEventListener('click', () => showInviteInfo());

  await loadUsers(container);
}

async function loadUsers(container) {
  try {
    const users = await getAllUsers();
    users.sort((a, b) => {
      // Admins primero, luego activos, luego por email
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
          <div class="flex gap-8">
            <button class="btn btn-secondary btn-sm" data-act="edit">Configurar</button>
          </div>
        </div>
      `).join('')}
    `;

    card.querySelectorAll('[data-act="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.closest('[data-uid]').dataset.uid;
        const user = users.find(u => u.uid === uid);
        openUserEditor(user, () => loadUsers(container));
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
    <div class="alert alert-info" style="font-size:12px">
      <strong>Roles:</strong><br>
      · <b>Administrador</b>: ve y aprueba todo, gestiona usuarios, cierra meses.<br>
      · <b>Colaborador</b>: ve gastos de empresas en "Empresas visibles"; al cargar elige de esa lista.<br>
      · <b>Usuario</b>: solo ve y carga gastos propios en su empresa por defecto.<br>
      · <b>Visor</b>: solo lectura de las empresas visibles, no puede cargar nada.
    </div>
    <div class="field">
      <label style="display:flex;align-items:center;gap:8px;text-transform:none">
        <input type="checkbox" id="u-vertodos" ${user.puedeVerTodos ? 'checked' : ''}>
        <span>Puede ver todos los gastos (de todas las empresas/usuarios)</span>
      </label>
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

function showInviteInfo() {
  const { content, footer, close } = openModal('Invitar usuario', {
    footer: `<button class="btn btn-primary" data-act="copy">📋 Copiar URL</button>
             <button class="btn btn-secondary" data-act="close">Cerrar</button>`
  });
  const url = location.origin + location.pathname;
  content.innerHTML = `
    <p>Envía esta URL al usuario que quieres invitar:</p>
    <div class="field">
      <input class="input" id="invite-url" value="${escapeHtml(url)}" readonly onfocus="this.select()">
    </div>
    <div class="alert alert-info" style="font-size:13px">
      <strong>Flujo:</strong><br>
      1. El usuario abre el enlace<br>
      2. Se registra con Google o email/contraseña<br>
      3. Tú vuelves aquí y lo <strong>activas</strong> desde la lista de usuarios<br>
      4. Le configuras empresa por defecto y permisos
    </div>
  `;
  footer.querySelector('[data-act="close"]').addEventListener('click', close);
  footer.querySelector('[data-act="copy"]').addEventListener('click', () => {
    navigator.clipboard.writeText(url).then(() => showToast('URL copiada', 'success'));
  });
}
