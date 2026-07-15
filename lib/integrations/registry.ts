// Registre des intégrations externes disponibles. Chaque intégration déclare
// ses champs de configuration (saisis depuis /admin/integrations, stockés dans
// la table integration_settings) ; les champs marqués `secret` sont en
// écriture seule : jamais renvoyés au client, seulement un indicateur
// « défini ». Pour brancher un nouvel outil : ajouter une définition ici, un
// module lib/<outil>/ et une page /admin/integrations/<clé>.

export type IntegrationFieldDef = {
  key: string;
  label: string;
  help?: string;
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
};

export type IntegrationDefinition = {
  key: string; // clé stable, colonne integration_settings.provider
  name: string;
  description: string;
  docsPath?: string;
  fields: IntegrationFieldDef[];
};

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    key: 'eope',
    name: 'eOPE',
    description:
      "Outil départemental de gestion des disponibilités : import des événements eOPE en missions, export des équipages engagés en engagements validés.",
    docsPath: 'docs/eope-api.md',
    fields: [
      {
        key: 'base_url',
        label: 'URL du serveur',
        required: true,
        placeholder: 'https://eope-preprod.kube.gmcrd.fr',
        help: "URL de l'instance eOPE (préprod ou production)."
      },
      {
        key: 'client_id',
        label: 'Client ID',
        required: true,
        help: "Application OAuth « machine à machine » créée dans eOPE (Mes applications, propriétaire = antenne, portées events:read + validation:write)."
      },
      {
        key: 'client_secret',
        label: 'Client secret',
        required: true,
        secret: true,
        help: "Affiché une seule fois par eOPE à la création de l'application."
      },
      {
        key: 'sync_window_days',
        label: "Fenêtre d'import (jours)",
        placeholder: '90',
        help: "Horizon des événements importés, en jours à venir (défaut : 90)."
      }
    ]
  }
];

export function getIntegrationDefinition(key: string): IntegrationDefinition | null {
  return INTEGRATIONS.find((integration) => integration.key === key) ?? null;
}
