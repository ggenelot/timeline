-- Backfill a final-validation phase for existing cursus.
-- The dedicated "final sign-off" card (driven by cursus.signoff_role) was
-- removed in favour of treating the final validation as a normal phase. To
-- preserve that step for cursus that pre-date the change, append a
-- "Validation finale" phase whose description names the approver.
-- Idempotent: skips any cursus that already has a "Validation finale" phase.

insert into public.cursus_phases (cursus_id, kind, label, sub, min_doublures, min_externe, order_idx)
select
  c.id,
  null,
  'Validation finale',
  'Avis favorable du ' || c.signoff_role,
  0,
  0,
  coalesce((select max(p.order_idx) + 1 from public.cursus_phases p where p.cursus_id = c.id), 0)
from public.cursus c
where c.signoff_role is not null
  and c.signoff_role <> ''
  and not exists (
    select 1 from public.cursus_phases p
    where p.cursus_id = c.id and p.label = 'Validation finale'
  );
