import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { SlackApiClientError, SlackService } from '@/lib/slack/service';

export async function POST(request: NextRequest, { params }: { params: { missionId: string } }) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.client || !auth.profile || !auth.user) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const missionId = params.missionId;
  const { data: mission } = await auth.client
    .from('missions')
    .select('id,created_by,slack_channel_id')
    .eq('id', missionId)
    .single<{ id: string; created_by: string; slack_channel_id: string | null }>();

  if (!mission) {
    return NextResponse.json({ error: 'Mission introuvable.' }, { status: 404 });
  }

  const canManage = auth.profile.role === 'admin' || (auth.profile.role === 'responsable' && mission.created_by === auth.user.id);
  if (!canManage) {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  if (!mission.slack_channel_id) {
    return NextResponse.json({ error: 'Aucun canal Slack associé à cette mission.' }, { status: 400 });
  }

  const payload = (await request.json().catch(() => ({}))) as { message?: string };
  const message = payload.message?.trim();

  if (!message) {
    return NextResponse.json({ error: 'Le message ne peut pas être vide.' }, { status: 400 });
  }

  try {
    const slack = new SlackService();
    await slack.postMessage(mission.slack_channel_id, message);

    const serviceClient = createServerSupabaseServiceClient();
    await serviceClient.from('slack_notification_logs').insert({
      mission_id: missionId,
      profile_id: auth.user.id,
      type: 'mission_channel_manual_message',
      status: 'sent',
      sent_at: new Date().toISOString(),
      dedupe_key: `mission:${missionId}:manual:${Date.now()}`
    });

    return NextResponse.json({ message: 'Message envoyé sur Slack.' });
  } catch (error) {
    if (error instanceof SlackApiClientError) {
      return NextResponse.json({ error: error.message, code: error.code, needed: error.needed ?? null, provided: error.provided ?? null }, { status: 500 });
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur inconnue' }, { status: 500 });
  }
}
