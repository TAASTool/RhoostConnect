// Test setup - set required env vars
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.JWT_SECRET = 'test-secret-for-unit-tests-minimum-length';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
