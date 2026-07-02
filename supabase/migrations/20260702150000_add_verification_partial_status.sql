-- La vérification scopée par matériel (écran « arborescence ») permet de
-- pointer une quantité partielle sur un item (stepper +/-) plutôt qu'un
-- simple présent/manquant : on ajoute le statut 'partial' et la quantité
-- effectivement présente qui l'accompagne.

alter table mission_materiel_verification_items
  drop constraint mission_materiel_verification_items_status_check;

alter table mission_materiel_verification_items
  add constraint mission_materiel_verification_items_status_check
  check (status in ('present', 'partial', 'missing'));

alter table mission_materiel_verification_items
  add column quantity_present integer check (quantity_present is null or quantity_present >= 0);
