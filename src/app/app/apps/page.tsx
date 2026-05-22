'use client';
import { useEffect, useState } from 'react';

interface AppDef { id: string; key: string; name: string; description: string; version: string; installed: boolean; installStatus?: string; }

export default function AppsPage() {
  const [apps, setApps] = useState<AppDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);

  const load = () => fetch('/api/apps/catalog').then(r => r.json()).then(d => { setApps(d); setLoading(false); });
  useEffect(() => { load(); }, []);

  async function install(key: string) {
    setInstalling(key);
    const res = await fetch(`/api/apps/${key}/install`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) alert(`Install failed: ${data.error}`);
    else alert(`✅ App installed! A workflow template has been created.`);
    setInstalling(null);
    load();
  }

  const appIcons: Record<string, string> = { 'invoice-monitor': '📊', 'contract-alerts': '📋', 'user-sync': '👥' };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">App Catalog</h1>
        <p className="text-gray-500 mt-1">Install pre-built apps to quickly set up workflows and dashboards</p>
      </div>
      {loading ? <p className="text-gray-500">Loading...</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map(app => (
            <div key={app.key} className="card p-6">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-3xl">{appIcons[app.key] ?? '📦'}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold">{app.name}</h3>
                  <p className="text-xs text-gray-500">v{app.version}</p>
                </div>
                {app.installed && <span className="badge-green">Installed</span>}
              </div>
              <p className="text-sm text-gray-600 mb-4">{app.description}</p>
              <div className="flex gap-2">
                {app.installed ? (
                  <button className="btn-secondary w-full text-sm" disabled>Already Installed</button>
                ) : (
                  <button className="btn-primary w-full text-sm" onClick={() => install(app.key)} disabled={installing === app.key}>
                    {installing === app.key ? 'Installing...' : 'Install'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
