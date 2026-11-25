# DEPLOYING BATON — a handbook for the Owner

This handbook is written for a **human**, not for an agent. Every step is
numbered, one command per step, ready to copy-paste. Run from the repo root
unless a step says otherwise.

## READ FIRST: which commands in here NOBODY HAS RUN YET

`wrangler` is **blocked** in the agent environment that produced this project
(decisions.md 01/10). So:

* Every command starting with `wrangler` in this document **has never been run**.
  The syntax was read from `node_modules/wrangler` (the version installed in the
  repo), not from a real run. If a command reports a syntax error,
  `wrangler <group> --help` is a more correct source than this document.
* The three `[assets]` keys in `packages/api/wrangler.toml` have also **never
  been accepted by a single `wrangler deploy --dry-run`** — the comment block
  right above them states that plainly.
* What **has** actually been run: `npm run build`, `npm run lint`,
  `npm run typecheck`, and more than 3,100 test cases on Miniflare (`npm test`).
  The behavior of the software has evidence; the part about *putting it on
  Cloudflare* does not.
* **Section §i (Telegram) has also never been through a real run.** It was
  written from the Bot API documentation and from the send path that already has
  tests (with a **simulated** channel), not from a real message. The `curl`
  command in step 38a is a command **you** run — the agent does not run it
  (FORBIDDEN list in `CLAUDE.md` item 3: do not send Telegram to anyone).

Practical consequence: give steps 1–3 more time than you think, and do not be
surprised if you have to fix a key name in `wrangler.toml`.

---

## a. Create the D1 database

**1.** Log in to Cloudflare (skip if already logged in):

```
npx wrangler login
```

**2.** Create a DB named `baton`:

```
npx wrangler d1 create baton
```

**3.** The command above prints a config block containing `database_id = "…"`.
Open `packages/api/wrangler.toml`, find **line 12** in the `[[d1_databases]]`
block:

```
database_id = "00000000-0000-0000-0000-000000000000"
```

Replace that all-zeros string with the real `database_id`. **Do not change**
`binding = "DB"`, `database_name = "baton"`, `migrations_dir = "migrations"` —
the code and the tests rely on exactly these three values.

`database_id` **is not a secret** (it only identifies a DB, it cannot open the
DB); committing it is normal.

---

## b. Build, apply migrations, deploy

**4.** Build everything (TypeScript + web UI):

```
npm run build
```

**Required, and required BEFORE `wrangler deploy`.** The UI is served by the
Worker itself: `packages/api/wrangler.toml` declares
`[assets] directory = "../web/dist"`, and `packages/web/dist/` **is not in git**
(`.gitignore`). Without a build the asset directory is empty, `wrangler deploy`
pushes a Worker with no `index.html` at all, and opening the page shows only a
**blank screen** — the API still runs, so this error is very easy to mistake for
a different one. `npm run build` runs both `build:ts` and `build:web`.

**5.** Apply the migrations to the **real** DB (`--remote`; without this flag
they are applied to the local DB of `wrangler dev`, not the DB on Cloudflare):

```
npx wrangler d1 migrations apply baton --remote
```

**6.** Deploy. This command runs **from `packages/api`** (that is where
`wrangler.toml` lives). **Since BAT-8:** the R2 bucket `baton-sao-luu` must exist
first — if it does not, do §j1 before this step:

```
cd packages/api && npx wrangler deploy
```

**7.** The output of step 6 prints a line of the form
`https://baton-api.<account-name>.workers.dev` right below the words
`Deployed baton-api`. That is the **address of the system**: both your web UI
and the API root (`BATON_URL`) of every agent. Save it.

**8.** Check the Worker is alive (this route needs no token):

```
curl https://baton-api.<account-name>.workers.dev/v1/health
```

Expected: `{"ok":true}`.

---

## c. Secrets

Secrets are set with `wrangler secret put` (it asks for the value on stdin, does
**not** show it again, and it does **not** go into git). Still run from
`packages/api`.

### REQUIRED to be usable: `TOKEN_CHU`

**9.** Generate a long random string:

```
openssl rand -base64 48
```

**10.** Store that string in 1Password **right away** (a separate item, named
for example "Baton TOKEN_CHU"), then set it as a secret:

```
npx wrangler secret put TOKEN_CHU
```

Paste the string when it asks.

`TOKEN_CHU` matters because of two things that **no other path** can do:

* **First-time setup** (`POST /v1/khoi-tao`, step 12) — the only path that can
  create a workspace, i.e. the only way into the system from an empty DB.
* **The exit when you are locked out of login** (`POST /v1/chu/mo-khoa`,
  `packages/api/src/chu-dang-nhap.ts` function `moKhoaChu`). The limit against
  password guessing locks per **account**, so someone who does *not know* the
  password can still keep the account in a locked state by guessing wrong
  continuously. Without `TOKEN_CHU` nobody can unlock it.

`TOKEN_CHU` **empty or not set = no way in as the owner** (fail-closed, on
purpose). So if you lose it: `wrangler secret put TOKEN_CHU` again with a new
string. It is not your login password.

### For later: `GITHUB_TOKEN`

```
npx wrangler secret put GITHUB_TOKEN
```

Used to verify `commit` evidence (SPEC section 7). **Without it, the real
behavior is this** (read from `src/nguon-github.ts`,
`src/xac-minh-bang-chung.ts`, `src/cron-bang-chung.ts`):

1. An agent submits commit evidence → the server sees an empty token →
   concludes **`pending`** with the reason `Chưa cấu hình token GitHub trên
   server (secret GITHUB_TOKEN).` (English: GitHub token not configured on the
   server (secret GITHUB_TOKEN).) This is the "GitHub token has a problem"
   branch of SPEC l.220, **not** an immediate `failed`.
2. The every-minute cron retries once the 5-minute deadline is due, **at most 3
   times**. Each time it still sees an empty token.
3. After 3 times → the evidence becomes **`failed`**, keeping the reason above.
4. **The Done gate IS BLOCKED.** Neither `pending` nor `failed` opens the gate
   (`packages/shared/src/cong-xong.ts`, `moDuocCong`: `commit` opens the gate
   only when `merged`). So a ticket with code that has **only** commit evidence
   will **never enter Done by itself** when `GITHUB_TOKEN` is missing.
5. The workaround still exists: you change the status with the force flag and a
   reason (`POST /v1/ticket/:id/trang-thai` with `{"trang_thai":"done","ep":true,
   "ly_do":"…"}`, SPEC l.216). But doing that for every ticket means dropping
   section 7 entirely.

Practical conclusion: if you use Baton for *non*-code work you can postpone it;
if you use it for work with code you should set `GITHUB_TOKEN` early. The token
only needs **read** permission on the relevant repos.

### For later: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

These two secrets **already have a real handler** (part 7): stalled-session
alerts, new 🔴 items, the 🔴 reminder after 2 hours and the "ticket Done"
message are sent out to Telegram by a Cron Trigger that runs every minute. How
to obtain them and how to check a test message: **§i** below — read that whole
section before setting them, because there is one step (**pressing Start with
the bot**) that, if forgotten, makes the first message certain to fail.

**Without these two secrets Baton does NOT send and does NOT error**, on
purpose: the message still sits in the **in-app notification store** (table
`thong_bao`), the bell and the Overview are still complete, and **no agent
command fails** because Telegram is not configured. So postponing this section
is safe — it only changes "to know whether something urgent came up, you have
to open the page yourself".

### NO need to set: `PBKDF2_SO_VONG`

The owner password is hashed with PBKDF2-SHA256 (SPEC section 15,
`decisions.md` 01/10 Q6). The product's default iteration count is **100,000**
(`SO_VONG_PBKDF2` in `packages/shared/src/mat-khau.ts`), and you **do not have
to set anything** for `POST /v1/khoi-tao` to run.

100,000 is **the ceiling of Cloudflare Workers**: the runtime refuses PBKDF2
with `iterations > 100000`. The history of this number is worth knowing, because
it explains why you should not raise it — **on 06/10 the constant was still
600,000 and `POST /v1/khoi-tao` returned 500 on the very first deploy**; the
running instance could be set up only because the owner manually set the secret
`PBKDF2_SO_VONG=100000`.

* **A new, clean deployment:** skip this section. The default is already right.
* **The instance running since 06/10:** the secret `PBKDF2_SO_VONG` is still
  there. It is **no longer needed**, and **leaving it as is is also harmless** —
  the value `100000` matches the new default exactly, so behavior does not
  change. (If you want to clean up that secret, that is the owner's job; this
  document does not give instructions for deleting it.)
* **Do not set it HIGHER than 100,000.** Worse than the 500 error of 06/10: an
  owner row with `so_vong > 100000` **locks you yourself out of the system, with
  no self-repair path**.

  Why: `kiemMatKhau` re-hashes using the `so_vong` **of the row**
  (`packages/shared/src/mat-khau.ts:133`), and that number goes straight into
  `deriveBits({ iterations })` (:100-101) — so the **login** path throws, not
  only `POST /v1/khoi-tao`. The self-repair path is locked: the trigger
  `tg_chu_tai_khoan_so_vong_chi_tang` (`migrations/0017_chu_dang_nhap.sql:237`)
  ABORTs every statement that lowers `so_vong`, and the only path that rewrites
  all three columns — changing the password — requires logging in first, the
  very thing that has just become impossible. Exactly one path remains: going
  into D1 by hand, removing the `chu_tai_khoan` row and running setup again.
  That is **deleting data**, which falls under item 4 of the FORBIDDEN list in
  `CLAUDE.md` — **it needs the Owner's approval**, and this document stops here,
  with no instructions.

  **The running instance is safe:** it was set up *with*
  `PBKDF2_SO_VONG=100000`, so the real row is 100,000. The hole only opens for
  an instance set up **before** the secret was set, or for someone who sets the
  secret above 100,000 **and then changes the password**.

One honest point: the OWASP recommended level for PBKDF2-SHA256 is **higher**
than 100,000 iterations, so on this one metric Baton **does not meet** the
recommended level. What compensates: owner login also has **TOTP as a second
factor**, has **account lockout after n wrong attempts**, and the system has
only **one** owner account — there is no user table to probe in bulk.

### Do NOT set: `CHO_DUONG_TEST`

This flag opens the route `/v1/_loi/:ma` — a route built to check the error
middleware; only Miniflare turns it on while running tests. On a deployment,
when it is not set that route is a 404. **Do not set it.**

### Reminders

* Do not commit secrets, no `.env*` in git, do not print secrets to logs (SPEC
  section 15).
* `wrangler secret list` tells you the **names** of the secrets that have been
  set, not their values. That is all you can look back at.

---

## d. First-time setup and login

Run exactly one command. It creates the workspace, sets the password + TOTP for
you, creates the projects, creates the agents, issues the tokens. **It can be
re-run**: if you typed something wrong, fix the body and send it again; it does
not duplicate anything and does not re-issue any secret.

**11.** Write the body file **outside the repo** (`/tmp`, so there is no risk of
committing the password). Open an editor and save it as
`/tmp/baton-khoi-tao.json`:

```json
{
  "ten_chu": "Chủ",
  "mat_khau": "SET-A-LONG-PASSWORD-OF-YOUR-OWN",
  "du_an": [
    { "ten": "Baton",   "ma": "BAT" },
    { "ten": "Sample", "ma": "SAI" },
    { "ten": "INC",     "ma": "INC" }
  ],
  "agent": [
    { "ten": "CoS",        "vai_tro": "coordinator", "vao_tat_ca_du_an": true },
    { "ten": "M-Sample",  "vai_tro": "manager",  "du_an_duoc_vao": ["SAI"] },
    { "ten": "M-Baton",    "vai_tro": "manager",  "du_an_duoc_vao": ["BAT"] },
    { "ten": "M-INC",      "vai_tro": "manager",  "du_an_duoc_vao": ["INC"] },
    { "ten": "W-builder",  "vai_tro": "worker",   "vao_tat_ca_du_an": true },
    { "ten": "R-reviewer", "vai_tro": "reviewer", "vao_tat_ca_du_an": true }
  ]
}
```

Rules for the fields (checked by the server itself, so if something is wrong it
says so immediately):

* `mat_khau`: **12–256 characters**. Use 1Password to generate and store it.
* project `ma`: **2–6 letters A–Z**, unique.
* `vai_tro`: exactly one of `coordinator`, `manager`, `worker`, `reviewer`.
* `du_an_duoc_vao` here takes **project codes** (`"BAT"`), not ids — unlike
  `POST /v1/agent`. On purpose: at the time you type this file the projects do
  not have any id yet. With `vao_tat_ca_du_an: true`, omit `du_an_duoc_vao`.

**12.** Call the setup route:

```
curl -sS -X POST https://baton-api.<account-name>.workers.dev/v1/khoi-tao -H "authorization: Bearer $(op read 'op://Private/Baton TOKEN_CHU/password')" -H 'content-type: application/json' --data @/tmp/baton-khoi-tao.json
```

(If you do not use the 1Password CLI, replace `$(op read …)` with the
`TOKEN_CHU` string. Be aware that doing so puts `TOKEN_CHU` into your shell
history.)

Expect `200` and a JSON body containing:

* `workspace.vua_tao: true`
* `chu.otpauth: "otpauth://totp/Baton:Ch%E1%BB%A7?secret=…"` (the owner name is URL-encoded)
* each project `vua_tao: true`
* each agent `vua_tao: true` together with a `token: "…"`

**13. `otpauth://` is shown ONLY THIS ONE TIME.** The server keeps the secret
only to check codes; there is no path to read it back. Do this now, in order:

1. Open your authenticator app (1Password, Authy, Google Authenticator), add an
   entry by **pasting the `otpauth://…` URI** (1Password: paste into the
   "one-time password" field).
2. Check that it generates a 6-digit code.
3. Only then go on to step 14.

**If you lose the URI, or lose the authenticator app later** — see §h right
below. There is a real rescue path; do not go deleting tables.

**14.** Store in 1Password right away, one item each:

* the owner password
* the TOTP entry just scanned in step 13
* **each agent token** (6 items: CoS, M-Sample, M-Baton, M-INC, W-builder,
  R-reviewer). A token is shown exactly once; if lost it must be re-issued
  (step 17).

**15.** Delete the body file (it contains the password):

```
rm /tmp/baton-khoi-tao.json
```

**16.** Open `https://baton-api.<account-name>.workers.dev/` in a browser. It
shows the **login page**; enter the password + the 6-digit code from the
authenticator app (one form, two layers, SPEC l.415). Once in you see **Tổng
quan** (Overview). The session lasts 30 days.

---

## h. RESCUE — three situations, three commands

Read this section **before you need it**. All three commands need `TOKEN_CHU`,
so the most important consequence is: **losing `TOKEN_CHU` means losing all
three rescue paths.** Keep it somewhere that cannot be lost at the same time as
your phone.

### h1. Lost the authenticator app (lost/changed phone, TOTP entry deleted by mistake)

This is the most likely situation, and before this round there was **no way
out**.

```
curl -sS -X POST https://baton-api.<account-name>.workers.dev/v1/chu/dat-lai-totp -H "authorization: Bearer $(op read 'op://Private/Baton TOKEN_CHU/password')" -H 'content-type: application/json' -d '{}'
```

Returns a **new** `otpauth://` — scan it right away, it too is shown only once.
This command:

* **keeps your password unchanged** (so someone who holds `TOKEN_CHU` but does
  not know the password still cannot get in — the two layers of l.415 are both
  still there);
* **kicks every open web session** (returns `so_phien_da_huy`). On purpose: the
  reason you call this command is "the second factor has left my hands", so
  every old session must die instead of living for up to 30 more days. You log
  in again with the old password + the new code.

It can be re-run as many times as you like; each time gives a new secret.

### h2. Locked out because of too many wrong password guesses

```
curl -sS -X POST https://baton-api.<account-name>.workers.dev/v1/chu/mo-khoa -H "authorization: Bearer $(op read 'op://Private/Baton TOKEN_CHU/password')"
```

It only resets the wrong-attempt counter and removes the lock timestamp; the
password and the TOTP code still have to be correct at the next login.

**Why you will need it:** `/v1/dang-nhap` **deliberately does not go through**
the 600 requests/minute counter (a login does not yet have any key to count by)
— what caps the number of guesses is the `so_lan_sai` counter **of the
account**. So an outsider who does *not know* the password can still keep the
account in a locked state by guessing wrong continuously, and this command is
the only way to unlock it.

### h3. You suspect an unknown machine is still logged in

**The main path is the UI**: open **Cài đặt** (Settings) (`/cai-dat`), the
**Tài khoản** (Account) area.

1. **Các phiên đang mở** (Open sessions) — each row is a session still valid:
   device label (hover to see the full User-Agent string), login time, time
   last used (recorded at a cadence of about 1 hour, so a new session may show
   "chưa ghi" (not recorded yet)). The session you are sitting in carries the
   label **Phiên này** (This session). No session id is shown, and there is
   also **no** per-session sign-out button.
2. If you see an unknown row → click **Đăng xuất mọi nơi** (Sign out
   everywhere), then click **xác nhận** (confirm) at the confirmation step
   (clicking Huỷ (Cancel) does nothing). Every session is revoked, **including
   this one**: you return to the login page and get back in with password +
   TOTP code. The same button (also with a confirmation step) is in the menu
   that opens when you click the workspace name at the top of the sidebar.
3. If you suspect the password has leaked too → also use the **Đổi mật khẩu**
   (Change password) section right below: current password + TOTP code + new
   password entered twice. After the change, **every other session** is signed
   out (the page reports the number of sessions revoked); the session you are
   sitting in is kept.

**The fallback path** (cannot get into the web, or the UI is broken): call the
API with **your session cookie**:

```
curl -sS -X POST https://baton-api.<account-name>.workers.dev/v1/dang-xuat-moi-noi -b "baton_phien=<session-id-from-browser>"
```

If getting the cookie is hard, or you suspect the second factor (the TOTP code)
has leaked as well: run **h1**. It needs no cookie, kicks every session as a
side effect, and replaces the second factor too.

---

## e. Issue tokens to agents and configure the CLI

Step 12 already issued tokens to all 6 agents. This part is how to **use**
them, and how to re-issue one when lost.

**17.** You need a new token for an agent (token lost, or suspected leaked):

```
curl -sS -X POST https://baton-api.<account-name>.workers.dev/v1/agent/<id-agent>/token -H "authorization: Bearer $(op read 'op://Private/Baton TOKEN_CHU/password')"
```

The **old token stops working immediately** (SPEC section 3). Look up
`<id-agent>` on the **Đội agent** (Agent team) page (`/doi-agent`) or in the
response of step 12.

**No button on `/doi-agent` does this** — that page only shows the list and the
last 4 characters of each token. Re-issuing a token is the `curl` above, not an
action in the UI; do not go looking for a button.

The `$(op read …)` form is deliberate, same as step 12: it does not leave
`TOKEN_CHU` in the shell history and needs no `export TOKEN_CHU` at all — the
very same reasoning as §19 below about agent tokens.

**18.** Configure an agent. The CLI reads **exactly two** environment variables
(`packages/cli/src/moi-truong.ts`, SPEC section 13 l.382):

| Variable | Value |
|---|---|
| `BATON_URL` | `https://baton-api.<account-name>.workers.dev` (the root, **without** `/v1`) |
| `BATON_TOKEN` | the token of **that agent itself** |

If either is missing → the CLI exits with **code 2** and names the missing
variable. The CLI **never prints the token**, not even in error messages.

**19.** How to let an agent use a token **without writing the token into any
file** — store it in 1Password and run through `op run`. Create
`~/.config/baton/env` (this file contains only *references*, not the token):

```
BATON_URL=https://baton-api.<account-name>.workers.dev
BATON_TOKEN=op://Private/Baton token M-Baton/credential
```

Then run the agent through it:

```
op run --env-file=~/.config/baton/env -- claude -p "..."
```

**Do not** `export BATON_TOKEN=bt_…` in `~/.zshrc`: that way the token sits
ready in every process on the machine, in plain text, in a file that gets
backed up.

**20.** The CLI runs from the build in the repo (not yet published to npm):

```
node packages/cli/dist/bin.js whoami
```

If you type it a lot, add an alias: `alias baton='node ~/…/baton-open-agentfactory/packages/cli/dist/bin.js'`.
From here on the document writes `baton` for short.

---

## f. Quick checks after deploy

Each line comes with the expected result. Run with the `BATON_TOKEN` of an
agent (`M-Baton` for example).

**21.** `baton whoami` → prints the agent name, role, list of accessible
projects, and the workspace's Common rules. Exit code 0.

**22.** `baton list --project BAT` → the ticket table of project BAT. Right
after setup the list is **empty** — correct, there are no tickets yet.

**23.** `baton profile BAT` → the profile of project BAT (name, code, flags,
the "Lỗi đã gặp" (Known pitfalls) section). Wrong project code → exit code 1.

**24.** `baton create BAT "Post-deploy test ticket"` → prints the new ticket
code in the form `BAT-1`. (The `create` permission of the role you use must
allow it; `manager` does.)

**25.** `baton show BAT-1` → details of the ticket just created plus the chain
of assignment rounds (empty).

**26.** `baton tasks` → my work. Empty at this point because nobody has
assigned anything. Exit code 0.

Then open a browser, 3 pages:

**27.** `/` → **Tổng quan** (Overview): 5 blocks (projects, agents, Needs
Owner, …). Counts of 0 are correct; a blank screen or "không tải được" (could
not load) means go back to step 4 (build web).

**28.** `/ban-do-du-an` → **Bản đồ** (Map): a table of the 3 projects just
created plus the Common rules page.

**29.** `/doi-agent` → **Đội agent** (Agent team): the 6 agents just created,
each row with the last 4 characters of the token (never the full token).

If steps 27–29 are blank but steps 21–26 work: the assets have not gone up.
Re-run step 4 and then step 6.

---

## g. Rollback

**30.** List the deployed versions:

```
cd packages/api && npx wrangler deployments list
```

**31.** Go back to a previous version (take the id from step 30):

```
cd packages/api && npx wrangler rollback <deployment-id>
```

`wrangler rollback` **only changes the Worker code**. It does **not** undo D1
migrations — once a migration is applied the data is in the new schema, and an
older version of the code may not be able to read that schema. So: rollback is
safe for a deploy **without a new migration**; with a new migration, fix
forward (deploy a patch) instead of going back.

**Since BAT-16:** migration `0026_cai_dat_thong_bao_bao_mat` (notification switches,
account security messages) is applied in step 5 like every other migration. If you are **forced** to roll it back,
there is a manually-run undo file `packages/api/migrations/rollback/0026_cai_dat_thong_bao_bao_mat.rollback.sql`
— read the top of the file first (it drops the switch table; the Worker code must be rolled back first), and run it only
when the Owner approves. This file is **not** applied by step 5.

**32.** Shut the system down completely (cuts all access; the D1 data
remains):

```
cd packages/api && npx wrangler delete
```

Turning it back on = re-running steps 4 and 6. The secrets that were set are
**lost with the Worker**; you must `wrangler secret put` again from step 9.

---

## i. Telegram notifications (part 7)

Do this section **after step 7** (it needs the Worker address). Three things to
configure, and they are **not in the same place** — putting one in the wrong
place is the second most common error here:

| Thing | What it is | Where it goes |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | **a real secret** — whoever has it can send messages under your bot's name | `wrangler secret put` |
| `TELEGRAM_CHAT_ID` | your chat id; not a big secret but it is private data | `wrangler secret put` |
| `BATON_URL_CONG_KHAI` | Baton's public root URL, used to build the **link** in messages | `wrangler.toml`, section `[vars]` — **can be committed** |

Why the third one is not a secret: it is exactly the string that will be in
every message sent to you. And why Baton does not know it by itself: messages
are fired in a Cron run, and a Cron run **has no request** — so there is no
`Host` to derive the domain from.

### i1. Create the bot

**33.** Open Telegram, find **@BotFather**, send `/newbot`. It asks for a
display name and then a username (which must end in `bot`). When done, it
returns a line of the form:

```
8123456789:AAH4k9_Vd2qExampleExampleExampleExample
```

That is the **bot token**: the form `<number>:<string>`. Store it in 1Password
right away (item "Baton TELEGRAM_BOT_TOKEN").

**DO NOT paste this token into any file in the repo** — not `wrangler.toml`,
not `.env`, not a notes file. It only passes through the stdin of
`wrangler secret put` in step 36 (FORBIDDEN list in `CLAUDE.md` item 5). If you
paste it into a file by mistake and commit, you must `/revoke` at BotFather and
make a new token, because git keeps it forever.

### i2. Get the chat id

**34. Press Start with the bot FIRST.** Open the chat with the bot you just
created and press the **Start** button (or send `/start`). Skipping this step
is the **most common error** of the whole section: Telegram does not let a bot
message someone who has never spoken to it first, so Baton's first message will
fail with `Telegram trả mã 403. Forbidden: bot can't initiate conversation with
a user` (English: Telegram returned code 403. …), and nothing in the UI says
"you have not pressed Start".

**35.** Read the chat id (nothing to install, just a browser):

```
https://api.telegram.org/bot<TOKEN>/getUpdates
```

Replace `<TOKEN>` with the bot token. In the JSON returned, take
`result[].message.chat.id` — an integer, for example `123456789`.

**This URL CARRIES THE TOKEN.** Do not paste it whole into Linear, a group
chat, an issue, or let anyone see your screen. Close the tab once you have read
it.

An **empty** `result` `[]` means Telegram has not seen any message from you —
go back to step 34, send the bot any single word, then reload the URL.

Sending to a **group** is different: add the bot to the group, send a message
in the group, and the id is then at `result[].message.chat.id` and it is a
**negative** number (of the form `-100…`). Take it complete with the minus
sign.

### i3. Set the configuration

**36.** Two secrets (run from `packages/api`, paste the value when it asks):

```
cd packages/api && npx wrangler secret put TELEGRAM_BOT_TOKEN
```

```
cd packages/api && npx wrangler secret put TELEGRAM_CHAT_ID
```

**37.** The public URL — **you have to fill it in yourself.** Open
`packages/api/wrangler.toml`, find the `[vars]` section:

```
[vars]
BATON_URL_CONG_KHAI = "https://baton-api.TEN-TAI-KHOAN.workers.dev"
```

Replace `TEN-TAI-KHOAN` with the address saved in **step 7** (or your own custom domain) —
**no** trailing `/` — then redeploy for it to take effect: **step 6**.

This is a public URL, **not a secret**: it is exactly what sits in every message
sent to you, so it lives in `wrangler.toml` and gets committed, unlike the two secrets of
step 36.

If this value is wrong or missing, **messages are still sent, just without a link** — every message arrives as
plain text, and you have to open Baton yourself and find the card yourself. This deviates from section 12 l.347 but does not
block anything, so it is easy to overlook: if your Telegram messages have no link, or clicking the link
leads to an error page, the place to look is exactly this step.

### i4. Send ONE message by hand, before trusting Baton

This step separates **two questions** which, if merged, leave you not knowing
where the error is: *"are my bot and chat id correct"* and *"can Baton send"*.
Do step 38a first, and only when it is `ok` go on to step 38.

**38a.** The command below is run by **you** on your own machine (the agent does not run it — FORBIDDEN
list in `CLAUDE.md` item 3). Replace the two blanks with the real values:

```
curl -s -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" -H "content-type: application/json" -d '{"chat_id":"<CHAT_ID>","text":"Baton test message. Ignore this message."}'
```

**This command CARRIES THE TOKEN** (Telegram puts the token in the path). Do not paste it whole
into Linear, a group chat, an issue, or anywhere else — and if your shell saves history,
delete that line after running it.

How to read the result:

| Returns | Meaning | What to do |
|---|---|---|
| `{"ok":true,...}` | **Done.** The bot and the chat id are both correct; continue to step 38 | — |
| `403` + `bot was blocked by the user` | you have **blocked** the bot | unblock it in Telegram, run again |
| `403` + `bot can't initiate conversation` / `chat not found` | you have **not pressed Start** with the bot, or the chat id is wrong | redo step 34 then step 35 |
| `401` + `Unauthorized` | the token is wrong, mistyped/incomplete, or was `/revoke`d | get a new token at BotFather |

If step 38a is `ok` but Baton still cannot send, then the error is **not** in Telegram — it is in
the two secrets (step 36) or in not having redeployed (step 6).

### i5. Check a message sent by Baton itself

No code change needed, no test route needed.

**38.** Create a **🔴 (urgent)** Needs Owner item with an agent's CLI (steps 18–20 already
set `BATON_URL` and `BATON_TOKEN`):

```
baton ask --level urgent --type review --file DEPLOYMENT.md "Telegram test message, ignore this item"
```

Both choices in the command above have a reason; do not change them when testing:

* **`--level urgent`**: a **new** 🔴 item carries `uu_tien = 'khan'`, and a `khan` message is
  sent **immediately, even during quiet hours** (23:00–7:00, SPEC 19.8 l.535) — so you can test
  at any time. A `today`/`later` item produces a **normal** message, and if you test at midnight
  it is **deferred until 7:00 in the morning**: correct per SPEC, but it looks exactly like a failure.
* **`--type review`** (with `--file`; this type requires at least one file or
  link): **`--type fyi` will NOT send any message.** 🔴 + `fyi` is the case where SPEC 19.8 has
  the server **automatically lower it to 🟡** and report that in the returned result (the line "Lưu ý: mức đã bị
  hạ…" (English: Note: the level has been lowered…)), so the item is no longer 🔴 and no 🔴 message is produced. Do not use
  `--type run_command` for a test: it creates an item asking you to **run a command**.

**39.** Wait **up to one minute**: the sending Cron runs at the cadence `* * * * *`. Expect a
Telegram message with Vietnamese content about the 🔴 item plus a link line `https://…`.

**40.** Clean up: go to `/can-chu` on the web and click **Bỏ qua** (Dismiss) for that test item. (If you leave it at
`Chờ` (Waiting), after **2 hours** you receive **one** more 🔴 reminder — correct per SPEC section 8
l.283, reminded exactly once, not repeated.)

**Account security messages (since BAT-16): what "sent immediately" means.** Changing the password, resetting
TOTP, signing out everywhere, and entering a wrong value from the 3rd time onward when changing the password all produce
a security message. "Sent immediately" for this message does **not** mean the request sends to Telegram:

* The request only **writes the message into the store** (`thong_bao`, `uu_tien = 'khan'`, column `bao_mat`
  holding the event code) in the same batch as the change. There is no Telegram call
  in the request, so a broken Telegram does not break the password change.
* The every-minute Cron (`* * * * *`, `quetGuiThongBao` in `cron-thong-bao.ts`) sends it at
  the **next tick**, i.e. within about one minute, **even during quiet hours**
  (because it is a `khan` message). This message cannot be turned off in Settings.
* If sending fails it retries at the marks 10 seconds / 60 seconds / 5 minutes, but each attempt only
  runs at the first cron tick after that mark. So the "10 seconds" attempt in practice goes out at the next minute.
* If Telegram is not configured (step 36) nothing is sent; the message waits in the store. Security
  messages do not produce the 🔴 reminder after 2 hours.

**No message at all?** In this order:

1. Open **Tổng quan** (Overview) and look at the **Cần chú ý** (Needs attention) block. A line *"Không gửi được thông báo
   Telegram (lý do)"* (English: Could not send the Telegram notification (reason)) is the quickest place to look — the reason is already a Vietnamese sentence, and
   it **has been filtered** so it does not carry the token. That line only appears after Baton has tried
   all **4 times** (1 first attempt + 3 retries spaced 10 seconds / 60 seconds / 5 minutes), i.e.
   after about 6 minutes.
2. If 6 minutes have not passed, or you want the raw view, inspect the table directly:

```
cd packages/api && npx wrangler d1 execute baton --remote --command "SELECT id, loai, uu_tien, tao_luc, gui_telegram_luc, gui_so_lan_thu, gui_thu_lai_luc, gui_loi_ly_do FROM thong_bao ORDER BY tao_luc DESC LIMIT 10;"
```

Read three columns: `gui_telegram_luc` has a number = **sent successfully**;
`gui_so_lan_thu` increasing = in the retry loop; `gui_so_lan_thu = 4` together with
`gui_loi_ly_do` = given up, and the reason is right there.

| What `gui_loi_ly_do` says | What it really is | What to do |
|---|---|---|
| `Telegram trả mã 403.` (English: Telegram returned code 403.) + `bot can't initiate conversation` | you have **not pressed Start** with the bot | do step 34, then create a new 🔴 item (the old message has used up its attempts, it does not resend by itself) |
| `Telegram trả mã 400.` (English: Telegram returned code 400.) + `chat not found` | the chat id is **wrong** — most often the group's `-` sign is missing, or `from.id` was taken instead of `chat.id` | redo step 35, `wrangler secret put TELEGRAM_CHAT_ID` |
| `Telegram trả mã 401.` (English: Telegram returned code 401.) + `Unauthorized` | the bot token is wrong, mistyped/incomplete, or was `/revoke`d | `wrangler secret put TELEGRAM_BOT_TOKEN` again |
| `Không gọi được Telegram (lỗi mạng hoặc quá hạn chờ).` (English: Could not call Telegram (network error or timeout).) | `api.telegram.org` could not be reached within the timeout | usually clears up by itself on a retry; if it persists, look at the Worker log |
| **No row at all**, `gui_so_lan_thu = 0`, `gui_telegram_luc` empty | Baton has **not been configured** for Telegram so it never tried to send | the two secrets of step 36 are not set, or they are set but you have **not redeployed** |

The last row is the most common and most silent case: `wrangler secret put` does **not**
deploy by itself. After setting the secrets, re-run **step 6**.

`wrangler secret list` (from `packages/api`) tells you whether the **names** of the two secrets are set
— it does not tell you the values.

### i6. ONE Cron schedule, and why only one

`packages/api/wrangler.toml` has **exactly one** `[triggers] crons` schedule:

```
crons = ["* * * * *"]
```

**Why one, not five — and this is an account limit, not an aesthetic
choice.** The **Workers Free plan gives 5 cron triggers per ACCOUNT** (not per Worker).
On 07/10 the deployment was refused by Cloudflare:

```
This account has reached the Workers Free limit of 5 cron triggers per account
[code 10072]
```

The account at that time had another Worker using 2 schedules, so Baton had at
most 3 slots left. The real consequence of that occasion: the two **report** schedules could not be set, i.e. **the
morning report and the evening handoff did not run** on the live instance. Now all five background jobs go
in one every-minute schedule and the Worker picks the job itself by the **timestamp of the tick**:

| When (UTC) | Vietnam time | Job | SPEC |
|---|---|---|---|
| every minute | every minute | retry evidence · **send Telegram** · 🔴 reminder after 2 hours | 7 l.220, 12, 8 l.283 |
| minute divisible by 5 | every 5 minutes | alert on stalled or errored sessions | 6 l.196 |
| minute divisible by 10 | every 10 minutes | re-check `pushed` commits, stop tracking after 7 days | 7 l.221, 19.7 |
| from **00:30** | **07:30** | **morning report** | 11 l.322 |
| from **13:00** | **20:00** | **evening handoff** | 11 l.330 |

The **effective** cadence of each job is **unchanged** compared with the old five schedules — only the way they are
triggered changed. If later you see a new background job in Baton, it **will not** need
another cron either: the account's slots are kept as they are from here on.

**The last two rows are UTC times** — that is the easiest place to misread in the whole config file. The times
in the SPEC are **Vietnam time (UTC+7)**: 00:30 UTC **is** 07:30 Vietnam time, 13:00 UTC
**is** 20:00 Vietnam time. Do not "fix" them to 07:30 and 20:00 UTC — those are 14:30 and
03:00 Vietnam time.

**"From", not "exactly at".** Cloudflare does not promise to fire a tick on time and exactly once.
So the two report jobs get a whole **60-minute window** starting from the mark, and inside the window Baton
asks "does today already have a report of this type" before generating. Two consequences you should know:
if the 00:30 tick is skipped but 00:31 happens, **the report still comes out, exactly once**; but if Cron is down
for **the whole hour** 00:30–01:30, that day's morning report is **lost** (there is no catch-up queue).

**Cron is only applied at deploy time.** If `wrangler.toml` changes but **step 6** has not been re-run,
the running instance keeps the old schedule, and you will receive no report. After deploying,
Cloudflare Dashboard → Workers → `baton-api` → **Settings → Triggers** must list
**exactly one** expression `* * * * *` — seeing three or five lines means the old version has not been replaced.

The two report schedules **do not call Telegram**. They write one row into the `bao_cao` table and
one message into the in-app notification store; getting that message out to Telegram is the job of the every-minute
tick. The practical consequence, and it is **intentional**: without Telegram configured the reports
**are still generated** and can still be viewed at `/bao-cao` on the web — you just do not receive messages.

Quick check after deploy, the next morning:

```
cd packages/api && npx wrangler d1 execute baton --remote --command "SELECT ngay, loai, tao_luc FROM bao_cao ORDER BY ngay DESC, loai DESC LIMIT 5;"
```

If there is no row after 07:30, then in order: (1) does Triggers have the `* * * * *` schedule;
(2) does the Worker log (Dashboard → Logs) have any `Cron báo cáo:` (English: Cron report:) line; (3) open
`/bao-cao` on the web — report generation does **not** depend on Telegram, so a row
there with no message is an error of the sending stage, not of the generating stage.

---

## j. Backup (BAT-8)

SPEC section 15 l.429: "export all data to JSON with one button (owner only). There is an automatic
daily backup, keeping 14 copies." This version has **both halves**; **restore is NOT YET AVAILABLE** (19.12
question 7: "v0.1 has no restore button" — restoring is manual work, see j5).

**Every `wrangler` command in this section is NOT YET RUN** (see "READ FIRST"). The syntax was checked
against the command definitions in `node_modules/wrangler/wrangler-dist/cli.js` of the installed
version (`r2 bucket create <name>`; `r2 object get <bucket>/<key> --file … --remote`).

> ⚠️ **The backup file contains all coordination data** (tickets, Needs Owner, decision
> log, reports, project profiles…). It does **not** contain the password, salt, TOTP secret, agent
> tokens or login sessions — but it is still your data. **Do not commit it, do not send it anywhere**,
> do not leave it in the repo directory.

### j1. Create the R2 bucket — ONCE, BEFORE the first deploy that includes BAT-8

`packages/api/wrangler.toml` now declares `[[r2_buckets]] binding = "SAO_LUU"`,
`bucket_name = "baton-sao-luu"`. If the bucket does not exist, **`wrangler deploy` will report an error**.
Run from `packages/api`:

```
cd packages/api && npx wrangler r2 bucket create baton-sao-luu
```

R2 has a free allowance; one JSON backup of Baton is small, 14 copies are negligible. If
Cloudflare demands enabling R2/adding a payment method then **stop** — that is your job,
not the agent's (FORBIDDEN list item 1).

### j2. When the automatic backup runs

* **02:00 Vietnam time every day** (= 19:00 UTC), inside the **same** Cron Trigger
  `* * * * *` that already exists — no new cron added (limit of 5 crons/account, §i6). A tick delayed
  by up to 60 minutes still runs; a repeated tick does not write twice.
* **One** object per day: `sao-luu/baton-<YYYY-MM-DD>.json` (date in Vietnam time). After
  a successful write, copies **older than the 14 newest** are deleted. Objects that do not match that name pattern
  (ones you put in the bucket yourself) are **never** touched. If the write fails, **nothing is deleted**.
* The 07:30 morning report and the 20:00 evening handoff have **one line** `⚠️ Sao lưu <date> …` (English: Backup <date> …) when
  the latest copy is **not** on R2, when R2 **errors** during the check, or when R2 is not bound
  ("Sao lưu tự động chưa bật" (English: Automatic backup is not enabled)). No such line = last night's copy exists.

### j3. Manual export by button or CLI

* **Web:** `Cài đặt` (Settings) (bottom of the sidebar) → the **"Xuất dữ liệu (JSON)"** (Export data (JSON)) button → the browser downloads
  `baton-<date>.json`.
* **CLI** — only works with **`TOKEN_CHU`** as `BATON_TOKEN` (an agent token →
  `FORBIDDEN`, exit code 1). The target file **must not exist yet** (no overwrite):

  ```
  BATON_URL=https://baton-api.<account-name>.workers.dev BATON_TOKEN=<TOKEN_CHU> node packages/cli/dist/bin.js export ~/baton-sao-luu/baton-thu.json
  ```

  (CoS runs it through `op run` so `TOKEN_CHU` does not go into the shell history.) The command prints the path
  and the row count of each table.
* **curl** (same body): `curl -H "Authorization: Bearer <TOKEN_CHU>" -o baton.json https://baton-api.<account-name>.workers.dev/v1/xuat`

### j4. Fetch a copy from R2 and read it

The list of 14 copies (date, size) is visible right in the web: **Cài đặt → Bản sao lưu** (Settings → Backups).
(`wrangler` has **no** command to list objects in a bucket — the installed version only has `r2
object get/put/delete`.) Do these in turn:

1. **Fetch a copy to your machine** — pick one of two ways:
   * **Way A (web, recommended):** `Cài đặt` (Settings) → the **Bản sao lưu** (Backups) section → click **Tải** (Download) on the row
     of the date you need. The browser downloads `baton-<date>.json`. (This section shows "Sao lưu tự động
     chưa bật" (English: Automatic backup is not enabled) if R2 is not bound.)
   * **Way B (wrangler, NOT YET RUN):**

     ```
     cd packages/api && npx wrangler r2 object get baton-sao-luu/sao-luu/baton-2026-10-16.json --remote --file ~/baton-sao-luu/baton-2026-10-16.json
     ```

     Without `--remote` it reads the **local** bucket of `wrangler dev`, not the real one.
2. **Check the file is readable** (needs `jq`). First check the JSON is valid — if valid it prints
   nothing and the exit code is 0; if broken, `jq` reports a syntax error:

   ```
   jq empty ~/baton-sao-luu/baton-2026-10-16.json
   ```

   Then take a quick look at the content:

   ```
   jq '.schema_version, .migration_cuoi, .xuat_luc, (.bang | map_values(length))' ~/baton-sao-luu/baton-2026-10-16.json
   ```

   Expected: `1`, the name of the last migration (e.g. `"0026_cai_dat_thong_bao_bao_mat"`), the export timestamp,
   then the row count of each table.
3. **Restore into D1:** There is no tool yet for restoring into D1; it needs CoS and the Owner to do it by hand.

### j5. Restore — NOT YET AVAILABLE

No button, no command: **there is no tool yet for restoring into D1; it needs CoS and the Owner to do it
by hand.** This document gives no command that writes into D1 because no method has been tried yet. The file
format (`schema_version: 1`): `{ schema_version, xuat_luc, xuat_luc_ms, workspace_id,
migration_cuoi, bang: { <table>: [row…] } }` — tables are ordered **parent before child** (by foreign
key). The two tables of the owner account are **not** in the file: after restoring you must `POST
/v1/khoi-tao` / `/v1/chu/thiet-lap` again (§d), and **re-issue the token of every agent** (tokens
do not travel with the backup). The export reads each table page by page; it is **not** an atomic
snapshot: a write at 02:00 can leave two tables off by one row.

---

## NOT YET AVAILABLE in this early-use version

So that you do not go looking for something that does not exist:

* **3 focus items** (SPEC section 11 l.324): **available** by both paths (BAT-11). The
  `coordinator` agent writes through the **API** — exactly the wording of l.324: `POST /v1/trong-tam` with the body
  `{"muc":[{"ticket_id":"...","ghi_chu":"..."}]}`, at most 3 items, callable with the token
  of the `coordinator` agent **or** with your session; `GET /v1/trong-tam` reads today's
  set. On the web, the `/bao-cao` page has a box for entering the three items (ticket code + note), a save button
  and a clear-all button. If nothing is entered the report says the SPEC's exact words *"chưa có đề xuất"* (English: no proposal yet).
  This is no longer a gap; the line is kept so you know where it is.
* **Deep scroll-back in the report list**: **available** (BAT-15). The `/bao-cao` page
  loads the first 50 rows; the "Xem thêm" (Load more) button appends the next page (`GET /v1/bao-cao?cursor=…`), when there are no more
  the button is hidden, on a network error it shows "Thử lại" (Retry) and keeps the list as is. The line is kept so you know
  where it is.
* **Backup**: export by button/CLI and the automatic 14-copy backup are **available** (§j). **Not yet
  available:** there is no tool yet for restoring into D1; it needs CoS and the Owner to do it by hand (§j5). Before each deploy that has a migration, an SQL
  snapshot is still worth doing:
  `cd packages/api && npx wrangler d1 export baton --remote --output baton-sao-luu.sql`
  (this command is **not yet run**).
* **Importing old data** (part 8): `sample-data/` has fake data, but the import path for
  old needs-owner / decision-log files is **not yet available**. Old history cannot go into Baton; start
  from new data.
* **Keyboard shortcuts, optimistic updates, 375px layout** (section 14): **mostly
  available**. Keys `J`/`K`/`S`/`Esc` in the ticket list, `D`/`S`/`J`/`K`/`1`–`9`/`Ctrl+Enter`
  on the Needs Owner page; optimistic updates (`onMutate`) in the list, ticket detail,
  Needs Owner, `/cai-dat`; 375px layout (slide-out menu, horizontally scrolling tables). **Still missing:**
  `G` (go to page) and `?` (key cheat sheet). Creating a task is available (BAT-22: the "Tạo việc" (Create task) button + key `C`).
* **`/cai-dat`**: now has the "Xuất dữ liệu (JSON)" (Export data (JSON)) button (BAT-8),
  the backup list with a download button (BAT-10), the **Tài khoản** (Account) part (BAT-11): the
  open sessions, the "Đăng xuất mọi nơi" (Sign out everywhere) button (with a confirmation step), the change-password form
  (§h3), and **turning off each notification type** (BAT-16, section 12). The
  pages that already have real content: `/`, `/can-chu`, **`/bao-cao`**,
  `/nhat-ky`, `/ban-do-du-an`, `/doi-agent`, `/ticket`, `/t/:mã`, `/du-an/:mã`,
  `/du-an/:id/ho-so`, `/agent/:id`, `/phien/:id`.
* **Turning off each notification type** (SPEC section 12 l.348): **available** (BAT-16, migration
  0026) — a switch per type in `/cai-dat`, all on by default. Only account security
  messages cannot be turned off. The line is kept so you know where it is.
* **Owner account administration on the web: exists, but incomplete.** `/cai-dat` has the open
  sessions, "Sign out everywhere" and change password (§h3). **Not yet available** on the web: resetting
  TOTP and unlocking the account — those two are still `curl` with `TOKEN_CHU` (§h).
* **There is no button to re-issue an agent token** on `/doi-agent`. The Owner will go looking; there is none.
  Use the `curl` in step 17.
* **Every rescue path goes through `TOKEN_CHU`** (§h). So `TOKEN_CHU` is a single point of
  failure: lose it and you cannot reset TOTP, cannot unlock the account. Keep it
  separate from your phone and from the computer you are using.
* **The login route deliberately has no rate limit.** `/v1/dang-nhap` does not go
  through the 600 requests/minute counter; what caps the number of guesses is `so_lan_sai` **of the
  account**. Operational consequence: anyone who knows the Worker address and guesses wrong continuously will get
  you **locked out**, repeatable without limit, and each time you have to run §h2 to unlock. There is
  not yet any blocking by IP or by rate for this route.
* **Changing the owner password**: **available** (BAT-11) — the form on `/cai-dat` (§h3), which calls
  `POST /v1/chu/doi-mat-khau`; it requires the current password **and** the TOTP code, can only be done from
  a web login session, and when done revokes every other session. Remaining limits:
  * You must **be able to log in** to change it. If you **forget** the password there is no reset
    path: calling `POST /v1/chu/thiet-lap` a second time returns `FORBIDDEN` (on purpose — it is not
    a password reset path), and `/v1/chu/dat-lai-totp` only changes TOTP.
  * Changing the password **does** write one Log row and send a security Telegram message
    (BAT-16, `spec-questions.md` #148); this message cannot be turned off.
