-- Précision horaire facultative sur une dispo déclarée : « dispo à partir de »
-- et « parti au plus tard à ». Ne change rien au niveau ni au score agrégé —
-- ça qualifie la dispo, ça ne la pénalise pas. Facultatif : ces colonnes ne
-- peuvent être renseignées que sur un jour réellement dispo (level > 0), et sont
-- effacées si le jour repasse à 0 ou est supprimé (au niveau applicatif ;
-- la contrainte CHECK garantit l'invariant côté base). RLS inchangée.

alter table public.availability_declarations
  add column if not exists available_from time,
  add column if not exists available_until time;

alter table public.availability_declarations
  drop constraint if exists availability_declarations_time_requires_level;
alter table public.availability_declarations
  add constraint availability_declarations_time_requires_level
  check (level > 0 or (available_from is null and available_until is null));
