-- Vérification assistée du matériel : tout bénévole confirmé sur une mission
-- peut pointer, contenant par contenant et item par item, le matériel requis
-- de cette mission. Pas de rôle dédié : la seule condition est d'être
-- mission_assignments.assignment_status = 'confirmed' sur la mission.

create or replace function public.is_confirmed_on_mission(_mission_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mission_assignments ma
    where ma.mission_id = _mission_id
      and ma.volunteer_id = _user_id
      and ma.assignment_status = 'confirmed'
  );
$$;

revoke all on function public.is_confirmed_on_mission(uuid, uuid) from public;
grant execute on function public.is_confirmed_on_mission(uuid, uuid) to authenticated;

create or replace function public.can_verify_mission_materiel(_mission_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    public.current_user_role() = 'admin'
    or public.is_confirmed_on_mission(_mission_id, _user_id)
  );
$$;

revoke all on function public.can_verify_mission_materiel(uuid, uuid) from public;
grant execute on function public.can_verify_mission_materiel(uuid, uuid) to authenticated;

create table mission_materiel_verifications (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null unique references missions(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  completed_by uuid references profiles(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table mission_materiel_verifications enable row level security;

create policy "mission_materiel_verifications_select"
  on mission_materiel_verifications for select
  using (public.can_verify_mission_materiel(mission_id, auth.uid()));

create policy "mission_materiel_verifications_insert"
  on mission_materiel_verifications for insert
  with check (public.can_verify_mission_materiel(mission_id, auth.uid()));

create policy "mission_materiel_verifications_update"
  on mission_materiel_verifications for update
  using (public.can_verify_mission_materiel(mission_id, auth.uid()))
  with check (public.can_verify_mission_materiel(mission_id, auth.uid()));

create table mission_materiel_verification_items (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  mission_required_materiel_id uuid not null references mission_required_materiels(id) on delete cascade,
  occurrence_index int not null check (occurrence_index >= 0),
  child_type_id uuid not null references materiel_types(id),
  status text not null check (status in ('present', 'missing')),
  note text,
  checked_by uuid not null references profiles(id),
  checked_at timestamptz not null default now(),
  constraint mission_materiel_verification_items_unique
    unique (mission_required_materiel_id, occurrence_index, child_type_id)
);

create index idx_mission_materiel_verification_items_mission_id on mission_materiel_verification_items(mission_id);
create index idx_mission_materiel_verification_items_required_materiel_id on mission_materiel_verification_items(mission_required_materiel_id);

alter table mission_materiel_verification_items enable row level security;

create policy "mission_materiel_verification_items_select"
  on mission_materiel_verification_items for select
  using (public.can_verify_mission_materiel(mission_id, auth.uid()));

create policy "mission_materiel_verification_items_insert"
  on mission_materiel_verification_items for insert
  with check (public.can_verify_mission_materiel(mission_id, auth.uid()));

create policy "mission_materiel_verification_items_update"
  on mission_materiel_verification_items for update
  using (public.can_verify_mission_materiel(mission_id, auth.uid()))
  with check (public.can_verify_mission_materiel(mission_id, auth.uid()));

create policy "mission_materiel_verification_items_delete"
  on mission_materiel_verification_items for delete
  using (public.can_verify_mission_materiel(mission_id, auth.uid()));
