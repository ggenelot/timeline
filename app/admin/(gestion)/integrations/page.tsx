'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { usePermissions } from '@/lib/permissions/permissions-context';
import { Icon } from '@/components/ui/icon';

type IntegrationSummary = {
  key: string;
  name: string;
  description: string;
  configured: boolean;
};

// Annuaire des intégrations externes disponibles (eOPE aujourd'hui, d'autres
// outils demain). Chaque intégration a sa page de configuration dédiée.
export default function IntegrationsPage() {
  const router = useRouter();
  const { loading: permissionsLoading, can } = usePermissions();
  const canManage = can('settings', 'can_manage');

  const [integrations, setIntegrations] = useState<IntegrationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (permissionsLoading) return;

    async function load() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace('/login');
        return;
      }
      if (!canManage) {
        setLoading(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setError('Session invalide. Veuillez vous reconnecter.');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/admin/integrations', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const payload = (await response.json()) as { integrations?: IntegrationSummary[]; error?: string };
      if (!response.ok) {
        setError(payload.error ?? 'Impossible de charger les intégrations.');
      } else {
        setIntegrations(payload.integrations ?? []);
      }
      setLoading(false);
    }

    void load();
  }, [permissionsLoading, canManage, router]);

  if (loading || permissionsLoading) return <p className="text-sm text-ink-2">Chargement...</p>;

  if (!canManage) {
    return (
      <div className="rounded-lg border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
        Accès refusé : vous n’avez pas la permission de gérer les réglages.
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface-card p-4 shadow-card">
      <div>
        <h1 className="text-[26px] font-black leading-tight tracking-[-0.02em] text-ink">Intégrations</h1>
        <p className="mt-1 text-sm text-ink-2">
          Connectez Timeline à d’autres outils. La configuration (identifiants, secrets) se fait ici, sans variables
          d’environnement.
        </p>
      </div>

      {error ? <div className="rounded-md border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div> : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {integrations.map((integration) => (
          <li key={integration.key}>
            <Link
              href={`/admin/integrations/${integration.key}`}
              className="flex h-full flex-col gap-2 rounded-xl border border-line p-4 transition hover:bg-surface-sub"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-bold text-ink">{integration.name}</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    integration.configured
                      ? 'border-ok-line bg-ok-soft text-ok-text'
                      : 'border-line-field bg-surface-sub text-ink-3'
                  }`}
                >
                  <Icon name={integration.configured ? 'check_circle' : 'radio_button_unchecked'} size={14} />
                  {integration.configured ? 'Configurée' : 'Non configurée'}
                </span>
              </div>
              <p className="text-sm text-ink-2">{integration.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
