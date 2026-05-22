import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';
import { checkRateLimit } from '@/lib/rate-limit';
import { runWorkflow } from '@/lib/workflow-runner';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest, { params }: { params: { tenantPath: string; hookPath: string } }) {
  const rl = checkRateLimit(`webhook:${params.tenantPath}`, 100, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  const tenant = await prisma.tenant.findFirst({ where: { id: params.tenantPath } });
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const hook = await prisma.webhookEndpoint.findFirst({
    where: { tenantId: params.tenantPath, path: params.hookPath, enabled: true },
  });
  if (!hook) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const rawBody = await req.text();
  const secret = decrypt(hook.secretEncrypted);
  const sig = req.headers.get('x-hub-signature-256') ?? req.headers.get('x-webhook-signature');

  if (sig) {
    const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
    if (sig !== expected) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { payload = { raw: rawBody }; }

  logger.info('Webhook received', { hookId: hook.id, tenantId: tenant.id });

  const workflows = await prisma.workflow.findMany({
    where: { tenantId: tenant.id, enabled: true },
  });

  const triggered: string[] = [];
  for (const wf of workflows) {
    const def = JSON.parse(wf.definitionJson);
    const triggerNode = def.nodes?.find((n: any) => n.type === 'trigger.webhook' && n.config?.webhookId === hook.id);
    if (triggerNode) {
      try {
        const runId = await runWorkflow(wf.id, tenant.id, payload as Record<string, unknown>);
        triggered.push(runId);
      } catch (err) {
        logger.error('Webhook workflow trigger failed', { workflowId: wf.id, err: String(err) });
      }
    }
  }

  return NextResponse.json({ received: true, triggered });
}
