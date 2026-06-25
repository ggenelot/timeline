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

  const { data: requiredMateriels, error: requiredError } = await auth.client
    .from('mission_required_materiels')
    .select('id,materiel_type_id,quantity')
    .eq('mission_id', missionId);

  if (requiredError) {
    return NextResponse.json({ error: requiredError.message }, { status: 400 });
  }

  const containerTypeIds = (requiredMateriels ?? []).map((row) => row.materiel_type_id);

  const { data: contents, error: contentsError } =
    containerTypeIds.length > 0
      ? await auth.client.from('materiel_type_contents').select('parent_type_id').in('parent_type_id', containerTypeIds)
      : { data: [], error: null };

  if (contentsError) {
    return NextResponse.json({ error: contentsError.message }, { status: 400 });
  }

  const childCountByContainer = new Map<string, number>();
  for (const row of contents ?? []) {
    childCountByContainer.set(row.parent_type_id, (childCountByContainer.get(row.parent_type_id) ?? 0) + 1);
  }

  const totalExpected = (requiredMateriels ?? []).reduce(
    (sum, row) => sum + row.quantity * (childCountByContainer.get(row.materiel_type_id) ?? 0),
    0
  );

  const requiredMaterielIds = (requiredMateriels ?? []).map((row) => row.id);

  const { count: checkedCount, error: checkedError } =
    requiredMaterielIds.length > 0
      ? await auth.client
          .from('mission_materiel_verification_items')
          .select('id', { count: 'exact', head: true })
          .in('mission_required_materiel_id', requiredMaterielIds)
      : { count: 0, error: null };

  if (checkedError) {
    return NextResponse.json({ error: checkedError.message }, { status: 400 });
  }

  if ((checkedCount ?? 0) < totalExpected) {
    return NextResponse.json(
      { error: `Il reste ${totalExpected - (checkedCount ?? 0)} item(s) à vérifier avant de terminer.` },
      { status: 400 }
    );
  }

  const { data: verification, error: verificationFetchError } = await auth.client
    .from('mission_materiel_verifications')
    .select('id')
    .eq('mission_id', missionId)
    .maybeSingle<{ id: string }>();

  if (verificationFetchError) {
    return NextResponse.json({ error: verificationFetchError.message }, { status: 400 });
  }

  const completedAt = new Date().toISOString();

  if (!verification) {
    const { error: insertError } = await auth.client.from('mission_materiel_verifications').insert({
      mission_id: missionId,
      status: 'completed',
      completed_by: auth.user.id,
      completed_at: completedAt
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
  } else {
    const { error: updateError } = await auth.client
      .from('mission_materiel_verifications')
      .update({ status: 'completed', completed_by: auth.user.id, completed_at: completedAt, updated_at: completedAt })
      .eq('id', verification.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ message: 'Vérification terminée.' });
}
