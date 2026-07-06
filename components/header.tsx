'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { Profile } from '@/lib/types';
import { Icon } from '@/components/ui/icon';
import { useBranding } from '@/lib/branding/branding-context';
import { cn } from '@/lib/cn';

export function Header({
  session,
  profile,
  menuOpen,
  onToggleMenu,
}: {
  session: Session | null;
  profile: Profile | null;
  menuOpen: boolean;
  onToggleMenu: () => void;
}) {
  const branding = useBranding();

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const greetingName = useMemo(() => {
    const fullName = profile?.full_name?.trim();
    if (fullName) {
      return fullName.split(/\s+/)[0];
    }

    return session?.user.email;
  }, [profile?.full_name, session?.user.email]);

  return (
    <header
      className={cn(
        'glass-tabbar sticky top-0 z-30 transition-[background-color,box-shadow,border-color] duration-200 lg:hidden',
        scrolled
          ? 'border-b border-white/75 bg-white/45 shadow-[0_10px_30px_-18px_rgba(12,19,38,.35)] backdrop-blur-md backdrop-saturate-[2]'
          : 'border-b border-transparent bg-surface'
      )}
    >
      <div className="flex items-center gap-3 px-4 py-2.5">
        {session ? (
          <button
            type="button"
            onClick={onToggleMenu}
            aria-label="Ouvrir le menu"
            aria-expanded={menuOpen}
            className="-ml-1 rounded-lg p-1.5 text-ink-2 transition-colors hover:bg-[#F4F6FB]"
          >
            <Icon name="menu" size={26} />
          </button>
        ) : null}
        <Link href="/missions" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo personnalisable (URL admin), hôte inconnu à la compilation */}
          <img src={branding.logoUrl ?? '/logo.png'} alt="" width={32} height={32} className="h-8 w-8 object-contain" />
          <span className="text-[17px] font-extrabold text-ink">Timeline</span>
        </Link>
        {session ? (
          <span className="ml-auto truncate text-sm text-ink-2">Bonjour, {greetingName}</span>
        ) : (
          <Link href="/login" className="ml-auto text-sm font-semibold text-brand hover:underline">
            Connexion
          </Link>
        )}
      </div>
    </header>
  );
}
