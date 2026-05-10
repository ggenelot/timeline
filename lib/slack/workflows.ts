import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { SlackService } from '@/lib/slack/service';
import { applyTemplate, getTemplateText } from '@/lib/slack/templates';

type MissionSlackData = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  slack_channel_id: string | null;
  slack_channel_name: string | null;
};

type MissionCrewMember = {
  mission_required_skill_id: string | null;
  volunteer: {
    full_name: string | null;
    slack_username: string | null;
  }[] | null;
};

type MissionRequiredSkill = {
  id: string;
  quantity: number;
  skill: {
    name: string;
  }[] | null;
};

function formatDateTimeRange(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return `${start.toLocaleString('fr-FR')} - ${end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function normalizeSlackChannelName(mission: Pick<MissionSlackData, 'title' | 'starts_at'>) {
  const slug = mission.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);

  const date = new Date(mission.starts_at).toISOString().slice(0, 10);
  return `mission-${slug || 'sans-titre'}-${date}`.slice(0, 80);
}

async function upsertSlackLog(args: {
  missionId: string | null;
  profileId: string | null;
  type: string;
  status: 'sent' | 'skipped' | 'error';
  dedupeKey: string;
  errorMessage?: string | null;
}) {
  const serviceClient = createServerSupabaseServiceClient();

  try {
    const { error } = await serviceClient.from('slack_notification_logs').upsert(
      {
        mission_id: args.missionId,
        profile_id: args.profileId,
        type: args.type,
        status: args.status,
        error_message: args.errorMessage ?? null,
        sent_at: args.status === 'sent' ? new Date().toISOString() : null,
        dedupe_key: args.dedupeKey
      },
      { onConflict: 'dedupe_key' }
    );

    if (error) {
      console.error('Slack log upsert failed', {
        missionId: args.missionId,
        profileId: args.profileId,
        type: args.type,
        status: args.status,
        dedupeKey: args.dedupeKey,
        error: error.message
      });
    }
  } catch (error) {
    console.error('Slack log upsert threw unexpectedly', {
      missionId: args.missionId,
      profileId: args.profileId,
      type: args.type,
      status: args.status,
      dedupeKey: args.dedupeKey,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function buildCrewCompositionMessage(missionId: string) {
  const serviceClient = createServerSupabaseServiceClient();

  const { data: assignments } = await serviceClient
    .from('mission_assignments')
    .select('mission_required_skill_id,volunteer:profiles!mission_assignments_volunteer_id_fkey(full_name,slack_username)')
    .eq('mission_id', missionId)
    .eq('assignment_status', 'selected');

  const { data: requiredSkills } = await serviceClient
    .from('mission_required_skills')
    .select('id,quantity,skill:skills(name)')
    .eq('mission_id', missionId)
    .order('created_at', { ascending: true });

  const crewBySkill = new Map<string | null, Array<{ fullName: string | null; slackUsername: string | null }>>();
  for (const row of (assignments ?? []) as MissionCrewMember[]) {
    const volunteer = row.volunteer?.[0] ?? null;
    if (!volunteer) continue;
    const current = crewBySkill.get(row.mission_required_skill_id) ?? [];
    current.push({ fullName: volunteer.full_name, slackUsername: volunteer.slack_username });
    crewBySkill.set(row.mission_required_skill_id, current);
  }

  const formatVolunteer = (person: { fullName: string | null; slackUsername: string | null }) =>
    person.slackUsername ? `@${person.slackUsername}` : person.fullName ?? 'Bénévole non renseigné';

  const lines: string[] = [];
  for (const requiredSkill of (requiredSkills ?? []) as MissionRequiredSkill[]) {
    const members = crewBySkill.get(requiredSkill.id) ?? [];
    const roleName = requiredSkill.skill?.[0]?.name ?? 'Rôle';
    const rendered = members.length > 0 ? members.map(formatVolunteer).join(', ') : 'à compléter';
    lines.push(`${roleName} : ${rendered}`);
  }

  const unassigned = crewBySkill.get(null) ?? [];
  if (unassigned.length > 0) {
    lines.push(`Sans rôle spécifique : ${unassigned.map(formatVolunteer).join(', ')}`);
  }

  return lines.length > 0 ? `Composition de l'équipage :\n${lines.join('\n')}` : null;
}

export async function ensureMissionSlackChannel(
  missionId: string,
  options?: {
    channelName?: string;
    welcomeMessage?: string;
  }
) {
  const serviceClient = createServerSupabaseServiceClient();
  const slack = new SlackService();

  const { data: mission, error } = await serviceClient
    .from('missions')
    .select('id,title,starts_at,ends_at,location,slack_channel_id,slack_channel_name')
    .eq('id', missionId)
    .single<MissionSlackData>();

  if (error || !mission) {
    throw new Error('Mission introuvable pour la synchronisation Slack.');
  }

  if (mission.slack_channel_id && mission.slack_channel_name) {
    return { channelId: mission.slack_channel_id, channelName: mission.slack_channel_name, created: false };
  }

  const providedName = options?.channelName?.trim();
  const targetName = providedName ? providedName : normalizeSlackChannelName(mission);
  let channelId: string | null = null;
  let channelName = targetName;

  try {
    const createResult = await slack.createPrivateChannel(targetName);
    channelId = createResult.channel?.id ?? null;
    channelName = createResult.channel?.name ?? targetName;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';

    if (!message.includes('name_taken')) {
      await upsertSlackLog({
        missionId,
        profileId: null,
        type: 'mission_channel_created',
        status: 'error',
        dedupeKey: `mission:${missionId}:channel:create`,
        errorMessage: message
      });
      throw error;
    }

    const channels = await slack.listPrivateChannels();
    const existing = channels.channels?.find((channel) => channel.name === targetName) ?? null;

    if (!existing) {
      throw error;
    }

    channelId = existing.id;
    channelName = existing.name;
  }

  if (!channelId) {
    throw new Error('Impossible de déterminer le canal Slack.');
  }

  const { error: updateError } = await serviceClient
    .from('missions')
    .update({
      slack_channel_id: channelId,
      slack_channel_name: channelName,
      slack_channel_created_at: new Date().toISOString()
    })
    .eq('id', missionId);

  if (updateError) {
    throw new Error(`Mission mise à jour Slack impossible: ${updateError.message}`);
  }

  await upsertSlackLog({
    missionId,
    profileId: null,
    type: 'mission_channel_created',
    status: 'sent',
    dedupeKey: `mission:${missionId}:channel:create`
  });

  const welcomeKey = `mission:${missionId}:channel:welcome`;
  const { data: welcomeLog } = await serviceClient.from('slack_notification_logs').select('status').eq('dedupe_key', welcomeKey).maybeSingle();

  if (welcomeLog?.status !== 'sent') {
    const crewComposition = await buildCrewCompositionMessage(missionId);
    const templateText = await getTemplateText('mission_channel_welcome');
    const text =
      options?.welcomeMessage?.trim() ||
      applyTemplate(templateText, {
        mission_title: mission.title,
        datetime_range: formatDateTimeRange(mission.starts_at, mission.ends_at),
        location: mission.location,
        crew_composition: crewComposition
      });

    try {
      await slack.postMessage(channelId, text);
      await upsertSlackLog({ missionId, profileId: null, type: 'mission_channel_welcome', status: 'sent', dedupeKey: welcomeKey });
    } catch (error) {
      await upsertSlackLog({
        missionId,
        profileId: null,
        type: 'mission_channel_welcome',
        status: 'error',
        dedupeKey: welcomeKey,
        errorMessage: error instanceof Error ? error.message : 'Erreur inconnue'
      });
    }
  }

  return { channelId, channelName, created: true };
}

export async function inviteSelectedVolunteersToMissionChannel(missionId: string) {
  const serviceClient = createServerSupabaseServiceClient();
  const slack = new SlackService();

  const { data: mission } = await serviceClient.from('missions').select('id,slack_channel_id').eq('id', missionId).single<{ id: string; slack_channel_id: string | null }>();

  if (!mission?.slack_channel_id) {
    throw new Error('Aucun canal Slack associé à la mission.');
  }

  const { data: selected } = await serviceClient
    .from('mission_assignments')
    .select('volunteer_id,volunteer:profiles!mission_assignments_volunteer_id_fkey(id,slack_user_id,slack_team_id)')
    .eq('mission_id', missionId)
    .eq('assignment_status', 'selected');

  const invitees = (selected ?? [])
    .map((row) => {
      const volunteer = Array.isArray(row.volunteer) ? row.volunteer[0] : row.volunteer;
      return volunteer?.slack_user_id ? { profileId: volunteer.id, slackUserId: volunteer.slack_user_id } : null;
    })
    .filter((row): row is { profileId: string; slackUserId: string } => Boolean(row));

  for (const invitee of invitees) {
    const dedupeKey = `mission:${missionId}:profile:${invitee.profileId}:invite`;
    const { data: existing } = await serviceClient.from('slack_notification_logs').select('status').eq('dedupe_key', dedupeKey).maybeSingle();

    if (existing?.status === 'sent') {
      continue;
    }

    try {
      await slack.inviteUsersToChannel(mission.slack_channel_id, [invitee.slackUserId]);
      await upsertSlackLog({ missionId, profileId: invitee.profileId, type: 'mission_channel_invite', status: 'sent', dedupeKey });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      if (errorMessage.includes('already_in_channel')) {
        await upsertSlackLog({ missionId, profileId: invitee.profileId, type: 'mission_channel_invite', status: 'sent', dedupeKey });
      } else {
        await upsertSlackLog({ missionId, profileId: invitee.profileId, type: 'mission_channel_invite', status: 'error', dedupeKey, errorMessage });
      }
    }
  }
}



function formatAvailabilityLabel(response: string | null | undefined) {
  if (response === 'available') return 'disponible';
  if (response === 'unavailable') return 'indisponible';
  return 'sans réponse';
}

export async function inviteResponsibilityHoldersToMissionChannel(missionId: string) {
  const serviceClient = createServerSupabaseServiceClient();
  const slack = new SlackService();

  const { data: mission } = await serviceClient
    .from('missions')
    .select('id,category,slack_channel_id')
    .eq('id', missionId)
    .single<{ id: string; category: string; slack_channel_id: string | null }>();

  if (!mission?.slack_channel_id || !mission.category) {
    return;
  }

  const { data: mappings } = await serviceClient
    .from('mission_category_responsibilities')
    .select('responsibility_id')
    .eq('category', mission.category);

  if (!mappings?.length) return;

  const responsibilityIds = mappings.map((m: { responsibility_id: string }) => m.responsibility_id);

  const { data: holders } = await serviceClient
    .from('responsibility_holders')
    .select('profile_id,profile:profiles!responsibility_holders_profile_id_fkey(id,slack_user_id)')
    .in('responsibility_id', responsibilityIds);

  const invitees = (holders ?? [])
    .map((row: { profile_id: string; profile: { id: string; slack_user_id: string | null } | { id: string; slack_user_id: string | null }[] | null }) => {
      const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
      return profile?.slack_user_id ? { profileId: profile.id, slackUserId: profile.slack_user_id } : null;
    })
    .filter((row): row is { profileId: string; slackUserId: string } => Boolean(row));

  for (const invitee of invitees) {
    const dedupeKey = `mission:${missionId}:profile:${invitee.profileId}:responsibility_invite`;
    const { data: existing } = await serviceClient
      .from('slack_notification_logs')
      .select('status')
      .eq('dedupe_key', dedupeKey)
      .maybeSingle();

    if (existing?.status === 'sent') continue;

    try {
      await slack.inviteUsersToChannel(mission.slack_channel_id, [invitee.slackUserId]);
      await upsertSlackLog({ missionId, profileId: invitee.profileId, type: 'responsibility_holder_invite', status: 'sent', dedupeKey });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      if (errorMessage.includes('already_in_channel')) {
        await upsertSlackLog({ missionId, profileId: invitee.profileId, type: 'responsibility_holder_invite', status: 'sent', dedupeKey });
      } else {
        await upsertSlackLog({ missionId, profileId: invitee.profileId, type: 'responsibility_holder_invite', status: 'error', dedupeKey, errorMessage });
      }
    }
  }
}

export async function notifyVolunteerAvailabilityUpdatedByAdmin(args: {
  missionId: string;
  profileId: string;
  previousResponse: string | null;
  nextResponse: 'available' | 'unavailable';
}) {
  const { missionId, profileId, previousResponse, nextResponse } = args;
  const serviceClient = createServerSupabaseServiceClient();
  const slack = new SlackService();

  const [{ data: profile }, { data: mission }] = await Promise.all([
    serviceClient.from('profiles').select('id,slack_user_id,full_name').eq('id', profileId).maybeSingle(),
    serviceClient.from('missions').select('id,title,starts_at,ends_at').eq('id', missionId).maybeSingle()
  ]);

  const dedupeKey = `mission:${missionId}:profile:${profileId}:admin_availability_updated_dm:${Date.now()}`;

  if (!profile?.slack_user_id) {
    await upsertSlackLog({ missionId, profileId, type: 'admin_availability_updated_dm', status: 'skipped', dedupeKey, errorMessage: 'Compte Slack non lié.' });
    return { sent: false, reason: 'no_link' as const };
  }

  if (!mission) {
    throw new Error('Mission introuvable pour notification de disponibilité.');
  }

  const templateText = await getTemplateText('admin_availability_updated_dm');
  const dmText = applyTemplate(templateText, {
    volunteer_name: profile.full_name ?? 'bénévole',
    mission_title: mission.title,
    previous_availability: formatAvailabilityLabel(previousResponse),
    next_availability: formatAvailabilityLabel(nextResponse),
    datetime_range: formatDateTimeRange(mission.starts_at, mission.ends_at),
    mission_url: process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/missions/${mission.id}` : null
  });

  try {
    const channel = await slack.openDirectMessage(profile.slack_user_id);
    await slack.postMessage(channel, dmText);
    await upsertSlackLog({ missionId, profileId, type: 'admin_availability_updated_dm', status: 'sent', dedupeKey });
    return { sent: true, reason: 'sent' as const };
  } catch (error) {
    await upsertSlackLog({
      missionId,
      profileId,
      type: 'admin_availability_updated_dm',
      status: 'error',
      dedupeKey,
      errorMessage: error instanceof Error ? error.message : 'Erreur inconnue'
    });
    throw error;
  }
}
export async function notifyVolunteerRejected(missionId: string, profileId: string) {
  const serviceClient = createServerSupabaseServiceClient();
  const slack = new SlackService();
  const dedupeKey = `mission:${missionId}:profile:${profileId}:volunteer_rejected_dm`;

  const { data: existing } = await serviceClient.from('slack_notification_logs').select('status').eq('dedupe_key', dedupeKey).maybeSingle();
  if (existing?.status === 'sent') {
    return { sent: false, reason: 'already_sent' as const };
  }

  const [{ data: profile }, { data: mission }] = await Promise.all([
    serviceClient.from('profiles').select('id,slack_user_id,full_name').eq('id', profileId).maybeSingle(),
    serviceClient.from('missions').select('id,title,starts_at,ends_at').eq('id', missionId).maybeSingle()
  ]);

  if (!profile?.slack_user_id) {
    await upsertSlackLog({ missionId, profileId, type: 'volunteer_rejected_dm', status: 'skipped', dedupeKey, errorMessage: 'Compte Slack non lié.' });
    return { sent: false, reason: 'no_link' as const };
  }

  if (!mission) {
    throw new Error('Mission introuvable pour notification de refus.');
  }

  const templateText = await getTemplateText('volunteer_rejected_dm');
  const dmText = applyTemplate(templateText, {
    volunteer_name: profile.full_name ?? 'bénévole',
    mission_title: mission.title,
    datetime_range: formatDateTimeRange(mission.starts_at, mission.ends_at),
    mission_url: process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/missions/${mission.id}` : null
  });

  try {
    const channel = await slack.openDirectMessage(profile.slack_user_id);
    await slack.postMessage(channel, dmText);
    await upsertSlackLog({ missionId, profileId, type: 'volunteer_rejected_dm', status: 'sent', dedupeKey });
    return { sent: true, reason: 'sent' as const };
  } catch (error) {
    await upsertSlackLog({
      missionId,
      profileId,
      type: 'volunteer_rejected_dm',
      status: 'error',
      dedupeKey,
      errorMessage: error instanceof Error ? error.message : 'Erreur inconnue'
    });
    throw error;
  }
}

export async function notifyNonSelectedVolunteersOnCrewConfirmed(missionId: string) {
  const serviceClient = createServerSupabaseServiceClient();

  const [{ data: availableProposals }, { data: assignments }] = await Promise.all([
    serviceClient
      .from('mission_proposals')
      .select('volunteer_id')
      .eq('mission_id', missionId)
      .eq('response', 'available'),
    serviceClient
      .from('mission_assignments')
      .select('volunteer_id')
      .eq('mission_id', missionId)
  ]);

  if (!availableProposals?.length) return;

  const assignedIds = new Set((assignments ?? []).map((a: { volunteer_id: string }) => a.volunteer_id));
  const nonSelectedIds = availableProposals
    .map((p: { volunteer_id: string }) => p.volunteer_id)
    .filter((id: string) => !assignedIds.has(id));

  await Promise.allSettled(nonSelectedIds.map((profileId: string) => notifyVolunteerRejected(missionId, profileId)));
}

export async function notifyMissionProposerOnStatusChange(missionId: string, newStatus: 'confirmed' | 'cancelled') {
  const serviceClient = createServerSupabaseServiceClient();
  const slack = new SlackService();

  const { data: mission } = await serviceClient
    .from('missions')
    .select('id,title,starts_at,ends_at,created_by')
    .eq('id', missionId)
    .maybeSingle<{ id: string; title: string; starts_at: string; ends_at: string; created_by: string }>();

  if (!mission?.created_by) return;

  const notifType = newStatus === 'confirmed' ? 'mission_confirmed_dm' : 'mission_cancelled_dm';
  const dedupeKey = `mission:${missionId}:proposer:${notifType}`;

  const { data: existing } = await serviceClient.from('slack_notification_logs').select('status').eq('dedupe_key', dedupeKey).maybeSingle();
  if (existing?.status === 'sent') return;

  const { data: profile } = await serviceClient
    .from('profiles')
    .select('id,slack_user_id,full_name')
    .eq('id', mission.created_by)
    .maybeSingle<{ id: string; slack_user_id: string | null; full_name: string | null }>();

  if (!profile?.slack_user_id) {
    await upsertSlackLog({ missionId, profileId: mission.created_by, type: notifType, status: 'skipped', dedupeKey, errorMessage: 'Compte Slack non lié.' });
    return;
  }

  const templateText = await getTemplateText(notifType);
  const dmText = applyTemplate(templateText, {
    volunteer_name: profile.full_name ?? 'bénévole',
    mission_title: mission.title,
    datetime_range: formatDateTimeRange(mission.starts_at, mission.ends_at),
    mission_url: process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/missions/${mission.id}` : null
  });

  try {
    const channel = await slack.openDirectMessage(profile.slack_user_id);
    await slack.postMessage(channel, dmText);
    await upsertSlackLog({ missionId, profileId: profile.id, type: notifType, status: 'sent', dedupeKey });
  } catch (error) {
    await upsertSlackLog({
      missionId,
      profileId: profile.id,
      type: notifType,
      status: 'error',
      dedupeKey,
      errorMessage: error instanceof Error ? error.message : 'Erreur inconnue'
    });
    throw error;
  }
}

export async function notifyVolunteerRoleUpdatedByAdmin(args: {
  profileId: string;
  fullName: string | null;
  slackUserId: string | null;
  previousRole: 'benevole' | 'responsable';
  nextRole: 'benevole' | 'responsable';
}) {
  const { profileId, fullName, slackUserId, previousRole, nextRole } = args;
  const slack = new SlackService();
  const dedupeKey = `profile:${profileId}:admin_role_updated_dm:${Date.now()}`;

  if (!slackUserId || previousRole === nextRole) {
    await upsertSlackLog({
      missionId: null,
      profileId,
      type: 'admin_role_updated_dm',
      status: 'skipped',
      dedupeKey,
      errorMessage: !slackUserId ? 'Compte Slack non lié.' : 'Aucun changement de rôle.'
    });
    return { sent: false, reason: 'skipped' as const };
  }

  const formatRole = (role: 'benevole' | 'responsable') => (role === 'responsable' ? 'responsable' : 'bénévole');
  const templateText = await getTemplateText('admin_role_updated_dm');
  const dmText = applyTemplate(templateText, {
    volunteer_name: fullName ?? 'bénévole',
    previous_role: formatRole(previousRole),
    next_role: formatRole(nextRole)
  });

  try {
    const channel = await slack.openDirectMessage(slackUserId);
    await slack.postMessage(channel, dmText);
    await upsertSlackLog({ missionId: null, profileId, type: 'admin_role_updated_dm', status: 'sent', dedupeKey });
    return { sent: true, reason: 'sent' as const, profileId };
  } catch (error) {
    await upsertSlackLog({
      missionId: null,
      profileId,
      type: 'admin_role_updated_dm',
      status: 'error',
      dedupeKey,
      errorMessage: error instanceof Error ? error.message : 'Erreur inconnue'
    });
    throw error;
  }
}
