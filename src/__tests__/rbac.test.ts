import { describe, it, expect } from 'vitest';
import { hasRole, canMutate, canAdmin, canOwn } from '@/lib/rbac';

describe('rbac', () => {
  it('Owner has all permissions', () => {
    expect(hasRole('Owner', 'Owner')).toBe(true);
    expect(hasRole('Owner', 'Admin')).toBe(true);
    expect(hasRole('Owner', 'Operator')).toBe(true);
    expect(hasRole('Owner', 'Viewer')).toBe(true);
  });

  it('Viewer cannot mutate', () => {
    expect(canMutate('Viewer')).toBe(false);
    expect(canAdmin('Viewer')).toBe(false);
    expect(canOwn('Viewer')).toBe(false);
  });

  it('Operator can mutate but not admin', () => {
    expect(canMutate('Operator')).toBe(true);
    expect(canAdmin('Operator')).toBe(false);
  });

  it('Admin can admin but not own', () => {
    expect(canAdmin('Admin')).toBe(true);
    expect(canOwn('Admin')).toBe(false);
  });

  it('unknown role has no permissions', () => {
    expect(canMutate('Unknown')).toBe(false);
  });
});
