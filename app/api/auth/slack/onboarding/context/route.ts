import { NextResponse } from 'next/server';
import { peekSlackOnboardingChallenge } from '@/lib/slack/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

// Contexte de la page d'onboarding self-service. Authentifié par le seul jeton d'onboarding (émis
// par le bot), PAS par une session : le visiteur n'a pas encore de compte. On VALIDE le jeton sans
// le consommer (peek) — il sera consommé à l'action finale (claim/create) —, puis on renvoie la
// liste des comptes Timeline non reliés et le référentiel de compétences pour le formulaire.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  const token = body.token?.trim();
  if (!token) return NextResponse.json({ error: 'Lien invalide.' }, { status: 400 });

  const ctx = await peekSlackOnboardingChallenge(token);
  if (!ctx) {
    return NextResponse.json(
      { error: 'Lien invalide ou expiré. Réécris au bot Timeline pour en recevoir un nouveau.' },
      { status: 400 }
    );
  }

  const service = createServerSupabaseServiceClient();

  // Choix produit assumé : tous les comptes non reliés à un compte Slack sont proposés.
  const { data: accounts } = await service
    .from('profiles')
    .select('id, full_name, identifier')
    .is('slack_user_id', null)
    .order('full_name', { ascending: true });

  const { data: skillCategories } = await service
    .from('skill_categories')
    .select('id,name,color,display_order,skills(id,name,display_order,category_id)')
    .order('display_order', { ascending: true })
    .order('display_order', { referencedTable: 'skills', ascending: true });

  return NextResponse.json({
    ok: true,
    accounts: accounts ?? [],
    skill_categories: skillCategories ?? []
  });
}
