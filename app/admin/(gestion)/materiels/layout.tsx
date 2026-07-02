'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

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
      <div className="mb-5 inline-flex gap-1 rounded-xl bg-[#E4E9F2] p-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'rounded-[9px] px-4 py-2 text-[13.5px] font-bold transition-colors',
                active ? 'bg-surface-card text-ink shadow-[0_1px_2px_rgba(15,23,42,0.08)]' : 'text-ink-2 hover:text-ink'
              )}
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
