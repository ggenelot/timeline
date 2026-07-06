// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

const DIACRITICS_RE = /[̀-ͯ]/g;

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

async function deriveUniqueIdentifier(supabase: any, slackUsername: string | null, slackName: string | null, fallback: string): Promise<string> {
  const base = slugify(slackUsername || slackName || '') || slugify(fallback) || 'benevole';
  let candidate = base;
  let attempt = 1;
  for (;;) {
    const { data: existing } = await supabase.from('profiles').select('id').eq('identifier', candidate).maybeSingle();
    if (!existing) return candidate;
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
}

function randomPassword(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

type Target = {
  slack_user_id: string;
  slack_team_id: string;
  slack_name?: string | null;
  slack_email?: string | null;
  slack_username?: string | null;
  matched_profile_id?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    // Client "authentifié" — sert uniquement à identifier l'appelant via son propre jeton.
    const authedClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization')! } } });
    const { data: { user } } = await authedClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    const { data: me } = await authedClient.from('profiles').select('id,role').eq('id', user.id).single();
    if (me?.role !== 'admin') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });

    // Client service-role "propre" (sans le jeton de l'appelant en Authorization) — obligatoire pour
    // les appels auth.admin.* (createUser/updateUserById/generateLink), qui exigent un JWT service_role
    // et rejettent sinon avec 403 "not_admin" même si l'apikey est correcte.
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const targets: Target[] = Array.isArray(body.targets) ? body.targets : [];
    if (targets.length === 0) {
      return new Response(JSON.stringify({ error: 'Aucun membre Slack à inviter.' }), { status: 400, headers: corsHeaders });
    }

    // URL de base des liens (message de création de compte, magic link…) :
    // priorité au réglage éditable en admin (app_settings.base_url, page /admin/apparence),
    // puis repli sur les variables d'environnement de la fonction. On retire un éventuel
    // slash final pour éviter les `//login` lors de la concaténation.
    const { data: appSettings } = await supabase.from('app_settings').select('base_url').eq('id', 1).maybeSingle();
    const rawSiteUrl = appSettings?.base_url?.trim() || Deno.env.get('PUBLIC_SITE_URL') || Deno.env.get('APP_BASE_URL') || '';
    const siteUrl = rawSiteUrl.replace(/\/+$/, '');
    const results: any[] = [];

    for (const target of targets) {
      const slackUserId = target.slack_user_id?.trim();
      const slackTeamId = target.slack_team_id?.trim();
      if (!slackUserId || !slackTeamId) {
        results.push({ slack_user_id: slackUserId ?? null, ok: false, error: 'slack_user_id et slack_team_id sont obligatoires.' });
        continue;
      }

      const { data: existingIdentity } = await supabase
        .from('slack_identities')
        .select('profile_id')
        .eq('slack_team_id', slackTeamId)
        .eq('slack_user_id', slackUserId)
        .maybeSingle();
      const linkedProfileId: string | null = existingIdentity?.profile_id ?? null;

      // Le renvoi est toujours possible (mot de passe temporaire régénéré à chaque envoi),
      // que le compte existe déjà ou non — pas de blocage sur un précédent envoi réussi.
      const { data: existingInvitation } = await supabase
        .from('slack_invitations')
        .select('id,status')
        .eq('slack_team_id', slackTeamId)
        .eq('slack_user_id', slackUserId)
        .maybeSingle();

      let invitationId = existingInvitation?.id ?? null;
      if (!invitationId) {
        const { data: inserted, error: insertError } = await supabase
          .from('slack_invitations')
          .insert({
            slack_user_id: slackUserId,
            slack_team_id: slackTeamId,
            slack_email: target.slack_email ?? null,
            slack_name: target.slack_name ?? null,
            status: 'pending',
            invite_token: crypto.randomUUID(),
            created_by: me.id
          })
          .select('id')
          .single();
        if (insertError || !inserted) {
          results.push({ slack_user_id: slackUserId, ok: false, error: insertError?.message ?? 'Impossible de préparer l\'invitation.' });
          continue;
        }
        invitationId = inserted.id;
      }

      try {
        let profileId: string;
        let email: string;
        let identifier: string | null = null;
        let tempPassword: string | null = null;
        let magicLink: string | null = null;

        if (linkedProfileId) {
          // Compte déjà existant (créé via l'ajout de compétences, un envoi précédent, ou tout autre
          // moyen) : on régénère un mot de passe temporaire et on (re)envoie les identifiants.
          profileId = linkedProfileId;
          const { data: existingProfile, error: profileFetchError } = await supabase
            .from('profiles')
            .select('id,email,identifier')
            .eq('id', profileId)
            .single();
          if (profileFetchError || !existingProfile) throw new Error('Profil Timeline introuvable.');
          email = existingProfile.email;
          identifier = existingProfile.identifier;
          tempPassword = randomPassword();

          const { error: passwordError } = await supabase.auth.admin.updateUserById(profileId, { password: tempPassword });
          if (passwordError) throw new Error(passwordError.message);

          await supabase
            .from('profiles')
            .update({ slack_username: target.slack_username ?? null, slack_connected_at: new Date().toISOString() })
            .eq('id', profileId);
        } else if (target.matched_profile_id) {
          profileId = target.matched_profile_id;
          const { data: existingProfile, error: profileFetchError } = await supabase
            .from('profiles')
            .select('id,email')
            .eq('id', profileId)
            .single();
          if (profileFetchError || !existingProfile) throw new Error('Profil Timeline introuvable.');
          email = existingProfile.email;

          const { error: updateError } = await supabase
            .from('profiles')
            .update({ slack_user_id: slackUserId, slack_team_id: slackTeamId, slack_username: target.slack_username ?? null, slack_connected_at: new Date().toISOString() })
            .eq('id', profileId);
          if (updateError) throw new Error(updateError.message);

          const { data: linkData } = await supabase.auth.admin.generateLink({
            type: 'magiclink',
            email,
            options: { redirectTo: `${siteUrl ?? ''}/missions` }
          });
          magicLink = linkData?.properties?.action_link ?? null;
        } else {
          const fullName = target.slack_name?.trim() || target.slack_username?.trim() || 'Bénévole';
          identifier = await deriveUniqueIdentifier(supabase, target.slack_username ?? null, target.slack_name ?? null, slackUserId);
          email = target.slack_email?.trim().toLowerCase() || `${identifier}@timeline.local`;
          tempPassword = randomPassword();

          const { data: created, error: createError } = await supabase.auth.admin.createUser({
            email,
            email_confirm: true,
            password: tempPassword,
            user_metadata: { full_name: fullName }
          });
          if (createError || !created.user?.id) throw new Error(createError?.message ?? 'Création du compte impossible.');
          profileId = created.user.id;

          const { error: profileError } = await supabase.from('profiles').upsert(
            {
              id: profileId,
              full_name: fullName,
              email,
              identifier,
              role: 'benevole',
              slack_user_id: slackUserId,
              slack_team_id: slackTeamId,
              slack_username: target.slack_username ?? null,
              slack_connected_at: new Date().toISOString()
            },
            { onConflict: 'id' }
          );
          if (profileError) throw new Error(profileError.message);
        }

        await supabase.from('slack_identities').upsert(
          { profile_id: profileId, slack_team_id: slackTeamId, slack_user_id: slackUserId, is_primary: true, last_login_at: new Date().toISOString() },
          { onConflict: 'slack_team_id,slack_user_id' }
        );

        const openRes = await fetch('https://slack.com/api/conversations.open', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('SLACK_BOT_TOKEN')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ users: slackUserId }) });
        const openJson = await openRes.json();
        const channel = openJson.channel?.id;
        if (!channel) throw new Error('missing_dm_channel');

        const loginUrl = `${siteUrl ?? ''}/login`;
        const text = tempPassword
          ? `Bonjour 👋\nTon compte Timeline vient d'être créé.\n\nIdentifiant : ${identifier}\nMot de passe temporaire : ${tempPassword}\n\nConnecte-toi ici : ${loginUrl}\n\nTu recevras ensuite les propositions de mission directement via Slack.`
          : `Bonjour 👋\nTon compte Timeline vient d'être relié à Slack.\n\nConnecte-toi ici : ${magicLink ?? loginUrl}\n\nTu recevras ensuite les propositions de mission directement via Slack.`;

        const postRes = await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('SLACK_BOT_TOKEN')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, text }) });
        const postJson = await postRes.json();
        if (!postJson.ok) throw new Error(`slack_dm_failed:${postJson.error ?? 'unknown'}`);

        await supabase.from('slack_invitations').update({ status: 'sent', sent_at: new Date().toISOString(), matched_profile_id: profileId, error_message: null }).eq('id', invitationId);

        results.push({ slack_user_id: slackUserId, ok: true, profile_id: profileId });
      } catch (e) {
        await supabase.from('slack_invitations').update({ status: 'error', error_message: String(e?.message ?? e) }).eq('id', invitationId);
        results.push({ slack_user_id: slackUserId, ok: false, error: String(e?.message ?? e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
