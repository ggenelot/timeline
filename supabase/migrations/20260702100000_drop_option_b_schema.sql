-- The "Option B" skill-domain/level system (created in 20260503113000) was
-- superseded by skill_categories (20260517100000) and never shipped to users.
-- The tables were dropped manually on prod outside the migration system;
-- this migration makes the drop official and consistent across all environments.
--
-- Drop order respects FK dependencies:
--   mission_required_levels → skill_domains / skill_levels
--   profile_domain_progress → skill_domains / skill_levels
--   skill_levels            → skill_domains

drop table if exists public.mission_required_levels;
drop table if exists public.profile_domain_progress;
drop table if exists public.skill_levels;
drop table if exists public.skill_domains;
