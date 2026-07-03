-- Généralisation de la charte graphique (issue #398) : la refonte de #397 a
-- figé le logo, les couleurs de marque et les polices en dur dans le code
-- (tailwind.config.ts, app/layout.tsx, public/logo.png). Pour que Timeline
-- reste personnalisable par une association qui le déploie sans toucher au
-- code, on stocke ces réglages dans une table singleton éditable depuis une
-- page d'admin (avec repli sur des variables d'environnement côté appli).

create table if not exists public.app_settings (
  id smallint primary key default 1,
  logo_url text,
  brand_color text not null default '#002D74',
  accent_color text not null default '#FF7F30',
  font_sans text,
  font_display text,
  font_hand text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint app_settings_singleton check (id = 1)
);

insert into public.app_settings (id) values (1)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Le logo et les couleurs doivent s'afficher avant connexion (page de login),
-- la lecture est donc ouverte à tous, y compris anonymes.
create policy "Anyone can read app settings"
  on public.app_settings for select
  to anon, authenticated
  using (true);

create policy "Admins can update app settings"
  on public.app_settings for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
