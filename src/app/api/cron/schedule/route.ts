import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runWorkflow } from '@/lib/workflow-runner';
import type { ScheduleConfig } from '@/lib/automation-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Called by Vercel Cron. Vercel sets Authorization: Bearer <CRON_SECRET>.
// When CRON_SECRET is not set (local dev), the check is skipped.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const now = new Date();

  const workflows = await prisma.workflow.findMany({
    where: { enabled: true },
    include: { runs: { orderBy: { startedAt: 'desc' }, take: 1 } },
  });

  const results: Array<{ id: string; name: string; action: string; runId?: string; error?: string }> = [];

  for (const wf of workflows) {
    let def: { automation?: { trigger?: { type?: string; schedule?: ScheduleConfig } } };
    try { def = JSON.parse(wf.definitionJson); } catch { continue; }

    const schedule = def.automation?.trigger?.type === 'schedule'
      ? def.automation.trigger.schedule
      : undefined;
    if (!schedule) continue;

    const lastRun = wf.runs[0]?.startedAt ?? null;
    if (!isDue(schedule, lastRun, now)) {
      results.push({ id: wf.id, name: wf.name, action: 'skipped' });
      continue;
    }

    try {
      const runId = await runWorkflow(wf.id, wf.tenantId, { _scheduledAt: now.toISOString() });
      results.push({ id: wf.id, name: wf.name, action: 'started', runId });
    } catch (e) {
      results.push({ id: wf.id, name: wf.name, action: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }

  const started = results.filter(r => r.action === 'started').length;
  return NextResponse.json({ ok: true, checkedAt: now.toISOString(), started, total: results.length, results });
}

function parseTime(t: string): [number, number] {
  const [h, m] = t.split(':').map(Number);
  return [isNaN(h) ? 9 : h, isNaN(m) ? 0 : m];
}

function isDue(schedule: ScheduleConfig, lastRunAt: Date | null, now: Date): boolean {
  if (!lastRunAt) return true;

  switch (schedule.frequency) {
    case 'hourly': {
      const intervalMs = (schedule.interval ?? 1) * 60 * 60 * 1000;
      return now.getTime() - lastRunAt.getTime() >= intervalMs;
    }
    case 'daily': {
      const [h, m] = parseTime(schedule.time ?? '09:00');
      const todayAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
      return todayAt <= now && lastRunAt < todayAt;
    }
    case 'weekly': {
      const [h, m] = parseTime(schedule.time ?? '09:00');
      const dow = schedule.dayOfWeek ?? 1;
      const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
      const diff = (candidate.getDay() - dow + 7) % 7;
      candidate.setDate(candidate.getDate() - diff);
      return candidate <= now && lastRunAt < candidate;
    }
    case 'monthly': {
      const [h, m] = parseTime(schedule.time ?? '09:00');
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const day = Math.min(schedule.dayOfMonth ?? 1, daysInMonth);
      const candidate = new Date(now.getFullYear(), now.getMonth(), day, h, m, 0, 0);
      return candidate <= now && lastRunAt < candidate;
    }
    default:
      return false;
  }
}
