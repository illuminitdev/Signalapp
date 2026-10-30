# 8. 12 test gates

The *Infrastructure Signal Developer Specification* (§10) says Phase 1 can only ship when all **12 release gates** pass. This page explains each gate and gives step-by-step instructions to test it by hand in the app.

The same gates also have automated tests in [`backend/src/test/gates.test.ts`](../backend/src/test/gates.test.ts). See [Running the automated tests](#running-the-automated-tests) at the end.

## Before you start

1. In the **platform admin**, create two companies: **Company A** and **Company B**.
2. In Company A, add one user for each role: **tenant admin, researcher, sales reviewer, SDR, partner, analyst**.
3. Give Company B its own tenant admin.
4. Use separate browsers or private windows so you can be signed in as several people at once.
5. Have at least one account with research evidence in Company A.

Record each result as **Pass** or **Fail**, with a note or screenshot for any failure.

---

## Gate 1: Another company can't see or change your data

**Why it matters:** each company's accounts, evidence and briefs are private (spec §4).

**Steps**
1. As Company A, open an account and copy its address from the browser bar (`/accounts/detail?id=…`).
2. Sign in as **Company B's admin** and paste that same address.
3. Repeat with a research run id and an export link from Company A.
4. As Company B, search for Company A's account name.

**✅ Pass when** Company B gets "not found" or "no access" every time, and Company A's accounts never appear in B's search, lists or exports.

---

## Gate 2: Delegated users only see their workspaces; removed users lose access

**Why it matters:** access comes only from an explicit workspace membership, and removing someone takes effect straight away (spec §4).

**Steps**
1. Give a user access to **Workspace 1 only**.
2. As that user, check the workspace switcher, and try opening a Workspace 2 page by URL.
3. As admin, remove that user from **Members** while they are signed in elsewhere.
4. In the removed user's window, click anything or refresh.

**✅ Pass when** the user never sees Workspace 2, and after removal their next action is refused (allow up to about 30 seconds).

---

## Gate 3: UK results show sources and separate dates

**Why it matters:** every signal must be traceable to a source, and unknown dates must stay unknown (spec R3).

**Steps**
1. Run research on a UK account, or run **Discover → Search** with a UK brief.
2. Open the account and look at **Cited evidence**.
3. Open the **Qualification brief**.

**✅ Pass when**
- each evidence item shows a **source link**, **publisher** and three separate dates: **event date**, **discovered** and **checked**;
- an unknown event date shows as **Unknown**, never a guessed date;
- non-UK sources are left out;
- unknown brief facts stay **Unknown**.

---

## Gate 4: Duplicates are reviewed, bad CSV rows give clear errors, exports are safe

**Why it matters:** imports must not create silent duplicates, and exports must not run hidden spreadsheet formulas (spec R2).

**Steps**
1. Prepare a CSV containing:
   - two rows for the same company (same domain, or a very similar name);
   - a row with no company name;
   - a row with a broken domain;
   - a row whose name is `=HYPERLINK("http://evil","x")`.
2. Import it under **Accounts → Watchlist & imports**.
3. Check the import report and the merge suggestions.
4. Export accounts to CSV and open the file in Excel.

**✅ Pass when**
- the duplicates appear as **merge candidates** to review, not merged silently;
- each bad row has a **clear, per-row error**;
- in Excel, the `=HYPERLINK…` name shows as **plain text**, not a working formula.

---

## Gate 5: Acceptance needs evidence, an owner and a next action

**Why it matters:** a brief can't be approved for sales without reviewed proof and someone accountable (spec R5).

**Steps**
1. As **researcher**, write the rationale and submit a brief for review.
2. As **sales reviewer**, try to **accept** it three times, each time missing one of:
   - reviewed evidence;
   - an assigned owner;
   - a next action.
3. As **researcher** or **SDR**, check that you can't accept a brief.
4. As **sales reviewer**, accept with all three in place.

**✅ Pass when** each missing item blocks acceptance with a clear message, only a reviewer or admin can accept, and acceptance succeeds once everything is there.

---

## Gate 6: Editing after acceptance needs re-review; saves can't overwrite each other

**Why it matters:** an approval must not survive a material change, and two people editing at once must not lose work (spec R5, §8).

**Steps**
1. Accept an account.
2. As **researcher**, change an important fact in its qualification brief.
3. Open the same brief in **two browsers** and save a different change in each, one after the other.

**✅ Pass when**
- the material edit sends the account back for **re-review**, and the earlier decision stays in the history;
- the second save is **refused** ("someone else saved first"), not silently overwritten.

---

## Gate 7: Completing a task needs an outcome and has no side effects

**Why it matters:** a task is a work record only; it must not pretend a meeting happened or move a deal (spec R6).

**Steps**
1. As **SDR**, open a task and try to **complete** it with no outcome.
2. Try to **cancel** a task with no reason.
3. Complete a task properly, with an outcome.
4. Check the account's **deal stage**, the **Meetings** figure in Reports, and confirm no email was sent.

**✅ Pass when** completing without an outcome and cancelling without a reason are both blocked, and after a proper completion the deal stage is unchanged, no meeting is recorded and nothing is sent.

---

## Gate 8: The suppression list is respected everywhere

**Why it matters:** opted-out companies and people must never be contacted (spec §9).

**Steps**
1. As admin, add a company domain (e.g. `acme.co.uk`) under **Settings → Suppressions**.
2. Run a discovery search that would find that company.
3. Try to create a contact task (call or email) on it.
4. Add a contact with an email at that domain under **People**.
5. Export accounts.

**✅ Pass when** the company is left out of discovery, contact tasks on it are blocked, the contact shows **"Suppressed: do not contact"**, and the export excludes or flags it.

---

## Gate 9: A handoff stays private until shared; partners see only allowed fields

**Why it matters:** recording a handoff must not leak data; partners get only what was approved (spec R7).

**Steps**
1. As **sales reviewer**, prepare a partner handoff on an accepted account, allowing only some brief fields.
2. **Before sharing**, sign in as the **partner**.
3. As reviewer, **share** the handoff.
4. Sign in as the partner again.

**✅ Pass when** the partner sees nothing before sharing, and after sharing sees **only that account** and **only the allowed fields**, with no search and no access to other accounts.

---

## Gate 10: Retries never charge twice; an exhausted budget stops research

**Why it matters:** research costs money, so usage must be exact and capped (spec §6).

**Steps**
1. Note the research units under **Settings → Connections & usage**.
2. Run one research job and check the units go up **once**.
3. In the platform admin, bring the company close to its monthly limit, then run research until the budget is used up.
4. Re-run research on the same account.

**✅ Pass when** units go up once per run, new research is **refused** with "budget exhausted" at the limit, and re-running doesn't create duplicate evidence.

> Provider timeouts followed by retries are hard to trigger by hand; the automated test covers that part.

---

## Gate 11: Reports match the real decisions and show their basis

**Why it matters:** numbers must be reconcilable and honest about how they are calculated (spec R9).

**Steps**
1. Record a known set of actions, e.g. accept 2 briefs, reject 1, return 1, and complete 3 tasks.
2. Open **Reports** as analyst, admin and reviewer.
3. Sign in as the partner and try to open Reports.

**✅ Pass when** the figures match exactly what you did, the acceptance rate shows its **denominator** (e.g. "of 4 accounts with a reviewer decision"), the date basis and currency are stated, and the partner can't open Reports.

---

## Gate 12: The Exa API key never leaks

**Why it matters:** provider secrets must stay on the server (spec §6).

**Steps**
1. Open the browser's developer tools (**F12**) → **Network** tab.
2. Use the app widely: research, search, account briefs, exports, and something that fails.
3. Search all responses (Ctrl+F in the Network panel) for part of your `EXA_API_KEY`.
4. Open a downloaded CSV export and search it the same way.
5. Search the backend terminal logs.

**✅ Pass when** the key appears **nowhere**: no browser response, export file or log line.

---

## Results checklist

| Gate | What it proves | Result | Notes |
|---|---|---|---|
| 1 | Company data is isolated | | |
| 2 | Workspace access and revocation | | |
| 3 | Sources and dates on UK results | | |
| 4 | Duplicates, CSV errors, safe exports | | |
| 5 | Acceptance requirements | | |
| 6 | Re-review and no silent overwrites | | |
| 7 | Tasks need outcomes, no side effects | | |
| 8 | Suppression honoured everywhere | | |
| 9 | Handoff sharing and partner limits | | |
| 10 | No double charging, budget cap | | |
| 11 | Reports reconcile | | |
| 12 | API key never leaks | | |

Phase 1 is complete when all 12 are **Pass**.

## Running the automated tests

The automated version of these gates lives in [`backend/src/test/gates.test.ts`](../backend/src/test/gates.test.ts). It creates its own companies and users, uses a fake research provider (no real Exa calls), and drives the real API.

It needs a **disposable database**, because it writes test data, and it refuses to run against your main `DATABASE_URL`.

1. Create a spare database, e.g. a new Neon branch.
2. Set `TEST_DATABASE_URL` to its connection string.
3. In `backend`, run `npm test`.

If `TEST_DATABASE_URL` is not set, the gate tests are skipped.
