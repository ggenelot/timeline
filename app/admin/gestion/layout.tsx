'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/admin/gestion/aptitudes', label: 'Aptitudes' },
  { href: '/admin/gestion/responsabilites', label: 'Responsabilités' },
  { href: '/admin/gestion/visibilite', label: 'Visibilité' },
  { href: '/admin/gestion/slack', label: 'Slack' },
];

export default function GestionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex gap-8">
      <nav className="w-44 shrink-0">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
