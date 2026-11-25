# DESIGN.md — Baton UI design system

**Source of truth for the UI since 29 Oct** (the Owner decided to redo it following a
Linear-style design system). `SPEC.md` is still the single source of truth for
**behavior**; this file only covers **presentation**. If the two disagree ⇒ behavior
follows SPEC, then fix this file.

The real values live in `packages/web/src/kieu.css` (two columns, dark/light); the tables
below and the CSS file must match line by line. Contrast is measured automatically in
`packages/web/test/vo-linear.test.tsx` from `kieu.css` itself.

## Spirit

A daily work tool: compact, quiet, high density, **text first**, little decoration.
No heavy drop shadows, no gradients, no thick borders, no loud colors. **Color is only
there to carry meaning** (status, urgency, error). Application level: LIGHT (internal tool).

**Dark is the primary mode** — the default for anyone who has not chosen (`THEME_MAC_DINH = 'toi'`,
the inline script in `index.html`, the `:root:not([data-theme])` block of `kieu.css` when
there is no JS yet). Light is kept, with the same token roles and inverted values. The theme
button can still pick "Sáng" (Light) / "Tối" (Dark) / "Theo máy" (System).

## Color tokens (role name → dark / light)

Components **do not choose colors**: they only call role names (`bg-nen-lop`, `text-chu-mo`…).

| Token | Role | Dark | Light |
|---|---|---|---|
| `nen` | page background, sidebar | `#0f1011` | `#ffffff` |
| `nen-lop` | raised layer: card, panel, menu, modal; sidebar item hover | `#17181a` | `#fafafa` |
| `nen-noi` | raised layer on hover; selected item | `#1e1f22` | `#f1f1f2` |
| `vien` | 1px border | white 8% | black 9% |
| `chu` | primary text | `#ededef` | `#171717` |
| `chu-mo` | secondary text | `#8a8f98` | `#6e6e6e` |
| `chu-mo-hon` | fainter text: counts, dates, the `›` mark | `#7f838a` | `#737373` |
| `nhan-manh` | **accent color**: primary button background, focus ring | `#5e6ad2` | `#5e6ad2` |
| `nhan-manh-dam` | primary button hover | `#4e5ac0` | `#4e5ac0` |
| `nhan-manh-nen` | pale background of the accent color | `#1f2238` | `#eef0fb` |
| `nhan-manh-chu` | accent-colored text on a background (links) | `#8f98ec` | `#4c58c0` |
| `tren-nhan-manh` | text placed on a `nhan-manh` background | `#ffffff` | `#ffffff` |
| `loi` / `loi-nen` | error | `#eb5757` / `#40181b` | `#b91c1c` / `#fee2e2` |
| `canh` / `canh-nen` | warning | `#f2c94c` / `#3b2a06` | `#a4530a` / `#fef3c7` |
| `tot` | green health, agent working | `#4cb782` | `#047857` |
| `lop-phu` | overlay behind a floating box (BAT-69) — **not inverted** | black 50% | black 50% |

The `neutral-50…950` scale is an inverting **contrast** scale (50 near the background, 900
near the text in both modes) — kept so old code picks up the mode by itself; new code prefers
the semantic tokens above. The six label color pairs (`nhan1…6-nen/-chu`) keep the pair architecture.

### Status and urgency colors

| Token | Used for | Dark | Light |
|---|---|---|---|
| `tt-cho` | "Cần làm" (To do) (`todo`, `backlog`) | `#8a8f98` | `#80848b` |
| `tt-dang-lam` | "Đang làm" (In progress) | `#f2c94c` | `#a87b00` |
| `tt-kiem-chung` | "Chờ kiểm chứng" (Awaiting verification) | `#4ea7fc` | `#2f7fd6` |
| `tt-xong` | "Xong" (Done) (= accent color) | `#5e6ad2` | `#5e6ad2` |
| `tt-huy` | "Huỷ" (Canceled) (`canceled`, `duplicate`) | `#6b6f76` | `#80848b` |
| `gap-khan` | "Cần Chủ" (Needs Owner) — "Khẩn" (Urgent) | `#eb5757` | `#c62828` |
| `gap-hom-nay` | Needs Owner — "Hôm nay" (Today) | `#f2c94c` | `#a87b00` |
| `gap-sau` | Needs Owner — "Để sau" (Later) | `#8a8f98` | `#80848b` |

Project health dot (`vo/cham-suc-song.tsx`, l.71–74): 🟢 `bg-tot`, 🟡 `bg-canh`
(a stalled or errored session is a warning), ⚪ `bg-neutral-300`; not yet computed = empty ring.
No Tailwind color codes (`amber-*`…) at all.

## Status icons (`vo/icon.tsx`)

A 16px round icon **before the title** — the whole row is not filled. The shape differs in
every status, so color is never the only information.

- `IconTrangThai({ trang_thai, nhan?, co? })`:
  - "Cần làm" (To do) = empty gray ring; `backlog` = empty gray ring, **dashed stroke**;
  - "Đang làm" (In progress) = yellow ring, **half** filled;
  - "Chờ kiểm chứng" (Awaiting verification) = blue ring, **three quarters** filled;
  - "Xong" (Done) = filled purple circle with a **tick**;
  - "Huỷ" (Canceled) (and `duplicate`) = filled gray circle with an **x**.
- `ChamMucGap({ muc, nhan? })`: 10px dot — "Khẩn" (Urgent) filled red, "Hôm nay" (Today) filled
  yellow, "Để sau" (Later) **empty** gray.
- ARIA: no `nhan` ⇒ `aria-hidden` (the status text next to it is what gets read);
  with `nhan` ⇒ `role="img"` + `aria-label`. **Do not drop the status text** that SPEC/tests
  need to read just because there is an icon.
- Colors: `LOP_TRANG_THAI`, `LOP_MUC_GAP` in `vo/mau-the.ts`.
- The icon is drawn only when the body carries a status **code** (BAT-67): "Chi tiết phiên"
  (Session Detail) draws the icon before the ticket code when `ticket.trang_thai` is one of the
  seven codes of table 0.1 (unknown code ⇒ no icon); "Báo cáo" (Reports) does **not** draw it —
  the report body only carries the snapshot's `nhan_trang_thai` label, and inferring the code
  from the label on the client is a second derivation.
- **Session status** (the seven codes `running`…`closed`) **has no shape yet**: the session
  status chip is a plain `LOP_CHIP`, except the `error` code ("Lỗi" (Error)), which is the error
  chip `LOP_CHIP_LOI` (BAT-69, `lopChipTrangThaiPhien` in `trang/phien.tsx` — reads the code,
  not the label) — meaning is carried by text color, the label text is still there. Adding a
  shape for it is a new design decision, to be written here before drawing.

### Agent status dot (BAT-66)

`ChamTrangThaiAgent({ trang_thai, nhan? })` — a 10px dot placed **before the agent name**
(the "Agent đang làm gì" (What agents are doing) row of "Tổng quan" (Overview), the "Đội agent"
(Agent Team) row, inside the status chip on a single agent's page). Five statuses of table 0.1,
five **shapes**:

| Status | Shape | Color (`LOP_TRANG_THAI_AGENT`) |
|---|---|---|
| `busy` "Đang làm" (Working) | **filled** dot | `text-tot` |
| `waiting_owner` "Chờ Chủ" (Waiting for Owner) | **ring** with a small dot in the middle | `text-canh` |
| `stalled` "Đứng" (Stalled) | filled **diamond** (the only non-round shape) | `text-loi` (same meaning as the sidebar agent dot) |
| `idle` "Rảnh" (Idle) | **empty ring** | `text-chu-mo` |
| `disabled` "Đã tắt" (Disabled) | ring with a **diagonal slash** | `text-tt-huy` |

- ARIA as for `IconTrangThai`: no `nhan` ⇒ `aria-hidden` (the `nhan_trang_thai` text next to
  it is what gets read — **do not drop the text**); with `nhan` ⇒ `role="img"`.
- Attribute `data-cham-agent`, not `data-trang-thai` (test cases read the status text
  by that attribute).
- The five colors go through the contrast grid (≥ 3:1 on three backgrounds, two modes) in the
  same case as the ticket status colors (`test/vo-linear.test.tsx`).
- The sidebar agent dot (`vo/sidebar.tsx` `ChamAgent`) uses this component since
  BAT-67, **with a label** (`nhan` = `nhan_trang_thai` ⇒ `role="img"`) because the sidebar has
  no status text next to it; the `span` wrapper keeps `data-trang-thai-agent`, **no**
  `title` (BAT-69 removed the duplicate `title`: the label lives only on the dot — `aria-label`,
  and the SVG's `<title>` for the tooltip).

## Accent color rules

The indigo-violet accent color is **only** for: the primary button (`NUT_CHINH`), the focus ring
(global `:focus-visible` in `kieu.css`), links (`text-nhan-manh-chu`), and the "Xong" (Done) status.
**Not** used for decoration (logo, headings, borders, sidebar). The selected sidebar item
uses the raised-layer background, not the accent color. There is no second accent color.

## Typography

- `font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.
  **Inter is used only if already installed on the machine**: no `@font-face`, no CDN, no font
  package (the repo has no Inter package and does not add one).
- Base size **13px** (`body` and `text-sm` = 0.8125rem). `text-xs` = 12px.
- Page title 15–16px, weight 500–600. No giant text.
- **Heading scale** (one constant per level, `vo/lop-nut.ts`; no `text-lg`/`text-xl`
  anywhere in `src` — a test case reads the source):
  - page `h1` — `LOP_TIEU_DE_TRANG`: 16px, weight 600, primary text. Every page, including
    the ticket title on the detail page, the login page, the placeholder, "Không có trang này" (No such page);
  - section/block `h2` — `LOP_TIEU_DE_MUC`: 13px, weight 600 (differs from normal text only
    in weight). Floating box (modal) titles are also at this level;
  - small `h3` inside a block — `LOP_TIEU_DE_NHO`: 12px, weight 500, secondary text;
  - group header with a count (grouped by status, by day): name in weight 600 + count in
    `chu-mo-hon` `tabular-nums` normal weight, as in the ticket list.
- Secondary text in a row/card: `LOP_CHU_PHU` (12px `chu-mo`); dates, counts:
  `LOP_CHU_MO_HON` (12px `chu-mo-hon`, `tabular-nums`). Timestamps (`Moc`)
  are always `chu-mo-hon`.
- Text links: `LOP_LIEN_KET` (`nhan-manh-chu`, underlined on hover). The name of a
  clickable entity (project name, agent name in a row) is primary text, underlined
  on hover — the whole name column is not painted in the accent color.
- Ticket code / T-number (`SAI-74`, `T-105`): the `ma-ticket` utility — 12px, gray
  (`chu-mo`), `tabular-nums`.
- **Markdown** (`markdown.tsx` — "Cần Chủ" (Needs Owner) context, ticket comments; BAT-69):
  inline code `LOP_MD_MA` and code block `LOP_MD_CODE` = `bg-nen-noi` + `border
  border-vien` + `text-chu` (same convention as the monospace text box inside a box; `nen-noi` is
  one step above both `nen` and `nen-lop`, so it is readable whether the Markdown sits on the page
  background or on a card; `chu`/`nen-noi` is measured by the pair grid in both modes). Internal /
  external links `LOP_MD_LIEN` = `LOP_LIEN_KET` **+ permanent `underline`**: links sit
  inside a paragraph, and telling them apart by color alone is weak (color-blind readers), so
  the underline is a second signal — a justified exception to "underlined on hover".
  Unsafe links (no `<a>`) use `chu-mo` text. Lists have no color of their own.

## Radius, spacing, motion

- Radius: **6px** for buttons, inputs, chips (`rounded` — `--radius: 6px`); **8px** for
  cards, menus, modals (`rounded-lg`).
- Spacing in **4px** steps (Tailwind scale: `1` = 4px).
- Motion **100–150ms** (`--default-transition-duration: 120ms`), only for hover
  and opening menus. Shadow: only a light `shadow-lg` for floating panels.

## Shell layout

- Fixed left sidebar **240px** (`w-60`), `nen` background, separated from the main area by a
  faint border. Items are 28px tall (`h-7`), 16px icon + text. Selected = `nen-noi`; hover =
  `nen-lop`. Groups ("Dự án" (Projects), "Đội agent" (Agent Team)) have a small gray title and are collapsible.
- Thin top bar (40px): breadcrumb (Project › Ticket) → action buttons on the right
  (`data-o="thanh-tren-hanh-dong"`, light/dark button last). **Tab-pill filters
  do not go on the top bar**: they sit in the page's own title row (ticket
  list) or at the head of a block ("Vừa xong" (Just done) 24 hours / 7 days). Moving them to the
  top bar needs a portal/context from page to shell and changes the Tab order — that is, a behavior
  change; BAT-61 removed the old empty `thanh-tren-loc` slot.
- The workspace-name button at the top of the sidebar opens a menu ⇒ it has a **small down arrow**
  (12px, `chu-mo-hon`, `aria-hidden`) at the end of the button. Any button that opens a menu has this mark.
- Shared classes (`vo/lop-nut.ts`): `NUT_CHINH`, `NUT_PHU`, `LOP_NUT_ICON` (icon-only
  24px button in a title row, e.g. the `+` at the head of the "Cần làm" (To do) column and the Backlog column), `NUT_MO*`,
  `LOP_O_NHAP`, `LOP_CHIP`, `LOP_CHIP_CANH`, `LOP_CHIP_LOI`, `LOP_KBD`,
  `LOP_TAB_PILL*`, `LOP_MUC_MENU`, `LOP_TAM_NOI`, and the page classes in the section below.

### Chips

- `LOP_CHIP`: 6px radius, faint border, 12px, secondary text, no background.
- **Warning chip** `LOP_CHIP_CANH` (the "Cần chú ý" (Needs attention) reason, sessions that are "Đứng" (Stalled) and "Chờ người
  giao quá hạn" (Waiting for assigner, overdue), ticket flags and the two l.300 flags of the profile, the type label in the "Rủi ro và
  lệch" (Risks and deviations) part of Reports, "đã có quyết định mới" (a newer decision exists) in the Log — BAT-68) and **error chip**
  `LOP_CHIP_LOI` (agent "Đã tắt" (Disabled), "Token đã thu hồi" (Token revoked) — BAT-68; session status
  chip for the `error` code "Lỗi" (Error) in Session Detail — BAT-69): **same
  shape** as `LOP_CHIP`, only the text color differs (`canh` / `loi`). **No background fill** (`bg-canh-nen`, `bg-loi-nen`): meaning is carried
  by colored text. There is no new background–text pair; `canh`/`loi` on the three backgrounds have been measured
  ≥ 4.5:1 in both modes (the "faint text inherits the background" case of `vo-linear.test.tsx`).
- The chip convention applies to **chips**; where a session status is a **link** (the session
  row of the agent page, a reason that has a session in "Needs attention" on the Overview), keep
  `LOP_LIEN_KET` — link color is an accent color rule, painting a link red breaks it.

### Floating boxes

- Box panel `LOP_TAM_NOI` (8px radius, `nen-lop`, faint border, `shadow-lg`); title
  `LOP_TIEU_DE_MUC`; the frame does not disable the outline (section "Keyboard first").
- **Overlay** behind the box: `absolute inset-0 bg-lop-phu` on all seven boxes (the `?` key
  sheet, "Tạo việc" (Create task), "Giao việc" (Assign work), command menu, slide-out menu, bulk-apply confirmation, Token
  agent). The `lop-phu` token (BAT-69) = black 50% in **both** modes — the same value as the
  old `bg-black/50`, no visual change: the overlay is **not inverted** by mode so it
  darkens the page in both dark and light; `bg-neutral-950/50` would invert into a near-white overlay
  in dark mode. It is not the text/background color of any pair, so the contrast grid does not measure
  it (the value has alpha, the grid only reads `#hex`). New boxes use `bg-lop-phu`, not a color
  code.
- Monospace text box inside a box (the new token in Token agent, BAT-68): `bg-nen-noi`
  (one step above the `nen-lop` panel) + `border border-vien` + `text-chu`, `break-all`
  — semantic tokens, not the `neutral-*` scale.

## Pages

- Main area below the top bar: `LOP_VUNG_TRANG` — 16px margin (24px from `sm`), blocks
  24px apart, `min-w-0` (no horizontal scroll at 375px). Every page, including while
  loading.
- Title row: `LOP_HANG_TIEU_DE` — `h1` → refresh mark → the page's buttons/tabs.
  The sub-line (status, role, code, flags) sits **below** the `h1`, not above.
- Detail pages (agent, session, profile): `h1` + one row of chips (`LOP_CHIP`:
  status, role) + one row of secondary text (timestamps, thresholds), then the `h2` blocks.
- **Block head** (BAT-66): each block is a `section` with `aria-label` + `data-khoi`, the block
  head is a `<header>` `LOP_DAU_KHOI` (`min-h-7`, vertically centered, space-between, `flex-wrap`
  since BAT-67) holding the `h2` `LOP_TIEU_DE_MUC` on the left and the extras (tab-pill, link, the
  "Sửa hồ sơ" (Edit profile) button) on the right — at 375px the extras wrap to the line below the title instead of pushing
  the block head to overflow horizontally. Shared component `vo/khoi.tsx` (leaf module, imports only
  `lop-nut`) — "Tổng quan" (Overview), "Đội agent" (Agent Team), agent page (BAT-66), "Chi tiết phiên" (Session Detail), "Hồ sơ
  dự án" (Project Profile) (BAT-67), the "Luật chung" (Common Rules) block of "Bản đồ dự án" (Project Map), the four "Cài đặt" (Settings) sections (BAT-68) use
  it. The parts of "Báo cáo" (Reports) are `h3` inside the `article` of one report (which already has an `h2`, the
  report name), so they do not use `Khoi`. Extras with several items (timestamp + button of Common
  Rules) are wrapped in a `div` `flex flex-wrap min-w-0`; the `h2` carries only the block name.
- Text-column pages (Settings): max width `max-w-3xl`; sections are separated by a
  **faint top border** (`border-t border-vien pt-5`), no raised card; explanatory sentences
  in 13px secondary text. The border sits on the `div` wrapper around `Khoi` (BAT-68, `MucCaiDat`).
- Inputs in a page are always `LOP_O_NHAP`; a button that is not the section's primary action
  is `NUT_PHU`. One block (`h2`/`h3`) has only **one** `NUT_CHINH` (e.g. "Lưu" (Save),
  "Gửi" (Send), "Đăng nhập" (Log in)); a button repeated per row (e.g. "Tải" (Download) for each backup) is
  `NUT_PHU`.
- Forms that open inside a page (writing to the Log, adding a pitfall, Common Rules, the focus field,
  login): a raised-layer card (`LOP_THE` + `p-3`/`p-4`).

## Stat cards

- The number cell sits **inside** a `LOP_THE` (`nen-lop` background, `vien` border, 8px radius,
  12px padding). The number `LOP_SO_LIEU` (16px weight 600, `tabular-nums`) is **on top**; the label
  `LOP_NHAN_SO_LIEU` (12px secondary text) below. No background color based on the number; meaning
  (urgency) is carried by a `ChamMucGap` dot next to the label. There is no standalone number card yet, so there is
  no constant for it (BAT-62 removed `LOP_THE_SO_LIEU`); a page that needs one adds it back in
  `vo/lop-nut.ts` and records it here.
- The "Cần Chủ" (Needs Owner) cell of the Overview is this card: three number cells by level (3-column grid at every size),
  a "Xem tất cả" (View all) link in link color, one `NUT_CHINH`.

## Tables and lists

- **Row list** (`LOP_DS_DONG` + `LOP_DONG`): 8px-radius frame with a faint border, rows
  separated by faint borders (`divide-vien`), no background; rows ~36px (`min-h-9`), 13px
  text, hover `nen-lop`. **The whole row is not filled** by status — meaning is carried by
  icon/dot/chip. Extras (timestamp, person) are **pushed right** (`ml-auto`), gray. A row that needs
  to wrap at 375px adds `flex-wrap`, it does not drop the frame.
- A multi-part row that needs to **stack vertically** at 375px (the Projects row of "Tổng quan" (Overview)):
  `LOP_DONG_XEP_DOC` — a column below `sm`, a single `LOP_DONG` row from `sm`. Do not combine
  `LOP_DONG` + an overriding class (`items-*` on the same property, CSS order decides which class wins).
- Agent row (Overview, "Đội agent" (Agent Team)): `flex-wrap`; status dot → name
  (`truncate`, `title` = full name) → role `LOP_CHU_PHU` → status → model
  `LOP_CHU_MO_HON` → timestamp pushed right. To keep rows column-aligned at wide sizes, the name has a
  fixed width — Overview **only from `sm`** (`sm:w-32`, status text
  `sm:min-w-16`, not truncated), because the row also has the held-work column (`basis-40`, wraps
  at 375px); Agent Team `w-40` (short row, already `flex-wrap`). A fixed width without the
  `sm:` prefix on a row without `flex-wrap` is a 375px overflow bug (BAT-66).
- "Vừa xong" (Just done) row: `IconTrangThai` Done (`aria-hidden`) before the ticket code.
- Multi-tier rows ("Nhật ký" (Log), "Lỗi đã gặp" (Known pitfalls), "Quyết định mới" (New decisions) of Reports): same frame,
  each row `px-3 py-2.5`, top line in secondary text (timestamp · who · project), below it the content
  in primary text. Constant `LOP_DONG_NHIEU_TANG` (BAT-67, has `min-w-0`); the Log and the Telegram
  switches in "Cài đặt" (Settings) use it since BAT-68.
- **Long free text in a row** (ticket title, activity content, error, risk
  detail — BAT-67): `min-w-0 break-words` (tool names, unbroken ids: `break-all`), so
  an unbroken string (path, command) wraps at 375px. Single-line text with a fixed
  column (the editor in "Lịch sử" (History)) uses `truncate` + `title` = full text. A row with
  a fixed-width column (step number `w-5`) adds `flex-wrap`.
- Reports (BAT-67): each part is a `LOP_DS_DONG`, rows `flex-wrap` + `LOP_DONG`: code
  `ma-ticket` → title in primary text → extras in secondary text; an empty part is still the
  `LOP_CAU_CHO` sentence from SPEC; a list with no items does not build an empty frame.
- **Table** `<table>` (Project Map, rounds, permissions): `LOP_THE` frame +
  `overflow-x-auto` (l.411); `LOP_BANG`; column head `LOP_DAU_COT` (12px secondary text
  weight 500, faint bottom border); cell `LOP_O_BANG` (padding `px-3 py-2`, faint bottom border);
  `tbody` `LOP_THAN_BANG` drops the last row's border; row hover `nen-noi`
  (`LOP_DONG_BANG` — the table sits on a raised layer so hover goes one step up).
- Ticket code in a row/table: the `ma-ticket` utility, primary text on hover.
- Standalone card ("Việc đang chạy" (Running work)): `LOP_THE` + `p-2.5`.

## Empty / error / loading states

- **One style for every page**: `LOP_CAU_CHO` (13px `chu-mo`) for loading and empty,
  `LOP_CAU_LOI` (13px `loi`) for errors. The sentence stands **at the top of the content area** (below
  the page/block title), not centered on screen, no icon, no frame.
- The role stays where the caller sets it: loading `role="status"`, error `role="alert"`,
  empty no role. The text is the sentence from SPEC/the server, unchanged.
- Errors print the server's sentence **verbatim** (section 13 l.379) — only the color changes, not the text.

## Keyboard first

Keep every shortcut (SPEC l.413, l.414, l.416). Key hints (small gray `<kbd>`,
`LOP_KBD`) appear in menus/tooltips where a key already exists: the command menu (`⌘/Ctrl K`) has
`G T`/`G O`/`G N` next to the matching commands and the box footer `↑ ↓ · Enter · Esc`; the `?` key
sheet; the titles of the "Tìm" (Search) / "Tạo việc" (Create task) buttons.

**Visible focus** (BAT-67): a box frame that receives focus (the `tabIndex=-1` of a dialog,
the slide-out menu, the right pane) **must not disable the outline** (`outline-none`,
`focus:outline-none`) — the shared `:focus-visible` ring of `kieu.css` (2px accent color)
must show when opened by keyboard. Elements **flush against** the viewport edge (`inset-0`,
`inset-y-0 right-0`) use the negative offset `focus-visible:-outline-offset-2` so the ring is drawn
inward. For a frame that covers the whole screen and is fully hidden by its children (the slide-out menu in `App.tsx`: dim layer + sidebar
panel), the frame's own ring cannot be seen at any offset ⇒ the frame is a
`group`, and the ring is drawn on the visible panel with `group-focus-visible:outline-2
group-focus-visible:-outline-offset-2 group-focus-visible:outline-nhan-manh` (same
stroke, same color as the shared ring). **The only exception**: the search input of the command menu keeps
`focus-visible:outline-none` — it is the box's only input, always receives focus on open, and the
blinking caret is always visible; the input is flush against the top/left/right edges of the 8px-radius `overflow-hidden` frame, so
a positive-offset ring is clipped on three sides and a negative offset is cut into by the two top rounded corners. jsdom
does not paint, so the test cases only pin the classes; seeing it with one's own eyes is the owner's manual test.

## Completion level per page

Two levels:
- **Thorough** — checked against **every section** of this file: status icons/dots, rows
  and stat cells, empty/error/loading, hover/focus, both modes.
- **Shared tokens/constants only** — BAT-61 moved it to shared tokens and constants (headings,
  page area, waiting/error sentences, buttons, inputs, tables) but it has **not been reviewed section by section**.

| Page / area | Level | Notes |
|---|---|---|
| Shell: sidebar, top bar, command menu, toast | Thorough | BAT-60/61. BAT-67: sidebar agent dot uses `ChamTrangThaiAgent`; the command menu frame, the `?` key sheet, the slide-out menu do not disable the outline. BAT-69: title of the `?` key sheet and of the "Giao việc" (Assign work) box `LOP_TIEU_DE_MUC`; sidebar agent dot drops the duplicate `title` (one label source); overlay of every box `bg-lop-phu`; Markdown review finished (section "Typography") |
| Ticket list | Thorough | BAT-60. BAT-67: right pane and bulk-apply confirmation box do not disable the outline; confirmation box title `LOP_TIEU_DE_MUC` |
| Board | Thorough | BAT-60, BAT-64 (6 columns) |
| Ticket detail | Thorough | BAT-60. BAT-67: flag chips `LOP_CHIP_CANH` (dropped `bg-canh-nen`) |
| "Cần Chủ" (Needs Owner) | Thorough | BAT-60 |
| "Tổng quan" (Overview) | Thorough | BAT-66 |
| "Đội agent" (Agent Team) + single agent page | Thorough | BAT-66 |
| "Chi tiết phiên" (Session Detail) | Thorough | BAT-67: `vo/khoi.tsx`; "Đứng" (Stalled)/"Chờ người giao quá hạn" (Waiting for assigner, overdue) `LOP_CHIP_CANH`; status icon before the ticket code; session status chip `LOP_CHIP` without a shape (no shape convention for session status yet). BAT-69: session status `error` ("Lỗi" (Error)) `LOP_CHIP_LOI` |
| "Báo cáo" (Reports) | Thorough | BAT-67: every part `LOP_DS_DONG` + `LOP_DONG` `flex-wrap`; "Quyết định mới" (New decisions) as multi-tier rows; risk labels `LOP_CHIP_CANH`; no status icon (the body has no status code) |
| "Hồ sơ dự án" (Project Profile) | Thorough | BAT-67: `vo/khoi.tsx` (block head `flex-wrap`); flag chips `LOP_CHIP_CANH`; "Lỗi đã gặp" (Known pitfalls) `LOP_DONG_NHIEU_TANG`. BAT-68: `MucVan` (nine items) `min-w-0 break-words` |
| "Nhật ký" (Log) | Thorough | BAT-68: rows `LOP_DONG_NHIEU_TANG`; "đã có quyết định mới" (a newer decision exists) `LOP_CHIP_CANH` (dropped the bare `canh` text); decision / why / who / project / basis `min-w-0` + wrapping; filter input `LOP_O_NHAP` + `max-w-full`, filter row `flex-wrap` |
| "Bản đồ dự án" (Project Map) | Thorough | BAT-68: "Luật chung" (Common Rules) uses `vo/khoi.tsx` (`h2` now holds only the block name; timestamp + button in the extras), content and edit form inside `LOP_THE`; `MucVan` can shrink. The health dot keeps the convention (`bg-tot`/`bg-canh`/`bg-neutral-300`, `role="img"` with a label) — DESIGN has no separate **shape** convention for the three levels yet, so none is added. The sentence "Còn N dự án…" (N more projects…) keeps the `canh` text (a warning sentence, not a label; there is no warning-sentence convention yet) |
| Token agent (box) | Thorough | BAT-68: token box `bg-nen-noi` + faint border + `text-chu`; "Token đã thu hồi" (Token revoked) `LOP_CHIP_LOI`; overlay `bg-lop-phu` (BAT-69, the token of the shared convention for every box — section "Floating boxes"). The box frame does not disable the outline (BAT-67) |
| "Cài đặt" (Settings) | Thorough | BAT-68: the four sections are `vo/khoi.tsx` inside a faint-top-border wrapper (`MucCaiDat`); backups and sessions `flex-wrap LOP_DONG`; Telegram switches `LOP_DONG_NHIEU_TANG`; logout confirmation frame `LOP_THE`; device name / label / lock reason can wrap. "Đang tải…" (Loading…) stays without a `role` (changing the role is changing behavior) |
| "Đăng nhập" (Login) | Thorough | BAT-68 reviewed, **no code change**: `h1` `LOP_TIEU_DE_TRANG`, card `LOP_THE`, two inputs `LOP_O_NHAP`, one `NUT_CHINH`, error `LOP_CAU_LOI` `role="alert"`, column `w-full max-w-sm` — already correct; pinned by the BAT-68 case |
| "Giữ chỗ" (Placeholder) | Thorough | BAT-68 reviewed, no change: `LOP_VUNG_TRANG`, `h1` `LOP_TIEU_DE_TRANG`, sentence `LOP_CAU_CHO` — no section deviates |
| "Không có trang này" (No such page) | Thorough | BAT-68 reviewed, no change: `LOP_VUNG_TRANG` + one `h1` `LOP_TIEU_DE_TRANG` — no section deviates |

**Every page / area is at the "Thorough" level** (BAT-68); BAT-69 closed the "Remaining:" part of
the Shell row, finished reviewing the inside of `Markdown` (section "Typography"), added the overlay token and the
"Lỗi" (Error) session chip. The only open work is the two new design decisions recorded above: **a shape
for session status** and **a warning-sentence convention**. (The separate command block of "Cần Chủ" (Needs Owner)
— `pre` `bg-neutral-100 text-neutral-900` in `trang/can-chu.tsx`, outside Markdown —
has not been moved to tokens; that pair has been measured by the grid in both modes.)

## Contrast notes (why some values differ from the description)

- `chu-mo-hon` dark = `#7f838a`, **not** the `#62666d` of the description: `#62666d` only
  reaches ~3.3:1 on the page background, while counts and dates are still text the owner needs to read. Raised to
  ≥ 4.5:1 on `nen`/`nen-lop` (≥ 3:1 on the hover layer) in the spirit of "readable
  text"; the hierarchy with `chu-mo` remains (one step darker).
- `nhan-manh-chu` dark is lighter than `nhan-manh`: `#5e6ad2` on a dark background is only ~4:1 —
  enough for the focus ring (3:1), not enough for link text (4.5:1).
- The "Cần Chủ" (Needs Owner) badge keeps strong red with white text: it carries meaning and reads well on both backgrounds.
