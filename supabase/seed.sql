-- Seed designed to be idempotent.
-- Before running seeds, create Auth users for these emails:
-- admin@pcivile.test, responsable@pcivile.test, benevole@pcivile.test
-- optional: benevole2@pcivile.test, benevole3@pcivile.test

insert into public.profiles (id, full_name, email, role, sector)
select
  u.id,
  case u.email
    when 'admin@pcivile.test' then 'Alice Admin'
    when 'responsable@pcivile.test' then 'Romain Responsable'
    when 'benevole@pcivile.test' then 'Bruno Benevole'
    when 'benevole2@pcivile.test' then 'Bianca Benevole'
    when 'benevole3@pcivile.test' then 'Basile Benevole'
    else split_part(u.email, '@', 1)
  end as full_name,
  u.email,
  case u.email
    when 'admin@pcivile.test' then 'admin'::public.app_role
    when 'responsable@pcivile.test' then 'responsable'::public.app_role
    else 'benevole'::public.app_role
  end as role,
  case u.email
    when 'admin@pcivile.test' then 'National'
    when 'benevole3@pcivile.test' then 'Sud'
    else 'Nord'
  end as sector
from auth.users u
where u.email in (
  'admin@pcivile.test',
  'responsable@pcivile.test',
  'benevole@pcivile.test',
  'benevole2@pcivile.test',
  'benevole3@pcivile.test'
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  email = excluded.email,
  role = excluded.role,
  sector = excluded.sector;

insert into public.skills (name)
values
  ('secourisme'),
  ('logistique'),
  ('conduite'),
  ('radio')
on conflict (name) do nothing;

insert into public.missions (
  title,
  description,
  location,
  sector,
  starts_at,
  ends_at,
  required_volunteers,
  status,
  created_by
)
select
  'Poste de secours - Marathon de Lille',
  'Couverture préventive sur la zone d''arrivée, équipe secourisme légère.',
  'Lille Grand Place',
  'Nord',
  timezone('utc', now()) + interval '2 days',
  timezone('utc', now()) + interval '2 days 6 hours',
  6,
  'proposed'::public.mission_status,
  p.id
from public.profiles p
where p.email = 'responsable@pcivile.test'
and not exists (
  select 1 from public.missions m where m.title = 'Poste de secours - Marathon de Lille'
);

insert into public.missions (
  title,
  description,
  location,
  sector,
  starts_at,
  ends_at,
  required_volunteers,
  status,
  created_by
)
select
  'Renfort logistique - Inondations',
  'Préparation matériel et coordination point de distribution.',
  'Dunkerque',
  'Nord',
  timezone('utc', now()) + interval '5 days',
  timezone('utc', now()) + interval '5 days 8 hours',
  4,
  'closed'::public.mission_status,
  p.id
from public.profiles p
where p.email = 'responsable@pcivile.test'
and not exists (
  select 1 from public.missions m where m.title = 'Renfort logistique - Inondations'
);

insert into public.missions (
  title,
  description,
  location,
  sector,
  starts_at,
  ends_at,
  required_volunteers,
  status,
  created_by
)
select
  'Soutien radio - Exercice départemental',
  'Gestion des communications entre les points de rassemblement.',
  'Montpellier',
  'Sud',
  timezone('utc', now()) + interval '9 days',
  timezone('utc', now()) + interval '9 days 4 hours',
  3,
  'cancelled'::public.mission_status,
  p.id
from public.profiles p
where p.email = 'responsable@pcivile.test'
and not exists (
  select 1 from public.missions m where m.title = 'Soutien radio - Exercice départemental'
);

insert into public.missions (
  title,
  description,
  location,
  sector,
  starts_at,
  ends_at,
  required_volunteers,
  status,
  created_by
)
select
  'Dispositif nuit - Festival communal',
  'Equipe déjà confirmée pour la couverture de nuit.',
  'Roubaix',
  'Nord',
  timezone('utc', now()) + interval '12 days',
  timezone('utc', now()) + interval '12 days 7 hours',
  2,
  'confirmed'::public.mission_status,
  p.id
from public.profiles p
where p.email = 'responsable@pcivile.test'
and not exists (
  select 1 from public.missions m where m.title = 'Dispositif nuit - Festival communal'
);

insert into public.profile_skills (profile_id, skill_id)
select p.id, s.id
from public.profiles p
join public.skills s on s.name in ('secourisme', 'conduite')
where p.email = 'benevole@pcivile.test'
on conflict (profile_id, skill_id) do nothing;

insert into public.profile_skills (profile_id, skill_id)
select p.id, s.id
from public.profiles p
join public.skills s on s.name in ('logistique', 'radio')
where p.email = 'benevole2@pcivile.test'
on conflict (profile_id, skill_id) do nothing;

insert into public.profile_skills (profile_id, skill_id)
select p.id, s.id
from public.profiles p
join public.skills s on s.name in ('secourisme', 'logistique', 'radio')
where p.email = 'benevole3@pcivile.test'
on conflict (profile_id, skill_id) do nothing;

insert into public.mission_required_skills (mission_id, skill_id)
select m.id, s.id
from public.missions m
join public.skills s on s.name in ('secourisme', 'radio')
where m.title = 'Poste de secours - Marathon de Lille'
on conflict (mission_id, skill_id) do nothing;

insert into public.mission_required_skills (mission_id, skill_id)
select m.id, s.id
from public.missions m
join public.skills s on s.name in ('logistique', 'conduite')
where m.title = 'Renfort logistique - Inondations'
on conflict (mission_id, skill_id) do nothing;

insert into public.mission_required_skills (mission_id, skill_id)
select m.id, s.id
from public.missions m
join public.skills s on s.name in ('radio')
where m.title = 'Soutien radio - Exercice départemental'
on conflict (mission_id, skill_id) do nothing;

insert into public.mission_proposals (
  mission_id,
  volunteer_id,
  proposed_by,
  response,
  status
)
select
  m.id,
  v.id,
  r.id,
  case v.email
    when 'benevole@pcivile.test' then 'available'::public.mission_proposal_response
    when 'benevole2@pcivile.test' then 'maybe'::public.mission_proposal_response
    else 'unavailable'::public.mission_proposal_response
  end,
  'accepted'::public.mission_proposal_status
from public.missions m
join public.profiles r on r.email = 'responsable@pcivile.test'
join public.profiles v on v.email in ('benevole@pcivile.test', 'benevole2@pcivile.test', 'benevole3@pcivile.test')
where m.title = 'Poste de secours - Marathon de Lille'
on conflict (mission_id, volunteer_id) do update
set
  response = excluded.response,
  status = excluded.status,
  proposed_by = excluded.proposed_by;

insert into public.mission_proposals (
  mission_id,
  volunteer_id,
  proposed_by,
  response,
  status
)
select
  m.id,
  v.id,
  r.id,
  'no_response'::public.mission_proposal_response,
  'pending'::public.mission_proposal_status
from public.missions m
join public.profiles r on r.email = 'responsable@pcivile.test'
join public.profiles v on v.email = 'benevole2@pcivile.test'
where m.title = 'Dispositif nuit - Festival communal'
on conflict (mission_id, volunteer_id) do nothing;

insert into public.mission_assignments (
  mission_id,
  volunteer_id,
  assignment_status
)
select
  m.id,
  v.id,
  'selected'::public.mission_assignment_status
from public.missions m
join public.profiles v on v.email = 'benevole@pcivile.test'
where m.title = 'Poste de secours - Marathon de Lille'
on conflict (mission_id, volunteer_id) do nothing;

insert into public.mission_assignments (
  mission_id,
  volunteer_id,
  assignment_status
)
select
  m.id,
  v.id,
  'confirmed'::public.mission_assignment_status
from public.missions m
join public.profiles v on v.email = 'benevole3@pcivile.test'
where m.title = 'Dispositif nuit - Festival communal'
on conflict (mission_id, volunteer_id) do update
set assignment_status = excluded.assignment_status;

-- Ensure demo activity logs exist for UI checks even if triggers were not executed in previous environments.
insert into public.activity_logs (mission_id, actor_id, action_type, entity_type, entity_id, description)
select m.id, r.id, 'mission_status_changed', 'mission', m.id, 'Statut modifié : proposed → confirmed.'
from public.missions m
join public.profiles r on r.email = 'responsable@pcivile.test'
where m.title = 'Dispositif nuit - Festival communal'
  and not exists (
    select 1
    from public.activity_logs l
    where l.mission_id = m.id
      and l.action_type = 'mission_status_changed'
      and l.description = 'Statut modifié : proposed → confirmed.'
  );
