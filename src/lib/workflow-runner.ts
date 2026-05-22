import jsonata from 'jsonata';
import { prisma } from './prisma';
import { logger } from './logger';
import { decrypt } from './crypto';

interface WorkflowNode {
  id: string;
  type: string;
  config: Record<string, any>;
}

interface WorkflowEdge {
  from: string;
  to: string;
  when?: string;
}

interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export async function runWorkflow(
  workflowId: string,
  tenantId: string,
  triggerData: Record<string, any> = {}
): Promise<string> {
  const run = await prisma.workflowRun.create({
    data: { workflowId, tenantId, status: 'running' },
  });

  try {
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, tenantId },
    });
    if (!workflow) throw new Error('Workflow not found');

    const definition: WorkflowDefinition = JSON.parse(workflow.definitionJson);
    const context: Record<string, any> = { trigger: triggerData };
    const startNode = definition.nodes.find((n) => n.type.startsWith('trigger.'));
    if (!startNode) throw new Error('No trigger node found');

    await executeNode(startNode, definition, context, run.id, tenantId);

    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: 'success', finishedAt: new Date(), outputJson: JSON.stringify(context) },
    });

    logger.info('Workflow completed', { runId: run.id, workflowId, tenantId });
    return run.id;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        errorJson: JSON.stringify({ message: errMsg }),
      },
    });
    logger.error('Workflow failed', { runId: run.id, workflowId, tenantId, error: errMsg });
    throw error;
  }
}

async function executeNode(
  node: WorkflowNode,
  definition: WorkflowDefinition,
  context: Record<string, any>,
  runId: string,
  tenantId: string
): Promise<void> {
  await addRunLog(runId, 'info', `Starting node ${node.id} (${node.type})`);
  let output: any = {};

  try {
    switch (node.type) {
      case 'trigger.webhook':
      case 'trigger.manual':
        output = context.trigger ?? {};
        break;

      case 'trigger.schedule':
        output = { scheduledAt: new Date().toISOString() };
        break;

      case 'action.http': {
        const connector = await prisma.connector.findFirst({
          where: { id: node.config.connectorId, tenantId },
          include: { endpoints: true },
        });
        if (!connector) {
          await addRunLog(runId, 'warn', `Connector ${node.config.connectorId} not found, skipping`);
          output = { skipped: true };
          break;
        }
        const cfg = JSON.parse(decrypt(connector.configEncryptedJson));
        const endpoint = connector.endpoints.find((e) => e.id === node.config.endpointId);
        if (!endpoint) {
          await addRunLog(runId, 'warn', `Endpoint not found, skipping`);
          output = { skipped: true };
          break;
        }
        const url = `${cfg.baseUrl}${endpoint.path}`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (endpoint.headersJson) Object.assign(headers, JSON.parse(endpoint.headersJson));
        if (cfg.auth?.type === 'bearer') headers['Authorization'] = `Bearer ${cfg.auth.token}`;
        if (cfg.auth?.type === 'basic') {
          const b64 = Buffer.from(`${cfg.auth.username}:${cfg.auth.password}`).toString('base64');
          headers['Authorization'] = `Basic ${b64}`;
        }

        const maxRetries = node.config.maxRetries ?? 3;
        let lastErr: Error | null = null;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const res = await fetch(url, {
              method: endpoint.method,
              headers,
              body: ['POST', 'PUT', 'PATCH'].includes(endpoint.method)
                ? endpoint.bodyTemplateJson ?? undefined
                : undefined,
              signal: AbortSignal.timeout(30_000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            output = await res.json().catch(() => ({ ok: true }));
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e instanceof Error ? e : new Error(String(e));
            if (attempt < maxRetries) {
              await addRunLog(runId, 'warn', `Retry ${attempt + 1}/${maxRetries}: ${lastErr.message}`);
              await sleep(500 * Math.pow(2, attempt));
            }
          }
        }
        if (lastErr) throw lastErr;
        break;
      }

      case 'action.transform': {
        const script = node.config.script || '$$';
        const expression = jsonata(script);
        const lastOut = getLastOutput(context);
        output = (await expression.evaluate(lastOut)) ?? {};
        break;
      }

      case 'action.condition': {
        const expr = node.config.expr || 'true';
        const expression = jsonata(expr);
        const lastOut = getLastOutput(context);
        const result = await expression.evaluate(lastOut);
        output = { result: Boolean(result), data: lastOut };
        break;
      }

      case 'action.notify': {
        output = {
          notified: true,
          channel: node.config.channel ?? 'ui',
          message: node.config.message ?? '',
          ts: new Date().toISOString(),
        };
        await addRunLog(runId, 'info', `Notification: ${node.config.message}`);
        break;
      }

      case 'action.writeback': {
        output = { written: true, data: getLastOutput(context), ts: new Date().toISOString() };
        break;
      }

      default:
        await addRunLog(runId, 'warn', `Unknown node type: ${node.type}`);
        output = {};
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await addRunLog(runId, 'error', `Node ${node.id} failed: ${msg}`);
    throw err;
  }

  context[node.id] = output;
  await addRunLog(runId, 'info', `Node ${node.id} completed`, JSON.stringify(output).slice(0, 200));

  const outEdges = definition.edges.filter((e) => e.from === node.id);
  for (const edge of outEdges) {
    if (edge.when && node.type === 'action.condition') {
      const condResult = context[node.id]?.result;
      if (edge.when === 'true' && !condResult) continue;
      if (edge.when === 'false' && condResult) continue;
    }
    const nextNode = definition.nodes.find((n) => n.id === edge.to);
    if (nextNode) await executeNode(nextNode, definition, context, runId, tenantId);
  }
}

function getLastOutput(context: Record<string, any>): any {
  const keys = Object.keys(context).filter((k) => k !== 'trigger');
  return keys.length ? context[keys[keys.length - 1]] : (context.trigger ?? {});
}

async function addRunLog(
  runId: string,
  level: string,
  message: string,
  detail?: string
): Promise<void> {
  await prisma.workflowRunLog.create({
    data: { runId, level, message, metaJson: detail ? JSON.stringify({ detail }) : null },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
