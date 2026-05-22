'use client';
import { useEffect, useState } from 'react';

interface User { id: string; email: string; role: string; createdAt: string; }

const ROLE_OPTIONS = ['Owner', 'Admin', 'Operator', 'Viewer'];
const ROLE_LABELS: Record<string, string> = { Owner: 'Owner (Admin)', Admin: 'Admin', Operator: 'Operator', Viewer: 'Viewer' };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [forbidden, setForbidden] = useState(false);

  function load() {
    fetch('/api/users').then(async r => {
      if (r.status === 403) { setForbidden(true); setLoading(false); return; }
      const d = await r.json(); setUsers(d); setLoading(false);
    });
  }
  useEffect(() => { load(); }, []);

  async function deleteUser(id: string) {
    if (!confirm('Gebruiker verwijderen?')) return;
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    load();
  }

  if (forbidden) return (
    <div className="p-8"><div className="card p-12 text-center text-gray-500"><p className="text-lg font-medium">Geen toegang</p><p className="text-sm mt-1">Je hebt de rol Owner of Admin nodig om gebruikers te beheren.</p></div></div>
  );

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Gebruikers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Beheer de contactpersonen en gebruikers van uw organisatie.</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditUser(null); setShowAdd(true); }}>+ Gebruiker toevoegen</button>
      </div>

      {loading ? <p className="text-gray-500">Laden…</p> : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="text-left p-4 font-medium text-gray-600">E-mail</th>
              <th className="text-left p-4 font-medium text-gray-600">Rol</th>
              <th className="text-left p-4 font-medium text-gray-600">Aangemaakt</th>
              <th className="p-4"></th>
            </tr></thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-gray-400">Geen gebruikers.</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-4 font-medium">{u.email}</td>
                  <td className="p-4"><RoleBadge role={u.role} /></td>
                  <td className="p-4 text-gray-500 text-xs">{new Date(u.createdAt).toLocaleDateString('nl-NL')}</td>
                  <td className="p-4">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setEditUser(u); setShowAdd(true); }} className="btn-secondary text-xs py-1">Bewerk</button>
                      <button onClick={() => deleteUser(u.id)} className="btn-danger text-xs py-1">Verwijder</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <UserModal
          existing={editUser}
          onClose={() => { setShowAdd(false); setEditUser(null); load(); }}
        />
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = { Owner: 'badge-blue', Admin: 'badge-green', Operator: 'badge-yellow', Viewer: 'badge-gray' };
  return <span className={colors[role] ?? 'badge-gray'}>{ROLE_LABELS[role] ?? role}</span>;
}

function UserModal({ existing, onClose }: { existing: User | null; onClose: () => void }) {
  const [email, setEmail] = useState(existing?.email ?? '');
  const [role, setRole] = useState(existing?.role ?? 'Viewer');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setError(''); setSaving(true);
    const url = existing ? `/api/users/${existing.id}` : '/api/users';
    const method = existing ? 'PUT' : 'POST';
    const body: Record<string, string> = { email, role };
    if (password || !existing) body.password = password;

    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Opslaan mislukt'); return; }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6">
        <h3 className="font-semibold mb-4">{existing ? 'Gebruiker bewerken' : 'Gebruiker toevoegen'}</h3>
        <div className="space-y-3">
          <div><label className="label">E-mail</label><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div>
            <label className="label">Rol</label>
            <select className="input" value={role} onChange={e => setRole(e.target.value)}>
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">Owner en Admin kunnen gebruikers beheren. Operator kan data bewerken. Viewer is alleen-lezen.</p>
          </div>
          <div>
            <label className="label">{existing ? 'Nieuw wachtwoord (leeg = ongewijzigd)' : 'Wachtwoord *'}</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimaal 8 tekens" />
          </div>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>Annuleren</button>
          <button className="btn-primary" onClick={save} disabled={saving || !email || (!existing && !password)}>{saving ? 'Opslaan…' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}
