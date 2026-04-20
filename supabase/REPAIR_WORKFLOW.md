# Supabase migration history realignment (remote ↔ local)

Use this workflow when `supabase db pull` reports remote migration history mismatch.

## 1) Inspect current state
```bash
supabase migration list
```

## 2) Mark the expected remote migration versions as applied
```bash
supabase migration repair --status applied 20260420100000
supabase migration repair --status applied 20260420113000
supabase migration repair --status applied 20260420124500
supabase migration repair --status applied 20260420130000
supabase migration repair --status applied 20260420161000
```

## 3) Re-check history alignment
```bash
supabase migration list
```

## 4) Pull the current remote schema into the repository
```bash
supabase db pull
```

## Notes
- Do **not** edit `supabase_migrations.schema_migrations` manually.
- Prefer `migration repair` for history reconciliation, then `db pull` to sync repo schema with remote reality.
- Before creating new migration files, verify all file timestamps in `supabase/migrations` are unique.
