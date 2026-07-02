'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useMemo } from 'react';
import { Session } from '@supabase/supabase-js';
import { Profile } from '@/lib/types';
import { Icon } from '@/components/ui/icon';

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
  const greetingName = useMemo(() => {
    const fullName = profile?.full_name?.trim();
    if (fullName) {
      return fullName.split(/\s+/)[0];
    }

    return session?.user.email;
  }, [profile?.full_name, session?.user.email]);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-[rgba(255,255,255,.92)] backdrop-blur lg:hidden">
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
          <Image src="/logo.png" alt="" width={32} height={32} className="h-8 w-8 object-contain" priority />
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
