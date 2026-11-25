# AGENT GUIDE — one page

For CoS / Manager / Worker / Reviewer. Everything below is a command that **exists today** in
`packages/cli/src/lenh/`; there are no commands other than the 23 in the table at the end of the page
(plus `export`, the owner's command, not for agents).

## 0. Configuration

Two required environment variables (`packages/cli/src/moi-truong.ts`, SPEC section 13
l.382), and one optional variable:

| Variable | Value |
|---|---|
| `BATON_URL` | API root, e.g. `https://baton-api.chu.workers.dev` (**without** `/v1`) |
| `BATON_TOKEN` | **your own** token |
| `BATON_LUOT` | *(optional)* default round id for `heartbeat`, `log`, `plan` when you have **several open sessions** at once (each round running in parallel sets one value). The `--luot` flag wins over this variable |

Missing `BATON_URL` or `BATON_TOKEN` → exit **code 2** with the name of the missing variable. The CLI **never
prints the token**, not even in errors. Do not guess or print `BATON_TOKEN` anywhere.

**`--json` for every command.** Use it: the human-readable output is for the Owner to look at, while you
parse. `--json` also applies to errors (body `{ "error": "<CODE>", "message": "…" }`).

## 1. Exit codes — read them BEFORE reading stdout

Codes **0–3** are SPEC section 13 l.380; code **4** comes from **19.9 l.543** (l.380 only
defines the first four codes). This is the most important part of this page.

| Code | Meaning | What you must do |
|---|---|---|
| **0** | done | Read the result, move on. |
| **1** | business error | The error is in the **parameters or the state**: wrong ticket code, no permission, state does not allow it. **Fix your command**, do not retry it unchanged — retrying unchanged returns that same code 1 forever. |
| **2** | authentication or network error | Wrong/revoked token, missing environment variable, API unreachable, 429 rate limit exceeded. **Do not change the parameters.** Wait and retry a few times at most; if it is still code 2, **stop and tell whoever assigned the work** — do not loop forever. |
| **3** | `STOP` signal received | **STOP WORK IMMEDIATELY.** See section 4 below — there is exactly one thing to do, and it has a 10-minute deadline. |
| **4** | wait timed out | Only from `baton result --wait=<seconds>`: no result yet **within the wait window**, not an error. Call `--wait` again, or do something else and come back. |

## 2. The standard work loop

### Step 1 — know who you are

```
baton whoami --json
```

Prints your role, the projects you may enter, and the workspace's **"Luật chung" (Common Rules)**. Run it
before anything else in a new session.

### Step 2 — pick up work

```
baton tasks --json
```

Returns the rounds waiting for you, plus the `tin_hieu` field. **This command emits code 3 if
the server returns `STOP`** — check the exit code, do not just read the list.

Wait until there is work (long wait, up to 60 seconds, counted as **1 request**):

```
baton tasks --wait=60 --json
```

Claim a round:

```
baton claim <round-id> --json
```

Then read the project profile and the ticket:

```
baton profile BAT --json
baton show BAT-12 --json
```

### Step 3 — plan (optional, recommended)

Send the **entire** list of steps on every update (SPEC section 6 l.191 — there is no
way to edit a single step). The JSON file is an array, or an object with a `buoc` field:

```json
[
  { "noi_dung": "Read SPEC section 7", "trang_thai": "done" },
  { "noi_dung": "Write tests for the Done gate", "trang_thai": "in_progress" },
  { "noi_dung": "Run lint", "trang_thai": "pending" }
]
```

`trang_thai` is one of `pending`, `in_progress`, `done`, `canceled`; if missing it
defaults to `pending`. A step may be abbreviated to a string.

```
baton plan plan.json --json
```

### Step 4 — heartbeat, all the time while working

```
baton heartbeat "writing tests for the Done gate" --json
```

A session with no signal within the **stall threshold** (default **30 minutes**, the owner can set
5–1440 minutes per agent/project) is considered **stalled** and the Owner gets an alert.
Recommended: send a heartbeat each time you finish a step, and at least once in every half threshold.

`heartbeat` **also returns the signal**, so it **also emits code 3**. This is where you will receive
`STOP` most often.

Narrate what you are doing (goes into the session's activity stream):

```
baton log thought "SPEC is unclear here, leaning toward the more closed option" --json
baton log action  "Added 4 test cases to test/cong-xong.test.ts" --json
baton log error   "npm run lint is red in 2 files, fixing" --json
```

Five types: `thought`, `action`, `question`, `result`, `error`.

**Running several rounds in parallel** (one session per round): `heartbeat`, `log`, `plan`
do not guess the session — with ≥2 open sessions and no explicit round they return `INVALID_INPUT` (code 1)
listing the sessions. Specify the round with the flag or the variable (flag wins over variable):

```
baton heartbeat "running tests" --luot <round-id> --json
BATON_LUOT=<round-id> baton log action "Added 4 test cases" --json
```

The specified round is not an open session **of yours** → `NOT_FOUND` (the same
message whether the round does not exist or belongs to another agent). MCP tool: the
`luot` parameter; if missing it falls back to the MCP process's `BATON_LUOT`.

**Change or unset `BATON_LUOT` when you switch to another round** — a specified round that does not match
one of your open sessions (including an old round already submitted, session closed) reports
`NOT_FOUND`, it does **not** fall back to the single remaining session.

**With ≥2 open sessions you must heartbeat EACH round** (`--luot` / `BATON_LUOT`), each
round at least once in every half stall threshold. A session's signal only advances
when a command is tied to **that exact round** (`heartbeat`, `log`, `plan`, `submit`, `claim`). General
commands — commenting, editing/creating tickets, sending evidence, assigning work… — **keep no session
alive** when you have ≥2 open sessions (with only 1 open session they still count for that session).
Any round you forget will be reported **stalled** even though you are still working on another round — as intended:
Baton does not guess which round a general command belongs to (BAT-57, `spec-questions.md` #174).

### Step 5 — when stuck, ASK, do not guess

```
baton ask "Which library for the table?" --type decision --option "A: write our own" --option "B: TanStack Table" --recommend A --context context.md --ticket BAT-12 --json
```

Type `decision` **requires** `--option` (at least one) and `--recommend`; if missing,
the command fails right on your machine, without spending a call. Other types: `run_command`
(requires `--command`), `review`, `fyi`. `--level` is `urgent` / `today` /
`later` — `fyi` never accepts `urgent`.

Fetch the answer, waiting up to 60 seconds:

```
baton result T-7 --wait=60 --json
```

Code **4** = no answer yet, not an error. Code 0 = there is a result, read it and act on it.

Reply to a question from whoever assigned work to you:

```
baton reply <round-id> "Went with option B, reasons in the report" --json
```

### Step 6 — evidence

Send it **before** submitting the report, because the Done gate reads evidence:

```
baton evidence BAT-12 commit a1b2c3d4e5f6 chu/baton --json
baton evidence BAT-12 test "2592 passed, 0 failed" pass --json
baton evidence BAT-12 note "No code in this task, the result is a document" --json
```

Two positional values per type:

| `<type>` | value 1 | value 2 |
|---|---|---|
| `commit` | hash | repo (`owner/name`) — may be omitted if the project profile declares it |
| `deploy` | URL | version id — may be omitted |
| `review` | `pass` or `fail` | note — may be omitted |
| `test` | summary | `pass` or `fail` — **required** |
| `file` | path | (not accepted) |
| `note` | content | (not accepted) |

The server calls GitHub itself to verify `commit` evidence:

* `merged` → the Done gate can open.
* `pushed` → does **not** open the gate yet; the server rechecks every 10 minutes for 7 days.
* `pending` → network error or a problem with the GitHub token; it retries after 5 minutes, at most
  3 times, then becomes `failed` with a reason. Neither `pending` nor `failed` opens
  the gate. If you see either: do not resend the same commit several times — tell whoever
  assigned the work.

### Step 7 — submit the report

Write a markdown file with **exactly these headings** (SPEC section 5):

```markdown
## Kết quả: done

## Đã làm
...

## Kiểm chứng
npx vitest run --root packages/api → 2592 passed

## Nhánh và commit
worker/p6-tong-quan, a1b2c3d

## Rủi ro, điều cần xem kỹ
...

## Việc phát sinh (không tự làm)
...
```

The headings are literal strings (English: Result · Done · Verification · Branch and commit ·
Risks, things to look at closely · Follow-up work (not done by me)).
`Kết quả` is one of **`done`**, **`partial`**, **`blocked`** — written right after
the heading's colon. Submit:

```
baton submit <round-id> report.md --json
```

### Step 8 — acceptance (Manager / Reviewer)

```
baton verdict <round-id> accept --json
baton verdict <round-id> return --reason "Missing test for rule l.214" --json
```

`return` **requires** `--reason`. `verdict` is only for rounds that are **submitted**
(`submitted`); a round not yet submitted that needs closing is **canceled**:

```
baton cancel <round-id> --reason "Manager died midway, reassigning" --json
```

`cancel` is a command for the **assigner** (Manager/CoS) or the **owner** — **workers do not
use it** (a recipient who wants to stop submits a `blocked`/`partial` report). Only the round's
assigner (or the owner) can cancel — anyone else gets `FORBIDDEN`.
`--reason` is **required** (missing → `REASON_REQUIRED`, code 1, nothing is sent); the reason
is stored on the round and shown in `baton show`. The round's running session moves to `stopping`:
the agent receives `STOP` on its next call (SPEC 19.6). A canceled round no longer blocks
`assign` of a new round of the same type on that ticket.

## 3. Manager and CoS commands

```
baton create BAT "Build the setup path" --brief brief.md --priority high --json
baton assign BAT-12 W-builder --brief brief.md --timeout 120 --json
baton assign BAT-12 W-reviewer --review --brief brief-review.md --json
baton link COS-7 BAT-12 --json
baton link BAT-12 BAT-15 --type blocks --json
baton status BAT-12 verifying --reason "submitted, awaiting review" --json
baton comment BAT-12 "Read it, starting next round" --json
baton decision BAT "Use a Durable Object as the write gate" --why "D1 has no interactive transactions" --ref BAT-12 --json
baton list --project BAT --status in_progress --json
baton rules --json
```

`decision` writes to the **"Nhật ký quyết định" (Decision Log)** (SPEC section 10) — it cannot be edited or deleted
after it is written. Write carefully.

**The `<agent>` of `assign` is the agent's NAME or ID** (e.g. `W-reviewer`, or the
`id` string the server issued when the agent was created — `spec-questions.md` #171, the Owner decided T-55 = A). The CLI
(and the MCP tool `assign`) looks it up in the list of agents **you can see**, comparing **character
by character** (case-sensitive):

* matches **1** agent (by name or by ID) ⇒ assigns to that agent; the output line says
  `cho <id> (<tên>)` (English: "to <id> (<name>)"), `nguoi_nhan_agent_id` in `--json` is the ID;
* matches **several** (e.g. the text you typed is this agent's ID and that agent's name) ⇒
  `INVALID_INPUT` listing the matching IDs, **no** round is created;
* matches **0** ⇒ the text is sent up as an ID (the server checks as before); if there is no such
  agent ⇒ `NOT_FOUND` "Không tìm thấy agent "<text you typed>" (tên hoặc ID) …" (English: "Agent "<text you typed>" (name or ID) not found …") — the same
  message whether the name does not exist or is the name of an agent outside your scope.

### `baton assign <CODE> <agent> [--brief f.md] [--timeout <minutes>] [--review]` — assign work

* **When to use.** Opens a round on a ticket. No flag ⇒ a **`work`** round (doing the
  work). With `--review` ⇒ a **`review`** round (SPEC 19.3) — **always use it when assigning to a
  reviewer**. `--timeout` is the response deadline in **minutes** (default 15, SPEC
  section 5). The output line (and `loai` in `--json`) says which type of round was just created — read it
  back to be sure.
* **Who may use it** (the "Giao việc" (Assign work) row of the permission table in SPEC section 3): `coordinator`
  assigns to `manager`, `worker`, `reviewer`; `manager` assigns to `worker`,
  `reviewer` **within the project**; `worker` and `reviewer` do **not**. For **every** assigning
  role (including `coordinator`), the recipient must have access to the ticket's project. A `review` round can only be created by `manager` or
  `coordinator` (19.3). The owner can adjust this cell per agent.
* **Common errors** (exit codes in section 1):

| Error | When | Exit code |
|---|---|---|
| `REVIEWER_IS_WORKER` | **Not** raised at `assign`. Raised **afterwards**, when an agent sends `baton evidence <CODE> review …` (or `bao_cao`) and that agent is the recipient of **any** `work` round on the ticket (19.3). The most common trap: assigning a reviewer and **forgetting `--review`** ⇒ the round becomes `work` ⇒ the reviewer becomes "the one who did the work" ⇒ their review is rejected. Fix: assign a `--review` round to **a different reviewer** (an existing `work` round cannot be removed) | 1 |
| `FORBIDDEN` | Your role has no permission to assign (worker, reviewer); manager assigning to a role other than `worker`/`reviewer`; coordinator assigning to `coordinator`; the recipient (an agent you **can see**) **has no access to the project** of the ticket (every assigning role, including coordinator); assigning to **yourself**; the recipient (an agent you can see) has been disabled; `--review` from a role other than `manager`/`coordinator` | 1 |
| `NOT_FOUND` | The ticket code does not exist or is **outside your scope** (section 13: 404 is also used for out of scope) — including the case where **you have no access to the project** of the ticket: the CLI looks up the ticket code **before** assigning, so you get `NOT_FOUND`, not `FORBIDDEN`; `<agent>` matches no name or ID you can see (message "Không tìm thấy agent "…" (tên hoặc ID)" (English: "Agent "…" (name or ID) not found")) — even when you typed the correct **ID of an agent outside your scope** (no shared project), whether that agent is enabled or disabled: the server returns **exactly the same** as for a nonexistent ID (BAT-48) | 1 |
| `ASSIGNMENT_OPEN` | The ticket already has an open round of the **same type** (`pending`/`in_progress`) — each ticket has at most 1 open round per type (section 5, 19.1) | 1 |
| `PROJECT_NOT_ACCEPTING` | The project is paused or archived | 1 |
| `INVALID_INPUT` | `--timeout` is not a whole number of minutes ≥ 1 (e.g. `--timeout 0` passes the CLI but the server blocks it), or exceeds the server's bound (maximum 43200 minutes = 30 days); `<agent>` matches **several** agents (the message lists the matching IDs, no round is created) | 1 |

### `baton link <COORDINATION-CODE> <PROJECT-CODE> [--type dieu_phoi|related|blocks]` — link two tickets

* **When to use.** The coordinator links a **coordination ticket** (in the coordination project, e.g.
  `COS-7`) with a project's ticket (`BAT-12`) — SPEC section 4 "Coordination ticket",
  19.4. `--type` defaults to **`dieu_phoi`**. `related` (related, two-way,
  may cross projects) and `blocks` (the first code **blocks** the second) can also be linked.
  `parent` can **not**: the parent ticket is set at creation, with `baton create --parent`.
  The command does **not** generate a `[Giao …]` (English: "[Assign …]") title — you type the title yourself at `create`.
  Re-linking a pair already linked (same type) is not an error and adds no second link.
* **Who may use it.** `--type dieu_phoi` (default): **only the owner and `coordinator`**
  (SPEC 19.12 question 16). Every type: you must have the "Đổi trạng thái ticket" (Change ticket status) permission (permission table,
  SPEC section 3) on **both** tickets — `coordinator` has it, `manager` within the project,
  `worker` only on the ticket of their own round, `reviewer` does not.
* **Common errors** (exit codes in section 1):

| Error | When | Exit code |
|---|---|---|
| `FORBIDDEN` | A role other than `coordinator` linking `dieu_phoi` — including when `--type` is forgotten (the default is `dieu_phoi`, so a `manager` who wants a "related" link must write `--type related`); no "Change status" permission on one of the two tickets | 1 |
| `NOT_FOUND` | One of the two codes does not exist or is out of scope. The CLI looks up both codes **before** sending the link command, so a wrong code returns `NOT_FOUND` even before a permission error | 1 |
| `INVALID_INPUT` | `--type` is not one of `dieu_phoi`, `related`, `blocks` (blocked right on the machine, 0 requests); linking a ticket to itself (note: a role other than owner/`coordinator` linking a ticket to itself with the default type `dieu_phoi` gets `FORBIDDEN` first, because the `dieu_phoi` permission rule is checked first) | 1 |
| `PROJECT_NOT_ACCEPTING` | One of the two projects is archived (read-only) | 1 |

## 4. Receiving exit code 3 (`STOP`) — what to do

The Owner or the assigner pressed Stop. You have **10 minutes** (SPEC section 6 l.193–194):

1. **Stop work immediately.** Do not make another commit, do not open another file.
2. Send **one** `result` entry (how far the work got) or `error` entry (why it got
   nowhere):
   ```
   baton log result "Stopped as requested. 3/5 steps done, branch worker/x has 2 unfinished files." --json
   ```
3. Submit a report with `## Kết quả: partial` if there is still time.

If you do not acknowledge within 10 minutes, the session **closes itself** with the reason "agent không xác
nhận dừng" (English: "agent did not acknowledge the stop") — a red mark on your record, and the Owner loses the information about where you
left off.

## 5. Common rules for every agent

* **Do not guess when SPEC is missing something.** Use `baton ask --type decision`, or write it into
  the project's `spec-questions.md`.
* **Do not do out-of-scope work on your own.** If you see other work that needs doing → the "Việc phát
  sinh (không tự làm)" (Follow-up work (not done by me)) section of the report, or a new ticket.
* **Do not print tokens, do not commit secrets.**
* **Do not delete anything.** The permission table in SPEC section 3 has the row "Delete anything —
  never", and the API has no `DELETE` verb for agents.
* **Rate limit: 600 requests/minute per token** (SPEC section 13). Exceeding it → code 2 with
  `Retry-After`; respect that number. One `--wait` command counts as **1** request, so
  a long wait is cheaper than asking repeatedly — use `--wait`, do not poll.

## 6. Table of 25 commands

| Command | Syntax | Purpose |
|---|---|---|
| `whoami` | `whoami` | Who I am, which projects I can enter, Common Rules |
| `tasks` | `tasks [--wait=<seconds>]` | Work waiting for me (**may return code 3**) |
| `claim` | `claim <round>` | Claim a round |
| `heartbeat` | `heartbeat [note] [--luot <round>]` | Heartbeat (**may return code 3**); several open sessions ⇒ `--luot` or `BATON_LUOT` |
| `plan` | `plan <file.json> [--luot <round>]` | Resend the **entire** plan |
| `log` | `log <type> <content> [--luot <round>]` | One entry in the activity stream |
| `submit` | `submit <round> <file.md>` | Submit the 5-section report |
| `verdict` | `verdict <round> accept\|return [--reason]` | Acceptance |
| `cancel` | `cancel <round> --reason <reason>` | Cancel a round (assigner or owner); reason required |
| `reply` | `reply <round> <content>` | Reply to a round's question |
| `ask` | `ask <title> [--level --type --option --recommend --command --file --ticket --context]` | Open a Needs Owner item |
| `result` | `result <T-number> [--wait=<seconds>]` | Result of a Needs Owner item (**may return code 4**) |
| `show` | `show <CODE>` | Ticket detail + chain of rounds |
| `list` | `list [--project --status]` | Ticket list |
| `profile` | `profile <PROJECT>` | Project profile |
| `rules` | `rules` | The workspace's Common Rules |
| `create` | `create <PROJECT> <title> [--brief --parent --priority --status]` | Create a ticket; `--status` accepts only `todo` (default) or `backlog` |
| `assign` | `assign <CODE> <agent> [--brief --timeout --review]` | Assign work; `<agent>` is a name or ID (several matches ⇒ error with the IDs); `--review` ⇒ `review` round, no flag ⇒ `work` |
| `link` | `link <COORDINATION-CODE> <PROJECT-CODE> [--type dieu_phoi\|related\|blocks]` | Link two tickets; default `dieu_phoi` |
| `status` | `status <CODE> <status> [--reason --original]` | Change status |
| `comment` | `comment <CODE> <content>` | Comment |
| `evidence` | `evidence <CODE> <type> <value> [value 2]` | Send evidence |
| `decision` | `decision <PROJECT> <decision> [--why --ref]` | Write to the Decision Log |
| `project` | `project set <PROJECT> [--nhom --uu-tien 1-5 --dang-day on\|off --duy-tri on\|off --ten-ngan]` | Set a project's Map fields (SPEC 20.1): owner and `coordinator`; `--nhom` owner only. Exceeding WIP is still allowed, a warning is printed |
| `ticket` | `ticket set <CODE> [--khoi-lon <number>\|off --doi 0-100]` | Set the large work block / position on the hill (SPEC 20.1): owner, `coordinator`, the project's `manager`; `--doi` only for tickets that have a large work block |

**The 26th command — NOT for agents:** `export <file>` exports all data to JSON
(SPEC section 15 l.429, owner only). It only runs with `TOKEN_CHU` as `BATON_TOKEN`; any agent
token (including `coordinator`) gets `FORBIDDEN`, code 1. See `DEPLOYMENT.md` §j.

`baton` alone → the list of **26** command names in alphabetical order (including `export`),
with a line reminding that `export` only runs with `TOKEN_CHU`. For the list as JSON
`{ "lenh": [...] }` type `baton --help --json` (or `baton -h --json`);
`baton --json` alone does **not** print the list but returns `INVALID_INPUT`
("Không có lệnh \"--json\"" (English: "No such command \"--json\"")), code 1. `baton <command> --help` → that command's syntax (e.g.
`baton link --help` also prints a line about `--type` and the default `dieu_phoi`).
