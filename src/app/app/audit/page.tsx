'use client';
import { useEffect, useState } from 'react';

interface AuditEntry { id: string; action: string; entityType: string; entityId: string; ts: string; actorUser?: { email: string }; metaJson?: string; }

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/audit').then(r => {
      if (r.status === 403) { setError('Access denied. Admin role required.'); setLoading(false); return null; }
      return r.json();
    }).then(d => { if (d) { setLogs(d.logs ?? []); setTotal(d.total ?? 0); } setLoading(false); });
  }, []);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Audit Log</h1>
        {total > 0 && <p className="text-sm text-gray-500">{total} entries</p>}
      </div>
      {error ? (
        <div className="card p-8 text-center"><p className="text-red-600">{error}</p></div>
      ) : loading ? <p className="text-gray-500">Loading...</p> : logs.length === 0 ? (
        <div className="card p-8 text-center text-gray-500"><p>No audit logs yet. Actions will appear here.</p></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="text-left p-4 font-medium text-gray-600">Time</th>
              <th className="text-left p-4 font-medium text-gray-600">Actor</th>
              <th className="text-left p-4 font-medium text-gray-600">Action</th>
              <th className="text-left p-4 font-medium text-gray-600">Entity</th>
              <th className="text-left p-4 font-medium text-gray-600">ID</th>
            </tr></thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-4 text-gray-500 whitespace-nowrap">{new Date(log.ts).toLocaleString()}</td>
                  <td className="p-4 text-gray-700">{log.actorUser?.email ?? 'system'}</td>
                  <td className="p-4"><ActionBadge action={log.action} /></td>
                  <td className="p-4 text-gray-600">{log.entityType}</td>
                  <td className="p-4 text-gray-400 font-mono text-xs">{log.entityId.slice(0, 12)}...</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const classes: Record<string, string> = { created: 'badge-green', updated: 'badge-blue', deleted: 'badge-red', executed: 'badge-yellow', installed: 'badge-blue' };
  return <span className={classes[action] ?? 'badge-gray'}>{action}</span>;
}
