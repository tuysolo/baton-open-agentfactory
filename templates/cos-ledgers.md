# CoS ledger templates

Five files the CoS keeps in its own directory. Before Baton is running, this is your whole "operating system"; once Baton is running, `needs-owner.md` and `decision-log.md` move gradually into Baton (the Needs Owner section and the Decision log), and the other three files stay in use.

Split each block below into its own file.

## `needs-owner.md` — work only the owner can decide or do

```
# Needs Owner

This file keeps only OPEN items. Each item has an item with the same number on Baton.

## Open

### T-<number> (<date>) · <project> — <work> (<🔴 urgent | 🟡 today | ⚪ not urgent>)

**Context**
- <what is being done, how far the result has got: commit, ticket, test>
- <why the owner is needed; the options; the consequence of delay>
- **CoS proposal: <A>.**

**What the owner does**
1. <one concrete action: which command to run where, which page to open, what to click>
2. <…>
3. Reply "T-<number>: done" or "T-<number>: A".

## Finalized by the CoS (CoS reports afterwards, the owner can reverse it)

| Date | Project | Finalized | Source |
|---|---|---|---|
```

## `decision-log.md` — decision log

```
# Decision log

Add new lines only. When a decision changes, write a new line pointing back to the old one.

| When | Who | Project | Decision | Why | Basis |
|---|---|---|---|---|---|
| <date and time> | <Owner / CoS / M-Name> | <CODE> | <…> | <…> | <T-number, ticket code, commit, old line> |
```

## `project-map.md` — project map

```
# Project map

Updated: <date> · 3 projects being pushed: <A>, <B>, <C>

| Project | Code | Domain | Status | Priority 1–5 | Manager | Directory | Large block in progress (position on the hill) |
|---|---|---|---|---|---|---|---|
| <name> | <CODE> | <domain> | Pushing / Queue / Paused / Maintenance | <n> | M-<Name> | <path> | <03 Cart (38)> |

## <Project name>
- **What it is:** <1–2 sentences>
- **Stack:** <…>
- **Read first:** <SPEC, README, the repo's CLAUDE.md>
- **Deploy:** <who runs it, with which command>
- **Project-specific prohibitions:** <…>
- **Order of the large blocks:** 01 <…> → 02 <…> → …
```

## `known-pitfalls.md` — pitfalls ledger

```
# Known pitfalls — do not repeat

Append only, no deletions. The CoS reads this file at the start of every session.

| # | Date | Mistake | Consequence | Rule from now on |
|---|---|---|---|---|
```

## `agent-scores.md` — scoring agents

```
# Agent scores

One line per Manager round, written right after merging or sending back.

| Date | Project | Round (ticket) | Work | Model | Rigor level | Reviewer passes | CoS first check | Questions pushed to the owner | Owner changed the proposal | Time | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|

## Feedback ledger

| Date | What happened | What was fixed (prompt, script, rule) |
|---|---|---|
```
