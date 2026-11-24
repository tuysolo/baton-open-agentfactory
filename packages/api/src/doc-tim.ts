/**
 * **Đường ĐỌC của command menu `Cmd/Ctrl+K`** — SPEC mục 14 d.414 ("tìm mã, tiêu
 * đề, T-số, chạy lệnh") và **19.12 câu 8** (ưu tiên): tìm **chỉ** trong mã ticket,
 * tiêu đề ticket, mã cũ (`ticket.ma_cu`, mục 16), T-số (`can_chu.ma_so`) và tiêu
 * đề mục Cần Chủ. Khớp **chuỗi con**. **Không** tìm mô tả, brief, bình luận (v0.2).
 * "Chạy lệnh" là việc của web (lệnh điều hướng lọc phía client), không ở đây.
 *
 * `GET /v1/tim?q=…&limit=…` → `{ ticket: TicketTimRa[], can_chu: MucTimRa[] }`.
 *
 * ## Ba nếp của dự án, áp nguyên
 *
 *   * **Đường đọc không chạm cửa ghi**: đi thẳng D1 như `doc-nhat-ky.ts`.
 *   * **Phạm vi nằm TRONG câu SQL**, và là **đúng** cửa của hai đường đọc đã có:
 *       - nhóm ticket: `agentHepPhamVi` + `VE_DU_AN_CUA_AGENT` — cửa của
 *         `lietKeTicket` (`GET /v1/ticket`): chủ và agent "tất cả dự án" thấy hết,
 *         agent còn lại chỉ dự án trong `agent_project`; ticket đã xoá mềm **ẩn**
 *         như danh sách (`xoa_luc IS NULL`).
 *       - nhóm Cần Chủ: `locPhamViCanChu` — cửa của `manHinhCanChu`
 *         (`GET /v1/can-chu`), gồm luật lớp "Chung" (19.12 câu 61). Đường đó mở cho
 *         mọi người gọi đã xác thực (chủ và agent, theo phạm vi), nên ở đây cũng
 *         vậy: ai không thấy mục nào thì nhóm rỗng, không 403.
 *   * **Mọi câu ràng `workspace_id`**; SQL **tham số hoá hoàn toàn** — không một
 *     giá trị người dùng nào ghép vào chuỗi SQL.
 *
 * ## Hoa / thường — cùng khuôn `doc-nhat-ky.ts`, cùng giới hạn
 *
 * `chuanHoaTimChu` (cắt khoảng trắng, hạ **đúng 26 chữ ASCII**) ở vế tham số,
 * `lower()` của SQLite ở vế cột. `lower()` chỉ hạ ASCII, nên hai vế là **bản sao
 * nhau** và phép so nằm trọn trong SQL. Giới hạn kéo theo, khai thẳng: chữ có dấu
 * **khác hoa/thường** không khớp nhau (`"ĐĂNG"` không khớp `"đăng"`, `"Sửa"` khớp
 * `"sửa"` vì chỉ `S` khác). Chuỗi không chuẩn hoá Unicode (NFC/NFD) — cùng như mục 10.
 *
 * `thoatLike` + `ESCAPE '\'` cho mọi vế `LIKE`: `%`, `_`, `\` người dùng gõ là
 * **chữ**, không ký tự đại diện.
 *
 * ## Tra thẳng trước, chuỗi con sau
 *
 *   * `q` có dạng `<MÃ>-<số>` (không phân biệt hoa thường: mã dự án chỉ có A–Z) ⇒
 *     một lần seek `ux_project_ma` + `ux_ticket_so`; kết quả **đứng đầu** nhóm.
 *   * `q` có dạng `T-12` / `t12` / `T12` ⇒ một lần seek `ux_can_chu_ma_so`; đứng đầu.
 *   * Còn lại: chuỗi con trên tiêu đề, mã cũ, và chính chuỗi mã (`SAI-1` khớp cả
 *     `SAI-12` — 19.12 câu 8 nói "chuỗi con" cho cả mã). Dòng đã ra ở lối tra thẳng
 *     không lặp lại.
 *
 * ## Thứ tự còn lại (ổn định, toàn phần)
 *
 *   * ticket: `hang_uu_tien, tao_luc DESC, id DESC` — **đúng** thứ tự "Tất cả
 *     việc", nên chủ thấy kết quả theo cùng một trật tự như danh sách; và đó là
 *     thứ tự của index danh sách, nên SQLite đi index theo thứ tự và `LIMIT` dừng
 *     sớm thay vì sắp cả bảng.
 *   * Cần Chủ: mục **đang Chờ** trước (thứ chủ cần mở), rồi mới nhất trước
 *     (`tao_luc DESC, id DESC`).
 *
 * Không thêm index (README migrations, "Chỗ chưa có index"): `LIKE '%x%'` không
 * dùng được B-tree; quét trong một workspace còn chịu được ở mốc v0.1.
 */

import {
  BatonError,
  chuanHoaTimChu,
  kiemTimChu,
  maCanChu,
  maTicket,
  nhan,
  tachMaTicket,
  thoatLike,
  type AiGoi,
} from '@baton/shared';
import { VE_DU_AN_CUA_AGENT } from './doc-du-an.js';
import { agentHepPhamVi } from './doc-ticket.js';
import { locPhamViCanChu } from './doc-can-chu.js';

/** **Trần cứng** số kết quả mỗi nhóm. `limit` của client bị kẹp vào đây. */
export const TRAN_KET_QUA_TIM = 20;

/** Số kết quả mỗi nhóm khi client không gửi `limit`. */
export const KET_QUA_TIM_MAC_DINH = 10;

export interface TicketTimRa {
  id: string;
  /** `<MÃ DỰ ÁN>-<số>`. */
  ma: string;
  tieu_de: string;
  trang_thai: string;
  nhan_trang_thai: string;
  /** Mã cũ của ticket nhập (mục 16); `null` nếu không có. */
  ma_cu: string | null;
  project_id: string;
  ma_du_an: string;
}

export interface MucTimRa {
  id: string;
  /** `T-<số>`. */
  ma: string;
  tieu_de: string;
  trang_thai: string;
  nhan_trang_thai: string;
  /** `null` = mục **Chung**. */
  project_id: string | null;
}

export interface KetQuaTim {
  ticket: TicketTimRa[];
  can_chu: MucTimRa[];
}

/** Kẹp `limit` vào `[1, TRAN_KET_QUA_TIM]`; sai dạng ⇒ `INVALID_INPUT` (nếp `kiemLimit`). */
export function kiemLimitTim(limit: unknown): number {
  if (limit === undefined || limit === null) return KET_QUA_TIM_MAC_DINH;
  const n = typeof limit === 'number' ? limit : Number(limit);
  if (!Number.isInteger(n) || n < 1) {
    throw new BatonError('INVALID_INPUT', { message: 'limit phải là số nguyên ≥ 1.' });
  }
  return Math.min(n, TRAN_KET_QUA_TIM);
}

/** `T-12`, `t-12`, `T12`, `t12` → `12`; khác → `null`. */
export function maSoTimCanChu(q: string): number | null {
  const khop = /^[Tt]-?(\d{1,9})$/.exec(q.trim());
  return khop === null ? null : Number(khop[1]);
}

interface DongTicketTho {
  id: string;
  project_id: string;
  ma_du_an: string;
  so: number;
  tieu_de: string;
  trang_thai: string;
  ma_cu: string | null;
}

interface DongMucTho {
  id: string;
  ma_so: number;
  tieu_de: string;
  trang_thai: string;
  project_id: string | null;
}

const COT_TICKET_TIM = `t.id AS id, t.project_id AS project_id, p.ma AS ma_du_an,
   t.so AS so, t.tieu_de AS tieu_de, t.trang_thai AS trang_thai, t.ma_cu AS ma_cu`;

/**
 * Ticket **JOIN** dự án của nó (cùng workspace) — `p.ma` lấy một lần mỗi dòng qua
 * khoá chính `project`, dùng cho cả cột `ma_du_an` lẫn vế chuỗi con trên chuỗi mã;
 * không subquery tương quan lặp hai lần mỗi dòng. JOIN trong (`JOIN`) không đổi tập
 * dòng: mọi ticket có đúng một dự án (khoá ngoại `project_id`). Vế phạm vi
 * `VE_DU_AN_CUA_AGENT` viết `project_id` không tiền tố: bảng `project` không có cột
 * đó, nên nó chỉ về `t.project_id` — cùng một chuỗi với `lietKeTicket`.
 */
const TU_TICKET_TIM = 'ticket t JOIN project p ON p.id = t.project_id AND p.workspace_id = t.workspace_id';

const COT_MUC_TIM =
  'ct.id AS id, ct.ma_so AS ma_so, ct.tieu_de AS tieu_de, ct.trang_thai AS trang_thai, ct.project_id AS project_id';

/** Vế phạm vi ticket — **cửa của `lietKeTicket`**, không dựng luật mới. */
function phamViTicket(ai: AiGoi): { sql: string; bind: string[] } {
  const hep = agentHepPhamVi(ai);
  return hep === undefined ? { sql: '', bind: [] } : { sql: ` AND ${VE_DU_AN_CUA_AGENT}`, bind: [hep] };
}

/** Câu tra **thẳng** một ticket theo mã — tách ra để test đo đúng câu sản phẩm. */
export function cauTicketTheoMa(
  ai: AiGoi,
  workspace_id: string,
  ma_du_an: string,
  so: number,
): { sql: string; bind: (string | number)[] } {
  const pv = phamViTicket(ai);
  return {
    sql: `SELECT ${COT_TICKET_TIM} FROM ${TU_TICKET_TIM}
           WHERE p.workspace_id = ? AND p.ma = ?
             AND t.workspace_id = ? AND t.xoa_luc IS NULL AND t.so = ?${pv.sql}`,
    bind: [workspace_id, ma_du_an, workspace_id, so, ...pv.bind],
  };
}

/** Câu **chuỗi con** trên tiêu đề / mã cũ / chuỗi mã của ticket. */
export function cauTicketChuoiCon(
  ai: AiGoi,
  workspace_id: string,
  mau: string,
  limit: number,
): { sql: string; bind: (string | number)[] } {
  const pv = phamViTicket(ai);
  return {
    sql: `SELECT ${COT_TICKET_TIM} FROM ${TU_TICKET_TIM}
           WHERE t.workspace_id = ? AND t.xoa_luc IS NULL${pv.sql}
             AND (lower(t.tieu_de) LIKE ? ESCAPE '\\'
                  OR lower(t.ma_cu) LIKE ? ESCAPE '\\'
                  OR lower(p.ma || '-' || t.so) LIKE ? ESCAPE '\\')
           ORDER BY t.hang_uu_tien, t.tao_luc DESC, t.id DESC LIMIT ?`,
    bind: [workspace_id, ...pv.bind, mau, mau, mau, limit],
  };
}

/** Câu tra **thẳng** một mục Cần Chủ theo `ma_so`. */
export function cauMucTheoMaSo(
  ai: AiGoi,
  workspace_id: string,
  ma_so: number,
): { sql: string; bind: (string | number)[] } {
  const pv = locPhamViCanChu(ai);
  return {
    sql: `SELECT ${COT_MUC_TIM} FROM can_chu ct
           WHERE ct.workspace_id = ? AND ct.ma_so = ?${pv.sql === '' ? '' : ` AND ${pv.sql}`}`,
    bind: [workspace_id, ma_so, ...pv.bind],
  };
}

/** Câu **chuỗi con** trên tiêu đề mục Cần Chủ và chuỗi `t-<số>`. */
export function cauMucChuoiCon(
  ai: AiGoi,
  workspace_id: string,
  mau: string,
  limit: number,
): { sql: string; bind: (string | number)[] } {
  const pv = locPhamViCanChu(ai);
  return {
    sql: `SELECT ${COT_MUC_TIM} FROM can_chu ct
           WHERE ct.workspace_id = ?${pv.sql === '' ? '' : ` AND ${pv.sql}`}
             AND (lower(ct.tieu_de) LIKE ? ESCAPE '\\' OR ('t-' || ct.ma_so) LIKE ? ESCAPE '\\')
           ORDER BY (ct.trang_thai = 'open') DESC, ct.tao_luc DESC, ct.id DESC LIMIT ?`,
    bind: [workspace_id, ...pv.bind, mau, mau, limit],
  };
}

function raTicket(d: DongTicketTho): TicketTimRa {
  return {
    id: d.id,
    ma: maTicket(d.ma_du_an, d.so),
    tieu_de: d.tieu_de,
    trang_thai: d.trang_thai,
    nhan_trang_thai: nhan('trang_thai_ticket', d.trang_thai),
    ma_cu: d.ma_cu,
    project_id: d.project_id,
    ma_du_an: d.ma_du_an,
  };
}

function raMucTim(d: DongMucTho): MucTimRa {
  return {
    id: d.id,
    ma: maCanChu(d.ma_so),
    tieu_de: d.tieu_de,
    trang_thai: d.trang_thai,
    nhan_trang_thai: nhan('trang_thai_can_chu', d.trang_thai),
    project_id: d.project_id,
  };
}

/** Nối "tra thẳng" (đứng đầu) với "chuỗi con", bỏ trùng theo id, cắt ở `limit`. */
function noi<T extends { id: string }>(dau: readonly T[], sau: readonly T[], limit: number): T[] {
  const da = new Set(dau.map((d) => d.id));
  return [...dau, ...sau.filter((d) => !da.has(d.id))].slice(0, limit);
}

export async function timNhanh(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  yeu_cau: { q?: unknown; limit?: unknown },
): Promise<KetQuaTim> {
  // `q` dài/sai kiểu ⇒ `INVALID_INPUT` TRƯỚC mọi truy vấn; rỗng ⇒ không chạy gì.
  const tim = kiemTimChu(yeu_cau.q);
  const limit = kiemLimitTim(yeu_cau.limit);
  if (tim === null) return { ticket: [], can_chu: [] };

  const goc = (yeu_cau.q as string).trim();
  const mau = `%${thoatLike(chuanHoaTimChu(tim))}%`;

  const tach = tachMaTicket(goc.toUpperCase());
  const ma_so = maSoTimCanChu(goc);

  const chay = async <R>(cau: { sql: string; bind: (string | number)[] }): Promise<R[]> =>
    (
      await db
        .prepare(cau.sql)
        .bind(...cau.bind)
        .all<R>()
    ).results;

  const [tk_thang, tk_con, ct_thang, ct_con] = await Promise.all([
    tach === null
      ? Promise.resolve([] as DongTicketTho[])
      : chay<DongTicketTho>(cauTicketTheoMa(ai, workspace_id, tach.ma_du_an, tach.so)),
    chay<DongTicketTho>(cauTicketChuoiCon(ai, workspace_id, mau, limit)),
    ma_so === null
      ? Promise.resolve([] as DongMucTho[])
      : chay<DongMucTho>(cauMucTheoMaSo(ai, workspace_id, ma_so)),
    chay<DongMucTho>(cauMucChuoiCon(ai, workspace_id, mau, limit)),
  ]);

  return {
    ticket: noi(tk_thang, tk_con, limit).map(raTicket),
    can_chu: noi(ct_thang, ct_con, limit).map(raMucTim),
  };
}
