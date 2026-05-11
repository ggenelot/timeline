'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/admin/gestion/mission-types', label: 'Types de missions' },
  { href: '/admin/gestion/aptitudes', label: 'Aptitudes' },
  { href: '/admin/gestion/responsabilites', label: 'Responsabilités' },
  { href: '/admin/gestion/visibilite', label: 'Visibilité' },
  { href: '/admin/gestion/slack', label: 'Slack' },
];

export default function GestionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-8">
      <nav className="shrink-0 md:w-44">
        <ul className="flex gap-1 overflow-x-auto md:flex-col md:space-y-1">
          {navItems.map((item) => (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                className={`block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
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
