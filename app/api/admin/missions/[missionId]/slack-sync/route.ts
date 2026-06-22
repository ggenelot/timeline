import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, hasRoleBehavior, requireAuthenticatedUser } from '@/lib/api/auth';
import { ensureMissionSlackChannel, inviteSelectedVolunteersToMissionChannel, inviteResponsibilityHoldersToMissionChannel } from '@/lib/slack/workflows';
import { SlackApiClientError } from '@/lib/slack/service';

export async function POST(request: NextRequest, { params }: { params: { missionId: string } }) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.client || !auth.profile || !auth.user) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const missionId = params.missionId;
  const { data: mission } = await auth.client.from('missions').select('id,created_by').eq('id', missionId).single<{ id: string; created_by: string }>();

  if (!mission) {
    return NextResponse.json({ error: 'Mission introuvable.' }, { status: 404 });
  }

  const canManage =
    auth.profile.role === 'admin' ||
    (mission.created_by === auth.user.id && (await hasRoleBehavior(auth.client, auth.user.id, 'mission', 'can_manage')));
  if (!canManage) {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as { channelName?: string; welcomeMessage?: string };

  try {
    const channel = await ensureMissionSlackChannel(missionId, {
      channelName: payload.channelName,
      welcomeMessage: payload.welcomeMessage
    });
    await inviteSelectedVolunteersToMissionChannel(missionId);
    await inviteResponsibilityHoldersToMissionChannel(missionId);
    return NextResponse.json({ message: 'Synchronisation Slack terminée.', channel });
  } catch (error) {
    if (error instanceof SlackApiClientError) {
      return NextResponse.json({ error: error.message, code: error.code, needed: error.needed ?? null, provided: error.provided ?? null }, { status: 500 });
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur inconnue' }, { status: 500 });
  }
}
