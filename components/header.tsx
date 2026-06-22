'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';
import { SidebarMenu } from '@/components/sidebar-menu';

export function Header() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    async function loadUserState(currentSession: Session | null) {
      setSession(currentSession);

      if (!currentSession?.user) {
        setProfile(null);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('id,full_name,email,role,sector,created_at')
        .eq('id', currentSession.user.id)
        .single();

      setProfile(data ?? null);
    }

    supabase.auth.getSession().then(({ data }) => {
      loadUserState(data.session);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      loadUserState(newSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const greetingName = useMemo(() => {
    const fullName = profile?.full_name?.trim();
    if (fullName) {
      return fullName.split(/\s+/)[0];
    }

    return session?.user.email;
  }, [profile?.full_name, session?.user.email]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex w-full max-w-4xl items-center gap-4 overflow-x-auto px-4 py-3">
        {session ? (
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Ouvrir le menu"
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
            <>
              <span className="whitespace-nowrap text-slate-600">Bonjour, {greetingName}</span>
              <div className="ml-auto flex items-center gap-4 whitespace-nowrap">
                <Link href="/profile" className="text-slate-700 hover:text-slate-900">
                  Profil
                </Link>
                <button
                  onClick={handleSignOut}
                  className="rounded-md border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50"
                  type="button"
                >
                  Se déconnecter
                </button>
              </div>
            </>
          ) : (
            <Link href="/login" className="text-slate-700 hover:text-slate-900">
              Connexion
            </Link>
          )}
        </nav>
      </div>
      <SidebarMenu open={menuOpen} onClose={() => setMenuOpen(false)} profile={profile} />
    </header>
  );
}
