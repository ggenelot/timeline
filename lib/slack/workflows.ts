import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { SlackService } from '@/lib/slack/service';

type MissionSlackData = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  slack_channel_id: string | null;
  slack_channel_name: string | null;
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
  await serviceClient.from('slack_notification_logs').upsert(
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
    const text =
      options?.welcomeMessage?.trim() ||
      [
        `Bienvenue dans le canal de mission *${mission.title}*.`,
        `📅 ${formatDateTimeRange(mission.starts_at, mission.ends_at)}`,
        mission.location ? `📍 ${mission.location}` : null,
        'Consultez Timeline pour les détails et mises à jour.'
      ]
        .filter(Boolean)
        .join('\n');

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

export async function notifyVolunteerRejected(missionId: string, profileId: string) {
  const serviceClient = createServerSupabaseServiceClient();
  const slack = new SlackService();
  const dedupeKey = `mission:${missionId}:profile:${profileId}:volunteer_rejected_dm`;

  const { data: existing } = await serviceClient.from('slack_notification_logs').select('status').eq('dedupe_key', dedupeKey).maybeSingle();
  if (existing?.status === 'sent') {
    return { sent: false, reason: 'already_sent' as const };
  }

  const { data: payload } = await serviceClient
    .from('profiles')
    .select('id,slack_user_id,slack_team_id,full_name,mission_proposals!inner(mission_id,response,mission:missions!mission_proposals_mission_id_fkey(id,title,starts_at,ends_at))')
    .eq('id', profileId)
    .eq('mission_proposals.mission_id', missionId)
    .maybeSingle();

  if (!payload?.slack_user_id) {
    await upsertSlackLog({ missionId, profileId, type: 'volunteer_rejected_dm', status: 'skipped', dedupeKey, errorMessage: 'Compte Slack non lié.' });
    return { sent: false, reason: 'no_link' as const };
  }

  const missionProposal = Array.isArray(payload.mission_proposals) ? payload.mission_proposals[0] : payload.mission_proposals;
  const mission = missionProposal?.mission ? (Array.isArray(missionProposal.mission) ? missionProposal.mission[0] : missionProposal.mission) : null;

  if (!mission) {
    throw new Error('Mission introuvable pour notification de refus.');
  }

  const dmText = [
    `Bonjour ${payload.full_name ?? 'bénévole'},`,
    `Merci pour votre disponibilité pour la mission *${mission.title}*.`,
    `Vous n'avez pas été retenu·e pour cette mission.`,
    `📅 ${formatDateTimeRange(mission.starts_at, mission.ends_at)}`,
    process.env.APP_BASE_URL ? `Voir Timeline : ${process.env.APP_BASE_URL}/missions/${mission.id}` : null
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const channel = await slack.openDirectMessage(payload.slack_user_id);
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
