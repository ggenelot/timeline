import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { getEopeConfig, isEopeConfigured } from '@/lib/eope/config';
import { EopeSyncAlreadyRunningError, runEopeSync } from '@/lib/eope/sync';

// Synchronisation eOPE planifiée (Vercel cron, cf. vercel.json). Protégée par
// CRON_SECRET (convention Vercel : header "Authorization: Bearer $CRON_SECRET").
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const config = getEopeConfig();

  if (!config.cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET non configuré : cron eOPE désactivé.' }, { status: 503 });
  }

  const authorization = request.headers.get('authorization');
  if (authorization !== `Bearer ${config.cronSecret}`) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }

  if (!isEopeConfigured(config)) {
    return NextResponse.json({ error: "L'intégration eOPE n'est pas configurée." }, { status: 503 });
  }

  try {
    const result = await runEopeSync(createServerSupabaseServiceClient(), {
      direction: 'full',
      triggerSource: 'cron',
      triggeredBy: null
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
