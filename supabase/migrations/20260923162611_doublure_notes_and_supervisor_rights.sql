-- Commentaires de doublure à visibilité restreinte + droits du doubleur.
--
-- La RLS filtre des lignes, pas des colonnes : pour qu'un doubleur puisse
-- lire la doublure sans voir la note du stagiaire (et inversement pour la note
-- privée du doubleur), ces deux notes vivent dans une table dédiée.
--   - doublures.supervisor_comment : commentaire pédagogique du doubleur,
--     visible par le stagiaire, le doubleur et l'admin formation.
--   - doublure_notes kind='stagiaire' : stagiaire + admin formation.
--   - doublure_notes kind='doubleur'  : doubleur + admin formation.
-- « Admin formation » = cursus/can_manage.

-- ── Helpers (security definer : évitent la récursion entre policies) ──

create or replace function public.owns_volunteer_cursus(_vc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.volunteer_cursus vc
    where vc.id = _vc_id and vc.profile_id = auth.uid()
  );
$$;

create or replace function public.supervises_doublure(_doublure_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.doublures d
    where d.id = _doublure_id and d.supervisor_id = auth.uid()
  );
$$;

create or replace function public.supervises_volunteer_cursus(_vc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.doublures d
    where d.volunteer_cursus_id = _vc_id and d.supervisor_id = auth.uid()
  );
$$;

create or replace function public.is_doublure_trainee(_doublure_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.doublures d
    join public.volunteer_cursus vc on vc.id = d.volunteer_cursus_id
    where d.id = _doublure_id and vc.profile_id = auth.uid()
  );
$$;

revoke all on function public.owns_volunteer_cursus(uuid) from public;
revoke all on function public.supervises_doublure(uuid) from public;
revoke all on function public.supervises_volunteer_cursus(uuid) from public;
revoke all on function public.is_doublure_trainee(uuid) from public;
grant execute on function public.owns_volunteer_cursus(uuid) to authenticated, service_role;
grant execute on function public.supervises_doublure(uuid) to authenticated, service_role;
grant execute on function public.supervises_volunteer_cursus(uuid) to authenticated, service_role;
grant execute on function public.is_doublure_trainee(uuid) to authenticated, service_role;

-- ── Notes à visibilité restreinte ─────────────────────────────

create table if not exists public.doublure_notes (
  doublure_id  uuid not null references public.doublures(id) on delete cascade,
  kind         text not null check (kind in ('stagiaire', 'doubleur')),
  body         text not null,
  updated_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now(),
  primary key (doublure_id, kind)
);

alter table public.doublure_notes enable row level security;

create policy "doublure_notes_access"
  on public.doublure_notes for all to authenticated
  using (
    (select public.has_permission(auth.uid(), 'cursus', 'can_manage'))
    or (kind = 'stagiaire' and public.is_doublure_trainee(doublure_id))
    or (kind = 'doubleur' and public.supervises_doublure(doublure_id))
  )
  with check (
    (select public.has_permission(auth.uid(), 'cursus', 'can_manage'))
    or (kind = 'stagiaire' and public.is_doublure_trainee(doublure_id))
    or (kind = 'doubleur' and public.supervises_doublure(doublure_id))
  );

-- La note perso existante devient la note « stagiaire » : elle ne doit plus
-- rester sur la ligne doublures, que le doubleur peut désormais lire.
insert into public.doublure_notes (doublure_id, kind, body, updated_by, updated_at)
select id, 'stagiaire', message, declared_by, created_at
from public.doublures
where nullif(btrim(message), '') is not null
on conflict (doublure_id, kind) do nothing;

alter table public.doublures drop column if exists message;

-- ── doublures ─────────────────────────────────────────────────

drop policy if exists "doublures_read" on public.doublures;
create policy "doublures_read"
  on public.doublures for select to authenticated
  using (
    declared_by = auth.uid()
    or supervisor_id = auth.uid()
    or public.owns_volunteer_cursus(volunteer_cursus_id)
    or (select public.has_permission(auth.uid(), 'cursus', 'can_see'))
  );

drop policy if exists "doublures_insert" on public.doublures;
create policy "doublures_insert"
  on public.doublures for insert to authenticated
  with check (
    declared_by = auth.uid()
    and (
      public.owns_volunteer_cursus(volunteer_cursus_id)
      or (select public.has_permission(auth.uid(), 'cursus', 'can_manage'))
    )
  );

-- Le doubleur peut modifier la doublure qu'il encadre, mais pas se retirer
-- ou désigner quelqu'un d'autre (le with check exige supervisor_id = lui).
drop policy if exists "doublures_update" on public.doublures;
create policy "doublures_update"
  on public.doublures for update to authenticated
  using (
    declared_by = auth.uid()
    or supervisor_id = auth.uid()
    or public.owns_volunteer_cursus(volunteer_cursus_id)
    or (select public.has_permission(auth.uid(), 'cursus', 'can_manage'))
  )
  with check (
    declared_by = auth.uid()
    or supervisor_id = auth.uid()
    or public.owns_volunteer_cursus(volunteer_cursus_id)
    or (select public.has_permission(auth.uid(), 'cursus', 'can_manage'))
  );

drop policy if exists "doublures_delete" on public.doublures;
create policy "doublures_delete"
  on public.doublures for delete to authenticated
  using (
    declared_by = auth.uid()
    or public.owns_volunteer_cursus(volunteer_cursus_id)
    or (select public.has_permission(auth.uid(), 'cursus', 'can_manage'))
  );

-- ── competence_validations ────────────────────────────────────

drop policy if exists "cv_read" on public.competence_validations;
create policy "cv_read"
  on public.competence_validations for select to authenticated
  using (
    declared_by = auth.uid()
    or public.owns_volunteer_cursus(volunteer_cursus_id)
    or public.supervises_volunteer_cursus(volunteer_cursus_id)
    or (select public.has_permission(auth.uid(), 'cursus', 'can_see'))
  );

drop policy if exists "cv_insert" on public.competence_validations;
create policy "cv_insert"
  on public.competence_validations for insert to authenticated
  with check (
    declared_by = auth.uid()
    and (
      public.owns_volunteer_cursus(volunteer_cursus_id)
      or (doublure_id is not null and public.supervises_doublure(doublure_id))
      or (select public.has_permission(auth.uid(), 'cursus', 'can_manage'))
    )
  );

drop policy if exists "cv_update" on public.competence_validations;
create policy "cv_update"
  on public.competence_validations for update to authenticated
  using (
    declared_by = auth.uid()
    or public.owns_volunteer_cursus(volunteer_cursus_id)
    or (doublure_id is not null and public.supervises_doublure(doublure_id))
    or (select public.has_permission(auth.uid(), 'cursus', 'can_manage'))
  )
  with check (
    declared_by = auth.uid()
    or public.owns_volunteer_cursus(volunteer_cursus_id)
    or (doublure_id is not null and public.supervises_doublure(doublure_id))
    or (select public.has_permission(auth.uid(), 'cursus', 'can_manage'))
  );

drop policy if exists "cv_delete" on public.competence_validations;
create policy "cv_delete"
  on public.competence_validations for delete to authenticated
  using (
    declared_by = auth.uid()
    or public.owns_volunteer_cursus(volunteer_cursus_id)
    or (doublure_id is not null and public.supervises_doublure(doublure_id))
    or (select public.has_permission(auth.uid(), 'cursus', 'can_manage'))
  );

-- ── volunteer_cursus : le doubleur voit le cursus du stagiaire encadré ──

drop policy if exists "vc_read" on public.volunteer_cursus;
create policy "vc_read"
  on public.volunteer_cursus for select to authenticated
  using (
    profile_id = auth.uid()
    or public.supervises_volunteer_cursus(id)
    or (select public.has_permission(auth.uid(), 'cursus', 'can_see'))
  );

-- ── Doublures encadrées par l'utilisateur courant ─────────────
-- security definer pour exposer le nom du stagiaire sans ouvrir la lecture
-- de la table profiles aux doubleurs.

create or replace function public.list_supervised_doublures()
returns table (
  doublure_id uuid,
  volunteer_cursus_id uuid,
  trainee_id uuid,
  trainee_name text,
  cursus_id uuid,
  cursus_code text,
  cursus_name text,
  phase_label text,
  event_name text,
  event_date date,
  has_pedago_comment boolean,
  has_private_note boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.volunteer_cursus_id,
    vc.profile_id,
    coalesce(p.full_name, p.email),
    c.id,
    c.code,
    c.name,
    ph.label,
    d.event_name,
    d.event_date,
    nullif(btrim(coalesce(d.supervisor_comment, '')), '') is not null,
    exists (select 1 from public.doublure_notes n where n.doublure_id = d.id and n.kind = 'doubleur')
  from public.doublures d
  join public.volunteer_cursus vc on vc.id = d.volunteer_cursus_id
  join public.cursus c on c.id = vc.cursus_id
  left join public.profiles p on p.id = vc.profile_id
  left join public.cursus_phases ph on ph.id = d.phase_id
  where d.supervisor_id = auth.uid()
  order by d.event_date desc nulls last, d.created_at desc;
$$;

revoke all on function public.list_supervised_doublures() from public;
grant execute on function public.list_supervised_doublures() to authenticated;
