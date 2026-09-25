# Agent instructions

## Project map

- React 18 + TypeScript + Vite; `src/main.tsx` starts the app, `src/router.tsx` owns lazy/protected routes, `AppProvider` restores session state, and `src/lib/repository.ts` is the Supabase data boundary.
- `src/pages` contains screens, `src/components` shared UI/layout, `src/lib` domain/auth/data rules, `src/context` shared state; `supabase` contains the PostgreSQL bootstrap, migrations, and Edge Functions; `tests` contains Vitest and manual SQL integration checks.
- Public route names are Portuguese. Keep user-facing UI text in Portuguese.

## Data and security

- Before project work, consult `~/Projetos/Cofre/Health Support/00 - Indice.md` and `07 - Tarefas.md`; read linked architecture/business/Supabase notes for the affected domain. For frontend work, also consult `~/Projetos/Cofre/PREFERENCIAS - Website e desenvolvimento.md`.
- `supabase/schema.sql` is the bootstrap reference; version database changes in `supabase/migrations`. Review and keep bootstrap behavior aligned with migrations. Policies/triggers/RPCs—not UI checks—must enforce authorization and invariants.
- `VITE_*` values are public. Keep `SUPABASE_SERVICE_ROLE_KEY`, private VAPID keys, and `PUSH_DISPATCH_SECRET` in protected server/function environments; never copy real environment values, tokens, or personal data into Git or the vault.
- `dev:local` selects Vite `development` mode (`.env`/`.env.local`); `dev:remote` selects `remote` mode (`.env.remote` overrides `.env.local`). Keep both real env files ignored.
- Ticket messages, events, and notifications have recipient/privacy rules: internal notes must not reach requesters. Recheck RLS, triggers, and Edge Functions when changing these flows.
- PWA updates use `registerType: "prompt"`; preserve the save-before-update behavior and `/assets/` SPA-fallback denylist in `vite.config.ts`/`vercel.json`.

## Commands and verification

```bash
npm ci
npm run dev
npm run dev:local
npm run dev:remote
npm run typecheck       # app, node config, and tests TypeScript projects
npm test
npm test -- tests/ticketPolicy.test.ts
npm run lint
npm run format:check
npm run build
```

- `tests/*Policies.sql` are manual integration tests: load `supabase/schema.sql` before all migrations into a disposable Supabase database, then run the script with `psql`. Standard `supabase start` applies migrations first and fails because the initial migration assumes the bootstrap exists. The tests use rollback; never use production credentials/data.
- For Web Push SQL checks, follow the vault's Supabase/operations notes. Deploy migrations with `npx supabase db push` and `send-push` with `npx supabase functions deploy send-push --use-api` only when explicitly asked.
- Behavior changes need relevant tests. Before completion, run typecheck, tests, lint, format check, and build; report any environment-dependent integration test not run.

## Workflow notes

- Keep reusable business/operation decisions in the matching vault note; record reusable debugging solutions in `~/Projetos/Cofre/Learning/05 - Solucoes` without secrets or user-specific details.
- Follow `~/Projetos/Cofre/Health Support/09 - Guia de commits.md` when a commit is requested; do not commit unless asked.
