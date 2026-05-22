'use client';
import { useEffect, useState } from 'react';

interface Connector { id: string; name: string; type: string; status: string; endpointCount: number; updatedAt: string; }
interface AfasConnector { id: string; description: string; type: string; }
interface TestResult { success: boolean; message: string; connectors?: AfasConnector[]; }

export default function IntegrationsPage() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Connector | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const load = () => fetch('/api/connectors').then(r => r.json()).then(d => { setConnectors(d); setLoading(false); });
  useEffect(() => { load(); }, []);

  async function deleteConnector(id: string) {
    if (!confirm('Delete this connector?')) return;
    await fetch(`/api/connectors/${id}`, { method: 'DELETE' });
    load();
  }

  async function testConnector(id: string) {
    setTestingId(id);
    const res = await fetch(`/api/connectors/${id}/test`, { method: 'POST' });
    const data = await res.json();
    setTestingId(null);
    setTestResult(data);
  }

  const typeLabel: Record<string, string> = { http_rest: 'HTTP REST', webhook: 'Webhook', afas_adapter: 'AFAS' };

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
                      <td className="p-4"><span className="badge-blue">{typeLabel[c.type] ?? c.type}</span></td>
                      <td className="p-4"><span className={c.status === 'active' ? 'badge-green' : 'badge-gray'}>{c.status}</span></td>
                      <td className="p-4 text-gray-500">{c.endpointCount}</td>
                      <td className="p-4 text-gray-500">{new Date(c.updatedAt).toLocaleDateString('nl-NL')}</td>
                      <td className="p-4">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => testConnector(c.id)}
                            disabled={testingId === c.id}
                            className="btn-secondary text-xs py-1"
                          >
                            {testingId === c.id ? 'Testen…' : 'Test'}
                          </button>
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
      {testResult && <TestResultModal result={testResult} onClose={() => setTestResult(null)} />}
    </div>
  );
}

function ConnectorModal({ initial, onClose }: { initial: Connector | null; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState(initial?.type ?? 'http_rest');
  const [baseUrl, setBaseUrl] = useState('');
  const [authType, setAuthType] = useState('none');
  const [token, setToken] = useState('');
  const [deelnemersnummer, setDeelnemersnummer] = useState('');
  const [omgeving, setOmgeving] = useState('productie');
  const [afasToken, setAfasToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setError('');
    if (type === 'afas_adapter') {
      if (!/^\d{5}$/.test(deelnemersnummer)) { setError('Deelnemersnummer moet 5 cijfers zijn'); return; }
      if (!afasToken.trim()) { setError('AFAS token is verplicht'); return; }
    }
    setSaving(true);
    const url = initial ? `/api/connectors/${initial.id}` : '/api/connectors';
    const method = initial ? 'PUT' : 'POST';
    const config = type === 'afas_adapter'
      ? { deelnemersnummer, omgeving, afasToken }
      : { baseUrl, auth: { type: authType, token: token || undefined } };
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type, config }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Opslaan mislukt');
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold mb-4">{initial ? 'Connector bewerken' : 'Nieuwe connector'}</h2>
        <div className="space-y-4">
          <div>
            <label className="label">Naam</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={type} onChange={e => setType(e.target.value)}>
              <option value="http_rest">HTTP REST</option>
              <option value="webhook">Webhook</option>
              <option value="afas_adapter">AFAS Adapter</option>
            </select>
          </div>

          {type === 'afas_adapter' ? (
            <>
              <div>
                <label className="label">Deelnemersnummer <span className="text-gray-400 font-normal">(5 cijfers)</span></label>
                <input
                  className="input"
                  maxLength={5}
                  pattern="\d{5}"
                  placeholder="bijv. 12345"
                  value={deelnemersnummer}
                  onChange={e => setDeelnemersnummer(e.target.value.replace(/\D/g, '').slice(0, 5))}
                />
              </div>
              <div>
                <label className="label">Omgeving</label>
                <select className="input" value={omgeving} onChange={e => setOmgeving(e.target.value)}>
                  <option value="productie">Productie</option>
                  <option value="test">Test</option>
                  <option value="acceptatie">Acceptatie</option>
                </select>
              </div>
              <div>
                <label className="label">AFAS Token</label>
                <textarea
                  className="input font-mono text-xs"
                  rows={4}
                  placeholder={'<token><version>1</version><data>...</data></token>'}
                  value={afasToken}
                  onChange={e => setAfasToken(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">Plak hier de volledige XML token zoals verstrekt door AFAS.</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label">Base URL</label>
                <input className="input" type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.example.com" />
              </div>
              <div>
                <label className="label">Authenticatie</label>
                <select className="input" value={authType} onChange={e => setAuthType(e.target.value)}>
                  <option value="none">Geen</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="basic">Basic Auth</option>
                  <option value="api_key">API Key</option>
                </select>
              </div>
              {authType === 'bearer' && (
                <div>
                  <label className="label">Token</label>
                  <input className="input" type="password" value={token} onChange={e => setToken(e.target.value)} />
                </div>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex gap-3 mt-6 justify-end">
          <button className="btn-secondary" onClick={onClose}>Annuleren</button>
          <button className="btn-primary" onClick={save} disabled={saving || !name}>
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TestResultModal({ result, onClose }: { result: TestResult; onClose: () => void }) {
  const hasConnectors = result.connectors && result.connectors.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Testresultaat</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg mb-4 text-sm font-medium ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          <span>{result.success ? '✅' : '❌'}</span>
          <span>{result.message}</span>
        </div>

        {hasConnectors && (
          <>
            <p className="text-sm text-gray-600 mb-3">Beschikbare AFAS connectors:</p>
            <div className="border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">ID</th>
                    <th className="text-left p-3 font-medium text-gray-600">Omschrijving</th>
                    <th className="text-left p-3 font-medium text-gray-600">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {result.connectors!.map((c, i) => (
                    <tr key={c.id ?? i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="p-3 font-mono text-xs">{c.id}</td>
                      <td className="p-3">{c.description}</td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          c.type === 'get' ? 'bg-blue-100 text-blue-700' :
                          c.type === 'update' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>{c.type}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex justify-end mt-4">
          <button className="btn-primary" onClick={onClose}>Sluiten</button>
        </div>
      </div>
    </div>
  );
}
