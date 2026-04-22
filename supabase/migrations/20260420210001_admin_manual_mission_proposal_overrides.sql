-- 20260420210001_admin_manual_mission_proposal_overrides.sql
-- Admin manual overrides for mission proposal responses
-- + suppression de la valeur legacy 'maybe'
-- + sécurisation du changement d'enum (gestion du DEFAULT)

DO $$
BEGIN
  -- Vérifie si l’enum actuel contient encore 'maybe'
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'mission_proposal_response'
      AND e.enumlabel = 'maybe'
  ) THEN

    -- 1. Supprimer le DEFAULT pour éviter l’erreur de cast
    ALTER TABLE public.mission_proposals
      ALTER COLUMN response DROP DEFAULT;

    -- 2. Normaliser les données existantes
    UPDATE public.mission_proposals
    SET response = 'available'
    WHERE response::text = 'maybe';

    -- 3. Renommer l’ancien enum
    ALTER TYPE public.mission_proposal_response
      RENAME TO mission_proposal_response_old;

    -- 4. Créer le nouvel enum propre
    CREATE TYPE public.mission_proposal_response AS ENUM (
      'no_response',
      'available',
      'unavailable'
    );

    -- 5. Convertir la colonne vers le nouvel enum
    ALTER TABLE public.mission_proposals
      ALTER COLUMN response TYPE public.mission_proposal_response
      USING (response::text::public.mission_proposal_response);

    -- 6. Remettre un DEFAULT cohérent
    ALTER TABLE public.mission_proposals
      ALTER COLUMN response SET DEFAULT 'no_response'::public.mission_proposal_response;

    -- 7. Supprimer l’ancien enum
    DROP TYPE public.mission_proposal_response_old;

  END IF;
END
$$;

-- (Optionnel mais recommandé) commentaire de documentation
COMMENT ON TYPE public.mission_proposal_response IS
  'Response of a volunteer to a mission: no_response, available, unavailable (legacy "maybe" removed)';