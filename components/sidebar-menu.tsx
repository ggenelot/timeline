'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { PermissionAction, PermissionResource, Profile } from '@/lib/types';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { useBranding } from '@/lib/branding/branding-context';
import { usePermissions } from '@/lib/permissions/permissions-context';

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

type GestionItem = NavItem & {
  // Permission requise pour voir l'entrée (gating UX — les vraies gardes
  // sont la RLS et les routes API) + section d'affichage.
  required: { resource: PermissionResource; action: PermissionAction };
  section: 'pilotage' | 'gestion';
};

// Éléments personnels — section « Moi » de la sidebar.
const PERSO_ITEMS: NavItem[] = [
  { href: '/missions', label: 'Timeline', icon: 'event_note' },
  { href: '/competences', label: 'Compétences', icon: 'workspace_premium' },
  { href: '/verification', label: 'Vérification', icon: 'fact_check' },
  { href: '/profile', label: 'Profil', icon: 'person' }
];

// Onglets de la barre du bas (mobile) — sous-ensemble bénévole.
const TAB_ITEMS: NavItem[] = [
  { href: '/missions', label: 'Timeline', icon: 'event_note' },
  { href: '/competences', label: 'Compét.', icon: 'workspace_premium' },
  { href: '/verification', label: 'Vérif', icon: 'fact_check' },
  { href: '/profile', label: 'Profil', icon: 'person' }
];

const GESTION_ITEMS: GestionItem[] = [
  // Console d'admin bénévoles (création de comptes, sync Slack) : can_manage.
  // La visibilité lecture seule des bénévoles passe par la RLS + le tableau
  // de bord compétences.
  { href: '/admin/volunteers', label: 'Bénévoles', required: { resource: 'volunteer', action: 'can_manage' }, section: 'gestion', icon: 'groups' },
  { href: '/admin/roles', label: 'Rôles', required: { resource: 'administration', action: 'can_manage' }, section: 'gestion', icon: 'badge' },
  { href: '/admin/skills', label: 'Compétences', required: { resource: 'skill', action: 'can_manage' }, section: 'gestion', icon: 'workspace_premium' },
  { href: '/admin/materiels', label: 'Matériel', required: { resource: 'materiel', action: 'can_see' }, section: 'gestion', icon: 'inventory_2' },
  // Éditeur du référentiel cursus : réservé à can_manage. La supervision
  // lecture seule (présidente) passe par le tableau de bord compétences.
  { href: '/admin/cursus', label: 'Cursus', required: { resource: 'cursus', action: 'can_manage' }, section: 'pilotage', icon: 'school' },
  { href: '/admin/competences-dashboard', label: 'Tableau de bord compétences', required: { resource: 'cursus', action: 'can_see' }, section: 'pilotage', icon: 'insights' },
  { href: '/admin/mission-types', label: 'Missions', required: { resource: 'mission_type', action: 'can_manage' }, section: 'gestion', icon: 'category' },
  { href: '/admin/missions', label: 'Gestion des missions', required: { resource: 'mission', action: 'can_manage' }, section: 'pilotage', icon: 'edit_calendar' },
  { href: '/admin/ope-dashboard', label: 'Tableau de bord OPE', required: { resource: 'mission', action: 'can_manage' }, section: 'pilotage', icon: 'dashboard' },
  { href: '/admin/mission-board', label: 'Tableau de gestion des missions', required: { resource: 'mission', action: 'can_manage' }, section: 'pilotage', icon: 'assignment_turned_in' },
  // ⚠ Pas `mission/can_see` : ce comportement sert déjà à la visibilité
  // timeline des bénévoles de base — il ne doit pas ouvrir les stats.
  { href: '/admin/stats', label: 'Statistiques', required: { resource: 'mission', action: 'can_manage' }, section: 'pilotage', icon: 'bar_chart' },
  { href: '/admin/apparence', label: 'Apparence', required: { resource: 'settings', action: 'can_manage' }, section: 'gestion', icon: 'palette' },
  { href: '/admin/help', label: 'Aide', required: { resource: 'settings', action: 'can_manage' }, section: 'gestion', icon: 'help' }
];

/**
 * Filtre GESTION_ITEMS selon les permissions de l'utilisateur (contexte
 * PermissionsProvider, un seul fetch de /api/roles/mine pour toute l'app).
 */
export function useVisibleGestionItems(): GestionItem[] {
  const { can } = usePermissions();

  return useMemo(
    () => GESTION_ITEMS.filter((item) => can(item.required.resource, item.required.action)),
    [can]
  );
}

async function signOut() {
  await supabase.auth.signOut();
  window.location.href = '/login';
}

function getInitials(profile: Profile | null): string {
  const name = profile?.full_name?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return profile?.email?.[0]?.toUpperCase() ?? '?';
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  onNavigate,
  tabIndex,
  innerRef
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  tabIndex?: number;
  innerRef?: React.Ref<HTMLAnchorElement>;
}) {
  return (
    <Link
      ref={innerRef}
      href={item.href}
      onClick={onNavigate}
      tabIndex={tabIndex}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-sm transition-colors',
        active
          ? 'bg-accent-soft font-bold text-accent-text ring-1 ring-inset ring-accent-ring'
          : 'font-medium text-ink-2 hover:bg-[#F4F6FB]'
      )}
    >
      <Icon name={item.icon} size={20} className={active ? 'text-accent' : 'text-ink-3'} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      <div className="px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">{label}</div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function SidebarBrand({ onNavigate }: { onNavigate?: () => void }) {
  const branding = useBranding();

  return (
    <Link href="/missions" onClick={onNavigate} className="flex items-center gap-2.5 px-3 py-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- logo personnalisable (URL admin), hôte inconnu à la compilation */}
      <img
        src={branding.logoUrl ?? '/logo.png'}
        alt={branding.orgTagline}
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 object-contain"
      />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[18px] font-extrabold text-ink">Timeline</span>
        <span className="truncate text-[11.5px] text-ink-3">{branding.orgTagline}</span>
      </span>
    </Link>
  );
}

function SidebarNav({
  gestionItems,
  onNavigate,
  tabIndex,
  firstLinkRef
}: {
  gestionItems: GestionItem[];
  onNavigate?: () => void;
  tabIndex?: number;
  firstLinkRef?: React.Ref<HTMLAnchorElement>;
}) {
  const isActive = useIsActive();
  const pilotage = gestionItems.filter((item) => item.section === 'pilotage');
  const administration = gestionItems.filter((item) => item.section === 'gestion');

  return (
    <nav className="flex flex-col p-3">
      <NavSection label="Moi">
        {PERSO_ITEMS.map((item, idx) => (
          <NavLink
            key={item.label}
            item={item}
            active={isActive(item.href)}
            onNavigate={onNavigate}
            tabIndex={tabIndex}
            innerRef={idx === 0 ? firstLinkRef : undefined}
          />
        ))}
      </NavSection>

      {pilotage.length > 0 ? (
        <NavSection label="Pilotage">
          {pilotage.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} onNavigate={onNavigate} tabIndex={tabIndex} />
          ))}
        </NavSection>
      ) : null}

      {administration.length > 0 ? (
        <NavSection label="Gestion">
          {administration.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} onNavigate={onNavigate} tabIndex={tabIndex} />
          ))}
        </NavSection>
      ) : null}
    </nav>
  );
}

function SidebarProfile({ profile, tabIndex }: { profile: Profile | null; tabIndex?: number }) {
  const { roles } = usePermissions();
  const roleNames = roles.map((role) => role.name).join(', ');

  return (
    <div className="mt-auto border-t border-line p-3">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{
            background:
              'linear-gradient(to bottom right, color-mix(in srgb, white 20%, var(--color-accent, #FF7F30)), var(--color-accent, #FF7F30))'
          }}
        >
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            getInitials(profile)
          )}
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold text-ink">{profile?.full_name ?? '—'}</span>
          <span className="truncate text-[11.5px] text-ink-3">
            {roleNames || profile?.email}
          </span>
        </span>
        <button
          type="button"
          onClick={signOut}
          tabIndex={tabIndex}
          aria-label="Se déconnecter"
          className="ml-auto rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-[#F4F6FB] hover:text-ink-2"
        >
          <Icon name="logout" size={20} />
        </button>
      </div>
    </div>
  );
}

/** Sidebar fixe (bureau ≥1024px). */
export function DesktopSidebar({
  profile,
  session,
  gestionItems
}: {
  profile: Profile | null;
  session: Session | null;
  gestionItems: GestionItem[];
}) {
  if (!session) return null;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[250px] flex-col border-r border-line bg-surface-card lg:flex">
      <div className="px-2 pb-2 pt-4">
        <SidebarBrand />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav gestionItems={gestionItems} />
      </div>
      <SidebarProfile profile={profile} />
    </aside>
  );
}

/** Barre d'onglets fixe en bas (mobile <1024px). */
export function BottomTabs({ session }: { session: Session | null }) {
  const isActive = useIsActive();
  if (!session) return null;

  return (
    <nav
      className="glass-tabbar fixed inset-x-3.5 z-30 flex h-[66px] items-center justify-between rounded-full border border-white/75 bg-white/35 px-1.5 shadow-[0_18px_40px_-16px_rgba(12,19,38,.45),inset_0_1px_0_rgba(255,255,255,.9)] backdrop-blur-md backdrop-saturate-[2] lg:hidden"
      style={{ bottom: 'calc(14px + env(safe-area-inset-bottom))' }}
    >
      {/* reflet — purement décoratif */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(115deg,rgba(255,255,255,.4)_0%,transparent_40%,transparent_65%,rgba(255,255,255,.25)_100%)]"
      />
      {TAB_ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex h-[52px] w-20 flex-col items-center justify-center gap-0.5 rounded-full text-[10.5px] transition-colors',
              active
                ? 'bg-brand/10 font-bold text-brand shadow-[inset_0_1px_0_rgba(255,255,255,.65),inset_0_0_0_1px_rgba(0,45,116,.1)]'
                : 'font-semibold text-ink-2'
            )}
          >
            <Icon name={item.icon} size={24} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Tiroir de navigation (mobile) — donne accès à toute la nav dont la gestion. */
export function SidebarMenu({
  open,
  onClose,
  profile,
  session,
  gestionItems
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile | null;
  session: Session | null;
  gestionItems: GestionItem[];
}) {
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (open) {
      firstLinkRef.current?.focus();
    }
  }, [open]);

  if (!session) return null;

  const tab = open ? 0 : -1;

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-[rgba(12,19,38,.45)] transition-opacity duration-200 lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      />
      <aside
        aria-hidden={!open}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-line bg-surface-card transition-transform duration-200 lg:hidden',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-2 pb-2 pt-4">
          <SidebarBrand onNavigate={onClose} />
          <button
            type="button"
            onClick={onClose}
            tabIndex={tab}
            aria-label="Fermer le menu"
            className="rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-[#F4F6FB]"
          >
            <Icon name="close" size={22} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav gestionItems={gestionItems} onNavigate={onClose} tabIndex={tab} firstLinkRef={firstLinkRef} />
        </div>
        <SidebarProfile profile={profile} tabIndex={tab} />
      </aside>
    </>
  );
}
