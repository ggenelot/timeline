import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

type AppSettingsRow = {
  logo_url: string | null;
  brand_color: string;
  accent_color: string;
  font_sans: string | null;
  font_display: string | null;
  font_hand: string | null;
  org_name: string;
  org_tagline: string;
  login_greeting: string;
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export async function GET(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  if (auth.profile.role !== 'admin') return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const serviceClient = createServerSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from('app_settings')
    .select('logo_url,brand_color,accent_color,font_sans,font_display,font_hand,org_name,org_tagline,login_greeting')
    .eq('id', 1)
    .single<AppSettingsRow>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ settings: data });
}

export async function PATCH(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });

  const auth = await requireAuthenticatedUser(token);
  if (auth.errorResponse || !auth.profile) return auth.errorResponse ?? NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  if (auth.profile.role !== 'admin') return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    logoUrl?: string | null;
    brandColor?: string;
    accentColor?: string;
    fontSans?: string | null;
    fontDisplay?: string | null;
    fontHand?: string | null;
    orgName?: string;
    orgTagline?: string;
    loginGreeting?: string;
  };

  if (body.brandColor !== undefined && !HEX_COLOR.test(body.brandColor)) {
    return NextResponse.json({ error: 'Couleur de marque invalide (format #RRGGBB attendu).' }, { status: 400 });
  }
  if (body.accentColor !== undefined && !HEX_COLOR.test(body.accentColor)) {
    return NextResponse.json({ error: "Couleur d'accent invalide (format #RRGGBB attendu)." }, { status: 400 });
  }
  if (body.orgName !== undefined && !body.orgName.trim()) {
    return NextResponse.json({ error: "Le nom de l'association ne peut pas être vide." }, { status: 400 });
  }
  if (body.orgTagline !== undefined && !body.orgTagline.trim()) {
    return NextResponse.json({ error: 'Le slogan ne peut pas être vide.' }, { status: 400 });
  }
  if (body.loginGreeting !== undefined && !body.loginGreeting.trim()) {
    return NextResponse.json({ error: "Le message d'accueil ne peut pas être vide." }, { status: 400 });
  }

  const update: Partial<AppSettingsRow> & { updated_at: string; updated_by: string } = {
    updated_at: new Date().toISOString(),
    updated_by: auth.profile.id
  };

  if (body.logoUrl !== undefined) update.logo_url = body.logoUrl?.trim() || null;
  if (body.brandColor !== undefined) update.brand_color = body.brandColor;
  if (body.accentColor !== undefined) update.accent_color = body.accentColor;
  if (body.fontSans !== undefined) update.font_sans = body.fontSans?.trim() || null;
  if (body.fontDisplay !== undefined) update.font_display = body.fontDisplay?.trim() || null;
  if (body.fontHand !== undefined) update.font_hand = body.fontHand?.trim() || null;
  if (body.orgName !== undefined) update.org_name = body.orgName.trim();
  if (body.orgTagline !== undefined) update.org_tagline = body.orgTagline.trim();
  if (body.loginGreeting !== undefined) update.login_greeting = body.loginGreeting.trim();

  const serviceClient = createServerSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from('app_settings')
    .update(update)
    .eq('id', 1)
    .select('logo_url,brand_color,accent_color,font_sans,font_display,font_hand,org_name,org_tagline,login_greeting')
    .single<AppSettingsRow>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ settings: data });
}
