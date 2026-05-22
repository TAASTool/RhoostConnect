'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface TenantDetail {
  id: string; name: string; plan: string;
  contactPerson?: string; contactEmail?: string; phone?: string;
  createdAt: string;
  users: UserRow[];
  connectorCount: number; workflowCount: number; runCount: number;
  recentRuns: { id: string; startedAt: string; status: string }[];
}

interface UserRow { id: string; email: string; role: string; createdAt: string; }

const ROLE_OPTIONS = ['Owner', 'Admin', 'Operator', 'Viewer'];

export default function TenantDetailPage({ params }: { params: { id: string } }) {
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', plan: '', contactPerson: '', contactEmail: '', phone: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', password: '', role: 'Viewer' });
  const [addErr, setAddErr] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  function load() {
    setLoading(true);
    fetch(`/api/admin/tenants/${params.id}`).then(r => r.json()).then(d => {
      setTenant(d);
      setEditForm({ name: d.name, plan: d.plan, contactPerson: d.contactPerson ?? '', contactEmail: d.contactEmail ?? '', phone: d.phone ?? '' });
      setLoading(false);
    });
  }
  useEffect(() => { load(); }, [params.id]);

  async function saveEdit() {
    setSavingEdit(true);
    await fetch(`/api/admin/tenants/${params.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    setSavingEdit(false); setEditMode(false); load();
  }

  async function changeRole(userId: string, newRole: string) {
    await fetch(`/api/admin/tenants/${params.id}/users/${userId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    load();
  }

  async function removeUser(userId: string) {
    if (!confirm('Gebruiker verwijderen?')) return;
    await fetch(`/api/admin/tenants/${params.id}/users/${userId}`, { method: 'DELETE' });
    load();
  }

  async function addUser() {
    setAddErr(''); setAddSaving(true);
    const res = await fetch(`/api/admin/tenants/${params.id}/users`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    });
    setAddSaving(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setAddErr(d.error ?? 'Fout'); return; }
    setShowAdd(false); setAddForm({ email: '', password: '', role: 'Viewer' }); load();
  }

  if (loading) return <div className="p-8 text-gray-500">Laden…</div>;
  if (!tenant) return <div className="p-8 text-red-600">Klant niet gevonden.</div>;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/admin" className="text-blue-600 hover:underline text-sm">← Klanten</Link>
      </div>

      {/* Header */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{tenant.name}</h1>
            <p className="text-sm text-gray-400">ID: {tenant.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <PlanBadge plan={tenant.plan} />
            <button className="btn-secondary text-xs py-1" onClick={() => setEditMode(!editMode)}>
              {editMode ? 'Annuleren' : 'Bewerken'}
            </button>
          </div>
        </div>

        {editMode ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <F label="Bedrijfsnaam"><input className="input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></F>
              <F label="Plan">
                <select className="input" value={editForm.plan} onChange={e => setEditForm(f => ({ ...f, plan: e.target.value }))}>
                  {['free','starter','pro','enterprise'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </F>
              <F label="Contactpersoon"><input className="input" value={editForm.contactPerson} onChange={e => setEditForm(f => ({ ...f, contactPerson: e.target.value }))} /></F>
              <F label="Contact e-mail"><input className="input" type="email" value={editForm.contactEmail} onChange={e => setEditForm(f => ({ ...f, contactEmail: e.target.value }))} /></F>
              <F label="Telefoon"><input className="input" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></F>
            </div>
            <button className="btn-primary text-sm" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? 'Opslaan…' : 'Opslaan'}</button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 text-sm">
            <Info label="Contactpersoon" value={tenant.contactPerson ?? '—'} />
            <Info label="Contact e-mail" value={tenant.contactEmail ?? '—'} />
            <Info label="Telefoon" value={tenant.phone ?? '—'} />
            <Info label="Aangemaakt" value={new Date(tenant.createdAt).toLocaleDateString('nl-NL')} />
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Gebruikers" value={tenant.users.length} color="blue" />
        <KpiCard label="Integraties" value={tenant.connectorCount} color="green" />
        <KpiCard label="Automations" value={tenant.workflowCount} color="purple" />
        <KpiCard label="Runs" value={tenant.runCount} color="orange" />
      </div>

      {/* Users / Contacts */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">Contactpersonen / Gebruikers</h2>
          <button className="btn-primary text-xs py-1" onClick={() => setShowAdd(true)}>+ Toevoegen</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b"><tr>
            <th className="text-left p-4 font-medium text-gray-600">E-mail</th>
            <th className="text-left p-4 font-medium text-gray-600">Rol</th>
            <th className="text-left p-4 font-medium text-gray-600">Aangemaakt</th>
            <th className="p-4"></th>
          </tr></thead>
          <tbody>
            {tenant.users.length === 0 ? (
              <tr><td colSpan={4} className="p-6 text-center text-gray-400">Geen gebruikers.</td></tr>
            ) : tenant.users.map(u => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="p-4 font-medium">{u.email}</td>
                <td className="p-4">
                  <select className="input text-xs py-0.5 w-28" value={u.role} onChange={e => changeRole(u.id, e.target.value)}>
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="p-4 text-gray-500 text-xs">{new Date(u.createdAt).toLocaleDateString('nl-NL')}</td>
                <td className="p-4">
                  <button className="btn-danger text-xs py-1" onClick={() => removeUser(u.id)}>Verwijder</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent runs */}
      {tenant.recentRuns.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Recente runs</h2>
          <div className="space-y-2">
            {tenant.recentRuns.map(r => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span className={`badge ${r.status === 'success' ? 'badge-green' : r.status === 'failed' ? 'badge-red' : 'badge-yellow'}`}>{r.status}</span>
                <span className="text-gray-400 text-xs">{new Date(r.startedAt).toLocaleString('nl-NL')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add user modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md p-6">
            <h3 className="font-semibold mb-4">Contactpersoon toevoegen</h3>
            <div className="space-y-3">
              <F label="E-mail"><input className="input" type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} /></F>
              <F label="Tijdelijk wachtwoord"><input className="input" type="password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} placeholder="Minimaal 8 tekens" /></F>
              <F label="Rol">
                <select className="input" value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </F>
            </div>
            {addErr && <p className="text-sm text-red-600 mt-2">{addErr}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary" onClick={() => setShowAdd(false)}>Annuleren</button>
              <button className="btn-primary" onClick={addUser} disabled={addSaving || !addForm.email || !addForm.password}>{addSaving ? 'Toevoegen…' : 'Toevoegen'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = { blue: 'text-blue-600 bg-blue-50', green: 'text-green-600 bg-green-50', purple: 'text-purple-600 bg-purple-50', orange: 'text-orange-600 bg-orange-50' };
  return (
    <div className="card p-5">
      <p className={`text-2xl font-bold ${colors[color]?.split(' ')[0]}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = { free: 'badge-gray', starter: 'badge-blue', pro: 'badge-green', enterprise: 'bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full font-medium' };
  return <span className={colors[plan] ?? 'badge-gray'}>{plan}</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-gray-400">{label}</p><p className="font-medium">{value}</p></div>;
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>;
}
