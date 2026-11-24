/**
 * Hợp đồng của một lệnh CLI, và **sổ đăng ký** các lệnh.
 *
 * Một lệnh là: một khai báo tham số (`KhaiLenh`) + một hàm `chay` trả về
 * `DuLieuRa`. Lệnh **không** nhận `MoiTruongCli`, nên nó **không in được gì** —
 * đó là cách `--json` của mọi lệnh được bảo đảm bằng cấu trúc (xem `in-ra.ts`).
 *
 * Lượt 1 của phần 5 có bốn lệnh **đọc** của SPEC mục 13: `whoami` (d.359),
 * `show` (d.372), `list` (d.373), `profile` (d.378).
 *
 * Lượt 4 thêm **vòng đời lượt giao**: `tasks` (d.360), `claim` (d.361),
 * `heartbeat` (d.362), `log` (d.363), `plan` (d.364), `submit` (d.366),
 * `verdict` (d.369), `reply` (d.370 + 19.12 câu 2).
 *
 * Lượt 5 thêm **ticket và bằng chứng**: `create` (d.367), `assign` (d.368),
 * `status` (d.371, luật mục 4), `comment` (d.374), `evidence` (d.365 + mục 7).
 * Lượt 6 khép bảng d.357–378: `ask` (d.375), `result` (d.376 + 19.9 d.543 —
 * lệnh **duy nhất** phát mã thoát 4), `decision` (d.377).
 * BAT-43 (T-50 = A, `cau-hoi-spec.md` #168) thêm `link` và cờ `assign --review`.
 * BAT-56 (#83) thêm `cancel` (huỷ lượt) và cờ `--luot` cho `heartbeat`/`log`/`plan`.
 * Bản đồ L1 (SPEC 20.1) thêm `project set` và `ticket set` — hai lệnh `project`,
 * `ticket` với thao tác `set` ở tham số vị trí đầu.
 */

import type { CauHinhClient } from '@baton/client';
import type { ChayGit } from './git-cuc-bo.js';
import type { DuLieuRa } from './in-ra.js';
import type { KhaiLenh, ThamSoDaPhanTich } from './phan-tich.js';
import { LENH_WHOAMI } from './lenh/whoami.js';
import { LENH_SHOW } from './lenh/show.js';
import { LENH_LIST } from './lenh/list.js';
import { LENH_PROFILE } from './lenh/profile.js';
import { LENH_RULES } from './lenh/rules.js';
import { LENH_TASKS } from './lenh/tasks.js';
import { LENH_CLAIM } from './lenh/claim.js';
import { LENH_HEARTBEAT } from './lenh/heartbeat.js';
import { LENH_LOG } from './lenh/log.js';
import { LENH_PLAN } from './lenh/plan.js';
import { LENH_SUBMIT } from './lenh/submit.js';
import { LENH_VERDICT } from './lenh/verdict.js';
import { LENH_REPLY } from './lenh/reply.js';
import { LENH_CREATE } from './lenh/create.js';
import { LENH_ASSIGN } from './lenh/assign.js';
import { LENH_STATUS } from './lenh/status.js';
import { LENH_COMMENT } from './lenh/comment.js';
import { LENH_EVIDENCE } from './lenh/evidence.js';
import { LENH_ASK } from './lenh/ask.js';
import { LENH_RESULT } from './lenh/result.js';
import { LENH_DECISION } from './lenh/decision.js';
import { LENH_EXPORT } from './lenh/export.js';
import { LENH_LINK } from './lenh/link.js';
import { LENH_CANCEL } from './lenh/cancel.js';
import { LENH_PROJECT } from './lenh/project.js';
import { LENH_TICKET } from './lenh/ticket.js';

export interface BoiCanhLenh {
  cauHinh: CauHinhClient;
  /**
   * Đọc một file người gõ chỉ tên (`plan`, `submit`) — đã bọc sẵn lỗi thành
   * `INVALID_INPUT` kèm đường dẫn. Xem `docFileChu` ở `moi-truong.ts`.
   */
  docFile: (duong: string) => Promise<string>;
  /**
   * Ghi một file **mới** (`baton export`) — đã bọc sẵn lỗi thành `INVALID_INPUT`
   * kèm đường dẫn. Xem `ghiFileChu` ở `moi-truong.ts`.
   */
  ghiFile: (duong: string, noi_dung: string) => Promise<void>;
  /**
   * Chạy một lệnh `git` **chỉ đọc**, hoặc `undefined` khi môi trường chạy không
   * có `git` (vd test, hay một máy không cài git). Xem `git-cuc-bo.ts`.
   */
  chayGit?: ChayGit | undefined;
  /**
   * Giá trị biến môi trường `BATON_LUOT` (đã đọc qua `luotTuMoiTruong` của
   * `moi-truong.ts`), hoặc `undefined`. Chỉ `heartbeat`, `log`, `plan` dùng — làm
   * lượt mặc định khi không gõ `--luot` (BAT-56, `phien-hien-tai.ts`).
   */
  luotMacDinh?: string | undefined;
}

export interface LenhCli {
  readonly khai: KhaiLenh;
  /**
   * **Chỉ có ở CLI, KHÔNG thành công cụ MCP.** Hiện chỉ `export` (BAT-8, mục 15
   * d.429): lệnh của **chủ**, cần ghi file trên máy người chạy — một máy chủ MCP
   * phục vụ agent không có lý do gì mang nó. Xem `SO_LENH_MCP` ở `mcp/cong-cu.ts`.
   */
  readonly chi_cli?: true;
  readonly chay: (bc: BoiCanhLenh, ts: ThamSoDaPhanTich) => Promise<DuLieuRa>;
}

export const SO_LENH: Readonly<Record<string, LenhCli>> = {
  [LENH_WHOAMI.khai.ten]: LENH_WHOAMI,
  [LENH_SHOW.khai.ten]: LENH_SHOW,
  [LENH_LIST.khai.ten]: LENH_LIST,
  [LENH_PROFILE.khai.ten]: LENH_PROFILE,
  // Mục 9 d.301 — "Agent đọc được qua CLI hoặc MCP"; MCP sinh từ sổ này.
  [LENH_RULES.khai.ten]: LENH_RULES,
  [LENH_TASKS.khai.ten]: LENH_TASKS,
  [LENH_CLAIM.khai.ten]: LENH_CLAIM,
  [LENH_HEARTBEAT.khai.ten]: LENH_HEARTBEAT,
  [LENH_LOG.khai.ten]: LENH_LOG,
  [LENH_PLAN.khai.ten]: LENH_PLAN,
  [LENH_SUBMIT.khai.ten]: LENH_SUBMIT,
  [LENH_VERDICT.khai.ten]: LENH_VERDICT,
  [LENH_REPLY.khai.ten]: LENH_REPLY,
  [LENH_CREATE.khai.ten]: LENH_CREATE,
  [LENH_ASSIGN.khai.ten]: LENH_ASSIGN,
  [LENH_STATUS.khai.ten]: LENH_STATUS,
  [LENH_COMMENT.khai.ten]: LENH_COMMENT,
  [LENH_EVIDENCE.khai.ten]: LENH_EVIDENCE,
  [LENH_ASK.khai.ten]: LENH_ASK,
  [LENH_RESULT.khai.ten]: LENH_RESULT,
  [LENH_DECISION.khai.ten]: LENH_DECISION,
  // BAT-43 (T-50 = A, #168): nối hai ticket, mặc định `dieu_phoi` — mục 4, 19.4.
  [LENH_LINK.khai.ten]: LENH_LINK,
  // BAT-56 (#83): huỷ lượt — mục 5 `canceled`, 19.6, 19.12 câu 37. Ngoài bảng mục 13.
  [LENH_CANCEL.khai.ten]: LENH_CANCEL,
  // SPEC 20.1 (Bản đồ L1): `project set`, `ticket set` — ngoài bảng mục 13, MCP tự có.
  [LENH_PROJECT.khai.ten]: LENH_PROJECT,
  [LENH_TICKET.khai.ten]: LENH_TICKET,
  // SPEC mục 15 d.429 (BAT-8) — chỉ chủ: chạy với TOKEN_CHU, token agent ra FORBIDDEN.
  [LENH_EXPORT.khai.ten]: LENH_EXPORT,
};
