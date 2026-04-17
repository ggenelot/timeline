-- Important: create users in Supabase Auth first with these emails:
-- admin@pcivile.test, responsable@pcivile.test, benevole@pcivile.test
-- Suggested password for local demos: DemoPass123!

update public.profiles
set full_name = 'Alice Admin', role = 'admin', sector = 'National'
where email = 'admin@pcivile.test';

update public.profiles
set full_name = 'Romain Responsable', role = 'responsable', sector = 'Nord'
where email = 'responsable@pcivile.test';

update public.profiles
set full_name = 'Bruno Benevole', role = 'benevole', sector = 'Nord'
where email = 'benevole@pcivile.test';

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
  'proposed'::mission_status,
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
  'draft'::mission_status,
  p.id
from public.profiles p
where p.email = 'responsable@pcivile.test'
and not exists (
  select 1 from public.missions m where m.title = 'Renfort logistique - Inondations'
);
