import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseAnonClient, createServerSupabaseServiceClient } from '@/lib/supabase/server';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InviteVolunteerPayload = {
  email?: string;
  resend?: boolean;
};

function getBearerToken(request: NextRequest): string {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.replace('Bearer ', '').trim() : '';
}

async function assertAdmin(token: string) {
  const requesterClient = createServerSupabaseAnonClient(token);
  const { data: userData, error: userError } = await requesterClient.auth.getUser(token);

  if (userError || !userData.user) {
    return { error: NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 }) };
  }

  const { data: requesterProfile, error: requesterProfileError } = await requesterClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (requesterProfileError || !requesterProfile || requesterProfile.role !== 'admin') {
    return {
      error: NextResponse.json({ error: 'Accès refusé : seuls les administrateurs peuvent inviter un bénévole.' }, { status: 403 })
    };
  }

  return { error: null };
}

export async function POST(request: NextRequest, { params }: { params: { volunteerId: string } }) {
  const token = getBearerToken(request);

  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const guard = await assertAdmin(token);
  if (guard.error) {
    return guard.error;
  }

  let payload: InviteVolunteerPayload = {};
  try {
    payload = (await request.json()) as InviteVolunteerPayload;
  } catch {
    payload = {};
  }

  const serviceClient = createServerSupabaseServiceClient();
  const volunteerId = params.volunteerId;

  const { data: volunteer, error: volunteerError } = await serviceClient
    .from('profiles')
    .select('id,auth_user_id,full_name,email,role,invitation_sent_at')
    .eq('id', volunteerId)
    .single();

  if (volunteerError || !volunteer) {
    return NextResponse.json({ error: 'Bénévole introuvable.' }, { status: 404 });
  }

  if (!['benevole', 'responsable'].includes(volunteer.role)) {
    return NextResponse.json({ error: 'Le profil ciblé n’est pas un bénévole invit-able.' }, { status: 400 });
  }

  const providedEmail = payload.email?.trim().toLowerCase() ?? '';
  const email = providedEmail || volunteer.email?.trim().toLowerCase() || '';

  if (!email) {
    return NextResponse.json({ error: 'Email manquant : renseignez un email avant d’envoyer l’invitation.' }, { status: 400 });
  }

  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'Email invalide : veuillez renseigner une adresse valide.' }, { status: 400 });
  }

  if (volunteer.invitation_sent_at && !payload.resend) {
    return NextResponse.json(
      {
        error: 'Une invitation a déjà été envoyée pour ce bénévole. Confirmez un renvoi pour continuer.',
        code: 'INVITATION_ALREADY_SENT'
      },
      { status: 409 }
    );
  }

  if (providedEmail && providedEmail !== (volunteer.email ?? '').toLowerCase()) {
    const { error: updateProfileEmailError } = await serviceClient.from('profiles').update({ email: providedEmail }).eq('id', volunteerId);

    if (updateProfileEmailError) {
      return NextResponse.json(
        {
          error: `Impossible d'enregistrer l'email sur le profil : ${updateProfileEmailError.message}`
        },
        { status: 500 }
      );
    }
  }

  const redirectTo = process.env.NEXT_PUBLIC_SITE_URL ? `${process.env.NEXT_PUBLIC_SITE_URL}/login` : undefined;

  const { error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: volunteer.full_name ?? undefined
    },
    redirectTo
  });

  if (inviteError) {
    const isAlreadyRegistered = inviteError.message.toLowerCase().includes('already');

    if (isAlreadyRegistered) {
      return NextResponse.json(
        {
          error: 'Ce bénévole dispose déjà d’un compte Auth. Utilisez la connexion classique ou un flux de réinitialisation de mot de passe.',
          code: 'ACCOUNT_ALREADY_EXISTS'
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: `Erreur lors de l’envoi de l’invitation : ${inviteError.message}` }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const { error: profileUpdateError } = await serviceClient
    .from('profiles')
    .update({
      email,
      invitation_sent_at: nowIso,
      auth_user_id: volunteer.auth_user_id ?? volunteer.id
    })
    .eq('id', volunteerId);

  if (profileUpdateError) {
    return NextResponse.json({ error: `Invitation envoyée mais profil non synchronisé : ${profileUpdateError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    message: 'Invitation envoyée avec succès.',
    invitation_sent_at: nowIso
  });
}
