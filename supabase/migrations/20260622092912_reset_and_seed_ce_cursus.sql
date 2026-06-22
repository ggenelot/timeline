-- Reset every cursus and (re)seed the CE (Chef d'Équipe) cursus from the
-- official "Fiche d'auto-évaluation CE" (V2.1, 11/24) and
-- "Fiche doublure post-CE" (V3.0, 01/25).

-- 1. Wipe existing cursus data (explicit order; FKs also cascade).
delete from public.competence_validations;
delete from public.doublures;
delete from public.volunteer_cursus;
delete from public.cursus_rules;
delete from public.cursus_competences;
delete from public.cursus_phases;
delete from public.cursus;

do $$
declare
  v_skill_id  uuid;
  v_cursus_id uuid;
  v_pre       uuid;
  v_post      uuid;
  v_final     uuid;
begin
  -- 2. Associated competence "du même nom": reuse the existing "CE" skill,
  --    creating it under the Opérationnel category if it is missing.
  select id into v_skill_id from public.skills where name = 'CE' limit 1;
  if v_skill_id is null then
    insert into public.skills (name, category_id)
    values ('CE', (select id from public.skill_categories where name = 'Opérationnel' limit 1))
    returning id into v_skill_id;
  end if;

  -- 3. Cursus CE
  insert into public.cursus (code, name, category, level, skill_id, signoff_role)
  values ('CE', 'CE', 'Opérationnel', 4, v_skill_id, 'Président-Délégué')
  returning id into v_cursus_id;

  -- 4a. Phase pré-formation : auto-évaluation (Fiche d'auto-évaluation CE)
  insert into public.cursus_phases
    (cursus_id, kind, label, sub, provisional, min_doublures, min_externe, order_idx)
  values
    (v_cursus_id, 'pre', 'Auto-évaluation',
     'À compléter avant la formation CE : connaître les indications et savoir réaliser les gestes attendus.',
     false, 0, 0, 0)
  returning id into v_pre;

  insert into public.cursus_competences (phase_id, name, description, garde_only, order_idx) values
    (v_pre, 'Utiliser et remplir correctement Argos et eFiBi', null, false, 0),
    (v_pre, 'Utiliser une cardio-pompe', null, false, 1),
    (v_pre, 'Réaliser un ECG', null, false, 2),
    (v_pre, 'Mettre en PLS une victime traumatisée ou non', null, false, 3),
    (v_pre, 'Réaliser l''immobilisation d''un membre supérieur et inférieur au moyen d''une attelle à dépression', null, false, 4),
    (v_pre, 'Prendre en charge en équipe une victime en arrêt cardio-respiratoire', null, false, 5),
    (v_pre, 'Calculer le score de Glasgow', null, false, 6),
    (v_pre, 'Réaliser une immobilisation à l''aide d''une ACT', null, false, 7),
    (v_pre, 'Réaliser une immobilisation à l''aide d''un MID', null, false, 8),
    (v_pre, 'Réaliser l''immobilisation à l''aide d''un plan dur (victime debout, allongée sur le ventre ou sur le dos)', null, false, 9),
    (v_pre, 'Réaliser un bilan et sa transmission', null, false, 10),
    (v_pre, 'Avoir assisté à au moins une transmission à l''IOA', null, false, 11);

  -- 4b. Phase post-formation : doublures opérationnelles (Fiche doublure post-CE)
  insert into public.cursus_phases
    (cursus_id, kind, label, sub, provisional, min_doublures, min_externe, order_idx)
  values
    (v_cursus_id, 'post', 'Doublures post-CE',
     'Doublures opérationnelles : compétences évaluées et validées par un CE ou un CEPS (4 max par doublure).',
     false, 2, 1, 1)
  returning id into v_post;

  insert into public.cursus_competences (phase_id, name, description, garde_only, order_idx) values
    (v_post, 'Esprit Protec''', 'Bienveillance, humilité, engagement, compétence.', false, 0),
    (v_post, 'Maîtrise de la transmission du bilan à l''IOA', 'Transmettre le bilan à l''Infirmier Organisateur de l''Accueil.', false, 1),
    (v_post, 'Positionnement adapté au rôle de CE', 'Respect des consignes, compte rendu, professionnalisme, prise de recul.', false, 2),
    (v_post, 'Maîtrise de l''évacuation d''une victime', 'Conditionnement de la victime, topographie et messages radios.', false, 3),
    (v_post, 'Gestes conformes aux recommandations Premiers Secours et fiches réflexes PCPS', 'Conformité aux recommandations Premiers Secours et aux fiches réflexes PCPS. Validable uniquement en garde (BSPP / SAMU).', true, 4),
    (v_post, 'Gestion de l''équipe cellule arrière', 'Communication, donne des ordres, capacité d''écoute, contrôle des gestes et techniques réalisées. Validable uniquement en garde.', true, 5),
    (v_post, 'Maîtrise des bilans et bilans spécifiques', 'Exhaustivité et rigueur. Validable uniquement en garde.', true, 6);

  -- 4c. Validation finale (avis du Président-Délégué).
  -- The volunteer fiche only marks a phase complete when it has at least one
  -- validated competence, so the final phase needs an explicit "Avis favorable"
  -- sign-off competence (mirrors 20260622000648_final_validation_signoff_competence).
  insert into public.cursus_phases
    (cursus_id, kind, label, sub, provisional, min_doublures, min_externe, order_idx)
  values
    (v_cursus_id, null, 'Validation finale', 'Avis favorable du Président-Délégué.', false, 0, 0, 2)
  returning id into v_final;

  insert into public.cursus_competences (phase_id, name, description, garde_only, order_idx)
  values (v_final, 'Avis favorable', 'Avis favorable du Président-Délégué.', false, 0);

  -- 5. Règles du cursus
  insert into public.cursus_rules (cursus_id, text, auto, order_idx) values
    (v_cursus_id, 'Une des doublures doit être effectuée dans une antenne extérieure à l''antenne d''appartenance du stagiaire.', true, 0),
    (v_cursus_id, 'Les 3 dernières compétences ne sont validables qu''en garde (BSPP / SAMU).', true, 1),
    (v_cursus_id, 'Au maximum 4 compétences peuvent être validées par doublure.', false, 2),
    (v_cursus_id, 'Toutes les compétences ne peuvent pas être signées par la même personne.', false, 3),
    (v_cursus_id, 'Doublures réalisées en responsable d''un vecteur d''évacuation sous l''autorité d''un CE (mission D), ou en prompt-secours BSPP / SAMU sous la responsabilité d''un CEPS (mission A).', false, 4),
    (v_cursus_id, 'Il est recommandé de réaliser une doublure en vecteur d''évacuation, sans obligation.', false, 5),
    (v_cursus_id, 'La fiche doublure complétée doit être envoyée à eprotec@protectioncivile.org une fois remplie.', false, 6);
end $$;
