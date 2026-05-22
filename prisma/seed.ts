import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Demo tenant
  const tenant = await prisma.tenant.upsert({
    where: { id: 'demo-tenant-001' },
    update: {},
    create: {
      id: 'demo-tenant-001',
      name: 'Demo Company',
      plan: 'pro',
    },
  });

  // Demo users
  const ownerHash = await bcrypt.hash('Admin1234!', 12);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@demo.com',
      passwordHash: ownerHash,
      role: 'Owner',
    },
  });

  const viewerHash = await bcrypt.hash('Viewer1234!', 12);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'viewer@demo.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'viewer@demo.com',
      passwordHash: viewerHash,
      role: 'Viewer',
    },
  });

  // App Definitions
  const apps = [
    {
      key: 'invoice-monitor',
      name: 'Invoice Monitor',
      description: 'Monitors invoices via scheduled HTTP fetch, transforms and stores summaries.',
      version: '1.0.0',
      manifestJson: JSON.stringify({
        workflowTemplate: {
          name: 'Invoice Monitor - Scheduled Fetch',
          definition: {
            nodes: [
              {
                id: 't1',
                type: 'trigger.schedule',
                config: { cron: '*/15 * * * *', label: 'Every 15 minutes' },
              },
              {
                id: 'a1',
                type: 'action.http',
                config: { connectorId: '', endpointId: '', label: 'Fetch Invoices' },
              },
              {
                id: 'a2',
                type: 'action.transform',
                config: {
                  script: 'items.{"id": id, "amount": amount, "status": status}',
                  label: 'Extract Fields',
                },
              },
              {
                id: 'a3',
                type: 'action.notify',
                config: { channel: 'ui', message: 'Invoice sync completed', label: 'Notify' },
              },
            ],
            edges: [
              { from: 't1', to: 'a1' },
              { from: 'a1', to: 'a2' },
              { from: 'a2', to: 'a3' },
            ],
          },
        },
        pages: ['invoice-stats'],
        features: ['invoice_dashboard'],
      }),
    },
    {
      key: 'contract-alerts',
      name: 'Contract Alerts',
      description: 'Daily check for expiring contracts with automated notifications.',
      version: '1.0.0',
      manifestJson: JSON.stringify({
        workflowTemplate: {
          name: 'Contract Alerts - Daily Check',
          definition: {
            nodes: [
              {
                id: 't1',
                type: 'trigger.schedule',
                config: { cron: '0 8 * * *', label: 'Daily at 8am' },
              },
              {
                id: 'a1',
                type: 'action.http',
                config: { connectorId: '', endpointId: '', label: 'Fetch Contracts' },
              },
              {
                id: 'a2',
                type: 'action.condition',
                config: { expr: '$count(items[expiresInDays <= 30]) > 0', label: 'Has Expiring?' },
              },
              {
                id: 'a3',
                type: 'action.notify',
                config: { channel: 'ui', message: 'Contracts expiring soon!', label: 'Alert' },
              },
            ],
            edges: [
              { from: 't1', to: 'a1' },
              { from: 'a1', to: 'a2' },
              { from: 'a2', to: 'a3', when: 'true' },
            ],
          },
        },
        pages: ['contract-list'],
        features: ['contract_alerts'],
      }),
    },
    {
      key: 'user-sync',
      name: 'User Sync',
      description: 'Webhook-triggered user synchronization with write-back.',
      version: '1.0.0',
      manifestJson: JSON.stringify({
        workflowTemplate: {
          name: 'User Sync - Webhook Trigger',
          definition: {
            nodes: [
              {
                id: 't1',
                type: 'trigger.webhook',
                config: { webhookId: '', label: 'User Changed Webhook' },
              },
              {
                id: 'a1',
                type: 'action.transform',
                config: {
                  script: '{"userId": userId, "email": email, "action": eventType}',
                  label: 'Map User Fields',
                },
              },
              {
                id: 'a2',
                type: 'action.writeback',
                config: { connectorId: '', endpointId: '', label: 'Write to Target' },
              },
              {
                id: 'a3',
                type: 'action.notify',
                config: { channel: 'ui', message: 'User sync completed', label: 'Confirm' },
              },
            ],
            edges: [
              { from: 't1', to: 'a1' },
              { from: 'a1', to: 'a2' },
              { from: 'a2', to: 'a3' },
            ],
          },
        },
        pages: ['sync-status'],
        features: ['user_sync'],
      }),
    },
  ];

  for (const app of apps) {
    await prisma.appDefinition.upsert({
      where: { key: app.key },
      update: {},
      create: app,
    });
  }

  console.log('Seed complete. Demo credentials:');
  console.log('  Owner: admin@demo.com / Admin1234!');
  console.log('  Viewer: viewer@demo.com / Viewer1234!');
  console.log('  Tenant ID:', tenant.id);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
