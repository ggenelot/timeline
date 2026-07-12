import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';
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
  base_url: string | null;
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const SETTINGS_COLUMNS =
  'logo_url,brand_color,accent_color,font_sans,font_display,font_hand,org_name,org_tagline,login_greeting,base_url';

// Normalise une URL de base saisie librement : exige http(s), retire le slash final
// pour éviter les `//login` lors de la concaténation `${baseUrl}/login`.
// Renvoie `null` si la chaîne est vide, ou `false` si l'URL est invalide.
function normalizeBaseUrl(value: string): string | null | false {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'settings', 'can_see');
  if (auth.errorResponse) return auth.errorResponse;

  const serviceClient = createServerSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from('app_settings')
    .select(SETTINGS_COLUMNS)
    .eq('id', 1)
    .single<AppSettingsRow>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ settings: data });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission(request, 'settings', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;

  const rawBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // Le body vient d'un client non fiable : on ne fait confiance qu'aux clés
  // dont la valeur a le type attendu avant tout .trim(), sans quoi
  // `{ orgName: null }` ferait planter la route avant la validation métier.
  const nullableFields = ['logoUrl', 'fontSans', 'fontDisplay', 'fontHand', 'baseUrl'] as const;
  const requiredFields = ['brandColor', 'accentColor', 'orgName', 'orgTagline', 'loginGreeting'] as const;

  for (const field of nullableFields) {
    if (rawBody[field] !== undefined && rawBody[field] !== null && typeof rawBody[field] !== 'string') {
      return NextResponse.json({ error: `Champ "${field}" invalide.` }, { status: 400 });
    }
  }
  for (const field of requiredFields) {
    if (rawBody[field] !== undefined && typeof rawBody[field] !== 'string') {
      return NextResponse.json({ error: `Champ "${field}" invalide.` }, { status: 400 });
    }
  }

  const body = rawBody as Partial<Record<(typeof nullableFields)[number], string | null>> &
    Partial<Record<(typeof requiredFields)[number], string>>;

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

  let normalizedBaseUrl: string | null = null;
  if (body.baseUrl !== undefined) {
    const result = normalizeBaseUrl(body.baseUrl ?? '');
    if (result === false) {
      return NextResponse.json(
        { error: "L'URL de l'application est invalide (ex. https://timeline.mon-asso.fr)." },
        { status: 400 }
      );
    }
    normalizedBaseUrl = result;
  }

  const update: Partial<AppSettingsRow> & { updated_at: string; updated_by: string } = {
    updated_at: new Date().toISOString(),
    updated_by: auth.user.id
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
  if (body.baseUrl !== undefined) update.base_url = normalizedBaseUrl;

  const serviceClient = createServerSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from('app_settings')
    .update(update)
    .eq('id', 1)
    .select(SETTINGS_COLUMNS)
    .single<AppSettingsRow>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ settings: data });
}
