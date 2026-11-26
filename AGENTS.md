<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## MinBook Agent Instructions
- Full project architecture, modules, equations, routes, and database schema are documented in `AGENT.md` (with deeper quantitative references in `docs/methodology.md`).
- Record major architectural changes, behavior updates, and verification runs (`npx tsc --noEmit`, `npm test`, `npm run build`) in `.ai/changelog.md`.
- **Aesthetic & UX:** High-contrast dark terminal aesthetic (`#09090b` canvas, `#111113` surface, `border-zinc-800/80` hairlines, Geist Mono `tabular-nums` on prices/metrics). Surface plain-English bias, gameplan, and target/bounce areas first; keep detailed quant math collapsed by default (`Show Quant Math`). Avoid jargon like "whipsaw".
- **Data Honesty & Multi-User Neutrality:** Every price, quote, and level must display its source, timestamp, and staleness badge (`FRESH`, `DELAYED`, `STALE`, `SAMPLE`). Never fabricate synthetic fallback prices, synthetic audit predictions, or hardcoded personal daily caps / "1 trade per day" rules.
- **Auth & Live Freshness Boundaries:** `src/proxy.ts` enforces Supabase SSR auth across app and private API routes (automatically falling back to local SQLite when `NEXT_PUBLIC_SUPABASE_URL` is unset). Keep `/api/market-data`, `/api/market-data/chart`, and `/api/calendar` set to `dynamic = "force-dynamic"` with `Cache-Control: no-store` so live bias and levels never go stale.
