import { useAuthStore } from '@/stores/authStore';

const PRIVILEGED_ADMIN_ROLES = new Set(['admin', 'normal_admin']);

export function normalizeUserRole(role: unknown): string {
  return typeof role === 'string' ? role.trim().toLowerCase() : '';
}

export function isPrivilegedAdminRole(role: unknown): boolean {
  const normalized = normalizeUserRole(role);
  return normalized.length > 0 && PRIVILEGED_ADMIN_ROLES.has(normalized);
}

export function isCurrentUserPrivilegedAdmin(): boolean {
  const role = useAuthStore.getState().user?.role;
  return isPrivilegedAdminRole(role);
}
