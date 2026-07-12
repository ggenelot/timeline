'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { PermissionAction, PermissionEntry, PermissionResource, Role, RoleBehavior } from '@/lib/types';

// Contexte de permissions côté client, alimenté par un unique fetch de
// /api/roles/mine (aplati côté serveur, implication can_manage ⇒ can_see déjà
// résolue). Purement UX : les vraies gardes restent la RLS et les routes API.

export type PermissionScope = {
  missionTypeId?: string;
  missionStatus?: string;
};

type PermissionsState = {
  loading: boolean;
  isAdmin: boolean;
  roles: Role[];
  behaviors: RoleBehavior[];
  entries: PermissionEntry[];
};

type PermissionsContextValue = PermissionsState & {
  /**
   * L'utilisateur détient-il l'action sur la ressource ? Le scope (type /
   * statut de mission) n'est pertinent que pour resource = 'mission' ; un
   * scope vide côté permission signifie « tous ».
   */
  can: (resource: PermissionResource, action: PermissionAction, scope?: PermissionScope) => boolean;
  refresh: () => Promise<void>;
};

const INITIAL_STATE: PermissionsState = {
  loading: true,
  isAdmin: false,
  roles: [],
  behaviors: [],
  entries: []
};

const PermissionsContext = createContext<PermissionsContextValue>({
  ...INITIAL_STATE,
  can: () => false,
  refresh: async () => {}
});

type MinePayload = {
  roles: Role[];
  behaviors: RoleBehavior[];
  isAdmin: boolean;
  permissions: PermissionEntry[];
};

function entryMatches(entry: PermissionEntry, resource: PermissionResource, action: PermissionAction, scope?: PermissionScope): boolean {
  if (entry.resource !== resource || entry.action !== action) return false;
  if (resource !== 'mission') return true;
  if (scope?.missionTypeId && entry.mission_type_ids.length > 0 && !entry.mission_type_ids.includes(scope.missionTypeId)) {
    return false;
  }
  if (scope?.missionStatus && entry.mission_statuses.length > 0 && !entry.mission_statuses.includes(scope.missionStatus)) {
    return false;
  }
  return true;
}

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PermissionsState>(INITIAL_STATE);

  const load = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setState({ ...INITIAL_STATE, loading: false });
      return;
    }

    const res = await fetch('/api/roles/mine', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setState({ ...INITIAL_STATE, loading: false });
      return;
    }

    const payload = (await res.json()) as MinePayload;
    setState({
      loading: false,
      isAdmin: Boolean(payload.isAdmin),
      roles: payload.roles ?? [],
      behaviors: payload.behaviors ?? [],
      entries: payload.permissions ?? []
    });
  }, []);

  useEffect(() => {
    void load();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        void load();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [load]);

  const value = useMemo<PermissionsContextValue>(
    () => ({
      ...state,
      can: (resource, action, scope) => {
        if (state.isAdmin) return true;
        return state.entries.some((entry) => entryMatches(entry, resource, action, scope));
      },
      refresh: load
    }),
    [state, load]
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

/** Permissions de l'utilisateur courant (sidebar, gating UX des pages…). */
export function usePermissions(): PermissionsContextValue {
  return useContext(PermissionsContext);
}
