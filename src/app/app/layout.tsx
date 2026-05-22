'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV = [
  { href: '/app/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/app/integrations', label: 'Integrations', icon: '⇄' },
  { href: '/app/automations', label: 'Automations', icon: '⚙' },
  { href: '/app/apps', label: 'Apps', icon: '⊞' },
  { href: '/app/monitoring', label: 'Monitoring', icon: '◉' },
  { href: '/app/audit', label: 'Audit', icon: '≡' },
];

const ADMIN_NAV = { href: '/app/users', label: 'Gebruikers', icon: '👥' };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ email: string; role: string; tenantName?: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(setUser).catch(() => router.push('/login'));
  }, [router]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const canManageUsers = user && (user.role === 'Owner' || user.role === 'Admin' || user.role === 'super_admin');
  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className={`${sidebarOpen ? 'w-56' : 'w-16'} transition-all bg-gray-900 text-white flex flex-col`}>
        <div className="p-4 flex items-center gap-3 border-b border-gray-800">
          {sidebarOpen && <span className="font-bold text-blue-400">Rhoost Connect</span>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="ml-auto text-gray-400 hover:text-white text-lg">☰</button>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {NAV.map(item => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                pathname.startsWith(item.href) ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}>
              <span className="text-lg w-6 text-center flex-shrink-0">{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
          {canManageUsers && (
            <Link href={ADMIN_NAV.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                pathname.startsWith(ADMIN_NAV.href) ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}>
              <span className="text-lg w-6 text-center flex-shrink-0">{ADMIN_NAV.icon}</span>
              {sidebarOpen && <span>{ADMIN_NAV.label}</span>}
            </Link>
          )}
          {isSuperAdmin && (
            <Link href="/admin"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-amber-400 hover:bg-gray-800 hover:text-amber-300 border border-amber-800/40 mt-2">
              <span className="text-lg w-6 text-center flex-shrink-0">⚡</span>
              {sidebarOpen && <span>Admin Panel</span>}
            </Link>
          )}
        </nav>
        <div className="p-3 border-t border-gray-800">
          {sidebarOpen && user && (
            <div className="mb-2 px-2">
              <p className="text-xs text-gray-400 truncate">{user.email}</p>
              <p className="text-xs text-gray-500">{user.role} · {user.tenantName}</p>
            </div>
          )}
          <button onClick={logout} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            <span>⏏</span>{sidebarOpen && 'Logout'}
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
