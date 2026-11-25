/**
 * **Dòng hoạt động, kế hoạch, trả lời câu hỏi** — SPEC mục 6 d.190, d.191, 19.6,
 * 19.12 câu 2.
 *
 * Ba lệnh ghi:
 *   1. `gui_hoat_dong`  — agent gửi một mục `thought`/`action`/`question`/
 *                         `result`/`error` (d.190). `question` đưa phiên sang
 *                         `waiting_assigner` (19.6); `result`/`error` lúc đang
 *                         `stopping` là lời **xác nhận dừng** (d.193).
 *   2. `dat_ke_hoach`   — agent gửi lại **toàn bộ** danh sách bước (d.191).
 *   3. `tra_loi_cau_hoi`— `baton reply <lượt> "<nội dung>"` (19.12 câu 2).
 *
 * Cảnh báo d.196 **không** còn ở đây: 19.12 câu 46 chốt nó là một Cron Trigger mỗi
 * 5 phút — xem mục 4 cuối file.
 *
 * **Không có máy trạng thái phiên thứ hai.** Mọi kết luận "mục loại này thì phiên
 * thành gì" nằm ở hàm thuần `phienSauHoatDong` / `phienSauTraLoi` của
 * `@baton/shared`; handler chỉ gọi rồi dựng câu lệnh.
 *
 * **Tín hiệu vẫn đặt ở cửa ghi.** Các lệnh này là lệnh ghi của agent, nên
 * `#cauLenhTinHieuPhien` của `WorkspaceGate` tự nhích `tin_hieu_cuoi_luc` —
 * không chỗ nào ở đây rắc tay (SPEC mục 6 d.188 kể "hoạt động" là một tín hiệu).
 * Hoạt động và kế hoạch chỉ **khai** `luot_tin_hieu` (lượt của phiên) để cửa ghi
 * nhích **đúng phiên đó**, không phiên nào khác của agent (BAT-57). Trả lời
 * (`tra_loi_cau_hoi`) là lệnh của **người giao**, không gắn lượt nào của chính
 * người gọi, nên không khai — rơi vào nhánh "lệnh chung".
 *
 * **Ai được gọi.** Bảng quyền SPEC mục 3 **không có hàng nào** cho dòng hoạt
 * động, kế hoạch hay trả lời; SPEC nói theo **danh tính** ("agent gửi", "chỉ
 * người giao của lượt đó"). Nên các lệnh này kiểm danh tính và **không mượn** hàng
 * nào của bảng quyền — cùng lý do đã ghi ở `spec-questions.md` #22, #37, #44.
 */

import {
  BatonError,
  LY_DO_DONG_DA_XAC_NHAN_DUNG,
  kiemChuTuyChon,
  kiemCo,
  kiemKeHoach,
  kiemLoaiHoatDong,
  kiemNoiDungBinhLuan,
  phienSauHoatDong,
  phienSauTraLoi,
  type AiGoi,
  type BuocKeHoach,
  type LoaiHoatDong,
  type TacGia,
  type TrangThaiPhien,
} from '@baton/shared';
import {
  cauLenhDongPhien,
  danXuatVaGhiLai,
  loiPhienDaDong,
} from './lenh-phien.js';
import { phienCuaLuot, phienTheoId, type DongPhien } from './doc-phien.js';
import { batBuocLaNguoiGiao, luotBatBuoc } from './lenh-nop-nghiem-thu.js';
import {
  tacGiaCua,
  type BoiCanhLenh,
  type KetQuaHandler,
  type LenhChung,
} from './lenh-khung.js';

/* ================================================================== *
 * Giúp việc dùng chung
 * ================================================================== */

/**
 * Lấy phiên, dẫn xuất, **ghi lại** nếu dẫn xuất đã đóng nó, và từ chối
 * `SESSION_CLOSED` — SPEC mục 6 d.195 ("**mọi** lệnh ghi sau khi phiên đóng bị từ
 * chối"). Dòng hoạt động và kế hoạch đều là lệnh ghi, nên cùng đi qua đây.
 */
function batBuocPhienConMo(
  db: D1Database,
  workspace_id: string,
  phien: DongPhien,
  bay_gio: number,
):
  | { mo: true; trang_thai: TrangThaiPhien; cau_lenh: D1PreparedStatement[] }
  | {
      mo: false;
      cau_lenh: D1PreparedStatement[];
      loi: { ma: 'SESSION_CLOSED'; message: string };
    } {
  const sau = danXuatVaGhiLai(db, workspace_id, phien, bay_gio);
  if (sau.trang_thai === 'closed') {
    return { mo: false, cau_lenh: sau.cau_lenh, loi: loiPhienDaDong(phien.ly_do_dong) };
  }
  return { mo: true, trang_thai: sau.trang_thai, cau_lenh: sau.cau_lenh };
}

/** Chỉ **agent của phiên** gửi được hoạt động và kế hoạch của phiên đó. */
function batBuocLaAgentCuaPhien(lenh: LenhChung, phien: DongPhien, viec: string): void {
  /*
   * Mục 6 d.190 và d.191 đều mở đầu bằng "**agent** gửi". Chủ **không** gửi hộ:
   * dòng hoạt động là lời khai của agent về việc nó đang làm (cùng lý do đã chốt
   * cho nhịp tim, `spec-questions.md` #31), và một dòng hoạt động có mục do chủ
   * chèn thì nó không còn là bằng chứng về agent nữa.
   */
  if (lenh.ai.loai !== 'agent' || lenh.ai.agent_id !== phien.agent_id) {
    throw new BatonError('FORBIDDEN', { message: `Chỉ agent của phiên này mới ${viec}.` });
  }
  if (lenh.ai.disabled) throw new BatonError('FORBIDDEN', { message: 'Agent đã bị tắt.' });
}

/**
 * Tra phiên **trong phạm vi đọc của người gọi** (BAT-57, 19.12 câu 15): phiên
 * trên ticket ngoài dự án người gọi được vào → `null` → **cùng dòng `throw`**
 * `NOT_FOUND` với id bịa. Người gọi thấy được mà không phải agent của phiên thì
 * `batBuocLaAgentCuaPhien` vẫn ra `FORBIDDEN`. Chế độ `'ghi'` (sửa theo
 * reviewer): agent của phiên, hay người giao của lượt, bị gỡ khỏi dự án vẫn
 * "thấy" phiên — lệnh của chính họ chạy như trước BAT-57 (19.12 câu 44, 19.6).
 */
async function phienBatBuoc(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  phien_id: unknown,
): Promise<DongPhien> {
  if (typeof phien_id !== 'string' || phien_id.length === 0) {
    throw new BatonError('INVALID_INPUT', { message: 'Thiếu mã phiên.' });
  }
  const d = await phienTheoId(db, workspace_id, phien_id, ai, 'ghi');
  if (d === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy phiên.' });
  return d;
}

/**
 * Số thứ tự kế tiếp của một mục trong phiên — xem ghi chú cột `thu_tu` ở
 * migration 0007 (không dựa `gui_luc`: hai mục cùng milisecond thì dòng hoạt động
 * hiện sai thứ tự).
 *
 * Đọc rồi ghi **trong cửa ghi**, nên tuần tự; `ux_phien_hoat_dong_thu_tu` là hàng
 * rào cuối nếu một đường nào khác đua.
 */
async function thuTuKeTiep(
  db: D1Database,
  workspace_id: string,
  phien_id: string,
): Promise<number> {
  const d = await db
    .prepare(
      `SELECT coalesce(max(thu_tu), 0) + 1 AS n FROM phien_hoat_dong
        WHERE workspace_id = ? AND phien_id = ?`,
    )
    .bind(workspace_id, phien_id)
    .first<{ n: number }>();
  return d?.n ?? 1;
}

/** Một câu `INSERT` vào `phien_hoat_dong`. */
function cauLenhThemHoatDong(
  db: D1Database,
  nguon: {
    id: string;
    workspace_id: string;
    phien: DongPhien;
    loai: LoaiHoatDong | null;
    tac_gia: TacGia;
    noi_dung: string;
    ten_thao_tac?: string | null;
    tham_so?: string | null;
    ket_qua_thao_tac?: string | null;
    tam_thoi?: boolean;
    tra_loi_cho_id?: string | null;
    thu_tu: number;
    gui_luc: number;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO phien_hoat_dong
         (id, workspace_id, phien_id, ticket_id, loai, tac_gia_loai, tac_gia_agent_id,
          noi_dung, ten_thao_tac, tham_so, ket_qua_thao_tac, tam_thoi, tra_loi_cho_id,
          thu_tu, gui_luc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      nguon.id,
      nguon.workspace_id,
      nguon.phien.id,
      nguon.phien.ticket_id,
      nguon.loai,
      nguon.tac_gia.loai === 'agent' ? 'agent' : 'owner',
      nguon.tac_gia.agentId ?? null,
      nguon.noi_dung,
      nguon.ten_thao_tac ?? null,
      nguon.tham_so ?? null,
      nguon.ket_qua_thao_tac ?? null,
      nguon.tam_thoi === true ? 1 : 0,
      nguon.tra_loi_cho_id ?? null,
      nguon.thu_tu,
      nguon.gui_luc,
    );
}

/* ================================================================== *
 * 1. `gui_hoat_dong` — SPEC mục 6 d.190
 * ================================================================== */

export interface LenhGuiHoatDong extends LenhChung {
  loai: 'gui_hoat_dong';
  phien_id: string;
  /** Một trong 5 mã của SPEC mục 0.1. */
  loai_hoat_dong: unknown;
  noi_dung: unknown;
  /** `action` mang "tên, tham số, kết quả" — d.190. */
  ten_thao_tac?: unknown;
  tham_so?: unknown;
  ket_qua_thao_tac?: unknown;
  /** "Mục có thể **đánh dấu tạm thời**" — d.190. */
  tam_thoi?: unknown;
}

export interface KetQuaGuiHoatDong {
  id: string;
  phien_id: string;
  ticket_id: string;
  loai: LoaiHoatDong;
  thu_tu: number;
  gui_luc: number;
  tam_thoi: boolean;
  /** Trạng thái phiên **sau** mục này (19.6, d.193). */
  trang_thai_phien: TrangThaiPhien;
  /** Phiên đã đóng vì mục này là lời xác nhận dừng — d.193. */
  da_xac_nhan_dung: boolean;
}

export async function handlerGuiHoatDong(
  lenh: LenhGuiHoatDong,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaGuiHoatDong>> {
  const loai = kiemLoaiHoatDong(lenh.loai_hoat_dong);
  // Cùng khuôn kiểm với bình luận (markdown, 1–100.000 ký tự): một mục `thought`
  // hay một kết quả `action` dài đúng cỡ đó.
  const noi_dung = kiemNoiDungBinhLuan(lenh.noi_dung);
  const ten_thao_tac = kiemChuTuyChon(lenh.ten_thao_tac, 'Tên thao tác', 200);
  const tham_so = kiemChuTuyChon(lenh.tham_so, 'Tham số', 20_000);
  const ket_qua_thao_tac = kiemChuTuyChon(lenh.ket_qua_thao_tac, 'Kết quả thao tác', 20_000);
  const tam_thoi = lenh.tam_thoi === undefined ? false : kiemCo(lenh.tam_thoi, 'tam_thoi');

  const phien = await phienBatBuoc(db, lenh.ai, lenh.workspace_id, lenh.phien_id);
  batBuocLaAgentCuaPhien(lenh, phien, 'gửi hoạt động lên phiên này');

  const con_mo = batBuocPhienConMo(db, lenh.workspace_id, phien, bay_gio);
  const id = crypto.randomUUID();
  const thu_tu = await thuTuKeTiep(db, lenh.workspace_id, phien.id);

  if (!con_mo.mo) {
    return {
      cau_lenh: con_mo.cau_lenh,
      loi_sau_ghi: con_mo.loi,
      // Lệnh gắn lượt (câu 45) — kể cả nhánh bị từ chối, để cửa ghi KHÔNG rơi về
      // nhánh "lệnh chung" và nhích nhầm một phiên khác (BAT-57).
      luot_tin_hieu: phien.luot_giao_id,
      ket_qua: {
        id,
        phien_id: phien.id,
        ticket_id: phien.ticket_id,
        loai,
        thu_tu,
        gui_luc: bay_gio,
        tam_thoi,
        trang_thai_phien: 'closed',
        da_xac_nhan_dung: false,
      },
    };
  }

  const sau = phienSauHoatDong(con_mo.trang_thai, loai);
  const cau_lenh = [
    ...con_mo.cau_lenh,
    cauLenhThemHoatDong(db, {
      id,
      workspace_id: lenh.workspace_id,
      phien,
      loai,
      tac_gia: tacGiaCua(lenh.ai),
      noi_dung,
      ten_thao_tac,
      tham_so,
      ket_qua_thao_tac,
      tam_thoi,
      thu_tu,
      gui_luc: bay_gio,
    }),
  ];

  if (sau.doi) {
    if (sau.trang_thai === 'closed') {
      // d.193: agent xác nhận dừng bằng một mục `result`/`error`.
      cau_lenh.push(
        ...cauLenhDongPhien(
          db,
          lenh.workspace_id,
          phien.luot_giao_id,
          bay_gio,
          sau.ly_do_dong ?? LY_DO_DONG_DA_XAC_NHAN_DUNG,
        ),
      );
    } else {
      /*
       * `error_luc` = **lúc phiên chuyển sang `error`** (migration 0008). Mốc
       * chống bắn lặp của d.196 cho `error` gắn vào đây, **không** vào
       * `tin_hieu_cuoi_luc`: `error` là trạng thái ghi trong DB nên một nhịp tim
       * không đưa phiên ra khỏi nó. Chỉ ghi khi **chuyển sang** (`sau.doi` đã
       * đúng ở đây), nên mục `error` thứ hai lúc đã `error` không đẩy mốc.
       */
      cau_lenh.push(
        db
          .prepare(
            `UPDATE phien
                SET trang_thai = ?,
                    waiting_assigner_luc = CASE WHEN ? = 1 THEN ? ELSE waiting_assigner_luc END,
                    error_luc = CASE WHEN ? = 1 THEN ? ELSE error_luc END,
                    cap_nhat_luc = ?
              WHERE id = ? AND workspace_id = ? AND trang_thai <> 'closed'`,
          )
          .bind(
            sau.trang_thai,
            sau.dat_waiting_assigner_luc ? 1 : 0,
            bay_gio,
            sau.trang_thai === 'error' ? 1 : 0,
            bay_gio,
            bay_gio,
            phien.id,
            lenh.workspace_id,
          ),
      );
    }
  }

  return {
    cau_lenh,
    // Tín hiệu chỉ cho phiên của đúng lượt này (BAT-57 — xem `#cauLenhTinHieuPhien`).
    luot_tin_hieu: phien.luot_giao_id,
    /*
     * `cau_hoi:<phiên>` để người giao đang treo trên một lệnh chờ dài thấy câu hỏi
     * ngay (19.6: "câu hỏi hiện trong `baton tasks` của người giao"). **Chỉ khi
     * mục là `question`**: một mục `thought` không có câu hỏi nào để ai xem, đánh
     * thức người giao vì nó là đánh thức vô ích.
     */
    danh_thuc: [
      `phien:${phien.id}`,
      `ticket:${phien.ticket_id}`,
      ...(loai === 'question' ? [`cau_hoi:${phien.id}`] : []),
    ],
    ket_qua: {
      id,
      phien_id: phien.id,
      ticket_id: phien.ticket_id,
      loai,
      thu_tu,
      gui_luc: bay_gio,
      tam_thoi,
      trang_thai_phien: sau.trang_thai,
      da_xac_nhan_dung: sau.trang_thai === 'closed',
    },
  };
}

/* ================================================================== *
 * 2. `dat_ke_hoach` — SPEC mục 6 d.191
 * ================================================================== */

export interface LenhDatKeHoach extends LenhChung {
  loai: 'dat_ke_hoach';
  phien_id: string;
  /** **Toàn bộ** danh sách bước, mỗi lần cập nhật — d.191. */
  buoc: unknown;
}

export interface KetQuaDatKeHoach {
  phien_id: string;
  phien_ban: number;
  so_buoc: number;
  buoc: BuocKeHoach[];
  gui_luc: number;
}

/**
 * "Agent gửi lại **toàn bộ danh sách** mỗi lần cập nhật" — SPEC mục 6 d.191.
 *
 * Nên lệnh này **thay cả danh sách**: không có tham số "bước thứ k", và `buoc`
 * rỗng là một kế hoạch rỗng hợp lệ. Cách lưu là **một phiên bản mới, chỉ thêm**
 * (xem migration 0007), nên không lệnh nào phải xoá dòng nào.
 */
export async function handlerDatKeHoach(
  lenh: LenhDatKeHoach,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaDatKeHoach>> {
  const buoc = kiemKeHoach(lenh.buoc);

  const phien = await phienBatBuoc(db, lenh.ai, lenh.workspace_id, lenh.phien_id);
  batBuocLaAgentCuaPhien(lenh, phien, 'gửi kế hoạch của phiên này');

  const con_mo = batBuocPhienConMo(db, lenh.workspace_id, phien, bay_gio);

  // Số đếm nằm trên `phien`, không suy ra bằng `max(phien_ban)` — xem
  // `keHoachCuaPhien` và migration 0007 (kế hoạch rỗng không có dòng nào).
  const phien_ban = phien.ke_hoach_phien_ban + 1;

  const ket_qua: KetQuaDatKeHoach = {
    phien_id: phien.id,
    phien_ban,
    so_buoc: buoc.length,
    buoc,
    gui_luc: bay_gio,
  };

  if (!con_mo.mo) {
    return {
      cau_lenh: con_mo.cau_lenh,
      loi_sau_ghi: con_mo.loi,
      luot_tin_hieu: phien.luot_giao_id,
      ket_qua,
    };
  }

  const cau = db.prepare(
    `INSERT INTO phien_ke_hoach
       (id, workspace_id, phien_id, phien_ban, thu_tu, noi_dung, trang_thai, gui_luc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  return {
    cau_lenh: [
      ...con_mo.cau_lenh,
      db
        .prepare(
          `UPDATE phien SET ke_hoach_phien_ban = ?, cap_nhat_luc = ?
            WHERE id = ? AND workspace_id = ?`,
        )
        .bind(phien_ban, bay_gio, phien.id, lenh.workspace_id),
      ...buoc.map((b, i) =>
        cau.bind(
          crypto.randomUUID(),
          lenh.workspace_id,
          phien.id,
          phien_ban,
          i + 1,
          b.noi_dung,
          b.trang_thai,
          bay_gio,
        ),
      ),
    ],
    danh_thuc: [`phien:${phien.id}`, `ticket:${phien.ticket_id}`],
    luot_tin_hieu: phien.luot_giao_id,
    ket_qua,
  };
}

/* ================================================================== *
 * 3. `tra_loi_cau_hoi` — `baton reply` (SPEC 19.12 câu 2, 19.6)
 * ================================================================== */

export interface LenhTraLoiCauHoi extends LenhChung {
  loai: 'tra_loi_cau_hoi';
  luot_giao_id: string;
  noi_dung: unknown;
  /** Trả lời mục `question` nào. Để trống = câu hỏi **chưa trả lời mới nhất**. */
  hoat_dong_id?: unknown;
}

export interface KetQuaTraLoiCauHoi {
  id: string;
  phien_id: string;
  ticket_id: string;
  luot_giao_id: string;
  /** Mục `question` được trả lời. */
  tra_loi_cho_id: string;
  /** Bình luận trên ticket — 19.12 câu 2 ghi **cả hai**, không chọn một. */
  comment_id: string;
  trang_thai_phien: TrangThaiPhien;
  gui_luc: number;
}

/**
 * `baton reply <lượt> "<nội dung>"` — SPEC **19.12 câu 2** (chốt của chủ, ưu tiên
 * hơn chữ cũ), cộng 19.6.
 *
 * Bốn luật, cả bốn ở đây:
 *   1. **Chỉ người giao của lượt đó** gọi được; agent khác → `FORBIDDEN`.
 *   2. **Chủ trả lời được, hành vi giống hệt** — nên không có nhánh riêng cho
 *      chủ: `batBuocLaNguoiGiao` cho chủ qua đúng khi chủ **là** người giao, còn
 *      lại thì chặn. (Chủ không phải người giao vẫn bị chặn: 19.12 nói "chủ trả
 *      lời từ web ở trang chi tiết ticket" **của câu hỏi gửi cho chủ**; một câu
 *      hỏi gửi cho agent `manager` không phải việc của chủ.)
 *   3. Câu trả lời là **một hoạt động trên phiên của người hỏi** *và* **một bình
 *      luận trên ticket**. Cả hai, trong **cùng một batch**: ghi một nửa thì câu
 *      trả lời có ở chỗ này mà mất ở chỗ kia.
 *   4. **Có câu trả lời thì phiên về `running`** (19.6), và "lần gọi kế tiếp của
 *      agent nhận được câu trả lời" — mốc `tra_loi_doc_luc` của phiên là chỗ nhớ
 *      "lần kế tiếp" đó; `heartbeat` trao rồi nhích mốc.
 *
 * **Lệnh CLI** `baton reply` là phần 5; đây là hành vi phía server + route.
 */
export async function handlerTraLoiCauHoi(
  lenh: LenhTraLoiCauHoi,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaTraLoiCauHoi>> {
  const noi_dung = kiemNoiDungBinhLuan(lenh.noi_dung);

  const luot = await luotBatBuoc(db, lenh.ai, lenh.workspace_id, lenh.luot_giao_id);
  // Luật 1 + 2: chỉ người giao của lượt đó; chủ qua đúng khi chủ là người giao.
  batBuocLaNguoiGiao(lenh, luot, 'trả lời câu hỏi của lượt này');

  const phien = await phienCuaLuot(db, lenh.workspace_id, luot.id);
  if (phien === null) {
    throw new BatonError('NOT_FOUND', { message: 'Lượt giao này chưa có phiên nào.' });
  }

  const hoat_dong_id = kiemChuTuyChon(lenh.hoat_dong_id, 'Mã hoạt động', 100);
  const cau_hoi = await db
    .prepare(
      `SELECT id FROM phien_hoat_dong
        WHERE workspace_id = ? AND phien_id = ? AND loai = 'question'
          ${hoat_dong_id === null ? '' : 'AND id = ?'}
          AND NOT EXISTS (
            SELECT 1 FROM phien_hoat_dong tl
             WHERE tl.workspace_id = phien_hoat_dong.workspace_id
               AND tl.tra_loi_cho_id = phien_hoat_dong.id
          )
        ORDER BY thu_tu DESC LIMIT 1`,
    )
    .bind(
      lenh.workspace_id,
      phien.id,
      ...(hoat_dong_id === null ? [] : [hoat_dong_id]),
    )
    .first<{ id: string }>();

  /*
   * Không có câu hỏi nào đang chờ → `NOT_FOUND`, **không** ghi gì. Câu trả lời
   * phải trỏ tới một mục `question` thật: CHECK của 0007 buộc `loai` rỗng **đúng
   * khi** `tra_loi_cho_id` khác rỗng, nên một "câu trả lời không trả lời gì" là
   * một dòng không hợp lệ ở DB. Trả lời hai lần cho cùng câu hỏi cũng vào đây —
   * câu hỏi đã có trả lời thì không còn "đang chờ".
   */
  if (cau_hoi === null) {
    throw new BatonError('NOT_FOUND', {
      message: 'Không có câu hỏi nào đang chờ trả lời trên lượt này.',
    });
  }

  const con_mo = batBuocPhienConMo(db, lenh.workspace_id, phien, bay_gio);
  const id = crypto.randomUUID();
  const comment_id = crypto.randomUUID();
  const thu_tu = await thuTuKeTiep(db, lenh.workspace_id, phien.id);

  const ket_qua: KetQuaTraLoiCauHoi = {
    id,
    phien_id: phien.id,
    ticket_id: phien.ticket_id,
    luot_giao_id: luot.id,
    tra_loi_cho_id: cau_hoi.id,
    comment_id,
    trang_thai_phien: con_mo.mo ? phienSauTraLoi(con_mo.trang_thai).trang_thai : 'closed',
    gui_luc: bay_gio,
  };

  if (!con_mo.mo) {
    return { cau_lenh: con_mo.cau_lenh, loi_sau_ghi: con_mo.loi, ket_qua };
  }

  const tac_gia = tacGiaCua(lenh.ai);
  const sau = phienSauTraLoi(con_mo.trang_thai);

  const cau_lenh = [
    ...con_mo.cau_lenh,
    // (a) một hoạt động trên phiên của người hỏi
    cauLenhThemHoatDong(db, {
      id,
      workspace_id: lenh.workspace_id,
      phien,
      loai: null,
      tac_gia,
      noi_dung,
      tra_loi_cho_id: cau_hoi.id,
      thu_tu,
      gui_luc: bay_gio,
    }),
    // (b) một bình luận trên ticket — cùng batch với (a)
    db
      .prepare(
        `INSERT INTO comment
           (id, workspace_id, ticket_id, tac_gia_loai, tac_gia_agent_id, noi_dung,
            da_sua, tao_luc, cap_nhat_luc)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .bind(
        comment_id,
        lenh.workspace_id,
        phien.ticket_id,
        tac_gia.loai === 'agent' ? 'agent' : 'owner',
        tac_gia.agentId ?? null,
        noi_dung,
        bay_gio,
        bay_gio,
      ),
  ];

  if (sau.doi) {
    /*
     * Phiên về `running` và **xoá mốc** `waiting_assigner_luc`: mốc đó là đồng hồ
     * 60 phút của 19.6, để nguyên thì lần hỏi sau mà quên đặt lại sẽ quá hạn ngay.
     *
     * **Không** chạm `tin_hieu_cuoi_luc`: tín hiệu là "lệnh ghi **của agent** trên
     * phiên đó" (d.188), mà lệnh này là của **người giao**. Agent đang chờ vẫn gửi
     * nhịp tim nên tín hiệu của nó tươi; nếu nó không gửi thì nó **đang đứng thật**,
     * và câu trả lời của người khác không được che chuyện đó.
     */
    cau_lenh.push(
      db
        .prepare(
          `UPDATE phien SET trang_thai = ?, waiting_assigner_luc = NULL, cap_nhat_luc = ?
            WHERE id = ? AND workspace_id = ? AND trang_thai <> 'closed'`,
        )
        .bind(sau.trang_thai, bay_gio, phien.id, lenh.workspace_id),
    );
  }

  return {
    cau_lenh,
    /*
     * Agent đang treo trên một lệnh chờ dài phải nhận câu trả lời ngay (19.6:
     * "lần gọi kế tiếp của agent nhận được câu trả lời"; mục 13 "có tín hiệu mới
     * thì trả về ngay").
     */
    danh_thuc: [
      `luot:${phien.agent_id}`,
      `phien:${phien.id}`,
      `ticket:${phien.ticket_id}`,
      `binh_luan:${phien.ticket_id}`,
    ],
    ket_qua,
  };
}

/* ================================================================== *
 * 4. Cảnh báo d.196 — **không có lệnh nào ở đây nữa**
 * ================================================================== *
 *
 * Lượt 4 có một lệnh `quet_canh_bao` mà Tổng quan gọi khi mở; 19.12 câu 46 chốt
 * rằng việc phát hiện là một **Cron Trigger quét mỗi 5 phút** và **không** dựa vào
 * việc có ai mở Tổng quan, nên lệnh đó đã được gỡ cùng route và ô quyền của nó.
 *
 * Đường hiện hành: `cron-canh-bao-phien.ts` (phát hiện) →
 * `WorkspaceGate.ghiMocCanhBao` (ghi mốc + chèn tin vào kho `thong_bao`). Đừng dựng
 * lại một lệnh có tên cho việc này — lý do đầy đủ ở đầu `cron-canh-bao-phien.ts`.
 */
