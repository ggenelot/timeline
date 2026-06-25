import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { MissionMaterielVerificationItemStatus } from '@/lib/types';

type ItemCheckBody = {
  mission_required_materiel_id?: string;
  occurrence_index?: number;
  child_type_id?: string;
  status?: MissionMaterielVerificationItemStatus;
  note?: string | null;
};

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

  const body = (await request.json()) as ItemCheckBody;
  if (!body.mission_required_materiel_id || body.occurrence_index === undefined || !body.child_type_id || !body.status) {
    return NextResponse.json({ error: 'Champs manquants pour enregistrer la vérification.' }, { status: 400 });
  }
  if (body.status !== 'present' && body.status !== 'missing') {
    return NextResponse.json({ error: 'Statut de vérification invalide.' }, { status: 400 });
  }

  const { data: verification, error: verificationFetchError } = await auth.client
    .from('mission_materiel_verifications')
    .select('id,status')
    .eq('mission_id', missionId)
    .maybeSingle<{ id: string; status: string }>();

  if (verificationFetchError) {
    return NextResponse.json({ error: verificationFetchError.message }, { status: 400 });
  }

  if (verification?.status === 'completed') {
    return NextResponse.json(
      { error: 'Cette vérification est terminée et verrouillée. Relancez-la avant de modifier un item.' },
      { status: 409 }
    );
  }

  if (!verification) {
    const { error: insertVerificationError } = await auth.client
      .from('mission_materiel_verifications')
      .insert({ mission_id: missionId, status: 'in_progress' });

    if (insertVerificationError) {
      return NextResponse.json({ error: insertVerificationError.message }, { status: 400 });
    }
  } else if (verification.status === 'not_started') {
    const { error: updateVerificationError } = await auth.client
      .from('mission_materiel_verifications')
      .update({ status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', verification.id);

    if (updateVerificationError) {
      return NextResponse.json({ error: updateVerificationError.message }, { status: 400 });
    }
  }

  const { data: item, error: itemError } = await auth.client
    .from('mission_materiel_verification_items')
    .upsert(
      {
        mission_id: missionId,
        mission_required_materiel_id: body.mission_required_materiel_id,
        occurrence_index: body.occurrence_index,
        child_type_id: body.child_type_id,
        status: body.status,
        note: body.note?.trim() || null,
        checked_by: auth.user.id,
        checked_at: new Date().toISOString()
      },
      { onConflict: 'mission_required_materiel_id,occurrence_index,child_type_id' }
    )
    .select()
    .single();

  if (itemError) {
    return NextResponse.json({ error: itemError.message }, { status: 400 });
  }

  return NextResponse.json({ item });
}
