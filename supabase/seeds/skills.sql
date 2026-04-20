insert into public.skills (label, name)
values
  ('PSC1', 'PSC1'),
  ('PSE1', 'PSE1'),
  ('PSE2', 'PSE2'),
  ('Logistique', 'Logistique'),
  ('Transmission', 'Transmission'),
  ('Conduite', 'Conduite'),
  ('Chef d''équipe', 'Chef d''équipe'),
  ('Régulation', 'Régulation'),
  ('Radio', 'Radio'),
  ('Soutien opérationnel', 'Soutien opérationnel')
on conflict (label) do update
set name = excluded.name;
