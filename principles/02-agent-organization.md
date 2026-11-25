# 2. Agent organization

A four-tier model: **Owner (CEO) → CoS (Chief of Staff) → Manager of each project → Worker**. Each tier does exactly one kind of work; work goes down as a brief, results come up as a report with evidence.

You do not need all four tiers from the start. One project, one person: you play the CoS, open one Manager session, and let it call Workers. Add the CoS tier when you have two or more projects and start forgetting where the other project stands.

## Four tiers

| Tier | Role on Baton | Does | Does NOT do |
|---|---|---|---|
| **Owner** | workspace owner | States goals, approves, decides Needs Owner items, runs the commands only a human may run | Is not asked piecemeal during the day |
| **CoS** | `coordinator` | Turns directions into tickets and briefs, assigns to Managers, tracks, **re-checks results by itself**, merges, gathers everything that needs the Owner into one place | Does not code, does not edit files in project repos, does not assign directly to Workers |
| **Manager** | `manager` | Takes the tickets of **one** project, splits the work, writes briefs for Workers, does acceptance, records reports and decisions | Does not edit code itself, does not push, merge, deploy |
| **Worker builder** | `worker` | Does exactly one piece of work per the brief on its own branch, writes tests, commits | Does not work outside the brief's scope, does not create child agents, does not merge |
| **Worker reviewer** | `reviewer` | Checks independently: reads the diff, checks against each rule in the SPEC, re-runs the tests itself | Does not edit anything, does not commit |

Why it is split this way:

- **The planner does not code**, so it keeps the overall picture and is not pulled into details.
- **The one who does the work does not grade themselves**, so mistakes are caught before they reach the owner.
- **One Manager per project**, so the context of one project does not leak into another.

## The 8-part identity

Every agent, including the CoS, is described by exactly eight lines. Whichever line is missing, the agent will guess it, and usually guess wrong.

| # | Component | The question it answers |
|---|---|---|
| 1 | **Role** | What do I do, and more importantly what do I not do? |
| 2 | **Model** | Which model do I run on? |
| 3 | **Harness** | Which tool do I run in, opened in which directory? |
| 4 | **Context** | At the start of a session, which files do I read, in what order? |
| 5 | **Effort** | At what level do I think for which kind of work? |
| 6 | **Permission** | What may I read, write, which commands may I run; what is forbidden? |
| 7 | **Brief & Memory** | Where do I record decisions and reports so the next session can read them back? |
| 8 | **Project** | Where are my directory and the place my tickets are tracked? |

Where it lives: the CoS and the Manager write it in the `CLAUDE.md` of their own directory; Workers write it in `.claude/agents/<name>.md`. Ready-to-use templates: [`templates/cos-CLAUDE.md`](../templates/cos-CLAUDE.md), [`templates/manager-CLAUDE.md`](../templates/manager-CLAUDE.md), and the two Workers right in this repo at [`.claude/agents/`](../.claude/agents/).

## The FORBIDDEN list

Six kinds of work **no agent does by itself**, at any tier:

1. **Money and payments**: buying services, paid plans, transfers.
2. **Changing source data**: migrations on the real database, editing real tables or records.
3. **Sending outside**: messages, emails, posts to real people.
4. **Deleting**: including indirect deletion such as overwriting, `git reset --hard`, changing a field's type.
5. **Secrets**: printing a key or token to the screen, committing `.env`, copying secret values into chat.
6. **Deploying to production.**

When work falls on this list, the agent stops that part and creates a Needs Owner item, with the command already prepared so the owner only has to run it. A kind of work only moves to "agent does it by itself" when the owner **writes it explicitly in the decision log**. Loosen gradually based on evidence, not on feeling: the original only let the CoS finalize UI wording by itself after 12 consecutive approval sessions in which the owner chose exactly what the CoS proposed.

## How to assign work

1. **The Owner gives direction** → the CoS creates a ticket with a brief. The brief states three things: **Rigor level**, **Definition of done**, **Not doing**.
2. **The CoS creates the branch** `worker/<name>` and only then assigns. The Manager does not create or switch branches.
3. **The Manager runs** in the project repo, splits the work for the Worker builder, then calls the Worker reviewer to check independently. The last round must be a reviewer PASS; anything fixed after that means calling the reviewer again.
4. **The CoS checks by itself**: reads the diff, runs lint, typecheck, test, build, secret scan. It does not trust a bare report and does not trust the process exit code.
5. **The CoS merges** (fast-forward only), submits the evidence to Baton. The ticket moves to Done when Baton verifies by itself that the commit is merged.

**The brief** is what decides quality. The recipient starts from zero, so the brief must be enough to do the work without asking back: goal, context, scope of what to do and not do, related files, prohibitions, "what done means", how to verify. Template: [`templates/brief.md`](../templates/brief.md).

**The rigor level** keeps you from doing too much and from doing sloppy work:

| Level | Used for | How to work |
|---|---|---|
| **LIGHT** | UI, small bug fixes, internal tools | One review pass, send back only when a defect breaks functionality or data; minor comments are recorded as "debt". Tests for the main behaviour |
| **THOROUGH** | Data, migrations, permissions, security, money, sending outside | Review until PASS, tests cover the edge cases |

## Clean room

For a project built from a spec, the build session **only reads files in the project directory**: `SPEC.md` is the single source of truth about behaviour. The assignment prompt contains no information other than the project's sources and the owner's decisions.

- Behaviour missing from the SPEC → the agent writes it into `spec-questions.md` with a provisional proposal, **does not guess**, then works on another part.
- The SPEC may only be edited in a "spec session" (you and a different agent), not in a build session.
- The Manager writes reports to `reports/<date>.md` and technical decisions to `decisions.md` **in the repo**; the CoS reads those two files.

The benefit: every decision about behaviour has a source, and you can swap the agent or model midway without losing anything.

## Needs Owner and approval sessions

- **The owner only acts when there is a Needs Owner item.** Work that needs the owner but was only said in chat counts as not said.
- **What an agent can do, the agent does.** Only raise to the owner the work that strictly needs a human: card, password, authenticator code, account permissions, or work on the FORBIDDEN list.
- **Two approval sessions a day**, morning and evening. Between the two sessions, Managers only do work that does not need the owner; work that must wait for a decision is queued behind.
- **Each item has two clearly separated parts**: *Context* (read to understand, with the CoS's proposal and the consequence of delay) and *What you do* (numbered steps, one action per step, the last step is a sample answer).
- **Split commands and questions into two items.** If they are combined, the owner runs the command and presses "đã chạy" (ran it), the item closes, and the questions disappear with it.
- **"Chỉ để biết" (FYI only) is only for news to be aware of.** If work that must be done is tagged with this type, the owner presses "đã đọc" (read) and the item closes while the work is still untouched.

## Environment rules for agents running unattended

These rules sound petty, but they decide whether the system can run through the night:

- **Each shell command is a single command, with absolute paths.** No `cd … &&`, no pipes, no variables, no loops. A compound command cannot be parsed by the permission system, which then asks the owner. The original counted 186 approval clicks in 17 hours, 92% because of compound commands.
- **Repeated work goes through fixed scripts** that are already permitted (assign work, wait for done, merge), not a new command each time.
- **A blocked command is not worked around.** Do not route it through another script or another tool with the same purpose. Write it in the report.
- **Run nothing in the background, at any level.** A Worker reporting "waiting" means not done; the Manager may not end the round with "waiting".
- **If there is a question, pick the safer option, record the reason, continue.** Stopping to ask loses the whole round.
- **Leave no temporary files in the repo.**
- **Run the test suite sequentially**, do not let several Workers run it at the same time.

Sample scripts for assigning to a Manager: [`templates/bin/`](../templates/bin/).

## Scoring agents

One line is written for each Manager round. Five metrics are enough to know whether the system is getting better or worse:

| Metric | Target |
|---|---|
| The CoS's first check passes, nothing sent back | Every round |
| Number of reviewer passes before PASS | 1 to 2 |
| Number of questions that had to be pushed up to the owner after that round | 0 to 1 |
| Number of times the owner chose differently from the CoS's proposal | 0 |
| Run time | Recorded for comparison, no target set yet |

Template: [`templates/cos-ledgers.md`](../templates/cos-ledgers.md).

## Do not automate too early

Approve by hand for a few weeks before letting night shifts run. The purpose of the hand-approval period is to **derive rules**: each time the system goes wrong, write one line in the pitfalls ledger (what happened → consequence → rule from now on) and fix the prompt or the script. That ledger from the original, with proper names removed, is in [4. Operating lessons](04-operating-lessons.md).
