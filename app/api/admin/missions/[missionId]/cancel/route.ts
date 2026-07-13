import { NextRequest, NextResponse } from 'next/server';
import { requireMissionPermission } from '@/lib/api/permissions';
import { notifyMissionProposerOnStatusChange } from '@/lib/slack/workflows';

export async function POST(request: NextRequest, { params }: { params: { missionId: string } }) {
  const missionId = params.missionId;
  const auth = await requireMissionPermission(request, missionId);
  if (auth.errorResponse) return auth.errorResponse;
  const client = auth.serviceClient;

  const { data: mission, error: missionError } = await client
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

  const { data: updated, error: updateError } = await client
    .from('missions')
    .update({ status: 'cancelled' })
    .eq('id', missionId)
    .not('status', 'in', '("confirmed","cancelled")')
    .select('id');

  if (updateError) {
    return NextResponse.json({ error: `Impossible d'annuler la mission: ${updateError.message}` }, { status: 400 });
  }

  if (!updated?.length) {
    return NextResponse.json({ error: 'La mission ne peut plus être annulée (statut modifié concurremment).' }, { status: 409 });
  }

  notifyMissionProposerOnStatusChange(missionId, 'cancelled').catch((err) =>
    console.error('[cancel] Slack proposer notification failed', { missionId, error: err instanceof Error ? err.message : err })
  );

  return NextResponse.json({ message: 'Mission annulée.' });
}
