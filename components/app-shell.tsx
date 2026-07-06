'use client';

import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';
import { Header } from '@/components/header';
import { SidebarMenu, DesktopSidebar, BottomTabs, useVisibleGestionItems } from '@/components/sidebar-menu';
import { cn } from '@/lib/cn';

export function AppShell({ children }: { children: React.ReactNode }) {
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
        .select('id,full_name,email,role,sector,created_at,avatar_url')
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

  const gestionItems = useVisibleGestionItems(profile);

  return (
    <div className="min-h-screen">
      <DesktopSidebar profile={profile} session={session} gestionItems={gestionItems} />
      <Header
        session={session}
        profile={profile}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((o) => !o)}
      />
      <div className={cn('flex min-h-screen flex-col', session && 'lg:pl-[250px]')}>
        <main className="mx-auto w-full max-w-4xl px-4 py-8 pb-24 lg:pb-8">{children}</main>
      </div>
      <BottomTabs session={session} />
      <SidebarMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        profile={profile}
        session={session}
        gestionItems={gestionItems}
      />
    </div>
  );
}
