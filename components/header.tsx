'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Session } from '@supabase/supabase-js';
import { Profile } from '@/lib/types';

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
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex w-full max-w-4xl items-center gap-4 overflow-x-auto px-4 py-3">
        {session ? (
          <button
            type="button"
            onClick={onToggleMenu}
            aria-label="Ouvrir le menu"
            aria-expanded={menuOpen}
            className="flex flex-col gap-1 rounded-md p-2 hover:bg-slate-50"
          >
            <span className="block h-0.5 w-5 bg-slate-700" />
            <span className="block h-0.5 w-5 bg-slate-700" />
            <span className="block h-0.5 w-5 bg-slate-700" />
          </button>
        ) : null}
        <Link href="/missions" className="font-semibold text-slate-800 hover:text-slate-900">
          Timeline
        </Link>
        <nav className="flex min-w-max flex-1 items-center gap-4 text-sm">
          {session ? (
            <span className="ml-auto whitespace-nowrap text-slate-600">Bonjour, {greetingName}</span>
          ) : (
            <Link href="/login" className="ml-auto text-slate-700 hover:text-slate-900">
              Connexion
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
