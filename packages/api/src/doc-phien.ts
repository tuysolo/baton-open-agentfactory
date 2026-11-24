/**
 * Đường **ĐỌC** về phiên — SPEC mục 6, 19.6, mục 3 (trạng thái agent), mục 11
 * (Tổng quan: "Đội agent", "Cần chú ý").
 *
 * **Luật không nằm ở đây.** Hai kết luận phụ thuộc thời gian của mục 6 —
 * `stalled` ("quá ngưỡng không có tín hiệu", d.184) và phiên `stopping` tự đóng
 * sau 10 phút (d.194) — là **dẫn xuất**, do hàm thuần `trangThaiPhienDanXuat`
 * của `@baton/shared` tính, với `bay_gio` qua tham số. File này chỉ là **nguồn
 * dữ liệu**: nó lấy dòng phiên cộng ngưỡng đứng của agent và của dự án, rồi gọi
 * hàm thuần.
 *
 * Không có cron nào ghi `stalled` vào DB — xem ghi chú trong `phien.ts`. Có một
 * cron **đọc** để bắn cảnh báo (19.12 câu 46, `cron-canh-bao-phien.ts`), và nó ghi
 * đúng hai thứ: mốc chống bắn lặp và một dòng `thong_bao`. Nhãn `stalled` vẫn là
 * dẫn xuất ở mọi đường đọc.
 *
 * Mọi câu SQL ở đây ràng cả `workspace_id`, kể cả khi khoá đã là UUID toàn cục
 * (`quyet-dinh.md` 01/10, luật áp cho mọi bảng mới).
 */

import {
  HAN_CHO_NGUOI_GIAO_CAN_CHU_Y_MS,
  canhBaoDung,
  nguongDungMs,
  nhan,
  tinHieuChoAgent,
  trangThaiAgentTuPhien,
  trangThaiPhienDanXuat,
  type LoaiHoatDong,
  type PhienLuu,
  type QuyetDinhCanhBao,
  type TrangThaiAgent,
  type TrangThaiBuoc,
  type TrangThaiPhien,
  type TrangThaiPhienDanXuat,
  type AiGoi,
} from '@baton/shared';
import { chiaLoThamSo, dauHoi } from './chia-lo-tham-so.js';
import { locPhamViTicket, locThayPhienGhi } from './pham-vi-doc.js';

/* ------------------------------------------------------------------ *
 * Dòng phiên + ngưỡng đứng
 * ------------------------------------------------------------------ */

/**
 * Một dòng `phien` kèm **hai ngưỡng** cần để dẫn xuất `stalled`.
 *
 * Ngưỡng đứng "chỉnh theo dự án hoặc theo agent" (mục 6 d.189), nên câu truy vấn
 * phải mang cả hai về; thứ tự áp nằm trong `nguongDungPhut` (hàm thuần).
 */
export interface DongPhien {
  id: string;
  /**
   * Workspace của phiên. Cần cho **một** người gọi: Cron cảnh báo của 19.12 câu 46
   * quét **toàn hệ** (một lượt quét không có workspace nào cho trước), rồi phải gửi
   * lệnh ghi mốc tới cửa ghi của **đúng** workspace của từng dòng.
   */
  workspace_id: string;
  luot_giao_id: string;
  ticket_id: string;
  agent_id: string;
  trang_thai: TrangThaiPhien;
  tin_hieu_cuoi_luc: number;
  ghi_chu_cuoi: string | null;
  can_chu_id: string | null;
  stopping_luc: number | null;
  /** Lúc agent gửi `question` — 19.6, migration 0007. */
  waiting_assigner_luc: number | null;
  /** Mốc mà cảnh báo d.196 gần nhất đã bắn cho — migration 0007. */
  canh_bao_tin_hieu_luc: number | null;
  /** Lúc phiên chuyển sang `error` — d.196, migration 0008. */
  error_luc: number | null;
  /** Câu trả lời đã trao cho agent tới mốc nào — 19.6, migration 0007. */
  tra_loi_doc_luc: number | null;
  /** Phiên bản kế hoạch hiện hành; `0` = chưa gửi — d.191, migration 0007. */
  ke_hoach_phien_ban: number;
  mo_luc: number;
  dong_luc: number | null;
  ly_do_dong: string | null;
  cap_nhat_luc: number;
  /** `agent.nguong_dung_phut` — `null` = không đặt riêng. */
  nguong_agent_phut: number | null;
  /** `project.nguong_dung_phut` của dự án chứa ticket của phiên. */
  nguong_du_an_phut: number | null;
  /** Tên hiển thị agent và mã ticket (`SAI-12`) — cho chữ của tin Telegram. */
  agent_ten: string;
  ticket_ma: string;
}

/**
 * `SELECT` dùng chung cho mọi đường đọc phiên.
 *
 * `JOIN ticket` + `JOIN project` chỉ để lấy ngưỡng của dự án. Không nhân bản
 * `nguong_dung_phut` xuống bảng `phien`: ngưỡng là **cấu hình hiện hành**, đổi
 * ngưỡng của dự án phải áp ngay cho các phiên đang chạy — một bản sao lúc mở
 * phiên thì đổi cấu hình không có tác dụng gì cho tới khi mọi phiên cũ đóng.
 */
const COT_PHIEN = `p.id AS id, p.workspace_id AS workspace_id,
         p.luot_giao_id AS luot_giao_id, p.ticket_id AS ticket_id,
         p.agent_id AS agent_id, p.trang_thai AS trang_thai,
         p.tin_hieu_cuoi_luc AS tin_hieu_cuoi_luc, p.ghi_chu_cuoi AS ghi_chu_cuoi,
         p.can_chu_id AS can_chu_id, p.stopping_luc AS stopping_luc,
         p.waiting_assigner_luc AS waiting_assigner_luc,
         p.canh_bao_tin_hieu_luc AS canh_bao_tin_hieu_luc,
         p.error_luc AS error_luc,
         p.tra_loi_doc_luc AS tra_loi_doc_luc,
         p.ke_hoach_phien_ban AS ke_hoach_phien_ban,
         p.mo_luc AS mo_luc, p.dong_luc AS dong_luc, p.ly_do_dong AS ly_do_dong,
         p.cap_nhat_luc AS cap_nhat_luc,
         a.nguong_dung_phut AS nguong_agent_phut,
         pr.nguong_dung_phut AS nguong_du_an_phut,
         a.ten AS agent_ten, pr.ma || '-' || CAST(t.so AS TEXT) AS ticket_ma`;

/**
 * `FROM` dùng chung. Tách khỏi danh sách cột để đường đọc của **Tổng quan**
 * (`phienMoCuaTicketDangLam`) thêm được một cột của `ticket` mà không chép lại
 * cả bốn bảng join — hai bản `FROM` khác nhau cho cùng một luật là hai chỗ để
 * lệch nhau (ví dụ một bản quên `AND pr.workspace_id = p.workspace_id`).
 */
const TU_PHIEN = `FROM phien p
    JOIN agent a ON a.id = p.agent_id AND a.workspace_id = p.workspace_id
    JOIN ticket t ON t.id = p.ticket_id AND t.workspace_id = p.workspace_id
    JOIN project pr ON pr.id = t.project_id AND pr.workspace_id = p.workspace_id`;

const CHON_PHIEN = `SELECT ${COT_PHIEN} ${TU_PHIEN}`;

/** Ngưỡng đứng (ms) áp cho một phiên — thứ tự ở hàm thuần `nguongDungPhut`. */
export function nguongCuaPhien(d: DongPhien): number {
  return nguongDungMs({ agent: d.nguong_agent_phut, du_an: d.nguong_du_an_phut });
}

/** Trạng thái dẫn xuất của một dòng phiên — SPEC mục 6 d.184, d.194, 19.6. */
export function phienLuuCua(d: DongPhien): PhienLuu {
  return {
    trang_thai: d.trang_thai,
    tin_hieu_cuoi_luc: d.tin_hieu_cuoi_luc,
    stopping_luc: d.stopping_luc,
    waiting_assigner_luc: d.waiting_assigner_luc,
    canh_bao_tin_hieu_luc: d.canh_bao_tin_hieu_luc,
    error_luc: d.error_luc,
  };
}

export function danXuat(d: DongPhien, bay_gio: number): TrangThaiPhienDanXuat {
  return trangThaiPhienDanXuat(phienLuuCua(d), bay_gio, nguongCuaPhien(d));
}

/* ------------------------------------------------------------------ *
 * Lấy phiên
 * ------------------------------------------------------------------ */

/**
 * Phiên của một lượt giao: dòng **mở** nếu có, nếu không thì dòng gần nhất.
 *
 * `ai` (BAT-57, 19.12 câu 15): có thì chỉ trả phiên mà người gọi **thấy được**
 * (ticket của phiên trong phạm vi đọc — `locPhamViTicket`, đúng luật của
 * `layTicket`). Ngoài phạm vi ⇒ `null`, tức người gọi đi qua **cùng** nhánh
 * `NOT_FOUND` với id không có. Bỏ trống = không lọc (đường nội bộ của cửa ghi,
 * cron — chúng không có "người gọi" nào để giấu).
 *
 * `che_do` (sửa theo reviewer BAT-57): `'doc'` (mặc định, đường GET) = đúng luật
 * đọc của `layTicket`; `'ghi'` (lệnh của agent trên phiên/lượt) = cộng thêm ca
 * người gọi là agent của phiên hoặc người giao của lượt (`locThayPhienGhi`) —
 * người bị gỡ khỏi dự án vẫn làm tiếp việc của chính mình (19.12 câu 37, 44).
 */
export async function phienCuaLuot(
  db: D1Database,
  workspace_id: string,
  luot_giao_id: string,
  ai?: AiGoi,
  che_do: 'doc' | 'ghi' = 'doc',
): Promise<DongPhien | null> {
  const loc = locPhien(ai, che_do);
  return db
    .prepare(
      `${CHON_PHIEN}
        WHERE p.workspace_id = ? AND p.luot_giao_id = ?${loc.sql}
        ORDER BY (p.trang_thai <> 'closed') DESC, p.mo_luc DESC
        LIMIT 1`,
    )
    .bind(workspace_id, luot_giao_id, ...loc.bind)
    .first<DongPhien>();
}

function locPhien(
  ai: AiGoi | undefined,
  che_do: 'doc' | 'ghi',
): { sql: string; bind: string[] } {
  if (ai === undefined) return { sql: '', bind: [] };
  return che_do === 'ghi' ? locThayPhienGhi(ai) : locPhamViTicket(ai, 't.project_id');
}

/** Một phiên theo mã. `ai`, `che_do`: như `phienCuaLuot` (BAT-57). */
export async function phienTheoId(
  db: D1Database,
  workspace_id: string,
  phien_id: string,
  ai?: AiGoi,
  che_do: 'doc' | 'ghi' = 'doc',
): Promise<DongPhien | null> {
  const loc = locPhien(ai, che_do);
  return db
    .prepare(`${CHON_PHIEN} WHERE p.workspace_id = ? AND p.id = ?${loc.sql}`)
    .bind(workspace_id, phien_id, ...loc.bind)
    .first<DongPhien>();
}

/* ------------------------------------------------------------------ *
 * Phiên ra ngoài API
 * ------------------------------------------------------------------ */

export interface PhienRa {
  id: string;
  luot_giao_id: string;
  ticket_id: string;
  agent_id: string;
  /** Trạng thái **đã dẫn xuất** lúc `bay_gio` — SPEC mục 6 d.184, d.194. */
  trang_thai: TrangThaiPhien;
  nhan_trang_thai: string;
  /** Trạng thái đang ghi trong DB, trước dẫn xuất (để gỡ lỗi và kiểm chứng). */
  trang_thai_luu: TrangThaiPhien;
  dang_mo: boolean;
  /** Phiên có đang bị tính **đứng** — mục 6 d.184, 19.6. */
  dung: boolean;
  tin_hieu_cuoi_luc: number;
  /** Số ms từ tín hiệu cuối — Tổng quan mục 11 ý 3. */
  im_lang_ms: number;
  /** Ngưỡng đứng đang áp cho phiên này, tính ra phút (mục 6 d.189). */
  nguong_dung_phut: number;
  ghi_chu_cuoi: string | null;
  can_chu_id: string | null;
  stopping_luc: number | null;
  /** Lúc agent gửi `question` — mốc của đồng hồ 60 phút (19.6). */
  waiting_assigner_luc: number | null;
  /** Số ms đã chờ người giao; `null` khi phiên không `waiting_assigner`. */
  cho_nguoi_giao_ms: number | null;
  /** `waiting_assigner` quá 60 phút → "Cần chú ý" (19.6). */
  cho_nguoi_giao_qua_han: boolean;
  /** Tín hiệu agent sẽ nhận ở lần gọi kế tiếp — mục 0.1, mục 6 d.193. */
  tin_hieu: 'STOP'[];
  mo_luc: number;
  dong_luc: number | null;
  ly_do_dong: string | null;
}

export function raPhien(d: DongPhien, bay_gio: number): PhienRa {
  const dx = danXuat(d, bay_gio);
  return {
    id: d.id,
    luot_giao_id: d.luot_giao_id,
    ticket_id: d.ticket_id,
    agent_id: d.agent_id,
    trang_thai: dx.trang_thai,
    nhan_trang_thai: nhan('trang_thai_phien', dx.trang_thai),
    trang_thai_luu: d.trang_thai,
    dang_mo: dx.trang_thai !== 'closed',
    dung: dx.trang_thai === 'stalled',
    tin_hieu_cuoi_luc: d.tin_hieu_cuoi_luc,
    im_lang_ms: dx.im_lang_ms,
    nguong_dung_phut: nguongCuaPhien(d) / 60_000,
    ghi_chu_cuoi: d.ghi_chu_cuoi,
    can_chu_id: d.can_chu_id,
    stopping_luc: d.stopping_luc,
    waiting_assigner_luc: d.waiting_assigner_luc,
    cho_nguoi_giao_ms: dx.cho_nguoi_giao_ms,
    cho_nguoi_giao_qua_han: dx.cho_nguoi_giao_qua_han,
    tin_hieu: tinHieuChoAgent(dx.trang_thai),
    mo_luc: d.mo_luc,
    // Dẫn xuất đã đóng phiên (10 phút không xác nhận dừng) thì mốc và lý do lấy
    // từ dẫn xuất, không từ DB — DB chưa biết, và sẽ biết ở lần gọi ghi kế tiếp.
    dong_luc: d.dong_luc ?? (dx.trang_thai === 'closed' ? bay_gio : null),
    ly_do_dong: d.ly_do_dong ?? dx.ly_do_dong,
  };
}

/** Các phiên của một agent (mới nhất trước) — trang agent, SPEC mục 3. */
export async function phienCuaAgent(
  db: D1Database,
  workspace_id: string,
  agent_id: string,
  bay_gio: number,
  chi_dang_mo = false,
): Promise<PhienRa[]> {
  const { results } = await db
    .prepare(
      `${CHON_PHIEN}
        WHERE p.workspace_id = ? AND p.agent_id = ?
          ${chi_dang_mo ? "AND p.trang_thai <> 'closed'" : ''}
        ORDER BY p.mo_luc DESC, p.id DESC
        LIMIT 50`,
    )
    .bind(workspace_id, agent_id)
    .all<DongPhien>();
  return results.map((d) => raPhien(d, bay_gio));
}

/** Các phiên của một ticket — mục 14 ("Chi tiết phiên"), 19.6 (chỉ báo dự án). */
export async function phienCuaTicket(
  db: D1Database,
  workspace_id: string,
  ticket_id: string,
  bay_gio: number,
): Promise<PhienRa[]> {
  const { results } = await db
    .prepare(
      `${CHON_PHIEN}
        WHERE p.workspace_id = ? AND p.ticket_id = ?
        ORDER BY p.mo_luc DESC, p.id DESC`,
    )
    .bind(workspace_id, ticket_id)
    .all<DongPhien>();
  return results.map((d) => raPhien(d, bay_gio));
}

/* ------------------------------------------------------------------ *
 * Trạng thái agent — SPEC mục 3 d.98–103
 * ------------------------------------------------------------------ */

/**
 * Trạng thái **đã dẫn xuất** của các phiên **còn mở** của nhiều agent, một câu
 * truy vấn cho cả trang.
 *
 * Hỏi theo lô vì danh sách agent (mục 3, mục 11 ý 3) hiện trạng thái cho **từng
 * hàng**; một truy vấn cho mỗi hàng là N+1, và mốc hiệu năng của 19.12 câu 1 áp
 * cho Tổng quan. Chia lô qua `chiaLoThamSo` vì D1 giới hạn số tham số bind của
 * một câu lệnh — cùng cái bẫy mà `boiCanhNguoiCamNhieu` đã gặp.
 */
export async function trangThaiPhienTheoAgent(
  db: D1Database,
  workspace_id: string,
  agent_ids: readonly string[],
  bay_gio: number,
): Promise<Map<string, TrangThaiPhien[]>> {
  const ra = new Map<string, TrangThaiPhien[]>();
  /*
   * Chia lô (`chia-lo-tham-so.ts`, bỏ trùng ở đó): 1 tham số khác
   * (`workspace_id`; `CHON_PHIEN` không có `?`). Câu không `ORDER BY`; kết quả
   * gom theo agent, và mỗi agent nằm trọn một lô ⇒ gộp các lô không đổi nghĩa.
   */
  for (const lo of chiaLoThamSo(agent_ids, 1)) {
    const cho = dauHoi(lo);
    const { results } = await db
      .prepare(
        `${CHON_PHIEN}
          WHERE p.workspace_id = ? AND p.trang_thai <> 'closed'
            AND p.agent_id IN (${cho})`,
      )
      .bind(workspace_id, ...lo)
      .all<DongPhien>();

    for (const d of results) {
      const dx = danXuat(d, bay_gio);
      // Phiên đã tự đóng vì không xác nhận dừng (d.194) **không còn là phiên mở**,
      // nên nó không được giữ agent ở `busy`. Bỏ nó khỏi tập ngay ở đây.
      if (dx.trang_thai === 'closed') continue;
      const hien = ra.get(d.agent_id) ?? [];
      hien.push(dx.trang_thai);
      ra.set(d.agent_id, hien);
    }
  }
  return ra;
}

/* ------------------------------------------------------------------ *
 * Mọi phiên còn mở của một workspace — Tổng quan, SPEC mục 11 d.317–319
 * ------------------------------------------------------------------ */

/**
 * Trần dòng của một lượt đọc "mọi phiên còn mở".
 *
 * Phiên **mở** là một tập nhỏ tự nhiên: nó bị chặn bởi số agent đang chạy việc,
 * không bởi 200.000 ticket của mốc nghiệm thu (19.12 câu 1) — mỗi agent có vài
 * phiên mở, và một workspace của **một** người chủ không có hàng nghìn agent.
 * Trần ở đây là hàng rào chống một dữ liệu bệnh làm Tổng quan treo, không phải
 * một cơ chế phân trang: Tổng quan không cuộn phiên.
 */
export const TRAN_PHIEN_MO = 500;

/**
 * Một phiên còn mở, kèm **ticket và dự án của nó** — đủ cho ba khối của Tổng
 * quan dùng chung **một** lượt đọc:
 *   * chỉ báo sức sống của dự án (d.317, mục 2 d.71–74) — lọc ticket `in_progress`;
 *   * "Cần chú ý: phiên **đứng hoặc lỗi**" (d.319);
 *   * "Đội agent" cần `agent_id` để biết agent đang cầm phiên nào (d.318).
 *
 * Một câu cho cả ba, không ba câu: ba câu là ba lần đọc có thể thấy ba trạng
 * thái khác nhau của bảng, và chúng sẽ lệch nhau ngay trong một lần mở màn hình.
 */
export interface PhienMoRa {
  phien_id: string;
  agent_id: string;
  ticket_id: string;
  ticket_so: number;
  ticket_tieu_de: string;
  ticket_trang_thai: string;
  project_id: string;
  du_an_ma: string;
  /** Trạng thái **đã dẫn xuất** lúc `bay_gio` (mục 6 d.184, d.194). */
  trang_thai: TrangThaiPhien;
  nhan_trang_thai: string;
  tin_hieu_cuoi_luc: number;
  im_lang_ms: number;
}

interface DongPhienMo extends DongPhien {
  ticket_so: number;
  ticket_tieu_de: string;
  ticket_trang_thai: string;
  project_id: string;
  du_an_ma: string;
}

/**
 * Mọi phiên **còn mở** của một workspace, trạng thái đã dẫn xuất.
 *
 * Phiên đã **tự đóng** vì 10 phút không xác nhận dừng (d.194) bị bỏ ngay ở đây:
 * DB còn ghi `stopping`, nhưng nó **không còn là phiên mở**, nên để nó lại sẽ
 * giữ một dự án ở 🟢 và một agent ở `busy` bằng một phiên đã chết.
 *
 * Ticket đã xoá mềm không tính (`t.xoa_luc IS NULL`): một phiên trên một ticket
 * trong thùng rác không làm dự án nào đang chạy.
 *
 * ## Vì sao hàm này KHÔNG lọc theo trạng thái ticket
 *
 * SPEC mục 6 d.181 ("việc đã xong ⇒ phiên đóng") được cài ở **đường ghi**
 * (`cauLenhDongPhienNeuViecXong` của `lenh-trang-thai.ts`), và dữ liệu cũ do
 * migration 0024 dọn. Một lớp lọc thêm ở đây — "bỏ phiên của ticket đang
 * `verifying`/`done`" — nghe như một hàng rào cuối rẻ tiền, nhưng nó **sai**:
 * lượt `review` của mục 5 chạy **trong khi** ticket ở Chờ kiểm chứng, nên phiên
 * của người review là một phiên sống trên một ticket `verifying`. Lọc ở đây sẽ
 * làm người review biến mất khỏi "Agent đang làm gì" (d.319) và phiên đứng của
 * chính họ không bao giờ được cảnh báo (d.196). Đã thử và đã bỏ.
 */
export async function phienMoTrongWorkspace(
  db: D1Database,
  workspace_id: string,
  bay_gio: number,
  tran: number = TRAN_PHIEN_MO,
): Promise<PhienMoRa[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COT_PHIEN},
              t.so AS ticket_so, t.tieu_de AS ticket_tieu_de,
              t.trang_thai AS ticket_trang_thai, t.project_id AS project_id,
              pr.ma AS du_an_ma
         ${TU_PHIEN}
        WHERE p.workspace_id = ? AND p.trang_thai <> 'closed' AND t.xoa_luc IS NULL
        ORDER BY p.tin_hieu_cuoi_luc, p.id
        LIMIT ?`,
    )
    .bind(workspace_id, Math.trunc(tran))
    .all<DongPhienMo>();

  const ra: PhienMoRa[] = [];
  for (const d of results) {
    const dx = danXuat(d, bay_gio);
    if (dx.trang_thai === 'closed') continue;
    ra.push({
      phien_id: d.id,
      agent_id: d.agent_id,
      ticket_id: d.ticket_id,
      ticket_so: d.ticket_so,
      ticket_tieu_de: d.ticket_tieu_de,
      ticket_trang_thai: d.ticket_trang_thai,
      project_id: d.project_id,
      du_an_ma: d.du_an_ma,
      trang_thai: dx.trang_thai,
      nhan_trang_thai: nhan('trang_thai_phien', dx.trang_thai),
      tin_hieu_cuoi_luc: d.tin_hieu_cuoi_luc,
      im_lang_ms: dx.im_lang_ms,
    });
  }
  return ra;
}

/* ------------------------------------------------------------------ *
 * Dòng hoạt động của phiên — SPEC mục 6 d.190, mục 14
 * ------------------------------------------------------------------ */

export interface DongHoatDong {
  id: string;
  phien_id: string;
  ticket_id: string;
  /** `null` = câu trả lời của người giao (xem migration 0007). */
  loai: LoaiHoatDong | null;
  tac_gia_loai: string;
  tac_gia_agent_id: string | null;
  noi_dung: string;
  ten_thao_tac: string | null;
  tham_so: string | null;
  ket_qua_thao_tac: string | null;
  tam_thoi: number;
  tra_loi_cho_id: string | null;
  thu_tu: number;
  gui_luc: number;
}

export interface HoatDongRa extends Omit<DongHoatDong, 'tam_thoi'> {
  nhan_loai: string;
  tam_thoi: boolean;
  /** Mục tạm thời **đã bị mục sau thay chỗ trên màn hình** — d.190. */
  da_bi_thay_cho: boolean;
  la_tra_loi: boolean;
}

const COT_HOAT_DONG = `id, phien_id, ticket_id, loai, tac_gia_loai, tac_gia_agent_id,
   noi_dung, ten_thao_tac, tham_so, ket_qua_thao_tac, tam_thoi, tra_loi_cho_id,
   thu_tu, gui_luc`;

/**
 * "Mục có thể **đánh dấu tạm thời** (bị mục kế thay chỗ trên màn hình; **vẫn lưu
 * trong lịch sử**)" — SPEC mục 6 d.190.
 *
 * Nên: **lưu hết**, chỉ đường đọc mới ẩn, và chỉ ẩn mục tạm thời **đã có mục sau
 * nó** — mục tạm thời **cuối cùng** là thứ đang hiện trên màn hình (vd "đang đọc
 * file…"), ẩn nó đi là xoá đúng cái người dùng cần thấy.
 */
function raHoatDong(d: DongHoatDong, co_muc_sau: boolean): HoatDongRa {
  const tam_thoi = d.tam_thoi === 1;
  return {
    ...d,
    tam_thoi,
    nhan_loai: d.loai === null ? 'Trả lời' : nhan('loai_hoat_dong', d.loai),
    da_bi_thay_cho: tam_thoi && co_muc_sau,
    la_tra_loi: d.tra_loi_cho_id !== null,
  };
}

/**
 * Dòng hoạt động của một phiên, theo `thu_tu` — SPEC mục 6 d.190, mục 14.
 *
 * `gom_tam_thoi = false` (mặc định) là **màn hình**: mục tạm thời đã bị mục sau
 * thay chỗ không hiện. `true` là **lịch sử**: lấy đủ, không mục nào mất.
 */
export async function hoatDongCuaPhien(
  db: D1Database,
  workspace_id: string,
  phien_id: string,
  tuy_chon: { gom_tam_thoi?: boolean; limit?: number } = {},
): Promise<HoatDongRa[]> {
  const limit = Math.min(Math.max(tuy_chon.limit ?? 200, 1), 500);
  const { results } = await db
    .prepare(
      `SELECT ${COT_HOAT_DONG} FROM phien_hoat_dong
        WHERE workspace_id = ? AND phien_id = ?
        ORDER BY thu_tu DESC LIMIT ?`,
    )
    .bind(workspace_id, phien_id, limit)
    .all<DongHoatDong>();

  const tang_dan = [...results].reverse();
  const thu_tu_cuoi = tang_dan.length === 0 ? 0 : tang_dan[tang_dan.length - 1]!.thu_tu;
  const ra = tang_dan.map((d) => raHoatDong(d, d.thu_tu < thu_tu_cuoi));
  return tuy_chon.gom_tam_thoi === true ? ra : ra.filter((h) => !h.da_bi_thay_cho);
}

/**
 * **Câu trả lời agent chưa nhận** — 19.6: "Có câu trả lời thì … **lần gọi kế tiếp
 * của agent nhận được câu trả lời**".
 *
 * "Chưa nhận" = gửi **sau** mốc `tra_loi_doc_luc` của phiên. Mốc thay cho một cờ
 * `da_doc` trên từng mục vì mục đã gửi **không sửa được** (d.190) — bật cờ trên
 * một mục là sửa nó.
 */
export async function traLoiChuaTrao(
  db: D1Database,
  workspace_id: string,
  phien: DongPhien,
): Promise<HoatDongRa[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COT_HOAT_DONG} FROM phien_hoat_dong
        WHERE workspace_id = ? AND phien_id = ? AND tra_loi_cho_id IS NOT NULL
          AND gui_luc > ?
        ORDER BY thu_tu`,
    )
    .bind(workspace_id, phien.id, phien.tra_loi_doc_luc ?? 0)
    .all<DongHoatDong>();
  return results.map((d) => raHoatDong(d, false));
}

/**
 * **Câu hỏi đang chờ một agent trả lời** — 19.6: "Người giao là agent: câu hỏi
 * hiện trong `baton tasks` của người giao."
 *
 * `baton tasks` **chưa có đường đọc nào** trong mã (lượt 1 chỉ để lại chỗ đánh
 * thức `luot:<agent>` trong cửa ghi). Nên hàm này là **nguồn dữ liệu** của phần
 * đó, không dựng một đường thứ hai: khi `tasks` được viết, nó gọi đúng hàm này.
 *
 * Câu hỏi "đang chờ" = mục `question` của một phiên **còn mở**, trên một lượt mà
 * người gọi là **người giao**, và **chưa có** mục trả lời nào trỏ tới nó.
 */
export interface CauHoiChoTraLoi {
  hoat_dong_id: string;
  phien_id: string;
  luot_giao_id: string;
  ticket_id: string;
  /** Agent đã hỏi (chủ phiên). */
  agent_id: string;
  noi_dung: string;
  gui_luc: number;
  /** Số ms đã chờ; quá 60 phút thì phiên vào "Cần chú ý" (19.6). */
  cho_ms: number;
  qua_han: boolean;
}

export async function cauHoiChoTraLoi(
  db: D1Database,
  workspace_id: string,
  nguoi_giao: { loai: 'chu' } | { loai: 'agent'; agent_id: string },
  bay_gio: number,
): Promise<CauHoiChoTraLoi[]> {
  const dieu_kien =
    nguoi_giao.loai === 'chu'
      ? "lg.nguoi_giao_loai = 'owner'"
      : "lg.nguoi_giao_loai = 'agent' AND lg.nguoi_giao_agent_id = ?";
  const tham_so = nguoi_giao.loai === 'chu' ? [] : [nguoi_giao.agent_id];

  const { results } = await db
    .prepare(
      `SELECT hd.id AS hoat_dong_id, hd.phien_id AS phien_id, hd.noi_dung AS noi_dung,
              hd.gui_luc AS gui_luc, p.luot_giao_id AS luot_giao_id,
              p.ticket_id AS ticket_id, p.agent_id AS agent_id
         FROM phien_hoat_dong hd
         JOIN phien p ON p.id = hd.phien_id AND p.workspace_id = hd.workspace_id
         JOIN luot_giao lg ON lg.id = p.luot_giao_id AND lg.workspace_id = p.workspace_id
        WHERE hd.workspace_id = ? AND hd.loai = 'question'
          AND p.trang_thai <> 'closed'
          AND ${dieu_kien}
          AND NOT EXISTS (
            SELECT 1 FROM phien_hoat_dong tl
             WHERE tl.workspace_id = hd.workspace_id AND tl.tra_loi_cho_id = hd.id
          )
        ORDER BY hd.gui_luc, hd.thu_tu
        LIMIT 200`,
    )
    .bind(workspace_id, ...tham_so)
    .all<Omit<CauHoiChoTraLoi, 'cho_ms' | 'qua_han'>>();

  return results.map((d) => {
    const cho_ms = Math.max(0, bay_gio - d.gui_luc);
    return { ...d, cho_ms, qua_han: cho_ms >= HAN_CHO_NGUOI_GIAO_CAN_CHU_Y_MS };
  });
}

/* ------------------------------------------------------------------ *
 * Kế hoạch của phiên — SPEC mục 6 d.191
 * ------------------------------------------------------------------ */

export interface BuocRa {
  thu_tu: number;
  noi_dung: string;
  trang_thai: TrangThaiBuoc;
  nhan_trang_thai: string;
}

export interface KeHoachRa {
  phien_id: string;
  /** `0` = agent chưa gửi kế hoạch nào. */
  phien_ban: number;
  gui_luc: number | null;
  buoc: BuocRa[];
}

/**
 * Kế hoạch **hiện hành** của một phiên = phiên bản lớn nhất — SPEC mục 6 d.191
 * ("agent gửi lại **toàn bộ danh sách** mỗi lần cập nhật").
 */
export async function keHoachCuaPhien(
  db: D1Database,
  workspace_id: string,
  phien_id: string,
): Promise<KeHoachRa> {
  /*
   * Phiên bản lấy từ `phien.ke_hoach_phien_ban`, **không** từ
   * `max(phien_ban)` của `phien_ke_hoach`: một kế hoạch **rỗng** (agent gửi lại
   * danh sách trống — d.191 cho phép) không có dòng nào, nên `max` sẽ rơi về
   * phiên bản cũ và đường đọc dựng lại đúng cái kế hoạch agent vừa bỏ.
   */
  const ban = await db
    .prepare('SELECT ke_hoach_phien_ban AS n FROM phien WHERE id = ? AND workspace_id = ?')
    .bind(phien_id, workspace_id)
    .first<{ n: number }>();
  const phien_ban = ban?.n ?? 0;

  if (phien_ban === 0) return { phien_id, phien_ban: 0, gui_luc: null, buoc: [] };

  const { results } = await db
    .prepare(
      `SELECT thu_tu, noi_dung, trang_thai, phien_ban, gui_luc
         FROM phien_ke_hoach
        WHERE workspace_id = ? AND phien_id = ? AND phien_ban = ?
        ORDER BY thu_tu`,
    )
    .bind(workspace_id, phien_id, phien_ban)
    .all<{
      thu_tu: number;
      noi_dung: string;
      trang_thai: TrangThaiBuoc;
      phien_ban: number;
      gui_luc: number;
    }>();

  return {
    phien_id,
    phien_ban,
    gui_luc: results[0]?.gui_luc ?? null,
    buoc: results.map((b) => ({
      thu_tu: b.thu_tu,
      noi_dung: b.noi_dung,
      trang_thai: b.trang_thai,
      nhan_trang_thai: nhan('trang_thai_buoc', b.trang_thai),
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Cảnh báo "phiên đứng hoặc lỗi" — SPEC mục 6 d.196
 * ------------------------------------------------------------------ */

/**
 * **Câu lọc thô** của đường phát hiện cảnh báo — dùng chung cho cả hai đường đọc
 * dưới đây (một workspace, và toàn hệ cho Cron). Một câu, không hai: hai câu SQL
 * khác nhau cho cùng một luật là hai chỗ để lệch nhau.
 *
 * Nó là **lọc cho rẻ**, **không** phải luật: luật nằm ở `canhBaoDung`, và mốc của
 * `error` gắn `error_luc` chứ không gắn `tin_hieu_cuoi_luc` (migration 0008, 19.12
 * câu 50), nên câu lọc phải để lọt **cả hai** mốc rồi để hàm thuần quyết.
 *
 * Chỉ phiên **còn mở**: một phiên đã đóng không "đang đứng". Đó cũng đúng là vị
 * từ của index riêng phần `ix_phien_canh_bao` (migration 0012).
 */
const LOC_CAN_CANH_BAO = `p.trang_thai <> 'closed'
          AND (p.canh_bao_tin_hieu_luc IS NULL
               OR p.canh_bao_tin_hieu_luc <> p.tin_hieu_cuoi_luc
               OR p.canh_bao_tin_hieu_luc <> coalesce(p.error_luc, p.tin_hieu_cuoi_luc))`;

/**
 * Các phiên **cần bắn cảnh báo** lúc `bay_gio` — SPEC mục 6 d.196.
 *
 * **Đây là đường của CRON, không của Tổng quan** — 19.12 câu 46, chốt của chủ:
 * "Cảnh báo được phát hiện bằng một **Cron Trigger quét mỗi 5 phút**, **không** dựa
 * vào việc có ai mở Tổng quan."
 *
 * Trước chốt đó, lượt 4 đã cài đường ngược lại: một lệnh `quet_canh_bao` mà Tổng
 * quan gọi khi mở. Lệnh đó **đã bị bỏ** (xem `cron-canh-bao-phien.ts`), và không
 * được dựng lại: phát hiện phụ thuộc người mở màn hình nghĩa là một phiên đứng lúc
 * 2 giờ sáng chỉ được báo khi chủ thức dậy mở Tổng quan — tức đúng lúc chủ đã tự
 * nhận ra, là thứ mục 6 tồn tại để tránh ("không phải chờ tới khi chính mình nhận
 * ra", d.178).
 *
 * Hàm này là **đường đọc thuần**: nó không gửi lệnh ghi nào. Ghi mốc và chèn tin
 * vào kho là việc của `WorkspaceGate.ghiMocCanhBao`.
 *
 * Bản **một workspace** này còn lại cho hai việc không phải phát hiện: màn hình
 * "Cần chú ý" của phần 6 (hiện phiên đang đứng, không bắn gì) và ca test canh luật
 * "mọi câu SQL ràng cả `workspace_id`". Cron dùng `phienCanCanhBaoToanHe`.
 */
export interface PhienCanCanhBao {
  /** Workspace của phiên — Cron cần nó để gọi **đúng** cửa ghi (xem `DongPhien`). */
  workspace_id: string;
  phien_id: string;
  ticket_id: string;
  agent_id: string;
  quyet_dinh: QuyetDinhCanhBao;
}

function loc(d: DongPhien, bay_gio: number): PhienCanCanhBao | null {
  const quyet_dinh = canhBaoDung(phienLuuCua(d), danXuat(d, bay_gio).trang_thai);
  if (!quyet_dinh.can_ban) return null;
  return {
    workspace_id: d.workspace_id,
    phien_id: d.id,
    ticket_id: d.ticket_id,
    agent_id: d.agent_id,
    quyet_dinh,
  };
}

export async function phienCanCanhBao(
  db: D1Database,
  workspace_id: string,
  bay_gio: number,
): Promise<PhienCanCanhBao[]> {
  const { results } = await db
    .prepare(`${CHON_PHIEN} WHERE p.workspace_id = ? AND ${LOC_CAN_CANH_BAO} LIMIT 500`)
    .bind(workspace_id)
    .all<DongPhien>();

  const ra: PhienCanCanhBao[] = [];
  for (const d of results) {
    const mot = loc(d, bay_gio);
    if (mot !== null) ra.push(mot);
  }
  return ra;
}

/**
 * Cùng luật, **quét toàn hệ** — đường của Cron 5 phút (19.12 câu 46).
 *
 * Không dẫn đầu bằng `workspace_id`, và đó là chủ ý: một Cron Trigger không có
 * workspace nào cho trước, nên đi qua từng workspace một là quét toàn bảng đội lốt
 * index ở mốc nghiệm thu 200.000 ticket (19.12 câu 1). Cùng lựa chọn mà 0009 đã
 * giải thích cho `ix_evidence_thu_lai`; index cho câu này là `ix_phien_canh_bao`
 * của 0012.
 *
 * `ORDER BY p.tin_hieu_cuoi_luc, p.id` + `LIMIT tran`: phiên **im lâu nhất đi
 * trước**, thứ tự **toàn phần** (hai phiên cùng tín hiệu cuối vẫn xác định), nên
 * khi một lượt quét đầy trần thì không dòng nào bị bỏ lại mãi — cùng lý lẽ của
 * `quetThuLai` trong `cron-bang-chung.ts`.
 */
export interface QuetCanhBaoToanHe {
  /**
   * Số dòng **thô** lượt quét lấy ra (≤ `tran`) — khác `can.length`, vốn là số dòng
   * còn lại **sau** khi `canhBaoDung` quyết. Trả cả hai vì chỉ con số thô nói được
   * "lượt quét có đầy trần hay không", tức "còn dòng chờ lượt sau".
   */
  so_dong: number;
  can: PhienCanCanhBao[];
}

/**
 * **Đúng câu SQL** mà `phienCanCanhBaoToanHe` chạy, tách ra để test đo được nó bằng
 * `EXPLAIN QUERY PLAN` (cùng nếp hai ca `(b+)`/`(c+)` của `cron-bang-chung.test.ts`).
 *
 * `ix_phien_canh_bao` là index **riêng phần** (`WHERE trang_thai <> 'closed'`), và
 * SQLite chỉ dùng nó khi `WHERE` của câu hàm ý **đúng** vị từ đó. Nên một lượt sau
 * sửa `LOC_CAN_CANH_BAO` (ví dụ đổi `<> 'closed'` thành một cách viết tương đương
 * về nghĩa nhưng SQLite không nhận ra) sẽ làm Cron quét cả bảng `phien` mà không ca
 * nào đỏ — trừ khi ca đó đo **chính câu này**, chứ không một câu chép tay.
 */
export function cauQuetCanhBaoToanHe(tran: number): string {
  return `${CHON_PHIEN} WHERE ${LOC_CAN_CANH_BAO}
        ORDER BY p.tin_hieu_cuoi_luc, p.id LIMIT ${String(Math.trunc(tran))}`;
}

export async function phienCanCanhBaoToanHe(
  db: D1Database,
  bay_gio: number,
  tran: number,
): Promise<QuetCanhBaoToanHe> {
  const { results } = await db
    .prepare(cauQuetCanhBaoToanHe(tran))
    .bind()
    .all<DongPhien>();

  const can: PhienCanCanhBao[] = [];
  for (const d of results) {
    const mot = loc(d, bay_gio);
    if (mot !== null) can.push(mot);
  }
  return { so_dong: results.length, can };
}

/** Trạng thái agent của **một** agent — SPEC mục 3. */
export async function trangThaiCuaAgent(
  db: D1Database,
  workspace_id: string,
  agent_id: string,
  disabled: boolean,
  bay_gio: number,
): Promise<TrangThaiAgent> {
  const bang = await trangThaiPhienTheoAgent(db, workspace_id, [agent_id], bay_gio);
  return trangThaiAgentTuPhien(disabled, bang.get(agent_id) ?? []);
}
