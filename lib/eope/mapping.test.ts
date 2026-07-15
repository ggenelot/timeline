import {
  computeCommitmentDiff,
  eopeEventToMissionFields,
  mapEopeTypeToMissionTypeId,
  shouldCancelMission
} from '@/lib/eope/mapping';
import {
  parseEopeCommitmentResponse,
  parseEopeDateToUtcIso,
  parseEopeEvents
} from '@/lib/eope/types';
import { MISSION_TYPE_SLUG_TO_ID } from '@/lib/types';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(`[eope.mapping.test] ${message}`);
  }
}

export function runEopeMappingTests() {
  // ── Parsing défensif des événements ────────────────────────────────────
  const eventsPayload = {
    data: [
      {
        id: 42,
        title: 'DPS Semi-marathon',
        start_at: '2026-09-12T08:00:00+02:00',
        end_at: '2026-09-12T14:30:00+02:00',
        location: 'Paris 8e',
        status: 'published',
        type: { name: 'Poste de secours' }
      },
      {
        uuid: 'evt-2',
        name: 'Maraude sociale',
        start: '2026-09-14 20:00',
        end: '2026-09-15 00:30',
        cancelled: true
      },
      { title: 'Sans identifiant', start: '2026-09-14 20:00', end: '2026-09-15 00:30' },
      'pas un objet'
    ]
  };

  const { events, issues } = parseEopeEvents(eventsPayload);
  assert(events.length === 2, `2 événements exploitables attendus (obtenu : ${events.length}).`);
  assert(issues.length === 2, `2 issues attendues pour les éléments inexploitables (obtenu : ${issues.length}).`);

  const [first, second] = events;
  assert(first.id === '42', 'Un id numérique doit être normalisé en chaîne.');
  assert(first.starts_at === '2026-09-12T06:00:00.000Z', `Un ISO avec fuseau doit être converti en UTC (obtenu : ${first.starts_at}).`);
  assert(first.type_label === 'Poste de secours', 'Le libellé de type imbriqué doit être extrait.');
  assert(!first.cancelled, 'Un statut "published" ne doit pas être lu comme annulé.');

  assert(second.id === 'evt-2', "L'id doit accepter le champ uuid.");
  // 20h heure de Paris le 14/09/2026 (été, UTC+2) = 18h UTC.
  assert(second.starts_at === '2026-09-14T18:00:00.000Z', `Un datetime naïf doit être lu comme heure de Paris (obtenu : ${second.starts_at}).`);
  assert(second.cancelled, 'Le booléen cancelled doit être détecté.');

  const garbage = parseEopeEvents({ foo: 'bar' });
  assert(garbage.events.length === 0 && garbage.issues.length === 1, 'Une réponse sans liste doit remonter une issue globale.');

  // ── Dates ──────────────────────────────────────────────────────────────
  assert(parseEopeDateToUtcIso('2026-01-15T10:00:00Z') === '2026-01-15T10:00:00.000Z', 'Un ISO UTC doit rester UTC.');
  // 10h heure de Paris en janvier (hiver, UTC+1) = 9h UTC.
  assert(parseEopeDateToUtcIso('2026-01-15T10:00:00') === '2026-01-15T09:00:00.000Z', 'Un naïf hivernal doit être décalé de -1 h.');
  assert(parseEopeDateToUtcIso('pas une date') === null, 'Une chaîne invalide doit renvoyer null.');
  assert(parseEopeDateToUtcIso(12345) === null, 'Une valeur non-chaîne doit renvoyer null.');

  // ── Mapping événement → mission ────────────────────────────────────────
  const fields = eopeEventToMissionFields(first);
  assert(fields.title === 'DPS Semi-marathon' && fields.location === 'Paris 8e', 'Les champs autoritaires doivent être repris tels quels.');

  assert(
    mapEopeTypeToMissionTypeId('DPS course à pied') === MISSION_TYPE_SLUG_TO_ID['poste_de_secours'],
    'Un libellé DPS doit être rattaché à poste_de_secours.'
  );
  assert(mapEopeTypeToMissionTypeId('Maraude') === MISSION_TYPE_SLUG_TO_ID['maraude'], 'Maraude doit être reconnue.');
  assert(mapEopeTypeToMissionTypeId('Formation PSE1') === MISSION_TYPE_SLUG_TO_ID['formation'], 'Formation doit être reconnue.');
  assert(mapEopeTypeToMissionTypeId(null) === MISSION_TYPE_SLUG_TO_ID['poste_de_secours'], 'Sans libellé, repli sur poste_de_secours.');

  // ── Annulation ─────────────────────────────────────────────────────────
  assert(shouldCancelMission(second, 'proposed'), 'Un événement annulé doit annuler une mission proposée.');
  assert(!shouldCancelMission(second, 'closed'), 'Une mission close ne doit pas être annulée.');
  assert(!shouldCancelMission(second, 'cancelled'), 'Une mission déjà annulée ne doit pas être ré-annulée.');
  assert(!shouldCancelMission(first, 'proposed'), 'Un événement actif ne doit rien annuler.');

  // ── Diff de réconciliation du push ─────────────────────────────────────
  const desired = [
    { mission_id: 'm1', volunteer_id: 'v1', eope_event_id: 'e1', eope_user_id: 'u1', full_name: 'Alice' },
    { mission_id: 'm1', volunteer_id: 'v2', eope_event_id: 'e1', eope_user_id: null, full_name: 'Bob' },
    { mission_id: 'm2', volunteer_id: 'v3', eope_event_id: 'e2', eope_user_id: 'u3', full_name: 'Chris' }
  ];
  const recorded = [
    { mission_id: 'm2', volunteer_id: 'v3', eope_commitment_id: 'c3', eope_event_id: 'e2', eope_user_id: 'u3' },
    { mission_id: 'm2', volunteer_id: 'v9', eope_commitment_id: 'c9', eope_event_id: 'e2', eope_user_id: 'u9' }
  ];

  const diff = computeCommitmentDiff(desired, recorded);
  assert(diff.toCreate.length === 1 && diff.toCreate[0].volunteer_id === 'v1', 'v1 (lié, non enregistré) doit être créé.');
  assert(diff.toDelete.length === 1 && diff.toDelete[0].eope_commitment_id === 'c9', 'c9 (enregistré, plus désiré) doit être supprimé.');
  assert(diff.unchanged.length === 1 && diff.unchanged[0].volunteer_id === 'v3', 'v3 doit rester inchangé.');
  assert(diff.skippedUnlinked.length === 1 && diff.skippedUnlinked[0].volunteer_id === 'v2', 'v2 (non lié) doit être signalé.');

  // Un profil délié dont le commitment est enregistré doit être supprimé côté
  // eOPE (il sort du désiré) : cohérence de la réconciliation.
  const diff2 = computeCommitmentDiff(
    [{ mission_id: 'm2', volunteer_id: 'v3', eope_event_id: 'e2', eope_user_id: null, full_name: 'Chris' }],
    recorded
  );
  assert(diff2.toDelete.length === 2, 'Un profil délié doit voir son engagement distant supprimé.');

  // Liaison distante modifiée après coup (bénévole relié à un autre compte
  // eOPE, ou mission reliée à un autre événement) : supprimer puis recréer.
  const diff3 = computeCommitmentDiff(
    [{ mission_id: 'm2', volunteer_id: 'v3', eope_event_id: 'e2', eope_user_id: 'u3bis', full_name: 'Chris' }],
    [{ mission_id: 'm2', volunteer_id: 'v3', eope_commitment_id: 'c3', eope_event_id: 'e2', eope_user_id: 'u3' }]
  );
  assert(
    diff3.toDelete.length === 1 && diff3.toCreate.length === 1 && diff3.unchanged.length === 0,
    'Un changement de compte eOPE lié doit provoquer une recréation (delete + create).'
  );

  const diff4 = computeCommitmentDiff(
    [{ mission_id: 'm2', volunteer_id: 'v3', eope_event_id: 'e2bis', eope_user_id: 'u3', full_name: 'Chris' }],
    [{ mission_id: 'm2', volunteer_id: 'v3', eope_commitment_id: 'c3', eope_event_id: 'e2', eope_user_id: 'u3' }]
  );
  assert(diff4.toDelete.length === 1 && diff4.toCreate.length === 1, "Un changement d'événement lié doit provoquer une recréation.");

  // Ligne enregistrée sans eope_user_id (antérieure à sa mémorisation) :
  // considérée comme correspondante, pas de recréation intempestive.
  const diff5 = computeCommitmentDiff(
    [{ mission_id: 'm2', volunteer_id: 'v3', eope_event_id: 'e2', eope_user_id: 'u3', full_name: 'Chris' }],
    [{ mission_id: 'm2', volunteer_id: 'v3', eope_commitment_id: 'c3', eope_event_id: 'e2', eope_user_id: null }]
  );
  assert(diff5.unchanged.length === 1 && diff5.toCreate.length === 0, 'Un lien sans user_id mémorisé reste inchangé.');

  // ── Réponse de création d'engagement ───────────────────────────────────
  assert(parseEopeCommitmentResponse({ id: 'c1', event_id: 'e1', user_id: 'u1' })?.id === 'c1', 'Réponse plate acceptée.');
  assert(parseEopeCommitmentResponse({ data: { id: 'c2', event: { id: 'e1' }, user: { id: 'u1' } } })?.event_id === 'e1', 'Réponse enveloppée + refs imbriquées acceptées.');
  assert(parseEopeCommitmentResponse('nope') === null, 'Réponse inexploitable → null.');

  return true;
}
