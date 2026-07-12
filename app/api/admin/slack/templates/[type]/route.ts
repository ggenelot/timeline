import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { DEFAULT_TEMPLATES } from '@/lib/slack/templates';

async function requireTemplateRow(serviceClient: ReturnType<typeof createServerSupabaseServiceClient>, type: string) {
  const { data } = await serviceClient.from('slack_message_templates').select('id').eq('type', type).maybeSingle();
  return data;
}

export async function PUT(request: NextRequest, { params }: { params: { type: string } }) {
  const auth = await requirePermission(request, 'settings', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;

  const { type } = params;
  if (!(type in DEFAULT_TEMPLATES)) {
    return NextResponse.json({ error: 'Type de template inconnu.' }, { status: 400 });
  }

  const payload = (await request.json().catch(() => ({}))) as { template?: string };
  const template = payload.template;
  if (typeof template !== 'string' || template.trim() === '') {
    return NextResponse.json({ error: 'Le template ne peut pas être vide.' }, { status: 400 });
  }

  const serviceClient = createServerSupabaseServiceClient();

  const existing = await requireTemplateRow(serviceClient, type);
  if (!existing) {
    return NextResponse.json({ error: 'Template introuvable en base. La migration a-t-elle été appliquée ?' }, { status: 404 });
  }

  const { error } = await serviceClient
    .from('slack_message_templates')
    .update({ template: template.trim(), updated_by: auth.user.id, updated_at: new Date().toISOString() })
    .eq('type', type);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: { type: string } }) {
  const auth = await requirePermission(request, 'settings', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;

  const { type } = params;
  if (!(type in DEFAULT_TEMPLATES)) {
    return NextResponse.json({ error: 'Type de template inconnu.' }, { status: 400 });
  }

  const serviceClient = createServerSupabaseServiceClient();

  const existing = await requireTemplateRow(serviceClient, type);
  if (!existing) {
    return NextResponse.json({ error: 'Template introuvable en base. La migration a-t-elle été appliquée ?' }, { status: 404 });
  }

  const defaultTemplate = DEFAULT_TEMPLATES[type];
  const { error } = await serviceClient
    .from('slack_message_templates')
    .update({ template: defaultTemplate, updated_by: auth.user.id, updated_at: new Date().toISOString() })
    .eq('type', type);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, template: defaultTemplate });
}
