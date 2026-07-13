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

// SHA-256 hex — doit rester compatible avec hashSlackLoginCode (lib/slack/auth.ts) pour que la
// route de vérification côté Next puisse valider un code émis ici.
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Code numérique à 6 chiffres, tiré uniformément par rejet (évite le biais modulo).
function generateNumericCode(): string {
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= Math.floor(0xffffffff / 1_000_000) * 1_000_000);
  return String(n % 1_000_000).padStart(6, '0');
}

// Émet un code OTP 6 chiffres pour un couple Slack (team, user) : invalide les codes actifs
// précédents (un seul code valable), ne stocke que le hash, retourne le code brut (jamais loggé).
async function issueOtp(supabase: any, slackTeamId: string, slackUserId: string): Promise<string> {
  await supabase
    .from('slack_login_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('slack_team_id', slackTeamId)
    .eq('slack_user_id', slackUserId)
    .eq('channel', 'otp_login')
    .is('consumed_at', null);

  const code = generateNumericCode();
  await supabase.from('slack_login_challenges').insert({
    slack_team_id: slackTeamId,
    slack_user_id: slackUserId,
    code_hash: await sha256Hex(code),
    channel: 'otp_login',
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    attempt_count: 0
  });
  return code;
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
    // Autorisation : permission settings/can_manage (admin implicite via has_permission).
    const { data: allowed } = await authedClient.rpc('has_permission', { _user_id: user.id, _resource: 'settings', _action: 'can_manage' });
    if (!allowed) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });

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
      let linkedProfileId: string | null = existingIdentity?.profile_id ?? null;

      // Repli sur profiles : un bénévole qui a associé lui-même son compte via le flux OAuth
      // self-service (app/api/slack/connect/callback) porte bien slack_user_id/slack_team_id sur
      // son profil, mais pas toujours de ligne slack_identities. Sans ce repli, le renvoi
      // retomberait dans la branche « création de compte » et violerait la contrainte d'unicité
      // idx_profiles_slack_team_user_unique en insérant un second profil sur le même couple Slack.
      if (!linkedProfileId) {
        const { data: linkedProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('slack_team_id', slackTeamId)
          .eq('slack_user_id', slackUserId)
          .maybeSingle();
        linkedProfileId = linkedProfile?.id ?? null;
      }

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
            created_by: user.id
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
        let identifier: string | null = null;
        let isNewAccount = false;

        if (linkedProfileId) {
          // Compte déjà existant : on ne touche plus au mot de passe, on (re)émet un code OTP.
          profileId = linkedProfileId;
          const { data: existingProfile, error: profileFetchError } = await supabase
            .from('profiles')
            .select('id,identifier')
            .eq('id', profileId)
            .single();
          if (profileFetchError || !existingProfile) throw new Error('Profil Timeline introuvable.');
          identifier = existingProfile.identifier;

          await supabase
            .from('profiles')
            .update({ slack_username: target.slack_username ?? null, slack_connected_at: new Date().toISOString() })
            .eq('id', profileId);
        } else if (target.matched_profile_id) {
          // Profil Timeline existant repéré par email : on le relie à Slack puis on émet un code.
          profileId = target.matched_profile_id;
          const { data: existingProfile, error: profileFetchError } = await supabase
            .from('profiles')
            .select('id,identifier')
            .eq('id', profileId)
            .single();
          if (profileFetchError || !existingProfile) throw new Error('Profil Timeline introuvable.');
          identifier = existingProfile.identifier;

          const { error: updateError } = await supabase
            .from('profiles')
            .update({ slack_user_id: slackUserId, slack_team_id: slackTeamId, slack_username: target.slack_username ?? null, slack_connected_at: new Date().toISOString() })
            .eq('id', profileId);
          if (updateError) throw new Error(updateError.message);
        } else {
          const fullName = target.slack_name?.trim() || target.slack_username?.trim() || 'Bénévole';
          identifier = await deriveUniqueIdentifier(supabase, target.slack_username ?? null, target.slack_name ?? null, slackUserId);
          const email = target.slack_email?.trim().toLowerCase() || `${identifier}@timeline.local`;
          isNewAccount = true;

          // Mot de passe aléatoire uniquement pour satisfaire createUser — jamais communiqué :
          // la connexion se fait par code OTP.
          const { data: created, error: createError } = await supabase.auth.admin.createUser({
            email,
            email_confirm: true,
            password: randomPassword(),
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

        const otpCode = await issueOtp(supabase, slackTeamId, slackUserId);

        const openRes = await fetch('https://slack.com/api/conversations.open', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('SLACK_BOT_TOKEN')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ users: slackUserId }) });
        const openJson = await openRes.json();
        const channel = openJson.channel?.id;
        if (!channel) throw new Error('missing_dm_channel');

        const loginUrl = `${siteUrl ?? ''}/login`;
        const identifierLine = identifier ? `ton identifiant « ${identifier} »` : 'ton identifiant Timeline';
        const text = isNewAccount
          ? `Bonjour 👋\nTon compte Timeline vient d'être créé.\n\nTon code de connexion (valable 10 min) : ${otpCode}\n\nPour te connecter :\n1. Va sur ${loginUrl}\n2. Choisis « Recevoir un code par Slack »\n3. Saisis ${identifierLine} puis ce code à 6 chiffres.\n\nLe code expire au bout de 10 minutes : tu peux en demander un nouveau à tout moment depuis la page de connexion.\nTu recevras ensuite les propositions de mission directement ici, sur Slack.`
          : `Bonjour 👋\nVoici ton code de connexion Timeline (valable 10 min) : ${otpCode}\n\nConnecte-toi sur ${loginUrl} → « Recevoir un code par Slack », saisis ${identifierLine} puis ce code à 6 chiffres.\nBesoin d'un nouveau code ? Redemande-en un depuis la page de connexion.`;

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
