import type { Role } from '@/types';

const ROLE_WEIGHTS: Record<Role, number> = {
  super_admin: 99,
  Owner: 4,
  Admin: 3,
  Operator: 2,
  Viewer: 1,
};

export function hasRole(userRole: string, requiredRole: Role): boolean {
  const userWeight = ROLE_WEIGHTS[userRole as Role] ?? 0;
  const requiredWeight = ROLE_WEIGHTS[requiredRole];
  return userWeight >= requiredWeight;
}

export function canMutate(role: string): boolean {
  return hasRole(role, 'Operator');
}

export function canAdmin(role: string): boolean {
  return hasRole(role, 'Admin');
}

export function canOwn(role: string): boolean {
  return hasRole(role, 'Owner');
}

export function isSuperAdmin(role: string): boolean {
  return role === 'super_admin';
}

export function canManageUsers(role: string): boolean {
  return hasRole(role, 'Owner');
}
