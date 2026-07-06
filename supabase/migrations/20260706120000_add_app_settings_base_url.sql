-- Suite de #398 : les messages Slack (notamment le message de création de compte
-- envoyé par la edge function `send-slack-invitations`) construisent des liens
-- absolus vers l'application. Faute d'une variable d'environnement PUBLIC_SITE_URL /
-- APP_BASE_URL côté edge function, ces liens tombaient à `/login` (base manquante).
-- On rend l'URL de base éditable depuis /admin/apparence, à côté du logo/couleurs/textes,
-- pour qu'une association puisse la renseigner sans redéployer ni configurer d'env var.
alter table public.app_settings
  add column if not exists base_url text;
