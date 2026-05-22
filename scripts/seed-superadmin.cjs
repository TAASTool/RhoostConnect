'use strict';
// Runs during Vercel build (before next build).
// Creates the platform super admin if none exists yet — fully idempotent.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const EMAIL    = process.env.SUPER_ADMIN_EMAIL    || 'superadmin@rhoostconnect.nl';
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'Rhoost@Admin2025';
const TENANT_ID = 'rhoost-platform-tenant';

const prisma = new PrismaClient();

async function main() {
  // Skip if super admin already exists.
  const existing = await prisma.user.findFirst({ where: { role: 'super_admin' } });
  if (existing) {
    console.log('[seed] Super admin already exists (' + existing.email + '), nothing to do.');
    return;
  }

  // Upsert the platform tenant with a stable ID.
  await prisma.tenant.upsert({
    where:  { id: TENANT_ID },
    update: {},
    create: { id: TENANT_ID, name: 'Rhoost Platform' },
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const user = await prisma.user.create({
    data: { tenantId: TENANT_ID, email: EMAIL, passwordHash, role: 'super_admin' },
  });

  console.log('[seed] Super admin aangemaakt: ' + user.email);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    // Log but don't abort the build on seed failure.
    console.error('[seed] Fout:', e.message);
    prisma.$disconnect();
  });
