import { NextRequest, NextResponse } from 'next/server';
import { requireMissionPermission } from '@/lib/api/permissions';
import { notifyMissionProposerOnStatusChange, notifyNonSelectedVolunteersOnCrewConfirmed } from '@/lib/slack/workflows';

export async function POST(request: NextRequest, { params }: { params: { missionId: string } }) {
  const missionId = params.missionId;
  const auth = await requireMissionPermission(request, missionId);
  if (auth.errorResponse) return auth.errorResponse;
  const client = auth.serviceClient;

  const { data: mission, error: missionError } = await client
    .from('missions')
    .select('id,status,created_by')
    .eq('id', missionId)
    .single<{ id: string; status: string; created_by: string }>();

  if (missionError || !mission) {
    return NextResponse.json({ error: 'Mission introuvable.' }, { status: 404 });
  }

  if (mission.status !== 'proposed') {
    return NextResponse.json({ error: 'Seules les missions proposées peuvent être confirmées.' }, { status: 400 });
  }

  const { error: updateError } = await client.from('missions').update({ status: 'confirmed' }).eq('id', missionId);
  if (updateError) {
    return NextResponse.json({ error: `Impossible de confirmer la mission: ${updateError.message}` }, { status: 400 });
  }

  notifyNonSelectedVolunteersOnCrewConfirmed(missionId).catch((err) =>
    console.error('[confirm] Slack notifications failed', { missionId, error: err instanceof Error ? err.message : err })
  );

  notifyMissionProposerOnStatusChange(missionId, 'confirmed').catch((err) =>
    console.error('[confirm] Slack proposer notification failed', { missionId, error: err instanceof Error ? err.message : err })
  );

  return NextResponse.json({ message: 'Mission confirmée.' });
}
