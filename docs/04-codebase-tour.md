# 4. Codebase tour

```
SignalApp/
├── docs/                 ← you are here
├── backend/              API + worker (Node, TypeScript)
└── frontend/             Web app (Next.js)
```

## Backend (`backend/src`)

| Folder / file | Responsibility |
|---|---|
| `index.ts` / `app.ts` | Start the API / build the Fastify app (used by tests too) |
| `worker.ts` | Background worker: research runs and CSV imports |
| `config/env.ts` | Validated environment variables (fails fast if missing) |
| `auth/` | Password hashing, sessions, **role → capability map** (`permissions.ts`) |
| `middleware/` | `authenticate.ts` (session), `requireMembership.ts` (workspace access, capability checks, SDR scoping), `errorHandler.ts` |
| `routes/v1/` | One file per feature. Thin: authenticate → check access → validate with Zod → call a service |
| `services/` | Business rules: `acceptance`, `qualification`, `tasks`, `handoffs`, `evidence`, `drafts`, `suppressions`, `merges`, `outcomes`, `budget`, `briefParser`, … |
| `jobs/` | Queue setup (`queue.ts`) and job handlers (`researchRun.ts`, `csvImport.ts`) |
| `providers/research/` | Research provider contract (`types.ts`) and the Exa adapter (`exa.ts`) |
| `db/schema/` | Drizzle table definitions, one file per area |
| `db/migrations/` | Numbered SQL migrations, named by purpose |
| `db/seed.ts` | Creates a tenant, workspace and first admin from env vars |
| `utils/` | CSV parsing/escaping, normalizers (domain, country, URL, company name), secret redaction, IDs, error helpers |
| `test/gates.test.ts` | The 12 Phase 1 release gates as end-to-end tests |

**Request flow:** `routes/v1/tasks.ts` → `services/tasks.ts` → tables in `db/schema/workflow.ts`.

## Frontend (`frontend/src`)

Pages in `app/` are grouped **by portal**. Each folder name is also the URL.

```
app/
├── layout.tsx, page.tsx   root layout (fonts + shared workspace shell) and `/` → /login
├── login/                 /login, with its own centered layout
├── platform/              platform admin portal: /platform/*
├── tenant-admin/          /tenant-admin/members, /tenant-admin/workspaces
├── researcher/            /researcher (opportunity feed), /researcher/search, /researcher/playbooks
├── sales-reviewer/        /sales-reviewer (sales acceptance queue)
├── sdr/                   /sdr (tasks), /sdr/drafts
├── partner/               /partner/*
├── accounts/              shared: /accounts/*
├── reports/               shared: /reports/*
└── settings/              shared: /settings/*
```

A page lives in the portal of the role it mainly serves; pages several roles use (`accounts`, `reports`, `settings`) sit at the top level. Other roles can still open a portal page when they have the capability (e.g. researchers use `/sdr`): access is decided by `RequireCap` and the server, never by the folder. All portals except `login` and `platform` share one workspace shell (`components/layout/RouteShell.tsx` → `PortalLayout`), so the workspace loads once per session.

Detail pages (`accounts/detail`, `accounts/qualification`, `partner/handoff`, `tenant-admin/workspaces/detail`) read the record ID from `?id=…` with `useSearchParams()`; `RouteShell` provides the `<Suspense>` boundary Next.js requires for that.

| Folder | Responsibility |
|---|---|
| `components/layout/` | Workspace shell: `RouteShell`, `AppShell` (sidebar, role-filtered menus), `PortalLayout` (auth + redirects), `AttentionBell`, `PageHeader` |
| `components/platform/` | Platform admin only: `PlatformShell`, `PlatformBell`, company tables/cards |
| `components/ui/` | Buttons, cards, badges, form fields (`Field.tsx`) |
| `components/common/` | Loading / empty / error states, `RequireCap` page guard, `StatusBadge` |
| `components/<feature>/` | Shared feature UI: `accounts`, `research`, `qualification`, `tasks`, `drafts`, `handoffs` |
| `hooks/useWorkspace.tsx` | Current user, workspace, role and `can(capability)` |
| `hooks/useResearchRun.ts` | Polls a research run until it finishes |
| `lib/api/` | Typed API clients, one file per feature |
| `lib/auth/` | Login/session calls and capability/role labels |

**Page flow:** a page in `app/` wraps itself in `<RequireCap cap="…">`, loads data through `lib/api/*`, and renders components.

## Pages

| URL | Who | Purpose |
|---|---|---|
| `/login` | Everyone | Sign in |
| `/settings/password` | Everyone | Change password (forced after a temporary password) |
| `/researcher`, `/researcher/search`, `/researcher/playbooks` | Researcher, admin | Opportunity feed, brief-based search, playbooks |
| `/accounts`, `/accounts/detail?id=…`, `/accounts/qualification?id=…` | Internal roles | Watchlist & import, account brief, qualification |
| `/sales-reviewer`, `/accounts/pipeline` | Reviewer / researcher | Review queue, accepted accounts |
| `/sdr`, `/sdr/drafts` | Internal roles | SDR task queue, drafts |
| `/reports/outcomes` | Most roles | Outcome metrics |
| `/settings/*` | Admin (some to researchers) | Offer, members, suppressions, connections, how it works |
| `/partner`, `/partner/handoff?id=…` | Partner | Shared handoffs |

## How to add a feature (checklist)

1. **Schema**: add columns/tables in `db/schema/*.ts` **and** a new numbered SQL migration named by purpose (e.g. `0006_add_task_labels.sql`) plus its `meta/_journal.json` entry.
2. **Service**: put rules in `services/`. Always filter by `tenantId` + `workspaceId`.
3. **Route**: `authenticateRequired` → `loadMembership` → `requireCap` (and `assertAccountReadable` for account data) → Zod → service.
4. **Capability**: if it's a new kind of action, add it to `auth/permissions.ts` and `frontend/src/lib/auth/capabilities.ts`.
5. **Frontend**: API client in `lib/api/`, page under the right portal folder in `app/` (or a top-level shared folder if several roles use it), guarded with `RequireCap` / `can()`.
6. **Test**: add a gate-style test if it touches access, suppression, money (budget) or state machines.
