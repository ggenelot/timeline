import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { DEFAULT_TEMPLATES } from '@/lib/slack/templates';

const TEMPLATE_TYPES = [
  'mission_channel_welcome',
  'admin_availability_updated_dm',
  'volunteer_rejected_dm',
  'mission_confirmed_dm',
  'mission_cancelled_dm',
  'admin_role_updated_dm'
];

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'settings', 'can_see');
  if (auth.errorResponse) return auth.errorResponse;

  const serviceClient = createServerSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from('slack_message_templates')
    .select('type,label,description,template,available_variables,updated_at')
    .in('type', TEMPLATE_TYPES)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const found = new Set((data ?? []).map((t: { type: string }) => t.type));
  const missing = TEMPLATE_TYPES.filter((t) => !found.has(t)).map((type) => ({
    type,
    label: type,
    description: null,
    template: DEFAULT_TEMPLATES[type] ?? '',
    available_variables: [],
    updated_at: null
  }));

  return NextResponse.json({ templates: [...(data ?? []), ...missing] });
}
