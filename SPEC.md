# Baton: SPEC v0.1

**Baton** is the place where **one owner and a team of AI agents** run their work, across **many projects**.
The owner decides and approves. Agents take work, do it, hand it off to each other and submit evidence.
The name comes from the relay baton: work is passed hand to hand through many legs, but it is always known whose hand it is in.

This document is the **only** thing the build session is allowed to read. It describes behaviour, not implementation.
Each feature states: what the user gets · trigger · inputs and outputs · states · errors · what is NOT done.

---

## 0. Product principles
1. **No limit** on the number of projects, tickets or agents. Performance target: 200 projects, 200,000 tickets, 100 agents, still smooth.
2. **"No ticket In progress = the project is stalled."** Status on Baton must reflect the real work.
3. **Done requires evidence.** "Done" means merged or live, with evidence attached.
4. **The owner is not asked piecemeal.** Everything that needs the owner lives in one single place (**"Cần Chủ"**, Needs Owner), approved in morning and evening sessions.
5. **Agents are first-class citizens.** An agent has its own identity, permissions, history and heartbeat. Agents running a CLI on a local machine still work; no server receiving webhooks is needed.
6. **A human is always ultimately responsible.** Agents do and propose; the owner decides the things on the must-ask list.
7. **Fast.** Every action shows its result on screen immediately. Every frequent action has a keyboard shortcut.
8. The interface is **Vietnamese** by default (with room for English later), Vietnam time (UTC+7), **light background**.

## 0.1 Machine codes (English) and display labels (Vietnamese)
Every code in the API, CLI, MCP, database and logs is in **English**. The interface, notifications and error messages show the **Vietnamese label** from this table.

| Group | Code → Label |
|---|---|
| Agent role | `coordinator` Điều phối (Coordinator) · `manager` Quản lý (Manager) · `worker` Người làm (Worker) · `reviewer` Người duyệt (Reviewer) |
| Project status | `active` Đang chạy (Running) · `paused` Tạm dừng (Paused) · `archived` Lưu trữ (Archived) |
| Agent status | `busy` Đang làm (Working) · `waiting_owner` Chờ Chủ (Waiting for Owner) · `stalled` Đứng (Stalled) · `idle` Rảnh (Idle) · `disabled` Đã tắt (Disabled) |
| Ticket status | `backlog` Backlog · `todo` Cần làm (To do) · `in_progress` Đang làm (In progress) · `verifying` Chờ kiểm chứng (Awaiting verification) · `done` Xong (Done) · `canceled` Huỷ (Canceled) · `duplicate` Trùng (Duplicate) |
| Ticket status group | `planned` chờ (waiting: backlog, todo) · `active` chạy (running: in_progress, verifying) · `closed` kết (closed: done, canceled, duplicate) |
| Priority | `urgent` Khẩn (Urgent) · `high` Cao (High) · `medium` Vừa (Medium) · `low` Thấp (Low) · `none` Không (None) |
| Assignment type | `work` Làm (Work) · `review` Review |
| Assignment status | `pending` Chờ nhận (Awaiting claim) · `in_progress` Đang làm (In progress) · `submitted` Đã nộp (Submitted) · `accepted` Đạt (Accepted) · `returned` Trả lại (Returned) · `canceled` Đã huỷ (Canceled) |
| Submission result | `done` Xong (Done) · `partial` Xong một phần (Partly done) · `blocked` Không làm được (Could not do) |
| Session status | `running` Đang chạy (Running) · `waiting_owner` Chờ Chủ (Waiting for Owner) · `waiting_assigner` Chờ người giao (Waiting for assigner) · `stalled` Đứng (Stalled) · `error` Lỗi (Error) · `stopping` Đang dừng (Stopping) · `closed` Đã đóng (Closed) |
| Activity type | `thought` Suy nghĩ (Thought) · `action` Thao tác (Action) · `question` Hỏi (Question) · `result` Kết quả (Result) · `error` Lỗi (Error) |
| Signal sent to agent | `STOP` Dừng (Stop) |
| Evidence type | `commit` · `deploy` · `review` · `test` · `file` · `note` Ghi chú (Note) · `bao_cao` Báo cáo (Report) |
| "No code" flag | `project.khong_code` Dự án không code (No-code project) · `ticket.khong_code` Ticket không code (No-code ticket) |
| Evidence verification | `pending` Đang kiểm (Checking) · `passed` Đạt (Passed) · `failed` Trượt (Failed) · `withdrawn` Đã rút (Withdrawn); commit only: `pushed` · `merged` |
| Review verdict | `pass` Đạt (Pass) · `fail` Không đạt (Fail) |
| Needs Owner level | `urgent` 🔴 Gấp (Urgent) · `today` 🟡 Trong ngày (Today) · `later` ⚪ Không gấp (Not urgent) |
| Needs Owner type | `decision` Quyết định (Decision) · `run_command` Chủ chạy lệnh (Owner runs command) · `review` Chủ review (Owner review) · `fyi` Chỉ để biết (FYI) |
| Needs Owner status | `open` Chờ (Waiting) · `resolved` Đã xử lý (Resolved) · `skipped` Bỏ qua (Skipped) |

In this SPEC, words such as "In progress" ("Đang làm"), "Awaiting verification" ("Chờ kiểm chứng"), "🔴 Urgent" ("🔴 Gấp") are **labels**; look up the matching code in the table above.

## 1. Concepts
| Concept | What it is |
|---|---|
| **Workspace** | The space of one owner. v0.1 has only 1 workspace, but data must be separated by workspace from the start so that it can later ship to many customers. |
| **Owner** | The single real person, with the highest permissions; the display name is configurable (default "Chủ", Owner). The "Cần Chủ" (Needs Owner) section uses this name: change the owner's name and the section name changes with it. |
| **Agent** | A machine identity: name (e.g. `CoS`, `M-Sample`, `W-builder`, `W-reviewer`), **role**, model (free text), description, list of projects it may enter, permissions, token. |
| **Agent role** | `coordinator` (CoS-style), `manager` (Manager of one project), `worker` (Worker that does the work), `reviewer` (Worker that reviews). An agent has exactly 1 role. |
| **Project** | Has a name, a **code** of 2–6 uppercase letters (e.g. `SAI`, `INC`, `COS`), description, colour, status (running, paused, archived), managing agent, **project profile** (section 9). |
| **Ticket** | The unit of work, belonging to exactly 1 project. Code `CODE-number`; the number increases within the project and is never reused. |
| **Assignment** | One hand-off: who assigned, to whom, with which brief, when, and what the result was. A ticket can have several assignments. |
| **Session** | The period during which an agent is actually working an assignment. It has a live status and an activity stream. |
| **Evidence** | Something that proves the work was done: commit, deploy, test result, passing review, file, note. |
| **Needs Owner (T item)** | Work that only the owner can decide or do. Code `T-number`. |
| **Decision** | One row in the Decision log. Append-only, never edited. |

## 2. Projects
**What the user gets:** as many projects as they like. Each project has its own page showing whether it is running or stalled, who manages it, and what to read first.

- **Create:** the owner creates it (UI or CLI). Name and code are required. The code is unique in the workspace and **cannot be changed** after creation; the name can.
- **Status:**
  - `active`: normal.
  - `paused`: agents take no new work in the project.
  - `archived`: hidden from the sidebar, read-only.
- **Health indicator** (computed automatically, shown in the sidebar and on the Overview):
  - 🟢 at least 1 ticket In progress, and its session is running or has a heartbeat within the threshold.
  - 🟡 there is a ticket In progress but its session is stalled or in error.
  - ⚪ no ticket In progress at all. Shows the text "Dự án không chạy" (Project is not running).
- **Project groups** (optional): put projects into groups to arrange the sidebar, for example "Sample", "INC", "Internal". Display only.
- **Errors:** a duplicate or malformed code reports "Mã dự án đã có" (English: "Project code already exists") or "Mã chỉ gồm 2–6 chữ A–Z" (English: "The code consists of 2–6 letters A–Z only").
- **NOT done:** teams; per-person permissions (there is only 1 person); a limit on the number of projects.

## 3. Agents
**What the user gets:** knowing who is on the team, what each agent is doing, what it is allowed to do, and when it last spoke.

- **Create an agent:** the owner enters a name (unique), role, model, description, list of projects it may enter (or "all"), permissions.
- **Token:** shown **exactly once**, at creation. After that only the last 4 characters are shown. There is a button to regenerate the token (the old token stops working immediately) and a revoke button. The server stores the token only as a hash.
- **Permissions by role** (defaults; the owner can adjust each agent):

| Action | coordinator | manager | worker | reviewer |
|---|---|---|---|---|
| Create ticket | every project it may enter | projects it manages | child tickets of the assignment it is working | — |
| Assign work (create an assignment) | to manager, worker, reviewer | to worker, reviewer in the project | — | — |
| Change ticket status | yes | in the project | tickets of its own assignment | — |
| Submit evidence | yes | yes | yes | yes |
| Record a review result | yes, except on tickets where it has taken a `work` assignment | in the project, must include the path to an independent reviewer's report | — | yes |
| Create a Needs Owner item | yes | yes | — | — |
| Write to the Decision log | yes | yes | — | — |
| Delete anything | never | never | never | never |
| Decide a Needs Owner item | never | never | never | never |

- **Agent status** (computed automatically):
  - `busy`: has a running session.
  - `waiting_owner`: has a session waiting on a Needs Owner item.
  - `stalled`: has a stalled session.
  - `idle`: has no open session.
  - `disabled`: the owner has turned the agent off. A disabled agent calling the API is rejected.
- **Agent page:** details, open sessions, assignment history (as a table), rate of resubmissions passing review, last time it spoke.
- **NOT done:** Baton does not run agents, does not call models, does not hold model API keys. Agents run elsewhere and talk to Baton through the CLI, MCP or API.

## 4. Tickets
**What the user gets:** every piece of work has a short code that people and agents both use to refer to it, has enough context to be assigned, and it is always known whose hand it is in.

**Fields:**
- Code (auto-generated), title (required, 1–200 characters after trimming whitespace), description (markdown).
- **Brief** (structured, optional): Goal · Context · Scope · Related files and sources · Prohibitions · Definition of done · How to verify · What to submit.
- Status, priority, labels.
- **Responsible party** (the owner or a `manager`/`coordinator` agent; defaults to the project's managing agent, or the owner if the project has none). A disabled agent cannot be set (`FORBIDDEN`); a ticket assigned before the agent was disabled **or changed role** stays as is, and editing a ticket while sending the same current responsible party does not re-check disabled/role — the check only runs when changing to someone else (Owner decided T-58 = A, 22/10; BAT-50).
- **Current holder** (the agent holding the open assignment; computed from section 5, not editable by hand).
- Parent ticket, child tickets, related (two-way, **may cross projects** — for someone who can see both projects, 19.12 item 15), blocks and blocked by.
- Due date (optional), creator, timestamps (created, updated, started, done).

**Priority:** 5 fixed levels in order: `Khẩn` (Urgent), `Cao` (High), `Vừa` (Medium), `Thấp` (Low), `Không` (None). Default None.

**Status** (7, fixed in v0.1):

| Status | Group | Meaning |
|---|---|---|
| Backlog | waiting | Far-off stage, ideas |
| Cần làm (To do) | waiting | Planned (default at creation) |
| Đang làm (In progress) | running | Has an open assignment, or the owner is doing it personally |
| Chờ kiểm chứng (Awaiting verification) | running | The doer reports done; not enough evidence yet, or not yet through review |
| Xong (Done) | closed | Enough valid evidence (section 7) |
| Huỷ (Canceled) | closed | No longer to be done; a reason is required |
| Trùng (Duplicate) | closed | Duplicates another ticket; must point to the original ticket |

**Status at creation:** default **To do**; the creator may choose **Backlog**. No other status can be set at creation (`INVALID_INPUT`) — create first, then transition under the rules below. Creation permission does not vary with the chosen status. (Owner decided T-108 = B, 29/10; BAT-63)

**Status transition rules** (checked by the server; the client must not bypass them):
- Opening an assignment for a ticket in the `planned` group moves the ticket to **In progress** automatically.
- Entering **Done** must pass the evidence gate (section 7). If something is missing it is rejected with error `EVIDENCE_REQUIRED`, and the ticket is moved to Awaiting verification.
- A parent ticket does not enter Done while it still has unclosed child tickets (`CHILDREN_OPEN`).
- Entering Canceled requires a reason (`REASON_REQUIRED`). Entering Duplicate requires a valid original ticket (`INVALID_DUPLICATE_TARGET`).
- Reopening a ticket in the `closed` group (back to To do) can only be done by the owner.
- A ticket that has been In progress for more than 24 hours with no open assignment, and that the owner is not doing personally, is flagged **"Đang làm mà không ai cầm"** (In progress with no holder) and shown on the Overview.

**Coordination tickets:** a `coordinator` agent assigns work to a `manager` by creating a ticket in the coordination project (e.g. `COS`), with a self-chosen title of the form `[Giao M-Sample] <title>` ("Giao" = Assign), and links it with type `dieu_phoi` (19.4) to the project's ticket. Both tickets change status together following the assignment. Viewing either ticket shows the other.

**History:** every change records 1 row (who, when, field, old → new). It cannot be edited or deleted.

**Comments:** markdown, by the owner or an agent. The author can edit their own (marked "đã sửa", edited). Agents cannot delete.

**Deleting a ticket:** owner only. A deleted ticket can be restored within 30 days; its code is never reused.

**Errors:** an empty title is rejected (`INVALID_INPUT`); when the project is paused or archived an agent cannot create tickets (`PROJECT_NOT_ACCEPTING`).

**NOT done in v0.1:** point estimates; sprints or cycles; custom fields (`khoi_lon` and `doi` of section 20 are fixed fields, not custom fields); custom statuses; multiple responsible parties.

## 5. Assignments (handing off work)
**What the user gets:** seeing the whole chain of work being handed off: CoS assigns the Manager, the Manager assigns a Worker, the Worker submits, the Reviewer reviews, the Manager does acceptance. Who assigned, when, with what brief, and what the result was.

- **Create an assignment:** the assigner (the owner or an agent with permission) picks a ticket and an assignee (an agent), and sends a brief with it. The brief is taken from the ticket if it has one, and can be edited for this assignment only. A **response deadline** can be set (default 15 minutes).
- Each ticket has at most **1 open assignment** at a time, except that a review assignment (section 7) may be open in parallel with a work assignment that has been submitted.
- **Assignment status:**
  - `pending`: just assigned, the assignee has not claimed it.
  - `in_progress`: the assignee has claimed it.
  - `submitted`: the assignee has submitted the report.
  - `accepted`: the assigner accepted it.
  - `returned`: the assigner returned it; a reason is required. Creates a new round with the same assignee; the round number increases.
  - `canceled`: canceled by the assigner, or by the owner.
- **Claiming work:** the assignee calls the "claim" command. If the response deadline passes without a claim, the assignment shows **"Không phản hồi"** (No response) on the Overview (the assignment is not canceled automatically).
- **Submission report** (structured, required on submit):
  - Result: `done` (Done), `partial` (Partly done) or `blocked` (Could not do).
  - Done · Verification · Branch and commit · Risks, things to look at closely · Follow-up work (not done on own initiative).
- **Follow-up work** in the report has a button (for the assigner) "Tạo ticket từ việc phát sinh" (Create ticket from follow-up work).
- **Acceptance:** the assigner chooses `accepted` or `returned`. `accepted` does not by itself make the ticket Done; the ticket is Done only when it passes the evidence gate.
- **Rules:**
  - A `worker` agent cannot create an assignment.
  - Work cannot be assigned to an agent that is `disabled`, or to an agent without access to that project (`FORBIDDEN`).
  - Work cannot be assigned to oneself.
- **NOT done:** Baton does not start an agent when an assignment exists. The agent must ask for work itself (section 13). Auto-start is left for v0.2.

## 6. Sessions and heartbeat
**What the user gets:** knowing whether an agent **is really running** or has died midway, without waiting until they notice it themselves.

- A **session** opens when an agent claims an assignment, and closes when it submits, is canceled or is stopped.
- **Auto-close:** the session closes as soon as **its assignment submits its report**, and when **that assignment's ticket moves to Awaiting verification or Done** — even if the session is `stalled` or `error`. The close reason is recorded in the session history ("việc đã xong", the work is done). Mandatory consequence: a finished piece of work **never** still shows under "Cần chú ý" (Needs attention) as a stalled session, and the agent no longer "holds" it.
- **Session status:**
  - `running`: a signal within the threshold.
  - `waiting_owner`: the session is attached to a waiting Needs Owner item; not counted as stalled.
  - `waiting_assigner`: the agent has sent a `question` activity and is waiting for the assigner's reply; not counted as stalled, but after 60 minutes it shows under "Needs attention" (19.6). When a reply arrives the session returns to `running`.
  - `stalled`: no signal for longer than the threshold.
  - `error`: the agent reported an error.
  - `stopping`: the owner pressed stop, waiting for the agent to confirm.
  - `closed`.
- **Signal** = every write command by the agent on that session (heartbeat, activity, evidence, comment, submit). Read commands do not count. Which session a command bumps when the agent has several open sessions: 19.12 item 41.
- **Stall threshold:** default 30 minutes; adjustable per project or per agent (5–1440 minutes).
- **Session activity stream:** the agent sends entries of type `thought`, `action` (name, parameters, result), `question` (asks the assigner; if the owner is needed, create a Needs Owner item), `result`, `error`. An entry can be marked transient (replaced on screen by the next entry; still kept in history). A sent entry cannot be edited.
- **Session plan:** a list of steps, each with a status of waiting, in progress, done or canceled. The agent resends the whole list on every update.
- **Stop:**
  - The owner presses "Dừng" (Stop) and the session moves to `stopping`. The agent's next call receives the `STOP` signal; the agent must cease work and send a `result` or `error` entry.
  - After 10 minutes without confirmation, the session closes itself with the reason "agent không xác nhận dừng" (agent did not confirm the stop).
  - Every write command after the session has closed is rejected (`SESSION_CLOSED`).
- **Alerts:** a session moving to `stalled` or `error` fires 1 notification (section 12). If the session recovers and then stalls again, it fires again.
- **NOT done:** reading the agent's logs or screen; restarting the agent automatically.

## 7. Evidence and the verification gate
**What the user gets:** "Done" on Baton is really done.

**Evidence types:**

| Type | Value | Verification | Opens the Done gate? |
|---|---|---|---|
| `commit` | hash (≥7 characters) + repo (taken from the project profile if not given) | The server checks through the GitHub API: a commit reachable from the **default branch** is **merged**; one only on another branch is **pushed**; not found means failed. **Exception for a repo not yet pushed:** if GitHub **was asked about this very commit** and answered "does not exist", and the CLI sent the declaration `merged_cuc_bo` along with it (the CLI itself ran `git merge-base --is-ancestor <sha> <default branch>` in the repo), then the conclusion is **merged** with **verification source `local`**; that source must be shown in the API, web and CLI. The declaration is **not** accepted in any other case: malformed repo, `GET /repos/<repo>` returning 404, network error, a `pushed` conclusion, or the server lacking `GITHUB_TOKEN` | Only when **merged** (including merged with source `local`) |
| `deploy` | URL + optional version code (e.g. `e91efbeb`) | The server calls the URL; a 2xx or 3xx code passes. Only `https://` is accepted, no internal IPs or localhost. A **URL pointing at Baton itself** (host **exactly equal to** Baton's public host) is not called over the network but routed into the app's own router, and the real HTTP code is taken from there; only the code of a **real route** is accepted (not passing through the SPA's fallback to `index.html`), so a URL pointing at a UI path will **fail** | Yes |
| `review` | Verdict PASS or FAIL + note, sent by a `reviewer` agent **other than** the doer; or sent by the project's `manager` agent **with the path to an independent reviewer's report** (see the permission table in section 3); or sent by a `coordinator` agent (report not required) | Checks the sender's role and identity; a review sent by a `manager` carries **source `manager`**, one sent by a `coordinator` carries **source `coordinator`**, and that source is shown on every read path | Does not open the gate by itself; it is a secondary condition (see below) |
| `test` | Summary (e.g. "42 passed, 0 failed") + pass flag | Not verified | No |
| `file` | Path or link (e.g. a file:// link on the host machine) | No | No |
| `note` | Text | No | No |
| `bao_cao` (Báo cáo, Report) | Report path and/or report content (at least one). Signer = sender, **signing rights identical to `review`**: a `reviewer` agent other than the doer; the project's `manager` agent **with the path to an independent reviewer's report**; a `coordinator` agent; or the owner. The signing source (`reviewer` · `manager` · `coordinator` · `owner`) is shown on every read path | No (only the signer's role and identity are checked, as for `review`) | Does not open the gate by itself; for a **no-code ticket** it opens the gate **in place of** the owner's confirmation (see below). For a ticket with code: opens nothing |

**Gate into Done:**
- Requires **at least 1** `commit` evidence that is merged, or a passing `deploy`.
- If the project has "bắt buộc review" (review required) on (default **on**), 1 PASS `review` sent after the last commit or deploy is also required.
- **The owner may force Done** with a reason. That ticket carries the system label "xong không bằng chứng" (done without evidence).
- **No-code ticket** (project flag **or** ticket flag, **changed by the owner only**; for example HR work, paperwork, or a research ticket in a project that has code): the gate becomes **one of two** paths:
  - 1 `file` or `note` plus **owner confirmation**, i.e. an auto-generated Needs Owner item of type Review (19.12 item 57); or
  - **≥1 non-withdrawn `bao_cao` signed by someone other than the doer** (the doer = the assignee of any `work` assignment on the ticket, as in the "other than the doer" rule of `review`). When the gate is already satisfied by a report, **no** confirmation item is generated.
  - The **project** flag is in the project profile (section 9). The **ticket** flag (`ticket.khong_code`) is turned on/off by the owner only (agent ⇒ `FORBIDDEN`), is recorded in History, and **does not pull the status** (19.12 item 58). Both flags are read **at the time of the check** (19.10).
  - A `bao_cao` does **not** count as the `file` or `note` of the first path, and vice versa.
  - When a ticket moves to Done by **any** path (satisfied by `bao_cao`, owner confirmation, owner forces Done, auto-Done, …), that ticket's own auto-generated confirmation item still in `Chờ` (Waiting) **closes itself** at the same time (see section 8 and 19.12 item 57).
  - **Sending a `bao_cao` does not move the ticket to Done by itself** from Awaiting verification (like `file`/`note`/`review`): someone with the "Change ticket status" permission in the section 3 permission table (the doer for tickets of its own assignment, the `manager` in the project, the `coordinator`, the owner) changes it to Done, and the gate is checked at that change (Owner decided T-38 = A, 19/10). Details: 19.12 item 66.

**Verification:**
- Runs immediately on sending and returns a result within at most 10 seconds. On a network error or a problem with the GitHub token the status is `pending`, retried automatically after 5 minutes, at most 3 times, then becomes `failed` with a reason.
- **Auto-Done:** a ticket in Awaiting verification that has just met the gate conditions (for example a commit going from pushed to merged) moves to Done by itself, and history records the actor as "hệ thống" (system). The server re-checks `pushed` commits every 10 minutes for 7 days.
- Evidence is **not edited, not deleted**. It can only be "withdrawn" with a reason (by the sender or the owner). Withdrawn evidence does not count. A ticket already Done is not demoted automatically.
- **NOT done:** scanning the repo for commits; deploying; running tests.

## 8. Needs Owner
**What the user gets:** **one single place** collecting everything that needs the owner's decision or action. At a glance it is clear what is urgent, each item has enough context to be decided in one read, it is decided with one key, and Baton reports the result back to the agent by itself.

**Create:** a `coordinator` or `manager` agent (CLI, MCP, API), or the owner creates one as a reminder.

**Fields:**
- Code `T-number`, increasing across the whole workspace, never reused.
- Title; **project** (required, or "Chung", General).
- **Level:** 🔴 `Gấp` (Urgent), 🟡 `Trong ngày` (Today), ⚪ `Không gấp` (Not urgent).
- **Type:**
  - `Quyết định` (Decision): requires 2–5 options (each option has a label A, B, C… and 1–3 lines), plus the recommended option and the reason.
  - `Chủ chạy lệnh` (Owner runs command): requires a command or script. Shown in a code block with a Copy button, with the note "chạy ở terminal thật" (run in a real terminal) if the agent marks it as needing a TTY.
  - `Chủ review` (Owner review): requires at least 1 file or link to look at.
  - `Chỉ để biết` (FYI): nothing to do, only confirm it has been read.
- **Context** (markdown, with file:// links and ticket links); **related tickets** (several); **related session** (if any, the session moves to `waiting_owner`).
- **Deadline** (optional). If not set: 🔴 is 4 hours, 🟡 is 20:00 the same day.

**Status:**
- `Chờ` (Waiting) → `Đã xử lý` (Resolved; with a **result**: the chosen option and/or free text, e.g. "đã chạy" (ran it), "A, ngưỡng 500" (A, threshold 500)) or `Bỏ qua` (Skipped; with a reason).
- Only the owner changes the status. Agents can only read the result. **The single exception:** the auto-generated confirmation item of a no-code ticket (19.12 item 57) moves to Resolved by itself with the result "ticket đã Xong" (ticket is Done), carrying **no** Pass/Needs fixing verdict, when its ticket moves to Done (Owner decided T-38 = A, T-43 = A; #163).
- Can be reopened: from Resolved back to Waiting, recorded in history.

**Needs Owner screen** (second entry of the sidebar, after the Overview — see section 14; the badge counts `Chờ` (Waiting) items, coloured by the highest level):
- 3 blocks **🔴 Gấp (Urgent) · 🟡 Trong ngày (Today) · ⚪ Không gấp (Not urgent)**. Within a block, sorted by deadline, then by creation time. An overdue item has a red border and the text "quá hạn X giờ" (overdue by X hours).
- Each card shows everything: code, project, type, title, context (collapsed after 6 lines by default), options as buttons (the recommended option has the label "Đề xuất", Recommended), the command with a Copy button, files as links, related tickets.
- At the bottom is the **Đã xử lý** (Resolved) table: date, code, short title, result. Filterable by project and by date range.
- Filter by project, by type.

**Answer with buttons, then press Send** (no need to type anything in a terminal or chat):
- Each card has all the buttons needed to answer right on Baton, on desktop and phone alike:

| Type | On the card | Send |
|---|---|---|
| `decision` | Each option is **a choice button** (A, B, C…; the recommended option has the label "Đề xuất", Recommended). Press to choose, press another option to change. Optional "ghi thêm" (additional note) box | Button **Gửi duyệt** (Send approval), dimmed until 1 option has been chosen |
| `run_command` | The command in a code block with a Copy button; optional "kết quả" (result) box (e.g. paste the version code) | Button **Đã chạy · Gửi** (Ran it · Send) |
| `review` | Button to open the file or link; 2 choice buttons **Đạt** (Pass) or **Cần sửa** (Needs fixing) (Needs fixing requires a note) | Button **Gửi duyệt** (Send approval) |
| `fyi` | — | Button **Đã đọc** (Read) |

- Every card also has a small link "Bỏ qua" (Skip), which requires entering a reason and then Send.
- **Pressing Send is the end of it on the owner's side.** The card moves straight down to "Resolved" and shows the result. The owner does not have to report back to the agent anywhere.
- **The agent receives the result by itself:**
  - An agent waiting with `baton result T-x --wait` (or the equivalent MCP tool) receives the result **within 3 seconds** of the owner pressing Send.
  - An agent that is not waiting receives the result on its next call (`heartbeat`, `tasks` or any command), in the `resolved_asks` field.
  - The related session returns to `running` by itself.
- **Keyboard shortcuts** (optional, for desktop): `1`–`5` choose an option; `Cmd/Ctrl+Enter` send; `D` is the main button for the command, review and fyi types; `S` skip; `J`/`K` up and down.
- **Bulk answer box** (optional, on Baton): paste several lines of the form `T-18: đã xem` or `T-52: A, ngưỡng 500`. Baton splits out each code, matches an option if there is a valid leading letter, shows a preview and then applies everything at once. A line it does not understand is marked red and not applied.

**Approval session:**
- The button "Bắt đầu phiên duyệt" (Start approval session) shows each `Chờ` (Waiting) card in the order 🔴 → 🟡 → ⚪.
- At the end of the session a summary is shown: resolved N, skipped M, remaining K.
- The approval session reminder schedule defaults to 08:00 and 20:00 (adjustable).

**When an item is resolved:**
- 1 row is written to the Decision log automatically (section 10): the person is the owner, same project, the content is the result, the reference is `T-number`.
- A comment "T-số đã xử lý: <kết quả>" (English: "T-number resolved: <result>") is added automatically to every related ticket.
- **Exception (temporary):** an auto-generated confirmation item that **closes itself because the ticket is Done** (19.12 item 57, #163) writes **no** Decision log row and adds **no** comment — the owner did not handle that item, so a row saying "the person is the owner" would be untrue. Pending decision: `spec-questions.md` #166.
- The related session leaves `waiting_owner`. The agent's next call receives the result (section 13).

**Notifications:** a new 🔴 item fires immediately (immediately = within one cron tick, ≤ 60 seconds — Owner decided T-50 = A, 22/10, `spec-questions.md` #170). A 🔴 not handled after 2 hours gets 1 reminder. 🟡 and ⚪ only go into the morning and evening summaries.

**Errors:**
- Type Decision missing options: `OPTIONS_REQUIRED`.
- Type Owner runs command missing a command: `COMMAND_REQUIRED`.
- A `worker` or `reviewer` agent creating an item: `FORBIDDEN`.
- Same title as a Waiting item in the same project within 24 hours: still created, but flagged "có thể trùng T-x" (may duplicate T-x).

**NOT done:** agents deciding Needs Owner items themselves; running commands on the owner's behalf; repeated reminders.

## 9. Project profile (project map)
**What the user gets:** each project has a "read first" page for agents and for the owner. An agent new to the project only needs to read this page.

- **Fields** (markdown per section):
  - "Là gì" (What it is), folder or source (local path), GitHub repo (owner/name, default branch), stack.
  - "Đọc trước" (Read first; a list of links), how to deploy and who runs it, the project's own forbidden list.
  - **Known pitfalls** (append-only list: date, pitfall, how to avoid it).
  - The "no-code project" flag and the "review required" flag.
- **Workspace-wide:** the "Luật chung" (Common rules) page, containing the common forbidden list and the pre-assignment checklist. Agents can read it through the CLI or MCP.
- **Map page:** a table of every project: name, managing agent, folder, number of tickets In progress, health indicator, last update. The visual map is on the Overview (section 20); this page keeps the table form, with added columns Group, Priority, Pushing, Maintenance.
- Every edit to the profile records a version history.

## 10. Decision log
**What the user gets:** being able to answer "who decided this, why, and when", with no fear of it being quietly edited.

- **Row:** when (date and time), who (owner or agent), project, decision, why, reference (link to a T-number, ticket code, older row).
- **Append-only.** No edit, no delete, not even by the owner. To change something, add a new row pointing to the old row; the old row shows the text "đã có quyết định mới" (superseded by a new decision).
- Who may write: the owner, `coordinator`, `manager`. An "owner decided" row, however, is only generated from Needs Owner or written by the owner personally.
- **Screen:** grouped by day, filter by project and by who, search by text.
- **Data rule:** the "decision" field warns when it detects patterns resembling a national ID number, bank account number or salary (a run of 9–12 digits, the phrase "lương" (salary)). Warning only, no blocking. The purpose is to remind people not to put HR data in.

## 11. Overview and reports
The **Overview** (the default page) is the **general work-management** screen, not the owner's inbox. From top to bottom:
1. **Projects:** the project map (section 20).
2. **Work in progress:** work cards from **every** project that are In progress or Awaiting verification (the same card style as the work board in section 14); each card says who is holding it and for how long.
3. **What agents are doing:** only agents that **are working** — one line per agent: the work it is holding and the time since its last signal. Idle agents are collapsed into **one line** with a count.
4. **Just done:** Done tickets, with a selectable window of **24 hours** or **7 days**, with abbreviated evidence (7-character hash, URL, version code).
5. **Needs attention:** stalled or errored sessions; assignments with no response; tickets "In progress with no holder"; failed evidence; tickets Awaiting verification for more than 24 hours. **Grouped by ticket: each ticket gets exactly ONE line**, with the reasons shown as labels on that line. A failed piece of evidence for which a Passed piece of evidence of the same type arrived **afterwards** is no longer reported.

**Needs Owner is not at the top of the Overview.** It is only a compact box (the number of Waiting items by level + a link to the Needs Owner page + the "Start approval session" button) in the corner or the right-hand bar of the page; the sidebar still has the Needs Owner entry with its red badge, and that is the main way into work waiting on the owner.

**Morning report** (auto-generated at 07:30, viewable on the web and sent as a notification):
1. Needs Owner (read first).
2. Proposed 3 focus items for today. The `coordinator` agent writes them through the API; if not yet written, left blank with the text "chưa có đề xuất" (no proposal yet).
3. Done yesterday.
4. In progress.
5. Risks and deviations (the Needs attention section).
6. New decisions in the Decision log.

**Evening handoff** (auto-generated at 20:00):
- Today's 3 focus items: achieved or not (by the status of the tickets tagged as focus).
- Status of each project.
- Carried over to tomorrow.
- Newly arisen Needs Owner items.

Reports are stored by day, can be viewed again and can be exported to markdown.

## 12. Notifications
- **Channels in v0.1:** Telegram (1 chat of the owner; bot token and chat id configured on the server side) + in-app (bell).
- **Fires when:**
  - A new 🔴 Needs Owner item, or a 🔴 older than 2 hours.
  - A session stalls or errors.
  - An assignment gets no response.
  - Evidence fails.
  - Ticket Done: batched, at most 1 message every 15 minutes.
  - Morning and evening reports.
- Every message has a direct link to the exact card or ticket. There are **quiet hours** (default 23:00–07:00): only 🔴 is sent within this window.
- Each type can be turned off in Settings.

## 13. How agents talk to Baton
Three paths, one set of permissions: the **`baton` CLI**, the **MCP server**, the **HTTP API** (JSON). An agent authenticates with its own token.

**Pull model** (no webhook needed): the agent itself calls "my work" or "wait for work". There is a long-wait mode of up to 60 seconds; when new work or a new signal appears it returns immediately.

**CLI commands** (MCP has equivalent tools with the same names):

| Command | Behaviour |
|---|---|
| `baton whoami` | Prints who the agent is, its role, the projects it may enter, the common rules |
| `baton tasks [--wait 60]` | Lists its own `pending` or `in_progress` assignments; with `--wait` it waits until there is one |
| `baton claim <assignment>` | Claims the assignment, opens a session, prints the brief, the project profile and the known pitfalls |
| `baton heartbeat [note] [--luot <assignment>]` | Heartbeat; returns a signal if there is one (`STOP`, a new Needs Owner result). Choosing the session: see the `--luot` note below the table |
| `baton log <type> "<content>" [--luot <assignment>]` | Sends an activity: thought, action, question, result, error. Chooses the session like `heartbeat` |
| `baton plan <file.json> [--luot <assignment>]` | Updates the session plan. Chooses the session like `heartbeat` |
| `baton cancel <assignment> --reason "<reason>"` | Cancels the assignment (section 5 `canceled`, 19.6); only the assignment's assigner or the owner; the reason is required; a running session moves to `stopping` |
| `baton evidence <CODE> <type> <value> [...]` | Sends evidence; waits up to 10 seconds for verification, then prints the result |
| `baton submit <assignment> <report-file.md>` | Submits the report (a file following the 5-section template in section 5); closes the session |
| `baton create <PROJECT> "<title>" [--brief f.md] [--parent CODE] [--priority high] [--status backlog]` | Creates a ticket |
| `baton assign <CODE> <agent> [--brief f.md] [--timeout 15] [--review]` | Creates an assignment; with `--review` it creates an assignment of type `review` (19.3), without the flag it is `work`. `<agent>` is a **name or ID**, matched exactly (case-sensitive) against the agents the caller can see: 1 match assigns to that agent; several matches (e.g. one agent's ID is another agent's name) report an error with the IDs and create no assignment; no match sends the text as-is as an ID (the server checks as before), and if the server does not find it, it reports "không tìm thấy agent (tên hoặc ID)" (English: "agent not found (name or ID)") — the same message whether the name does not exist or is the name of an agent outside the caller's scope |
| `baton link <coordination-CODE> <project-CODE> [--type dieu_phoi\|related\|blocks]` | Links two tickets (section 4, 19.4); default `dieu_phoi`. The `[Giao …]` title is still typed by the ticket's creator |
| `baton verdict <assignment> accept\|return [--reason ...]` | Acceptance |
| `baton reply <assignment> "<content>"` | Replies to an agent's question on the assignment (see 19.6); only that assignment's assigner can call it |
| `baton status <CODE> "<status>" [--reason] [--original CODE]` | Changes status under the rules of section 4 |
| `baton show <CODE>` | Prints the ticket, assignments, evidence, last 10 comments |
| `baton list [--project X] [--status ...]` | Lists tickets |
| `baton comment <CODE> "<content>"` | Comment |
| `baton ask --level urgent\|today\|later --type ... "<title>" [--option "A: ..."]... [--recommend A] [--command "..."] [--file ...] [--ticket CODE] [--context f.md]` | Creates a Needs Owner item, prints `T-number` |
| `baton result T-<number> [--wait 60]` | Prints the item's status and result; with `--wait` it waits until it has been handled |
| `baton decision <PROJECT> "<decision>" --why "..." [--ref ...]` | Writes to the Decision log |
| `baton profile <PROJECT>` | Prints the project profile |

- **`--luot <assignment>` of `heartbeat`, `log`, `plan`** (MCP: optional parameter `luot`): selects **one's own** open session belonging to that assignment. Without the flag, the environment variable **`BATON_LUOT`** is read (empty = not set); **the flag beats the variable**. A flag typed but empty (`--luot=`) ⇒ `INVALID_INPUT` (no fallback to the variable or to "not specified"). A specified assignment that matches none of one's open sessions ⇒ `NOT_FOUND`, the same message whether the assignment does not exist, belongs to another agent or its session has closed. Not specified: no open session ⇒ `NOT_FOUND`; exactly 1 ⇒ that session; **2 or more open sessions ⇒ `INVALID_INPUT`** (no choosing on the agent's behalf), with a message explaining how to use `--luot`/`BATON_LUOT`. (Owner decided T-73/T-75 = A, 23–24/10; #83)
- Every command has `--json`. **Exit codes:** 0 is success; 1 is a business error (prints the error code); 2 is an authentication or network error; 3 is receiving the `STOP` signal.
- Status, level and type accept the **English codes** (table in section 0.1); the UI and error messages show the Vietnamese labels.
- The CLI reads `BATON_URL` and `BATON_TOKEN` from environment variables and **never prints the token**.
- **API:**
  - Errors return `{ "error": "<CODE>", "message": "<Vietnamese message>" }`.
  - Minimum error codes: `EVIDENCE_REQUIRED`, `CHILDREN_OPEN`, `REASON_REQUIRED`, `INVALID_DUPLICATE_TARGET`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_INPUT`, `PROJECT_NOT_ACCEPTING`, `SESSION_CLOSED`, `OPTIONS_REQUIRED`, `COMMAND_REQUIRED`, `INVALID_TOKEN`, `RATE_LIMITED`.
  - HTTP: 401 wrong token; 403 no permission; 404 not found (also used when the object is out of scope, so as not to reveal its existence); 409 state conflict; 422 business error; 429 with `Retry-After`.
- **Limit:** 600 requests per minute per token. A long-wait command counts as 1 request.
- **Outgoing webhook** (optional, for other integrations): 1 URL, signed with HMAC-SHA256, sent when a ticket changes status, a Needs Owner item is new or resolved, a session stalls. Retried 3 times.

## 14. The owner's web interface
- **Colour mode:** three choices **Sáng / Tối / Theo máy** (Light / Dark / System; `prefers-color-scheme`), default **Dark**. The choice (including "system") is remembered between visits and set **before the page paints** — no white flash while in dark mode. Both modes must be readable: error text, red borders and the ⚪ label of l.317 all have enough contrast.
- **Sidebar:**
  - Tổng quan (Overview), **Cần Chủ** (Needs Owner; badge), Tất cả việc (All work), Báo cáo (Reports), Nhật ký quyết định (Decision log), Đội agent (Agent team).
  - "All work" is the ticket list of **every project**, opening in the **Board view**. The "Agent team" group heading is clickable to go to the Agent team page, and there is no second link to the same page.
  - The **project map** has no entry of its own in the sidebar; the page still exists and is reached from a project.
  - Then the list of projects by group, each project with a health dot.
  - At the bottom: Cài đặt (Settings).
  - The workspace name opens a menu containing **Đăng xuất** (Sign out) and **Đăng xuất mọi nơi** (Sign out everywhere) (section 15); these two buttons do not sit bare on the top bar.
- **Ticket list** (per project or "Tất cả dự án", All projects):
  - Two views: a list grouped by status, and a board (columns are statuses, drag and drop; dragging into Done without enough evidence makes the card snap back and reports the reason). The work page of **a single project** defaults to the **Board** view; List is the secondary view. The board has **six columns** in the order **Backlog · Cần làm (To do) · Đang làm (In progress) · Chờ kiểm chứng (Awaiting verification) · Xong (Done) · Huỷ (Canceled)** (Duplicate shows in the Canceled column); a `+` button at the top of the Backlog column (creates into Backlog) and at the top of the To do column (creates into To do) (Owner decided T-111 = A, 29/10; BAT-64).
  - A work card has **no** "Chuyển cột" (Move column) box: status is changed by drag and drop, the detail panel, or the `S` key. Priority "None" prints **no** text on the card. Everywhere a doer is shown, the **agent name** is shown, never the id.
  - **Empty columns (Board) and groups (List):** an empty column narrows but still shows its heading and the number 0; an empty group in the List is hidden.
  - Filter by project, status, priority, responsible party, current holder, label, "có cờ" (flagged), "cần Chủ" (needs Owner), "xong không bằng chứng" (done without evidence). Filters are written to the URL. Can be saved as a custom view.
  - The filter bar is **not open by default**: at the top of the list there are only the **quick tabs** (Đang chạy (Running) · Backlog · Tất cả (All)) and a **"Lọc"** (Filter) button that opens a menu containing all the filter boxes above, together with "Lưu thành view" (Save as view).
  - **Temporary (BAT-41):** the list has no text search box; typing something in ticket-code form (e.g. `sai-5`) into the **Label** filter box shows an extra line "Mở SAI-5" (Open SAI-5) right under the box, leading to `/t/SAI-5`; the label filter stays as is. Pending decision: `spec-questions.md` #167.
- **Ticket detail** `/t/<CODE>`:
  - Left: title and description (edited in place), brief (8 collapsible sections), child tickets, the **assignment chain** as a timeline (assigner → assignee, status, submission report, acceptance), evidence, comments interleaved with history (history collapsed).
  - Right: properties, related tickets (including coordination tickets), related Needs Owner items.
- **Session detail:** activity stream, plan, "Dừng" (Stop) button.
- **Keyboard shortcuts:**
  - `C` create ticket; `G` then `T` go to Needs Owner; `G` then `O` go to the Overview; `G` then `N` go to the Decision log.
  - `Cmd/Ctrl+K` opens the command menu: search codes, titles, T-numbers, run commands.
  - On the selected ticket: `S` status, `P` priority, `L` label, `A` assign (pick an agent).
  - `J`/`K` move; `X` select; apply one key to several tickets; `?` shows the key table.
  - **Multi-select and applying to several cards** (Owner decided T-38 = A, 19/10; details in 19.12 items 67–71): when cards are selected, `S`/`P`/`L`/`A` apply to the **selection**, not to the focused card. The status, priority and label boxes of the multi-select bar **only set a pending value**; `Enter`, arrow keys, Space and typing in the box send no request; **only the "Áp" (Apply) button** next to each box applies (CoS/Owner decided 20/10, item 70). Applying to **N ≥ 10** cards asks again "Áp cho N thẻ?" (Apply to N cards?) before sending; N < 10 applies straight away. `A` opens **one** "Giao N thẻ" (Assign N cards) dialog (it already has an explicit send button, no further question). Clicking the tick box of a card on a wide screen makes that card the focused card and opens the panel; on a narrow layout it does not open the panel.
- **Speed:**
  - Every edit shows on screen immediately, before the server answers; if the server rejects it, it is rolled back and an error is reported as a toast stating the reason.
  - After the first load, changing pages has no full-page loading screen. A list of 5,000 tickets scrolls smoothly.
  - Changes made by agents appear within 3 seconds, without reloading the page.
- **Phone (375px):** the Overview, Needs Owner (including the approval session and the bulk answer box), ticket detail and reports work well. The drag-and-drop board is not required.
- **Time** is shown in relative form ("12 phút trước", 12 minutes ago); hovering shows the full time in Vietnam time.
- **New version available:** a tab running an old web build after a deploy shows a small line "Có bản mới — tải lại trang" (New version available — reload the page) under the top bar; clicking it reloads the page. The interface **never reloads by itself** (the owner may be in the middle of typing). The tab checks when it becomes visible again, when it regains focus and periodically every 5 minutes; if the check fails (offline, …) it stays silent and shows nothing (BAT-39).

## 15. Security
- **The owner signs in** with a password plus a TOTP code (2 factors). Passkeys later. The login session lasts 30 days, with a sign-out-everywhere button.
- Agents use tokens only and do not sign in to the web.
- GitHub and Telegram tokens are stored on the server side and **never returned to the API or UI**.
- Every action leaves a trace of who did it (section 4 History). The agent access log (which command, when) is kept for 30 days.
- **Backup:** export all data to JSON with one button (owner only). There is an automatic daily backup, keeping 14 copies.

## 16. Importing data (migrating from old tools)
- **Import tickets** from a JSON file in the format Baton publishes. Each entry consists of: old code, target project, title, description, old status, priority, labels, old parent code, old related codes, timestamps, comments.
  - The mapping from old statuses to Baton statuses is chosen by the importer on the preview screen.
  - Tickets receive new codes; the old code is stored in the "mã cũ" (old code) field and is searchable.
  - An old ticket in a "done" status goes into Done, labelled "nhập, không bằng chứng" (imported, no evidence), and is not blocked.
- **Import Needs Owner** from markdown with this structure: level blocks 🔴, 🟡, ⚪; each item has a heading starting with `T-số · dự án · loại — tiêu đề` (T-number · project · type — title); plus a "Đã xử lý" (Resolved) table (date | item | result).
  - T numbers are preserved. The T counter continues from the largest number.
- **Import the Decision log** from markdown: day sections, one table per day (time | who | project | decision | why | reference).
- Running it again skips entries already imported (matched by old code, T-number, or the pair of date-time and content). At the end of the import run a report is printed: imported, skipped, errors (with the reason for each row).
- Importing fires no notifications and does not overwrite existing data.

## 17. Definition of done for v0.1
1. Create 3 projects and 4 agents (coordinator, manager, worker, reviewer). The full chain runs through the CLI:
   - the coordinator creates a coordination ticket and assigns the manager.
   - the manager creates a project ticket and assigns the worker.
   - the worker claims, sends heartbeats, sends a commit, then submits the report.
   - the manager assigns the reviewer; the reviewer sends a `pass` review.
   - The commit is merged, and the ticket **moves to Done by itself**. Both tickets (coordination and project) reflect this correctly.
2. Commit not yet merged: the ticket is in Awaiting verification. Once merged: within 10 minutes the ticket moves to Done by itself.
3. The worker agent is silent for 30 minutes: the Overview shows a stalled session, the project turns 🟡, Telegram receives 1 message.
4. The manager calls `ask` with type Decision, level 🔴, 3 options:
   - Telegram reports immediately (immediately = within one cron tick, ≤ 60 seconds).
   - On the phone, the owner taps the button for option B and then taps **Gửi duyệt** (Send approval).
   - The agent's `result --wait` returns option B within 3 seconds.
   - The Decision log has a new row; related tickets have an automatic comment.
5. Bulk answer box: paste 3 lines `T-x: ...`, all 3 items are handled correctly. A line with a wrong code is marked red.
6. A project with no ticket In progress shows "Dự án không chạy" (Project is not running).
7. A worker agent's token tries to assign work: `FORBIDDEN`. The token of an agent without access to project `INC` reads an INC ticket: `NOT_FOUND`.
8. The owner presses Stop: the agent's next `heartbeat` command exits with code 3.
9. The sample `needs-owner.md` and `decision-log.md` files can be imported (format of section 16), preserving T numbers. **Deferred under T-119 (section 16).**
10. Create **200 projects and 200,000 tickets** of fake data: the list and the Overview still open in under 1 second after the first load. The design must further withstand **300 projects** (and any combination below 200,000 tickets) without changing the architecture (see 19.12 item 1).
11. The Overview, Needs Owner and ticket detail work well at a width of 375px.

## 18. Later (not done in v0.1, but must not be blocked)
- Baton starting an agent when an assignment exists (calling a local script or the cloud).
- Multiple workspaces and multiple customers, sign-up, billing (public release).
- English interface.
- Long documents attached to projects; milestones.
- Two-way GitHub integration (auto-linking PRs by the ticket code in the branch name).
- Automatic export of `needs-owner.md` for viewing in an external markdown viewer.
- Passkeys; email notifications.

---

## 19. Behaviour clarifications (after the first SPEC review, 30/09)
This section **takes precedence over** the sections above where they differ. These are product decisions proposed by CoS, awaiting the owner's approval.

### 19.1 "Open" assignments and the current holder
- An **open** assignment is one in `pending` or `in_progress`. A `submitted` assignment is no longer open; it is **awaiting acceptance**.
- Each assignment has a **type**: `work` or `review` (exactly the machine codes in 0.1; see 19.12 item 29). Each ticket has at most 1 open `work` assignment and 1 open `review` assignment at the same time.
- **Current holder**, computed in priority order:
  1. The agent of the open `review` assignment.
  2. The agent of the open `work` assignment.
  3. If there is a `submitted` assignment awaiting acceptance: that assignment's assigner, shown as "chờ <tên> nghiệm thu" (waiting for <name> to accept).
  4. The owner, if the owner pressed "Tôi làm" (I'll do it).
  5. If there is nobody: empty.
- The **"In progress with no holder"** flag only turns on when the ticket is in the `active` group, the current holder is empty, and this has lasted 24 hours.

### 19.2 Ticket status changes on submission and acceptance

| Event | Ticket |
|---|---|
| Submit `done` | Check the gate: satisfied means **Done**, not satisfied means **Awaiting verification** |
| Submit `partial` | Stays **In progress**. The assigner chooses to return it, or to split the remaining work into a child ticket and then accept |
| Submit `blocked` | Back to **To do**. Shown under "Needs attention" for the assigner |
| Acceptance `accepted` | A ticket not yet Done moves to **Awaiting verification**, and Baton checks the gate immediately |
| Acceptance `returned` | Stays **In progress**. A new round is created (see 19.5) |
| Assignment `canceled`, no open assignment left | Back to **To do** |

- Manually changing to Done without enough evidence: rejected with `EVIDENCE_REQUIRED`. A ticket in the `active` group moves to Awaiting verification; one in the `planned` group stays as is.
- **Auto-Done** only applies to tickets in **Awaiting verification**. A commit merged while the ticket is still In progress causes nothing yet; the gate is checked on submit.

### 19.3 Review and new evidence
- A review only counts when it is a PASS `review` sent **after** the last `commit` or `deploy` evidence.
- A new commit or deploy after the review makes the old review **expire**. The ticket stays in or returns to Awaiting verification, flagged **"cần review lại"** (needs re-review; shown under "Needs attention"). The assigner, or a `coordinator` agent, opens a new `review` assignment.
- A ticket already Done is not demoted. Evidence sent after Done is still stored and shows the label "sau khi xong" (after done).
- **"Other than the doer"** means the agent sending the review is not the assignee of any `work` assignment on that ticket. Otherwise it is rejected with `REVIEWER_IS_WORKER`.
- A `review` assignment is created by a `manager` or `coordinator`. The reviewer has its own session, as with every assignment.
- The reviewer submits the review assignment by sending `review` evidence plus a report. The review assignment is **`accepted` automatically**, with no acceptance needed, because the verdict is already in the review.

### 19.4 Coordination tickets
- The link between a coordination ticket (in the coordination project, e.g. `COS`) and a project ticket is its own type: **"điều phối"** (coordination), different from "related". One coordination ticket can link to **1 or more** project tickets.
- A coordination ticket **does not go through the evidence gate**. Its status **follows** the project tickets automatically:
  - At least 1 project ticket in the `active` group: the coordination ticket is **In progress**.
  - All closed, and at least 1 Done: **Done**.
  - All Canceled or Duplicate: **Canceled**, reason "mọi ticket dự án đã huỷ" (every project ticket was canceled).
- When the owner forces a coordination ticket's status, only that ticket changes; it does not spread to the project tickets. A coordination ticket has no separate `work` assignment of the `manager`; the assignment to the `manager` is attached to the coordination ticket itself.

### 19.5 Returning
- `returned` creates a new round in status `pending`, with the same assignee. The assignee must `nhan` (claim) again, opening a **new session**. The response deadline applies again.
- The new round's brief = the old brief, plus a **"Lý do trả lại"** (Reason for return) section placed at the top.
- An agent's **first-time pass rate** (shown on the agent page, computed over the last 30 days) = the number of tickets on which the agent's first `work` assignment was `accepted` ÷ the number of tickets on which the agent has submitted at least once.

### 19.6 Sessions on cancel, on waiting for the Owner, on asking the assigner
- **Canceling an assignment** that has a running session: the session moves to `stopping`, handled like pressing Stop (section 6).
- **`waiting_owner` session:** never counted as stalled. When the Needs Owner item is resolved or skipped, the session returns to `running` and the stall threshold is counted afresh from that moment.
- **Asking the assigner:** when the agent sends a `question` activity, the session moves to `waiting_assigner`. This status is not counted as stalled, but after 60 minutes it shows under "Needs attention".
  - The assigner is an agent: the question shows in the assigner's `baton tasks`. The assigner replies with `baton reply <assignment> "<content>"`.
  - The assigner is the owner: replies on the ticket page.
  - When a reply arrives the session returns to `running`, and the agent's next call receives the reply.
- **Project indicator** (replaces section 2):
  - 🟢 at least 1 ticket in the `active` group, and none of the 🟡 conditions.
  - 🟡 there is a `stalled` or `error` session; there is a "No response" assignment; there is a "no holder" flag; or there is a "needs re-review" flag older than 24 hours.
  - ⚪ no ticket in the `active` group.
  - A `waiting_owner` session still counts as 🟢, but the project line adds "chờ Chủ: T-x" (waiting for Owner: T-x).

### 19.7 Unmerged commits and failed evidence
- `failed` **does not block permanently**: sending new evidence is enough. The server only retries by itself when the error is a network error or a GitHub error.
- A `pushed` commit not merged after 7 days: tracking stops. The evidence carries the label "chưa merge sau 7 ngày" (not merged after 7 days); shown under "Needs attention"; Telegram reports once. Send the same commit again to track for another 7 days.

### 19.8 Deadlines and notifications of Needs Owner
- Overdue: **the level does not change**. The card has a red border, the text "quá hạn X" (overdue by X), and is moved to the top of its block.
- **Default deadline of 🟡:** created before 18:00, the deadline is 20:00 the same day; from 18:00 onwards, the deadline is 20:00 the next day. 🔴 is always 4 hours from creation.
- Type `Chỉ để biết` (FYI) is at most 🟡. If 🔴 is sent, the server lowers it to 🟡 by itself and tells the agent so in the returned result.
- **Quiet hours:** a new 🔴 is still sent immediately (immediately = within one cron tick, ≤ 60 seconds). A 2-hour reminder that falls within quiet hours is postponed to the end of quiet hours.

### 19.9 Result, skip, reopen
- **Result:**
  - Type `Quyết định` (Decision): choosing 1 option is required, the additional note is optional.
  - Other types: text is optional. If left blank Baton fills in "đã chạy" (ran it; command type), "đã xem" (reviewed; review type), "đã đọc" (read; FYI type) by itself.
- **Skip:** a reason is required. Writes to the Decision log ("T-x bỏ qua: lý do"; English: "T-x skipped: reason"), comments on related tickets, and the agent receives status `skipped`.
- **Reopen:** adds a new Decision log row "T-x mở lại" (T-x reopened) and a comment "T-x mở lại". Handling it the next time again adds a new row and a new comment. The old row is not edited.
- **`baton result --wait`** timing out while the item is still unhandled: prints "chưa xử lý" (not handled yet), exits with **code 4**. The exit code table in section 13 is extended: 4 = wait timed out.

### 19.10 "Should be clear" points
- **The owner does it personally:** the "Tôi làm" (I'll do it) button moves the ticket to In progress, the current holder is the owner, there is no heartbeat. Entering Done still goes through the gate; the owner can force it.
- **Child tickets created by a `worker` agent:** go through the gate like ordinary tickets. If the assignment on the parent ticket is canceled, the child ticket does not change, and a warning "lượt cha đã huỷ" (parent assignment was canceled) is shown.
- **No-code project:** if the owner skips the confirmation item, the ticket stays in Awaiting verification. The gate applies according to the "has code or not" flag **at the time of the check**.
- **Bulk answer box:**
  - A line pointing to an already-resolved item: marked red "đã xử lý, mở lại trước" (already resolved, reopen first).
  - Several lines with the same code in one paste: all those lines are marked red, none is applied.
- **Buttons and keys on the card:** per the "Answer with buttons, then press Send" table in section 8. The phone uses buttons; keys are not needed.
- **Additional error codes:** `REVIEWER_IS_WORKER`, `ALREADY_RESOLVED`.

### 19.11 Additional defaults (after the second SPEC review)
- **FAIL review:** the review assignment is still `accepted` automatically, but that review does not open the gate. The ticket stays in Awaiting verification and shows under "Needs attention" for the assigner, with the reviewer's note.
- **Coordination ticket:** when no project ticket is in the `active` group yet, and not all are closed yet, the coordination ticket keeps its current status.
- **Canceling a `work` assignment while a `review` assignment is open:** the review assignment is not canceled with it.
- **Parent ticket in Awaiting verification because child tickets remain:** shows the line "chờ N ticket con" (waiting for N child tickets). When the last child closes, the parent re-checks the gate by itself.
- **Needs Owner result when the session has closed, or the agent has been disabled:** the result is still stored and retrievable through `baton result`. No further signal is sent.

### 19.12 Decisions of the spec sessions
This section collects the owner's decisions over three batches, answering the questions in `spec-questions.md`:
- **Batch 01/10/2026** — questions **#1–#8**, which are items **1–8** below.
- **Batch 02/10/2026 (T-64)** — questions **#18–#27**, which are items **9–18** below.
- **Batch 03/10/2026 (T-69)** — questions **#9–#17** and **#28–#54**, which are items **19–54** below.
- **Batch 04/10/2026 (T-76)** — questions **#57–#59** and **#66–#69**, which are items **55–61** below.
- **Batch 04/10/2026 (T-80 + T-80b)** — questions **#71**, **#73**, **#74**, **#75**, which are items **62–65** below.

This section **takes precedence over** the older wording in the sections above where they differ.

1. **Acceptance performance mark (replaces the old number in 17.10).** v0.1 passes acceptance when, with **200 projects and 200,000 tickets**, the ticket list and the Overview still open in **under 1 second** after the first load. The design must further withstand **300 projects** (and any combination below 200,000 tickets) **without changing the architecture**.

2. **The `baton reply` command (addition to the command table in section 13).** `baton reply <assignment> "<content>"` replies to a question an agent sent on the assignment (section 19.6).
   - **Only that assignment's assigner** can call it. Another agent calling it → `FORBIDDEN`.
   - The owner replies from the web on the ticket detail page; the behaviour is identical.
   - The reply is recorded as **an activity on the asker's session** (the session of the agent that sent the `question`), and **at the same time** as a **comment on the ticket**.

3. **Initializing the owner, and recovering 2FA (addition to section 15).** The owner is created by a **command run on the server**, `baton-admin init` — there is **no public web page** that does this.
   - `baton-admin init` sets the owner's name and password, shows the **TOTP QR code once**, and prints **10 single-use recovery codes**.
   - The command only runs when there is **no owner yet**.
   - Lost TOTP device: sign in with **password + 1 recovery code**, then reset TOTP.
   - Lost the recovery codes too: `baton-admin reset-2fa` on the server.
   - **Every reset** (TOTP or password) writes a History row and fires a Telegram notification.

4. **"Chung" (General) in Needs Owner is an empty value (section 8).** "General" is **not a project**; it is the project field left **empty**.
   - The interface shows the label **"Chung"** (General) for the empty value.
   - The project filter has a **"Chung"** (General) choice (filters items whose project field is empty).
   - `baton ask` without a project → the item is General.
   - A Decision log row auto-generated from a General item leaves the project field **blank**.

5. **Version code of `deploy` evidence (section 7).** The version code is **only stored and shown**; the server **does not check** it. Deploy verification relies only on an HTTP code of **2xx or 3xx**.

6. **Telegram send failure (section 12).** Retried **3 times** at intervals of **10 seconds, 60 seconds, 5 minutes**.
   - Still failing: the message is **kept in the in-app notification bell**, and shown under **"Needs attention"** as the line `Không gửi được thông báo Telegram (lý do)` (English: "Could not send Telegram notification (reason)").
   - A Telegram send failure **never blocks the main flow** (the command that caused the notification still succeeds).

7. **Backup (section 15).** Backups are placed in **storage separate from the main DB** (R2).
   - The Settings screen lists **14 copies**, each with its **date** and **size**, with a **download button**.
   - **Restore is a manual task, with written instructions** — v0.1 has **no** restore button.

8. **Search scope of `Cmd/Ctrl+K` (section 14).** The command menu searches **only** in: **ticket code**, **ticket title**, **old code** (for imported tickets, section 16), **T-number**, and **Needs Owner item title**. Matching is by **substring**; full-text search is not needed. Searching in **description, brief, comments** is left for v0.2. (The "search by text" of the Decision log in section 10 stays as is.)

9. **"Reopen" is every departure from the `closed` group (amends section 4 line 138; settles `spec-questions.md` #18).** Section 4 only mentions the "back to To do" case; now **every** departure from the `closed` group counts as a "reopen", so **only the owner** can do it.
   - This includes Done → In progress, Canceled → Backlog, Done → Canceled — not only the back-to-To-do case.
   - Broader than the old wording of the SPEC, **intentionally**: this is the safe direction; an agent can never alter the conclusion of a closed ticket.

10. **"Valid original ticket" for the Duplicate status (addition to section 4 line 137; settles #19).** Section 4 names the error code `INVALID_DUPLICATE_TARGET` but does not define "valid". Valid means **all four** conditions hold:
    - **Exists and is not soft-deleted.**
    - **Same workspace** (data is separated by workspace — section 1); **a different project is allowed**, because section 4 says ticket links "may cross projects".
    - **Not itself.**
    - **Does not create a duplicate cycle** — the original ticket must not point back to the ticket being marked duplicate, directly or through a chain. Without this condition, everything that "follows the original ticket" loops forever.

11. **"Delete anything" is about deleting objects (interprets section 3 against section 4; settles #20).** The row "Delete anything — never" of the section 3 permission table applies to deleting **objects**: tickets, evidence, history rows, Needs Owner items.
    - **Removing a label does not belong to that row.** Removing a label is resetting the value of a field, the same kind of action as changing priority, and it still leaves a trace in history.
    - Adding a label **and** removing a label both go through the **"Change ticket status"** row.

12. **The parent ticket is set only at creation (addition to section 4, field "Parent ticket"; settles #21).** The parent ticket is set **when the ticket is created**, and **there is no path to change or remove the parent later**.
    - Reason: changing the parent changes the `CHILDREN_OPEN` rule of two trees at once (the old tree may just have become eligible for Done, the new tree the reverse).
    - The ticket-link command deliberately **does not accept** the `parent` type.

13. **Comment permission (addition to section 3; relates to sections 4, 6; settles #22).** The section 3 permission table has no row for comments. The condition is **"the agent may enter the project"**, plus **not being `disabled`** — **regardless of role**.
    - Even a **`reviewer`** can comment, because section 6 requires that the reviewer can send signals on its session.
    - **Do not borrow** any other row of the permission table (e.g. "Change ticket status"): borrowing silently changes the meaning of that row, and would block `reviewer` from commenting.

14. **Deleting and editing comments (addition to section 4, Comments part; settles #23).** Section 4 says "The author can edit their own (marked 'edited'). Agents cannot delete", but says nothing about the owner.
    - **The owner can delete** a comment, and it is a **soft** delete (a trace remains) — section 15 requires "every action leaves a trace of who did it", so a comment vanishing without a trace goes the wrong way. The read path filters out deleted comments.
    - "The **author** can edit their own" is read **literally**: **the owner cannot edit** an agent's comment either, because once an agent's comment has been edited by the owner the conversation history is no longer trustworthy.

15. **Out of scope: the READ path returns 404; the WRITE path: object not visible ⇒ 404 identical to a made-up id, visible but no permission ⇒ 403 (addition to sections 13 and 17.7; settles #24, amended per #175–#177).** Sections 13 and 17.7 only talk about the read path; this now settles both paths.
    - **READ path → `NOT_FOUND`/404** — so as **not to reveal existence**.
    - **WRITE path → `FORBIDDEN`/403** when the caller can see the object but has no permission. The error code is also a signal to the CLI: 404 makes the agent think it mistyped the id and go fix the data it sends, while 403 states the right thing to do, which is to request permission. The id of an object the caller **cannot see** yields a 404 identical to a made-up id — the two bullets below.
    - **Permission must be checked before looking up the object, or the object must be looked up within the caller's scope from the start** (out of scope, the lookup comes back empty and takes the same path as a made-up id). Looking up the project first and only then checking permission makes 404 ("does not exist") differ from 403 ("exists, not allowed in") — that is an existence probe. For an out-of-scope agent, **both cases must produce identical responses**.
    - **An agent referenced by ID in the body of a write command** (assignment assignee `nguoi_nhan_agent_id`, responsible party `chiu_trach_nhiem_agent_id`) that lies **outside the caller's permission scope** → `NOT_FOUND`/404, **identical** to a non-existent ID (same code, message, status), **not** 403 — so as not to reveal the agent's existence. An agent the caller **can see** but that is disabled or not in the project is still `FORBIDDEN` (section 5). (Owner decided T-58 = A, 22/10; #172)
    - **Object ids for which the write gate only knows the project after looking them up** — ids of **assignments, sessions, tickets, comments, evidence, projects** — in **every write command** (in the path or in the body): an object **outside the caller's scope** → `NOT_FOUND`/404 **identical** to a non-existent id (same code, message, status, body), and **nothing is written** (no History, Decision log, notification, session signal, "last spoke"). When the caller **can see** the object but has no permission for that action → still `FORBIDDEN`/403. Reason for not returning 403 in both cases: the write gate does not know the project of an id before looking it up, so a 403 for a made-up id would report "no permission" to someone **inside** the scope who merely mistyped the id. **Owner-only** commands (or ones that check role/project gate **before** the lookup) return 403 for every id — nothing is revealed, unchanged. (Owner decided T-73/T-75 = A, 23–24/10; #175, #176, #177)
      - "Can see" an **assignment** on the write path = the assignment's ticket is in the caller's read scope, **or** the caller is the assignee or assigner of that very assignment. A **session**: the ticket is in the read scope, **or** the caller is the session's agent, **or** is the assigner of the session's assignment. So an assignee/assigner removed from the project can still carry on commands on **their own** assignment (`claim`, `heartbeat`, `log`, `plan`, `submit`, `cancel`, `verdict`, `reply`; items 37, 44). The session **read** path still follows the ticket read rule.
      - "Can see" a **ticket** = the ticket is in the read scope. A **comment / piece of evidence**: its ticket is in the read scope, **or** the caller is the comment's author / the evidence's sender. An assignee removed from the project gets 404 on commands by ticket id (edit, change status, comment, send evidence…).
      - "Can see" a **project** = a project the caller may enter (the owner and "all projects" agents see every project).
      - **The original ticket of a Duplicate** (section 4) outside the caller's scope is treated as non-existent → `INVALID_DUPLICATE_TARGET`, like a made-up id. A `coordinator` allowed into only some projects **cannot** mark Duplicate against a ticket outside those projects, and **cannot** propose a focus item (section 11) with a ticket outside those projects (404).

16. **Who can create a `dieu_phoi` link (addition to 19.4 and the section 3 permission table; settles #25).** **Only the owner and agents with the `coordinator` role** can create a link of type `dieu_phoi`.
    - Reason: the `dieu_phoi` link is what **defines** a ticket as a coordination ticket, and a coordination ticket **does not go through the evidence gate** (19.4) — so letting a `manager` create the link itself opens a way around the evidence gate.
    - The new rule is an **additional** condition: the existing permission and project-scope conditions still apply (permission is needed on **both** ends of the link).
    - **`related` and `blocks` stay as they are** — neither tightened nor loosened.

17. **Soft-deleted project tickets and the coordination ticket (addition to 19.4 against section 4; settles #26).** A coordination ticket's status follows the project tickets linked by `dieu_phoi`; this now settles the computation when the owner soft-deletes or restores.
    - A **soft-deleted ticket does not count** in the set of project tickets the coordination ticket follows.
    - Deleting the **last** ticket of the set (no ticket left) ⇒ the coordination ticket **keeps** its status, in the same spirit as 19.11 ("not enough facts, keep as is").
    - **Restoring** a ticket ⇒ the coordination ticket's status is **recomputed** from the new set.

18. **Permission for the two number-allocation commands (addition to section 3; relates to sections 4, 8; settles #27).** The section 3 permission table has no row for "allocating a number", but allocating a number is a real **write** command: one call burns a number forever. Use the row **closest in purpose**:
    - Allocating a **ticket number** (section 4, "increases within the project, never reused") goes through the **"Create ticket"** row.
    - Allocating a **`T-number`** (section 8) goes through the **"Create a Needs Owner item"** row.
    - No assignment-scope flag is passed, so `worker` is rejected — the safe default.

19. **Which HTTP class each error code belongs to (addition to the section 13 table; settles #9).** Section 13 lists the HTTP classes but does not say which error code belongs to which class. Now settled by the meaning of the class:
    - **409** for "the current state does not allow it": `PROJECT_NOT_ACCEPTING`, `SESSION_CLOSED`, `CHILDREN_OPEN`, `ALREADY_RESOLVED`.
    - **422** for "data or business condition not met": `EVIDENCE_REQUIRED`, `REASON_REQUIRED`, `INVALID_DUPLICATE_TARGET`, `INVALID_INPUT`, `OPTIONS_REQUIRED`, `COMMAND_REQUIRED`, `REVIEWER_IS_WORKER`.
    - **500 `INTERNAL`** for unforeseen server errors; the CLI exits with **code 2**. This code is an **additional** code, because the section 13 table declares itself to be the "minimum error codes".
    - The mapping table lives in **one place** and has tests covering every code.

20. **What the owner can adjust in an agent's permissions (addition to section 3; settles #10).** The owner can adjust **both**: `cho_phep` (turning a cell on/off) **and** the cell's `pham_vi`.
    - The owner turning on a cell that was `—` **without** stating a scope is read as **"yes"** — it must still pass the project gate.
    - The two "**never**" rows **accept no override** at all three layers: code, the permission module, and the database `CHECK`.

21. **A `disabled` agent calling the API gets `FORBIDDEN`/403 (addition to section 3 against section 13; settles #11).** The token is *correct*; only the identity is turned off, so it is **`FORBIDDEN`/403** — not `INVALID_TOKEN`/401.
    - Reason: authentication succeeded; it is just not allowed to act.
    - The message states clearly "Agent đã bị tắt" (English: "The agent has been disabled"), so whoever reads the log understands at once.

22. **Editing other ticket fields goes through the "Change ticket status" row (addition to section 3; settles #12).** The section 3 permission table only has the "Change ticket status" row; that row is shared by **every field edit** of a ticket (title, description, priority, labels, brief, due date), **with the same scope**: `worker` only tickets of its own assignment, `manager` in the project, `coordinator` yes, `reviewer` no.

23. **An agent's "last spoke" and a session's "signal" are two different marks (interprets section 3 against section 6; settles #13).**
    - **"Last spoke"** (section 3, agent page) = **every successful write command** by the agent, **whether attached to a session or not**. Read commands do not count.
    - **"Session signal"** (section 6, stall threshold) only counts write commands related to **that session** (see also item 41).

24. **Which agents' details an agent can read (addition to section 3 against section 13; settles #14).** An agent can read: **itself**, agents that **share at least one project** with it, and agents with the "all projects" flag.
    - The owner can read **every** agent.
    - Out of scope → **`NOT_FOUND`**, like every other read path (item 15).

25. **An `archived` project can be reopened (addition to section 2; settles #15).** "Read-only" is not a one-way door: **the owner can reopen** an archived project.
    - Every **write** command on an `archived` project is rejected (`PROJECT_NOT_ACCEPTING`), **except** the very act of **the owner changing `trang_thai`**.

26. **The owner can create tickets in a `paused` project (interprets section 2 against section 4; settles #16).** `paused` is a rule for **agents**: agents take no new work and cannot create tickets. **The owner still can** — the owner must be able to plan ahead for a paused project.
    - `archived`, however, is **read-only for everyone** (except the case in item 25).

27. **`archived` projects are hidden at the API layer, not only in the UI (addition to sections 2 and 13; settles #17).** The project-list read path **hides `archived` projects by default**.
    - There is a flag **`?gom_luu_tru=co`** to get them all, and **`?trang_thai=archived`** still returns exactly that group — no data is locked out of view.
    - **Reading an individual archived project still works** (read-only must be readable).
    - Reason for hiding at the API: if the UI filtered by itself, the web, CLI and MCP would each have to remember to filter, and `baton list` would show archived projects while the sidebar did not — "hidden" is **one** rule, not three identical implementations.

28. **Two new error codes for assignment state conflicts (addition to the section 13 table; settles #28).** Two cases of section 5 had no code; two codes are now added, **both 409** (the "current state does not allow it" group, item 19):
    - **`ASSIGNMENT_OPEN`**: the ticket already has an **open assignment of the same type** and another is still requested (section 5, 19.1).
    - **`ASSIGNMENT_NOT_PENDING`**: the **claim** command is called on an assignment that is no longer `pending`.
    - These two codes are **additional** codes, declared separately, **not** mixed into the minimum table of section 13.

29. **The assignment type is `work` (corrects the wording in 19.1; settles #29).** Section 0.1 gives the assignment type as `work` / `review`, while 19.1 wrote "`worker` or `review`". Now settled as **`work`**, and **the wording in 19.1 is corrected — 0.1 is not changed**.
    - Reason: 0.1 is the **only** machine-code table of the SPEC and declares that it applies to "the API, CLI, MCP, **database** and logs"; the wording in 19.1 is prose.
    - In addition, `worker` **collides with the name of an agent role**; an assignment field carrying exactly the name of a role is a lasting source of confusion.

30. **"Child tickets of the assignment it is working" uses exactly the "open" definition of 19.1 (interprets section 3; settles #30).** The word "**working**" in the two scope cells of `worker` in the section 3 permission table means an **open** assignment = `pending` **or** `in_progress`.
    - Reason: the whole system has only **one** concept of "its own assignment", not two concepts that differ by one status.

31. **Only the actual assignee can call the "claim" command (addition to section 5; settles #31).** **Even the owner** calling it on the agent's behalf gets `FORBIDDEN`.
    - Reason: "claim" is not an administrative action but **the agent's declaration that it is running** — it opens the session and starts the stall-threshold clock (section 6). The owner claiming on its behalf creates a session with nobody at the other end, i.e. breaks exactly what section 6 exists to guarantee.
    - The same pattern as item 2 (`baton reply` only by the assigner). The owner can still **cancel** the assignment (section 5).

32. **An assignment with no response deadline (interprets section 5; settles #32).** The words "a response deadline **can** be set (default 15 minutes)" mean it is permitted not to set one:
    - **No deadline** is a real value (`null`), and that assignment is **never** counted as "No response".
    - **Ceiling of 30 days**, so that a mistyped value does not become a disguised infinite deadline. An unreasonable value → `INVALID_INPUT`.

33. **Canceling an assignment when the ticket is closed leaves the ticket as is (amends the last row of the 19.2 table; settles #33).** The row "Assignment `canceled`, no open assignment left → **Back to To do**" **only applies to tickets not yet closed**.
    - For a ticket in the `closed` group, canceling the assignment **keeps the ticket status**.
    - Two more specific rules **beat** the general wording of the 19.2 table: 19.3 "a ticket already Done is not demoted", and item 9 "every departure from the `closed` group can only be done by the owner" — while canceling an assignment is the assigner's action.

34. **"Submission report required" only requires the `Kết quả` (Result) field (interprets section 5 line 166; settles #34).** The words "required on submit" mean **a submit must come with a structured report**, not that all 6 fields are required.
    - **`Kết quả` (Result) is required** — the 19.2 table drives the ticket status from it. Missing → `INVALID_INPUT`.
    - **The other five sections** (Done · Verification · Branch and commit · Risks · Follow-up work) **may be left blank**.
    - Reason: "Branch and commit" is meaningless for a no-code project (19.10) and "Follow-up work" is meaningless when there is no follow-up work — requiring them forces the agent to fill in junk text, making the report less trustworthy.

35. **"Reason for return" sits at the top of the brief's goal field (addition to 19.5 against section 4; settles #35).** The brief in section 4 is 8 fixed fields, with no "Reason for return" field. The reason for return is **inserted at the top of the `muc_tieu` field** as a block `Lý do trả lại: <reason>` (English: "Reason for return: <reason>"), followed by the old goal.
    - Reason: `muc_tieu` is the first field an agent reads, so "placed at the top" preserves the intent of 19.5.
    - **Known and accepted consequence:** the new round's `muc_tieu` is no longer a pure goal. The cleaner direction (adding a 9th brief field) changes the brief structure of section 4, and is **not done in v0.1**.

36. **A ticket created from "Follow-up work" has no link at all (addition to section 5 line 169; settles #36).** The "Create ticket from follow-up work" button creates an **ordinary ticket in the same project**, with **no** link to the original ticket.
    - `parent` is not chosen: it brings in the `CHILDREN_OPEN` rule, meaning the original ticket cannot enter Done until the follow-up work is done — contrary to the definition "follow-up work is work **not done on own initiative**".
    - `related` is not chosen: that would be an auto-generated link the SPEC does not require.
    - The assigner **links manually** with the link command if they wish.

37. **Submitting a report, acceptance and canceling an assignment check identity (addition to section 3 against section 5; settles #37).** These three commands **do not go through the permission table** of section 3; they check **identity** exactly as section 5 says: the **assignee** submits, the **assigner** accepts, the **assigner or the owner** cancels.
    - This direction is stricter: a `manager` with every permission still **cannot** accept someone else's assignment. The owner cannot accept an assignment they did not assign either.
    - **Do not borrow** any row of the permission table — borrowing silently changes that row's meaning (same reason as item 13).
    - The three commands are still write commands, so they remain subject to the "a `disabled` agent is rejected" rule (item 21).

38. **A second submit on an already `submitted` assignment is rejected (addition to section 5 against 19.1; settles #38).** The assignment must be `in_progress` to be submitted; submitting again → **`ASSIGNMENT_STATE_INVALID`/409**.
    - Reason: a submit is an **event** that drives the 19.2 table (it may already have pulled the ticket to Done and checked the gate) — allowing a resubmit is allowing that event to be **replayed**.
    - The right path for "redo" already exists: acceptance `returned` → a new round (19.5).
    - Section 15 requires every action to leave a trace, and overwriting a report erases the trace.

39. **Session status has all 7 codes (corrects the wording in section 6; settles #39).** Section 6 listed 6 codes, missing **`waiting_assigner`** (Waiting for assigner), which both 0.1 and 19.6 use. Now settled per **0.1 (all 7 codes)**, and **the wording in section 6 is corrected — 0.1 is not changed**.
    - The same situation and the same reason as item 29: 0.1 is the **only** machine-code table and declares that it applies to the database too; the list in section 6 is prose.

40. **Stall threshold: the agent level beats the project level (interprets section 6 line 189; settles #40).** The words "adjustable per project **or** per agent" do not say which level wins when both are set. Now settled: **agent beats project**, then falls back to the **default of 30 minutes** if both are blank.
    - Reason: the stall threshold is a property of **an agent's real running rhythm** (an agent with long builds needs a wide threshold in every project), while the project is only a default for the whole group.

41. **Which session signal a write command bumps for the calling agent itself (interprets section 6 line 188; settles #41, amended per #174 — Owner decided T-73/T-75 = A, 23–24/10).** Many write commands are **not attached to any assignment** (commenting on another ticket, a `coordinator` creating a ticket, changing priority), so there is no "that session". Now settled, for a successful write command by an agent:
    - A command **attached to an assignment** (`heartbeat`, sending a `log` activity, `plan`, `submit`, `claim`) only refreshes the liveness signal of **that assignment's session**, and only when it is the session of **the calling agent itself**. Other sessions of the same agent are **not** bumped. (Applies even when the command is rejected with the `SESSION_CLOSED` of item 45.)
    - A command **not attached to any assignment** (comment, create/edit ticket, evidence, assign, accept, cancel, reply…) only refreshes the signal when the agent has **exactly 1 open session**; when the agent has **2 or more open sessions** the command **bumps no session**. "Open session" = not yet `closed` and not `stopping` for more than 10 minutes (section 6). The "exactly 1 open session" count **includes a session closed within that very command**: the agent has session A open, and a general command of its own closes session B (e.g. the agent moves B's ticket to Awaiting verification or Done with `baton status` — section 6 "the session closes when the ticket moves to Awaiting verification or Done") ⇒ the count is 2 ⇒ A is **not** bumped: that command is evidence about B, not about A. An agent with several sessions keeps each one alive with `baton heartbeat --luot <assignment>` (section 13).
    - Basis: section 6 exists to know whether "the agent **is really running**" — an agent that has just written something is **clearly running**, so letting it be counted as stalled gets wrong exactly what section 6 must do. But when an agent holds several sessions, a command of one session does **not** prove the other is still alive: bumping every session means a session that died midway is "rescued" forever by the session still running, and the stall alert of section 6 never fires.
    - The agent's "last spoke" (item 23) and the repeat-fire guard mark (item 46) do not change.
    - Commands by the **owner**, and commands by **another agent**, bump no session's signal.
    - This rule applies at the **common write gate**, not sprinkled by hand into each command — sprinkled by hand, a write command added later would forget it, silently.

42. **Only a `running` session derives to `stalled` (addition to section 6 lines 182–187; settles #42).** A session in `error` or `stopping` that stays silent past the threshold does **not** become `stalled`.
    - Reason: letting `stalled` swallow `error` **hides a more specific piece of information behind a vaguer one** — the owner needs to know the agent **reported an error**, not "the agent is silent". Sections 11 and 19.6 both place "stalled **or** error" side by side as two equal things.
    - `stopping` already has its own 10-minute clock from section 6 line 194. `waiting_owner` and `waiting_assigner` are already exempted by 19.6.

43. **Mapping the 7 session codes to the 5 agent status codes (addition to section 3 lines 98–103; settles #43).** Agent status has 5 codes, sessions have 7; this now settles where the three missing codes go, and settles the case of an agent with **several open sessions**:
    - **`waiting_assigner` and `stopping` → `busy`** (the agent is still running, merely waiting or cleaning up).
    - **`error` → `stalled`**, following the way sections 11 and 19.6 merge "stalled **or** error" into one attention level. This is the **only** place in the system where `error` is merged into `stalled` — the opposite direction to item 42, **intentionally**: item 42 is about the **session** (which must be precise), this is about a **summary label of the agent** (only 5 slots).
    - **Several open sessions:** take **exactly the listing order of section 3** as the priority order, and **`disabled` beats everything**.

44. **Heartbeat and the Stop button check identity (addition to section 3 against section 6; settles #44).** The section 3 permission table has no row for these two actions; they **borrow no** row of the permission table:
    - **Heartbeat: only that session's agent** — even the owner gets `FORBIDDEN`, for the same reason as item 31 (a heartbeat is the declaration "I am running"; the owner sending it on the agent's behalf breaks exactly what section 6 guarantees).
    - **Stop: owner only**, exactly per the wording of section 6 line 192 ("The owner presses Stop").

45. **`SESSION_CLOSED` only applies to commands explicitly attached to an assignment (interprets section 6 line 195; settles #45).** "Every write command after the session has closed is rejected" is **not** read broadly as every write command of the agent:
    - **Blocked:** commands explicitly attached to an assignment (heartbeat, submitting the report, activity stream, the assignment's evidence).
    - **Not blocked:** general write commands (comment, edit ticket) — they simply do not bump the signal of a closed session.
    - Reason: `SESSION_CLOSED` exists to stop an agent from **continuing the work of a finished assignment**, not to strip the agent of its identity. Read at its broadest, it would block reviewers too and block an agent from commenting on a ticket where it has no assignment.

46. **Who detects a session moving to `stalled` or `error` in order to fire the alert (addition to section 6 line 196; settles #46).** `stalled` is a **derived status, not written to the database** (item 42), so it must be settled who detects "the transition":
    - The alert is detected by a **Cron Trigger scanning every 5 minutes**, **not** relying on someone having the Overview open.
    - Keep a **mark of "which signal an alert has been fired for"** to prevent repeat firing — not an on/off flag: with a flag, "recovers and then stalls **again**" cannot be distinguished from "still stalled since last time". With the mark tied to the last signal, each new silence is **one** firing, exactly per the wording of line 196.
    - The mark is written **through the write gate** (Durable Object), like every other write.
    - The notification is **written to the in-app notification store**; **actually sending Telegram is part 7**.

47. **Submitting the report counts as confirming the stop (addition to section 6 line 193 against 19.6; settles #47).** When an agent in `stopping` **submits its report**, the session **closes** with the reason "đã nộp báo cáo" (report submitted) — no additional `result` entry is demanded.
    - Reason: a submit is a **fuller** conclusion than `result`; rejecting it in order to demand a `result` makes the agent redo what it just did.
    - **The two ways into `stopping` are not symmetric, and that is the decision:** on pressing Stop the assignment is still open, so a submit is possible; on **canceling the assignment** (19.6) the assignment is already `canceled`, so **`result`/`error` is the only exit**, exactly as section 6 says.

48. **The 60 minutes of `waiting_assigner` count from when the `question` was sent (interprets 19.6 line 516; settles #48).** The counting mark is **when the agent sent the `question` activity**, **not** the session's last signal.
    - Reason: these 60 minutes measure **the assigner being slow to reply**, not the agent being silent. An agent waiting for a reply while still sending heartbeats is normal and correct — counting from the last signal makes the rule **disable itself** in exactly the case where it needs to run.

49. **Changing the stall threshold applies immediately to running sessions (addition to section 6 line 189; settles #49).** When the owner changes the stall threshold of a project or agent, it **applies immediately** to running sessions, not only from the next session. Each computation takes the **current configuration**; the threshold is not snapshotted into the session when it opens.
    - Reason: the owner loosening the threshold is usually looking **right now** at a session wrongly reported as stalled and wants it to stop reporting at once; having to wait for the next session makes that button useless exactly when it is needed.
    - **Accepted consequence:** a session's stalled label can change **without any command touching that session**.

50. **By which path an `error` session recovers, and its repeat-fire guard mark (addition to section 6 line 196 and 19.6; settles #50).** `error` is a status **written in the database**, so a new signal (heartbeat, `thought` entry) does **not** take the session out of `error`.
    - The **only** way out of `error`: the agent sends a `question` entry → the session moves to `waiting_assigner`; when the assigner's reply arrives it returns to `running`.
    - The repeat-fire guard mark of `error` is **not** tied to the last signal but to **the entry into `error`**: an agent that errors and keeps sending heartbeats is still **one** transition, so only **1** message; leaving `error` and entering it again is a new transition ⇒ **fires again**.

51. **A token revoked or an agent disabled while a long-wait command is hanging is cut off immediately (addition to section 13 against section 3; settles #51).** Section 3 says the old token stops working "**immediately**", yet a long-wait command that has already authenticated hangs for up to another minute. Now settled: **cut off immediately**, not run to completion.
    - Each time the waiting command wakes it **re-checks the token**: no longer valid → `INVALID_TOKEN`/401; agent `disabled` → `FORBIDDEN`/403 (item 21).
    - Revoking the token **wakes** that agent's hanging command by itself, so there is no gap of "data readable for one more minute".

52. **`baton tasks` works for the owner (addition to the section 13 command table; settles #52).** The owner is never the *assignee* of an assignment (section 5), but 19.6 says an agent's question shows in the **assigner's** `baton tasks`, and the assigner may be the owner.
    - The owner can call it: it returns an **empty assignment list**, plus exactly the **questions waiting for the owner's reply**. The long-wait mode also wakes when there is a new question.
    - Reason: the API path is **one** path for the web, CLI and MCP alike (section 13), so building a second path just for the owner to read questions is implementing the same rule twice.

53. **A long-wait command is not a session signal (interprets section 13 line 352 against section 6 line 188; settles #53).** `baton tasks --wait` is a **read command**, so it **does not bump the signal**, exactly per the words "read commands do not count".
    - An agent that wants to keep its session alive sends **`baton heartbeat`**.
    - Note: an agent *between two assignments* has no open session, so there is nothing to count as stalled; the only worrying case is an agent that **has an open session** and yet goes off to wait for other work.

54. **A soft-deleted coordination ticket is skipped during propagation (addition to 19.4 and 19.11 against section 4; settles #54).** Item 17 settles the **child** end (a soft-deleted project ticket does not count in the set); this now settles the **parent** end: for a **soft-deleted** coordination ticket, propagation **skips it** — no recomputation, nothing written for it, and **no error reported**.
    - Reason: once a ticket is deleted its status no longer means anything to anyone; letting it **block** a command on a live project ticket is using something discarded to block something in use.
    - Applies to **every** propagation path: status change, delete, restore.

55. **Deploy verification does not follow redirects, and does not read the response body (addition to section 7 lines 207 and 219; settles #57).** The blocking layer of l.207 can only block the **host syntax**, so the two remaining holes are closed as follows:
    - **No following of redirects.** A **3xx** code counts as a **pass** exactly per the wording of l.207, and then it **stops** — the server makes **no** second call following `Location`. That way no call bypasses the host-blocking layer.
    - **No reading of the response body.** No line of the SPEC uses the body, and reading it invites an infinitely long response to eat memory.
    - **Re-check the host syntax right before calling**, redundant **on purpose**: the periodic retry path (l.221) reads the URL **from the database** and no longer goes through the content check step.
    - **Accepted limitation, stated plainly:** Baton **cannot** block a public domain name that **resolves to** an internal address, because the runtime has no DNS resolution API and cannot pin the IP for the call. The direction "resolve over DNS-over-HTTPS and then check the IP" was **dropped**: it still cannot pin the IP (the gap between the check and the call remains in full) and it adds a network call to the 10-second limit of l.219.

56. **Four internal-only domain suffixes are blocked, matched by label (addition to section 7 line 207; settles #58).** "No internal IPs or localhost" of l.207 does **not** cover a syntactically valid domain name such as `metadata.google.internal` — something that resolves to exactly the metadata server l.207 exists to block. Four suffixes are now blocked in addition: **`.internal`, `.local`, `.home.arpa`, `.localhost`**.
    - Matched by **LABEL** (split on dots and compare the trailing labels), **not** by substring. With substring matching, `notinternal.com`, `myinternal.example.com`, `mail.notlocal` would be **wrongly blocked** — i.e. rejecting a real deploy URL of the owner because its name happens to contain those letters.
    - Applied **after** stripping the trailing dot, so `metadata.google.internal.` is blocked too.
    - **Accepted consequence:** a real service placed on an internal `.internal` domain **cannot send deploy evidence**. That is exactly the intent of l.207: for a URL only the internal network can open, Baton calling it proves nothing to the owner either.

57. **The "auto-generated" Needs Owner item of a no-code project is generated at GATE CHECK time (addition to section 7 line 217, 19.10 and section 8; settles #59).** l.217 says a no-code project needs "an **auto-generated** Needs Owner item of type Review" but does not say who generates it or when. Now settled:
    - Generated **when the gate is checked** and the gate lacks exactly the owner-confirmation part — that is the **only** place where this is known. Applies to **every** gate-check path, including the periodic auto-Done path (l.221), where nobody types any command.
    - **One** item per ticket, no duplicates generated.
    - An item that was **Skipped** (19.10) is rebuilt **only** when there is `file` or `note` evidence **newer than** the skip. That way "Skip" holds until there is really something new to look at, rather than losing its meaning at the next gate check.
    - **Addition (T-31 question 3.4 A; Owner decided T-38 = A, 19/10; settles #161):** this item applies to **every no-code ticket** — project flag **or** ticket flag (section 7). When the gate **is already satisfied by a valid `bao_cao`**, the "owner confirmation" part is no longer missing, so the confirmation item is **not** generated (and not rebuilt). A `bao_cao` is also **not** the "newer `file`/`note` evidence" of the bullet above.
    - **Addition (Owner decided T-38 = A, T-43 = A; settles #163):** a ticket moving to `done` by **any** path (satisfied by `bao_cao`, owner confirmation, owner forces Done, auto-Done, parent re-checking the gate by itself, …) ⇒ the auto-generated item **of that very ticket** (identified by the item's mark, **not** by "related tickets") that is still `Chờ` (Waiting) moves to `Đã xử lý` (Resolved), with the result "ticket đã Xong" (ticket is Done), with **no** Pass/Needs fixing verdict — so it does **not** count as owner confirmation. Written **in the same write** as the command moving the ticket to Done (succeed together, fail together). Manually created items, items of other tickets, items already Skipped/Resolved: untouched.

58. **"The ticket stays in or returns to Awaiting verification" only applies when the evidence CHANGES (interprets 19.3 line 494 against section 4 and 19.10; settles #66).** l.494 hangs that sentence on an **event** ("a new commit or deploy after the review"), not on a **state**. Now settled:
    - The **status-pulling** branch only runs in a write that **actually adds or changes evidence** (sending evidence, withdrawing evidence). Every other path — manual status change, the "I'll do it" button, opening an assignment, submit, acceptance, canceling an assignment, the 19.4 propagation, the parent ticket's gate re-check of 19.11, the periodic path — **only turns the flag on or off**.
    - Reason: read as "every write", the owner could **never** bring a flagged ticket back to In progress to go fix the code, and `baton status` would behave **opposite** to the "I'll do it" button (19.10) on **the same** transition — while the SPEC has no wording that distinguishes those two paths.
    - **Intentional consequence:** the flag is **still on** for a ticket the owner has just brought back to In progress — correctly so, because the work needed is not finished. The flag turns off when there is new valid evidence, or when the FAIL review is withdrawn.
    - **A coordination ticket keeps its status**; only the **flag** turns on/off. 19.4 l.502 says a coordination ticket's status "follows the project tickets automatically" and it "does not go through the evidence gate"; letting l.494 pull it into Awaiting verification would make those two sentences contradict each other. It **can send** evidence, so it **can carry the flag**.

59. **Sending and withdrawing evidence are GENERAL write commands, not subject to `SESSION_CLOSED` (interprets item 45 above against section 6 line 195 and section 7; settles #67).** Item 45 counts "the assignment's evidence" in the blocked group, but an evidence row is **not attached to any assignment** — it is attached only to the ticket plus the sender, and section 7 has no assignment field. Now settled: **no** blocking by session.
    - Two grounds: it **matches the data model** (rather than inventing an assignment↔evidence link the SPEC does not have), and it is the direction that **adds no new block** — tightening an agent's permissions on the basis of a guess is much harder to walk back than loosening later.
    - If a later spec session wants to block it, the work is **not** to change one condition but to **add an assignment field to section 7**.

60. **Every wall-clock time in the SPEC is computed in UTC+7 (addition to section 8 line 241, 19.8 line 533, and principle 8 of section 0; settles #68).** "18:00", "20:00", "08:00", "23:00–07:00" are wall-clock times, so they only have meaning in a time zone — and these computations run **on the server side**.
    - Take the **UTC+7** of principle 8 (Vietnam time) as the **business** time zone, not only the display time zone. Computed in UTC, a 🟡 item created at 22:00 Vietnam time would get the deadline "20:00 today" — a deadline that **passed 2 hours ago**.
    - Declared in **exactly one place**, and every rule using wall-clock time goes through it: the 🟡 default deadline (19.8), the approval session reminder schedule 08:00/20:00 (section 8), the evening handoff at 20:00 (section 11), quiet hours 23:00–07:00 (section 12). **The four rules must use the same time zone**, otherwise they drift apart.
    - Use a **fixed offset**, not a time zone database: Vietnam has no daylight saving time so that is the correct model, and it can be verified by arithmetic. If a later spec session wants the time zone to be a **workspace setting**, the work is to read the offset from the settings and pass it in — one place.

61. **Visibility of the "General" class branches by ROLE, not by project flag (addition to section 8 lines 229 and 233, the section 3 permission table, and item 4 above; settles #69).** Item 4 settles "General" as the project field left **empty**, so every read path has a class of rows for which **the project gate has nothing to check** (`project_id` empty). Now settled for **both** sections that have this class: section 8 (Needs Owner) and section 10 (Decision log — item 4 says a row auto-generated from a General item leaves the project field blank).
    - **CREATE path: open.** `coordinator`, `manager` and the **owner** can all create General items; the only rule is the "Create a Needs Owner item" cell of the section 3 permission table, so `worker` and `reviewer` are still rejected. The basis is the **wording of the SPEC**: l.229 says a Needs Owner item is created by a `coordinator` **or `manager`**, and item 4 says `baton ask` without a project → the item is General. Putting the two together, "a `manager` sends `baton ask` with no project" is a path the SPEC **explicitly allows**.
    - **READ path: branches by role.** The **owner** and agents with the **`coordinator`** role read **every** General item and row. An agent with the **`manager`** role reads only what **it created itself** — even a General row **written by the owner** is out of its view. Other roles (`worker`, `reviewer`) read none.
    - Out of view → **`NOT_FOUND`**, not 403, following the "do not reveal existence" convention of section 13.
    - Branching by **role** rather than by the "enters every project" flag is **intentional**: this class of rows belongs to no project, so a flag about projects says nothing about it. A `coordinator` **without** the flag still reads every General row; the flag only decides the class of rows that **have** a project.
    - This rule must live in **one single place**, and every query module **calls** it rather than building its own condition for this class.

62. **The "why" field of a Decision log row is REQUIRED, non-empty (addition to section 10 lines 306 and 308; settles #71).** l.306 sets the goal of the whole of section 10 as answering "who decided this, **why**, and when", and l.308 lists "why" as a field of the row, but no sentence says whether it may be left blank. Now settled in the **strict** direction:
    - **Every** Decision log row must have a **non-empty** "why" — both rows the owner writes personally and rows **auto-generated** from a Needs Owner item (item 64 below gives the default text for auto-generated rows).
    - This rule applies at **all three layers**: the CLI command (`--why` of l.377 is not in square brackets, i.e. required), the API, and a **DB constraint**.
    - Reason for choosing the strict direction rather than the open one: a Decision log row **cannot be edited** (l.309), so a row accidentally written without a "why" is permanent. **Loosening later is easier than tightening** — loosening is dropping a constraint; tightening cannot patch data already written.
    - **The import path of section 16:** when the "time · who · project · decision · why · reference" table has a **blank** "why" cell, that row is an **error** and goes into the "errors (with the reason for each row)" part of the import report — it is **not** imported with an empty "why", and a text is **not** filled in on the owner's behalf.

63. **A Skipped item must be REOPENED before being handled, and the reopen path accepts Skipped items too (addition to section 8 lines 244 and 246, 19.9 and 19.10; settles #73 part (a)).** l.244 only draws a `Chờ` (Waiting) item going out on **two** branches ("handle" or "skip"), and l.246 only speaks of reopening **from Resolved**, so both "handling an item that is Skipped" and "reopening an item that is Skipped" are places where the SPEC is **silent**. Now settled, and **the two halves go together**:
    - **Handling a `Bỏ qua` (Skipped) item directly → rejected** with `ALREADY_RESOLVED`, with a message stating exactly what to do: **reopen first**. This is the same wording pattern 19.10 already uses for resolved items.
    - **The reopen path accepts Skipped items TOO**, not only the Resolved items of l.246. Reopening brings the item back to **Waiting** and **is recorded in history**, exactly like the case of l.246.
    - **The second half is the condition for the first half to make sense:** if handling were forbidden without widening the reopen path, the very sentence "reopen first" **could not be carried out**, and an item skipped **by mistake** would be permanent — losing the only way to correct the error. So the first half must not be implemented without the second.
    - This decision says **nothing** about the **wording** of the comment on skip (19.9 l.541 says there is a comment but does not give its wording) — that part remains in `spec-questions.md` **#73(b)**, awaiting a spec session.

64. **An AUTO-GENERATED Decision log row takes its "why" as `"Trả lời mục T-x: <tiêu đề mục>"` (English: "Answer to item T-x: <item title>") (addition to section 8 line 279 and section 10; settles #74; goes with item 62).** l.279 lists exactly **four** parts of the auto-generated row when a Needs Owner item is resolved — the person is the **owner**, the same **project** as the item, the content is the **result**, the reference is the **`T-number`** — and there is **no** "why" part; but item 62 makes that part **required**, so the auto-generation path must fill in a text. Now settled:
    - The default is **`"Trả lời mục T-x: <tiêu đề mục>"`**, where `T-x` is the item's `T-number` and `<tiêu đề mục>` is its own title.
    - The item title **always exists** (a required field per l.233), so this default never falls to empty and never breaks item 62.
    - When the owner sends an **explicit** "why", **the owner's text is respected**, not overwritten by the default.
    - This formula follows exactly **the convention the SPEC already uses** for automatically generated strings at l.280 and 19.9 l.542: `<code> <action>: <content>`.

65. **The owner handling / skipping / reopening a Needs Owner item of an ARCHIVED project is ALLOWED (addition to item 25 above; settles #75).** Item 25 says **explicitly** that every **write** command on an `archived` project is rejected (`PROJECT_NOT_ACCEPTING`), **except** the very act of the owner changing `trang_thai`; but 19.6 l.516 and section 8 l.281 require that when an item is resolved (or skipped) the related session **must** leave `waiting_owner`, and that is the **only path** the SPEC gives for leaving it. Now settled as open, i.e. **a second exception is added** to item 25:
    - **The owner** can handle, skip and reopen a Needs Owner item of an `archived` project — including the accompanying actions that section 8 l.279–281 requires: the auto-generated **Decision log row**, the **comment** on related tickets, and **releasing the session** from `waiting_owner`.
    - **Agents remain blocked as before.** Item 25 applies in full to **every** agent write command on an `archived` project, including **creating** a new Needs Owner item. This exception is for the **owner** only, and only for items that **already exist**.
    - Reason: "answering a question **already asked**" is not "writing **new** work into the project" — it **closes** something left hanging, i.e. the same direction as the purpose of archiving. In the closed direction, an item created while the project was alive, with the project archived afterwards, **could be answered by no one**: it would sit forever in the Waiting block, **and** the related session would be stuck in `waiting_owner` permanently — exactly the "**never** counted as stalled" state of 19.6, i.e. an agent standing still with **no alert firing**.
    - The interface of section 14 **shows and enables** the buttons of an item belonging to an archived project; there is no button that always returns an error.

66. **No-code ticket at the TICKET level and the `bao_cao` (Report) evidence (addition to section 7, the 0.1 table, 19.10 and item 57; T-31 question 3.4 A; Owner decided T-38 = A, 19/10; settles #161 and #162).** A ticket without code inside a project that **has** code (e.g. a research ticket) previously could not be closed: the "no code" flag existed only in the project profile, and no evidence type said "the report has been checked by someone else". Now settled:
    - **The `ticket.khong_code` flag**: turned on/off by the **owner** only (agent ⇒ `FORBIDDEN`), recorded in History, **does not pull the status** (item 58). A ticket is "no-code" when the project flag **or** the ticket flag is on, read **at the time of the check** (19.10). The project flag keeps its meaning.
    - **The `bao_cao` evidence type** (label "Báo cáo", Report): path and/or content (at least one); the signer is the sender; **signing rights identical to `review`** (the `review` row of the "Evidence types" table in section 7 and the section 3 permission table: a `reviewer` other than the doer; a `manager` with the path to an independent reviewer's report; a `coordinator`; the owner); the signing source is shown on every read path; not verified; not edited, not deleted, withdrawn per section 7, bullet "Evidence is not edited, not deleted".
    - **The gate of a no-code ticket** is satisfied when **(1 `file`/`note` + owner confirmation)** OR **≥1 non-withdrawn `bao_cao` signed by someone other than the doer**. When satisfied by a report, no confirmation item is generated (item 57). A ticket **with code**: `bao_cao` opens nothing, the old rules exactly as before.
    - **Sending a `bao_cao` does not move the ticket to Done by itself** from Awaiting verification, like `file`/`note`/`review`. Someone **with the "Change ticket status" permission** in the section 3 permission table (a worker who is the doer, for tickets of its own assignment; the `manager` in the project; the `coordinator`; the owner) changes it to Done; the gate is checked at that change. The sender of a `bao_cao` is usually a `reviewer` agent, which has **no** permission to change status, so the change is someone else's job. Reason for keeping this: "Auto-Done" (section 7, bullet "Auto-Done") is tied only to the background **verification** step (commit pushed → merged); `bao_cao` has no background verification step.

67. **`L` (label) applied to several cards: add or remove (addition to section 14, bullet "Keyboard shortcuts"; Owner decided T-38 = A, 19/10; settles #156).** Type a label, then press the "Áp" (Apply) button next to the label box in the multi-select bar (`Enter` in the box does not apply — item 70): **every** selected card has that label ⇒ **remove** it from all; otherwise ⇒ **add** it to the cards that lack it, and cards that already have it **send no request**. A single card (panel) is unchanged: the "Thêm nhãn" (Add label) box adds, the × button removes.

68. **The selection after applying, filters, `Esc` and the target of keys when cards are selected (addition to section 14, bullet "Keyboard shortcuts" and bullet "Ticket list" (filters); Owner decided T-38 = A, 19/10; settles #157).**
    - After applying: deselect the cards that **succeeded**, **keep exactly the failed cards** selected to fix and retry; all succeeded ⇒ the selection is empty.
    - Selection is by id, tied to the filter at selection time (filter + quick tab + "Ẩn Xong cũ", Hide old Done): changing filter/tab/view ⇒ the selection is **emptied entirely** (returning to the old filter does not revive it); each apply only takes cards **currently shown**.
    - `Esc` when cards are selected ⇒ deselect all first; only a further `Esc` closes the panel.
    - Cards selected ⇒ `S`/`P`/`L`/`A` apply to the **selection**, not to the focused card.

69. **`A` for several cards (addition to section 14, bullet "Keyboard shortcuts", and section 5; Owner decided T-38 = A, 19/10; settles #158).** **One** "Giao N thẻ" (Assign N cards) dialog: choose the agent and brief **once**, send **card by card in sequence** (a separate assignment per card), with no optimistic display. Failed cards ⇒ **one** notification "k/N thẻ lỗi: MÃ — câu máy chủ" (English: "k/N cards failed: CODE — server message"); cards that succeeded are deselected; the dialog **stays open** with exactly the failed cards, keeping the agent/brief for resending. It goes through all cards and does not stop at the first failed card. Offline before the first send ⇒ closing the dialog cancels the whole run; offline midway ⇒ the remaining cards report a network error in that notification.

70. **The confirmation step when applying to several cards (addition to section 14, bullet "Keyboard shortcuts"; Owner decided T-38 = A, 19/10; settles #159).**
    - The status, priority and label boxes of the multi-select bar **only set a pending value**. Changing the value by mouse, arrow keys, Space, typing, or pressing `Enter` in the box all **send no request**. **Only the "Áp" (Apply) button** next to each box applies (the Apply button is locked while the box is empty; a label that is empty after trimming whitespace counts as empty). Reason: in many browsers `↑`/`↓` on a closed select box changes the value immediately, so "apply on change" turns a slip of a key into an action on N cards; and the `Enter` used to **close an opened list** on Chromium also reaches the box, so "apply on `Enter`" wrongly applied "Đang làm" (In progress) to 2 cards in production on 19/10 (CoS/Owner decided 20/10, BAT-39, #164). Applies to both N < 10 and N ≥ 10.
    - **N ≥ 10** (N = the number of selected cards **currently shown**, i.e. exactly the number of cards the apply run will consider) ⇒ before sending, a dialog **"Áp cho N thẻ?"** (Apply to N cards?) appears with a confirm button and a Cancel button. The dialog states what this run does; for labels it says clearly whether it **adds** or **removes** under the rule of item 67 (e.g. `Bỏ nhãn "x" khỏi 10 thẻ` (Remove label "x" from 10 cards), `Gắn nhãn "x" cho 7 thẻ (3 thẻ đã có, không đổi)` (Add label "x" to 7 cards (3 cards already have it, unchanged))). Cancel (button, `Esc`, clicking the backdrop) ⇒ **no request is sent**, the selection and the pending value are kept. **N < 10** ⇒ applies straight away.
    - `A` adds **no** confirmation question: the "Assign N cards" dialog is already the confirmation step (choose the agent, then press an explicit send), and asking again is asking twice for the same thing.
    - The single-card panel keeps its apply-on-change behaviour.

71. **Clicking a card's tick box (addition to section 14, bullet "Keyboard shortcuts" (`J`/`K`, `X`); Owner decided T-38 = A, 19/10; settles #160).** On the list page, "the focused card" and "the open panel" are **one** state (`?the=<code>`). Now settled to keep it so:
    - **Wide screen:** clicking the tick box ⇒ besides toggling selection, that card becomes the focused card, i.e. **the card's panel opens** — like `J`/`K`; the next `X` acts on exactly the card just clicked. Each tick adds a browser history entry, like `J`/`K`/the "Mở" (Open) button.
    - **Narrow layout:** clicking the tick box does **not** set focus and does **not** open the panel — there the panel is a full-cover overlay, and opening it would make it impossible to tick a second card.

## 20. Project map on the Overview
**What the user gets:** on opening the Overview, seeing at once which projects they are carrying, which project is being pushed, which is waiting on them, and that they are not carrying more than 3 things at once. (Owner decided 04/11/2026, T-127 = A.)

### 20.1 New fields
| Field | Where | Value | Default | Who edits |
|---|---|---|---|---|
| `uu_tien` | project | integer 1–5 (5 = most important) | 3 | owner, `coordinator` |
| `dang_day` | project | yes/no: the project is "being pushed hard" | no | owner, `coordinator`, the project's `manager` (20.8) |
| `duy_tri` | project | yes/no: long-term maintenance work with no end goal (PARA "Area") | no | owner, `coordinator`, the project's `manager` (20.8) |
| `ten_ngan` | project | string of 0–24 characters | empty ⇒ use the full name | owner, `coordinator` |
| `khoi_lon` | ticket | block sequence number 1–99, or empty | empty | owner, `coordinator`, the project's `manager` |
| `doi` | ticket with `khoi_lon` | integer 0–100 (position on the hill) | empty | owner, `coordinator`, the project's `manager` |
| WIP limit | Workspace settings | integer 1–10 | 3 | owner |

- A "domain" on the map is simply a **project group** (section 2). A project with no group sits in the domain "Khác" (Other).
- A large work block is a ticket with `khoi_lon`; its child tickets (section 4) are the small work. A project's block progress = number of Done blocks / total blocks that are not Canceled and not Duplicate.
- Setting `doi` on a ticket without `khoi_lon`: `INVALID_INPUT`. A value out of range: `INVALID_INPUT` with the correct range.
- Turning on `dang_day` when the WIP limit is already reached: **still allowed**, not blocked; the WIP gauge turns red.
- Turning on `duy_tri` turns off `dang_day` automatically (a maintenance project is not "pushed").
- Every change to the fields above is recorded in History like other fields (section 4).
- CLI: `baton project set <CODE> [--nhom] [--uu-tien 1-5] [--dang-day on|off] [--duy-tri on|off] [--ten-ngan "…"]`; `baton ticket set <CODE> [--khoi-lon <seq>|off] [--doi 0-100]`. The API and MCP have corresponding operations.
- Old data: every project receives the default values; no project becomes "pushing" or "maintenance" by itself. Old behaviour does not change.

### 20.2 Overview layout
The **"1. Projects"** block of section 11 is replaced by the map, from top to bottom:
1. **Top bar:** the WIP gauge "Đang đẩy n/<giới hạn>" (Pushing n/<limit>; red when n > limit) and the compact Needs Owner box (section 11).
2. **Map (left) + project cards (right)**. Below 768px the map is on top and the cards are stacked below.
3. **The strip "Khu vực duy trì · n"** (Maintenance area · n) at the end of the block: each `duy_tri` project is a chip (short name + dot: green normally, yellow when it has a Waiting Needs Owner item). Clicking a chip opens the project page.

Blocks 2–5 of section 11 (Work in progress, Agents, Just done, Needs attention) are unchanged and sit below.

### 20.3 Radial tree
- The centre is the owner's name → ring 1 is the domains → ring 2 is the projects. Only projects that are **not** archived and **not** maintenance go on the tree.
- **Bubble size** follows `uu_tien`. **Bubble colour:** yellow = has a Waiting Needs Owner item; grey = Paused project; otherwise green. The domain colour is taken from a fixed palette by group name (no added field), used for the domain's branch and label.
- A `dang_day` project: bold border. A project that is not `dang_day`: dimmed (queue).
- A project with large blocks: a **progress ring** around the bubble + the text "Done/Total" blocks.
- **Collapse/expand a domain:** click a domain to fold/unfold it. A folded domain becomes one bubble sized by the sum of its child projects' priorities, labelled "+n". Three quick buttons: "Chỉ giữ dự án đang đẩy" (Keep only projects being pushed), "Mở hết" (Expand all), "Thu gọn hết" (Collapse all). **Default when the page opens:** a domain with no project being pushed is folded.
- **Zoom into a project:** click a project bubble → the project moves to the centre, and its large blocks become the outer ring numbered 01, 02… by `khoi_lon` (Done = green; In progress/Awaiting verification = yellow with a bold border; the rest = grey dashed). Click the centre to go back. Three levels are never drawn at once.
- Clicking a domain also filters the project cards on the right by that domain; click again to clear the filter.
- Hovering/long-pressing a bubble: shows the full name, status, "Đang làm" (In progress).

### 20.4 Project cards
- Three lanes: **Đang đẩy** (Pushing; `dang_day` projects) · **Hàng chờ** (Queue; the rest, running) · **Tạm dừng** (Paused; Paused projects).
- Each card: name, health dot (section 2), priority, holder (the managing agent, or the owner's name if none), **Đang làm** (In progress) = the most prominent piece of work (section 11), **Chờ Chủ** (Waiting for Owner) = the title of the project's newest Waiting Needs Owner item (click to open the item), **Mốc tới** (Next milestone) = the lowest-numbered large block not yet Done.
- **Hill Chart** in the card: one hill line, each large block that is In progress/Awaiting verification is a dot at `doi`. Below 50 it reads "chưa rõ cách làm" (approach not yet clear), from 50 up it reads "đã rõ cách, đang làm" (approach clear, in progress). A block with no `doi` gets no dot.
- Clicking a card goes to the project's work board.

### 20.5 Needs Owner box on the Overview
Keeps the compact box of section 11; the expanded list puts **items of projects being pushed at the top**, labelled "· đang đẩy" (· pushing). The Needs Owner sidebar entry does not change.

### 20.6 Performance and phone
- 200 projects still open in under 1 second after the first load (section 17.10). The tree only draws non-maintenance projects; domains are folded by default per 20.3.
- 375px: the Overview is usable — the map shrinks to fit the width, tap replaces hover, cards are stacked below.

### 20.7 NOT done
The 4 secondary view styles of the mockup (squares, layered bars, mind map, circles); drag and drop to change priority; computing the hill position automatically; renaming old projects automatically; a separate "milestone/epic" level; hard blocking when WIP is exceeded.

### 20.8 Project toolbar (Owner decided 04/11/2026, T-131)
**What the user gets:** changing a project's priority and status right in the interface, without editing a file or typing a command.

- **Map status** — one select box with 4 values, written to existing fields:

| Choice | `trang_thai` | `dang_day` | `duy_tri` |
|---|---|---|---|
| Đang đẩy (Pushing) | `active` | yes | no |
| Hàng chờ (Queue) | `active` | no | no |
| Tạm dừng (Paused) | `paused` | no | no |
| Duy trì (Maintenance) | `active` | no | yes |

  Archiving (`archived`) is not in this box; it is still done by the owner only, in the old place (section 2).
- **Where shown:** the project card on the Overview map (20.4) and the top of the project page. A **Priority** box 1–5, a **Status** box; the owner also sees a **Group** box.
- **Who can change:**

| Who | Priority | Map status | Group |
|---|---|---|---|
| Owner | yes | yes | yes |
| `coordinator` | yes | yes | no |
| `manager` **of that project** | no | yes | no |
| `manager` of another project, `worker`, `reviewer` | no | no | no |

- **The owner is the highest level:** the owner can change at any time, including overriding a value an agent has just set. An agent can change a value the owner set, but every change is recorded in the project History (who, when, old → new) and the card shows the line "Đặt bởi <tên> · <thời gian>" (Set by <name> · <time>) of the last change, so the owner sees it and can change it back.
- Choosing "Pushing" when the WIP limit is already reached: still allowed, the gauge turns red (20.1).
- The change shows on screen immediately; if the server rejects it, it is rolled back and the reason is reported (section 14).
- CLI: `baton project set <CODE> --trang-thai dang-day|hang-cho|tam-dung|duy-tri`.
- **NOT done:** a lock of "once the owner has set it, agents cannot change it"; changing the project code.
