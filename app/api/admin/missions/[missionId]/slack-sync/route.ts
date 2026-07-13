import { NextRequest, NextResponse } from 'next/server';
import { requireMissionPermission } from '@/lib/api/permissions';
import { ensureMissionSlackChannel, inviteSelectedVolunteersToMissionChannel, inviteResponsibilityHoldersToMissionChannel } from '@/lib/slack/workflows';
import { SlackApiClientError } from '@/lib/slack/service';

export async function POST(request: NextRequest, { params }: { params: { missionId: string } }) {
  const missionId = params.missionId;
  const auth = await requireMissionPermission(request, missionId);
  if (auth.errorResponse) return auth.errorResponse;

  const { data: mission } = await auth.serviceClient.from('missions').select('id,created_by').eq('id', missionId).single<{ id: string; created_by: string }>();

  if (!mission) {
    return NextResponse.json({ error: 'Mission introuvable.' }, { status: 404 });
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
