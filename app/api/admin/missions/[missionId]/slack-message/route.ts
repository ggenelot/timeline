import { NextRequest, NextResponse } from 'next/server';
import { requireMissionPermission } from '@/lib/api/permissions';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { SlackApiClientError, SlackService } from '@/lib/slack/service';

export async function POST(request: NextRequest, { params }: { params: { missionId: string } }) {
  const missionId = params.missionId;
  const auth = await requireMissionPermission(request, missionId);
  if (auth.errorResponse) return auth.errorResponse;

  const { data: mission } = await auth.serviceClient
    .from('missions')
    .select('id,created_by,slack_channel_id')
    .eq('id', missionId)
    .single<{ id: string; created_by: string; slack_channel_id: string | null }>();

  if (!mission) {
    return NextResponse.json({ error: 'Mission introuvable.' }, { status: 404 });
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
