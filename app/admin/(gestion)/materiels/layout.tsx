'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Onglets du module Matériel : une seule entrée de menu latéral ouvre cette
// page, et les trois vues (catalogue de contenants, bibliothèque d'items,
// catégories) se basculent par cette barre d'onglets plutôt que par trois
// entrées distinctes dans le menu.
const TABS = [
  { href: '/admin/materiels', label: 'Contenants' },
  { href: '/admin/materiels/items', label: 'Items' },
  { href: '/admin/materiels/categories', label: 'Types de matériel' },
];

export default function MaterielsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'inline-flex', gap: 4, padding: 4, background: '#f1f5f9', borderRadius: 12 }}>
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                textDecoration: 'none',
                borderRadius: 9,
                padding: '8px 16px',
                fontSize: 13.5,
                fontWeight: 700,
                fontFamily: 'inherit',
                color: active ? '#0f172a' : '#64748b',
                background: active ? '#fff' : 'transparent',
                boxShadow: active ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
