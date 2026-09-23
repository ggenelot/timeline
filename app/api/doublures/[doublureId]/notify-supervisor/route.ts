import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken } from '@/lib/api/auth';
import { createServerSupabaseAnonClient } from '@/lib/supabase/server';
import { getSlackConfig } from '@/lib/slack/config';
import { notifySupervisorOfDoublure } from '@/lib/slack/workflows';

// Appelée par le carnet après la déclaration d'une doublure ou un changement
// de doubleur. Idempotente : un couple doublure / doubleur n'est notifié
// qu'une fois (dedupe dans slack_notification_logs).
export async function POST(request: NextRequest, { params }: { params: { doublureId: string } }) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });

  const userClient = createServerSupabaseAnonClient(token);
  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser(token);
  if (userError || !user) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  // Lecture sous RLS : seul quelqu'un qui voit la doublure peut déclencher
  // la notification de son doubleur.
  const { data: doublure } = await userClient.from('doublures').select('id').eq('id', params.doublureId).maybeSingle();
  if (!doublure) return NextResponse.json({ error: 'Doublure introuvable.' }, { status: 404 });

  if (!getSlackConfig().botToken) {
    return NextResponse.json({ sent: false, reason: 'slack_not_configured' });
  }

  try {
    const result = await notifySupervisorOfDoublure(params.doublureId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { sent: false, reason: 'error', slackError: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 202 }
    );
  }
}
