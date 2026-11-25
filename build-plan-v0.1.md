# Baton: work list v0.1

Only read `SPEC.md` in this directory (and `sample-data/` when working on part 8). Build in order; each finished part must have automated tests for the rules in the SPEC before moving to the next part.

1. **Part 1 · Data core + API:**
   - Workspace, projects, agents (hashed token, role, the permission table in section 3), tickets.
   - The 7 statuses and their transition rules (section 4), history, comments, error codes and HTTP (section 13).
   - Tests: each status transition rule, each cell in the permission table.
2. **Part 2 · Assignment rounds + sessions + heartbeat** (sections 5, 6):
   - Accept, submit report, acceptance, stop, stalled threshold, long wait.
   - Coordination tickets linked to project tickets.
3. **Part 3 · Evidence + the Done gate** (section 7):
   - Verify commit merged/pushed through GitHub, verify deploy, review.
   - Retry, automatic move to Done, non-code projects.
4. **Part 4 · Needs Owner + Decision log** (sections 8, 10):
   - All 4 item types.
   - Handling an item automatically writes to the Decision log, automatically comments, and returns the result to the agent.
5. **Part 5 · `baton` CLI + MCP server** (section 13):
   - All the commands, `--json`, exit codes 0/1/2/3/4.
6. **Part 6 · Web UI** (sections 11, 14):
   - Login (password + TOTP), sidebar, Overview, Needs Owner (option buttons + Send, the agent receives the result in ≤ 3 seconds, approval session, bulk reply box).
   - List, board, ticket detail with the chain of assignment rounds, agent page, Map and project profile, Decision log.
   - Optimistic updates, keyboard shortcuts, mobile version.
7. **Part 7 · Telegram notifications + morning/evening report** (sections 11, 12), quiet hours.
8. **Part 8 · Data import** (section 16), backup and export (section 15).
9. **Part 9 · Acceptance:** run all 11 steps of the "Definition of done" (section 17). Record the result of each step.

**Technical choices** (language, DB, where it runs) are proposed by the build session, which then asks the owner. Do not ask again about behaviour; if behaviour is missing, write it into `spec-questions.md` to take back to the spec session.
