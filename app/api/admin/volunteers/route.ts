import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseAnonClient, createServerSupabaseServiceClient } from '@/lib/supabase/server';

type CreateVolunteerPayload = {
  firstName?: string;
  lastName?: string;
  identifier?: string;
  phone?: string;
  role?: 'benevole';
};

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.replace('Bearer ', '').trim() : '';

  if (!token) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  let payload: CreateVolunteerPayload;

  try {
    payload = (await request.json()) as CreateVolunteerPayload;
  } catch {
    return NextResponse.json({ error: 'Le corps de la requête est invalide.' }, { status: 400 });
  }

  const firstName = payload.firstName?.trim() ?? '';
  const lastName = payload.lastName?.trim() ?? '';
  const identifier = payload.identifier?.trim().toLowerCase() ?? '';
  const phone = payload.phone?.trim() ?? '';

  if (!firstName) {
    return NextResponse.json({ error: 'Le prénom est obligatoire.' }, { status: 400 });
  }

  if (!lastName) {
    return NextResponse.json({ error: 'Le nom est obligatoire.' }, { status: 400 });
  }

  if (!identifier) {
    return NextResponse.json({ error: 'Un identifiant est obligatoire.' }, { status: 400 });
  }

  const requesterClient = createServerSupabaseAnonClient(token);
  const { data: userData, error: userError } = await requesterClient.auth.getUser(token);

  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Session invalide. Veuillez vous reconnecter.' }, { status: 401 });
  }

  const { data: requesterProfile, error: requesterProfileError } = await requesterClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (requesterProfileError || !requesterProfile) {
    return NextResponse.json({ error: 'Impossible de vérifier vos droits.' }, { status: 403 });
  }

  if (requesterProfile.role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé : seuls les administrateurs peuvent créer un bénévole.' }, { status: 403 });
  }

  const serviceClient = createServerSupabaseServiceClient();
  const fullName = `${firstName} ${lastName}`.trim();
  const temporaryPassword = `Tmp-${crypto.randomUUID()}-aA1!`;
  const authEmail = `${identifier}@timeline.local`;

  const { data: createdUserData, error: createUserError } = await serviceClient.auth.admin.createUser({
    email: authEmail,
    email_confirm: true,
    password: temporaryPassword,
    user_metadata: {
      full_name: fullName,
      phone
    }
  });

  if (createUserError || !createdUserData.user) {
    const genericError = 'Impossible de créer le compte utilisateur.';
    const isDuplicateError = createUserError?.message?.toLowerCase().includes('already');
    return NextResponse.json(
      {
        error: isDuplicateError ? 'Un utilisateur avec cet identifiant existe déjà.' : createUserError?.message ?? genericError
      },
      { status: 400 }
    );
  }

  const { error: profileUpsertError } = await serviceClient.from('profiles').upsert(
    {
      id: createdUserData.user.id,
      full_name: fullName,
      email: authEmail,
      identifier,
      phone: phone || null,
      role: 'benevole'
    },
    { onConflict: 'id' }
  );

  if (profileUpsertError) {
    return NextResponse.json(
      {
        error: `Compte créé mais profil incomplet : ${profileUpsertError.message}`
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: 'Bénévole créé avec succès.',
    volunteer: {
      id: createdUserData.user.id,
      firstName,
      lastName,
      email: authEmail,
      identifier,
      phone,
      role: 'benevole'
    }
  });
}
