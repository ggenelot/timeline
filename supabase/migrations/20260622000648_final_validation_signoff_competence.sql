-- The backfilled "Validation finale" phase was created without any competence.
-- The volunteer fiche (app/competences/page.tsx) only marks a phase complete when
-- it has at least one validated competence, so those phases stayed stuck at 0/0
-- and could never be completed. Add a single "Avis favorable" sign-off competence
-- to every "Validation finale" phase that has none, turning it into an explicitly
-- validatable final step. Idempotent: skips phases that already have a competence.

insert into public.cursus_competences (phase_id, name, description, garde_only, order_idx)
select p.id, 'Avis favorable', p.sub, false, 0
from public.cursus_phases p
where p.label = 'Validation finale'
  and not exists (
    select 1 from public.cursus_competences c where c.phase_id = p.id
  );
