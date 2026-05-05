# Guide de prise en main (utilisateur, admin et installation)

Ce guide explique l’application en français simple, étape par étape.

---

## 1) Partie **Utilisateur** (bénévole / responsable)

## À quoi sert l’application ?

Timeline sert à gérer des missions de protection civile :
- voir les missions,
- proposer des bénévoles,
- répondre aux propositions,
- confirmer une équipe finale,
- suivre ses missions.

## Se connecter

1. Ouvrir la page **/login**.
2. Se connecter avec son compte.
3. Selon votre rôle, vous verrez des pages différentes :
   - **bénévole** : accès à ses missions et ses réponses,
   - **responsable** : gestion des missions dont il est responsable,
   - **admin** : accès global.

## Voir les missions

Page : **/missions**

Vous pouvez :
- parcourir la liste des missions,
- filtrer par date, compétences, catégorie,
- ouvrir une mission pour voir le détail.

Dans le détail d’une mission, on trouve généralement :
- le statut (proposée, confirmée, annulée…),
- les besoins en compétences,
- les propositions/réponses,
- l’historique des actions.

## Répondre à une proposition (bénévole)

Quand une mission vous est proposée, vous pouvez répondre :
- **Disponible**,
- **Indisponible**,
- **Peut-être**.

Ensuite, le responsable/admin décide si votre proposition est acceptée ou refusée.

## Suivre ses missions retenues

Page : **/my-missions**

Cette page affiche les missions où vous êtes retenu(e) dans l’équipe finale.

## Gérer son profil

Page : **/profile**

Vous pouvez vérifier et mettre à jour vos informations (par exemple téléphone/identifiant selon configuration active).

## Slack (si activé)

Selon la configuration de votre organisation :
- connexion du compte Slack,
- liaison/déliaison du compte,
- réception de messages privés automatiques (ex. changement de statut, infos mission).

---

## 2) Partie **Admin**

## Rôle de l’admin

L’admin voit l’ensemble des missions et bénévoles, et peut faire des actions globales.

## Gestion des bénévoles

Pages :
- **/admin/volunteers** : liste des bénévoles,
- **/admin/volunteers/create** : créer un profil,
- **/admin/volunteers/[id]/edit** : modifier un profil.

Actions typiques :
- créer/éditer un bénévole,
- corriger des informations,
- gérer les disponibilités ou le rattachement aux missions selon workflow.

## Gestion des missions

Pages :
- **/admin/missions/create** : créer une mission,
- **/admin/missions/[id]/edit** : modifier une mission,
- **/admin/missions/import** : importer des missions.

Actions possibles :
- créer une mission,
- modifier statut/dates/informations,
- affecter ou retirer des bénévoles,
- confirmer une mission.

## Gestion des propositions

Page : **/admin/proposals**

L’admin peut :
- voir les propositions des bénévoles,
- accepter/refuser une proposition,
- suivre l’état des réponses.

## Slack côté admin

Fonctions disponibles si Slack est configuré :
- test de santé Slack : **/api/admin/slack/health**,
- création/synchronisation du canal mission,
- invitations des bénévoles retenus,
- envoi de messages mission depuis l’interface admin (selon écrans activés).

## Bonnes pratiques admin

- Valider les informations de mission avant confirmation.
- Vérifier les compétences requises avant sélection finale.
- Utiliser l’historique de mission pour garder une traçabilité claire.

---

## 3) Partie **Installation & exploitation**

## Prérequis

- Node.js 20+
- npm 10+
- Docker
- Supabase CLI

## Installation locale

1. Installer les dépendances :

```bash
npm install
```

2. Créer le fichier d’environnement local :

```bash
cp .env.example .env.local
```

3. Renseigner au minimum :
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Base de données (Supabase)

1. Démarrer Supabase en local :

```bash
npm run supabase:start
```

2. Appliquer les migrations :

```bash
npm run supabase:db:push
```

3. Charger les données de seed :

```bash
npm run supabase:db:seed
```

> Important : ne pas modifier manuellement les tables système de migrations. Utiliser le workflow officiel Supabase pour réparer/réconcilier.

## Variables d’environnement (exemples utiles)

### Front/public
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Serveur
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL`

### Slack (si utilisé)
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET` (slash commands)
- `SLACK_AUTH_REDIRECT_URI` (auth Slack v2)

## Secrets : règles simples

- Ne jamais commiter les secrets dans Git.
- Utiliser les variables d’environnement de la plateforme de déploiement (Vercel, etc.).
- Faire une rotation immédiate en cas de fuite.
- Vérifier l’historique avec :

```bash
./scripts/scan-secrets-history.sh
```

## Lancer l’application en local

```bash
npm run dev
```

Puis ouvrir : **http://localhost:3000**

## Déploiement (principe)

1. Préparer les variables d’environnement de production.
2. Déployer l’application Next.js (ex. Vercel).
3. Appliquer les migrations DB sur l’environnement cible.
4. Vérifier les endpoints critiques (auth, missions, admin, Slack).
5. Contrôler les droits d’accès (RLS) avec des comptes de test.

## Vérifications après déploiement

- Connexion utilisateur OK.
- Liste missions et filtres OK.
- Réponse bénévole (disponible/indisponible/peut-être) OK.
- Validation admin des propositions OK.
- Mission confirmée visible dans **/my-missions**.
- Si Slack actif : healthcheck + envoi message test OK.

---

Si vous débutez : commencez par la partie **Utilisateur**, puis passez à **Admin**, et gardez la partie **Installation** pour la personne en charge de la technique.
