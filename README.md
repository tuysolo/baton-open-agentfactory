# Baton Open

**Baton** is the place where **one owner and a team of AI agents** run their work across many projects. The owner decides and approves. Agents pick up work, do it, hand it off to each other and submit evidence. Everything that needs the owner lives in exactly one place.

This repo is the open edition of Baton: **principles, spec, reference source code and deployment guide**, so you can download it and hand it to your own agent to rebuild a Baton system of your own. It ships with nobody's data, projects or content.

## What you get

| What | Where | Used for |
|---|---|---|
| **Principles** | [`principles/`](principles/) | The why: how the agent team is organized, rules for agents, how projects are organized, the limit of 3 projects being pushed, the radial tree map, operating lessons |
| **Spec** | [`SPEC.md`](SPEC.md), [`build-plan-v0.1.md`](build-plan-v0.1.md), [`DESIGN.md`](DESIGN.md) | The source of truth for behaviour. Your agent builds from these files |
| **Reference source** | [`packages/`](packages/) | A working Baton v0.1: API, CLI, MCP, web UI, with its test suite |
| **Deployment** | [`DEPLOYMENT.md`](DEPLOYMENT.md) | A step-by-step handbook for putting it on Cloudflare, written for humans |
| **How agents use Baton** | [`AGENT-GUIDE.md`](AGENT-GUIDE.md) | One page for agents: the work loop via the CLI, exit codes, commands |
| **Templates to copy** | [`templates/`](templates/), [`CLAUDE.md`](CLAUDE.md), [`.claude/agents/`](.claude/agents/) | Rules for CoS, Manager and Worker; brief; report; prompt footer; work-assignment scripts |
| **Sample data** | [`sample-data/`](sample-data/) | **Fake** data and a project-map mockup you can open in a browser |

## Getting started

Read [`GETTING-STARTED.md`](GETTING-STARTED.md). It has three paths and the prompts to paste to your agent:

1. **Take only the method.** Read `principles/`, copy `templates/`, run your agent team on markdown files. No software to run yet.
2. **Deploy the existing build.** Have your agent check it, then follow `DEPLOYMENT.md` yourself.
3. **Rebuild it your way.** Have your agent build from `SPEC.md` in a clean room, using the code here as a reference.

## Five core ideas

1. **Four tiers:** Owner → CoS (coordination) → one Manager per project → Workers. Whoever plans does not code; whoever does the work does not grade it.
2. **Done requires evidence:** a merged commit or a URL that really runs, plus a passing review from a different agent.
3. **One single place for everything that needs the owner,** approved in a morning and an evening session, each item carrying enough context to decide in one read.
4. **At most 3 projects being pushed.** Everything else is in the queue or in a maintenance area.
5. **Radial tree map:** the owner at the centre, then domains, then projects. Bubble size follows priority, colour follows status; click a project to see its large work blocks.

## Reference source

- **Stack:** TypeScript · Cloudflare Workers + D1 (database) + Durable Objects + R2 (backups) · React + Vite · vitest.
- **Requirements:** Node 20 or later; to deploy you need a Cloudflare account. A GitHub token (commit verification) and a Telegram bot (notifications) are optional.

```
npm ci
npm run build
npm run typecheck
npm run lint
npm test
```

The test suite has about 3,500 cases for the API and 1,400 for the web UI. It runs locally and needs no account.

## Things to know before you use it

- **This is v0.1, an early build.** The "NOT YET AVAILABLE" section at the end of `DEPLOYMENT.md` lists what is missing, including restore from backup.
- **One workspace, one owner.** No teams, no per-person permissions.
- **The documentation is in English; the code is in Vietnamese.** The app's UI text, variable names, table names, file names under `packages/` and code comments are Vietnamese (written without diacritics in identifiers). API status codes are English; the mapping table is in `SPEC.md` section 0.1. The docs keep every identifier exactly as it appears in the code and quote UI labels in the original with an English gloss.
- **`docs/vi/` keeps the original Vietnamese `SPEC.md` and agent guide.** Several tests read those two files and cross-check their command tables and rules against the code, so they stay as the text the test suite is bound to. The English `SPEC.md` and `AGENT-GUIDE.md` are translations of them; if you change behaviour, update both.
- **The owner is called "Chủ" (Owner).** The list of items that need the owner is called **"Cần Chủ" (Needs Owner)**; in code: `can_chu`. At setup you set your own display name through `ten_chu`.
- **Code comments still refer to the original build history:** codes such as `BAT-16`, `T-131`, "`spec-questions.md` #116", "`decisions.md` 05/10" point to tickets and internal ledgers that do not ship with this repo. The reason behind each decision is already in the comment itself, or in `SPEC.md` section 19.12.
- **`DEPLOYMENT.md` marks many `wrangler` commands as "not yet run".** The handbook was written by an agent that was forbidden from running `wrangler`. Treat it as a guide to check against the current Cloudflare documentation, especially on your first deployment.
- **Configuration you must fill in yourself:** `database_id` and `BATON_URL_CONG_KHAI` in `packages/api/wrangler.toml`.

## License

[MIT](LICENSE) © TuySolo. Use, modify and share freely; no warranty.
