# 3. Project organization

The goal: open one page and know what you are holding, what is stuck on you, and not spread yourself thin.

Four ideas combined: **a limit of 3 projects being pushed**, **separating maintenance work from projects**, **the radial tree map**, and a **Hill Chart** for the work block in progress. The detailed behaviour is in [`SPEC.md` section 20](../SPEC.md); a working mockup is at [`sample-data/project-map.html`](../sample-data/project-map.html) (open it in a browser; the data in it is fictional).

## Three tiers: domain → project → large work block

| Tier | What it is | Example |
|---|---|---|
| **Domain** | A group of projects in the same field. Only for grouping and colouring | Store, Course, Content |
| **Project** | Work with a goal and an end date | Online store |
| **Large work block** | The 5 to 7 stages of a project, numbered in order. On Baton it is a ticket with a `khoi_lon` number; its child tickets are the small tasks | 01 Page shell · 02 Catalog · 03 Cart |

The approval rule that goes with these three tiers: **approve from the large block down to the small tasks.** While a block has not been approved for opening by the owner, agents do not break out its child tasks and do not raise its detailed questions.

## Limit of 3 projects being pushed (WIP 3)

At any one time there are **at most 3 projects "being pushed hard"**. Every other project still exists but sits in the queue.

- A **"Đang đẩy n/3"** (Pushing n/3) meter at the top of the page.
- A project being pushed: bold border. A queued project: **dimmed**.
- Turning on a fourth project: Baton **still allows it**, does not block; the meter turns red. The tool reminds, the human decides.
- The number 3 is adjustable in Settings (1 to 10). Do not adjust it before trying 3 for a few weeks.

How it is used in operation: the CoS keeps the list of 3 focus projects; work outside the 3 focus projects moves to "maintenance" or "pending" and is brought up again at each approval session so the owner decides whether to swap places. To bring a new project in, you must state which project it **replaces**.

## Projects and maintenance areas (per PARA)

Not everything you are responsible for is a project.

| | Project | Maintenance area |
|---|---|---|
| Has a goal, has an end date | Yes | No |
| Example | Launch the online store | Monthly bookkeeping, replying to customers, backups |
| On the map | One bubble | **Not on the map**; one chip in the "Khu vực duy trì" (Maintenance areas) strip at the bottom of the page |
| What you need to know | Which stage it is at | Whether it is fine (green dot) or needs watching (yellow dot) |

A project that has gone live and finished its monitoring period moves to maintenance. Turning on the maintenance flag turns off the pushing flag automatically: maintenance work is not "pushed".

## The four states of a project on the map

| Choice | Meaning |
|---|---|
| **Đang đẩy** (Pushing) | One of the 3 projects getting concentrated effort |
| **Hàng chờ** (Queue) | Still running but not getting concentrated effort |
| **Tạm dừng** (Paused) | Agents take no new work in the project |
| **Duy trì** (Maintenance) | Long-term responsibility, no goal |

Each project also has a **priority level of 1 to 5** (5 is the most important, default 3) and a **short name** to keep the bubble compact.

## The radial tree map

The owner at the centre → ring 1 is domains → ring 2 is projects.

| What you see | What it means |
|---|---|
| Bubble **large or small** | Priority level |
| Bubble **colour** | Yellow: has a Needs Owner item waiting · Grey: paused · Green: the rest |
| **Bold border** | Pushing |
| **Dimmed** | Queue |
| **Progress ring** around the bubble + "3/5" | Number of large blocks Done out of the total number of blocks |

Interactions:

- **Click a domain** to collapse or expand it. A collapsed domain becomes one bubble as large as the sum of its child projects' priorities, labelled "+n". Default when the page opens: a domain with no project being pushed is already collapsed.
- Three quick buttons: **Chỉ giữ dự án đang đẩy (Keep only projects being pushed) · Mở hết (Expand all) · Thu gọn hết (Collapse all)**.
- **Click a project** and the project jumps to the centre, the large blocks become the outer ring numbered 01, 02… (green: Done; yellow with bold border: in progress; grey dashed: not reached yet). Click the centre to go back.
- **Never draw three tiers at once.** That is why the map stays readable with a few dozen projects.

To the right of the map are the **project cards split into three lanes**: Pushing · Queue · Paused. Each card shows: Đang làm (In progress), Chờ Chủ (Waiting for Owner), Mốc tới (Next milestone), the holder, the priority.

Why a radial tree and not a mind map or a table: during design four more styles were tried (squares, tiered bars, mind map, circle divided into arcs) and they are still in the mockup for comparison. The radial tree was chosen because bubble area says "which one matters" at once, and collapsing and expanding each domain keeps the picture from getting tangled. The other four styles are deliberately not built.

## Hill Chart

Each large block in progress has a **position on the hill** from 0 to 100, estimated by the project holder and updated at the approval session:

- **Below 50, climbing uphill:** the way to do it is not yet clear, unknowns remain.
- **50 and above, going downhill:** the way is clear, only the doing remains.

This number answers the question that percent complete cannot: is this work still risky? A block that stays at 30 for a long time is a signal that the owner needs to look at it, even though the ticket is still "In progress". Baton does not compute this position by itself.

## Project profile

Each project has one "read first" page so that a new agent only needs to read that page:

- What it is, directory, repo, stack.
- Which files to read first.
- How to deploy and who runs it.
- The project's own forbidden list.
- **Known pitfalls**: an append-only list (date, mistake, how to avoid it).

Before Baton is running, you keep exactly this content in a markdown file. Template: [`templates/cos-ledgers.md`](../templates/cos-ledgers.md).

## Things deliberately not done

Drag and drop to change priority; computing the position on the hill automatically; a separate "epic" level between project and ticket; hard-blocking when the limit of 3 is exceeded.
