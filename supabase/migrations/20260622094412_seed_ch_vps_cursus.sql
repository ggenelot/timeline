-- Seed the "CH VPS" (Conducteur VPS / chauffeur) cursus from the official
-- "Cahier conducteur VPS – Plateau technique" and "– Doublure en antenne"
-- (Version 10-22). The plateau technique precedes the doublures.

do $$
declare
  v_skill_id  uuid;
  v_cursus_id uuid;
  v_plateau   uuid;
  v_doublure  uuid;
  v_final     uuid;
begin
  -- Non-destructive: if a CH VPS cursus already exists (possibly with enrolled
  -- volunteers, doublures and validated competences), leave it untouched rather
  -- than deleting it — a cascade delete would wipe that user progress.
  if exists (select 1 from public.cursus where code = 'CH VPS') then
    return;
  end if;

  -- Associated competence "du même nom": reuse the existing "CH VPS" skill,
  -- creating it under the Conduite category if it is missing.
  select id into v_skill_id from public.skills where name = 'CH VPS' limit 1;
  if v_skill_id is null then
    insert into public.skills (name, category_id)
    values ('CH VPS', (select id from public.skill_categories where name = 'Conduite' limit 1))
    returning id into v_skill_id;
  end if;

  insert into public.cursus (code, name, category, level, skill_id, signoff_role)
  values ('CH VPS', 'CH VPS', 'Conduite', null, v_skill_id, 'Président-Délégué')
  returning id into v_cursus_id;

  -- Phase 1 — Plateau technique (avant les doublures)
  insert into public.cursus_phases
    (cursus_id, kind, label, sub, provisional, min_doublures, min_externe, order_idx)
  values
    (v_cursus_id, 'pre', 'Plateau technique',
     'Évaluation des ateliers de conduite. À valider avant de commencer les doublures.',
     false, 0, 0, 0)
  returning id into v_plateau;

  insert into public.cursus_competences (phase_id, name, description, garde_only, order_idx) values
    (v_plateau, 'Réactivation mémoire', 'Vérifier que la formation « Théorie et réglementation » a été suivie et comprise (≥ 10/20 au test).', false, 0),
    (v_plateau, 'Atelier 1 — Stationnement du véhicule', 'Stationner en marche arrière seul en prenant en compte le gabarit et l''environnement (avec rétroviseur), sans toucher les cônes.', false, 1),
    (v_plateau, 'Atelier 2 — Guidage et manœuvre', 'Guider et être guidé dans une manœuvre (sans rétroviseur), sans toucher les cônes.', false, 2),
    (v_plateau, 'Atelier 3 — Slalom en marche avant et arrière', 'Slalom sur 8 cônes espacés de 8 m, en marche avant puis arrière, sans toucher les cônes (max 2 essais en avant, 3 en arrière).', false, 3),
    (v_plateau, 'Atelier 4 — Freinage précis et remontée de file', 'Remontée de file à 50 km/h entre deux rangées de cônes puis freinage précis 50 m plus loin, sans toucher les cônes ni bloquer les roues (max 3 essais).', false, 4);

  -- Phase 2 — Doublures en antenne
  insert into public.cursus_phases
    (cursus_id, kind, label, sub, provisional, min_doublures, min_externe, order_idx)
  values
    (v_cursus_id, 'post', 'Doublures en antenne',
     'Minimum 3 doublures avec un conducteur VPS différent à chaque fois ; le doubleur valide 1 à 2 compétences par doublure.',
     false, 3, 0, 1)
  returning id into v_doublure;

  insert into public.cursus_competences (phase_id, name, description, garde_only, order_idx) values
    (v_doublure, 'Prise en main du véhicule', 'Gabarit du véhicule, guidage, connaissance administrative, commandes principales, commandes sons et lumières, gestion de la cellule sanitaire, carnet de bord, contrôle de l''opérationnalité du VPS.', false, 0),
    (v_doublure, 'Conduite normale du VPS', 'Maîtrise accélération / freinage, utilisation des rapports, positionnement sur la chaussée.', false, 1),
    (v_doublure, 'Conduite en urgence du VPS', 'Maîtrise accélération / freinage, positionnement sur la chaussée, utilisation des signaux d''urgence, anticipation, gestion du stress.', false, 2),
    (v_doublure, 'Gestion du véhicule sur interventions', 'Stationnement et balisage, connaissance du matériel, maniement du brancard.', false, 3),
    (v_doublure, 'Conduite en évacuation', 'Respect des consignes, positionnement, anticipation, souplesse de la conduite.', false, 4);

  -- Phase 3 — Validation finale.
  -- The volunteer fiche only marks a phase complete when it has at least one
  -- validated competence, so the final phase carries an explicit sign-off one.
  insert into public.cursus_phases
    (cursus_id, kind, label, sub, provisional, min_doublures, min_externe, order_idx)
  values
    (v_cursus_id, null, 'Validation finale', 'Avis favorable du Président-Délégué.', false, 0, 0, 2)
  returning id into v_final;

  insert into public.cursus_competences (phase_id, name, description, garde_only, order_idx)
  values (v_final, 'Avis favorable', 'Avis favorable du Président-Délégué.', false, 0);

  -- Règles du cursus (Cahier doublure en antenne)
  insert into public.cursus_rules (cursus_id, text, auto, order_idx) values
    (v_cursus_id, 'Un minimum de 3 doublures est requis avant la validation dans le rôle de conducteur VPS.', true, 0),
    (v_cursus_id, 'Les doublures ne peuvent commencer qu''après avoir été validé au plateau technique (ou après conduite en antenne).', false, 1),
    (v_cursus_id, 'La première doublure ne comporte que la prise en main du véhicule et les évacuations en milieu hospitalier.', false, 2),
    (v_cursus_id, 'Les 3 doublures doivent être réalisées avec un conducteur VPS différent à chaque fois.', false, 3),
    (v_cursus_id, 'Un conducteur VPS à jour de son permis blanc et autorisé d''après eProtec doit être présent comme doubleur ; il remplit le cahier et évalue le stagiaire.', false, 4),
    (v_cursus_id, 'Le doubleur signe 1 à 2 compétences par doublure s''il les estime atteintes.', false, 5),
    (v_cursus_id, 'À partir de la 3e évaluation seulement, un CEPS également conducteur VPS peut évaluer le stagiaire (autorisation du Président délégué requise).', false, 6),
    (v_cursus_id, 'Aucune obligation de réaliser une doublure en antenne extérieure : toutes peuvent être dans l''antenne de rattachement.', false, 7),
    (v_cursus_id, 'Le cahier complet doit être envoyé à eprotec@protectioncivile.org une fois rempli.', false, 8);
end $$;
