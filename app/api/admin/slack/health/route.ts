import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { SlackApiClientError, SlackService } from '@/lib/slack/service';

const REQUIRED_SCOPES = ['chat:write', 'groups:write', 'groups:read', 'im:write'];

export async function GET(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile || auth.profile.role !== 'admin') {
    return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  try {
    const slack = new SlackService();
    const authTest = await slack.authTest();

    let grantedScopes: string[] = [];
    try {
      const scopes = await slack.listGrantedScopes();
      grantedScopes = [
        ...(scopes.scopes?.team ?? []),
        ...(scopes.scopes?.channel ?? []),
        ...(scopes.scopes?.group ?? []),
        ...(scopes.scopes?.im ?? [])
      ];
    } catch {
      grantedScopes = [];
    }

    const missingScopes = REQUIRED_SCOPES.filter((scope) => !grantedScopes.includes(scope));

    return NextResponse.json({
      ok: true,
      workspace: {
        teamId: authTest.team_id ?? null,
        teamName: authTest.team ?? null
      },
      botUserId: authTest.user_id ?? null,
      grantedScopes,
      missingScopes
    });
  } catch (error) {
    if (error instanceof SlackApiClientError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          code: error.code,
          needed: error.needed ?? null,
          provided: error.provided ?? null
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Erreur inconnue' }, { status: 500 });
  }
}
