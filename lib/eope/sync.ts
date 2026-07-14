// Orchestration de la synchronisation eOPE (voir docs/eope-api.md).
//
//   pull : GET /api/events  -> upsert des missions liées (missions.eope_event_id)
//   push : équipages engagés -> POST/DELETE /api/commitments (validation:write)
//
// Chaque exécution est journalisée dans eope_sync_runs. Les erreurs sont
// collectées élément par élément : un item en échec rend le run « partial »,
// seuls les échecs de configuration/jeton rendent le run « error ».

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildMissionDedupKey, getMissionDateForDedupFromStartsAt } from '@/lib/import-missions';
import type { MissionStatus } from '@/lib/types';
import { EopeClient, EopeApiError, EopeConfigurationError } from './client';
import { getEopeConfig, isEopeConfigured } from './config';
import {
  computeCommitmentDiff,
  eopeEventToMissionFields,
  mapEopeTypeToMissionTypeId,
  shouldCancelMission,
  type EopeDesiredCommitment,
  type EopeRecordedCommitment
} from './mapping';
import { parseEopeCommitmentResponse, parseEopeEvents, type EopeEvent } from './types';

export type EopeSyncDirection = 'pull' | 'push' | 'full';
export type EopeSyncTriggerSource = 'manual' | 'cron';

export type EopeSyncError = { scope: 'pull' | 'push' | 'run'; item_ref: string; message: string };

export type EopeSyncConflict = {
  eope_event_id: string;
  eope_title: string;
  eope_starts_at: string;
  mission_id: string;
  mission_title: string;
};

export type EopeSkippedUnlinked = {
  mission_id: string;
  volunteer_id: string;
  full_name: string | null;
};

export type EopeSyncStats = {
  events_seen: number;
  missions_created: number;
  missions_updated: number;
  missions_cancelled: number;
  commitments_created: number;
  commitments_deleted: number;
  conflicts: EopeSyncConflict[];
  skipped_unlinked: EopeSkippedUnlinked[];
};

export type EopeSyncResult = {
  runId: string | null;
  status: 'success' | 'partial' | 'error';
  stats: EopeSyncStats;
  errors: EopeSyncError[];
};

export class EopeSyncAlreadyRunningError extends Error {
  constructor() {
    super('Une synchronisation eOPE est déjà en cours. Réessayez dans quelques minutes.');
    this.name = 'EopeSyncAlreadyRunningError';
  }
}

// Statuts de mission dont l'équipage est poussé vers eOPE. Jamais draft
// (travail en cours) ni cancelled (équipage caduc).
const PUSH_MISSION_STATUSES: MissionStatus[] = ['proposed', 'confirmed', 'closed'];

// Mêmes statuts « engagés » que le tableau de bord OPE interne.
const ENGAGED_STATUSES = ['selected', 'confirmed'];

const RUNNING_GUARD_MINUTES = 10;

function emptyStats(): EopeSyncStats {
  return {
    events_seen: 0,
    missions_created: 0,
    missions_updated: 0,
    missions_cancelled: 0,
    commitments_created: 0,
    commitments_deleted: 0,
    conflicts: [],
    skipped_unlinked: []
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

type SyncContext = {
  supabase: SupabaseClient;
  client: EopeClient;
  stats: EopeSyncStats;
  errors: EopeSyncError[];
  createdBy: string | null;
  windowDays: number;
};

// ── PULL : événements eOPE → missions ─────────────────────────────────────

type LinkedMissionRow = {
  id: string;
  title: string;
  status: MissionStatus;
  eope_event_id: string | null;
};

async function pullEvents(ctx: SyncContext) {
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const to = new Date(now.getTime() + ctx.windowDays * 24 * 3600 * 1000);

  // Les paramètres de fenêtre sont une hypothèse (docs/eope-api.md) ; un
  // serveur qui les ignore renverra simplement plus d'événements.
  const query = `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  const payload = await ctx.client.get(`/api/events${query}`, 'Lecture des événements eOPE');

  const { events, issues } = parseEopeEvents(payload);
  ctx.stats.events_seen = events.length;
  for (const issue of issues) {
    ctx.errors.push({ scope: 'pull', item_ref: issue.item_ref, message: issue.message });
  }
  if (events.length === 0) return;

  const eventIds = events.map((event) => event.id);
  const { data: linkedRows, error: linkedError } = await ctx.supabase
    .from('missions')
    .select('id, title, status, eope_event_id')
    .in('eope_event_id', eventIds);
  if (linkedError) throw new Error(`Lecture des missions liées : ${linkedError.message}`);

  const linkedByEventId = new Map<string, LinkedMissionRow>();
  for (const row of (linkedRows ?? []) as LinkedMissionRow[]) {
    if (row.eope_event_id) linkedByEventId.set(row.eope_event_id, row);
  }

  // Garde anti-doublon : missions non liées de la fenêtre, indexées par la
  // même clé (titre + date Paris) que l'import de missions.
  const { data: unlinkedRows, error: unlinkedError } = await ctx.supabase
    .from('missions')
    .select('id, title, starts_at')
    .is('eope_event_id', null)
    .gte('starts_at', from.toISOString())
    .lte('starts_at', to.toISOString());
  if (unlinkedError) throw new Error(`Lecture des missions non liées : ${unlinkedError.message}`);

  const unlinkedByDedupKey = new Map<string, { id: string; title: string }>();
  for (const row of (unlinkedRows ?? []) as Array<{ id: string; title: string; starts_at: string }>) {
    const key = buildMissionDedupKey({
      title: row.title,
      missionDate: getMissionDateForDedupFromStartsAt(row.starts_at)
    });
    if (!unlinkedByDedupKey.has(key)) unlinkedByDedupKey.set(key, { id: row.id, title: row.title });
  }

  for (const event of events) {
    try {
      const existing = linkedByEventId.get(event.id);
      if (existing) {
        await updateLinkedMission(ctx, event, existing);
      } else {
        await createMissionFromEvent(ctx, event, unlinkedByDedupKey);
      }
    } catch (error) {
      ctx.errors.push({
        scope: 'pull',
        item_ref: `event ${event.id} (${event.title})`,
        message: errorMessage(error)
      });
    }
  }
}

async function updateLinkedMission(ctx: SyncContext, event: EopeEvent, existing: LinkedMissionRow) {
  const nowIso = new Date().toISOString();
  const updates: Record<string, unknown> = {
    ...eopeEventToMissionFields(event),
    eope_payload: event.raw,
    eope_synced_at: nowIso
  };

  const cancelling = shouldCancelMission(event, existing.status);
  if (cancelling) {
    updates.status = 'cancelled';
  }

  const { error } = await ctx.supabase.from('missions').update(updates).eq('id', existing.id);
  if (error) throw new Error(`Mise à jour de la mission ${existing.id} : ${error.message}`);

  if (cancelling) {
    ctx.stats.missions_cancelled += 1;
  } else {
    ctx.stats.missions_updated += 1;
  }
}

async function createMissionFromEvent(
  ctx: SyncContext,
  event: EopeEvent,
  unlinkedByDedupKey: Map<string, { id: string; title: string }>
) {
  // Ne pas matérialiser des événements déjà annulés côté eOPE.
  if (event.cancelled) return;

  const dedupKey = buildMissionDedupKey({
    title: event.title,
    missionDate: getMissionDateForDedupFromStartsAt(event.starts_at)
  });
  const dedupMatch = unlinkedByDedupKey.get(dedupKey);
  if (dedupMatch) {
    // Une mission équivalente existe déjà (créée à la main ou importée) :
    // on ne crée rien et on laisse l'admin décider de la lier (/admin/eope).
    ctx.stats.conflicts.push({
      eope_event_id: event.id,
      eope_title: event.title,
      eope_starts_at: event.starts_at,
      mission_id: dedupMatch.id,
      mission_title: dedupMatch.title
    });
    return;
  }

  if (!ctx.createdBy) {
    throw new Error(
      "Aucun profil créateur disponible pour matérialiser l'événement (lancer une première synchronisation manuelle)."
    );
  }

  const { error } = await ctx.supabase.from('missions').insert({
    title: event.title,
    description: event.description,
    location: event.location,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    status: 'draft',
    required_volunteers: 1,
    mission_type_id: mapEopeTypeToMissionTypeId(event.type_label),
    source_type_label: event.type_label,
    created_by: ctx.createdBy,
    eope_event_id: event.id,
    eope_payload: event.raw,
    eope_synced_at: new Date().toISOString()
  });
  if (error) throw new Error(`Création de la mission pour l'événement ${event.id} : ${error.message}`);

  ctx.stats.missions_created += 1;
}

// ── PUSH : équipages engagés → engagements validés eOPE ───────────────────

type AssignmentRow = {
  mission_id: string;
  volunteer_id: string;
  volunteer: { id: string; full_name: string | null; eope_user_id: string | null } | Array<{
    id: string;
    full_name: string | null;
    eope_user_id: string | null;
  }> | null;
};

type LinkRow = {
  mission_id: string;
  volunteer_id: string;
  eope_commitment_id: string;
  eope_event_id: string;
};

function firstOf<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel ?? null;
}

async function pushCrews(ctx: SyncContext) {
  const { data: missionRows, error: missionsError } = await ctx.supabase
    .from('missions')
    .select('id, eope_event_id, status')
    .not('eope_event_id', 'is', null)
    .in('status', PUSH_MISSION_STATUSES);
  if (missionsError) throw new Error(`Lecture des missions liées : ${missionsError.message}`);

  const missions = (missionRows ?? []) as Array<{ id: string; eope_event_id: string; status: MissionStatus }>;
  const eventIdByMissionId = new Map(missions.map((mission) => [mission.id, mission.eope_event_id]));

  const desired: EopeDesiredCommitment[] = [];
  if (missions.length > 0) {
    const { data: assignmentRows, error: assignmentsError } = await ctx.supabase
      .from('mission_assignments')
      .select('mission_id, volunteer_id, volunteer:profiles(id, full_name, eope_user_id)')
      .in('mission_id', missions.map((mission) => mission.id))
      .in('assignment_status', ENGAGED_STATUSES);
    if (assignmentsError) throw new Error(`Lecture des affectations : ${assignmentsError.message}`);

    for (const row of (assignmentRows ?? []) as AssignmentRow[]) {
      const volunteer = firstOf(row.volunteer);
      const eventId = eventIdByMissionId.get(row.mission_id);
      if (!eventId) continue;
      desired.push({
        mission_id: row.mission_id,
        volunteer_id: row.volunteer_id,
        eope_event_id: eventId,
        eope_user_id: volunteer?.eope_user_id ?? null,
        full_name: volunteer?.full_name ?? null
      });
    }
  }

  // TOUS les liens enregistrés, pas seulement ceux des missions en périmètre :
  // une mission annulée, déliée ou repassée en draft doit voir ses engagements
  // distants supprimés (réconciliation complète).
  const { data: linkRows, error: linksError } = await ctx.supabase
    .from('eope_commitment_links')
    .select('mission_id, volunteer_id, eope_commitment_id, eope_event_id');
  if (linksError) throw new Error(`Lecture des liens d'engagement : ${linksError.message}`);

  const recorded = (linkRows ?? []) as LinkRow[];
  const diff = computeCommitmentDiff(desired, recorded as EopeRecordedCommitment[]);

  ctx.stats.skipped_unlinked = diff.skippedUnlinked.map((item) => ({
    mission_id: item.mission_id,
    volunteer_id: item.volunteer_id,
    full_name: item.full_name
  }));

  for (const item of diff.toCreate) {
    try {
      // Corps provisoire (docs/eope-api.md) : à ajuster après le test préprod.
      const payload = await ctx.client.post(
        '/api/commitments',
        { event_id: item.eope_event_id, user_id: item.eope_user_id },
        `Création de l'engagement eOPE (${item.full_name ?? item.volunteer_id})`
      );
      const commitment = parseEopeCommitmentResponse(payload);
      if (!commitment) {
        throw new Error("Réponse de création d'engagement illisible (identifiant introuvable).");
      }

      const { error } = await ctx.supabase.from('eope_commitment_links').insert({
        mission_id: item.mission_id,
        volunteer_id: item.volunteer_id,
        eope_commitment_id: commitment.id,
        eope_event_id: item.eope_event_id,
        last_synced_at: new Date().toISOString()
      });
      if (error) throw new Error(`Enregistrement du lien d'engagement : ${error.message}`);

      ctx.stats.commitments_created += 1;
    } catch (error) {
      ctx.errors.push({
        scope: 'push',
        item_ref: `mission ${item.mission_id} / bénévole ${item.full_name ?? item.volunteer_id}`,
        message: errorMessage(error)
      });
    }
  }

  for (const item of diff.toDelete) {
    try {
      await ctx.client.delete(
        `/api/commitments/${encodeURIComponent(item.eope_commitment_id)}`,
        `Suppression de l'engagement eOPE ${item.eope_commitment_id}`
      );

      const { error } = await ctx.supabase
        .from('eope_commitment_links')
        .delete()
        .eq('mission_id', item.mission_id)
        .eq('volunteer_id', item.volunteer_id);
      if (error) throw new Error(`Suppression du lien d'engagement : ${error.message}`);

      ctx.stats.commitments_deleted += 1;
    } catch (error) {
      ctx.errors.push({
        scope: 'push',
        item_ref: `engagement eOPE ${item.eope_commitment_id}`,
        message: errorMessage(error)
      });
    }
  }

  if (diff.unchanged.length > 0) {
    const nowIso = new Date().toISOString();
    for (const item of diff.unchanged) {
      await ctx.supabase
        .from('eope_commitment_links')
        .update({ last_synced_at: nowIso })
        .eq('mission_id', item.mission_id)
        .eq('volunteer_id', item.volunteer_id);
    }
  }
}

// ── Entrée principale ──────────────────────────────────────────────────────

export async function runEopeSync(
  supabase: SupabaseClient,
  options: { direction: EopeSyncDirection; triggerSource: EopeSyncTriggerSource; triggeredBy: string | null }
): Promise<EopeSyncResult> {
  const config = getEopeConfig();
  if (!isEopeConfigured(config)) {
    throw new EopeConfigurationError();
  }

  // Garde anti-runs concurrents : un run « running » récent bloque le départ.
  const guardThreshold = new Date(Date.now() - RUNNING_GUARD_MINUTES * 60 * 1000).toISOString();
  const { data: runningRows, error: guardError } = await supabase
    .from('eope_sync_runs')
    .select('id')
    .eq('status', 'running')
    .gte('started_at', guardThreshold)
    .limit(1);
  if (guardError) throw new Error(`Vérification des runs en cours : ${guardError.message}`);
  if ((runningRows ?? []).length > 0) {
    throw new EopeSyncAlreadyRunningError();
  }

  // En cron, aucune session utilisateur : on réutilise l'admin du dernier run
  // manuel comme créateur des missions matérialisées.
  let createdBy = options.triggeredBy;
  if (!createdBy) {
    const { data: lastManual } = await supabase
      .from('eope_sync_runs')
      .select('triggered_by')
      .eq('trigger_source', 'manual')
      .not('triggered_by', 'is', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    createdBy = (lastManual?.triggered_by as string | null) ?? null;
  }

  const { data: runRow, error: runError } = await supabase
    .from('eope_sync_runs')
    .insert({
      direction: options.direction,
      trigger_source: options.triggerSource,
      triggered_by: options.triggeredBy,
      status: 'running'
    })
    .select('id')
    .single();
  if (runError) throw new Error(`Création du journal de synchronisation : ${runError.message}`);
  const runId = runRow.id as string;

  const ctx: SyncContext = {
    supabase,
    client: new EopeClient(
      options.direction === 'pull' ? ['events:read'] : options.direction === 'push' ? ['validation:write'] : ['events:read', 'validation:write'],
      config
    ),
    stats: emptyStats(),
    errors: [],
    createdBy,
    windowDays: config.syncWindowDays
  };

  let status: EopeSyncResult['status'] = 'success';
  try {
    if (options.direction === 'pull' || options.direction === 'full') {
      await pullEvents(ctx);
    }
    if (options.direction === 'push' || options.direction === 'full') {
      await pushCrews(ctx);
    }
    status = ctx.errors.length > 0 ? 'partial' : 'success';
  } catch (error) {
    // Échec global (jeton, réseau, requête structurante) : run en erreur.
    status = 'error';
    ctx.errors.push({
      scope: 'run',
      item_ref: options.direction,
      message: error instanceof EopeApiError ? `${error.message} (HTTP ${error.status})` : errorMessage(error)
    });
  }

  await supabase
    .from('eope_sync_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      stats: ctx.stats,
      errors: ctx.errors
    })
    .eq('id', runId);

  return { runId, status, stats: ctx.stats, errors: ctx.errors };
}
