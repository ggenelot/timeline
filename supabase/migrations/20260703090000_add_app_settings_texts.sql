-- Suite de #398 : la page de connexion affiche aussi du texte propre à
-- l'association (nom, slogan, message d'accueil), figé en dur dans
-- app/login/page.tsx. On l'ajoute aux réglages éditables depuis
-- /admin/apparence, à côté du logo/couleurs/polices.

alter table public.app_settings
  add column if not exists org_name text not null default 'Protec du 8 & du 9',
  add column if not exists org_tagline text not null default 'Protection Civile Paris Seine',
  add column if not exists login_greeting text not null default 'contente de te revoir';
