// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization')! } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    const { data: me } = await supabase.from('profiles').select('id,role').eq('id', user.id).single();
    if (me?.role !== 'admin') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });

    let q = supabase.from('slack_invitations').select('*');
    if (body.send_all_pending) q = q.eq('status', 'pending');
    else q = q.in('id', body.invitation_ids ?? []);
    const { data: invitations } = await q;
    const resend = Boolean(body.resend);
    const siteUrl = Deno.env.get('PUBLIC_SITE_URL') ?? Deno.env.get('APP_BASE_URL');
    for (const inv of invitations ?? []) {
      if (inv.status === 'sent' && !resend) continue;
      const token = inv.invite_token ?? crypto.randomUUID();
      const inviteUrl = `${siteUrl}/auth/slack/signup?slack_invite_token=${encodeURIComponent(token)}`;
      try {
        const openRes = await fetch('https://slack.com/api/conversations.open', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('SLACK_BOT_TOKEN')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ users: inv.slack_user_id }) });
        const openJson = await openRes.json();
        const channel = openJson.channel?.id;
        if (!channel) throw new Error('missing_dm_channel');
        const text = `Bonjour 👋\nTon compte Slack n’est pas encore relié à Timeline.\n\nTu peux créer ou relier ton compte ici :\n${inviteUrl}\n\nUne fois connecté, tu recevras les propositions de mission directement via Slack.`;
        await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('SLACK_BOT_TOKEN')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, text }) });
        await supabase.from('slack_invitations').update({ status: 'sent', sent_at: new Date().toISOString(), invite_url: inviteUrl, invite_token: token, error_message: null }).eq('id', inv.id);
      } catch (e) {
        await supabase.from('slack_invitations').update({ status: 'error', error_message: String(e) }).eq('id', inv.id);
      }
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
