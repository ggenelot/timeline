'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Profile, RoleBehavior, RoleBehaviorResourceType } from '@/lib/types';

type GestionItem = {
  href: string;
  label: string;
  domain: RoleBehaviorResourceType | 'admin-only';
};

const GESTION_ITEMS: GestionItem[] = [
  { href: '/admin/volunteers', label: 'Bénévoles', domain: 'admin-only' },
  { href: '/admin/roles', label: 'Rôles', domain: 'admin-only' },
  { href: '/admin/skills', label: 'Compétences', domain: 'admin-only' },
  { href: '/admin/cursus', label: 'Cursus', domain: 'cursus' },
  { href: '/admin/mission-types', label: 'Missions', domain: 'admin-only' },
  { href: '/admin/stats', label: 'Statistiques', domain: 'mission' },
  { href: '/admin/slack', label: 'Slack', domain: 'admin-only' },
  { href: '/admin/help', label: 'Aide', domain: 'admin-only' },
];

export function SidebarMenu({
  open,
  onClose,
  profile,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile | null;
}) {
  const [behaviors, setBehaviors] = useState<RoleBehavior[]>([]);

  useEffect(() => {
    if (!open || !profile) return;

    async function loadBehaviors() {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? '';
      const res = await fetch('/api/roles/mine', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const { behaviors: data } = (await res.json()) as { behaviors: RoleBehavior[] };
        setBehaviors(data);
      }
    }

    void loadBehaviors();
  }, [open, profile]);

  const isAdmin = profile?.role === 'admin';

  const visibleGestionItems = useMemo(() => {
    return GESTION_ITEMS.filter((item) => {
      if (isAdmin) return true;
      if (item.domain === 'admin-only') return false;
      return behaviors.some((b) => b.resource_type === item.domain && b.behavior_type === 'can_manage');
    });
  }, [isAdmin, behaviors]);

  if (!profile) return null;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform overflow-y-auto bg-white shadow-xl transition-transform ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <nav className="flex flex-col gap-1 p-4 text-sm">
          <Link href="/missions" onClick={onClose} className="rounded-md px-3 py-2 font-medium text-slate-700 hover:bg-slate-50">
            Mission
          </Link>
          <Link href="/competences" onClick={onClose} className="rounded-md px-3 py-2 font-medium text-slate-700 hover:bg-slate-50">
            Compétences
          </Link>
          <Link href="/competences" onClick={onClose} className="rounded-md px-3 py-2 font-medium text-slate-700 hover:bg-slate-50">
            Cursus
          </Link>

          {visibleGestionItems.length > 0 ? (
            <>
              <div className="mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Gestion</div>
              {visibleGestionItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-50"
                >
                  {item.label}
                </Link>
              ))}
            </>
          ) : null}
        </nav>
      </aside>
    </>
  );
}
