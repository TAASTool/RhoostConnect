import jsonata from 'jsonata';
import { prisma } from './prisma';
import { logger } from './logger';
import { decrypt } from './crypto';
import { afasBaseUrl, afasHeaders, validateAfasConfig, AfasConfig } from './afas';
import type { AutomationConfig, FieldMapping, TranslationTable } from './automation-types';

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
  automation?: AutomationConfig;
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

    // Chained triggers: run any automation whose trigger points at this one.
    const chainDepth = Number(triggerData._chainDepth ?? 0);
    if (chainDepth < 5) {
      await triggerChainedAutomations(workflowId, tenantId, chainDepth + 1);
    }

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

async function triggerChainedAutomations(sourceWorkflowId: string, tenantId: string, chainDepth: number): Promise<void> {
  const candidates = await prisma.workflow.findMany({ where: { tenantId, enabled: true } });
  for (const wf of candidates) {
    if (wf.id === sourceWorkflowId) continue;
    try {
      const def = JSON.parse(wf.definitionJson) as WorkflowDefinition;
      const trigger = def.automation?.trigger;
      if (trigger?.type === 'automation' && trigger.chainedAutomationId === sourceWorkflowId) {
        logger.info('Chained automation triggered', { source: sourceWorkflowId, target: wf.id });
        await runWorkflow(wf.id, tenantId, { _chainDepth: chainDepth, _chainedFrom: sourceWorkflowId });
      }
    } catch {
      // ignore malformed definitions
    }
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

      case 'action.afas_sync': {
        output = await runAfasSync(definition.automation, tenantId, runId, Boolean(node.config.dryRun));
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

const AFAS_SYNC_MAX_ROWS = 1000;

// Executes the AFAS sync described by an AutomationConfig:
// reads source rows, applies mappings + translation tables, and writes each
// resulting record to the configured AFAS UpdateConnector.
async function runAfasSync(
  automation: AutomationConfig | undefined,
  tenantId: string,
  runId: string,
  dryRun: boolean
): Promise<Record<string, any>> {
  if (!automation) throw new Error('Geen automation-configuratie gevonden');
  const { target, sources, mappings, translationTables } = automation;
  if (!target?.connectorId || !target?.updateConnectorId) throw new Error('Doel (UpdateConnector) ontbreekt');

  const connector = await prisma.connector.findFirst({ where: { id: target.connectorId, tenantId } });
  if (!connector) throw new Error('AFAS-integratie niet gevonden');
  const afasConfig = JSON.parse(decrypt(connector.configEncryptedJson)) as AfasConfig;
  const validationError = validateAfasConfig(afasConfig);
  if (validationError) throw new Error(`AFAS-configuratie: ${validationError}`);

  // Resolve every source into an array of row objects.
  const sourceRows: Record<string, Record<string, string>[]> = {};
  for (const src of sources) {
    if (src.kind === 'csv') {
      sourceRows[src.id] = (src.rows ?? []) as Record<string, string>[];
    } else if (src.kind === 'getconnector' && src.getConnectorId) {
      const url = `${afasBaseUrl(afasConfig)}/connectors/${encodeURIComponent(src.getConnectorId)}?skip=0&take=${AFAS_SYNC_MAX_ROWS}`;
      const res = await fetch(url, { headers: afasHeaders(afasConfig), signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`GetConnector ${src.getConnectorId} gaf HTTP ${res.status}`);
      const data = await res.json();
      sourceRows[src.id] = Array.isArray(data?.rows) ? data.rows : [];
      await addRunLog(runId, 'info', `Bron ${src.name}: ${sourceRows[src.id].length} regel(s) opgehaald`);
    } else {
      sourceRows[src.id] = [];
    }
  }

  const primary = sources[0];
  if (!primary) throw new Error('Geen bron geconfigureerd');
  const driving = sourceRows[primary.id] ?? [];
  const total = Math.min(driving.length, AFAS_SYNC_MAX_ROWS);

  const tableById = new Map<string, TranslationTable>(translationTables.map((t) => [t.id, t]));
  const writeUrl = `${afasBaseUrl(afasConfig)}/connectors/${encodeURIComponent(target.updateConnectorId)}`;

  let ok = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < total; i++) {
    const resolved = resolveRow(mappings, sources, sourceRows, i, tableById);
    const payload = buildAfasPayload(target.updateConnectorId, resolved);

    if (dryRun) { ok++; continue; }

    try {
      const res = await fetch(writeUrl, {
        method: 'POST',
        headers: afasHeaders(afasConfig),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${detail.slice(0, 200)}`);
      }
      ok++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      if (errors.length < 10) errors.push(`Regel ${i + 1}: ${msg}`);
      await addRunLog(runId, 'error', `Regel ${i + 1} mislukt: ${msg}`);
    }
  }

  await addRunLog(runId, 'info', `AFAS sync klaar — ${ok} ok, ${failed} mislukt${dryRun ? ' (dry-run)' : ''}`);
  return { total, ok, failed, dryRun, errors };
}

function resolveRow(
  mappings: FieldMapping[],
  sources: AutomationConfig['sources'],
  sourceRows: Record<string, Record<string, string>[]>,
  index: number,
  tableById: Map<string, TranslationTable>
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const m of mappings) {
    if (m.mode === 'none') continue;
    let value = '';
    if (m.mode === 'fixed') {
      value = m.fixedValue ?? '';
    } else if (m.mode === 'source' && m.sourceId && m.sourceField) {
      const rows = sourceRows[m.sourceId] ?? [];
      const row = rows[index] ?? {};
      value = String(row[m.sourceField] ?? '');
    }
    if (m.translationTableId) {
      const table = tableById.get(m.translationTableId);
      if (table) {
        const hit = table.entries.find((e) => e.source === value);
        if (hit) value = hit.target;
      }
    }
    if (value !== '' || m.required) resolved[m.targetField] = value;
  }
  return resolved;
}

// Reconstructs AFAS's nested Element/Fields/Objects envelope from path-qualified
// field ids (e.g. "KnSubjectLink/DbId") into the JSON the UpdateConnector expects.
function buildAfasPayload(connectorId: string, resolved: Record<string, string>): Record<string, any> {
  const root = { Element: { Fields: {} as Record<string, string>, Objects: [] as any[] } };

  for (const [path, value] of Object.entries(resolved)) {
    const segs = path.split('/');
    const fieldId = segs.pop() as string;
    let node = root;
    for (const objName of segs) {
      let existing = node.Element.Objects.find((o) => o[objName]);
      if (!existing) {
        existing = { [objName]: { Element: { Fields: {}, Objects: [] } } };
        node.Element.Objects.push(existing);
      }
      node = existing[objName];
    }
    node.Element.Fields[fieldId] = value;
  }

  pruneEmptyObjects(root);
  return { [connectorId]: root };
}

function pruneEmptyObjects(node: { Element: { Objects: any[] } }): void {
  if (!node.Element.Objects.length) {
    delete (node.Element as { Objects?: any[] }).Objects;
    return;
  }
  for (const wrapper of node.Element.Objects) {
    for (const key of Object.keys(wrapper)) pruneEmptyObjects(wrapper[key]);
  }
}
