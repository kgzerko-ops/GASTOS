// ═══════════════════════════════════════════════════════════════
// AVATARES — iniciales + color estable por nombre
// ═══════════════════════════════════════════════════════════════

export function getInitials(nameOrEmail) {
  if (!nameOrEmail) return '?';
  const s = String(nameOrEmail).trim();
  // Si es email, usar parte antes del @
  const base = s.includes('@') ? s.split('@')[0] : s;
  const parts = base.replace(/[._-]/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function hueForName(s) {
  if (!s) return 0;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h) % 8;
}

/**
 * Devuelve HTML para un avatar. Tamaño: 'sm', 'md' o 'lg'.
 */
export function avatarHtml(nameOrEmail, size = 'md') {
  const initials = getInitials(nameOrEmail);
  const hue = hueForName(nameOrEmail || '');
  return `<span class="avatar avatar-${size}" data-hue="${hue}" title="${escapeAttr(nameOrEmail || '')}">${escapeAttr(initials)}</span>`;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
