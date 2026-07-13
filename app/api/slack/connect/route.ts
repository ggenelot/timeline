import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export async function DELETE(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.client || !auth.profile) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 401 });
  }

  const { error } = await auth.client
    .from('profiles')
    .update({
      slack_user_id: null,
      slack_team_id: null,
      slack_connected_at: null,
      avatar_url: null
    })
    .eq('id', auth.profile.id);

  if (error) {
    return NextResponse.json({ error: `Impossible de déconnecter Slack : ${error.message}` }, { status: 400 });
  }

  // Supprime aussi la/les ligne(s) miroir slack_identities : c'est la source de vérité de la
  // connexion via Slack (OTP/magic link) et du renvoi des identifiants. Sans cette suppression,
  // le compte resterait « lié » côté authentification malgré la déconnexion. Table en RLS
  // USING(false) pour les clients authentifiés → service client obligatoire.
  const service = createServerSupabaseServiceClient();
  const { error: identityError } = await service
    .from('slack_identities')
    .delete()
    .eq('profile_id', auth.profile.id);

  if (identityError) {
    return NextResponse.json({ error: `Impossible de déconnecter Slack : ${identityError.message}` }, { status: 400 });
  }

  return NextResponse.json({ message: 'Compte Slack déconnecté.' });
}
