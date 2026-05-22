'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminSetupPage() {
  const router = useRouter();
  const [setupKey, setSetupKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/admin/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupKey, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Setup mislukt'); return; }
      router.push('/admin');
    } catch {
      setError('Netwerkfout. Probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-600">Rhoost Connect</h1>
          <p className="text-gray-500 mt-2">Platform Admin Setup</p>
        </div>
        <div className="card p-8">
          <h2 className="text-xl font-semibold mb-2">Super Admin aanmaken</h2>
          <p className="text-sm text-gray-500 mb-6">Stel de beheerder in voor het Rhoost Connect platform. Dit kan slechts één keer worden gedaan.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Setup Key</label>
              <input className="input" type="password" value={setupKey} onChange={e => setSetupKey(e.target.value)} required placeholder="SUPER_ADMIN_SETUP_KEY uit omgevingsvariabele" />
            </div>
            <div>
              <label className="label">E-mailadres beheerder</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div>
              <label className="label">Wachtwoord</label>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Min. 8 tekens, 1 hoofdletter, 1 cijfer" />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Aanmaken…' : 'Super Admin aanmaken'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
