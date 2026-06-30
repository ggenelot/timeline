-- Disponibilité du matériel au niveau contenant. Statut global on/off (et non
-- des indisponibilités datées) : un contenant est soit disponible, soit
-- indisponible (panne, maintenance…), indépendamment d'une date. La notion
-- d'« engagé » reste, elle, dérivée des affectations à une mission un jour donné
-- (cf. tableau de bord OPE), et n'est donc pas stockée ici.
--
-- La colonne est portée par tous les materiel_types pour rester simple, mais
-- n'a de sens que pour les contenants (is_container = true), seuls affichés et
-- éditables côté interface Matériel.

alter table materiel_types
  add column is_available boolean not null default true,
  add column unavailable_reason text;
