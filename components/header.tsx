'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { AppRole } from '@/lib/types';

export function Header() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);

  useEffect(() => {
    async function loadUserState(currentSession: Session | null) {
      setSession(currentSession);

      if (!currentSession?.user) {
        setRole(null);
        return;
      }

      const { data } = await supabase.from('profiles').select('role').eq('id', currentSession.user.id).single();
      setRole(data?.role ?? null);
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
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/missions" className="font-semibold text-slate-800 hover:text-slate-900">
          Mission Planner
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {session ? (
            <>
              <Link href="/missions" className="text-slate-700 hover:text-slate-900">
                Missions
              </Link>
              <Link href={role === 'admin' ? '/admin/volunteers' : '/my-missions'} className="text-slate-700 hover:text-slate-900">
                {role === 'admin' ? 'Bénévoles' : 'Mes missions'}
              </Link>
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
