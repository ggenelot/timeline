create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references public.missions(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action_type text not null,
  entity_type text not null,
  entity_id uuid,
  description text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_activity_logs_mission_created_at
  on public.activity_logs(mission_id, created_at desc);
create index if not exists idx_activity_logs_created_at
  on public.activity_logs(created_at desc);
create index if not exists idx_activity_logs_actor_id
  on public.activity_logs(actor_id);

create or replace function public.mission_allows_response(_mission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.missions m
    where m.id = _mission_id
      and m.status = 'proposed'
  );
$$;

create or replace function public.mission_allows_assignment_changes(_mission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.missions m
    where m.id = _mission_id
      and m.status in ('proposed', 'closed')
  );
$$;

revoke all on function public.mission_allows_response(uuid) from public;
revoke all on function public.mission_allows_assignment_changes(uuid) from public;
grant execute on function public.mission_allows_response(uuid) to authenticated;
grant execute on function public.mission_allows_assignment_changes(uuid) to authenticated;

alter table public.activity_logs enable row level security;

drop policy if exists "activity_logs_select_strict" on public.activity_logs;
create policy "activity_logs_select_strict"
on public.activity_logs
for select
using (
  public.current_user_role() = 'admin'
  or (
    activity_logs.mission_id is not null
    and public.can_read_mission(activity_logs.mission_id, auth.uid())
  )
);

-- No direct writes from the client. Logs are inserted by triggers.

drop policy if exists "mission_proposals_insert_strict" on public.mission_proposals;
create policy "mission_proposals_insert_strict"
on public.mission_proposals
for insert
with check (
  public.mission_allows_response(mission_proposals.mission_id)
  and (
    public.current_user_role() = 'admin'
    or (
      public.current_user_role() = 'responsable'
      and mission_proposals.proposed_by = auth.uid()
      and public.is_mission_owner(mission_proposals.mission_id, auth.uid())
      and exists (
        select 1
        from public.profiles p
        where p.id = mission_proposals.volunteer_id
          and p.role = 'benevole'
      )
    )
    or (
      public.current_user_role() = 'benevole'
      and mission_proposals.volunteer_id = auth.uid()
      and mission_proposals.proposed_by = auth.uid()
    )
  )
);

drop policy if exists "mission_proposals_update_strict" on public.mission_proposals;
create policy "mission_proposals_update_strict"
on public.mission_proposals
for update
using (
  public.current_user_role() = 'admin'
  or (
    public.current_user_role() = 'responsable'
    and public.is_mission_owner(mission_proposals.mission_id, auth.uid())
  )
  or (
    public.current_user_role() = 'benevole'
    and mission_proposals.volunteer_id = auth.uid()
  )
)
with check (
  public.mission_allows_response(mission_proposals.mission_id)
  and (
    public.current_user_role() = 'admin'
    or (
      public.current_user_role() = 'responsable'
      and public.is_mission_owner(mission_proposals.mission_id, auth.uid())
    )
    or (
      public.current_user_role() = 'benevole'
      and mission_proposals.volunteer_id = auth.uid()
    )
  )
);

drop policy if exists "mission_assignments_insert_strict" on public.mission_assignments;
create policy "mission_assignments_insert_strict"
on public.mission_assignments
for insert
with check (
  public.can_manage_mission(mission_assignments.mission_id, auth.uid())
  and mission_assignments.assignment_status = 'selected'
  and public.can_select_volunteer_for_mission(mission_assignments.mission_id, mission_assignments.volunteer_id)
  and public.mission_allows_assignment_changes(mission_assignments.mission_id)
);

drop policy if exists "mission_assignments_update_strict" on public.mission_assignments;
create policy "mission_assignments_update_strict"
on public.mission_assignments
for update
using (
  public.can_manage_mission(mission_assignments.mission_id, auth.uid())
)
with check (
  public.can_manage_mission(mission_assignments.mission_id, auth.uid())
  and public.mission_allows_assignment_changes(mission_assignments.mission_id)
);

drop policy if exists "mission_assignments_delete_strict" on public.mission_assignments;
create policy "mission_assignments_delete_strict"
on public.mission_assignments
for delete
using (
  public.can_manage_mission(mission_assignments.mission_id, auth.uid())
  and public.mission_allows_assignment_changes(mission_assignments.mission_id)
);

create or replace function public.log_mission_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_logs (mission_id, actor_id, action_type, entity_type, entity_id, description)
    values (
      new.id,
      auth.uid(),
      'mission_created',
      'mission',
      new.id,
      format('Mission "%s" créée.', new.title)
    );

    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.activity_logs (mission_id, actor_id, action_type, entity_type, entity_id, description)
    values (
      new.id,
      auth.uid(),
      'mission_status_changed',
      'mission',
      new.id,
      format('Statut modifié : %s → %s.', old.status, new.status)
    );
  end if;

  return new;
end;
$$;

create or replace function public.log_proposal_response_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.response is distinct from old.response then
    insert into public.activity_logs (mission_id, actor_id, action_type, entity_type, entity_id, description)
    values (
      new.mission_id,
      auth.uid(),
      'proposal_response_updated',
      'mission_proposal',
      new.id,
      format('Réponse bénévole : %s → %s.', old.response, new.response)
    );
  end if;

  return new;
end;
$$;

create or replace function public.log_assignment_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_logs (mission_id, actor_id, action_type, entity_type, entity_id, description)
    values (
      new.mission_id,
      auth.uid(),
      'volunteer_selected',
      'mission_assignment',
      new.id,
      'Bénévole ajouté à l''équipe finale.'
    );

    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.activity_logs (mission_id, actor_id, action_type, entity_type, entity_id, description)
    values (
      old.mission_id,
      auth.uid(),
      'volunteer_removed',
      'mission_assignment',
      old.id,
      'Bénévole retiré de l''équipe finale.'
    );

    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_log_mission_changes on public.missions;
create trigger trg_log_mission_changes
after insert or update on public.missions
for each row execute function public.log_mission_changes();

drop trigger if exists trg_log_proposal_response_changes on public.mission_proposals;
create trigger trg_log_proposal_response_changes
after update on public.mission_proposals
for each row execute function public.log_proposal_response_changes();

drop trigger if exists trg_log_assignment_changes on public.mission_assignments;
create trigger trg_log_assignment_changes
after insert or delete on public.mission_assignments
for each row execute function public.log_assignment_changes();
