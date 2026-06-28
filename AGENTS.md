# Repository Guidelines

## Project Structure & Module Organization

This repository is a Binance account monitoring app with a React/Vite frontend and a Hono + tRPC backend.

- `src/`: frontend app code, including pages in `src/pages`, providers in `src/providers`, hooks in `src/hooks`, and shared UI in `src/components/ui`.
- `api/`: backend entrypoint, tRPC routers, services, middleware, and environment helpers.
- `contracts/`: shared TypeScript contracts and Binance API event/response types.
- `db/`: Drizzle schema, relations, seed script, and SQL migrations under `db/migrations`.
- Tests currently live beside backend code as `api/**/*.test.ts` or `api/**/*.spec.ts`.

## Build, Test, and Development Commands

- `npm run dev`: start the Vite dev server with the Hono backend integration.
- `npm run check`: run TypeScript project checks.
- `npm run lint`: run ESLint. Existing shadcn-style exports may produce Fast Refresh warnings.
- `npm test`: run Vitest tests.
- `npm run build`: build frontend assets and bundle the backend into `dist/`.
- `npm start`: run the production server from `dist/boot.js`.
- `npm run db:generate` / `npm run db:migrate`: generate and apply Drizzle migrations.

## Coding Style & Naming Conventions

Use TypeScript throughout. Prefer explicit domain types from `contracts/` and Drizzle inferred types over `any`. Follow the existing two-space JSON style and semicolon-heavy TypeScript style in backend files. React components use PascalCase, hooks use `useX`, service classes use PascalCase, and route procedures use camelCase names such as `startMonitor` and `syncTrades`.

Run `npm run lint` and `npm run check` before submitting changes.

## Testing Guidelines

Vitest is configured for Node tests in `vitest.config.ts`. Add tests as `api/**/*.test.ts` or `api/**/*.spec.ts`. Focus tests on protocol parsing, secret handling, state transforms, and pagination/windowing logic. Keep external Binance calls mocked or isolated; do not require live API credentials in unit tests.

## Commit & Pull Request Guidelines

Git history uses concise conventional-style subjects such as `fix: ...`, `feat: ...`, `docs(...): ...`, and `chore: ...`. Keep commits focused and imperative.

Pull requests should include a short summary, verification commands run, migration notes when `db/` changes, and screenshots only for visible UI changes. Link related issues when available.

## Security & Configuration Tips

Copy `.env.example` to `.env`. Production requires `DATABASE_URL` and `SECRETS_KEY`; do not rotate `SECRETS_KEY` casually because existing encrypted credentials depend on it. Never commit `.env`, API keys, Telegram tokens, database dumps, or generated `dist/` output.
