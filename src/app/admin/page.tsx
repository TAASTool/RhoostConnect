'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface TenantRow {
  id: string; name: string; plan: string;
  contactPerson?: string; contactEmail?: string;
  userCount: number; connectorCount: number; workflowCount: number; runCount: number;
  lastRunAt: string | null; lastRunStatus: string | null;
  createdAt: string;
}

interface CreateForm {
  name: string; plan: string;
  contactPerson: string; contactEmail: string; phone: string;
  adminEmail: string; adminPassword: string;
}

export default function AdminDashboard() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');

  function load() {
    fetch('/api/admin/tenants').then(r => r.json()).then(d => { setTenants(d); setLoading(false); });
  }
  useEffect(() => { load(); }, []);

  const filtered = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.contactEmail ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const totalRuns = tenants.reduce((s, t) => s + t.runCount, 0);
  const totalWorkflows = tenants.reduce((s, t) => s + t.workflowCount, 0);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Klantbeheer</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tenants.length} klant(en) actief</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Nieuwe klant</button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard label="Klanten" value={tenants.length} icon="⊞" color="blue" />
        <KpiCard label="Gebruikers" value={tenants.reduce((s, t) => s + t.userCount, 0)} icon="👤" color="green" />
        <KpiCard label="Automations" value={totalWorkflows} icon="⚙" color="purple" />
        <KpiCard label="Totaal runs" value={totalRuns} icon="▶" color="orange" />
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b">
          <input className="input max-w-sm" placeholder="Zoek op naam of e-mail…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {loading ? (
          <p className="text-gray-500 p-6">Laden…</p>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p className="text-lg font-medium mb-2">Geen klanten gevonden</p>
            <button className="btn-primary mt-2" onClick={() => setShowCreate(true)}>Eerste klant aanmaken</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-4 font-medium text-gray-600">Klant</th>
                <th className="text-left p-4 font-medium text-gray-600">Plan</th>
                <th className="text-left p-4 font-medium text-gray-600">Gebruikers</th>
                <th className="text-left p-4 font-medium text-gray-600">Integraties</th>
                <th className="text-left p-4 font-medium text-gray-600">Automations</th>
                <th className="text-left p-4 font-medium text-gray-600">Runs</th>
                <th className="text-left p-4 font-medium text-gray-600">Laatste run</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-4">
                    <p className="font-medium">{t.name}</p>
                    {t.contactEmail && <p className="text-xs text-gray-400">{t.contactEmail}</p>}
                  </td>
                  <td className="p-4"><PlanBadge plan={t.plan} /></td>
                  <td className="p-4 text-gray-500">{t.userCount}</td>
                  <td className="p-4 text-gray-500">{t.connectorCount}</td>
                  <td className="p-4 text-gray-500">{t.workflowCount}</td>
                  <td className="p-4 text-gray-500">{t.runCount}</td>
                  <td className="p-4 text-gray-500 text-xs">
                    {t.lastRunAt ? (
                      <span>
                        {new Date(t.lastRunAt).toLocaleDateString('nl-NL')}
                        {t.lastRunStatus && (
                          <span className={`ml-1.5 ${t.lastRunStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                            {t.lastRunStatus === 'success' ? '✓' : '✗'}
                          </span>
                        )}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="p-4">
                    <Link href={`/admin/tenants/${t.id}`} className="btn-secondary text-xs py-1">Beheer</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <CreateTenantModal onClose={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function KpiCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  const colors: Record<string, string> = { blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600', purple: 'bg-purple-50 text-purple-600', orange: 'bg-orange-50 text-orange-600' };
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${colors[color]}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = { free: 'badge-gray', starter: 'badge-blue', pro: 'badge-green', enterprise: 'bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full font-medium' };
  return <span className={colors[plan] ?? 'badge-gray'}>{plan}</span>;
}

function CreateTenantModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<CreateForm>({ name: '', plan: 'free', contactPerson: '', contactEmail: '', phone: '', adminEmail: '', adminPassword: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof CreateForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    setError(''); setSaving(true);
    const res = await fetch('/api/admin/tenants', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, contactPerson: form.contactPerson || undefined, contactEmail: form.contactEmail || undefined, phone: form.phone || undefined }),
    });
    setSaving(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Opslaan mislukt'); return; }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Nieuwe klant aanmaken</h2>
        <div className="space-y-3">
          <F label="Bedrijfsnaam *"><input className="input" value={form.name} onChange={e => set('name', e.target.value)} /></F>
          <F label="Plan">
            <select className="input" value={form.plan} onChange={e => set('plan', e.target.value)}>
              {['free','starter','pro','enterprise'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </F>
          <hr className="my-2" />
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contactpersoon</p>
          <F label="Naam"><input className="input" value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} /></F>
          <F label="E-mail"><input className="input" type="email" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} /></F>
          <F label="Telefoon"><input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} /></F>
          <hr className="my-2" />
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Admin account (login)</p>
          <F label="E-mail admin *"><input className="input" type="email" value={form.adminEmail} onChange={e => set('adminEmail', e.target.value)} /></F>
          <F label="Wachtwoord *"><input className="input" type="password" value={form.adminPassword} onChange={e => set('adminPassword', e.target.value)} placeholder="Minimaal 8 tekens" /></F>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-secondary" onClick={onClose}>Annuleren</button>
          <button className="btn-primary" onClick={save} disabled={saving || !form.name || !form.adminEmail || !form.adminPassword}>{saving ? 'Aanmaken…' : 'Aanmaken'}</button>
        </div>
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>;
}
