import { NextResponse } from 'next/server';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string; slackTeamId?: string; slackUserId?: string; inviteToken?: string };
  const service = createServerSupabaseServiceClient();

  let slackTeamId = body.slackTeamId;
  let slackUserId = body.slackUserId;
  if (body.inviteToken) {
    const { data: invite } = await service.from('slack_invitations').select('*').eq('invite_token', body.inviteToken).maybeSingle();
    if (!invite) return NextResponse.json({ error: 'Invitation invalide.' }, { status: 400 });
    if (invite.status === 'accepted') return NextResponse.json({ error: 'Invitation déjà acceptée.' }, { status: 400 });
    slackTeamId = invite.slack_team_id;
    slackUserId = invite.slack_user_id;
  }

  if (!body.email || !body.password || !slackTeamId || !slackUserId) return NextResponse.json({ error: 'Paramètres manquants.' }, { status: 400 });

  const { data: existingIdentity } = await service.from('slack_identities').select('profile_id').eq('slack_team_id', slackTeamId).eq('slack_user_id', slackUserId).maybeSingle();
  if (existingIdentity?.profile_id) return NextResponse.json({ error: 'Ce compte Slack est déjà lié à un autre profil.' }, { status: 409 });

  const { data: created, error } = await service.auth.admin.createUser({ email: body.email, password: body.password, email_confirm: true, user_metadata: { full_name: `Slack ${slackUserId}` } });
  if (error || !created.user?.id) return NextResponse.json({ error: error?.message ?? 'Création impossible.' }, { status: 400 });

  await service.from('profiles').update({ slack_user_id: slackUserId, slack_team_id: slackTeamId, slack_connected_at: new Date().toISOString() }).eq('id', created.user.id);
  await service.from('slack_identities').upsert({ profile_id: created.user.id, slack_team_id: slackTeamId, slack_user_id: slackUserId, is_primary: true, last_login_at: new Date().toISOString() });
  if (body.inviteToken) {
    await service.from('slack_invitations').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('invite_token', body.inviteToken);
  }

  const { data: linkData } = await service.auth.admin.generateLink({ type: 'magiclink', email: body.email, options: { redirectTo: `${new URL(request.url).origin}/missions` } });
  return NextResponse.json({ next: linkData?.properties?.action_link ?? '/login' });
}
