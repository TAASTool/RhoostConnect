import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, hashApiKey, generateApiKey } from '@/lib/crypto';

describe('crypto', () => {
  it('encrypts and decrypts correctly', () => {
    const plaintext = 'my-secret-api-key-12345';
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it('produces different ciphertexts for same input (random IV)', () => {
    const text = 'same-text';
    expect(encrypt(text)).not.toBe(encrypt(text));
  });

  it('hashes api keys consistently', () => {
    const key = 'rc_test123';
    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key)).not.toBe(key);
  });

  it('generates api keys with rc_ prefix', () => {
    const key = generateApiKey();
    expect(key).toMatch(/^rc_[a-f0-9]{64}$/);
  });
});
