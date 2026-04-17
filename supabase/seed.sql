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
  'draft'::public.mission_status,
  p.id
from public.profiles p
where p.email = 'responsable@pcivile.test'
and not exists (
  select 1 from public.missions m where m.title = 'Renfort logistique - Inondations'
);

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
