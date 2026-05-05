-- Mirror Google Sheet competences referential.
-- Adds status tracking to profile_skills and inserts all missing skills.

-- Add status column to profile_skills (default 'valide' for existing records)
alter table public.profile_skills
  add column if not exists status text not null default 'valide'
  constraint profile_skills_status_check
    check (status in ('valide', 'a_faire', 'interesse', 'exempte'));

-- Add new skills matching the Google Sheet columns.
-- Uses ON CONFLICT to safely re-run and update category if needed.
insert into public.skills (label, name, category)
values
  -- Opérationnel (new sheet skills)
  ('FC PSE',            'FC PSE',            'operationnel'),
  ('ARS',               'ARS',               'operationnel'),
  ('BNSSA',             'BNSSA',             'operationnel'),
  ('SSA',               'SSA',               'operationnel'),
  ('BORD DE TERRAIN',   'BORD DE TERRAIN',   'operationnel'),
  -- ACCSO (new sheet skills)
  ('FC CE2S',           'FC CE2S',           'accso'),
  ('AEP1',              'AEP1',              'accso'),
  ('AEP2',              'AEP2',              'accso'),
  -- Formation (new sheet names alongside legacy ones)
  ('PIC F',             'PIC F',             'formation'),
  ('F PSC',             'F PSC',             'formation'),
  ('F PS',              'F PS',              'formation'),
  ('F F PSC/PS',        'F F PSC/PS',        'formation'),
  ('FC F PSC/PS',       'FC F PSC/PS',       'formation'),
  -- SPS (new category)
  ('OSPS',              'OSPS',              'sps'),
  ('TSPS',              'TSPS',              'sps'),
  ('TRONCONNAGE',       'TRONCONNAGE',       'sps'),
  ('TRAVAIL EN HAUTEUR','TRAVAIL EN HAUTEUR','sps'),
  -- Conduite (new sheet names)
  ('CH VPS',            'CH VPS',            'conduite'),
  ('CH VTP',            'CH VTP',            'conduite'),
  ('CH PL',             'CH PL',             'conduite'),
  -- Compléments (new category)
  ('EPI',               'EPI',               'complements'),
  ('ECG',               'ECG',               'complements'),
  ('Argos / eFIBI',     'Argos / eFIBI',     'complements'),
  ('Radio',             'Radio',             'complements'),
  ('CardioPompe',       'CardioPompe',       'complements'),
  ('PORTAGE',           'PORTAGE',           'complements'),
  -- VSS (new category)
  ('Sensibilisation VSS','Sensibilisation VSS','vss')
on conflict (label) do update set
  name     = excluded.name,
  category = excluded.category;

-- Add new domains to skill_domains for the level-based model (display only, no levels yet)
insert into public.skill_domains (code, name, color, display_order)
values
  ('sps',        'SPS',         'vert',  5),
  ('complements','Compléments', 'rose',  6),
  ('vss',        'VSS',         'rouge', 7)
on conflict (code) do update set
  name          = excluded.name,
  color         = excluded.color,
  display_order = excluded.display_order,
  updated_at    = timezone('utc', now());
