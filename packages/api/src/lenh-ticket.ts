/**
 * Lệnh ghi về **ticket** — SPEC mục 4.
 *
 * Luật được cài ở đây:
 *   * Mã `MÃ-số`, số **tăng dần trong dự án, không tái dùng** (mục 1, 4) — cấp số
 *     và chèn ticket nằm trong **cùng một batch** của cửa ghi.
 *   * Tiêu đề bắt buộc, **1–200 ký tự sau khi cắt khoảng trắng**; sai →
 *     `INVALID_INPUT`.
 *   * Mô tả markdown; **8 trường brief**; ưu tiên 5 mức mặc định `none`; nhãn.
 *   * Trạng thái ban đầu: mặc định Cần làm, chọn được **Backlog**, còn lại
 *     `INVALID_INPUT` (mục 4 "Trạng thái khi tạo", T-108 = B, BAT-63).
 *   * **Người chịu trách nhiệm**: chủ, hoặc agent `manager`/`coordinator` —
 *     **không** được là `worker`/`reviewer`. Mặc định là agent quản lý của dự án,
 *     không có thì là chủ.
 *   * **Người đang cầm**: tự tính, không sửa tay (mục 4, 19.1) — xem
 *     `nguoiDangCam` trong `@baton/shared` và `capNhatNguoiCam` dưới đây.
 *   * Liên kết cha, con, liên quan (**hai chiều**, **được khác dự án**),
 *     chặn/bị chặn, và loại **`dieu_phoi`** riêng (19.4).
 *   * **Xoá ticket: chỉ chủ.** Xoá mềm, khôi phục trong 30 ngày, mã **không bao
 *     giờ** dùng lại (bộ đếm chỉ tăng).
 *   * Dự án `paused`/`archived` thì **agent** không tạo được ticket →
 *     `PROJECT_NOT_ACCEPTING`.
 *
 * Luật **chuyển trạng thái** nằm ở `lenh-trang-thai.ts` (gọi module luật thuần
 * `luat-trang-thai.ts` của `@baton/shared`).
 */

import {
  TRUONG_BRIEF,
  UU_TIEN_MAC_DINH,
  HANG_UU_TIEN,
  LOI_DOI_KHONG_KHOI_LON,
  SO_NGAY_KHOI_PHUC_TICKET,
  batBuocKetQuaQuyen,
  kiemDoi,
  kiemKhoiLon,
  quyenSuaKhoiTicket,
  vaiTroSuaKhoiTicket,
  batBuocQuyen,
  batBuocQuyenNoiDieuPhoi,
  kiemBrief,
  kiemChuTuyChon,
  kiemCo,
  kiemDanhSachNhan,
  kiemHanLuc,
  kiemNhanTicket,
  kiemTieuDeTicket,
  kiemTrangThaiKhiTao,
  kiemUuTien,
  maTicket,
  nguoiDangCam,
  nhomTrangThai,
  BatonError,
  type AiGoi,
  type BoiCanhNguoiCam,
  type Brief,
  type LoaiLienKetTicket,
  type TacGia,
  type TrangThaiTicket,
  type UuTien,
} from '@baton/shared';
import {
  batBuocKhongLuuTru,
  batBuocLaChu,
  batBuocNhanViecMoi,
  duAnBatBuoc,
  phamViLuotGiao,
  phamViTaoTicketCon,
  tacGiaCua,
  type BoiCanhLenh,
  type KetQuaHandler,
  type LenhChung,
  type YeuCauGhiLichSu,
} from './lenh-khung.js';
import { locPhamViAgent } from './doc-du-an.js';
import { locPhamViTicket } from './pham-vi-doc.js';
/*
 * Lan toả lên ticket điều phối (SPEC 19.4, 19.11, 19.12 câu 17) sống ở
 * `lenh-trang-thai.ts` cùng `apDungLenTicket`. Dùng **lại** nó ở đây thay vì viết
 * bản thứ hai cho đường xoá/khôi phục — hai bản sẽ lệch nhau ngay lần sửa luật
 * đầu tiên.
 *
 * Đây là một **vòng import** (`lenh-trang-thai.ts` nhập `ticketBatBuoc`,
 * `laTicketDieuPhoi`… từ file này). Vòng này an toàn vì cả hai phía chỉ dùng
 * binding của phía kia **bên trong thân hàm**, không có code tầng cao nào đọc
 * chúng lúc module nạp.
 */
import { lanToiTicketDieuPhoi } from './lenh-trang-thai.js';

/* ------------------------------------------------------------------ *
 * Bộ đếm — SPEC mục 1, 4, 8
 * ------------------------------------------------------------------ */

/**
 * Tăng bộ đếm rồi trả số mới. Chỉ chạy bên trong cửa ghi nên không có đua —
 * đây chính là lý do cửa ghi tồn tại: SPEC mục 4 đòi số **tăng dần trong dự án,
 * không tái dùng**, mà hai request song song đọc cùng một bộ đếm sẽ cấp trùng.
 */
export async function capSo(
  db: D1Database,
  workspace_id: string,
  pham_vi: 'project' | 'workspace',
  khoa: string,
): Promise<{ so: number; cau_lenh: D1PreparedStatement[] }> {
  const dong = await db
    .prepare('SELECT gia_tri FROM bo_dem WHERE workspace_id = ? AND pham_vi = ? AND khoa = ?')
    .bind(workspace_id, pham_vi, khoa)
    .first<{ gia_tri: number }>();

  const so = (dong?.gia_tri ?? 0) + 1;
  return { so, cau_lenh: cauDatBoDem(db, workspace_id, pham_vi, khoa, so) };
}

/**
 * Câu lệnh **đặt** bộ đếm về một giá trị — tách khỏi `capSo` để chỗ cấp **nhiều
 * số trong một lượt ghi** phát được đúng **một** câu với giá trị **cuối**.
 *
 * Vì sao phải tách: `capSo` **bind cứng** `so` vào câu lệnh ngay lúc gọi, nên giữ
 * lại câu của lần gọi đầu rồi tự cộng thêm số cho các lần sau là ghi bộ đếm về
 * giá trị **đầu** — bộ đếm tụt lại sau các `ma_so` đã cấp, và lệnh cấp số **kế
 * tiếp** sẽ đụng `ux_can_chu_ma_so` **mãi mãi** (`tg_bo_dem_chi_tang` không bắt:
 * đặt `N` khi đang `N-1` vẫn là tăng). Lỗi đó đã xảy ra thật ở `muc-xac-nhan.ts`
 * (phần 4 lượt 3b, reviewer bắt) — nên nay chỉ có **một** chỗ dựng câu này.
 */
export function cauDatBoDem(
  db: D1Database,
  workspace_id: string,
  pham_vi: 'project' | 'workspace',
  khoa: string,
  so: number,
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `INSERT INTO bo_dem (workspace_id, pham_vi, khoa, gia_tri) VALUES (?, ?, ?, ?)
         ON CONFLICT (workspace_id, pham_vi, khoa) DO UPDATE SET gia_tri = excluded.gia_tri`,
      )
      .bind(workspace_id, pham_vi, khoa, so),
  ];
}

export interface LenhCapSoTicket extends LenhChung {
  loai: 'cap_so_ticket';
  project_id: string;
}

export async function handlerCapSoTicket(
  lenh: LenhCapSoTicket,
  { db }: BoiCanhLenh,
): Promise<KetQuaHandler<{ so: number }>> {
  /*
   * **Lỗi tìm ra ở lượt 4**: handler này là một lệnh GHI (nó tăng bộ đếm, và bộ
   * đếm **chỉ tăng, không tái dùng** — SPEC mục 4) nhưng không kiểm quyền gì cả.
   * Không có route HTTP nào trỏ vào nó ở phần 1, nên chưa có lỗ thật; nhưng để
   * nguyên thì ngày nào có route (hoặc một lệnh ghép gọi lại nó) là một agent bất
   * kỳ đốt được số ticket của **mọi** dự án, kể cả dự án nó không được vào.
   *
   * Hàng của bảng quyền đúng cho việc này là "Tạo ticket": cấp số chỉ có nghĩa khi
   * sắp tạo một ticket. Không truyền cờ phạm vi lượt giao nào, nên `worker` bị từ
   * chối — đúng mặc định an toàn của `phamViLuotGiao` ở phần 1.
   */
  batBuocQuyen(lenh.ai, 'create_ticket', { project_id: lenh.project_id });

  const { so, cau_lenh } = await capSo(db, lenh.workspace_id, 'project', lenh.project_id);
  return { cau_lenh, ket_qua: { so } };
}

/**
 * Cấp `T-số` kế tiếp cho mục Cần Chủ — SPEC mục 8 (tăng dần toàn workspace,
 * không tái dùng). Phần 4 dùng; để sẵn vì bộ đếm đã có.
 */
export interface LenhCapSoCanChu extends LenhChung {
  loai: 'cap_so_can_chu';
}

export async function handlerCapSoCanChu(
  lenh: LenhCapSoCanChu,
  { db }: BoiCanhLenh,
): Promise<KetQuaHandler<{ so: number }>> {
  /*
   * Cùng lỗi, cùng cách sửa như `handlerCapSoTicket`: hàng của bảng quyền cho
   * `T-số` là "Tạo mục Cần Chủ" (SPEC mục 3, 8; 19.12 câu 18 chốt đúng ô đó), nên
   * `worker` và `reviewer` không đốt được số T.
   *
   * **Không** truyền `project_id`: một `T-số` là số của **workspace**, và mục nó
   * sắp mang có thể là mục **Chung** (19.12 câu 4). Nên ô này là luật **duy nhất**
   * của đường cấp số — y như nó là luật duy nhất của `handlerTaoCanChu` khi
   * `project_id` rỗng, sau khi `spec-questions.md` **#69** chốt hướng **MỞ**. Hai
   * đường **khớp nhau**: không vai nào đốt được số mà không tạo được mục. Ca khoá
   * cặp đó ở `test/can-chu.test.ts` ("hai đường cùng ô `create_ask` khớp nhau");
   * đổi một bên thì ca đó đỏ.
   */
  batBuocQuyen(lenh.ai, 'create_ask', {});

  const { so, cau_lenh } = await capSo(db, lenh.workspace_id, 'workspace', 'ask');
  return { cau_lenh, ket_qua: { so } };
}

/* ------------------------------------------------------------------ *
 * Tra ticket trong cửa ghi
 * ------------------------------------------------------------------ */

/** Một ticket như cửa ghi cần biết để kiểm luật. */
export interface DongTicketGhi extends Brief {
  id: string;
  project_id: string;
  so: number;
  tieu_de: string;
  mo_ta: string | null;
  trang_thai: TrangThaiTicket;
  uu_tien: UuTien;
  hang_uu_tien: number;
  chiu_trach_nhiem_loai: string | null;
  chiu_trach_nhiem_agent_id: string | null;
  han_luc: number | null;
  bat_dau_luc: number | null;
  xong_luc: number | null;
  chu_tu_lam: number;
  trong_tay_tu_luc: number | null;
  trung_voi_ticket_id: string | null;
  ly_do_huy: string | null;
  co_xong_khong_bang_chung: number;
  /** Cờ "ticket không code" — migration 0027, T-31 câu 3.4 A. */
  khong_code: number;
  /** Khối việc lớn 1–99 / NULL — migration 0029, SPEC 20.1. */
  khoi_lon: number | null;
  /** Vị trí trên đồi 0–100 / NULL — migration 0029, SPEC 20.1. */
  doi: number | null;
}

const COT_TICKET_GHI = `id, project_id, so, tieu_de, mo_ta, trang_thai, uu_tien, hang_uu_tien,
   muc_tieu, boi_canh, pham_vi, file_va_nguon, dieu_cam, xong_la_gi, cach_kiem_chung, nop_lai,
   chiu_trach_nhiem_loai, chiu_trach_nhiem_agent_id, han_luc, bat_dau_luc, xong_luc,
   chu_tu_lam, trong_tay_tu_luc, trung_voi_ticket_id, ly_do_huy, co_xong_khong_bang_chung,
   khong_code, khoi_lon, doi`;

/**
 * Tra một ticket **chưa xoá mềm** trong đúng workspace của lệnh.
 * Không có, hoặc thuộc workspace khác → `NOT_FOUND` (SPEC mục 13: 404 cũng dùng
 * khi đối tượng ngoài phạm vi, để **không lộ sự tồn tại**).
 */
export async function ticketBatBuoc(
  db: D1Database,
  workspace_id: string,
  ticket_id: string,
  gom_da_xoa = false,
  /**
   * Có thì chỉ tìm ticket **người gọi thấy được** (`locPhamViTicket`, luật của
   * `layTicket`): ngoài phạm vi ra **cùng dòng `throw`** với id bịa (BAT-57,
   * 19.12 câu 15). Bỏ trống = hành vi cũ (không lọc phạm vi).
   */
  ai?: AiGoi,
): Promise<DongTicketGhi> {
  const dieu_kien = gom_da_xoa ? '' : ' AND xoa_luc IS NULL';
  const loc = ai === undefined ? { sql: '', bind: [] } : locPhamViTicket(ai, 'project_id');
  const d = await db
    .prepare(
      `SELECT ${COT_TICKET_GHI} FROM ticket WHERE id = ? AND workspace_id = ?${dieu_kien}${loc.sql}`,
    )
    .bind(ticket_id, workspace_id, ...loc.bind)
    .first<DongTicketGhi>();
  if (d === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy ticket.' });
  return d;
}

/**
 * Ticket **điều phối** (SPEC 19.4): ticket có ít nhất một liên kết loại
 * `dieu_phoi` **đi ra** (`tu_ticket_id` là ticket điều phối, `den_ticket_id` là
 * ticket dự án).
 *
 * Suy ra từ liên kết, **không** thêm cột cờ: SPEC định nghĩa ticket điều phối
 * bằng chính các liên kết đó, nên một cột cờ riêng sẽ có thể lệch với dữ liệu
 * liên kết, và lúc đó không biết tin cái nào.
 */
export async function laTicketDieuPhoi(
  db: D1Database,
  ticket_id: string,
): Promise<boolean> {
  const d = await db
    .prepare(
      "SELECT 1 AS co FROM ticket_link WHERE tu_ticket_id = ? AND loai = 'dieu_phoi' LIMIT 1",
    )
    .bind(ticket_id)
    .first<{ co: number }>();
  return d !== null;
}

/** Số ticket **con chưa kết** — SPEC mục 4 (`CHILDREN_OPEN`), 19.11. */
export async function soConChuaKet(db: D1Database, ticket_id: string): Promise<number> {
  const d = await db
    .prepare(
      `SELECT count(*) AS n
         FROM ticket_link l JOIN ticket t ON t.id = l.den_ticket_id
        WHERE l.tu_ticket_id = ? AND l.loai = 'parent'
          AND t.xoa_luc IS NULL
          AND t.trang_thai NOT IN ('done', 'canceled', 'duplicate')`,
    )
    .bind(ticket_id)
    .first<{ n: number }>();
  return d?.n ?? 0;
}

/* ------------------------------------------------------------------ *
 * Người chịu trách nhiệm — SPEC mục 4
 * ------------------------------------------------------------------ */

/** Vai trò được làm người chịu trách nhiệm — SPEC mục 4. */
export const VAI_TRO_CHIU_TRACH_NHIEM = ['manager', 'coordinator'] as const;

/**
 * Kiểm người chịu trách nhiệm: **chủ, hoặc một agent `manager`/`coordinator`**
 * (SPEC mục 4). Agent `worker`/`reviewer` bị từ chối — đây là luật của SPEC, nên
 * kiểm ở cửa ghi, không tin client.
 *
 * **Agent ngoài phạm vi người gọi = không tồn tại** (BAT-48, cùng khuôn
 * `nguoiNhanBatBuoc`): câu tra lọc bằng `locPhamViAgent` (đúng định nghĩa của
 * `GET /v1/agent`), nên id của agent người gọi không thấy đi qua **cùng dòng
 * `throw` `NOT_FOUND`** với id không có. Trước BAT-48, id ngoài phạm vi ra thành
 * công (hoặc `INVALID_INPUT` khi vai trò không hợp) còn id bịa ra `NOT_FOUND` —
 * máy dò sự tồn tại, và còn dò được cả **vai trò**. Câu `FROM agent` không alias.
 *
 * **Agent đã tắt** (BAT-49, Chủ chốt T-58 = A): người gọi thấy được mà
 * `disabled = 1` ⇒ `FORBIDDEN`, kiểm **trước** vai trò (khớp `nguoiNhanBatBuoc`).
 * Ticket gán trước khi agent bị tắt giữ nguyên: `agent_hien_tai` là người chịu
 * trách nhiệm đang ghi trên ticket (tạo mới truyền `null`); gửi lại đúng id đó
 * thì không chặn vì tắt — chỉ chặn khi thật sự đổi sang agent đã tắt. Kiểm phạm
 * vi (`NOT_FOUND`) vẫn chạy cho mọi ca.
 *
 * **Không đổi người thì không kiểm lại** (BAT-50, cùng khuôn T-58 = A): gửi lại
 * đúng `agent_hien_tai` thì miễn **cả** kiểm tắt **lẫn** kiểm vai trò — ticket gán
 * agent nay đã đổi vai trò khỏi manager/coordinator vẫn sửa được. Ticket đang gán
 * chủ có `agent_hien_tai = null` (CHECK của bảng `ticket`), nên không miễn nhầm.
 */
async function kiemChiuTrachNhiem(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  loai: unknown,
  agent_id: unknown,
  agent_hien_tai: string | null,
): Promise<TacGia | null> {
  if (loai === null || loai === undefined) return null;
  if (loai === 'owner') return { loai: 'owner' };
  if (loai !== 'agent') {
    throw new BatonError('INVALID_INPUT', {
      message: 'chiu_trach_nhiem_loai phải là "owner" hoặc "agent".',
    });
  }
  if (typeof agent_id !== 'string' || agent_id.length === 0) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Thiếu chiu_trach_nhiem_agent_id cho người chịu trách nhiệm là agent.',
    });
  }
  const loc = locPhamViAgent(ai);
  const d = await db
    .prepare(
      `SELECT id, vai_tro, disabled FROM agent WHERE id = ? AND workspace_id = ?${loc.sql}`,
    )
    .bind(agent_id, workspace_id, ...loc.bind)
    .first<{ id: string; vai_tro: string; disabled: number }>();
  if (d === null) {
    throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy agent chịu trách nhiệm.' });
  }
  // Không đổi người thì không kiểm lại (BAT-50): miễn cả kiểm tắt lẫn kiểm vai trò.
  if (d.id === agent_hien_tai) return { loai: 'agent', agentId: d.id };
  if (d.disabled === 1) {
    throw new BatonError('FORBIDDEN', {
      message: 'Không đặt agent đã bị tắt làm người chịu trách nhiệm.',
    });
  }
  if (!(VAI_TRO_CHIU_TRACH_NHIEM as readonly string[]).includes(d.vai_tro)) {
    throw new BatonError('INVALID_INPUT', {
      message:
        'Người chịu trách nhiệm chỉ là chủ hoặc agent manager/coordinator (SPEC mục 4).',
    });
  }
  return { loai: 'agent', agentId: d.id };
}

/**
 * Người chịu trách nhiệm **mặc định** — SPEC mục 4: "mặc định là agent quản lý
 * của dự án, nếu dự án không có thì là chủ".
 *
 * Agent quản lý của dự án có thể mang vai trò không được chịu trách nhiệm
 * (`lenh-du-an.ts` cố ý không khoá vai trò của `quan_ly_agent_id`). Lúc đó rơi
 * về **chủ**, không ghi một giá trị trái luật mục 4.
 *
 * Agent quản lý **đã tắt** cũng rơi về chủ (BAT-49, `spec-questions.md` #173):
 * cửa ghi không cho đặt agent tắt làm người chịu trách nhiệm, mặc định cũng không.
 */
async function chiuTrachNhiemMacDinh(
  db: D1Database,
  workspace_id: string,
  project_id: string,
): Promise<TacGia> {
  const d = await db
    .prepare(
      `SELECT a.id AS id, a.vai_tro AS vai_tro
         FROM project p JOIN agent a ON a.id = p.quan_ly_agent_id
        WHERE p.id = ? AND p.workspace_id = ? AND a.disabled = 0`,
    )
    .bind(project_id, workspace_id)
    .first<{ id: string; vai_tro: string }>();
  if (d !== null && (VAI_TRO_CHIU_TRACH_NHIEM as readonly string[]).includes(d.vai_tro)) {
    return { loai: 'agent', agentId: d.id };
  }
  return { loai: 'owner' };
}

/* ------------------------------------------------------------------ *
 * Người đang cầm — SPEC mục 4, 19.1
 * ------------------------------------------------------------------ */

/**
 * Câu lệnh cập nhật mốc "không ai cầm từ lúc nào" cho một ticket.
 *
 * **Người đang cầm không bao giờ là một cột được ghi** (SPEC mục 4: "tự tính …
 * không sửa tay"). Cột duy nhất ở đây là `trong_tay_tu_luc` — *lúc* tình trạng
 * "nhóm `active` + không ai cầm" bắt đầu — vì cờ của SPEC 19.1 đòi tình trạng đó
 * **kéo dài 24 giờ**, mà "kéo dài" thì phải có mốc bắt đầu.
 *
 * `boi_canh` mang **dữ liệu lượt giao** của ticket (SPEC 19.1 bậc 1–3), do
 * `boiCanhNguoiCamCua` tra. Bỏ trống là coi như ticket không có lượt nào — chỉ
 * đúng ở những chỗ đã biết chắc điều đó.
 */
export function cauLenhNguoiCam(
  db: D1Database,
  ticket: { id: string; chu_tu_lam: number; trong_tay_tu_luc: number | null },
  trang_thai_moi: TrangThaiTicket,
  bay_gio: number,
  boi_canh: BoiCanhNguoiCam = {},
): D1PreparedStatement[] {
  const cam = nguoiDangCam({ chu_tu_lam: ticket.chu_tu_lam === 1 }, boi_canh);
  const trong = nhomTrangThai(trang_thai_moi) === 'active' && cam.nguoi === null;

  // Đang ở tình trạng đó rồi thì **không** đặt lại mốc: đặt lại là cho đồng hồ
  // 24 giờ chạy lại từ đầu mỗi lần ticket được sửa vì chuyện khác.
  const moi = trong ? (ticket.trong_tay_tu_luc ?? bay_gio) : null;
  if (moi === ticket.trong_tay_tu_luc) return [];

  return [
    db.prepare('UPDATE ticket SET trong_tay_tu_luc = ? WHERE id = ?').bind(moi, ticket.id),
  ];
}

/* ------------------------------------------------------------------ *
 * Tạo ticket — SPEC mục 4
 * ------------------------------------------------------------------ */

export interface LenhTaoTicket extends LenhChung, Partial<Record<keyof Brief, string | null>> {
  loai: 'tao_ticket';
  project_id: string;
  tieu_de: string;
  mo_ta?: string | null;
  uu_tien?: string;
  /** Nhãn (SPEC mục 4, 14). */
  nhan?: string[];
  /** Hạn, epoch milliseconds (SPEC mục 4). */
  han_luc?: number | null;
  /** Người chịu trách nhiệm; để trống thì theo mặc định của SPEC mục 4. */
  chiu_trach_nhiem_loai?: string | null;
  chiu_trach_nhiem_agent_id?: string | null;
  /** Ticket cha, nếu đây là ticket con. */
  ticket_cha_id?: string | null;
  /**
   * Trạng thái ban đầu — SPEC mục 4 "Trạng thái khi tạo" (T-108 = B, BAT-63).
   * Không gửi ⇒ Cần làm; chỉ nhận `todo` / `backlog` (`kiemTrangThaiKhiTao`).
   * Kiểu `unknown`: giá trị đi thẳng từ thân JSON, hàm kiểm mới là hợp đồng.
   */
  trang_thai?: unknown;
  /*
   * KHÔNG có trường nào cho cờ phạm vi quyền ở đây. Cờ
   * "ticket con của lượt mình đang làm" do `phamViLuotGiao` dựng **bên trong**
   * cửa ghi từ dữ liệu trong DB — xem `lenh-khung.ts`. Client khai được cờ đó
   * thì `worker` tạo được ticket tuỳ ý.
   */
}

export interface KetQuaTaoTicket {
  id: string;
  ma: string;
  so: number;
  tieu_de: string;
  trang_thai: string;
}

export async function handlerTaoTicket(
  lenh: LenhTaoTicket,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaTaoTicket>> {
  // Kiểm nhập trước khi làm gì khác: tiêu đề `"   "` phải bị chặn ở đây, không
  // phải ở CHECK của DB (SPEC mục 4 đòi `INVALID_INPUT` kèm thông điệp tiếng Việt).
  const tieu_de = kiemTieuDeTicket(lenh.tieu_de);
  const mo_ta = kiemChuTuyChon(lenh.mo_ta, 'Mô tả ticket', 100_000);
  const brief = kiemBrief(lenh);
  const nhan = kiemDanhSachNhan(lenh.nhan);
  const han_luc = kiemHanLuc(lenh.han_luc);
  const uu_tien: UuTien = lenh.uu_tien === undefined ? UU_TIEN_MAC_DINH : kiemUuTien(lenh.uu_tien);
  /*
   * Trạng thái ban đầu (SPEC mục 4 "Trạng thái khi tạo", T-108 = B, BAT-63): không
   * gửi ⇒ Cần làm, chọn được Backlog, còn lại `INVALID_INPUT`. Kiểm **ở đây**,
   * trước khi tra cha/quyền/DB ⇒ giá trị sai không ghi dòng nào, không cấp số.
   * Quyền **không** đổi theo trạng thái: Backlog và Cần làm cùng nhóm `planned`,
   * cùng một việc "Tạo ticket" của bảng quyền mục 3.
   */
  const trang_thai = kiemTrangThaiKhiTao(lenh.trang_thai);

  // Ticket cha phải tra **trước** khi kiểm quyền: ô "ticket con của lượt mình
  // đang làm" cần biết có cha hay không, và cha đó là cái nào.
  //
  // Tra **trong cái người gọi thấy được** (BAT-58, 19.12 câu 15): ticket cha ngoài
  // dự án người gọi được vào đi qua **cùng dòng `throw`** với id bịa. Trước BAT-58
  // câu tra cả workspace, nên cha thật ngoài phạm vi ra 403 (hoặc thành công —
  // manager tạo con của ticket dự án khác) còn id bịa ra 404: một máy dò.
  let ticket_cha_id: string | null = null;
  if (lenh.ticket_cha_id !== null && lenh.ticket_cha_id !== undefined) {
    const loc = locPhamViTicket(lenh.ai, 'project_id');
    const cha = await db
      .prepare(
        `SELECT id FROM ticket WHERE id = ? AND workspace_id = ? AND xoa_luc IS NULL${loc.sql}`,
      )
      .bind(lenh.ticket_cha_id, lenh.workspace_id, ...loc.bind)
      .first<{ id: string }>();
    if (cha === null) {
      throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy ticket cha.' });
    }
    ticket_cha_id = cha.id;
  }

  /*
   * Quyền **trước** cả việc tra dự án.
   *
   * Hai lý do, lý do thứ hai là của reviewer lượt 3:
   *   1. Agent không được vào dự án thì không được biết dự án đó đang tạm dừng
   *      hay không.
   *   2. **Không lộ sự tồn tại của dự án** (SPEC mục 13, 17.7). Tra dự án trước
   *      thì `project_id` không tồn tại ra `NOT_FOUND`/404 còn `project_id` có
   *      thật mà agent không được vào ra `FORBIDDEN`/403 — hai mã khác nhau là
   *      một **máy trả lời** cho câu "dự án này có thật không", nên agent dò được
   *      danh sách dự án mình không được vào. Kiểm quyền trước thì cả hai ca đều
   *      ra 403 (agent ngoài phạm vi không thoả `vaoDuocDuAn` dù dự án có hay
   *      không), nên không còn gì để dò. Xem `spec-questions.md` #24.
   *
   * Cờ phạm vi dựng **ở đây**, từ DB, không bao giờ từ thân request.
   */
  batBuocQuyen(lenh.ai, 'create_ticket', {
    project_id: lenh.project_id,
    ticket_cha_cua_luot_minh: phamViTaoTicketCon(
      ticket_cha_id,
      await phamViLuotGiao(db, lenh.ai, lenh.workspace_id, [ticket_cha_id]),
    ),
  });

  const du_an = await duAnBatBuoc(db, lenh.workspace_id, lenh.project_id);

  // "Dự án đang tạm dừng hoặc lưu trữ thì **agent** không tạo được ticket"
  // (SPEC mục 4). Chữ "agent" là chủ ý: `paused` nghĩa là "agent không nhận việc
  // mới", còn chủ vẫn phải lên kế hoạch được cho một dự án đang tạm dừng.
  // Riêng `archived` thì chỉ đọc với mọi người (SPEC mục 2).
  if (lenh.ai.loai === 'agent') batBuocNhanViecMoi(du_an);
  else batBuocKhongLuuTru(du_an);

  // Người chịu trách nhiệm: client khai thì kiểm, không khai thì mặc định SPEC.
  const chiu_trach_nhiem =
    lenh.chiu_trach_nhiem_loai === undefined
      ? await chiuTrachNhiemMacDinh(db, lenh.workspace_id, lenh.project_id)
      : ((await kiemChiuTrachNhiem(
          db,
          lenh.ai,
          lenh.workspace_id,
          lenh.chiu_trach_nhiem_loai,
          lenh.chiu_trach_nhiem_agent_id,
          null,
        )) ?? { loai: 'owner' });

  const { so, cau_lenh: cau_lenh_bo_dem } = await capSo(
    db,
    lenh.workspace_id,
    'project',
    lenh.project_id,
  );

  const id = crypto.randomUUID();
  const tac_gia = tacGiaCua(lenh.ai);

  const cau_lenh = [
    ...cau_lenh_bo_dem,
    db
      .prepare(
        `INSERT INTO ticket
           (id, workspace_id, project_id, so, tieu_de, mo_ta, trang_thai, uu_tien, hang_uu_tien,
            muc_tieu, boi_canh, pham_vi, file_va_nguon, dieu_cam, xong_la_gi, cach_kiem_chung, nop_lai,
            chiu_trach_nhiem_loai, chiu_trach_nhiem_agent_id, han_luc,
            nguoi_tao_loai, nguoi_tao_agent_id, tao_luc, cap_nhat_luc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        lenh.workspace_id,
        lenh.project_id,
        so,
        tieu_de,
        mo_ta,
        trang_thai,
        uu_tien,
        HANG_UU_TIEN[uu_tien],
        ...TRUONG_BRIEF.map((t) => brief[t] ?? null),
        chiu_trach_nhiem.loai,
        chiu_trach_nhiem.agentId ?? null,
        han_luc,
        tac_gia.loai,
        tac_gia.agentId ?? null,
        bay_gio,
        bay_gio,
      ),
  ];

  if (ticket_cha_id !== null) {
    // `parent` có hướng: `tu_ticket_id` là **cha** (migration 0001).
    cau_lenh.push(
      db
        .prepare(
          `INSERT INTO ticket_link (workspace_id, tu_ticket_id, den_ticket_id, loai, tao_luc)
           VALUES (?, ?, ?, 'parent', ?)`,
        )
        .bind(lenh.workspace_id, ticket_cha_id, id, bay_gio),
    );
  }

  for (const n of nhan) {
    cau_lenh.push(
      db
        .prepare(
          `INSERT INTO ticket_label (workspace_id, ticket_id, nhan, tao_luc) VALUES (?, ?, ?, ?)`,
        )
        .bind(lenh.workspace_id, id, n, bay_gio),
    );
  }

  return {
    cau_lenh,
    danh_thuc: [`ticket:${lenh.project_id}`],
    ket_qua: {
      id,
      ma: maTicket(du_an.ma, so),
      so,
      tieu_de,
      trang_thai,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Đổi tiêu đề ticket — SPEC mục 4
 * ------------------------------------------------------------------ */

export interface LenhDoiTieuDe extends LenhChung {
  loai: 'doi_tieu_de';
  ticket_id: string;
  tieu_de: string;
  /*
   * KHÔNG có trường nào cho cờ "ticket của lượt mình" ở đây — xem ghi chú ở
   * `LenhTaoTicket` và `phamViLuotGiao` trong `lenh-khung.ts`.
   */
}

export async function handlerDoiTieuDe(
  lenh: LenhDoiTieuDe,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<{ tieu_de: string }>> {
  // **Kiểm nhập trước.** Lượt 1 thiếu đúng dòng này, nên tiêu đề `"   "` ghi
  // thẳng vào DB, lệch SPEC mục 4 ("1–200 ký tự sau khi cắt khoảng trắng",
  // `INVALID_INPUT`). Và ghi `tieu_de` đã kiểm, không ghi `lenh.tieu_de` thô.
  const tieu_de = kiemTieuDeTicket(lenh.tieu_de);

  // BAT-58: lọc phạm vi đọc ngay trong câu tra — chữ chú thích cũ ("ngoài phạm
  // vi … NOT_FOUND") trước đây không đúng với câu tra cả workspace.
  const loc = locPhamViTicket(lenh.ai, 'project_id');
  const cu = await db
    .prepare(
      `SELECT tieu_de, project_id FROM ticket
        WHERE id = ? AND workspace_id = ? AND xoa_luc IS NULL${loc.sql}`,
    )
    .bind(lenh.ticket_id, lenh.workspace_id, ...loc.bind)
    .first<{ tieu_de: string; project_id: string }>();

  // Ngoài phạm vi hoặc không tồn tại đều trả NOT_FOUND, để không lộ sự tồn tại
  // của đối tượng — SPEC mục 13, 19.12 câu 15.
  if (cu === null) throw new BatonError('NOT_FOUND');

  // SPEC mục 3 không có hàng riêng cho "sửa trường của ticket"; dùng hàng gần
  // nhất là "Đổi trạng thái ticket" (cùng phạm vi: ticket của lượt mình với
  // worker, trong dự án với manager) — xem `spec-questions.md` #12.
  // Cờ phạm vi dựng từ DB bên trong cửa ghi, không bao giờ từ thân request.
  batBuocQuyen(lenh.ai, 'change_status', {
    project_id: cu.project_id,
    ticket_id: lenh.ticket_id,
    ticket_cua_luot_minh: (
      await phamViLuotGiao(db, lenh.ai, lenh.workspace_id, [lenh.ticket_id])
    ).ticketCuaLuotMinh(lenh.ticket_id),
  });

  // Dự án lưu trữ là chỉ đọc (SPEC mục 2). `paused` thì vẫn sửa được: SPEC chỉ
  // nói paused là "không nhận **việc mới**".
  batBuocKhongLuuTru(await duAnBatBuoc(db, lenh.workspace_id, cu.project_id));

  return {
    cau_lenh: [
      db
        .prepare('UPDATE ticket SET tieu_de = ?, cap_nhat_luc = ? WHERE id = ?')
        .bind(tieu_de, bay_gio, lenh.ticket_id),
    ],
    lich_su: [
      {
        ticket_id: lenh.ticket_id,
        truong: 'tieu_de',
        gia_tri_cu: cu.tieu_de,
        gia_tri_moi: tieu_de,
      },
    ],
    danh_thuc: [`ticket:${lenh.ticket_id}`],
    ket_qua: { tieu_de },
  };
}

/* ------------------------------------------------------------------ *
 * Sửa ticket (mọi trường trừ trạng thái) — SPEC mục 4
 * ------------------------------------------------------------------ */

export interface LenhSuaTicket
  extends LenhChung,
    Partial<Record<keyof Brief, string | null>> {
  loai: 'sua_ticket';
  ticket_id: string;
  tieu_de?: string;
  mo_ta?: string | null;
  uu_tien?: string;
  han_luc?: number | null;
  chiu_trach_nhiem_loai?: string | null;
  chiu_trach_nhiem_agent_id?: string | null;
  /**
   * Cờ **"ticket không code"** (migration 0027, T-31 câu 3.4 A) — **chỉ chủ**.
   * Bật cờ là đổi luật cổng Xong của ticket, nên để agent tự bật là mở đường vòng
   * qua cổng (cùng lý lẽ 19.12 câu 46 cho liên kết `dieu_phoi`).
   */
  khong_code?: unknown;
  /**
   * **Khối việc lớn** — SPEC 20.1: số thứ tự 1–99, `null` = bỏ khối lớn. Chủ,
   * `coordinator`, `manager` của dự án. Bỏ khối lớn trên ticket có `doi` ⇒ `doi`
   * cũng về NULL cùng lệnh (câu hỏi SPEC (c)).
   */
  khoi_lon?: unknown;
  /**
   * **Vị trí trên đồi** — SPEC 20.1: 0–100, `null` = xoá (câu hỏi SPEC (d)). Chỉ
   * cho ticket có `khoi_lon` **sau khi áp cả lệnh**, khác ⇒ `INVALID_INPUT`.
   */
  doi?: unknown;
}

export interface KetQuaSuaTicket {
  id: string;
  /** Trường đã đổi giá trị thật. */
  da_doi: string[];
}

export async function handlerSuaTicket(
  lenh: LenhSuaTicket,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaSuaTicket>> {
  /*
   * Cờ "ticket không code" — **chỉ chủ** (T-31 câu 3.4 A). Chặn **đầu tiên**, trước
   * cả kiểm nhập và tra ticket: agent gửi trường này thì luôn `FORBIDDEN`, dù giá
   * trị sai hay ticket không có — không có cách nào dò được gì qua trường chỉ-chủ.
   *
   * Đổi cờ **không kéo trạng thái** và không kiểm lại cổng (19.12 câu 58: chỉ lượt
   * ghi thêm/đổi bằng chứng mới kéo trạng thái) — giống chủ đổi cờ dự án ở
   * `handlerSuaDuAn`. Lần kiểm cổng kế tiếp đọc cờ mới (19.10). Cờ "cần review lại"
   * không đọc `khong_code`, nên cũng không có gì để bật/tắt.
   */
  if (lenh.khong_code !== undefined) {
    batBuocLaChu(lenh.ai, 'bật/tắt được cờ "ticket không code"');
  }

  /*
   * **Khối lớn / đồi — SPEC 20.1, cột "Ai sửa": chủ, `coordinator`, `manager` của
   * dự án.** Vai `worker`/`reviewer` bị chặn **ở đây**, trước kiểm nhập và tra
   * ticket (cùng nếp `khong_code`: không kênh dò). Phần "của dự án" cần ticket, nên
   * kiểm sau khi tra.
   */
  const co_khoi = lenh.khoi_lon !== undefined || lenh.doi !== undefined;
  if (co_khoi) batBuocKetQuaQuyen(vaiTroSuaKhoiTicket(lenh.ai));
  const khoi_lon = lenh.khoi_lon === undefined ? undefined : kiemKhoiLon(lenh.khoi_lon);
  const doi = lenh.doi === undefined ? undefined : kiemDoi(lenh.doi);

  // Kiểm nhập **trước** khi tra ticket: tiêu đề xấu phải ra `INVALID_INPUT` dù
  // ticket có tồn tại hay không, nếu không lỗi nhập bị `NOT_FOUND` che mất.
  const dat: { cot: string; gia_tri: string | number | null }[] = [];

  if (lenh.khong_code !== undefined) {
    dat.push({ cot: 'khong_code', gia_tri: kiemCo(lenh.khong_code, 'khong_code') ? 1 : 0 });
  }

  if (lenh.tieu_de !== undefined) {
    dat.push({ cot: 'tieu_de', gia_tri: kiemTieuDeTicket(lenh.tieu_de) });
  }
  if (lenh.mo_ta !== undefined) {
    dat.push({ cot: 'mo_ta', gia_tri: kiemChuTuyChon(lenh.mo_ta, 'Mô tả ticket', 100_000) });
  }
  if (lenh.uu_tien !== undefined) {
    const uu_tien = kiemUuTien(lenh.uu_tien);
    dat.push({ cot: 'uu_tien', gia_tri: uu_tien });
    // `hang_uu_tien` là cột sắp xếp, có CHECK buộc khớp `uu_tien` (0001).
    dat.push({ cot: 'hang_uu_tien', gia_tri: HANG_UU_TIEN[uu_tien] });
  }
  if (lenh.han_luc !== undefined) {
    dat.push({ cot: 'han_luc', gia_tri: kiemHanLuc(lenh.han_luc) });
  }
  const brief = kiemBrief(lenh);
  for (const truong of TRUONG_BRIEF) {
    if (lenh[truong] !== undefined) dat.push({ cot: truong, gia_tri: brief[truong] ?? null });
  }

  // Ticket người gọi không thấy ⇒ `NOT_FOUND` giống hệt id bịa (BAT-58, 19.12
  // câu 15), **trước** quyền và mọi luật nghiệp vụ.
  const cu = await ticketBatBuoc(db, lenh.workspace_id, lenh.ticket_id, false, lenh.ai);

  /*
   * Hàng "Đổi trạng thái ticket" dùng chung cho mọi lần sửa trường
   * (`spec-questions.md` #12) — **trừ** lệnh chỉ mang `khoi_lon`/`doi`: hai trường
   * đó có cột "Ai sửa" riêng của 20.1 (kiểm ngay dưới), không mượn hàng của mục 3.
   * Lệnh mang cả hai loại trường thì phải qua **cả hai** cửa.
   */
  const chi_khoi = co_khoi && dat.length === 0 && lenh.chiu_trach_nhiem_loai === undefined;
  if (!chi_khoi) {
    batBuocQuyen(lenh.ai, 'change_status', {
      project_id: cu.project_id,
      ticket_id: lenh.ticket_id,
      ticket_cua_luot_minh: (
        await phamViLuotGiao(db, lenh.ai, lenh.workspace_id, [lenh.ticket_id])
      ).ticketCuaLuotMinh(lenh.ticket_id),
    });
  }
  if (co_khoi) batBuocKetQuaQuyen(quyenSuaKhoiTicket(lenh.ai, cu.project_id));

  batBuocKhongLuuTru(await duAnBatBuoc(db, lenh.workspace_id, cu.project_id));

  /*
   * **`doi` chỉ cho khối lớn** (20.1) — xét trên ticket **sau khi áp cả lệnh**:
   *   * lệnh đặt `doi` (khác null) mà sau lệnh không có `khoi_lon` ⇒ `INVALID_INPUT`
   *     (kể cả lệnh tắt `khoi_lon` và đặt `doi` cùng lúc);
   *   * lệnh tắt `khoi_lon` trên ticket đang có `doi` ⇒ `doi` về NULL cùng lệnh,
   *     ghi lịch sử cả hai (câu hỏi SPEC (c)) — giữ bất biến của trigger 0029.
   */
  if (co_khoi) {
    const khoi_sau = khoi_lon === undefined ? cu.khoi_lon : khoi_lon;
    if (doi !== undefined && doi !== null && khoi_sau === null) {
      throw new BatonError('INVALID_INPUT', { message: LOI_DOI_KHONG_KHOI_LON });
    }
    if (khoi_lon !== undefined) dat.push({ cot: 'khoi_lon', gia_tri: khoi_lon });
    if (doi !== undefined) dat.push({ cot: 'doi', gia_tri: doi });
    else if (khoi_sau === null && cu.doi !== null) dat.push({ cot: 'doi', gia_tri: null });
  }

  // Người chịu trách nhiệm tra agent trong DB, nên làm **sau** khi có quyền.
  if (lenh.chiu_trach_nhiem_loai !== undefined) {
    const ctn = await kiemChiuTrachNhiem(
      db,
      lenh.ai,
      lenh.workspace_id,
      lenh.chiu_trach_nhiem_loai,
      lenh.chiu_trach_nhiem_agent_id,
      // Gửi lại đúng agent đang ghi trên ticket (không đổi người) thì miễn CẢ kiểm
      // tắt (BAT-49) LẪN kiểm vai trò (BAT-50); kiểm phạm vi (NOT_FOUND) vẫn chạy
      // mọi ca, kể cả khi gửi lại đúng người.
      cu.chiu_trach_nhiem_agent_id,
    );
    dat.push({ cot: 'chiu_trach_nhiem_loai', gia_tri: ctn?.loai ?? null });
    dat.push({ cot: 'chiu_trach_nhiem_agent_id', gia_tri: ctn?.agentId ?? null });
  }

  if (dat.length === 0) {
    throw new BatonError('INVALID_INPUT', { message: 'Không có trường nào để sửa.' });
  }

  const nguyen = cu as unknown as Record<string, string | number | null>;
  const thay_doi = dat.filter((d) => nguyen[d.cot] !== d.gia_tri);
  if (thay_doi.length === 0) {
    return { cau_lenh: [], ket_qua: { id: lenh.ticket_id, da_doi: [] } };
  }

  const gan = thay_doi.map((d) => `${d.cot} = ?`).join(', ');

  // **Mọi** trường đổi đều ghi lịch sử, không chỉ trạng thái (SPEC mục 4).
  // Đổi nhiều trường trong một lệnh → nhiều dòng, **cùng batch** với thay đổi.
  const lich_su: YeuCauGhiLichSu[] = thay_doi.map((d) => ({
    ticket_id: lenh.ticket_id,
    truong: d.cot,
    gia_tri_cu: nguyen[d.cot] === null || nguyen[d.cot] === undefined ? null : String(nguyen[d.cot]),
    gia_tri_moi: d.gia_tri === null ? null : String(d.gia_tri),
  }));

  return {
    cau_lenh: [
      db
        .prepare(`UPDATE ticket SET ${gan}, cap_nhat_luc = ? WHERE id = ?`)
        .bind(...thay_doi.map((d) => d.gia_tri), bay_gio, lenh.ticket_id),
    ],
    lich_su,
    danh_thuc: [`ticket:${lenh.ticket_id}`, `ticket:${cu.project_id}`],
    ket_qua: { id: lenh.ticket_id, da_doi: thay_doi.map((d) => d.cot) },
  };
}

/* ------------------------------------------------------------------ *
 * Nhãn — SPEC mục 4, 14
 * ------------------------------------------------------------------ */

export interface LenhDatNhan extends LenhChung {
  loai: 'dat_nhan';
  ticket_id: string;
  nhan: string;
  /** `true` gắn, `false` bỏ. */
  gan: boolean;
}

export async function handlerDatNhan(
  lenh: LenhDatNhan,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<{ nhan: string; gan: boolean }>> {
  const nhan = kiemNhanTicket(lenh.nhan);
  const gan = kiemCo(lenh.gan, 'gan');

  // Ngoài phạm vi ⇒ `NOT_FOUND` giống hệt id bịa (BAT-58, 19.12 câu 15).
  const cu = await ticketBatBuoc(db, lenh.workspace_id, lenh.ticket_id, false, lenh.ai);

  /*
   * Gắn và **bỏ** nhãn đều đi qua hàng "Đổi trạng thái ticket" của bảng quyền,
   * không qua hàng "Xoá bất cứ thứ gì".
   *
   * Hàng "Xoá bất cứ thứ gì — không bao giờ" (SPEC mục 3) nói về xoá **đối
   * tượng** (ticket, bằng chứng, dòng lịch sử, mục Cần Chủ). Bỏ một nhãn là đặt
   * lại giá trị của một trường, cùng loại việc với đổi ưu tiên, và vẫn để lại dấu
   * vết trong lịch sử. Xem `spec-questions.md` #20.
   */
  batBuocQuyen(lenh.ai, 'change_status', {
    project_id: cu.project_id,
    ticket_id: lenh.ticket_id,
    ticket_cua_luot_minh: (
      await phamViLuotGiao(db, lenh.ai, lenh.workspace_id, [lenh.ticket_id])
    ).ticketCuaLuotMinh(lenh.ticket_id),
  });
  batBuocKhongLuuTru(await duAnBatBuoc(db, lenh.workspace_id, cu.project_id));

  const dang_co = await db
    .prepare('SELECT 1 AS co FROM ticket_label WHERE ticket_id = ? AND nhan = ?')
    .bind(lenh.ticket_id, nhan)
    .first<{ co: number }>();

  if (gan === (dang_co !== null)) {
    // Không đổi gì: không ghi lịch sử (SPEC mục 4 ghi *thay đổi*, không ghi lệnh).
    return { cau_lenh: [], ket_qua: { nhan, gan } };
  }

  const cau_lenh = gan
    ? [
        db
          .prepare(
            'INSERT INTO ticket_label (workspace_id, ticket_id, nhan, tao_luc) VALUES (?, ?, ?, ?)',
          )
          .bind(lenh.workspace_id, lenh.ticket_id, nhan, bay_gio),
      ]
    : [
        db
          .prepare('DELETE FROM ticket_label WHERE ticket_id = ? AND nhan = ?')
          .bind(lenh.ticket_id, nhan),
      ];

  cau_lenh.push(
    db.prepare('UPDATE ticket SET cap_nhat_luc = ? WHERE id = ?').bind(bay_gio, lenh.ticket_id),
  );

  return {
    cau_lenh,
    lich_su: [
      {
        ticket_id: lenh.ticket_id,
        truong: 'nhan',
        gia_tri_cu: gan ? null : nhan,
        gia_tri_moi: gan ? nhan : null,
      },
    ],
    danh_thuc: [`ticket:${lenh.ticket_id}`],
    ket_qua: { nhan, gan },
  };
}

/* ------------------------------------------------------------------ *
 * Liên kết ticket — SPEC mục 4 + 19.4
 * ------------------------------------------------------------------ */

/**
 * Loại liên kết lệnh này nối được.
 *
 * `parent` **không** nằm ở đây: ticket cha đặt lúc tạo (`tao_ticket`), vì đổi cha
 * về sau là đổi cả luật `CHILDREN_OPEN` của cây — SPEC không nói hành vi đó, nên
 * không tự làm (`spec-questions.md` #21).
 */
export const LOAI_NOI_DUOC = ['related', 'blocks', 'dieu_phoi'] as const satisfies readonly LoaiLienKetTicket[];

export interface LenhNoiTicket extends LenhChung {
  loai: 'noi_ticket';
  /** Bên "từ": với `blocks` là bên **chặn**; với `dieu_phoi` là **ticket điều phối**. */
  tu_ticket_id: string;
  den_ticket_id: string;
  loai_lien_ket: string;
}

export async function handlerNoiTicket(
  lenh: LenhNoiTicket,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<{ tu_ticket_id: string; den_ticket_id: string; loai_lien_ket: string }>> {
  if (!(LOAI_NOI_DUOC as readonly string[]).includes(lenh.loai_lien_ket)) {
    throw new BatonError('INVALID_INPUT', {
      message: `Loại liên kết phải là một trong: ${LOAI_NOI_DUOC.join(', ')}.`,
    });
  }
  const loai_lien_ket = lenh.loai_lien_ket as (typeof LOAI_NOI_DUOC)[number];

  /*
   * **Chỉ chủ và agent vai `coordinator`** nối được `dieu_phoi` — SPEC 19.12 câu
   * 16 (chốt `spec-questions.md` #25). Kiểm **trước khi tra ticket** để agent sai
   * vai nhận đúng một phản hồi 403 dù hai id có thật hay không — nếu không, cặp
   * (403, 404) lại thành một máy dò sự tồn tại, đúng thứ 19.12 câu 15 cấm.
   *
   * Đây là điều kiện **cộng thêm**: `batBuocQuyen('change_status', ...)` trên cả
   * hai đầu nối ở dưới vẫn chạy nguyên, nên `coordinator` không được vào dự án
   * vẫn bị chặn. `related` và `blocks` không đi qua đây.
   */
  if (loai_lien_ket === 'dieu_phoi') batBuocQuyenNoiDieuPhoi(lenh.ai);

  if (lenh.tu_ticket_id === lenh.den_ticket_id) {
    throw new BatonError('INVALID_INPUT', { message: 'Không nối ticket với chính nó.' });
  }

  // Cả hai đầu phải tồn tại trong **cùng workspace**; dự án thì **được khác**
  // (SPEC mục 4: "liên quan (hai chiều, được khác dự án)").
  //
  // **Cả hai đầu** tra trong cái người gọi thấy được (BAT-58, 19.12 câu 15): đầu
  // nào ngoài phạm vi ⇒ cùng `NOT_FOUND` với id bịa. Trước BAT-58 đầu thật ngoài
  // phạm vi ra 403 (cửa dự án của `batBuocQuyen` dưới đây) còn id bịa ra 404.
  // "Được khác dự án" vẫn đúng cho người thấy cả hai dự án.
  const tu = await ticketBatBuoc(db, lenh.workspace_id, lenh.tu_ticket_id, false, lenh.ai);
  const den = await ticketBatBuoc(db, lenh.workspace_id, lenh.den_ticket_id, false, lenh.ai);

  // Phải có quyền trên **cả hai** dự án: nối hai ticket là sửa cả hai.
  const pham_vi = await phamViLuotGiao(db, lenh.ai, lenh.workspace_id, [tu.id, den.id]);
  for (const t of [tu, den]) {
    batBuocQuyen(lenh.ai, 'change_status', {
      project_id: t.project_id,
      ticket_id: t.id,
      ticket_cua_luot_minh: pham_vi.ticketCuaLuotMinh(t.id),
    });
    batBuocKhongLuuTru(await duAnBatBuoc(db, lenh.workspace_id, t.project_id));
  }

  return {
    cau_lenh: [
      db
        .prepare(
          `INSERT INTO ticket_link (workspace_id, tu_ticket_id, den_ticket_id, loai, tao_luc)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (tu_ticket_id, den_ticket_id, loai) DO NOTHING`,
        )
        .bind(lenh.workspace_id, tu.id, den.id, loai_lien_ket, bay_gio),
    ],
    /*
     * **Hai chiều lưu một dòng.** `related` và `dieu_phoi` là quan hệ đối xứng về
     * mặt hiển thị ("xem ticket nào cũng thấy ticket kia" — SPEC mục 4, 19.4),
     * nhưng lưu hai dòng ngược nhau thì phải giữ chúng đồng bộ mãi mãi. Lưu một
     * dòng và **đọc cả hai chiều** (index `ix_ticket_link_nguoc` của 0001 cho
     * chiều ngược) thì không có cách nào lệch.
     */
    lich_su: [
      {
        ticket_id: tu.id,
        truong: `lien_ket:${loai_lien_ket}`,
        gia_tri_cu: null,
        gia_tri_moi: den.id,
      },
      {
        ticket_id: den.id,
        truong: `lien_ket_nguoc:${loai_lien_ket}`,
        gia_tri_cu: null,
        gia_tri_moi: tu.id,
      },
    ],
    danh_thuc: [`ticket:${tu.id}`, `ticket:${den.id}`],
    ket_qua: { tu_ticket_id: tu.id, den_ticket_id: den.id, loai_lien_ket },
  };
}

/* ------------------------------------------------------------------ *
 * Xoá mềm và khôi phục — SPEC mục 4 ("chỉ chủ", 30 ngày)
 * ------------------------------------------------------------------ */

export interface LenhXoaTicket extends LenhChung {
  loai: 'xoa_ticket';
  ticket_id: string;
}

/**
 * Xoá ticket — **chỉ chủ** (SPEC mục 4). Xoá **mềm**: ticket khôi phục được
 * trong 30 ngày, và **mã không bao giờ dùng lại** (bộ đếm chỉ tăng, trigger
 * `tg_bo_dem_chi_tang` của 0001 ép).
 *
 * Đây là xoá **dữ liệu ticket trong DB của sản phẩm**, không phải xoá file trong
 * repo (danh sách cấm của CLAUDE.md mục 4 nói về cái sau).
 */
export async function handlerXoaTicket(
  lenh: LenhXoaTicket,
  { db, bay_gio, cong }: BoiCanhLenh,
): Promise<KetQuaHandler<{ id: string; xoa_luc: number }>> {
  batBuocLaChu(lenh.ai, 'xoá được ticket');

  const cu = await ticketBatBuoc(db, lenh.workspace_id, lenh.ticket_id);
  batBuocKhongLuuTru(await duAnBatBuoc(db, lenh.workspace_id, cu.project_id));

  /*
   * Ticket xoá mềm **không tính** vào tập ticket dự án mà một ticket điều phối
   * theo — SPEC 19.12 câu 17 (chốt `spec-questions.md` #26). Nên xoá một ticket dự
   * án phải tính lại trạng thái ticket điều phối, **trong cùng batch** với lệnh
   * xoá: tách ra hai lần ghi là mở một cửa sổ mà ticket điều phối sai trạng thái.
   *
   * Xoá ticket **cuối cùng** của tập thì `trangThaiDieuPhoiTheo([])` trả
   * `{ doi: false }` ⇒ ticket điều phối **giữ nguyên**, không về Huỷ, không về
   * Cần làm.
   */
  const dp = await lanToiTicketDieuPhoi(
    db,
    lenh.workspace_id,
    { loai: 'xoa', ticket_id: lenh.ticket_id },
    bay_gio,
    // `cong` chỉ đi tiếp vào nhánh cờ "cần review lại" (19.3) của ticket điều phối —
    // lan toả không kiểm cổng lần nào. Xem `lanToiTicketDieuPhoi`.
    cong,
  );

  return {
    cau_lenh: [
      db
        .prepare('UPDATE ticket SET xoa_luc = ?, cap_nhat_luc = ? WHERE id = ?')
        .bind(bay_gio, bay_gio, lenh.ticket_id),
      ...dp.cau_lenh,
    ],
    lich_su: [
      { ticket_id: lenh.ticket_id, truong: 'xoa_luc', gia_tri_cu: null, gia_tri_moi: String(bay_gio) },
      ...dp.lich_su,
    ],
    danh_thuc: [`ticket:${lenh.ticket_id}`, `ticket:${cu.project_id}`, ...dp.danh_thuc],
    ket_qua: { id: lenh.ticket_id, xoa_luc: bay_gio },
  };
}

export interface LenhKhoiPhucTicket extends LenhChung {
  loai: 'khoi_phuc_ticket';
  ticket_id: string;
}

/** Số milliseconds của hạn khôi phục — SPEC mục 4 (30 ngày). */
export const HAN_KHOI_PHUC_MS = SO_NGAY_KHOI_PHUC_TICKET * 24 * 60 * 60 * 1000;

export async function handlerKhoiPhucTicket(
  lenh: LenhKhoiPhucTicket,
  { db, bay_gio, cong }: BoiCanhLenh,
): Promise<KetQuaHandler<{ id: string }>> {
  batBuocLaChu(lenh.ai, 'khôi phục được ticket');

  const d = await db
    .prepare(
      'SELECT id, project_id, trang_thai, xoa_luc FROM ticket WHERE id = ? AND workspace_id = ?',
    )
    .bind(lenh.ticket_id, lenh.workspace_id)
    .first<{
      id: string;
      project_id: string;
      trang_thai: TrangThaiTicket;
      xoa_luc: number | null;
    }>();
  if (d === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy ticket.' });
  if (d.xoa_luc === null) {
    throw new BatonError('INVALID_INPUT', { message: 'Ticket này chưa bị xoá.' });
  }
  // "Khôi phục được **trong 30 ngày**" — SPEC mục 4. Quá hạn thì không khôi phục
  // được nữa; dòng vẫn còn trong DB nhưng là chỉ đọc với mọi đường.
  if (bay_gio - d.xoa_luc > HAN_KHOI_PHUC_MS) {
    throw new BatonError('INVALID_INPUT', {
      message: `Quá ${String(SO_NGAY_KHOI_PHUC_TICKET)} ngày, không khôi phục được nữa.`,
    });
  }
  batBuocKhongLuuTru(await duAnBatBuoc(db, lenh.workspace_id, d.project_id));

  // Khôi phục ⇒ ticket **vào lại** tập, nên tính lại trạng thái ticket điều phối
  // theo tập mới — SPEC 19.12 câu 17.
  const dp = await lanToiTicketDieuPhoi(
    db,
    lenh.workspace_id,
    { loai: 'khoi_phuc', ticket_id: lenh.ticket_id, trang_thai: d.trang_thai },
    bay_gio,
    cong,
  );

  return {
    cau_lenh: [
      db
        .prepare('UPDATE ticket SET xoa_luc = NULL, cap_nhat_luc = ? WHERE id = ?')
        .bind(bay_gio, lenh.ticket_id),
      ...dp.cau_lenh,
    ],
    lich_su: [
      {
        ticket_id: lenh.ticket_id,
        truong: 'xoa_luc',
        gia_tri_cu: String(d.xoa_luc),
        gia_tri_moi: null,
      },
      ...dp.lich_su,
    ],
    danh_thuc: [`ticket:${lenh.ticket_id}`, `ticket:${d.project_id}`, ...dp.danh_thuc],
    ket_qua: { id: lenh.ticket_id },
  };
}
