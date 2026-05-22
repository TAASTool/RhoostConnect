'use client';
import { useEffect, useState } from 'react';

interface Run { id: string; status: string; startedAt: string; finishedAt?: string; workflow: { name: string }; }
interface Summary { runsOk: number; runsFailed: number; activeWorkflows: number; activeConnectors: number; recentRuns: Run[]; }

export default function MonitoringPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/monitoring/summary').then(r => r.json()).then(d => { setSummary(d); setLoading(false); });
  }, []);

  const filtered = summary?.recentRuns?.filter(r => filter === 'all' || r.status === filter) ?? [];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Monitoring</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-4"><p className="text-sm text-gray-500">Runs OK (24h)</p><p className="text-2xl font-bold text-green-600">{summary?.runsOk ?? 0}</p></div>
        <div className="card p-4"><p className="text-sm text-gray-500">Runs Failed (24h)</p><p className="text-2xl font-bold text-red-600">{summary?.runsFailed ?? 0}</p></div>
        <div className="card p-4"><p className="text-sm text-gray-500">Active Workflows</p><p className="text-2xl font-bold text-blue-600">{summary?.activeWorkflows ?? 0}</p></div>
        <div className="card p-4"><p className="text-sm text-gray-500">Active Connectors</p><p className="text-2xl font-bold text-gray-700">{summary?.activeConnectors ?? 0}</p></div>
      </div>
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <h2 className="font-semibold">Recent Runs</h2>
          <select className="input w-32 text-sm" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
          </select>
        </div>
        {loading ? <p className="p-4 text-gray-500">Loading...</p> : filtered.length === 0 ? (
          <p className="p-8 text-center text-gray-500">No runs matching filter</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="text-left p-4 font-medium text-gray-600">Workflow</th>
              <th className="text-left p-4 font-medium text-gray-600">Status</th>
              <th className="text-left p-4 font-medium text-gray-600">Started</th>
              <th className="text-left p-4 font-medium text-gray-600">Duration</th>
            </tr></thead>
            <tbody>
              {filtered.map(run => {
                const duration = run.finishedAt ? Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000) + 's' : '—';
                return (
                  <tr key={run.id} className="border-b last:border-0">
                    <td className="p-4 font-medium">{run.workflow.name}</td>
                    <td className="p-4"><span className={`badge ${run.status === 'success' ? 'badge-green' : run.status === 'failed' ? 'badge-red' : 'badge-yellow'}`}>{run.status}</span></td>
                    <td className="p-4 text-gray-500">{new Date(run.startedAt).toLocaleString()}</td>
                    <td className="p-4 text-gray-500">{duration}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
