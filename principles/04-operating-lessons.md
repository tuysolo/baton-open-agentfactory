# 4. Operating lessons

The rules in [document 2](02-agent-organization.md) do not come from theory. Each rule below was paid for with at least one failure during two months of operating the original system. Project names and private details have been removed; what is kept is **what happened → rule from now on**.

You should keep a ledger like this of your own (template: [`templates/cos-ledgers.md`](../templates/cos-ledgers.md)), append-only with no deletions, and have the CoS read it at the start of every session.

## Assigning work

| What happened | Rule from now on |
|---|---|
| The CoS assigned about 10 rounds to a Manager without creating tickets. The owner looked at the board, saw "Đang làm" (In progress) empty, and thought the project was stalled | Every assignment has a ticket in the In progress status |
| The merge command failed but the CoS still assigned the next piece of work. The Manager created a branch from the old version, which had to be thrown away | Confirm the merge succeeded (see the new commit) before assigning the next one |
| Edited the prompt and ran the assign command at the same time; the edit failed but the assign command still went out, the Manager ran the old prompt | Do not run two dependent things in parallel |
| The CoS wrote "the owner has granted permission" in a prompt when the owner had not said so | Never grant permission in the owner's name |
| Queued work B behind work A just because "same repo" | Independent work in the same repo runs in parallel, each with its own git worktree and its own branch |
| Two Managers running in parallel both picked the same migration number | When assigning two parallel pieces of work that have migrations, the CoS hands each side its number in advance |
| Assigned work touching shared data without looking at the real data. The Manager only saw the files in the repo, wrote the wrong rule, and the deployed version hid a feature that was in use | Before assigning work that touches shared data, the CoS reads the real data (read-only) and puts the figures into the prompt |
| A Manager finished its round then sat idle for nearly a day because the CoS was busy with other work | Each time a Manager finishes, immediately review the approved work still open for that project and assign the next one in the same round |
| A speed-optimization round was completed without being any faster | Optimization work must record the measurement before, the threshold to reach and how to measure in the "Definition of done" |

## Processes running unattended

| What happened | Rule from now on |
|---|---|
| The CoS session's background command was cut off after about 30 minutes, the Manager died midway | Run the Manager fully detached from the CoS session (its own session), write a marker file when done |
| The CoS session restarted and took the Manager down with it | Separate the process group; at the start of every CoS session check which Managers are still alive |
| The Manager ended with a question, a whole hour lost waiting on nothing | The prompt states in advance: if there is a question, pick the safer option, record the reason, continue |
| The command calling a Worker was cancelled, the Manager stopped to ask | Call again at most 3 times; if still cancelled, the Manager does the small part itself and states clearly "Manager did it, Worker was cancelled" |
| The Manager called a builder in the background then exited with code 0 while the builder was not finished. The system submitted a wrong "done" by itself | Do not trust the exit code: read the report, the reviewer's last-round verdict and `git status` before treating it as done |
| The builder ran an 11-minute test suite in the background then reported "waiting"; the Manager ended the round | Run nothing in the background at any level; this sentence must be copied into every Worker's brief |
| The machine went to sleep mid-session, the code was committed but the report was missing | The Manager writes the report right after the commit; running overnight needs a machine that does not sleep |
| Tests left more than 200 orphan processes, the machine was overloaded, tests went falsely red | The assign script cleans up orphan processes by itself after every round; tests run sequentially |
| A Worker had a command blocked, so it wrote a script to route around it | The prompt forbids workarounds; the CoS checks for unfamiliar uncommitted files at every acceptance check |
| A Worker left temporary files in the repo despite being told not to | Temporary files may only live outside the repo; the Manager runs `git status --short --ignored` before reporting done |

## Acceptance and merge

| What happened | Rule from now on |
|---|---|
| The CoS merged before reading the reviewer's verdict; the last round said NEEDS FIXES | Read the reviewer's **last-round** verdict before merging |
| Ran test, build, lint, typecheck in parallel while another Manager was also running; tests went falsely red | Run the test suite alone, and only then build and lint |
| Merged a branch that added a library, the main directory had not installed it; the deploy broke at the build step | A merge that changes `package.json` is followed by a reinstall right after the merge |
| The owner asked "what work is left on the project"; the CoS answered from memory and was wrong | The question "what work is left" is always checked against the spec, the plan, the ticket board and the code before answering |
| Reported "done" when only 1 of 5 screens had been built | When reporting done, state clearly the part NOT done and which phase it belongs to |

## Deploy

| What happened | Rule from now on |
|---|---|
| The deploy script had `\|\| true` so the error was swallowed and it still printed "✓ done" | A deploy script must not swallow errors: compare the version id before and after, and stop if there is no new version |
| The local build passed but a new route returned 500 on the real infrastructure | After deploying, check **each new route** immediately; a passing build is not enough |
| The first deploy of a new system made the owner run the script 7 times, because of things that only break on real infrastructure | Before the first deploy: simulate the places where the infrastructure differs from local, read the platform's limits, the script must be re-runnable and retry by itself, and reproduce the error before asking for a re-run |
| Gave the owner the deploy command while a Manager was switching branches in the same directory | Deploy runs from a separate worktree of the main branch; the Manager works in a different worktree |
| A domain change edited only one config file and forgot the other; the value was frozen at build time | When changing configuration, review every place it appears, and after deploying check the real page instead of reading the configuration |
| Scheduled a flag to turn itself off after 1 hour using `sleep`; the machine slept, the flag stayed on for 2.5 hours | Timers rely on real time (check the clock every minute), not on the duration of `sleep` |
| A script backed up a file containing secrets right inside the repo | Backups of files containing secrets are always placed outside the repo |

## Work that needs the owner

| What happened | Rule from now on |
|---|---|
| The deploy command was only said in chat. The owner opened the list of things needing them, saw it empty, did nothing; the system stalled | Work that needs the owner is written into the Needs Owner place the moment it arises |
| The CoS waited for the owner to finish deploying before assigning the next work | Work that does not depend on the deploy is assigned in parallel |
| Left "chỉ để biết" (FYI only) items mixed into the waiting list | The waiting list contains only work the owner must approve, decide or do |
| Combined a command to run and a question to decide into one item; the command was run, the item closed, the question disappeared | Split into two items: one for the command, one for the decision |
| An item was closed while it still had unanswered questions, the CoS only noted it in a separate file | Immediately create a new item containing only the remaining questions |
| Work that had to be done was created with the "FYI only" type; the owner pressed read, the item closed, the work was untouched | "FYI only" is only for news to be aware of |
| Asked the owner to turn on a flag for two tickets, giving only the codes. The owner mistakenly turned it on for two other tickets that had the same numbers in their titles | When asking for an action on a ticket, give code + title + status, and check again after the owner reports done |
| The owner answered three items while the wait loop was off; the CoS saw only one | At every session start and every time the wait loop exits, re-read **every** open item |
| Gave the owner options based only on the wording in the spec, while the feature already existed in the code | Check against the real code before offering options; the spec may be outdated |
| Broke out child tasks and asked detailed questions about a large block that had not been approved, taking a draft file as the basis | Approve from the large block down; a draft file is not a basis |
| Proposed a vendor as if never used before, while the account had already been rejected by them earlier | Before proposing a vendor, look up your own history with them |

## Permissions and commands

| What happened | Rule from now on |
|---|---|
| 186 times the owner had to click approve in 17 hours, 92% because of compound commands (`cd … &&`, pipes, variables, loops) | Each command is a single command, with absolute paths; repeated work goes through fixed scripts |
| Tried a "renew token" command using the owner's login session; the token rotated, the owner was logged out | A command with side effects on a session or account only runs after the consequence has been stated in advance; treat "refresh" as a write command |
| Created a temporary file with a name already in use, overwriting an old context file | Check whether the name already exists before creating; include the date in the name |
