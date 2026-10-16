# Env, DB, deploy

- Repo-root `.env` `DATABASE_URL` = Supabase. Unset it to use local Postgres for
  2025 backtests: port 5433, database `nfl_edge`.
- Next.js reads `web/.env.local` and Vercel server env, not the root `.env`.
- `GEMINI_API_KEY` is server-only, never `NEXT_PUBLIC_`. Every call is logged to
  `model.llm_calls`. Model ids live in `PHASE_MODEL` in `web/src/lib/gemini.ts`;
  change them there, never preview or 2.x models.
- Remote: `jrakestr/nfl-edge` (private). Production = Git deploy of `web/`.
  Never `vercel --prod` from the repo root (it uploads `data/draws/`).
