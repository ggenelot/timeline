import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';
import { SlackApiClientError, SlackService } from '@/lib/slack/service';

const REQUIRED_SCOPES = ['chat:write', 'groups:write', 'groups:read', 'im:write'];

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'settings', 'can_see');
  if (auth.errorResponse) return auth.errorResponse;

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
