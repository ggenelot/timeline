'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { usePermissions } from '@/lib/permissions/permissions-context';
import { Button } from '@/components/ui/button';

type ConfigField = {
  key: string;
  label: string;
  help?: string;
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
};

type ConfigPayload = {
  definition: { key: string; name: string; description: string; fields: ConfigField[] };
  values: Record<string, string | null>;
  secretsSet: Record<string, boolean>;
  configured: boolean;
  error?: string;
};

type SyncConflict = {
  eope_event_id: string;
  eope_title: string;
  eope_starts_at: string;
  mission_id: string;
  mission_title: string;
};

type SyncRun = {
  id: string;
  direction: 'pull' | 'push' | 'full';
  trigger_source: 'manual' | 'cron';
  status: 'running' | 'success' | 'partial' | 'error';
  started_at: string;
  finished_at: string | null;
  stats: {
    events_seen?: number;
    missions_created?: number;
    missions_updated?: number;
    missions_cancelled?: number;
    commitments_created?: number;
    commitments_deleted?: number;
    conflicts?: SyncConflict[];
    skipped_unlinked?: Array<{ mission_id: string; volunteer_id: string; full_name: string | null }>;
  };
  errors: Array<{ scope: string; item_ref: string; message: string }>;
};

type EopeStatus = {
  configured: boolean;
  baseUrl: string | null;
  syncWindowDays: number;
  cronConfigured: boolean;
  lastRuns: SyncRun[];
  linkedMissionsCount: number;
  linkedVolunteersCount: number;
  unlinkedEngaged: Array<{ volunteer_id: string; full_name: string | null; mission_id: string; mission_title: string }>;
};

const RUN_STATUS_LABELS: Record<SyncRun['status'], string> = {
  running: 'En cours',
  success: 'Succès',
  partial: 'Partiel',
  error: 'Erreur'
};

const RUN_STATUS_CLASSES: Record<SyncRun['status'], string> = {
  running: 'border-line-field bg-surface-sub text-ink-2',
  success: 'border-ok-line bg-ok-soft text-ok-text',
  partial: 'border-warn-line bg-warn-soft text-warn-text',
  error: 'border-bad/30 bg-bad-soft text-bad'
};

const DIRECTION_LABELS: Record<SyncRun['direction'], string> = {
  pull: 'Import (événements)',
  push: 'Export (équipages)',
  full: 'Complète'
};

function formatDateTime(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function summarizeRunStats(run: SyncRun) {
  const stats = run.stats ?? {};
  const parts: string[] = [];
  if (run.direction !== 'push') {
    parts.push(`${stats.events_seen ?? 0} évts`);
    parts.push(`+${stats.missions_created ?? 0} / ~${stats.missions_updated ?? 0} / ✕${stats.missions_cancelled ?? 0} missions`);
  }
  if (run.direction !== 'pull') {
    parts.push(`+${stats.commitments_created ?? 0} / −${stats.commitments_deleted ?? 0} engagements`);
  }
  const conflictCount = stats.conflicts?.length ?? 0;
  if (conflictCount > 0) parts.push(`${conflictCount} conflit${conflictCount > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

export default function EopeAdminPage() {
  const router = useRouter();
  const { loading: permissionsLoading, can } = usePermissions();
  const canManage = can('settings', 'can_manage');

  const [status, setStatus] = useState<EopeStatus | null>(null);
  const [config, setConfig] = useState<ConfigPayload | null>(null);
  const [configForm, setConfigForm] = useState<Record<string, string>>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [linkingEventId, setLinkingEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedRuns, setCopiedRuns] = useState(false);

  const getAccessToken = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData.session?.access_token ?? null;
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError('Session invalide. Veuillez vous reconnecter.');
        return;
      }

      const [statusRes, configRes] = await Promise.all([
        fetch('/api/admin/integrations/eope/status', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }),
        fetch('/api/admin/integrations/eope/config', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
      ]);

      if (!statusRes.ok || !configRes.ok) {
        const statusErr = (await statusRes.json().catch(() => ({})))?.error as string | undefined;
        const configErr = (await configRes.json().catch(() => ({})))?.error as string | undefined;
        setError(statusErr ?? configErr ?? "Impossible de charger l'état de l'intégration eOPE.");
        return;
      }

      // Réponses 2xx : un corps illisible doit remonter au catch (erreur
      // visible), pas devenir un payload vide qui ferait planter le rendu.
      const statusPayload = (await statusRes.json()) as EopeStatus;
      const configPayload = (await configRes.json()) as ConfigPayload;

      setStatus({
        ...statusPayload,
        lastRuns: statusPayload.lastRuns ?? [],
        unlinkedEngaged: statusPayload.unlinkedEngaged ?? []
      });
      setConfig(configPayload);
      // Pré-remplit le formulaire avec les valeurs non secrètes ; les secrets
      // restent vides (saisir une valeur les remplace, vide = conserver).
      setConfigForm(
        Object.fromEntries(
          (configPayload.definition?.fields ?? []).map((field) => [
            field.key,
            field.secret ? '' : configPayload.values?.[field.key] ?? ''
          ])
        )
      );
    } catch (loadError) {
      // Toute exception (réseau, réponse inattendue) doit être VISIBLE plutôt
      // que de laisser la page figée dans son état précédent.
      setError(
        `Erreur au chargement de l'état eOPE : ${loadError instanceof Error ? loadError.message : String(loadError)}`
      );
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (permissionsLoading) return;

    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace('/login');
        return;
      }
      if (!canManage) {
        setLoading(false);
        return;
      }
      await loadStatus();
    }

    void init();
  }, [permissionsLoading, canManage, router, loadStatus]);

  async function handleSync() {
    setError(null);
    setNotice(null);
    setSyncing(true);

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setError('Session invalide. Veuillez vous reconnecter.');
      setSyncing(false);
      return;
    }

    const response = await fetch('/api/admin/integrations/eope/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ direction: 'full' })
    });
    const payload = (await response.json()) as { error?: string; status?: string };
    if (!response.ok) {
      setError(payload.error ?? 'La synchronisation a échoué.');
    } else {
      setNotice(
        payload.status === 'success'
          ? 'Synchronisation terminée avec succès.'
          : 'Synchronisation terminée avec des avertissements — voir le journal ci-dessous.'
      );
    }

    setSyncing(false);
    await loadStatus();
  }

  async function handleLinkMission(missionId: string, eopeEventId: string) {
    setError(null);
    setNotice(null);
    setLinkingEventId(eopeEventId);

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setError('Session invalide. Veuillez vous reconnecter.');
      setLinkingEventId(null);
      return;
    }

    const response = await fetch(`/api/admin/integrations/eope/missions/${missionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ eope_event_id: eopeEventId })
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? 'La liaison a échoué.');
    } else {
      setNotice('Mission liée à l’événement eOPE. Le prochain import mettra ses champs à jour.');
    }

    setLinkingEventId(null);
    await loadStatus();
  }

  async function handleSaveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSavingConfig(true);

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setError('Session invalide. Veuillez vous reconnecter.');
      setSavingConfig(false);
      return;
    }

    // Les secrets laissés vides ne sont pas envoyés : la valeur existante est
    // conservée. Pour effacer un secret, utiliser le bouton dédié.
    const updates: Record<string, string> = {};
    for (const field of config?.definition.fields ?? []) {
      const value = configForm[field.key] ?? '';
      if (field.secret && !value.trim()) continue;
      updates[field.key] = value;
    }

    const response = await fetch('/api/admin/integrations/eope/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(updates)
    });
    const payload = (await response.json()) as {
      error?: string;
      configured?: boolean;
      values?: Record<string, string | null>;
      secretsSet?: Record<string, boolean>;
    };
    if (!response.ok) {
      setError(payload.error ?? "L'enregistrement de la configuration a échoué.");
    } else {
      setNotice('Configuration enregistrée.');
      // Répercute immédiatement l'état renvoyé par le PATCH (source de
      // vérité), sans attendre le rechargement complet : le bandeau « non
      // configurée » et le bouton de synchronisation suivent instantanément.
      const configured = Boolean(payload.configured);
      setStatus((prev) => (prev ? { ...prev, configured } : prev));
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              configured,
              values: payload.values ?? prev.values,
              secretsSet: payload.secretsSet ?? prev.secretsSet
            }
          : prev
      );
    }

    setSavingConfig(false);
    await loadStatus();
  }

  async function handleClearSecret(fieldKey: string) {
    setError(null);
    setNotice(null);

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setError('Session invalide. Veuillez vous reconnecter.');
      return;
    }

    const response = await fetch('/api/admin/integrations/eope/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ [fieldKey]: '' })
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? 'La suppression du secret a échoué.');
    } else {
      setNotice('Secret effacé.');
    }
    await loadStatus();
  }

  async function handleCopyRuns() {
    if (!status || status.lastRuns.length === 0) return;
    try {
      // Journal brut (stats + erreurs), pratique à coller dans un ticket ou
      // un échange de support pour diagnostiquer une synchronisation.
      await navigator.clipboard.writeText(JSON.stringify(status.lastRuns, null, 2));
      setCopiedRuns(true);
      setTimeout(() => setCopiedRuns(false), 2000);
    } catch {
      setError('Impossible de copier le journal (autorisation presse-papiers refusée).');
    }
  }

  if (loading || permissionsLoading) return <p className="text-sm text-ink-2">Chargement...</p>;

  if (!canManage) {
    return (
      <div className="rounded-lg border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
        Accès refusé : vous n’avez pas la permission de gérer les réglages.
      </div>
    );
  }

  // Conflits du dernier run d'import : missions existantes à lier à la main.
  const latestConflicts =
    status?.lastRuns.find((run) => run.direction !== 'push' && (run.stats?.conflicts?.length ?? 0) > 0)?.stats
      .conflicts ?? [];

  // Les deux endpoints calculent le même état depuis les mêmes réglages ; on
  // tolère qu'une des deux réponses soit en retard (rafraîchissement partiel).
  const isConfigured = Boolean(status?.configured || config?.configured);

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl border border-line bg-surface-card p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link href="/admin/integrations" className="text-xs font-semibold text-ink-3 hover:text-ink-2">
              ← Intégrations
            </Link>
            <h1 className="text-[26px] font-black leading-tight tracking-[-0.02em] text-ink">eOPE</h1>
            <p className="mt-1 text-sm text-ink-2">
              Synchronisation avec l’outil départemental : import des événements eOPE en missions, export des
              équipages engagés en engagements validés.
            </p>
          </div>
          <Button type="button" variant="primary" onClick={handleSync} disabled={syncing || !isConfigured}>
            {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
          </Button>
        </div>

        {error ? <div className="rounded-md border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div> : null}
        {notice ? <div className="rounded-md border border-ok-line bg-ok-soft p-3 text-sm text-ok-text">{notice}</div> : null}

        {!isConfigured || !status ? (
          <div className="rounded-md border border-warn-line bg-warn-soft p-3 text-sm text-warn-text">
            Intégration non configurée. Créez une application « machine à machine » dans eOPE (Mes applications,
            propriétaire = antenne, portées <code>events:read</code> + <code>validation:write</code>) puis renseignez
            la configuration ci-dessous.
          </div>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-line p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-3">Serveur eOPE</dt>
              <dd className="mt-1 break-all font-medium text-ink">{status.baseUrl}</dd>
            </div>
            <div className="rounded-md border border-line p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-3">Fenêtre d’import</dt>
              <dd className="mt-1 font-medium text-ink">J−7 → J+{status.syncWindowDays}</dd>
            </div>
            <div className="rounded-md border border-line p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-3">Missions liées</dt>
              <dd className="mt-1 font-medium text-ink">{status.linkedMissionsCount}</dd>
            </div>
            <div className="rounded-md border border-line p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-3">Bénévoles liés</dt>
              <dd className="mt-1 font-medium text-ink">
                {status.linkedVolunteersCount}
                <span className="ml-2 text-xs font-normal text-ink-3">
                  {status.cronConfigured ? 'Cron quotidien actif' : 'Cron non configuré'}
                </span>
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-surface-card p-4 shadow-card">
        <h2 className="text-sm font-bold text-ink">Configuration</h2>
        <p className="text-xs text-ink-2">
          Identifiants de l’application OAuth « machine à machine » créée dans eOPE. Les secrets sont stockés côté
          serveur et ne sont jamais réaffichés.
        </p>
        <form className="space-y-3" onSubmit={handleSaveConfig}>
          <div className="grid gap-3 md:grid-cols-2">
            {(config?.definition.fields ?? []).map((field) => (
              <label key={field.key} className="block text-sm text-ink-2">
                {field.label}
                {field.required ? ' *' : ''}
                <input
                  type={field.secret ? 'password' : 'text'}
                  value={configForm[field.key] ?? ''}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="mt-1 w-full rounded-[10px] border border-line-field px-3 py-2 text-sm"
                  placeholder={
                    field.secret && config?.secretsSet[field.key]
                      ? '•••••••• (défini — saisir pour remplacer)'
                      : field.placeholder ?? ''
                  }
                  disabled={savingConfig}
                  autoComplete="off"
                />
                {field.help ? <span className="mt-1 block text-xs text-ink-3">{field.help}</span> : null}
                {field.secret && config?.secretsSet[field.key] ? (
                  <button
                    type="button"
                    onClick={() => handleClearSecret(field.key)}
                    className="mt-1 text-xs font-semibold text-bad underline decoration-dotted underline-offset-2 hover:opacity-80"
                    disabled={savingConfig}
                  >
                    Effacer le secret
                  </button>
                ) : null}
              </label>
            ))}
          </div>
          <Button type="submit" variant="primary" disabled={savingConfig}>
            {savingConfig ? 'Enregistrement…' : 'Enregistrer la configuration'}
          </Button>
        </form>
      </section>

      {status && status.unlinkedEngaged.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-warn-line bg-warn-soft p-4">
          <h2 className="text-sm font-bold text-warn-text">
            Bénévoles engagés non liés à eOPE ({status.unlinkedEngaged.length})
          </h2>
          <p className="text-xs text-ink-2">
            Ces bénévoles sont engagés sur une mission liée à eOPE mais n’ont pas d’identifiant eOPE : leur
            engagement ne sera pas exporté. Renseignez « Identifiant eOPE » dans leur fiche.
          </p>
          <ul className="space-y-1 text-sm">
            {status.unlinkedEngaged.map((item) => (
              <li key={`${item.mission_id}:${item.volunteer_id}`} className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/volunteers/${item.volunteer_id}/edit`}
                  className="font-semibold text-ink underline decoration-dotted underline-offset-2 hover:opacity-80"
                >
                  {item.full_name ?? 'Bénévole sans nom'}
                </Link>
                <span className="text-xs text-ink-2">sur « {item.mission_title} »</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {latestConflicts.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-line bg-surface-card p-4 shadow-card">
          <h2 className="text-sm font-bold text-ink">Conflits d’import à résoudre ({latestConflicts.length})</h2>
          <p className="text-xs text-ink-2">
            Ces événements eOPE ressemblent à des missions existantes (même titre, même jour) : rien n’a été créé.
            Liez la mission existante à l’événement, ou ignorez si ce sont bien deux activités distinctes.
          </p>
          <ul className="space-y-2 text-sm">
            {latestConflicts.map((conflict) => (
              <li
                key={conflict.eope_event_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line p-2"
              >
                <span>
                  <span className="font-semibold text-ink">{conflict.eope_title}</span>{' '}
                  <span className="text-xs text-ink-2">({formatDateTime(conflict.eope_starts_at)})</span>{' '}
                  <span className="text-xs text-ink-3">↔ mission « {conflict.mission_title} »</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleLinkMission(conflict.mission_id, conflict.eope_event_id)}
                  disabled={linkingEventId !== null}
                >
                  {linkingEventId === conflict.eope_event_id ? 'Liaison…' : 'Lier la mission'}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-line bg-surface-card p-4 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-ink">Dernières synchronisations</h2>
          {status && status.lastRuns.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={handleCopyRuns}>
              {copiedRuns ? 'Copié !' : 'Copier le journal'}
            </Button>
          ) : null}
        </div>
        {!status || status.lastRuns.length === 0 ? (
          <p className="text-sm text-ink-2">Aucune synchronisation pour le moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs font-semibold uppercase tracking-wide text-ink-3">
                  <th className="py-2 pr-3">Début</th>
                  <th className="py-2 pr-3">Direction</th>
                  <th className="py-2 pr-3">Déclencheur</th>
                  <th className="py-2 pr-3">Statut</th>
                  <th className="py-2 pr-3">Résultats</th>
                  <th className="py-2">Erreurs</th>
                </tr>
              </thead>
              <tbody>
                {status.lastRuns.map((run) => (
                  <tr key={run.id} className="border-b border-line/60 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap text-ink-2">{formatDateTime(run.started_at)}</td>
                    <td className="py-2 pr-3 text-ink-2">{DIRECTION_LABELS[run.direction]}</td>
                    <td className="py-2 pr-3 text-ink-2">{run.trigger_source === 'manual' ? 'Manuel' : 'Cron'}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${RUN_STATUS_CLASSES[run.status]}`}
                      >
                        {RUN_STATUS_LABELS[run.status]}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-ink-2">{summarizeRunStats(run)}</td>
                    <td className="py-2 text-xs text-bad">
                      {(run.errors ?? []).length === 0 ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        <ul className="space-y-1">
                          {run.errors.slice(0, 5).map((item, index) => (
                            <li key={index}>
                              <span className="font-semibold">{item.item_ref}</span> : {item.message}
                            </li>
                          ))}
                          {run.errors.length > 5 ? <li>… et {run.errors.length - 5} autre(s).</li> : null}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
