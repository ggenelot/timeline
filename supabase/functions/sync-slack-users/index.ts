// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization')! } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    const { data: me } = await supabase.from('profiles').select('id,role').eq('id', user.id).single();
    if (me?.role !== 'admin') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });

    const slackResp = await fetch('https://slack.com/api/users.list', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('SLACK_BOT_TOKEN')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const slackData = await slackResp.json();
    if (!slackData.ok) {
      return new Response(JSON.stringify({ error: `Échec de l'appel Slack users.list : ${slackData.error ?? 'erreur inconnue'}` }), { status: 502, headers: corsHeaders });
    }
    const members = (slackData.members ?? []).filter((m: any) => !m.is_bot && !m.deleted && !m.is_app_user && m.id !== 'USLACKBOT');

    const teamId = Deno.env.get('SLACK_TEAM_ID') ?? null;
    const { data: profiles } = await supabase.from('profiles').select('id,full_name,email,slack_user_id,slack_team_id,slack_username,avatar_url');
    const { data: identities } = await supabase.from('slack_identities').select('profile_id,slack_user_id,slack_team_id');
    const { data: invitations } = await supabase.from('slack_invitations').select('id,slack_team_id,slack_user_id,status');

    const bySlack = new Map<string, any>();
    for (const p of profiles ?? []) if (p.slack_user_id && p.slack_team_id) bySlack.set(`${p.slack_team_id}:${p.slack_user_id}`, { profileId: p.id });
    for (const i of identities ?? []) bySlack.set(`${i.slack_team_id}:${i.slack_user_id}`, { profileId: i.profile_id });
    const byEmail = new Map<string, any>();
    for (const p of profiles ?? []) if (p.email) byEmail.set(p.email.toLowerCase(), p);
    const profileById = new Map<string, any>();
    for (const p of profiles ?? []) profileById.set(p.id, p);
    const invitationByKey = new Map<string, any>();
    for (const inv of invitations ?? []) invitationByKey.set(`${inv.slack_team_id}:${inv.slack_user_id}`, inv);

    const results: any[] = [];
    for (const m of members) {
      const slackTeamId = teamId ?? m.team_id ?? '';
      const key = `${slackTeamId}:${m.id}`;
      const email = m.profile?.email?.toLowerCase?.() ?? null;
      const slackUsername = m.name ?? null;
      const slackName = m.real_name ?? m.name ?? null;
      const avatarUrl = m.profile?.image_512 ?? m.profile?.image_1024 ?? m.profile?.image_192 ?? m.profile?.image_72 ?? null;
      const linked = bySlack.get(key);
      const emailMatch = !linked && email ? byEmail.get(email) : null;
      const timelineStatus = linked ? 'linked' : emailMatch ? 'timeline_account_unlinked' : 'missing_timeline_account';

      if (linked?.profileId) {
        const currentProfile = profileById.get(linked.profileId);
        const updates: Record<string, unknown> = {};
        if (slackName && currentProfile?.full_name !== slackName) updates.full_name = slackName;
        if (slackUsername && currentProfile?.slack_username !== slackUsername) updates.slack_username = slackUsername;
        if (avatarUrl && currentProfile?.avatar_url !== avatarUrl) updates.avatar_url = avatarUrl;
        if (Object.keys(updates).length > 0) {
          await supabase.from('profiles').update(updates).eq('id', linked.profileId);
          profileById.set(linked.profileId, { ...currentProfile, ...updates });
        }
      }

      const invitation = invitationByKey.get(key);

      results.push({
        slack_user_id: m.id,
        slack_team_id: slackTeamId,
        slack_email: email,
        slack_name: slackName,
        slack_username: slackUsername,
        matched_profile_id: linked?.profileId ?? emailMatch?.id ?? null,
        timeline_status: timelineStatus,
        avatar_url: avatarUrl,
        invitation_id: invitation && invitation.status !== 'accepted' ? invitation.id : null,
        invitation_status: invitation?.status ?? null
      });
    }

    const timelineAccounts = (profiles ?? []).map((profile: any) => ({
      id: profile.id,
      full_name: profile.full_name ?? null,
      email: profile.email ?? null,
      slack_user_id: profile.slack_user_id ?? null,
      slack_team_id: profile.slack_team_id ?? null
    }));

    return new Response(JSON.stringify({ results, timeline_accounts: timelineAccounts }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
