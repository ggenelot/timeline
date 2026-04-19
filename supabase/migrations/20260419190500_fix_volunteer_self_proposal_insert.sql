-- Ensure volunteer self-proposals are normalized before RLS checks.
create or replace function public.normalize_self_mission_proposal_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- A volunteer can only create proposals for themselves.
  if public.current_user_role() = 'benevole' then
    if new.volunteer_id is null then
      new.volunteer_id := auth.uid();
    end if;

    if new.proposed_by is null then
      new.proposed_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.normalize_self_mission_proposal_insert() from public;
grant execute on function public.normalize_self_mission_proposal_insert() to authenticated;

drop trigger if exists trg_normalize_self_mission_proposal_insert on public.mission_proposals;
create trigger trg_normalize_self_mission_proposal_insert
before insert on public.mission_proposals
for each row
execute function public.normalize_self_mission_proposal_insert();

-- Keep insert policy explicit for volunteer self-proposals.
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
