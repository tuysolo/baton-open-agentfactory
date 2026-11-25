/**
 * Đường **ĐỌC** về ticket — SPEC mục 4, 13 (`baton show`, `baton list`), 14.
 *
 * Cùng hai luật với `doc-du-an.ts`:
 *   1. **Không lộ sự tồn tại**: ticket ngoài phạm vi agent trả `NOT_FOUND`/404,
 *      và điều kiện phạm vi nằm **trong câu SQL** (SPEC mục 13, 17.7).
 *   2. **Phân trang keyset, không `OFFSET`** — mốc 200.000 ticket. Thứ tự chuẩn
 *      `(hang_uu_tien ASC, tao_luc DESC, id DESC)` là **toàn phần** (kết thúc
 *      bằng `id`), nên cursor không bỏ sót và không trả trùng.
 *
 * Câu lệnh danh sách do `cauLenhDanhSachTicket` (ở `doc-du-an.ts`) dựng — test
 * `EXPLAIN QUERY PLAN` đo **chính hàm đó**, nên không có chuyện test xanh trên
 * một chuỗi SQL viết riêng trong test còn mã thật thì quét bảng.
 */

import {
  HANG_UU_TIEN,
  TRUONG_BRIEF,
  kiemLimit,
  kiemTrangThaiTicket,
  kiemUuTien,
  maTicket,
  moCursor,
  tachMaTicket,
  nguoiDangCam,
  nhan,
  nhomTrangThai,
  tinhCoKhongAiCam,
  BatonError,
  type AiGoi,
  type BoiCanhNguoiCam,
  type Brief,
  type TacGia,
  type TrangKetQua,
  type TrangThaiTicket,
  type YeuCauTrang,
} from '@baton/shared';
import { cauLenhDanhSachTicket, dungTrang } from './doc-du-an.js';
import { boiCanhNguoiCamNhieu, luotGiaoCuaTicket, type LuotGiaoRa } from './doc-luot-giao.js';
import { agentHepPhamVi, locPhamViTicket } from './pham-vi-doc.js';

/* ------------------------------------------------------------------ *
 * Phạm vi: agent thấy ticket nào
 * ------------------------------------------------------------------ */

/*
 * Luật phạm vi (`agentHepPhamVi`, `locPhamViTicket`) nằm ở `pham-vi-doc.ts` —
 * module không phụ thuộc gì, để cả đường đọc phiên lẫn đường ghi dùng chung mà
 * không tạo vòng import (BAT-57). Xuất lại ở đây cho người gọi cũ (`doc-tim.ts`).
 */
export { agentHepPhamVi, locPhamViTicket } from './pham-vi-doc.js';

/* ------------------------------------------------------------------ *
 * Một ticket — `baton show` (SPEC mục 13), chi tiết ticket (mục 14)
 * ------------------------------------------------------------------ */

interface DongTicketDoc extends Brief {
  id: string;
  project_id: string;
  ma_du_an: string;
  so: number;
  tieu_de: string;
  mo_ta: string | null;
  trang_thai: TrangThaiTicket;
  uu_tien: string;
  hang_uu_tien: number;
  chiu_trach_nhiem_loai: string | null;
  chiu_trach_nhiem_agent_id: string | null;
  han_luc: number | null;
  nguoi_tao_loai: string;
  nguoi_tao_agent_id: string | null;
  tao_luc: number;
  cap_nhat_luc: number;
  bat_dau_luc: number | null;
  xong_luc: number | null;
  chu_tu_lam: number;
  trong_tay_tu_luc: number | null;
  trung_voi_ticket_id: string | null;
  ly_do_huy: string | null;
  co_xong_khong_bang_chung: number;
  co_nhap_khong_bang_chung: number;
  co_khong_ai_cam: number;
  co_can_review_lai: number;
  ma_cu: string | null;
  xoa_luc: number | null;
  khong_code: number;
  du_an_khong_code: number;
  khoi_lon: number | null;
  doi: number | null;
}

const COT_TICKET_DOC = `t.id AS id, t.project_id AS project_id, p.ma AS ma_du_an, t.so AS so,
   t.tieu_de AS tieu_de, t.mo_ta AS mo_ta, t.trang_thai AS trang_thai,
   t.uu_tien AS uu_tien, t.hang_uu_tien AS hang_uu_tien,
   t.muc_tieu AS muc_tieu, t.boi_canh AS boi_canh, t.pham_vi AS pham_vi,
   t.file_va_nguon AS file_va_nguon, t.dieu_cam AS dieu_cam, t.xong_la_gi AS xong_la_gi,
   t.cach_kiem_chung AS cach_kiem_chung, t.nop_lai AS nop_lai,
   t.chiu_trach_nhiem_loai AS chiu_trach_nhiem_loai,
   t.chiu_trach_nhiem_agent_id AS chiu_trach_nhiem_agent_id,
   t.han_luc AS han_luc, t.nguoi_tao_loai AS nguoi_tao_loai,
   t.nguoi_tao_agent_id AS nguoi_tao_agent_id, t.tao_luc AS tao_luc,
   t.cap_nhat_luc AS cap_nhat_luc, t.bat_dau_luc AS bat_dau_luc, t.xong_luc AS xong_luc,
   t.chu_tu_lam AS chu_tu_lam, t.trong_tay_tu_luc AS trong_tay_tu_luc,
   t.trung_voi_ticket_id AS trung_voi_ticket_id, t.ly_do_huy AS ly_do_huy,
   t.co_xong_khong_bang_chung AS co_xong_khong_bang_chung,
   t.co_nhap_khong_bang_chung AS co_nhap_khong_bang_chung,
   t.co_khong_ai_cam AS co_khong_ai_cam, t.co_can_review_lai AS co_can_review_lai,
   t.ma_cu AS ma_cu, t.xoa_luc AS xoa_luc,
   t.khong_code AS khong_code, p.khong_code AS du_an_khong_code,
   t.khoi_lon AS khoi_lon, t.doi AS doi`;

function taoGia(loai: string | null, agent_id: string | null): TacGia | null {
  if (loai === null) return null;
  return loai === 'agent' && agent_id !== null
    ? { loai: 'agent', agentId: agent_id }
    : { loai: loai as TacGia['loai'] };
}

export interface LienKetRa {
  loai: string;
  nhan_loai: string;
  ticket_id: string;
  ma: string;
  tieu_de: string;
  trang_thai: string;
  /**
   * Nhãn tiếng Việt của `trang_thai` — SPEC mục 13 d.381 ("UI hiển thị nhãn tiếng
   * Việt"). Máy chủ đổi, **không** giao diện: một bảng `mã → nhãn` thứ hai trong
   * `packages/web` là chỗ để "Chờ kiểm chứng" ở màn hình này và "Đang kiểm" ở màn
   * hình kia cho cùng một mã.
   */
  nhan_trang_thai: string;
  /** `true` = liên kết trỏ **tới** ticket này (chiều ngược). */
  nguoc: boolean;
}

export interface BinhLuanRa {
  id: string;
  tac_gia: TacGia | null;
  noi_dung: string;
  da_sua: boolean;
  tao_luc: number;
  cap_nhat_luc: number;
}

export interface TicketRa extends Brief {
  id: string;
  ma: string;
  project_id: string;
  so: number;
  tieu_de: string;
  mo_ta: string | null;
  trang_thai: string;
  nhan_trang_thai: string;
  nhom_trang_thai: string;
  uu_tien: string;
  nhan_uu_tien: string;
  nhan: string[];
  chiu_trach_nhiem: TacGia | null;
  /** Tự tính, **không sửa tay** — SPEC mục 4, 19.1. */
  nguoi_dang_cam: TacGia | null;
  /** Bậc nào của SPEC 19.1 đã quyết người đang cầm. */
  bac_nguoi_cam: number;
  /** SPEC 19.1 bậc 3: hiện "chờ <tên> nghiệm thu". */
  cho_nghiem_thu: boolean;
  han_luc: number | null;
  nguoi_tao: TacGia | null;
  tao_luc: number;
  cap_nhat_luc: number;
  bat_dau_luc: number | null;
  xong_luc: number | null;
  chu_tu_lam: boolean;
  trung_voi_ticket_id: string | null;
  ly_do_huy: string | null;
  /** Ticket điều phối — SPEC 19.4 (suy ra từ liên kết `dieu_phoi`). */
  la_dieu_phoi: boolean;
  co: {
    xong_khong_bang_chung: boolean;
    nhap_khong_bang_chung: boolean;
    khong_ai_cam: boolean;
    can_review_lai: boolean;
  };
  /** SPEC 19.11: ticket cha ở Chờ kiểm chứng hiện "chờ N ticket con". */
  con_chua_ket: number;
  ma_cu: string | null;
  xoa_luc: number | null;
  /**
   * Cờ **"ticket không code"** (migration 0027, T-31 câu 3.4 A) — chỉ chủ đổi.
   * Cổng coi ticket là không code khi cờ này **hoặc** `du_an_khong_code` bật.
   */
  khong_code: boolean;
  /** Cờ "dự án không code" của hồ sơ dự án (d.217) — chỉ để hiện, sửa ở dự án. */
  du_an_khong_code: boolean;
  /** Số thứ tự khối việc lớn 1–99; `null` = không phải khối lớn — SPEC 20.1. */
  khoi_lon: number | null;
  /** Vị trí trên đồi 0–100; `null` = chưa đặt — SPEC 20.1. */
  doi: number | null;
  lien_ket: LienKetRa[];
  /** 10 bình luận cuối — SPEC mục 13 (`baton show`). */
  binh_luan_cuoi: BinhLuanRa[];
}

/** Số bình luận cuối `baton show` in ra — SPEC mục 13. */
export const SO_BINH_LUAN_CUOI = 10;

/**
 * Thông điệp `NOT_FOUND` của **mọi** đường đọc một ticket — một chuỗi, một chỗ.
 *
 * SPEC mục 13 d.386: 404 "cũng dùng khi đối tượng ngoài phạm vi, để không lộ sự
 * tồn tại" (và 19.12 câu 15). Lộ sự tồn tại không chỉ qua **mã** HTTP mà qua cả
 * **thân**: hai câu chữ khác nhau cho "không có thật" và "ngoài tầm nhìn" là một
 * máy dò đủ dùng. Nên cả hai ca dùng đúng hằng này.
 */
const LOI_KHONG_THAY_TICKET = 'Không tìm thấy ticket.';

/**
 * Một ticket đầy đủ. Ngoài phạm vi agent → `NOT_FOUND` (SPEC mục 13, 17.7).
 *
 * Ticket **đã xoá mềm** vẫn đọc được (chủ cần xem để khôi phục trong 30 ngày —
 * SPEC mục 4); trường `xoa_luc` nói rõ. Danh sách thì ẩn.
 */
export async function layTicket(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  ticket_id: string,
): Promise<TicketRa> {
  const loc = locPhamViTicket(ai, 't.project_id');

  const d = await db
    .prepare(
      `SELECT ${COT_TICKET_DOC} FROM ticket t JOIN project p ON p.id = t.project_id
        WHERE t.id = ? AND t.workspace_id = ?${loc.sql}`,
    )
    .bind(ticket_id, workspace_id, ...loc.bind)
    .first<DongTicketDoc>();
  if (d === null) throw new BatonError('NOT_FOUND', { message: LOI_KHONG_THAY_TICKET });

  const { results: nhan_ds } = await db
    .prepare('SELECT nhan FROM ticket_label WHERE ticket_id = ? ORDER BY nhan')
    .bind(ticket_id)
    .all<{ nhan: string }>();

  const lien_ket = await lienKetCua(db, ticket_id);

  const { results: con } = await db
    .prepare(
      `SELECT count(*) AS n FROM ticket_link l JOIN ticket c ON c.id = l.den_ticket_id
        WHERE l.tu_ticket_id = ? AND l.loai = 'parent' AND c.xoa_luc IS NULL
          AND c.trang_thai NOT IN ('done', 'canceled', 'duplicate')`,
    )
    .bind(ticket_id)
    .all<{ n: number }>();

  const binh_luan = await binhLuanCuaTicket(db, workspace_id, ticket_id, {
    limit: SO_BINH_LUAN_CUOI,
  });

  // **Người đang cầm** (SPEC 19.1) nay có đủ 5 bậc: ba bậc đầu lấy từ bảng
  // `luot_giao`, bậc 4 từ `ticket.chu_tu_lam`, bậc 5 là trống.
  const boi_canh = (await boiCanhNguoiCamNhieu(db, workspace_id, [ticket_id])).get(ticket_id) ?? {};

  return {
    ...raTicket(d, boi_canh),
    nhan: nhan_ds.map((n) => n.nhan),
    lien_ket,
    la_dieu_phoi: lien_ket.some((l) => l.loai === 'dieu_phoi' && !l.nguoc),
    con_chua_ket: con[0]?.n ?? 0,
    binh_luan_cuoi: binh_luan.items,
  };
}

/**
 * Một ticket đầy đủ theo **mã hiển thị** `MÃ-số` — SPEC mục 13 d.372
 * (`baton show <MÃ>`).
 *
 * ## Vì sao đường này phải tồn tại
 *
 * CLI là đường **duy nhất** gõ được **mã**, mà API chỉ có `/v1/ticket/:id`. Bản
 * đầu của `baton show <MÃ>` phải **cuộn `GET /v1/ticket`** để tìm `so`, và việc
 * đó hỏng hai lần:
 *   * **Mất ticket đã xoá mềm.** Truy vấn danh sách có cứng `xoa_luc IS NULL`,
 *     còn `layTicket` **cố ý** cho đọc ticket đã xoá (mục 4: khôi phục trong 30
 *     ngày). Nên `baton show SAI-5` của một ticket đã xoá ra `NOT_FOUND` trong
 *     khi `baton show <id>` của **cùng** ticket trả về bình thường.
 *   * **Không chạy nổi ở mốc SPEC.** Danh sách sắp theo
 *     `(hang_uu_tien, tao_luc DESC)`, nên `SAI-1` (ticket **cũ nhất**) nằm cuối:
 *     ở mốc 200.000 ticket (19.12 câu 1) là ~2000 request cho **một** lệnh, tự
 *     đập vào trần "600 request mỗi phút cho mỗi token" (d.387) ⇒ `RATE_LIMITED`.
 *
 * ## Vì sao không cần migration
 *
 * Hai lần tra khoá trên **index đã có**: `ux_project_ma (workspace_id, ma)` và
 * `ux_ticket_so (project_id, so)` — cả hai là UNIQUE của migration `0001`. Kế
 * hoạch thật được ghim bằng `EXPLAIN QUERY PLAN` (`doc-ticket.test.ts`), trên
 * **chính** hằng `SQL_TICKET_THEO_MA` dưới đây, không trên một chuỗi viết lại
 * trong test.
 *
 * Để `ux_project_ma` dùng được thì **cột dẫn đầu phải bị ràng**: vì thế
 * `p.workspace_id = ?` nằm trong `ON`, bind một **hằng** (không `= t.workspace_id`
 * — ràng bằng cột của `t` thì giá trị chỉ biết sau khi `t` đã được chọn).
 *
 * Đo thật, bỏ vế đó ra thì kế hoạch là
 * `SCAN t | SEARCH p USING INDEX sqlite_autoindex_project_1 (id=?)` — tức **quét
 * cả bảng `ticket`** (mốc 200.000 dòng, 19.12 câu 1) rồi mới lọc `p.ma`. Có vế đó
 * thì `SEARCH p USING INDEX ux_project_ma (workspace_id=? AND ma=?) | SEARCH t
 * USING INDEX ux_ticket_so (project_id=? AND so=?)`: đúng hai phép seek.
 *
 * ## Cửa quyền và cửa phạm vi
 *
 * Hàm này **chỉ** đổi mã → id rồi gọi `layTicket`. Phạm vi dự án của agent,
 * `NOT_FOUND` của ca ngoài tầm nhìn, và việc **cho đọc ticket đã xoá mềm** đều
 * nằm nguyên ở `layTicket` — không chép lại một bản luật thứ hai. Câu tra mã
 * ràng `workspace_id` cho **cả** `ticket` và `project` (bất biến tách dữ liệu của
 * mục 1 — ràng cả hai nên nó không phụ thuộc vào tính toàn vẹn của
 * `ticket.project_id`), nhưng nó
 * **không** là cửa quyền: cửa quyền là `layTicket`.
 *
 * Mã sai định dạng cũng ra **đúng** `NOT_FOUND` ấy, không `INVALID_INPUT`: một
 * mã thoát khác cho "sai dạng" thì đường này không phân biệt được gì thêm, mà
 * một thông điệp khác lại là một tín hiệu khác để dò.
 */
/**
 * Câu tra `MÃ-số` → `ticket.id`. Export để test `EXPLAIN QUERY PLAN` đo **chính**
 * chuỗi mã thật chạy.
 *
 * Thứ tự bind: `p.workspace_id`, `t.workspace_id`, `p.ma`, `t.so` — tham số của
 * `ON` đứng **trước** tham số của `WHERE` trong văn bản câu lệnh.
 */
export const SQL_TICKET_THEO_MA = `SELECT t.id AS id FROM ticket t
    JOIN project p ON p.id = t.project_id AND p.workspace_id = ?
   WHERE t.workspace_id = ? AND p.ma = ? AND t.so = ?`;

export async function layTicketTheoMa(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  ma: string,
): Promise<TicketRa> {
  const tach = tachMaTicket(ma);
  if (tach === null) throw new BatonError('NOT_FOUND', { message: LOI_KHONG_THAY_TICKET });

  const d = await db
    .prepare(SQL_TICKET_THEO_MA)
    .bind(workspace_id, workspace_id, tach.ma_du_an, tach.so)
    .first<{ id: string }>();
  if (d === null) throw new BatonError('NOT_FOUND', { message: LOI_KHONG_THAY_TICKET });

  return await layTicket(db, ai, workspace_id, d.id);
}

/** Phần chung giữa `layTicket` và danh sách. */
function raTicket(
  d: DongTicketDoc,
  boi_canh: BoiCanhNguoiCam = {},
): Omit<TicketRa, 'nhan' | 'lien_ket' | 'la_dieu_phoi' | 'con_chua_ket' | 'binh_luan_cuoi'> {
  // **Người đang cầm luôn tính lại khi đọc** (SPEC mục 4: "tự tính … không sửa
  // tay"), không đọc từ một cột. Bối cảnh lượt giao (SPEC 19.1 bậc 1–3) do người
  // gọi tra; bậc 4 ("chủ bấm Tôi làm") và bậc 5 (trống) nằm ngay trong hàm luật.
  const cam = nguoiDangCam({ chu_tu_lam: d.chu_tu_lam === 1 }, boi_canh);
  const brief = {} as Brief;
  for (const truong of TRUONG_BRIEF) brief[truong] = d[truong];

  return {
    ...brief,
    id: d.id,
    ma: maTicket(d.ma_du_an, d.so),
    project_id: d.project_id,
    so: d.so,
    tieu_de: d.tieu_de,
    mo_ta: d.mo_ta,
    trang_thai: d.trang_thai,
    nhan_trang_thai: nhan('trang_thai_ticket', d.trang_thai),
    nhom_trang_thai: nhomTrangThai(d.trang_thai),
    uu_tien: d.uu_tien,
    nhan_uu_tien: nhan('uu_tien', d.uu_tien),
    chiu_trach_nhiem: taoGia(d.chiu_trach_nhiem_loai, d.chiu_trach_nhiem_agent_id),
    nguoi_dang_cam: cam.nguoi,
    bac_nguoi_cam: cam.bac,
    cho_nghiem_thu: cam.cho_nghiem_thu,
    han_luc: d.han_luc,
    nguoi_tao: taoGia(d.nguoi_tao_loai, d.nguoi_tao_agent_id),
    tao_luc: d.tao_luc,
    cap_nhat_luc: d.cap_nhat_luc,
    bat_dau_luc: d.bat_dau_luc,
    xong_luc: d.xong_luc,
    chu_tu_lam: d.chu_tu_lam === 1,
    trung_voi_ticket_id: d.trung_voi_ticket_id,
    ly_do_huy: d.ly_do_huy,
    co: {
      xong_khong_bang_chung: d.co_xong_khong_bang_chung === 1,
      nhap_khong_bang_chung: d.co_nhap_khong_bang_chung === 1,
      khong_ai_cam: d.co_khong_ai_cam === 1,
      can_review_lai: d.co_can_review_lai === 1,
    },
    ma_cu: d.ma_cu,
    xoa_luc: d.xoa_luc,
    khong_code: d.khong_code === 1,
    du_an_khong_code: d.du_an_khong_code === 1,
    khoi_lon: d.khoi_lon,
    doi: d.doi,
  };
}

/**
 * Liên kết của một ticket, **cả hai chiều** — SPEC mục 4 ("liên quan (hai chiều,
 * được khác dự án)"), 19.4 ("xem ticket nào cũng thấy ticket kia").
 *
 * Mỗi quan hệ lưu **một** dòng; hai chiều là việc của đường đọc này. Vì vậy không
 * có cách nào để hai chiều lệch nhau.
 */
async function lienKetCua(db: D1Database, ticket_id: string): Promise<LienKetRa[]> {
  const { results } = await db
    .prepare(
      `SELECT l.loai AS loai, t.id AS ticket_id, p.ma AS ma_du_an, t.so AS so,
              t.tieu_de AS tieu_de, t.trang_thai AS trang_thai, 0 AS nguoc
         FROM ticket_link l
         JOIN ticket t ON t.id = l.den_ticket_id
         JOIN project p ON p.id = t.project_id
        WHERE l.tu_ticket_id = ? AND t.xoa_luc IS NULL
       UNION ALL
       SELECT l.loai AS loai, t.id AS ticket_id, p.ma AS ma_du_an, t.so AS so,
              t.tieu_de AS tieu_de, t.trang_thai AS trang_thai, 1 AS nguoc
         FROM ticket_link l
         JOIN ticket t ON t.id = l.tu_ticket_id
         JOIN project p ON p.id = t.project_id
        WHERE l.den_ticket_id = ? AND t.xoa_luc IS NULL
       ORDER BY loai, so`,
    )
    .bind(ticket_id, ticket_id)
    .all<{
      loai: string;
      ticket_id: string;
      ma_du_an: string;
      so: number;
      tieu_de: string;
      trang_thai: string;
      nguoc: number;
    }>();

  return results.map((r) => ({
    loai: r.loai,
    nhan_loai: nhan('loai_lien_ket_ticket', r.loai),
    ticket_id: r.ticket_id,
    ma: maTicket(r.ma_du_an, r.so),
    tieu_de: r.tieu_de,
    trang_thai: r.trang_thai,
    nhan_trang_thai: nhan('trang_thai_ticket', r.trang_thai),
    nguoc: r.nguoc === 1,
  }));
}

/* ------------------------------------------------------------------ *
 * Danh sách ticket — `baton list` (SPEC mục 13), mục 14
 * ------------------------------------------------------------------ */

export interface YeuCauLietKeTicket extends YeuCauTrang {
  project_id?: string | undefined;
  trang_thai?: string | undefined;
  uu_tien?: string | undefined;
  chiu_trach_nhiem?: string | undefined;
  nhan?: string | undefined;
  /** `'co'` = chỉ ticket **có cờ** (SPEC mục 14). */
  co_co?: boolean | undefined;
  /**
   * **Người đang cầm** — SPEC mục 14 d.396. `'owner'` là chủ; còn lại là id agent.
   * Cùng quy ước giá trị với `chiu_trach_nhiem`, để URL của giao diện không phải
   * học hai cách viết "chủ".
   */
  nguoi_dang_cam?: string | undefined;
  /** `'co'` = chỉ ticket **cần Chủ** (d.396). */
  can_chu?: boolean | undefined;
  /** `'co'` = chỉ ticket **xong không bằng chứng** (d.396). */
  xong_khong_bang_chung?: boolean | undefined;
}

export interface TicketDanhSachRa {
  id: string;
  ma: string;
  project_id: string;
  so: number;
  tieu_de: string;
  trang_thai: string;
  nhan_trang_thai: string;
  nhom_trang_thai: string;
  uu_tien: string;
  nhan_uu_tien: string;
  chiu_trach_nhiem: TacGia | null;
  nguoi_dang_cam: TacGia | null;
  han_luc: number | null;
  tao_luc: number;
  cap_nhat_luc: number;
  co_co: boolean;
  /** Khối việc lớn 1–99 / `null` — SPEC 20.1. */
  khoi_lon: number | null;
  /** Vị trí trên đồi 0–100 / `null` — SPEC 20.1. */
  doi: number | null;
}

interface DongDanhSach {
  id: string;
  project_id: string;
  ma_du_an: string;
  so: number;
  tieu_de: string;
  trang_thai: TrangThaiTicket;
  uu_tien: string;
  hang_uu_tien: number;
  chiu_trach_nhiem_loai: string | null;
  chiu_trach_nhiem_agent_id: string | null;
  han_luc: number | null;
  tao_luc: number;
  cap_nhat_luc: number;
  chu_tu_lam: number;
  co_xong_khong_bang_chung: number;
  co_nhap_khong_bang_chung: number;
  co_khong_ai_cam: number;
  co_can_review_lai: number;
  khoi_lon: number | null;
  doi: number | null;
}

/**
 * Cột của danh sách.
 *
 * Mã dự án (`p.ma`) cần để dựng mã `MÃ-số`, nên phải join `project`. Join này
 * **không** làm vỡ thứ tự index: `project.id` là khoá chính, nên SQLite đọc
 * `ticket` theo index danh sách rồi tra từng dự án — xem test
 * `EXPLAIN QUERY PLAN` (không `USE TEMP B-TREE`, không `SCAN ticket`).
 */
const COT_DANH_SACH = `ticket.id AS id, ticket.project_id AS project_id,
   (SELECT ma FROM project WHERE id = ticket.project_id) AS ma_du_an,
   ticket.so AS so, ticket.tieu_de AS tieu_de, ticket.trang_thai AS trang_thai,
   ticket.uu_tien AS uu_tien, ticket.hang_uu_tien AS hang_uu_tien,
   ticket.chiu_trach_nhiem_loai AS chiu_trach_nhiem_loai,
   ticket.chiu_trach_nhiem_agent_id AS chiu_trach_nhiem_agent_id,
   ticket.han_luc AS han_luc, ticket.tao_luc AS tao_luc, ticket.cap_nhat_luc AS cap_nhat_luc,
   ticket.chu_tu_lam AS chu_tu_lam,
   ticket.co_xong_khong_bang_chung AS co_xong_khong_bang_chung,
   ticket.co_nhap_khong_bang_chung AS co_nhap_khong_bang_chung,
   ticket.co_khong_ai_cam AS co_khong_ai_cam,
   ticket.co_can_review_lai AS co_can_review_lai,
   ticket.khoi_lon AS khoi_lon, ticket.doi AS doi`;

function raDanhSach(d: DongDanhSach, boi_canh: BoiCanhNguoiCam = {}): TicketDanhSachRa {
  return {
    id: d.id,
    ma: maTicket(d.ma_du_an, d.so),
    project_id: d.project_id,
    so: d.so,
    tieu_de: d.tieu_de,
    trang_thai: d.trang_thai,
    nhan_trang_thai: nhan('trang_thai_ticket', d.trang_thai),
    nhom_trang_thai: nhomTrangThai(d.trang_thai),
    uu_tien: d.uu_tien,
    nhan_uu_tien: nhan('uu_tien', d.uu_tien),
    chiu_trach_nhiem: taoGia(d.chiu_trach_nhiem_loai, d.chiu_trach_nhiem_agent_id),
    nguoi_dang_cam: nguoiDangCam({ chu_tu_lam: d.chu_tu_lam === 1 }, boi_canh).nguoi,
    han_luc: d.han_luc,
    tao_luc: d.tao_luc,
    cap_nhat_luc: d.cap_nhat_luc,
    co_co:
      d.co_xong_khong_bang_chung === 1 ||
      d.co_nhap_khong_bang_chung === 1 ||
      d.co_khong_ai_cam === 1 ||
      d.co_can_review_lai === 1,
    khoi_lon: d.khoi_lon,
    doi: d.doi,
  };
}

/** Tham số của `cauLenhDanhSachTicket` dựng từ một yêu cầu đã kiểm. */
export function thamSoLietKeTicket(
  ai: AiGoi,
  workspace_id: string,
  yeu_cau: YeuCauLietKeTicket,
  limit: number,
): Parameters<typeof cauLenhDanhSachTicket>[0] {
  // Lọc trên `hang_uu_tien` (cột nằm trong index), không trên `uu_tien`.
  const hang_uu_tien =
    yeu_cau.uu_tien === undefined ? undefined : HANG_UU_TIEN[kiemUuTien(yeu_cau.uu_tien)];

  // `chiu_trach_nhiem=owner` nghĩa là chủ; còn lại là id của một agent.
  const ctn = yeu_cau.chiu_trach_nhiem;

  // Cùng quy ước cho `nguoi_dang_cam` (d.396) — `owner` là chủ (bậc 3–4 của 19.1).
  const ndc = yeu_cau.nguoi_dang_cam;

  return {
    cot: COT_DANH_SACH,
    workspace_id,
    project_id: yeu_cau.project_id,
    trang_thai:
      yeu_cau.trang_thai === undefined ? undefined : kiemTrangThaiTicket(yeu_cau.trang_thai),
    hang_uu_tien,
    chiu_trach_nhiem_agent_id: ctn === undefined || ctn === 'owner' ? undefined : ctn,
    chiu_trach_nhiem_chu: ctn === 'owner',
    nhan: yeu_cau.nhan,
    co_co: yeu_cau.co_co,
    nguoi_dang_cam:
      ndc === undefined
        ? undefined
        : ndc === 'owner'
          ? { loai: 'owner' }
          : { loai: 'agent', agent_id: ndc },
    can_chu: yeu_cau.can_chu,
    xong_khong_bang_chung: yeu_cau.xong_khong_bang_chung,
    chi_du_an_cua_agent: agentHepPhamVi(ai),
    sau: undefined,
    limit,
  };
}

/**
 * Liệt kê ticket — SPEC mục 13 (`baton list`), mục 14 (lọc theo dự án, trạng
 * thái, ưu tiên, người chịu trách nhiệm, nhãn, "có cờ").
 *
 * Phân trang **keyset** theo `(hang_uu_tien, tao_luc DESC, id DESC)`.
 */
export async function lietKeTicket(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  yeu_cau: YeuCauLietKeTicket = {},
): Promise<TrangKetQua<TicketDanhSachRa>> {
  const limit = kiemLimit(yeu_cau.limit);
  const tham_so = thamSoLietKeTicket(ai, workspace_id, yeu_cau, limit + 1);

  if (yeu_cau.cursor !== undefined) {
    const [hang, tao_luc, id] = moCursor(yeu_cau.cursor, 3);
    tham_so.sau = [Number(hang), Number(tao_luc), String(id)];
  }

  const { sql, bind } = cauLenhDanhSachTicket(tham_so);
  const { results } = await db
    .prepare(sql)
    .bind(...bind)
    .all<DongDanhSach>();

  /*
   * Người đang cầm của cả trang trong **một** câu truy vấn (SPEC 19.1): hỏi từng
   * ticket một là N+1, không chịu được ở mốc 200.000 ticket.
   */
  const boi_canh = await boiCanhNguoiCamNhieu(
    db,
    workspace_id,
    results.map((d) => d.id),
  );

  return dungTrang(
    results,
    limit,
    (d) => raDanhSach(d, boi_canh.get(d.id) ?? {}),
    (d) => [d.hang_uu_tien, d.tao_luc, d.id],
  );
}

/* ------------------------------------------------------------------ *
 * Lịch sử của một ticket — SPEC mục 4
 * ------------------------------------------------------------------ */

export interface DongLichSuRa {
  id: string;
  tac_gia: TacGia | null;
  luc: number;
  truong: string;
  gia_tri_cu: string | null;
  gia_tri_moi: string | null;
}

/**
 * Lịch sử một ticket, **phân trang keyset** theo `(luc DESC, id DESC)` — khớp
 * đúng index `ix_ticket_history_ticket` của migration 0001.
 *
 * Phạm vi kiểm bằng `layTicket` trước đó ở tầng route; ở đây vẫn lọc theo
 * `workspace_id` để không có đường nào đọc chéo workspace.
 */
export async function lichSuTicket(
  db: D1Database,
  workspace_id: string,
  ticket_id: string,
  yeu_cau: YeuCauTrang = {},
): Promise<TrangKetQua<DongLichSuRa>> {
  const limit = kiemLimit(yeu_cau.limit);
  const dieu_kien = ['ticket_id = ?', 'workspace_id = ?'];
  const bind: (string | number)[] = [ticket_id, workspace_id];

  if (yeu_cau.cursor !== undefined) {
    const [luc, id] = moCursor(yeu_cau.cursor, 2);
    dieu_kien.push('(luc, id) < (?, ?)');
    bind.push(Number(luc), String(id));
  }

  const { results } = await db
    .prepare(
      `SELECT id, tac_gia_loai, tac_gia_agent_id, luc, truong, gia_tri_cu, gia_tri_moi
         FROM ticket_history WHERE ${dieu_kien.join(' AND ')}
        ORDER BY luc DESC, id DESC LIMIT ?`,
    )
    .bind(...bind, limit + 1)
    .all<{
      id: string;
      tac_gia_loai: string;
      tac_gia_agent_id: string | null;
      luc: number;
      truong: string;
      gia_tri_cu: string | null;
      gia_tri_moi: string | null;
    }>();

  return dungTrang(
    results,
    limit,
    (d) => ({
      id: d.id,
      tac_gia: taoGia(d.tac_gia_loai, d.tac_gia_agent_id),
      luc: d.luc,
      truong: d.truong,
      gia_tri_cu: d.gia_tri_cu,
      gia_tri_moi: d.gia_tri_moi,
    }),
    (d) => [d.luc, d.id],
  );
}

/* ------------------------------------------------------------------ *
 * Bình luận của một ticket — SPEC mục 4, 13
 * ------------------------------------------------------------------ */

/**
 * Bình luận một ticket, **phân trang keyset** theo `(tao_luc DESC, id DESC)` —
 * khớp index `ix_comment_ticket` của 0001, và cũng đúng thứ tự `baton show` cần
 * cho "10 bình luận cuối" (SPEC mục 13).
 *
 * Bình luận đã xoá (chủ xoá mềm — `spec-questions.md` #23) không trả ra.
 */
export async function binhLuanCuaTicket(
  db: D1Database,
  workspace_id: string,
  ticket_id: string,
  yeu_cau: YeuCauTrang = {},
): Promise<TrangKetQua<BinhLuanRa>> {
  const limit = kiemLimit(yeu_cau.limit);
  const dieu_kien = ['ticket_id = ?', 'workspace_id = ?', 'xoa_luc IS NULL'];
  const bind: (string | number)[] = [ticket_id, workspace_id];

  if (yeu_cau.cursor !== undefined) {
    const [tao_luc, id] = moCursor(yeu_cau.cursor, 2);
    dieu_kien.push('(tao_luc, id) < (?, ?)');
    bind.push(Number(tao_luc), String(id));
  }

  const { results } = await db
    .prepare(
      `SELECT id, tac_gia_loai, tac_gia_agent_id, noi_dung, da_sua, tao_luc, cap_nhat_luc
         FROM comment WHERE ${dieu_kien.join(' AND ')}
        ORDER BY tao_luc DESC, id DESC LIMIT ?`,
    )
    .bind(...bind, limit + 1)
    .all<{
      id: string;
      tac_gia_loai: string;
      tac_gia_agent_id: string | null;
      noi_dung: string;
      da_sua: number;
      tao_luc: number;
      cap_nhat_luc: number;
    }>();

  return dungTrang(
    results,
    limit,
    (d) => ({
      id: d.id,
      tac_gia: taoGia(d.tac_gia_loai, d.tac_gia_agent_id),
      noi_dung: d.noi_dung,
      da_sua: d.da_sua === 1,
      tao_luc: d.tao_luc,
      cap_nhat_luc: d.cap_nhat_luc,
    }),
    (d) => [d.tao_luc, d.id],
  );
}

/* ------------------------------------------------------------------ *
 * Cờ "Đang làm mà không ai cầm" — SPEC mục 4 dòng 139, 19.1
 * ------------------------------------------------------------------ */

/**
 * Những ticket **đáng bật cờ** ở thời điểm `bay_gio`.
 *
 * Việc nền là Cron của phần sau; hàm này là phần đọc của nó, và nhận `bay_gio`
 * qua tham số (hàm luật `tinhCoKhongAiCam` cũng vậy) nên test được với thời gian
 * tiêm vào. Dùng index riêng phần `ix_ticket_trong_tay` của migration 0003.
 */
/**
 * Câu SQL của `ticketDangCanBatCo`, tách ra hằng số để **bộ đo và test đo đúng
 * câu đang chạy**. Chép lại câu này ở chỗ khác là cách chắc chắn nhất để
 * `EXPLAIN` in ra một kế hoạch không phải kế hoạch thật.
 */
export const SQL_TICKET_CAN_BAT_CO = `SELECT id, trang_thai, chu_tu_lam, trong_tay_tu_luc, co_khong_ai_cam
     FROM ticket
    WHERE workspace_id = ? AND xoa_luc IS NULL AND trong_tay_tu_luc IS NOT NULL
      AND co_khong_ai_cam <> 1
      AND NOT EXISTS (
        SELECT 1 FROM luot_giao lg
         WHERE lg.workspace_id = ticket.workspace_id
           AND lg.ticket_id = ticket.id
           AND lg.trang_thai IN ('pending', 'in_progress', 'submitted')
      )`;

export async function ticketDangCanBatCo(
  db: D1Database,
  workspace_id: string,
  bay_gio: number,
): Promise<string[]> {
  /*
   * Ba bậc đầu của SPEC 19.1 (lượt `review` mở, lượt `work` mở, lượt `submitted`
   * chờ nghiệm thu) đều có nghĩa là "**có** người cầm", nên loại chúng ngay trong
   * SQL bằng `NOT EXISTS`, không tra bối cảnh cho từng ticket.
   *
   * Hỏi theo lô như đường danh sách thì không được: hàm này quét **cả workspace**,
   * nên số ticket ứng viên không có trần. Bộ đo `do-200k` đã bắt đúng chuyện đó.
   * Sau bộ lọc này, `nguoiDangCam` chỉ còn bậc 4 (`chu_tu_lam`) và bậc 5.
   *
   * Câu con **ràng cả `workspace_id`** (`lg.workspace_id = ticket.workspace_id`),
   * không chỉ `ticket_id`. Hai lý do, lý do đầu là lý do thật:
   *   1. **Mọi đường đọc đều ràng `workspace_id`** — dữ liệu tách theo workspace
   *      từ đầu (SPEC mục 1). Đây từng là chỗ duy nhất trong dự án đọc một bảng
   *      mà không ràng workspace.
   *   2. Hệ quả kỹ thuật: hai cột dẫn đầu của `ix_luot_giao_ticket`
   *      `(workspace_id, ticket_id, …)` thành **đẳng thức**, nên `EXPLAIN` không
   *      còn `ANY(workspace_id)` (skip-scan). Test canh ở `nguoi-cam.test.ts`.
   */
  const { results } = await db
    .prepare(SQL_TICKET_CAN_BAT_CO)
    .bind(workspace_id)
    .all<{
      id: string;
      trang_thai: TrangThaiTicket;
      chu_tu_lam: number;
      trong_tay_tu_luc: number | null;
      co_khong_ai_cam: number;
    }>();

  return results
    .filter((t) =>
      tinhCoKhongAiCam(
        {
          trang_thai: t.trang_thai,
          co_nguoi_cam: nguoiDangCam({ chu_tu_lam: t.chu_tu_lam === 1 }).nguoi !== null,
          trong_tay_tu_luc: t.trong_tay_tu_luc,
        },
        bay_gio,
      ),
    )
    .map((t) => t.id);
}

/* ------------------------------------------------------------------ *
 * Chuỗi lượt giao của một ticket — SPEC mục 5, 14
 * ------------------------------------------------------------------ */

/**
 * Lượt giao của một ticket, **đi qua `layTicket` trước** nên phạm vi đọc và
 * `NOT_FOUND` chỉ có một chỗ quyết (SPEC mục 13: ngoài phạm vi trả 404 để không
 * lộ sự tồn tại).
 */
export async function luotGiaoCuaTicketTrongPhamVi(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  ticket_id: string,
  bay_gio: number,
): Promise<{ ticket_id: string; items: LuotGiaoRa[] }> {
  const ticket = await layTicket(db, ai, workspace_id, ticket_id);
  return {
    ticket_id: ticket.id,
    items: await luotGiaoCuaTicket(db, workspace_id, ticket.id, bay_gio),
  };
}
