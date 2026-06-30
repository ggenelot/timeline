'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Session } from '@supabase/supabase-js';
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
  { href: '/admin/materiels', label: 'Matériel', domain: 'admin-only' },
  { href: '/admin/materiels/items', label: 'Items', domain: 'admin-only' },
  { href: '/admin/materiels/categories', label: 'Types de matériel', domain: 'admin-only' },
  { href: '/admin/cursus', label: 'Cursus', domain: 'cursus' },
  { href: '/admin/competences-dashboard', label: 'Tableau de bord compétences', domain: 'cursus' },
  { href: '/admin/mission-types', label: 'Missions', domain: 'admin-only' },
  { href: '/admin/missions', label: 'Gestion des missions', domain: 'mission' },
  { href: '/admin/ope-dashboard', label: 'Tableau de bord OPE', domain: 'mission' },
  { href: '/admin/stats', label: 'Statistiques', domain: 'mission' },
  { href: '/admin/slack', label: 'Slack', domain: 'admin-only' },
  { href: '/admin/help', label: 'Aide', domain: 'admin-only' },
];

export function SidebarMenu({
  open,
  onClose,
  profile,
  session,
  className,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile | null;
  session: Session | null;
  className?: string;
}) {
  const [behaviors, setBehaviors] = useState<RoleBehavior[]>([]);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (open) {
      firstLinkRef.current?.focus();
    }
  }, [open]);

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
  const isResponsable = profile?.role === 'responsable';

  const visibleGestionItems = useMemo(() => {
    return GESTION_ITEMS.filter((item) => {
      if (isAdmin) return true;
      if (item.domain === 'admin-only') return false;
      // Les responsables ont accès au pilotage des missions (OPE, stats…).
      if (isResponsable && item.domain === 'mission') return true;
      return behaviors.some((b) => b.resource_type === item.domain && b.behavior_type === 'can_manage');
    });
  }, [isAdmin, isResponsable, behaviors]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  if (!session) return null;

  const linkClass = 'rounded-md px-3 py-2 font-medium text-slate-700 hover:bg-slate-50';
  const tab = open ? 0 : -1;

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        aria-hidden={!open}
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } ${className ?? ''}`}
      >
        <nav className="flex h-full w-64 flex-col gap-1 p-4 text-sm">
        <Link href="/missions" ref={firstLinkRef} onClick={onClose} tabIndex={tab} className={linkClass}>
          Timeline
        </Link>
        <Link href="/competences" onClick={onClose} tabIndex={tab} className={linkClass}>
          Compétences
        </Link>
        <Link href="/competences" onClick={onClose} tabIndex={tab} className={linkClass}>
          Cursus
        </Link>
        <Link href="/verification" onClick={onClose} tabIndex={tab} className={linkClass}>
          Vérification
        </Link>
        <Link href="/profile" onClick={onClose} tabIndex={tab} className={linkClass}>
          Profil
        </Link>

        {visibleGestionItems.length > 0 ? (
          <>
            <div className="mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Gestion</div>
            {visibleGestionItems.map((item) => (
              <Link key={item.href} href={item.href} onClick={onClose} tabIndex={tab} className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-50">
                {item.label}
              </Link>
            ))}
          </>
        ) : null}

        <button
          type="button"
          onClick={handleSignOut}
          tabIndex={tab}
          className="mt-auto rounded-md border border-slate-300 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
        >
          Se déconnecter
        </button>
        </nav>
      </aside>
    </>
  );
}
