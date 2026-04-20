-- Add canonical skill labels used by the business referential.
-- Keep migration additive for backward compatibility with existing demo values.
insert into public.skills (name)
values
  ('aide-formateur'),
  ('formateur PSC'),
  ('formateur PS'),
  ('PSC'),
  ('PSE1'),
  ('PSE2'),
  ('CE'),
  ('CP'),
  ('CEPS'),
  ('conducteur VL'),
  ('conducteur CPS'),
  ('3S'),
  ('CE2S')
on conflict (name) do nothing;
