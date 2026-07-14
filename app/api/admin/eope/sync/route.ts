import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/permissions';
import { isEopeConfigured } from '@/lib/eope/config';
import { EopeSyncAlreadyRunningError, runEopeSync, type EopeSyncDirection } from '@/lib/eope/sync';

// La synchronisation appelle l'API eOPE en série : laisser le temps aux runs
// larges (fenêtre de 90 jours) de se terminer sur Vercel.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const DIRECTIONS: EopeSyncDirection[] = ['pull', 'push', 'full'];

// Déclenche une synchronisation eOPE. Admin uniquement : l'opération écrit en
// service role à travers plusieurs domaines et porte la portée externe
// validation:write (même logique que l'import bulk de missions).
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.errorResponse) return auth.errorResponse;

  if (!isEopeConfigured()) {
    return NextResponse.json(
      { error: "L'intégration eOPE n'est pas configurée (EOPE_BASE_URL / EOPE_CLIENT_ID / EOPE_CLIENT_SECRET)." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const direction: EopeSyncDirection = DIRECTIONS.includes(body?.direction) ? body.direction : 'full';

  try {
    const result = await runEopeSync(auth.serviceClient, {
      direction,
      triggerSource: 'manual',
      triggeredBy: auth.user.id
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EopeSyncAlreadyRunningError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Échec de la synchronisation eOPE.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
