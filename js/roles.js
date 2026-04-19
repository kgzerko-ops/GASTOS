// ═══════════════════════════════════════════════════════════════
// ROLES Y PERMISOS — lógica centralizada
// ═══════════════════════════════════════════════════════════════

export const ROLES = {
  ADMIN: 'admin', COLABORADOR: 'colaborador', USER: 'user', VISOR: 'visor'
};

export const ROLE_LABELS = {
  admin: 'Administrador',
  colaborador: 'Colaborador',
  user: 'Usuario',
  visor: 'Visor (solo lectura)'
};

export function isAdmin(user)       { return user?.role === 'admin'; }
export function isColaborador(user) { return user?.role === 'colaborador'; }
export function isVisor(user)       { return user?.role === 'visor'; }
export function isUser(user)        { return user?.role === 'user' || !user?.role; }

export function canCreate(user) {
  return user && user.role !== 'visor' && user.active !== false;
}

export function canEdit(user, expense) {
  if (!user || user.active === false) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'visor') return false;
  return expense?.createdByUid === user.uid;
}

export function canDelete(user, expense) { return canEdit(user, expense); }
export function canApprove(user) { return isAdmin(user); }
export function canAdminPanel(user) { return isAdmin(user); }

export function availableCompanies(user) {
  if (!user) return [];
  if (user.role === 'admin' || user.puedeVerTodos) {
    return user.empresasVisibles || [user.empresa].filter(Boolean);
  }
  if (user.role === 'colaborador') {
    return user.empresasVisibles || [user.empresa].filter(Boolean);
  }
  return [user.empresa].filter(Boolean);
}

export function filterVisibleExpenses(expenses, user) {
  if (!user) return [];
  if (user.role === 'admin' || user.puedeVerTodos) return expenses;
  if (user.role === 'colaborador' || user.role === 'visor') {
    const visibles = new Set(user.empresasVisibles || []);
    return expenses.filter(e => visibles.has(e.empresa) || e.createdByUid === user.uid);
  }
  return expenses.filter(e => e.createdByUid === user.uid);
}
