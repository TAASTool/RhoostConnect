'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV = [
  { href: '/admin', label: 'Klanten', icon: '⊞', exact: true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ email: string; role: string } | null>(null);

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(setUser).catch(() => router.push('/login'));
  }, [router]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-56 bg-gray-900 text-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-800">
          <span className="font-bold text-blue-400">Rhoost Connect</span>
          <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-widest">Admin Panel</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV.map(item => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                item.exact ? pathname === item.href : pathname.startsWith(item.href)
                  ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}>
              <span className="text-lg w-6 text-center">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-800">
          {user && (
            <div className="mb-2 px-2">
              <p className="text-xs text-gray-400 truncate">{user.email}</p>
              <p className="text-xs text-gray-500">Super Admin</p>
            </div>
          )}
          <button onClick={logout} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            <span>⏏</span><span>Logout</span>
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
