-- ============================================================
-- Système de cursus de doublure
-- ============================================================

-- Configuration d'un cursus (CE, CP, CEPS…)
create table if not exists public.cursus (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  category       text,
  level          int,
  skill_id       uuid references public.skills(id) on delete set null,
  formation_label      text,
  formation_required   boolean not null default true,
  signoff_role         text not null default 'Président-Délégué',
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.cursus enable row level security;

create policy "cursus_read_auth"
  on public.cursus for select to authenticated using (true);

create policy "cursus_write_admin"
  on public.cursus for all to authenticated
  using  ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

-- Règles textuelles d'un cursus
create table if not exists public.cursus_rules (
  id         uuid primary key default gen_random_uuid(),
  cursus_id  uuid not null references public.cursus(id) on delete cascade,
  text       text not null,
  auto       boolean not null default false,
  order_idx  int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.cursus_rules enable row level security;

create policy "cursus_rules_read_auth"
  on public.cursus_rules for select to authenticated using (true);

create policy "cursus_rules_write_admin"
  on public.cursus_rules for all to authenticated
  using  ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

-- Phases d'un cursus (pré-doublure et post-doublure)
create table if not exists public.cursus_phases (
  id                uuid primary key default gen_random_uuid(),
  cursus_id         uuid not null references public.cursus(id) on delete cascade,
  kind              text not null check (kind in ('pre', 'post')),
  label             text not null,
  sub               text,
  provisional       boolean not null default false,
  min_doublures     int not null default 1,
  require_externe   boolean not null default false,
  order_idx         int not null default 0,
  created_at        timestamptz not null default now()
);

alter table public.cursus_phases enable row level security;

create policy "cursus_phases_read_auth"
  on public.cursus_phases for select to authenticated using (true);

create policy "cursus_phases_write_admin"
  on public.cursus_phases for all to authenticated
  using  ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

-- Compétences à valider dans une phase
create table if not exists public.cursus_competences (
  id          uuid primary key default gen_random_uuid(),
  phase_id    uuid not null references public.cursus_phases(id) on delete cascade,
  name        text not null,
  description text,
  garde_only  boolean not null default false,
  order_idx   int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.cursus_competences enable row level security;

create policy "cursus_comp_read_auth"
  on public.cursus_competences for select to authenticated using (true);

create policy "cursus_comp_write_admin"
  on public.cursus_competences for all to authenticated
  using  ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

-- Inscription d'un bénévole à un cursus
create table if not exists public.volunteer_cursus (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  cursus_id    uuid not null references public.cursus(id) on delete cascade,
  enrolled_at  timestamptz not null default now(),
  completed_at timestamptz,
  unique (profile_id, cursus_id)
);

alter table public.volunteer_cursus enable row level security;

create policy "vc_read"
  on public.volunteer_cursus for select to authenticated
  using (
    profile_id = auth.uid()
    or (select role from public.profiles where id = auth.uid()) in ('admin', 'responsable')
  );

create policy "vc_insert"
  on public.volunteer_cursus for insert to authenticated
  with check (
    profile_id = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
  );

create policy "vc_admin_all"
  on public.volunteer_cursus for all to authenticated
  using  ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

-- Sessions de doublure
create table if not exists public.doublures (
  id                   uuid primary key default gen_random_uuid(),
  volunteer_cursus_id  uuid not null references public.volunteer_cursus(id) on delete cascade,
  phase_id             uuid not null references public.cursus_phases(id),
  mission_id           uuid references public.missions(id) on delete set null,
  event_name           text,
  event_date           date,
  event_lieu           text,
  is_external          boolean not null default false,
  supervisor_id        uuid references public.profiles(id) on delete set null,
  supervisor_name      text,
  supervisor_antenne   text,
  message              text,
  is_pending           boolean not null default false,
  declared_by          uuid not null references public.profiles(id),
  created_at           timestamptz not null default now()
);

alter table public.doublures enable row level security;

create policy "doublures_read"
  on public.doublures for select to authenticated
  using (
    declared_by = auth.uid()
    or exists (
      select 1 from public.volunteer_cursus vc
      where vc.id = volunteer_cursus_id and vc.profile_id = auth.uid()
    )
    or (select role from public.profiles where id = auth.uid()) in ('admin', 'responsable')
  );

create policy "doublures_insert"
  on public.doublures for insert to authenticated
  with check (
    declared_by = auth.uid()
    or (select role from public.profiles where id = auth.uid()) in ('admin', 'responsable')
  );

create policy "doublures_update"
  on public.doublures for update to authenticated
  using (
    declared_by = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
  )
  with check (
    declared_by = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
  );

create policy "doublures_delete"
  on public.doublures for delete to authenticated
  using (
    declared_by = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Validations de compétences individuelles
create table if not exists public.competence_validations (
  id                   uuid primary key default gen_random_uuid(),
  volunteer_cursus_id  uuid not null references public.volunteer_cursus(id) on delete cascade,
  competence_id        uuid not null references public.cursus_competences(id) on delete cascade,
  doublure_id          uuid references public.doublures(id) on delete set null,
  mission_id           uuid references public.missions(id) on delete set null,
  event_name           text,
  event_date           date,
  event_lieu           text,
  supervisor_id        uuid references public.profiles(id) on delete set null,
  supervisor_name      text,
  supervisor_antenne   text,
  declared_by          uuid not null references public.profiles(id),
  validated_at         timestamptz not null default now(),
  unique (volunteer_cursus_id, competence_id)
);

alter table public.competence_validations enable row level security;

create policy "cv_read"
  on public.competence_validations for select to authenticated
  using (
    declared_by = auth.uid()
    or exists (
      select 1 from public.volunteer_cursus vc
      where vc.id = volunteer_cursus_id and vc.profile_id = auth.uid()
    )
    or (select role from public.profiles where id = auth.uid()) in ('admin', 'responsable')
  );

create policy "cv_insert"
  on public.competence_validations for insert to authenticated
  with check (
    declared_by = auth.uid()
    or (select role from public.profiles where id = auth.uid()) in ('admin', 'responsable')
  );

create policy "cv_delete"
  on public.competence_validations for delete to authenticated
  using (
    declared_by = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- ============================================================
-- Seed cursus initiaux
-- ============================================================

insert into public.cursus (id, code, name, category, level, formation_label, formation_required, signoff_role)
values
  ('cccccccc-0001-0000-0000-000000000001', 'CE',   'Chef d''Équipe',               'Opérationnel', 4, 'Formation CE',   true, 'Président-Délégué'),
  ('cccccccc-0002-0000-0000-000000000001', 'CP',   'Chef de Poste',                'Opérationnel', 5, 'Formation CP',   true, 'Président-Délégué'),
  ('cccccccc-0003-0000-0000-000000000001', 'CEPS', 'Chef d''Équipe Premiers Secours', 'Opérationnel', 5, 'Formation CEPS', true, 'Responsable de filière')
on conflict (code) do nothing;

-- ---- CE phases ----
insert into public.cursus_phases (id, cursus_id, kind, label, sub, provisional, min_doublures, require_externe, order_idx)
values
  ('dddddddd-0001-0001-0000-000000000001', 'cccccccc-0001-0000-0000-000000000001', 'pre',  'Pré-doublure',  'Doublures d''observation avant la formation', true,  1, false, 0),
  ('dddddddd-0001-0002-0000-000000000001', 'cccccccc-0001-0000-0000-000000000001', 'post', 'Post-doublure', 'Doublures opérationnelles + validation des compétences', false, 2, true,  1)
on conflict (id) do nothing;

insert into public.cursus_competences (id, phase_id, name, description, garde_only, order_idx)
values
  ('eeeeeeee-0001-0001-0001-000000000001', 'dddddddd-0001-0001-0000-000000000001', 'Découverte du rôle de CE',      'Observation du positionnement et des responsabilités du chef d''équipe.',  false, 0),
  ('eeeeeeee-0001-0001-0002-000000000001', 'dddddddd-0001-0001-0000-000000000001', 'Suivi d''un équipage en poste', 'Accompagnement d''un CE en titre sur un dispositif prévisionnel.',         false, 1),
  ('eeeeeeee-0001-0002-0001-000000000001', 'dddddddd-0001-0002-0000-000000000001', 'Esprit Protec''',               'Bienveillance, humilité, engagement, compétence.',                         false, 0),
  ('eeeeeeee-0001-0002-0002-000000000001', 'dddddddd-0001-0002-0000-000000000001', 'Transmission du bilan à l''IOA','Maîtrise de la transmission du bilan à l''Infirmier Organisateur de l''Accueil.', false, 1),
  ('eeeeeeee-0001-0002-0003-000000000001', 'dddddddd-0001-0002-0000-000000000001', 'Positionnement de CE',          'Respect des consignes, compte rendu, professionnalisme, prise de recul.', false, 2),
  ('eeeeeeee-0001-0002-0004-000000000001', 'dddddddd-0001-0002-0000-000000000001', 'Évacuation d''une victime',     'Conditionnement de la victime, topographie et messages radios.',           false, 3),
  ('eeeeeeee-0001-0002-0005-000000000001', 'dddddddd-0001-0002-0000-000000000001', 'Gestes conformes PS / fiches réflexes PCPS', 'Conformité aux recommandations Premiers Secours et aux fiches réflexes PCPS.', true, 4),
  ('eeeeeeee-0001-0002-0006-000000000001', 'dddddddd-0001-0002-0000-000000000001', 'Gestion de l''équipe cellule arrière', 'Communication, donne des ordres, capacité d''écoute, contrôle des gestes et techniques.', true, 5),
  ('eeeeeeee-0001-0002-0007-000000000001', 'dddddddd-0001-0002-0000-000000000001', 'Bilans et bilans spécifiques',  'Exhaustivité et rigueur des bilans.',                                     true, 6)
on conflict (id) do nothing;

insert into public.cursus_rules (cursus_id, text, auto, order_idx)
values
  ('cccccccc-0001-0000-0000-000000000001', 'Une doublure doit être réalisée dans une antenne extérieure à la sienne.', true,  0),
  ('cccccccc-0001-0000-0000-000000000001', 'Doublures réalisées sur événement timeline ou événement externe.',         true,  1),
  ('cccccccc-0001-0000-0000-000000000001', 'Validation par autodéclaration de confiance (stagiaire ou référent).',    false, 2),
  ('cccccccc-0001-0000-0000-000000000001', 'Chaque compétence porte son événement et son superviseur.',               false, 3),
  ('cccccccc-0001-0000-0000-000000000001', 'Les 3 dernières compétences ne sont validables qu''en garde.',            false, 4);

-- ---- CP phases ----
insert into public.cursus_phases (id, cursus_id, kind, label, sub, provisional, min_doublures, require_externe, order_idx)
values
  ('dddddddd-0002-0001-0000-000000000001', 'cccccccc-0002-0000-0000-000000000001', 'pre',  'Pré-doublure',  'Doublures d''observation avant la formation', false, 1, false, 0),
  ('dddddddd-0002-0002-0000-000000000001', 'cccccccc-0002-0000-0000-000000000001', 'post', 'Post-doublure', 'Doublures opérationnelles + validation des compétences', false, 2, false, 1)
on conflict (id) do nothing;

insert into public.cursus_competences (id, phase_id, name, description, garde_only, order_idx)
values
  ('eeeeeeee-0002-0001-0001-000000000001', 'dddddddd-0002-0001-0000-000000000001', 'Observation d''un poste de commandement', 'Découverte de l''organisation d''un PC et de la coordination des équipes.', false, 0),
  ('eeeeeeee-0002-0002-0001-000000000001', 'dddddddd-0002-0002-0000-000000000001', 'Conduite de l''action de secours',        'Coordination des moyens et des équipes sur l''opération.',                  false, 0),
  ('eeeeeeee-0002-0002-0002-000000000001', 'dddddddd-0002-0002-0000-000000000001', 'Relation avec les autorités',             'Interlocuteur des services partenaires et de l''organisateur.',             false, 1),
  ('eeeeeeee-0002-0002-0003-000000000001', 'dddddddd-0002-0002-0000-000000000001', 'Gestion des moyens radio',                'Maîtrise du réseau et des messages d''ambiance.',                           false, 2)
on conflict (id) do nothing;

-- ---- CEPS phases ----
insert into public.cursus_phases (id, cursus_id, kind, label, sub, provisional, min_doublures, require_externe, order_idx)
values
  ('dddddddd-0003-0001-0000-000000000001', 'cccccccc-0003-0000-0000-000000000001', 'pre',  'Pré-doublure',  'Doublures préparatoires', false, 0, false, 0),
  ('dddddddd-0003-0002-0000-000000000001', 'cccccccc-0003-0000-0000-000000000001', 'post', 'Post-doublure', 'Doublures opérationnelles + validation des compétences', false, 3, true,  1)
on conflict (id) do nothing;

insert into public.cursus_competences (id, phase_id, name, description, garde_only, order_idx)
values
  ('eeeeeeee-0003-0002-0001-000000000001', 'dddddddd-0003-0002-0000-000000000001', 'Coordination de plusieurs équipes', 'Encadrement simultané de plusieurs équipages sur dispositif.', false, 0),
  ('eeeeeeee-0003-0002-0002-000000000001', 'dddddddd-0003-0002-0000-000000000001', 'Gestion d''un afflux de victimes',  'Tri, priorisation et répartition des moyens.',                true,  1)
on conflict (id) do nothing;
