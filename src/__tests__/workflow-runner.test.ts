import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workflowRun: {
      create: vi.fn().mockResolvedValue({ id: 'run-001' }),
      update: vi.fn().mockResolvedValue({}),
    },
    workflow: {
      findFirst: vi.fn(),
    },
    workflowRunLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    connector: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/crypto', () => ({ decrypt: vi.fn().mockReturnValue('{"baseUrl":"https://example.com","auth":{"type":"none"}}') }));

import { prisma } from '@/lib/prisma';

describe('workflow-runner', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('creates a run record on start', async () => {
    const { runWorkflow } = await import('@/lib/workflow-runner');
    vi.mocked(prisma.workflow.findFirst).mockResolvedValue({
      id: 'wf-001', tenantId: 't1', name: 'Test', enabled: true,
      definitionJson: JSON.stringify({
        nodes: [{ id: 't1', type: 'trigger.manual', config: {} }, { id: 'a1', type: 'action.notify', config: { channel: 'ui', message: 'Hello' } }],
        edges: [{ from: 't1', to: 'a1' }],
      }),
      createdAt: new Date(), updatedAt: new Date(),
    } as any);

    await runWorkflow('wf-001', 't1', { test: true });
    expect(prisma.workflowRun.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'running' }) }));
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'success' }) }));
  });

  it('marks run as failed on error', async () => {
    const { runWorkflow } = await import('@/lib/workflow-runner');
    vi.mocked(prisma.workflow.findFirst).mockResolvedValue(null);
    await expect(runWorkflow('wf-missing', 't1')).rejects.toThrow('Workflow not found');
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }));
  });
});
