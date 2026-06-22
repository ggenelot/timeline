-- One-time data migration: move the legacy profiles.role = 'responsable'
-- authorization shortcut into the dynamic roles system. Idempotent, purely
-- additive, touches no RLS policy. Every existing 'responsable' account
-- keeps working via the enum during this step and simultaneously gains the
-- equivalent dynamic right, so there is no window of reduced access before
-- the next migration retires the enum check from RLS.

insert into public.roles (id, name, description, is_default)
select gen_random_uuid(), 'Responsable',
       'Rôle hérité : droits de gestion sur les missions créées et gestion complète du cursus '
       '(équivalent à l''ancien profiles.role = responsable).',
       false
where not exists (select 1 from public.roles where name = 'Responsable');

insert into public.profile_roles (profile_id, role_id)
select p.id, r.id
from public.profiles p
join public.roles r on r.name = 'Responsable'
where p.role = 'responsable'
on conflict (profile_id, role_id) do nothing;

insert into public.role_behaviors (role_id, behavior_type, resource_type, mission_type_ids, mission_statuses)
select r.id, 'can_manage', 'mission', '{}', '{}'
from public.roles r
where r.name = 'Responsable'
  and not exists (
    select 1 from public.role_behaviors rb
    where rb.role_id = r.id and rb.behavior_type = 'can_manage' and rb.resource_type = 'mission'
  );

insert into public.role_behaviors (role_id, behavior_type, resource_type, mission_type_ids, mission_statuses)
select r.id, 'can_manage', 'cursus', '{}', '{}'
from public.roles r
where r.name = 'Responsable'
  and not exists (
    select 1 from public.role_behaviors rb
    where rb.role_id = r.id and rb.behavior_type = 'can_manage' and rb.resource_type = 'cursus'
  );

comment on column public.profiles.role is
  'app_role enum. ''admin'' reste un bypass superuser inconditionnel, vérifié directement dans les policies RLS. '
  '''responsable'' est DÉPRÉCIÉ pour l''autorisation depuis 2026-06-22 : les droits passent désormais par le système '
  'dynamique (public.roles / public.profile_roles / public.role_behaviors, rôle "Responsable"). La valeur enum est '
  'conservée car Postgres ne permet pas de la retirer facilement ; ne plus s''appuyer sur elle dans de nouvelles policies.';
