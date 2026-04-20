alter table public.profiles
  add column if not exists auth_user_id uuid,
  add column if not exists invitation_sent_at timestamptz;

update public.profiles
set auth_user_id = id
where auth_user_id is null;

alter table public.profiles
  alter column email drop not null;

alter table public.profiles
  drop constraint if exists profiles_auth_user_id_key,
  add constraint profiles_auth_user_id_key unique (auth_user_id);

alter table public.profiles
  drop constraint if exists profiles_auth_user_id_fkey,
  add constraint profiles_auth_user_id_fkey
    foreign key (auth_user_id)
    references auth.users(id)
    on delete set null;

create index if not exists idx_profiles_auth_user_id on public.profiles(auth_user_id);
create index if not exists idx_profiles_invitation_sent_at on public.profiles(invitation_sent_at);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, auth_user_id, full_name, email)
  values (
    new.id,
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update
    set auth_user_id = excluded.auth_user_id,
        email = excluded.email;

  return new;
end;
$$;
