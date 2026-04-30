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
  const { data: mission } = await auth.client.from('missions').select('id,created_by').eq('id', missionId).single<{ id: string; created_by: string }>();

  if (!mission) {
    return NextResponse.json({ error: 'Mission introuvable.' }, { status: 404 });
  }

  const canManage = auth.profile.role === 'admin' || (auth.profile.role === 'responsable' && mission.created_by === auth.user.id);
  if (!canManage) {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  try {
    const channel = await ensureMissionSlackChannel(missionId);
    await inviteSelectedVolunteersToMissionChannel(missionId);
    return NextResponse.json({ message: 'Synchronisation Slack terminée.', channel });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur inconnue' }, { status: 500 });
  }
}
