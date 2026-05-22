import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from '@/lib/auth';

describe('auth', () => {
  it('signs and verifies a token', async () => {
    const payload = { sub: 'user-1', tenantId: 'tenant-1', email: 'test@test.com', role: 'Admin' as const };
    const token = await signToken(payload);
    expect(token).toBeTruthy();
    const decoded = await verifyToken(token);
    expect(decoded?.sub).toBe('user-1');
    expect(decoded?.tenantId).toBe('tenant-1');
    expect(decoded?.email).toBe('test@test.com');
  });

  it('returns null for invalid token', async () => {
    const result = await verifyToken('invalid.token.here');
    expect(result).toBeNull();
  });
});
