'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { AppRole, Profile } from '@/lib/types';

export function Header() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    async function loadUserState(currentSession: Session | null) {
      setSession(currentSession);

      if (!currentSession?.user) {
        setRole(null);
        setProfile(null);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('id,full_name,email,phone,role,sector,created_at')
        .eq('id', currentSession.user.id)
        .single();

      setRole(data?.role ?? null);
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

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
        <Link href="/missions" className="font-semibold text-slate-800 hover:text-slate-900">
          Timeline
        </Link>
        <nav className="flex w-full flex-col gap-2 text-sm sm:flex-1 sm:flex-row sm:items-center sm:gap-4">
          {session ? (
            <>
              <span className="break-words text-slate-600">Bonjour, {profile?.full_name ?? session.user.email}</span>
              <div className="flex flex-wrap items-center gap-3 sm:ml-auto sm:justify-end sm:gap-4">
                <Link href="/missions" className="text-slate-700 hover:text-slate-900">
                  Missions
                </Link>
                {role === 'admin' ? (
                  <Link href="/admin/volunteers" className="text-slate-700 hover:text-slate-900">
                    Bénévoles
                  </Link>
                ) : null}
                <Link href="/profile" className="text-slate-700 hover:text-slate-900">
                  Profil
                </Link>
                <button
                  onClick={handleSignOut}
                  className="rounded-md border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50 sm:ml-1"
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
    </header>
  );
}
