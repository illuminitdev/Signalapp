# 2. Roles and workflow

## The six roles

Roles are assigned per **workspace membership**. Permissions are enforced on the **server**. The UI hiding menus is only a convenience. The source of truth is `backend/src/auth/permissions.ts`.

| Role | Can do | Sees in the menu |
|---|---|---|
| **Tenant admin** | Everything below, plus members, settings, suppression list, research kill switch | All sections |
| **Researcher** | Discover, import, run research, review evidence, qualify, submit for review, drafts, export | Discover, Accounts, Outreach, Reports, Settings → How it works / Connections |
| **SDR** | Assigned accounts only (owned or with a task); tasks, outcomes, qualification notes, approved-draft export | Accounts, Outreach, Reports |
| **Sales reviewer** | Review evidence, accept / return / reject, assign owners, prepare and share partner handoffs | Accounts (incl. Sales acceptance), Outreach, Reports |
| **Partner** | Only handoffs shared with them, only the permitted fields; acknowledge or return | "Shared with me" only |
| **Analyst** | Read-only reports | Reports |

There is **no platform-wide super-admin**. A tenant admin's power stops at their own tenant. New tenants are created with the seed script (see [setup](07-setup-and-testing.md)).

### Capabilities
Each role maps to a list of capabilities such as `view_accounts`, `research`, `accept`, `share_handoff`. Routes check capabilities, never role names, with one deliberate exception: SDR account scoping (`accountScope()` in `middleware/requireMembership.ts`). `GET /v1/workspaces` returns the caller's capabilities, and the frontend's `useWorkspace().can()` uses them to show or hide UI.

## State machines

### Account research state
`unresearched → researching → researched | failed`. Imported and discovered accounts always start *unresearched*.

### Sales acceptance (`services/acceptance.ts`)
```
            submit (researcher)              accept (reviewer)
 Draft ────────────────────────► Ready for review ─────────────► Accepted
 Needs research ───submit──────►      │   │                          │
        ▲                             │   └── reject ──► Rejected    │
        └─────── return (reviewer) ───┘                    │         │
                                                           └─reopen──┴──► Ready for review
```
- **Submit** needs a saved rationale (the note for the reviewer). Qualification facts are optional.
- **Send to sales reviewer** (on a research task, `POST /v1/tasks/:taskId/send-for-review`) does the researcher's hand-off in one step: saves the note as the rationale, submits, creates a *Sales review* task for the chosen reviewer and completes the research task. It needs at least one reviewed evidence item.
- **Accept** needs ≥1 *reviewed* evidence item, an active-member owner, a next action, no active suppression, and any workspace acceptance gates.
- **Return / reject** need a reason category. **Reopen** needs a reason.
- A material qualification change on an accepted account returns it to *Ready for review* automatically.
- Any other transition is refused (409).

### Tasks (`services/tasks.ts`)
Only the tenant admin sees and updates everyone's tasks (Outreach → Tasks, "All tasks"). Every other role sees and updates only tasks it owns ("My tasks"); this is enforced in `routes/v1/tasks.ts`.

`Open ⇄ In progress → Completed | Cancelled` (terminal). Completion needs an outcome; cancellation needs a reason. Follow-up tasks need explicit confirmation.

### Partner handoff (`services/handoffs.ts`)
`Prepared → Shared → Acknowledged / Returned → Closed`. *Prepared* grants nothing. Only a reviewer shares, to a named Partner member. Closing revokes access. Returning needs a reason.

### Research run (`jobs/handlers/researchRun.ts`)
`queued → running → completed | failed | cancelled`, with `retrying` between attempts. "Completed with no results" is its own outcome; it is never treated as proof that nothing is happening.

## End-to-end flow
```
Configure offer & territory ─► Discover / import ─► Research (evidence)
   ─► Review evidence ─► Qualify ─► Submit ─► Accept ─► SDR tasks & drafts
   ─► Record outcome ─► (optional) Partner handoff ─► Reports
```
Research and sales review tasks may be created before acceptance. Contact tasks (call/email/follow-up) are blocked for suppressed accounts. A researcher can hand a submitted account to a named reviewer with a *Sales review* task.
