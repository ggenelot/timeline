-- Pivot du module matériel : on retire l'inventaire physique (instances,
-- statuts, affectations) du périmètre actuel et on introduit la distinction
-- structurelle item / contenant sur le catalogue.

drop table if exists mission_materiel_assignments;
drop type if exists mission_materiel_assignment_status;
drop table if exists materiel_instances;
drop table if exists materiel_instance_statuses;

alter table materiel_types
  add column is_container boolean not null default false;

-- Précaution : si des données de test existent déjà sur cet environnement,
-- tout type déjà utilisé comme parent dans materiel_type_contents doit être
-- marqué contenant pour rester cohérent avec la nouvelle contrainte.
update materiel_types
  set is_container = true
  where id in (select distinct parent_type_id from materiel_type_contents);

create or replace function enforce_materiel_container_parent()
returns trigger as $$
begin
  if not exists (
    select 1 from materiel_types
    where id = new.parent_type_id and is_container = true
  ) then
    raise exception 'parent_type_id must reference a container type (is_container = true)';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger materiel_type_contents_enforce_container_parent
  before insert or update on materiel_type_contents
  for each row
  execute function enforce_materiel_container_parent();
