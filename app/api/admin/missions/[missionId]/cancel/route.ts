import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { notifyMissionProposerOnStatusChange } from '@/lib/slack/workflows';

export async function POST(request: NextRequest, { params }: { params: { missionId: string } }) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.client || !auth.profile || !auth.user) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  if (auth.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé : seuls les administrateurs peuvent annuler une mission.' }, { status: 403 });
  }

  const missionId = params.missionId;
  const { data: mission, error: missionError } = await auth.client
    .from('missions')
    .select('id,status')
    .eq('id', missionId)
    .single<{ id: string; status: string }>();

  if (missionError || !mission) {
    return NextResponse.json({ error: 'Mission introuvable.' }, { status: 404 });
  }

  if (mission.status === 'cancelled') {
    return NextResponse.json({ error: 'Cette mission est déjà annulée.' }, { status: 400 });
  }

  if (mission.status === 'confirmed') {
    return NextResponse.json({ error: 'Une mission confirmée ne peut pas être annulée.' }, { status: 400 });
  }

  const { error: updateError } = await auth.client.from('missions').update({ status: 'cancelled' }).eq('id', missionId);
  if (updateError) {
    return NextResponse.json({ error: `Impossible d'annuler la mission: ${updateError.message}` }, { status: 400 });
  }

  notifyMissionProposerOnStatusChange(missionId, 'cancelled').catch((err) =>
    console.error('[cancel] Slack proposer notification failed', { missionId, error: err instanceof Error ? err.message : err })
  );

  return NextResponse.json({ message: 'Mission annulée.' });
}
