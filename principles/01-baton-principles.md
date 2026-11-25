# 1. Baton principles

Baton is where **one owner and a team of AI agents** run their work, across many projects. The name comes from the relay baton: work is passed from hand to hand over many legs, but at every moment you know whose hand the baton is in.

This document explains *why* Baton is designed the way it is. The *detailed behaviour* is in [`SPEC.md`](../SPEC.md); when the two disagree, the SPEC is right.

## The problem

One person working with many agents on many projects runs into four things, in exactly this order:

1. **You don't know whose hands the work is in.** An agent reports "done" in a chat window, the window closes, nobody remembers.
2. **"Done" is not really done.** The code sits on a machine, not committed, not merged, not running for real.
3. **The owner becomes the bottleneck.** Each agent asks one question in one window, the owner is interrupted all day and still misses questions.
4. **Holding too many things.** Ten projects all "in progress" means no project is really moving.

The eight principles below answer those four things.

## Eight principles

| # | Principle | What it means in practice |
|---|---|---|
| 1 | **No limit** on the number of projects, tickets, agents | The tool must not be the reason you merge or drop projects. Performance target of the original: 200 projects, 200,000 tickets, 100 agents |
| 2 | **No "Đang làm" (In progress) ticket = the project is stalled** | The status on Baton must match the real work. A project with no work running shows exactly the words "Dự án không chạy" (Project not running), no dressing up |
| 3 | **Done requires evidence** | "Done" = merged or running for real, with a commit or URL the system can check by itself. A spoken report does not open the Done gate |
| 4 | **The owner is not asked piecemeal** | Everything that needs the owner lives in **one single place** (the "Cần Chủ" (Needs Owner) section), each item has enough context to decide in one read, approved in morning and evening sessions |
| 5 | **Agents are first-class citizens** | Each agent has its own identity, role, permissions, history and heartbeat. Agents talk to Baton through the CLI, MCP or the API |
| 6 | **A human is ultimately responsible** | Agents do and propose; the owner decides the things on the must-ask list. No agent decides a Needs Owner item by itself |
| 7 | **Fast** | Every action shows its result immediately; frequent actions have keyboard shortcuts. Approving an item is one key |
| 8 | **Append only, no silent edits** | The decision log and evidence only get new lines. To change something, write a new line pointing back to the old one |

## Seven concepts to know

| Concept | One sentence |
|---|---|
| **Owner** | The single real person of the workspace. The display name is self-chosen; the "Cần Chủ" (Needs Owner) section changes with that name |
| **Agent** | A machine identity with exactly one role: `coordinator` (coordinates), `manager` (manages one project), `worker` (does the work), `reviewer` (checks) |
| **Ticket** | One piece of work, belonging to exactly one project, with a short code of the form `CODE-number` so people and agents call it by the same name |
| **Assignment round** | One pass of the baton: who assigned, to whom, with which brief, with what result. A ticket can go through many rounds |
| **Session and heartbeat** | The span of time an agent is really working on a round. When the heartbeat is missing past the threshold, the session is "stalled" and the owner is told, instead of waiting until they notice by themselves |
| **Evidence and the Done gate** | A merged commit or a URL that is running for real, plus a passing review by someone **other** than the one who did the work |
| **Needs Owner (T items)** | Work only the owner can decide or do: a decision, running a command, a review, or just for information |

## Life cycle of a piece of work

```
Owner states a goal
   └─ CoS creates a ticket, writes the brief ──assigns──▶ Project Manager
                                             └─ splits the work ──assigns──▶ Worker works on its own branch
                                                                      └─ submits report + commit
                                             ◀── Independent Reviewer checks (PASS / NEEDS FIXES)
        CoS re-checks by itself (reads diff, runs tests) ◀── Manager does acceptance, reports
        CoS merges ──▶ Baton verifies the commit is merged by itself ──▶ ticket moves to Done
   ◀── anything that needs a human decision becomes a Needs Owner item, waiting for the approval session
```

Three points that are easy to miss in this cycle:

- **Passing acceptance is not yet Done.** A ticket only moves to Done when it passes the evidence gate.
- **The one who does the work does not grade themselves.** The review must be signed by a different agent.
- **The checker does not trust the report.** The Reviewer and the CoS re-run the verification commands themselves.

## Things Baton deliberately does NOT do

Knowing this boundary keeps you from expecting the wrong thing:

- Baton **does not run agents**, does not call models, does not hold model API keys. Agents run elsewhere and report back.
- Baton **does not start** an agent by itself when there is an assignment round; the agent must ask for work itself.
- Baton **does not read** the agent's screen or logs, does not scan repos by itself, does not deploy by itself, does not run tests.
- Baton **does not hard-block** when you exceed the limit of 3 projects being pushed; it only colours it red so you see it.
- A workspace has only **one owner**: no teams, no per-person permissions.

## Read next

- [2. Agent organization](02-agent-organization.md): four tiers, the 8-part identity, the forbidden list, how to assign work.
- [3. Project organization](03-project-organization.md): project map, the limit of 3 projects being pushed, maintenance areas, radial tree, Hill Chart.
- [4. Operating lessons](04-operating-lessons.md): the mistakes that were paid for to derive the rules.
