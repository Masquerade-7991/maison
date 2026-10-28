<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Analytics

Customer-facing changes carry their analytics with them. Every event is listed in `docs/analytics/tracking-plan.md` and typed in `src/lib/analytics-events.ts`; send events only through `src/lib/analytics.ts` from client code, never with personal data in properties. `npm run check` (`src/lib/analytics-guard.check.mjs`) fails when they drift. Claude Code delegates this work to the `analytics-steward` agent (`.claude/agents/analytics-steward.md`).
