# SignalApp developer docs

Start here if you're new to the project. Read these in order. Together they take about 30 minutes.

| # | Document | What you'll learn |
|---|---|---|
| 1 | [What SignalApp is](01-product-overview.md) | The problem it solves, and a full walkthrough with an example company |
| 2 | [Roles and workflow](02-roles-and-workflow.md) | The six user roles, what each can do, and the life of an account |
| 3 | [Architecture and tech stack](03-architecture.md) | How the pieces fit, which technologies we use, and why |
| 4 | [Codebase tour](04-codebase-tour.md) | Where things live and how to add a feature |
| 5 | [Data model](05-data-model.md) | The database tables and how they relate |
| 6 | [Rules that must never break](06-security-and-rules.md) | Tenant isolation, permissions, suppression, the 12 release gates |
| 7 | [Setup, testing and migrations](07-setup-and-testing.md) | Running locally, tests, database changes |
| 8 | [12 test gates](08-12-test-gates.md) | Each Phase 1 release gate, with step-by-step manual tests |

## One-paragraph summary

SignalApp is a multi-tenant web app for companies that sell servers, infrastructure and managed IT. It finds companies showing buying signals on the web (expansion, infrastructure hiring, hardware refresh, tenders), stores cited evidence, helps the team qualify each account, routes it through a sales-manager approval, and tracks the follow-up work: SDR tasks, drafts and partner handoffs. It **never sends emails or makes calls**; people do the contacting. The project is built in phases from the *Infrastructure Signal Developer Specification*; **Phase 1 is complete**. Phases 2–4 (CRM sync, monitors, email campaigns, score optimization) are not built.

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Research, qualification, acceptance, tasks, drafts, handoff records, reports | ✅ Done, all 12 release gates have automated tests |
| 2 | CRM integration, scheduled monitors, notifications | Not started |
| 3 | Approved email campaigns, mailbox sending, replies | Not started |
| 4 | Score calibration from outcomes | Not started |
