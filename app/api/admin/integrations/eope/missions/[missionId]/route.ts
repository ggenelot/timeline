import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/permissions';

export const dynamic = 'force-dynamic';

// Lie ou délie manuellement une mission Timeline à un événement eOPE
// (résolution des conflits remontés par le pull). Body :
// { eope_event_id: string } pour lier, { eope_event_id: null } pour délier.
export async function PATCH(request: NextRequest, { params }: { params: { missionId: string } }) {
  const auth = await requireAdmin(request);
  if (auth.errorResponse) return auth.errorResponse;

  const body = await request.json().catch(() => null);
  if (!body || !('eope_event_id' in body)) {
    return NextResponse.json({ error: 'Le champ eope_event_id est requis (chaîne ou null).' }, { status: 400 });
  }

  const rawValue = (body as { eope_event_id: unknown }).eope_event_id;
  if (rawValue !== null && typeof rawValue !== 'string') {
    return NextResponse.json({ error: 'eope_event_id doit être une chaîne ou null.' }, { status: 400 });
  }
  const eopeEventId = typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : null;

  const { data: mission, error: missionError } = await auth.serviceClient
    .from('missions')
    .select('id')
    .eq('id', params.missionId)
    .maybeSingle();
  if (missionError) {
    return NextResponse.json({ error: missionError.message }, { status: 500 });
  }
  if (!mission) {
    return NextResponse.json({ error: 'Mission introuvable.' }, { status: 404 });
  }

  const { error: updateError } = await auth.serviceClient
    .from('missions')
    .update({ eope_event_id: eopeEventId, ...(eopeEventId ? {} : { eope_synced_at: null, eope_payload: null }) })
    .eq('id', params.missionId);

  if (updateError) {
    if (updateError.code === '23505') {
      return NextResponse.json(
        { error: 'Cet événement eOPE est déjà lié à une autre mission.' },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mission_id: params.missionId, eope_event_id: eopeEventId });
}
