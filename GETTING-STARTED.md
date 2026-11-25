# Getting started

Pick one of three paths. Every path starts by downloading this repo and opening an agent session (Claude Code or an equivalent tool) **inside the repo folder**.

The prompts below are meant to be pasted to your agent. Edit the parts in `<...>` before pasting.

---

## Path 1 · Take only the method

A fit when you want to organize your agent team today and do not need software yet. The whole system can run on markdown files.

**You do:**

1. Read [`principles/01`](principles/01-baton-principles.md), [`02`](principles/02-agent-organization.md), [`03`](principles/03-project-organization.md). About 20 minutes.
2. Write down your list of projects. Pick **at most 3** projects to push; mark which ones are maintenance.

**Paste to your agent:**

```
Read principles/ and templates/ in this folder.
I have these projects: <name — folder — one-sentence description, one project per line>.
The 3 projects I am pushing: <A, B, C>. Maintenance: <…>.

Set up a CoS → Manager → Worker system for me using markdown files:
1. Create the folder <path to the CoS folder> with a CLAUDE.md based on templates/cos-CLAUDE.md and the five ledgers
   from templates/cos-ledgers.md, and fill in the project map from the list above.
2. For each project being pushed: draft the Manager section based on templates/manager-CLAUDE.md and two Workers
   based on .claude/agents/, for me to approve before anything is written into the project repo.
3. Copy templates/bin/ into the CoS folder and edit the allowed and forbidden command lists to match each project's stack.

Do not change anything in a project repo before I approve. Where information is missing, ask me once, in one batch.
```

Run like this for a few weeks. Every time the system gets something wrong, add one line to `known-pitfalls.md`. When the number of projects and of decisions waiting for you starts to overflow the markdown files, move to path 2 or 3.

---

## Path 2 · Deploy the existing build

A fit when you want to use Baton as it is.

**Paste to your agent:**

```
Read README.md, SPEC.md sections 0–1 and DEPLOYMENT.md.
1. Run in order: npm ci, npm run build, npm run typecheck, npm run lint, npm test. Report the real result of each command.
2. Read DEPLOYMENT.md and check every wrangler command against the current Cloudflare documentation.
   List which commands need changing, why, with sources.
3. Give me the list of things ONLY I can do (log in to Cloudflare, create the database, set secrets,
   initialize, deploy), in the right order, one command per step.

You do NOT run wrangler, do NOT deploy, do NOT touch secrets. I run those myself.
```

**You do:** follow [`DEPLOYMENT.md`](DEPLOYMENT.md) from section a to section f. Three places where people trip:

- Put the real `database_id` into `packages/api/wrangler.toml` after you create the database.
- Create the R2 bucket `baton-sao-luu` **before** the first deploy, otherwise the deploy fails.
- Keep `TOKEN_CHU` somewhere safe. Every recovery route (lost authenticator, locked out) goes through it.

Once it runs: read [`AGENT-GUIDE.md`](AGENT-GUIDE.md) to connect your agents through the CLI.

---

## Path 3 · Rebuild it your way

A fit when you want a different Baton: another stack, another language, fewer or more features. This is how the original was made: a **clean room**, where the agent reads only the spec.

**You do first:**

1. Open a **spec session** (you and one agent, separate from the build session). Edit `SPEC.md` to match what you want: change the owner's name, the time zone, the UI language, and drop the sections you do not need yet. `build-plan-v0.1.md` splits the work into 9 parts, in order.
2. Decide whether the build session may read `packages/`. If you want a free choice of technology, move `packages/` out of the folder; if you want to port it part by part to another stack, keep it as a reference.

**Paste to your agent (build session, freshly opened):**

```
Read only SPEC.md and build-plan-v0.1.md in this folder. Do not read anything outside it.
Do not ask me about behaviour, only about technical choices.
If SPEC is missing a behaviour, write it into spec-questions.md with a provisional proposal, do not guess,
then work on another part.
Propose the technical choices (language, database, where it runs) for me to settle, then build part 1.
Every SPEC rule that the work touches must have an automated test.
```

The rules for the build session are already in [`CLAUDE.md`](CLAUDE.md) and [`.claude/agents/`](.claude/agents/): the Manager splits the work, `worker-builder` does it, `worker-reviewer` checks it independently, and nobody deploys on their own.

**The loop from there:** the agent builds one part → you (or your CoS) rerun the tests yourself and read the diff → merge → answer the questions in `spec-questions.md` in the spec session → next part. Part 9 of `build-plan-v0.1.md` is the 11-step acceptance check from `SPEC.md` section 17.

---

## Whichever path you take

- **Do not automate too early.** Approve by hand for a few weeks so you can work out your own rules before letting agents run overnight.
- **The FORBIDDEN list is yours.** The six items in [`principles/02`](principles/02-agent-organization.md) are a starting point; loosen an item once you have evidence, and write down when you loosened it.
- **Do not put real data in the repo.** `sample-data/` holds only fake data; secrets live only in a password manager and travel through environment variables.
