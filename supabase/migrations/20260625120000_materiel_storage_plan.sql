-- Pivot vers un "plan de rangement" : la catégorie devient optionnelle et la
-- composition d'un contenant devient ordonnable (drag and drop).

alter table materiel_types
  alter column category_id drop not null;

alter table materiel_types
  drop constraint if exists materiel_types_category_id_fkey;

alter table materiel_types
  add constraint materiel_types_category_id_fkey
  foreign key (category_id) references materiel_categories(id) on delete set null;

alter table materiel_type_contents
  add column position int not null default 0;

with ordered as (
  select id, row_number() over (partition by parent_type_id order by created_at) - 1 as rn
  from materiel_type_contents
)
update materiel_type_contents c
set position = ordered.rn
from ordered
where ordered.id = c.id;
