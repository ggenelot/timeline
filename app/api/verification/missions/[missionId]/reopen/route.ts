import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';

export async function POST(request: NextRequest, { params }: { params: { missionId: string } }) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.client || !auth.user) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const missionId = params.missionId;

  const { data: canVerify, error: canVerifyError } = await auth.client.rpc('can_verify_mission_materiel', {
    _mission_id: missionId,
    _user_id: auth.user.id
  });

  if (canVerifyError || !canVerify) {
    return NextResponse.json({ error: 'Accès refusé : vous n’êtes pas confirmé sur cette mission.' }, { status: 403 });
  }

  const { error: updateError } = await auth.client
    .from('mission_materiel_verifications')
    .update({ status: 'in_progress', completed_by: null, completed_at: null, updated_at: new Date().toISOString() })
    .eq('mission_id', missionId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ message: 'Vérification relancée.' });
}
