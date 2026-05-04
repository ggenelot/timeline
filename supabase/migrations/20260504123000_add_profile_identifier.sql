alter table public.profiles
  add column if not exists identifier text;

with prepared as (
  select
    id,
    lower(coalesce(nullif(split_part(email, '@', 1), ''), id::text)) as base_identifier,
    row_number() over (partition by lower(coalesce(nullif(split_part(email, '@', 1), ''), id::text)) order by created_at, id) as duplicate_rank
  from public.profiles
)
update public.profiles p
set identifier = case when prepared.duplicate_rank = 1 then prepared.base_identifier else prepared.base_identifier || '_' || prepared.duplicate_rank::text end
from prepared
where p.id = prepared.id
  and p.identifier is null;

alter table public.profiles
  alter column identifier set not null;

create unique index if not exists profiles_identifier_key on public.profiles(identifier);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, identifier)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'identifier', split_part(new.email, '@', 1), new.id::text)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
