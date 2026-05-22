'use client';
import { useEffect, useState } from 'react';
import AutomationWizard from './AutomationWizard';

interface Workflow { id: string; name: string; enabled: boolean; runCount: number; updatedAt: string; }

export default function AutomationsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = () => fetch('/api/workflows').then(r => r.json()).then(d => { setWorkflows(d); setLoading(false); });
  useEffect(() => { load(); }, []);

  async function runWorkflow(id: string) {
    const res = await fetch(`/api/workflows/${id}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json();
    if (res.ok) alert(`✅ Workflow started. Run ID: ${data.runId}`);
    else alert(`❌ ${data.error}`);
    load();
  }

  async function toggleWorkflow(w: Workflow) {
    await fetch(`/api/workflows/${w.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !w.enabled }) });
    load();
  }

  async function deleteWorkflow(id: string) {
    if (!confirm('Delete this workflow?')) return;
    await fetch(`/api/workflows/${id}`, { method: 'DELETE' });
    load();
  }

  if (selected) return <WorkflowDetail id={selected} onBack={() => { setSelected(null); load(); }} />;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Automations</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New Workflow</button>
      </div>
      {loading ? <p className="text-gray-500">Loading...</p> : (
        workflows.length === 0 ? (
          <div className="card p-12 text-center text-gray-500">
            <p className="text-lg font-medium mb-2">No workflows yet</p>
            <p className="text-sm mb-4">Create a workflow to automate your integrations</p>
            <button className="btn-primary" onClick={() => setShowCreate(true)}>Create First Workflow</button>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>
                <th className="text-left p-4 font-medium text-gray-600">Name</th>
                <th className="text-left p-4 font-medium text-gray-600">Status</th>
                <th className="text-left p-4 font-medium text-gray-600">Runs</th>
                <th className="text-left p-4 font-medium text-gray-600">Updated</th>
                <th className="p-4"></th>
              </tr></thead>
              <tbody>
                {workflows.map(w => (
                  <tr key={w.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="p-4 font-medium cursor-pointer text-blue-600 hover:underline" onClick={() => setSelected(w.id)}>{w.name}</td>
                    <td className="p-4"><span className={w.enabled ? 'badge-green' : 'badge-gray'}>{w.enabled ? 'enabled' : 'disabled'}</span></td>
                    <td className="p-4 text-gray-500">{w.runCount}</td>
                    <td className="p-4 text-gray-500">{new Date(w.updatedAt).toLocaleDateString()}</td>
                    <td className="p-4">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => runWorkflow(w.id)} className="btn-primary text-xs py-1">▶ Run</button>
                        <button onClick={() => toggleWorkflow(w)} className="btn-secondary text-xs py-1">{w.enabled ? 'Disable' : 'Enable'}</button>
                        <button onClick={() => deleteWorkflow(w.id)} className="btn-danger text-xs py-1">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      {showCreate && <AutomationWizard onClose={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function WorkflowDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [workflow, setWorkflow] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetch(`/api/workflows/${id}`).then(r => r.json()), fetch(`/api/workflows/${id}/runs`).then(r => r.json())])
      .then(([wf, runsData]) => { setWorkflow(wf); setRuns(runsData.runs ?? []); setLoading(false); });
  }, [id]);

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="p-8">
      <button className="text-blue-600 hover:underline text-sm mb-4 flex items-center gap-1" onClick={onBack}>← Back to Automations</button>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{workflow?.name}</h1>
          <p className="text-sm text-gray-500 mt-1">ID: {id}</p>
        </div>
        <span className={workflow?.enabled ? 'badge-green' : 'badge-gray'}>{workflow?.enabled ? 'enabled' : 'disabled'}</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Workflow Definition</h2>
          <div className="space-y-2">
            {workflow?.definition?.nodes?.map((node: any) => (
              <div key={node.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <NodeTypeIcon type={node.type} />
                <div>
                  <p className="text-sm font-medium">{node.config?.label ?? node.type}</p>
                  <p className="text-xs text-gray-500">{node.type}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Run History</h2>
          {runs.length === 0 ? <p className="text-sm text-gray-500">No runs yet.</p> : (
            <div className="space-y-2">
              {runs.slice(0, 10).map(run => (
                <div key={run.id} className="p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100" onClick={() => setSelectedRun(selectedRun?.id === run.id ? null : run)}>
                  <div className="flex items-center justify-between">
                    <span className={`badge ${run.status === 'success' ? 'badge-green' : run.status === 'failed' ? 'badge-red' : 'badge-yellow'}`}>{run.status}</span>
                    <span className="text-xs text-gray-500">{new Date(run.startedAt).toLocaleString()}</span>
                  </div>
                  {selectedRun?.id === run.id && (
                    <div className="mt-3 space-y-1">
                      {run.logs?.map((log: any) => (
                        <p key={log.id} className={`text-xs font-mono ${log.level === 'error' ? 'text-red-600' : log.level === 'warn' ? 'text-yellow-600' : 'text-gray-600'}`}>
                          [{log.level}] {log.message}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NodeTypeIcon({ type }: { type: string }) {
  const icons: Record<string, string> = { 'trigger.webhook': '⚡', 'trigger.schedule': '⏰', 'trigger.manual': '▶', 'action.http': '🌐', 'action.transform': '⚙', 'action.condition': '◆', 'action.notify': '🔔', 'action.writeback': '💾' };
  return <span className="text-lg">{icons[type] ?? '●'}</span>;
}

