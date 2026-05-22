'use client';
import { useEffect, useState } from 'react';

interface Connector { id: string; name: string; type: string; status: string; endpointCount: number; updatedAt: string; }

export default function IntegrationsPage() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Connector | null>(null);

  const load = () => fetch('/api/connectors').then(r => r.json()).then(d => { setConnectors(d); setLoading(false); });
  useEffect(() => { load(); }, []);

  async function deleteConnector(id: string) {
    if (!confirm('Delete this connector?')) return;
    await fetch(`/api/connectors/${id}`, { method: 'DELETE' });
    load();
  }

  async function testConnector(id: string) {
    const res = await fetch(`/api/connectors/${id}/test`, { method: 'POST' });
    const data = await res.json();
    alert(data.success ? `✅ ${data.message}` : `❌ ${data.message}`);
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Integrations</h1>
        <button className="btn-primary" onClick={() => { setEditTarget(null); setShowModal(true); }}>+ New Connector</button>
      </div>
      {loading ? <p className="text-gray-500">Loading...</p> : (
        <>
          {connectors.length === 0 ? (
            <div className="card p-12 text-center text-gray-500">
              <p className="text-lg font-medium mb-2">No connectors yet</p>
              <p className="text-sm mb-4">Create a connector to start integrating with external services</p>
              <button className="btn-primary" onClick={() => setShowModal(true)}>Create First Connector</button>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>
                  <th className="text-left p-4 font-medium text-gray-600">Name</th>
                  <th className="text-left p-4 font-medium text-gray-600">Type</th>
                  <th className="text-left p-4 font-medium text-gray-600">Status</th>
                  <th className="text-left p-4 font-medium text-gray-600">Endpoints</th>
                  <th className="text-left p-4 font-medium text-gray-600">Updated</th>
                  <th className="p-4"></th>
                </tr></thead>
                <tbody>
                  {connectors.map(c => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="p-4 font-medium">{c.name}</td>
                      <td className="p-4"><span className="badge-blue">{c.type}</span></td>
                      <td className="p-4"><span className={c.status === 'active' ? 'badge-green' : 'badge-gray'}>{c.status}</span></td>
                      <td className="p-4 text-gray-500">{c.endpointCount}</td>
                      <td className="p-4 text-gray-500">{new Date(c.updatedAt).toLocaleDateString()}</td>
                      <td className="p-4">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => testConnector(c.id)} className="btn-secondary text-xs py-1">Test</button>
                          <button onClick={() => { setEditTarget(c); setShowModal(true); }} className="btn-secondary text-xs py-1">Edit</button>
                          <button onClick={() => deleteConnector(c.id)} className="btn-danger text-xs py-1">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {showModal && <ConnectorModal initial={editTarget} onClose={() => { setShowModal(false); load(); }} />}
    </div>
  );
}

function ConnectorModal({ initial, onClose }: { initial: Connector | null; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState(initial?.type ?? 'http_rest');
  const [baseUrl, setBaseUrl] = useState('');
  const [authType, setAuthType] = useState('none');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const url = initial ? `/api/connectors/${initial.id}` : '/api/connectors';
    const method = initial ? 'PUT' : 'POST';
    const body: any = { name, type, config: { baseUrl, auth: { type: authType, token: token || undefined } } };
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold mb-4">{initial ? 'Edit Connector' : 'New Connector'}</h2>
        <div className="space-y-4">
          <div><label className="label">Name</label><input className="input" value={name} onChange={e => setName(e.target.value)} /></div>
          <div><label className="label">Type</label>
            <select className="input" value={type} onChange={e => setType(e.target.value)}>
              <option value="http_rest">HTTP REST</option>
              <option value="webhook">Webhook</option>
              <option value="afas_adapter">AFAS Adapter</option>
            </select>
          </div>
          <div><label className="label">Base URL</label><input className="input" type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.example.com" /></div>
          <div><label className="label">Authentication</label>
            <select className="input" value={authType} onChange={e => setAuthType(e.target.value)}>
              <option value="none">None</option>
              <option value="bearer">Bearer Token</option>
              <option value="basic">Basic Auth</option>
              <option value="api_key">API Key</option>
            </select>
          </div>
          {authType === 'bearer' && <div><label className="label">Token</label><input className="input" type="password" value={token} onChange={e => setToken(e.target.value)} /></div>}
        </div>
        <div className="flex gap-3 mt-6 justify-end">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving || !name}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
