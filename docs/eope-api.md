# Intégration eOPE

eOPE est l'application départementale de gestion des disponibilités et des engagements. Timeline s'y interface pour éviter la double saisie :

- **Import (pull)** : les événements eOPE (`GET /api/events`) sont matérialisés en missions Timeline, liées par `missions.eope_event_id`. À chaque synchronisation, les champs dont eOPE est propriétaire (titre, dates, lieu, description) sont mis à jour ; le reste (statut, effectif requis, type après création, équipage, disponibilités) appartient à Timeline et n'est jamais écrasé. Un événement annulé côté eOPE annule la mission liée (sauf si elle est déjà close).
- **Export (push)** : les équipages engagés (`mission_assignments` en statut `selected`/`confirmed`) des missions liées non-draft/non-annulées sont poussés en engagements validés (`POST/DELETE /api/commitments`, portée `validation:write`). La réconciliation est un diff entre l'état désiré et l'état enregistré (`eope_commitment_links`) : elle est idempotente, et un bénévole retiré de l'équipage voit son engagement distant supprimé.

La correspondance des personnes est **manuelle** : un admin renseigne « Identifiant eOPE » sur la fiche de chaque bénévole (`profiles.eope_user_id`). Les bénévoles engagés non liés sont listés en avertissement sur `/admin/integrations/eope` et ignorés par l'export.

> **Ne pas confondre** : le « Tableau de bord OPE » (`/admin/ope-dashboard`) est un outil interne de composition des équipages, sans rapport avec le système externe eOPE. Tout le code de cette intégration est préfixé `eope`.

## Configuration

1. Dans eOPE (préprod : `https://eope-preprod.kube.gmcrd.fr`), aller dans **Mon compte → Mes applications → Créer une application** :
   - Propriétaire : **Antenne** (le jeton survit aux changements de chef d'antenne) ;
   - Portées : **`events:read`** et **`validation:write`** (ajouter `commitments:read`/`commitments:write` pour la future sync des disponibilités) ;
   - Type de client : **Machine à machine (M2M)** ;
   - Le `client_secret` n'est affiché qu'une seule fois.
2. Renseigner la configuration **depuis l'UI** : `/admin/integrations` → eOPE (URL du serveur, client ID, client secret, fenêtre d'import). Les réglages sont stockés dans la table `integration_settings` (inaccessible côté client, secrets compris) ; les secrets sont en écriture seule — jamais réaffichés, seulement « défini ». En repli, les variables d'environnement `EOPE_BASE_URL` / `EOPE_CLIENT_ID` / `EOPE_CLIENT_SECRET` / `EOPE_SYNC_WINDOW_DAYS` restent acceptées, champ par champ (la valeur saisie dans l'UI prime).
3. Optionnel : définir la variable d'environnement `CRON_SECRET` pour activer la synchronisation quotidienne (`/api/cron/eope-sync`, cf. `vercel.json`) — elle reste en environnement car elle protège la route elle-même.
4. Lancer une première synchronisation manuelle depuis `/admin/integrations/eope`. (Le premier run manuel enregistre aussi l'admin déclencheur comme créateur des missions matérialisées par le cron.)

Sans configuration, l'intégration est simplement désactivée : aucune page ni route n'en dépend.

## Architecture

| Élément | Rôle |
|---|---|
| `lib/integrations/registry.ts` | Registre générique des intégrations (eOPE aujourd'hui, d'autres outils demain) : nom, champs de configuration, secrets |
| `lib/integrations/settings.ts` | Lecture/écriture des réglages (`integration_settings`), masquage des secrets |
| `lib/eope/config.ts` | Résolution de la configuration eOPE (UI d'abord, environnement en repli), `isEopeConfigured()` |
| `lib/eope/client.ts` | Client HTTP OAuth 2.1 (`client_credentials`, un jeton par run, retry unique sur 401, jamais persisté) |
| `lib/eope/types.ts` | Parseurs défensifs des payloads eOPE (voir « Schémas supposés » ci-dessous) |
| `lib/eope/mapping.ts` | Fonctions pures : événement→mission, heuristique de type, diff d'engagements (recréation si la liaison distante change) |
| `lib/eope/sync.ts` | Orchestration pull/push, journalisation `eope_sync_runs`, verrou atomique anti-runs concurrents |
| `app/api/admin/integrations` | GET — liste des intégrations et leur état |
| `app/api/admin/integrations/eope/config` | GET/PATCH — configuration (secrets en écriture seule, PATCH réservé admin) |
| `app/api/admin/integrations/eope/sync` | POST — déclenchement manuel (admin) |
| `app/api/admin/integrations/eope/status` | GET — état pour la page `/admin/integrations/eope` |
| `app/api/admin/integrations/eope/missions/[missionId]` | PATCH — lier/délier une mission à un événement (résolution de conflits) |
| `app/api/cron/eope-sync` | GET — cron Vercel quotidien, protégé par `CRON_SECRET` |
| `integration_settings` (table) | Réglages des intégrations, secrets compris — deny-all côté client, accès service role uniquement |
| `eope_sync_runs` (table) | Journal des synchronisations (stats + erreurs, lisible admin) ; index unique partiel : un seul run `running` à la fois |
| `eope_commitment_links` (table) | État distant enregistré (quel engagement eOPE, pour quel couple mission/bénévole, vers quel événement/compte eOPE) |

Garde-fous : `profiles.eope_user_id` n'est modifiable que par un administrateur ou via les routes d'administration (trigger `guard_profiles_eope_user_id` — un bénévole ne peut pas se lier lui-même à un compte eOPE arbitraire) ; si la liaison d'un bénévole ou d'une mission change après un push, l'engagement distant est supprimé puis recréé au run suivant (l'identité poussée est mémorisée dans `eope_commitment_links`).

Anti-doublon à l'import : si un événement eOPE non lié ressemble à une mission existante non liée (même clé titre + date Paris que l'import de missions, `buildMissionDedupKey`), rien n'est créé et un **conflit** est remonté sur `/admin/integrations/eope`, où l'admin peut lier la mission existante. Les missions créées par l'import arrivent en statut `draft`.

Cas limite assumé : la suppression d'une mission ou d'un profil Timeline supprime en cascade ses lignes `eope_commitment_links` ; l'engagement correspondant peut alors rester orphelin côté eOPE (à nettoyer à la main). Préférer annuler une mission plutôt que la supprimer.

## Schémas supposés (à valider contre la préprod)

⚠️ **La documentation eOPE ne décrit pas les schémas JSON de `/api/events` ni `/api/commitments`.** Les parseurs (`lib/eope/types.ts`) et les corps de requête (`lib/eope/sync.ts`) reposent sur les hypothèses ci-dessous. Elles sont volontairement tolérantes (plusieurs noms de champs candidats, erreurs par élément remontées dans le journal), mais **doivent être validées lors du premier test réel**, puis resserrées.

Hypothèses actuelles :

- **Liste d'événements** : tableau JSON, éventuellement enveloppé (`data`/`items`/`results`/`events`). Champs candidats par événement : id = `id`|`event_id`|`uuid` ; titre = `title`|`name`|`label` ; début = `starts_at`|`start_at`|`start_date`|`start`|`begin_at`|`from` ; fin = `ends_at`|`end_at`|`end_date`|`end`|`to` ; lieu = `location`|`place`|`address`|`venue` ; annulation = booléen `cancelled`/`is_cancelled` ou statut contenant « cancel »/« annul » ; type = `type`|`category` (chaîne ou objet `{name}`).
- **Dates** : un ISO avec fuseau est converti en UTC ; un datetime naïf (sans fuseau) est interprété comme heure locale **Europe/Paris**.
- **Fenêtre** : le pull appelle `GET /api/events?from=<ISO>&to=<ISO>` (J−7 → J+`EOPE_SYNC_WINDOW_DAYS`). Si le serveur ignore ces paramètres, il renverra simplement plus d'événements (sans effet de bord : un événement lié hors fenêtre reste intouché).
- **Création d'engagement** : `POST /api/commitments` avec `{"event_id": ..., "user_id": ...}` ; la réponse contient l'engagement créé (éventuellement sous `data`/`commitment`) avec un champ `id`.
- **Suppression** : `DELETE /api/commitments/{id}` ; un 404 est traité comme « déjà supprimé » (succès).

### Procédure de découverte (à exécuter par un admin avec le client M2M)

```bash
BASE=https://eope-preprod.kube.gmcrd.fr

# 1. Jeton (vérifier la forme de la réponse : access_token, expires_in, scope)
curl -s -X POST $BASE/api/oauth/token \
  -d grant_type=client_credentials \
  -d client_id=$CLIENT_ID \
  -d client_secret=$CLIENT_SECRET \
  -d "scope=events:read validation:write" | tee /tmp/token.json
TOKEN=$(jq -r .access_token /tmp/token.json)

# 2. Événements : noter les noms de champs réels (id, titre, dates + fuseau,
#    lieu, statut/annulation, type), l'enveloppe de liste et la pagination.
curl -s "$BASE/api/events" -H "Authorization: Bearer $TOKEN" | jq . | head -80
curl -s "$BASE/api/events?from=2026-07-01T00:00:00Z&to=2026-10-01T00:00:00Z" \
  -H "Authorization: Bearer $TOKEN" | jq 'length? // (.data|length)?'

# 3. Engagements : corps exact du POST, forme de la réponse, sémantique d'un
#    POST en double (409 ? doublon ?), codes du DELETE.
curl -s -X POST "$BASE/api/commitments" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_id":"<id test>","user_id":"<id test>"}' | jq .
curl -s -X DELETE "$BASE/api/commitments/<id créé>" \
  -H "Authorization: Bearer $TOKEN" -o /dev/null -w '%{http_code}\n'

# 4. Après la campagne de test : révoquer le jeton.
curl -s -X POST $BASE/api/oauth/revoke -d token=$TOKEN
```

Consigner les schémas réels observés dans cette section (en remplaçant les hypothèses), puis ajuster `lib/eope/types.ts` (listes de champs candidats) et le corps du POST dans `lib/eope/sync.ts` si nécessaire. Les tests unitaires (`lib/eope/mapping.test.ts`) doivent être mis à jour avec un échantillon réel anonymisé.

## V2 envisagée : disponibilités

L'architecture est prête pour synchroniser aussi les disponibilités (`mission_proposals` ↔ `GET/POST /api/user-commitments`, portées `commitments:read`/`commitments:write`) : il suffira d'ajouter une colonne de liaison (`mission_proposals.eope_user_commitment_id`, nouvelle migration), une fonction `pullAvailabilities()`/`pushAvailabilities()` dans `lib/eope/sync.ts` et les portées correspondantes au client. Le journal (`direction`) et le mapping sont déjà génériques.
