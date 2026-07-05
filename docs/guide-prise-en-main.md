# Guide de prise en main — Timeline

Ce guide présente l'application Timeline en français simple. Il est organisé en trois parties selon votre profil.

---

## Partie 1 — Bénévole

### À quoi sert l'application ?

Timeline gère les missions de protection civile. En tant que bénévole, vous pouvez :

- consulter les missions disponibles,
- répondre aux propositions de mission (disponible, indisponible, peut-être),
- suivre les missions où vous avez été retenu(e) dans l'équipe.

### Se connecter

1. Ouvrir **/login**.
2. Saisir votre email et mot de passe (ou se connecter via Slack si votre organisation l'a activé).
3. Vous arrivez sur la liste des missions.

### Voir les missions

Page : **/missions**

Vous pouvez filtrer par :

- **Catégorie** (Maraude, Garde, Formation, Poste de secours, Vie d'antenne…)
- **Dates** (missions à venir uniquement, ou sur une plage choisie)
- **Compétences requises** (PSC1, PSE1, PSE2…)

Cliquer sur une mission pour voir son détail : statut, lieu, horaires, compétences requises, liste des bénévoles proposés.

### Répondre à une proposition

Quand une mission vous est proposée, une section **Votre réponse** apparaît dans le détail de la mission.

Vous pouvez répondre :
- **Disponible** — vous vous portez candidat(e)
- **Indisponible** — vous ne pouvez pas
- **Peut-être** — vous n'êtes pas certain(e)

Vous pouvez changer votre réponse tant que la mission est au statut **proposée**. Une fois confirmée ou clôturée, les réponses sont verrouillées.

### Suivre ses missions retenues

Page : **/my-missions**

Cette page liste les missions où vous avez été sélectionné(e) par le responsable. C'est votre planning mission.

### Gérer son profil

Page : **/profile**

Vous pouvez mettre à jour vos informations personnelles et, si Slack est activé, connecter/déconnecter votre compte Slack.

### Connexion Slack (si activé)

Si votre organisation utilise Slack :

- Vous pouvez lier votre compte Slack depuis **/profile**.
- Vous recevrez des messages privés automatiques (ex. changement de statut de proposition, infos mission).
- La commande `/timeline login` dans Slack envoie un lien de connexion direct valable 10 minutes.

---

## Partie 2 — Responsable

### Rôle du responsable

Le responsable gère les missions dont il est responsable : création, suivi des propositions, sélection de l'équipe finale, confirmation ou annulation.

### Gérer les missions

Pages :
- **/missions** : liste des missions
- **/admin/gestion** : interface de gestion avancée
- **/admin/missions/create** : créer une mission

Sur la fiche d'une mission, vous pouvez :
- modifier les informations (titre, dates, lieu, compétences requises),
- voir les réponses des bénévoles,
- sélectionner ou retirer des bénévoles de l'équipe,
- confirmer ou annuler la mission,
- consulter l'historique de toutes les actions sur cette mission.

### Gérer les propositions

Page : **/admin/proposals**

Liste de toutes les propositions en attente. Vous pouvez :
- **Accepter** une proposition (le bénévole rejoint l'équipe),
- **Refuser** une proposition (un DM Slack est envoyé si Slack est configuré).

### Statuts de mission

| Statut | Description |
|---|---|
| `proposed` | Mission visible par les bénévoles, réponses acceptées |
| `closed` | Plus de nouvelles réponses acceptées |
| `confirmed` | Équipe validée, mission confirmée |
| `cancelled` | Mission annulée |

### Slack côté responsable

Si Slack est configuré, vous pouvez depuis la fiche mission :
- Créer ou resynchroniser le canal Slack privé de la mission.
- Inviter automatiquement les bénévoles retenus dans ce canal.
- Envoyer un message sur le canal mission.

---

## Partie 3 — Admin

### Rôle de l'admin

L'admin dispose d'un accès global : tous les bénévoles, toutes les missions, toutes les propositions.

### Gestion des bénévoles

Page : **/admin/volunteers** — écran unique fusionnant la liste des bénévoles et l'admin Slack.
Slack est la seule source d'identité : un bénévole n'existe que s'il existe côté Slack, il n'y a plus
de création manuelle de compte. Actions disponibles :
- **Synchroniser Slack** : rafraîchit la liste des membres du workspace et met à jour nom/pseudo/photo
  des comptes déjà liés.
- **Créer un compte** (par ligne, membres « Nouveau ») : crée le profil Timeline lié à ce membre Slack,
  sans envoyer aucun message.
- **Envoyer / renvoyer les identifiants** (par ligne ou en groupe) : envoie (ou régénère et renvoie) un
  mot de passe temporaire par message Slack, en créant le compte au passage si besoin.
- **+ Ajouter** (compétences) : assigne des compétences, disponible même avant que le compte soit créé.
- **/admin/volunteers/[id]/edit** : modifier un profil existant (nom, identifiant, mot de passe).

### Gestion des types de missions

Page : **/admin/mission-types**

Configurer les catégories de mission et leurs compétences requises par défaut.

### Gestion des compétences

Page : **/admin/competences**

Référentiel des compétences disponibles (PSC1, PSE1, PSE2, etc.).

### Gestion des rôles

Page : **/admin/slack** (si Slack activé) et paramètres de rôles

Configurer les rôles fonctionnels et leurs comportements (visibilité des missions, permissions de création, déclenchements Slack automatiques).

### Import de missions

Page : **/admin/missions/import**

Importer un lot de missions depuis un Google Sheet public. Le sheet doit être partagé en lecture publique.

### Slack côté admin

- `GET /api/admin/slack/health` : vérifie l'état du bot Slack (workspace, scopes, connexion). À utiliser pour diagnostiquer les problèmes d'intégration.

---

## Partie 4 — Installation et exploitation (technique)

> Cette section s'adresse à la personne en charge de l'installation et du déploiement.

### Prérequis

- Node.js 20+, npm 10+
- Docker (pour Supabase local)
- Supabase CLI (`npm install -g supabase`)
- Git

### Installation complète depuis zéro

Voir [`docs/INSTALLATION.md`](./INSTALLATION.md) pour les instructions pas à pas, ou le [`README.md`](../README.md) pour un déploiement rapide sur Vercel + Supabase.

Résumé :

```bash
git clone https://github.com/ggenelot/timeline.git
cd timeline
npm install
cp .env.example .env.local
# → Renseigner .env.local avec les valeurs Supabase et Slack
npm run supabase:start
npm run supabase:db:push
npm run supabase:db:seed
npm run dev
# → Application sur http://localhost:3000
```

### Variables d'environnement essentielles

| Variable | Obligatoire | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Oui | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Oui | Clé publique Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Oui | Clé de service Supabase (côté serveur uniquement) |
| `APP_BASE_URL` | Oui | URL de base de l'application |
| `SLACK_BOT_TOKEN` | Si Slack V1 | Token du bot Slack |
| `SLACK_SIGNING_SECRET` | Si slash commands | Secret de signature Slack |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | Si Slack V2 | OAuth Slack |
| `SLACK_AUTH_REDIRECT_URI` | Si auth Slack | URI de callback SSO |

Voir `.env.example` pour la liste complète avec descriptions.

### Commandes de maintenance

```bash
# Remettre la base locale à zéro et recharger les seeds
npm run supabase:db:reset && npm run supabase:db:seed

# Créer une nouvelle migration
npm run supabase:migration:new nom_de_ma_migration

# Diagnostiquer Slack OAuth
npm run diagnose:slack-oauth

# Scanner l'historique Git pour des secrets exposés
./scripts/scan-secrets-history.sh
```

### Déploiement

1. Configurer toutes les variables d'environnement dans Vercel (ou votre plateforme).
2. Les migrations DB sont déployées automatiquement sur push vers `main` (GitHub Actions).
3. Vérifier le healthcheck Slack après déploiement si l'intégration est active.

### Règles de sécurité importantes

- Ne jamais commiter `.env.local` ni aucun secret dans Git.
- `SUPABASE_SERVICE_ROLE_KEY` ne doit jamais être exposée côté client.
- Effectuer une rotation immédiate de tout secret qui aurait été exposé.
- Toute évolution du schéma passe par une migration SQL dans `supabase/migrations/` (jamais de modification directe en base).

---

*Pour toute question technique, consulter le README.md ou contacter l'équipe technique.*
