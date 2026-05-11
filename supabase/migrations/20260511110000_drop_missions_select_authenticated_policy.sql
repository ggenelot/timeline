-- The "missions_select_authenticated" policy grants SELECT on missions to any
-- authenticated user (auth.uid() IS NOT NULL), bypassing all visibility rules.
-- Because PostgreSQL ORs all SELECT policies together, this policy silently
-- overrides "missions_select_by_role" (which uses can_read_mission), making
-- every logged-in user see every mission regardless of their role or the
-- configured visibility rules.
--
-- Fix: drop the overly-permissive policy. The "missions_select_by_role" policy
-- (USING can_read_mission(id, auth.uid())) already handles all three roles:
-- admins/responsables see everything, volunteers see only what the rules allow.

DROP POLICY IF EXISTS "missions_select_authenticated" ON public.missions;
