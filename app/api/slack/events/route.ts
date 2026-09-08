import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequestSignature } from '@/lib/slack/signature';
import {
  buildSlackLoginDm,
  createSlackLoginChallenge,
  createSlackNumericLoginChallenge,
  createSlackOnboardingChallenge,
  resolveProfileBySlack
} from '@/lib/slack/auth';
import { getSlackConfig } from '@/lib/slack/config';
import { SlackService } from '@/lib/slack/service';

// Endpoint Slack Events API. Un DM adressé au bot Timeline déclenche l'envoi d'un lien magique
// 1-clic + code OTP en repli, la personne étant identifiée par son seul compte Slack (aucun
// identifiant Timeline à connaître). Voir aussi la slash command /timeline login et l'onboarding
// poussé (edge function send-slack-invitations), qui partagent la même mécanique.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-slack-signature');
  const timestamp = request.headers.get('x-slack-request-timestamp');

  const valid = verifySlackRequestSignature({ rawBody, signature, timestamp });
  if (!valid) {
    console.warn('[slack-events] invalid Slack signature');
    return NextResponse.json({ error: 'Invalid Slack signature.' }, { status: 401 });
  }

  let body: {
    type?: string;
    challenge?: string;
    team_id?: string;
    event?: {
      type?: string;
      channel_type?: string;
      subtype?: string;
      bot_id?: string;
      user?: string;
      team?: string;
    };
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Handshake de validation de l'URL (une seule fois, à la configuration côté Slack).
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge });
  }

  // Slack réémet l'événement en cas de non-200 ou de dépassement des 3 s. On acquitte sans
  // retraiter pour ne jamais envoyer deux DM pour un même message.
  if (request.headers.get('x-slack-retry-num')) {
    return NextResponse.json({ ok: true });
  }

  if (body.type === 'event_callback' && body.event) {
    const event = body.event;
    // On ne traite qu'un vrai message humain en DM : pas d'édition (subtype), pas de message de bot
    // (bot_id) — ce dernier garde-fou empêche aussi toute boucle sur nos propres réponses.
    const isUserDm =
      event.type === 'message' &&
      event.channel_type === 'im' &&
      !event.subtype &&
      !event.bot_id &&
      typeof event.user === 'string';

    if (isUserDm) {
      const teamId = body.team_id ?? event.team ?? null;
      const userId = event.user as string;
      if (teamId) {
        try {
          await handleLoginDm(teamId, userId, request);
        } catch (error) {
          console.error('[slack-events] failed to handle DM', {
            reason: error instanceof Error ? error.message : 'unknown'
          });
        }
      }
    }
  }

  // Acquittement rapide : indispensable pour éviter les réémissions de Slack.
  return NextResponse.json({ ok: true });
}

async function handleLoginDm(teamId: string, userId: string, request: NextRequest) {
  const slack = new SlackService();
  const base = getSlackConfig().appBaseUrl ?? new URL(request.url).origin;
  const loginUrl = `${base}/login`;

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');

  const channel = await slack.openDirectMessage(userId);
  const profile = await resolveProfileBySlack(teamId, userId);

  // Aucun compte Timeline relié : on n'envoie plus « contacte un admin ». On ouvre un parcours
  // self-service (retrouver un compte existant ou en créer un) via un lien à usage unique.
  if (!profile) {
    const onboardingToken = await createSlackOnboardingChallenge(teamId, userId, ip, userAgent);
    const onboardingUrl = `${base}/auth/slack/onboarding?token=${onboardingToken}`;
    await slack.postMessage(
      channel,
      `Bonjour 👋\nBienvenue sur Timeline ! Pour accéder à ton espace, ouvre ce lien (valable 30 min) :\n\n${onboardingUrl}\n\nTu pourras soit retrouver un compte existant, soit en créer un nouveau — aucun identifiant à connaître.`
    );
    return;
  }

  const token = await createSlackLoginChallenge(teamId, userId, ip, userAgent);
  const magicUrl = `${base}/auth/slack/magic?token=${token}`;

  const otp = await createSlackNumericLoginChallenge(teamId, userId, ip, userAgent);

  const text =
    otp.status === 'ok'
      ? buildSlackLoginDm({ magicUrl, otpCode: otp.code, loginUrl })
      : `Bonjour 👋\n\n🔗 Connexion en 1 clic (valable 10 min) : ${magicUrl}\n\n(Tu as demandé plusieurs codes récemment : patiente quelques minutes avant d'en générer un nouveau si le lien ne suffit pas.)`;

  await slack.postMessage(channel, text);
}
