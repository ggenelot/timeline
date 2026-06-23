-- Les statuts du tableau de bord de suivi des compétences (Validée, En
-- formation, Intéressé·e, À recycler) étaient codés en dur dans le frontend.
-- On les déplace dans une table `skill_statuses` configurable depuis la page
-- d'admin « Compétences », à l'image de `skill_categories`.
--
-- Le statut `valide` reste un cas particulier : c'est la seule clé à laquelle
-- d'autres parties du produit (éligibilité aux missions, fonction SQL
-- `user_has_cp_skill`) attachent un sens métier figé. On le marque
-- `is_validating = true` et `protected = true` : son libellé/couleur/symbole
-- restent éditables, mais sa clé ne peut pas être supprimée. Les autres
-- statuts (y compris ceux ajoutés par un admin) sont entièrement libres.

create table if not exists public.skill_statuses (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  color text not null default 'slate',
  mark text not null default '✓',
  is_validating boolean not null default false,
  protected boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- On replie les anciennes valeurs historiques sur les statuts métier actuels
-- avant de verrouiller la colonne avec une clé étrangère : on abandonne la
-- distinction « valide / valide implicite / exempte / a_faire ».
update public.profile_skills set status = 'valide' where status = 'exempte';
update public.profile_skills set status = 'formation' where status = 'a_faire';

insert into public.skill_statuses (key, label, color, mark, is_validating, protected, display_order)
values
  ('valide', 'Validée', 'emerald', '✓', true, true, 0),
  ('formation', 'En formation', 'sky', '✓', false, false, 1),
  ('interesse', 'Intéressé·e', 'violet', '★', false, false, 2),
  ('a_recycler', 'À recycler', 'orange', '↻', false, false, 3)
on conflict (key) do nothing;

alter table public.profile_skills
  drop constraint if exists profile_skills_status_check;

alter table public.profile_skills
  drop constraint if exists profile_skills_status_fkey;

alter table public.profile_skills
  add constraint profile_skills_status_fkey
    foreign key (status) references public.skill_statuses (key)
    on update cascade on delete restrict;

-- L'éligibilité CP ne doit plus dépendre de la chaîne 'valide' en dur mais de
-- tout statut marqué comme « valide une compétence ».
create or replace function public.user_has_cp_skill(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_skills ps
    join public.skills s on s.id = ps.skill_id
    join public.skill_statuses st on st.key = ps.status
    where ps.profile_id = _user_id
      and st.is_validating = true
      and lower(coalesce(s.name, '')) = 'cp'
  );
$$;

alter table public.skill_statuses enable row level security;

create policy "Authenticated users can read skill statuses"
  on public.skill_statuses for select
  to authenticated
  using (true);

create policy "Admins can manage skill statuses"
  on public.skill_statuses for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
