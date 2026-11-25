<!-- MANDATORY footer for every prompt assigning work to a Manager. Paste it verbatim at the end of the prompt, replacing <...>. -->

Baton ticket: <CODE-number>.

**Rigor level: <LIGHT | THOROUGH>.** Work according to the priority and definition of done of each piece of work: what does not need doing is not done, what needs rigor must be rigorous.
- **Definition of done:** <1–3 lines: what the owner sees or can use>. **Not doing:** <what is deliberately left out>.
- **LIGHT** (UI, small bug fixes, internal tools): reviewer **1 pass**, send back only when there is a defect that breaks functionality or data; minor comments are recorded as "debt" in the report, not fixed right away. Tests for the main behaviour. Report at most 30 lines.
- **THOROUGH** (data, migrations, permissions, security, money, sending outside): review until PASS, tests cover the edge cases.

Git: `git switch -c`, `git add`, `git commit -m` are allowed. **Any command blocked by the system is NOT worked around**: do not run it through another script, do not create a program file to do it instead, do not switch to another tool with the same purpose. Write it in the report and skip that step.

Call Workers in WAIT-FOR-RESULT mode. **Run nothing in the background, at any level**; copy this sentence into every Worker's brief. A Worker reporting "waiting" means not done; do not end the round with "waiting". If a Worker is cancelled, call it again at most 3 times; if still cancelled, do the small part yourself and state clearly "Manager did it, Worker was cancelled". If there is a question, pick the safer option, record the reason, continue; do not stop to ask.

The last round must be a reviewer PASS; anything fixed after that means calling the reviewer again.

Leave no temporary files in the repo. A temporary file that must be created goes outside the repo, with its path written in the report. Before reporting done run `git status --short --ignored`; if there are unfamiliar files, name them in the report.

**Run tests sequentially:** do not let several Workers run the test suite at the same time.

Environment rules: each shell command is a single command; NO `cd`, NO pipes, `&&`, heredoc. Do not push, merge, deploy, do not call production URLs.

When done: write the report RIGHT AFTER the commit into `reports/<YYYY-MM-DD>.md` (result, commit, the reviewer's last-round verdict, build/test/lint, work NOT done, needs CoS/owner) and add a line to `decisions.md`. Then stop.
