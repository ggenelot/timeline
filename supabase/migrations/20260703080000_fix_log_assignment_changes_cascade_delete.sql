-- La suppression d'une mission cascade sur mission_assignments (on delete
-- cascade), ce qui déclenche trg_log_assignment_changes (after delete) pour
-- chaque bénévole staffé. Ce trigger tentait d'insérer une ligne
-- activity_logs référençant old.mission_id, mais la mission venait déjà
-- d'être supprimée dans la même transaction : la contrainte de clé
-- étrangère activity_logs_mission_id_fkey était alors violée, empêchant
-- toute suppression d'une mission ayant des bénévoles staffés.
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
    -- Ne pas logger un retrait déclenché par la suppression en cascade de la
    -- mission elle-même : la mission n'existe plus, l'insertion violerait la
    -- contrainte de clé étrangère sur activity_logs.mission_id.
    if exists (select 1 from public.missions where id = old.mission_id) then
      insert into public.activity_logs (mission_id, actor_id, action_type, entity_type, entity_id, description)
      values (
        old.mission_id,
        auth.uid(),
        'volunteer_removed',
        'mission_assignment',
        old.id,
        'Bénévole retiré de l''équipe finale.'
      );
    end if;

    return old;
  end if;

  return null;
end;
$$;
