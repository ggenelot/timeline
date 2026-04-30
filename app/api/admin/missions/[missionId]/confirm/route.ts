import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { ensureMissionSlackChannel, inviteSelectedVolunteersToMissionChannel } from '@/lib/slack/workflows';

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
  const { data: mission, error: missionError } = await auth.client
    .from('missions')
    .select('id,status,created_by')
    .eq('id', missionId)
    .single<{ id: string; status: string; created_by: string }>();

  if (missionError || !mission) {
    return NextResponse.json({ error: 'Mission introuvable.' }, { status: 404 });
  }

  const canManage = auth.profile.role === 'admin' || (auth.profile.role === 'responsable' && mission.created_by === auth.user.id);
  if (!canManage) {
    return NextResponse.json({ error: 'Accès refusé : vous ne pouvez pas confirmer cette mission.' }, { status: 403 });
  }

  if (mission.status !== 'proposed') {
    return NextResponse.json({ error: 'Seules les missions proposées peuvent être confirmées.' }, { status: 400 });
  }

  const { error: updateError } = await auth.client.from('missions').update({ status: 'confirmed' }).eq('id', missionId);
  if (updateError) {
    return NextResponse.json({ error: `Impossible de confirmer la mission: ${updateError.message}` }, { status: 400 });
  }

  try {
    await ensureMissionSlackChannel(missionId);
    await inviteSelectedVolunteersToMissionChannel(missionId);
  } catch (error) {
    return NextResponse.json(
      {
        message: 'Mission confirmée, mais synchronisation Slack partielle.',
        slackError: error instanceof Error ? error.message : 'Erreur inconnue'
      },
      { status: 202 }
    );
  }

  return NextResponse.json({ message: 'Mission confirmée et canal Slack synchronisé.' });
}
