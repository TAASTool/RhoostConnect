'use client';
import { useEffect, useState } from 'react';

interface Summary {
  runsOk: number;
  runsFailed: number;
  activeWorkflows: number;
  activeConnectors: number;
  recentRuns: Array<{ id: string; status: string; startedAt: string; workflow: { name: string } }>;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/monitoring/summary').then(r => r.json()).then(d => { setSummary(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Runs OK (24h)" value={summary?.runsOk ?? 0} color="green" />
        <StatCard label="Runs Failed (24h)" value={summary?.runsFailed ?? 0} color="red" />
        <StatCard label="Active Workflows" value={summary?.activeWorkflows ?? 0} color="blue" />
        <StatCard label="Active Connectors" value={summary?.activeConnectors ?? 0} color="gray" />
      </div>
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Workflow Runs</h2>
        {!summary?.recentRuns?.length ? (
          <p className="text-gray-500 text-sm">No runs yet. Create and run a workflow to get started.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th className="text-left pb-2 font-medium text-gray-600">Workflow</th><th className="text-left pb-2 font-medium text-gray-600">Status</th><th className="text-left pb-2 font-medium text-gray-600">Started</th></tr></thead>
            <tbody>
              {summary.recentRuns.map(run => (
                <tr key={run.id} className="border-b last:border-0">
                  <td className="py-2">{run.workflow.name}</td>
                  <td className="py-2"><StatusBadge status={run.status} /></td>
                  <td className="py-2 text-gray-500">{new Date(run.startedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = { green: 'text-green-600', red: 'text-red-600', blue: 'text-blue-600', gray: 'text-gray-700' };
  return (
    <div className="card p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colors[color]}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = { success: 'badge-green', failed: 'badge-red', running: 'badge-yellow', pending: 'badge-gray' };
  return <span className={classes[status] ?? 'badge-gray'}>{status}</span>;
}
