/**
 * Nửa sau của **lượt giao** — SPEC mục 5 ("Báo cáo nộp", "Nghiệm thu",
 * `canceled`, "Việc phát sinh"), 19.2, 19.3, 19.5, 19.11.
 *
 * Bốn lệnh:
 *   1. `nop_bao_cao` — người nhận nộp báo cáo có cấu trúc.
 *   2. `nghiem_thu`  — người giao chọn `accepted` hoặc `returned`.
 *   3. `huy_luot`    — người giao hoặc chủ huỷ.
 *   4. `tao_ticket_viec_phat_sinh` — người giao biến mục "Việc phát sinh" của
 *      một báo cáo đã nộp thành một ticket mới.
 *
 * **Không có máy trạng thái ticket thứ hai ở đây.** Mọi đổi trạng thái của
 * ticket đi qua `apSuKienLenTicket` → `apDungLuat` (module luật thuần của
 * `@baton/shared`), với đúng ba sự kiện mà bảng 19.2 nêu: `nop`, `nghiem_thu`,
 * `luot_huy`. File này chỉ lo **lượt giao**: ai được làm, lượt đang ở trạng thái
 * nào, ghi gì xuống bảng `luot_giao`.
 *
 * **Phiên** (SPEC mục 6 d.180, 19.6) — nối ở lượt 3:
 *   * Nộp báo cáo **đóng phiên** (`cauLenhDongPhien`).
 *   * **Huỷ lượt** đưa phiên sang `stopping`, **không** đóng thẳng
 *     (`cauLenhDungPhien`) — 19.6: "xử lý **như bấm Dừng**".
 *   * **Trả lại** (19.5) sinh một lượt `pending` mới; phiên mới mở lúc người nhận
 *     gọi lệnh "nhận", nên ở đây **không** có gì để làm — đúng chữ 19.5 ("Người
 *     nhận phải `nhan` lại, mở **phiên mới**").
 *
 * **Chưa làm ở lượt này (nợ, ghi rõ để không ai tưởng đã có):**
 *   * **Bằng chứng `review`** (SPEC mục 7, 19.3): reviewer nộp lượt review bằng
 *     bằng chứng `review` **cộng** báo cáo. Phần 3 cài bằng chứng; ở đây chỉ có
 *     nửa "cộng báo cáo", và luật "lượt review tự `accepted`" (19.3).
 *   * "Hiện ở **Cần chú ý**" của nộp `blocked` (19.2) và của review KHÔNG ĐẠT
 *     (19.11) là màn hình Tổng quan — phần 6.
 */

import {
  MUC_BAO_CAO,
  briefCongLyDoTraLai,
  hanPhanHoiApLai,
  kiemBaoCaoNop,
  kiemChuTuyChon,
  kiemKetQuaNop,
  kiemLyDo,
  BatonError,
  type AiGoi,
  type BaoCaoNop,
  type BoiCanhNguoiCam,
  type KetQuaNop,
  type LoaiLuotGiao,
  type TacGia,
  type TrangThaiLuotGiao,
  type TrangThaiTicket,
} from '@baton/shared';
import {
  batBuocKhongLuuTru,
  duAnBatBuoc,
  type BoiCanhLenh,
  type KetQuaHandler,
  type LenhChung,
  type YeuCauGhiLichSu,
} from './lenh-khung.js';
import { handlerTaoTicket, ticketBatBuoc, type KetQuaTaoTicket } from './lenh-ticket.js';
import { apSuKienLenTicket } from './lenh-trang-thai.js';
import { boiCanhNguoiCamCua } from './doc-luot-giao.js';
import {
  cauLenhDongPhien,
  cauLenhDungPhien,
  chanNeuPhienDaDong,
  danXuatVaGhiLai,
} from './lenh-phien.js';
import { phienCuaLuot } from './doc-phien.js';
import { locPhamViLuot } from './pham-vi-doc.js';

/* ------------------------------------------------------------------ *
 * Tra lượt giao trong cửa ghi
 * ------------------------------------------------------------------ */

/** 8 trường brief của lượt — cần khi trả lại (SPEC 19.5 dựng brief lượt mới). */
const TRUONG_BRIEF_LUOT = [
  'muc_tieu',
  'boi_canh',
  'pham_vi',
  'file_va_nguon',
  'dieu_cam',
  'xong_la_gi',
  'cach_kiem_chung',
  'nop_lai',
] as const;

export interface DongLuotGhi {
  id: string;
  ticket_id: string;
  so_luot: number;
  loai: LoaiLuotGiao;
  trang_thai: TrangThaiLuotGiao;
  nguoi_giao_loai: string;
  nguoi_giao_agent_id: string | null;
  nguoi_nhan_agent_id: string;
  han_phan_hoi_luc: number | null;
  ket_qua: KetQuaNop | null;
  bc_viec_phat_sinh: string | null;
  tao_luc: number;
  muc_tieu: string | null;
  boi_canh: string | null;
  pham_vi: string | null;
  file_va_nguon: string | null;
  dieu_cam: string | null;
  xong_la_gi: string | null;
  cach_kiem_chung: string | null;
  nop_lai: string | null;
}

const COT_LUOT_GHI = `id, ticket_id, so_luot, loai, trang_thai,
   nguoi_giao_loai, nguoi_giao_agent_id, nguoi_nhan_agent_id,
   han_phan_hoi_luc, ket_qua, bc_viec_phat_sinh, tao_luc,
   ${TRUONG_BRIEF_LUOT.join(', ')}`;

/**
 * Tra một lượt giao trong đúng workspace của lệnh, **trong phạm vi đọc của người
 * gọi**.
 *
 * Không có, thuộc workspace khác, **hoặc người gọi không thấy được** (ticket của
 * lượt nằm ngoài dự án người gọi được vào — `locPhamViLuot`, đúng luật của
 * `layTicket`) → `NOT_FOUND`, **cùng một dòng `throw`** (SPEC mục 13 d.386; 19.12
 * câu 15 "cả hai ca phải ra phản hồi giống hệt nhau" — BAT-57). Người gọi thấy
 * được mà không phải người giao/người nhận thì các hàm `batBuocLa*` sau đó vẫn ra
 * `FORBIDDEN` như cũ.
 */
export async function luotBatBuoc(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  luot_giao_id: unknown,
): Promise<DongLuotGhi> {
  if (typeof luot_giao_id !== 'string' || luot_giao_id.length === 0) {
    throw new BatonError('INVALID_INPUT', { message: 'Thiếu mã lượt giao.' });
  }
  const loc = locPhamViLuot(ai);
  const d = await db
    .prepare(
      `SELECT ${COT_LUOT_GHI} FROM luot_giao WHERE id = ? AND workspace_id = ?${loc.sql}`,
    )
    .bind(luot_giao_id, workspace_id, ...loc.bind)
    .first<DongLuotGhi>();
  if (d === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy lượt giao.' });
  return d;
}

/** Người giao của lượt, dạng `TacGia` — SPEC mục 5 ("chủ hoặc agent có quyền"). */
function nguoiGiaoCua(luot: DongLuotGhi): TacGia {
  return luot.nguoi_giao_loai === 'agent' && luot.nguoi_giao_agent_id !== null
    ? { loai: 'agent', agentId: luot.nguoi_giao_agent_id }
    : { loai: 'owner' };
}

/**
 * "**Người giao** nghiệm thu" / "**người giao** huỷ" — SPEC mục 5.
 *
 * Chủ luôn qua được: mục 5 nói thẳng "người giao huỷ, **hoặc chủ huỷ**", và
 * nguyên tắc 6 của mục 0 ("người luôn chịu trách nhiệm cuối cùng"). Với nghiệm
 * thu, lượt do chủ giao thì chủ **là** người giao, nên tham số `chu_luon_duoc`
 * chỉ bật ở lệnh huỷ.
 */
export function batBuocLaNguoiGiao(
  lenh: LenhChung,
  luot: DongLuotGhi,
  viec: string,
  chu_luon_duoc = false,
): void {
  const nguoi_giao = nguoiGiaoCua(luot);
  if (lenh.ai.loai === 'chu') {
    if (chu_luon_duoc || nguoi_giao.loai === 'owner') return;
    throw new BatonError('FORBIDDEN', { message: `Chỉ người giao của lượt này mới ${viec}.` });
  }
  if (lenh.ai.disabled) throw new BatonError('FORBIDDEN', { message: 'Agent đã bị tắt.' });
  if (nguoi_giao.loai !== 'agent' || nguoi_giao.agentId !== lenh.ai.agent_id) {
    throw new BatonError('FORBIDDEN', { message: `Chỉ người giao của lượt này mới ${viec}.` });
  }
}

/** "**Người nhận** đã nộp báo cáo" — SPEC mục 5. Không ai nộp hộ được, kể cả chủ. */
function batBuocLaNguoiNhan(lenh: LenhChung, luot: DongLuotGhi): void {
  if (lenh.ai.loai !== 'agent' || lenh.ai.agent_id !== luot.nguoi_nhan_agent_id) {
    throw new BatonError('FORBIDDEN', {
      message: 'Chỉ người nhận của lượt giao này mới nộp báo cáo được.',
    });
  }
  if (lenh.ai.disabled) throw new BatonError('FORBIDDEN', { message: 'Agent đã bị tắt.' });
}

function batBuocTrangThaiLuot(
  luot: DongLuotGhi,
  duoc: readonly TrangThaiLuotGiao[],
  message: string,
): void {
  if (!duoc.includes(luot.trang_thai)) {
    throw new BatonError('ASSIGNMENT_STATE_INVALID', { message });
  }
}

/**
 * Bối cảnh người đang cầm (SPEC 19.1) **sau** khi lượt này đổi trạng thái.
 *
 * `boiCanhNguoiCamCua` đọc DB, mà DB chưa có thay đổi của lệnh đang chạy (batch
 * chạy sau), nên phải gỡ/ghi đè bằng tay. Thiếu bước này thì mốc "không ai cầm"
 * của 19.1 tính theo trạng thái cũ: huỷ lượt duy nhất của một ticket mà đồng hồ
 * 24 giờ không bắt đầu chạy.
 */
async function boiCanhCamSau(
  db: D1Database,
  workspace_id: string,
  luot: DongLuotGhi,
  trang_thai_moi: TrangThaiLuotGiao,
): Promise<BoiCanhNguoiCam> {
  const bc = await boiCanhNguoiCamCua(db, workspace_id, luot.ticket_id);

  // Lượt này thôi "mở" (19.1) → gỡ nó khỏi bậc 1/bậc 2.
  if (luot.loai === 'review') delete bc.luot_review_mo;
  else delete bc.luot_worker_mo;

  // Bậc 3: "có lượt `submitted` chờ nghiệm thu → người giao lượt đó".
  if (trang_thai_moi === 'submitted') bc.nguoi_giao_luot_submitted = nguoiGiaoCua(luot);
  else if (bc.nguoi_giao_luot_submitted !== undefined && luot.trang_thai === 'submitted') {
    // Lượt `submitted` vừa rời `submitted`: nếu chính nó là nguồn của bậc 3 thì
    // bậc 3 không còn. Lượt `submitted` khác (loại kia) vẫn giữ nguyên bậc 3,
    // nên chỉ gỡ khi không còn lượt `submitted` nào khác.
    const con = await db
      .prepare(
        `SELECT 1 AS co FROM luot_giao
          WHERE workspace_id = ? AND ticket_id = ? AND id <> ? AND trang_thai = 'submitted'
          LIMIT 1`,
      )
      .bind(workspace_id, luot.ticket_id, luot.id)
      .first<{ co: number }>();
    if (con === null) delete bc.nguoi_giao_luot_submitted;
  }

  return bc;
}

/** Dòng lịch sử cho một lần đổi trạng thái lượt — SPEC mục 4 (Lịch sử). */
function lichSuLuot(luot: DongLuotGhi, moi: TrangThaiLuotGiao): YeuCauGhiLichSu {
  return {
    ticket_id: luot.ticket_id,
    truong: `luot_giao:${luot.id}`,
    gia_tri_cu: luot.trang_thai,
    gia_tri_moi: moi,
  };
}

/* ================================================================== *
 * 1. Nộp báo cáo — SPEC mục 5 ("Báo cáo nộp"), 19.2, 19.3
 * ================================================================== */

export interface LenhNopBaoCao extends LenhChung, Partial<Record<keyof BaoCaoNop, string | null>> {
  loai: 'nop_bao_cao';
  luot_giao_id: string;
  /** `done` · `partial` · `blocked` — **bắt buộc** (SPEC mục 0.1, 5). */
  ket_qua: string;
}

export interface KetQuaNopBaoCao {
  id: string;
  ticket_id: string;
  trang_thai: TrangThaiLuotGiao;
  ket_qua: KetQuaNop;
  nop_luc: number;
  /** Trạng thái ticket sau khi áp bảng 19.2. */
  ticket_trang_thai: TrangThaiTicket;
  /** Lượt `review` **tự `accepted`**, không cần nghiệm thu — SPEC 19.3. */
  tu_accepted: boolean;
  /** Phiên của lượt đã **đóng** — SPEC mục 6 d.180 ("đóng khi nộp"). */
  phien_da_dong: true;
}

export async function handlerNopBaoCao(
  lenh: LenhNopBaoCao,
  { db, bay_gio, cong }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaNopBaoCao>> {
  // Kiểm nhập **trước** mọi thứ khác (luật chung của handler ghi).
  const ket_qua = kiemKetQuaNop(lenh.ket_qua);
  const bao_cao = kiemBaoCaoNop(lenh);

  const luot = await luotBatBuoc(db, lenh.ai, lenh.workspace_id, lenh.luot_giao_id);

  batBuocLaNguoiNhan(lenh, luot);

  /*
   * "`in_progress`: người nhận **đã nhận**" → "`submitted`: người nhận **đã
   * nộp**" (SPEC mục 5). Lượt còn `pending` thì người nhận chưa nhận việc, nên
   * chưa có gì để nộp; lượt đã `submitted`/`accepted`/… thì nộp lại là một việc
   * khác mà SPEC không mô tả (trả lại mới sinh lượt mới — 19.5).
   */
  batBuocTrangThaiLuot(
    luot,
    ['in_progress'],
    `Chỉ nộp được lượt đang làm; lượt này đang "${luot.trang_thai}".`,
  );

  const ticket = await ticketBatBuoc(db, lenh.workspace_id, luot.ticket_id);
  batBuocKhongLuuTru(await duAnBatBuoc(db, lenh.workspace_id, ticket.project_id));

  /*
   * "**Mọi lệnh ghi sau khi phiên đóng bị từ chối** (`SESSION_CLOSED`)" — SPEC
   * mục 6 d.195. Nộp là lệnh ghi "trên phiên đó" rõ nhất trong cả mục 5 (d.188
   * kể tên nó), nên nó phải chịu luật này. Ca thật: chủ bấm Dừng, agent im 10
   * phút, phiên tự đóng (d.194) — rồi agent tỉnh lại và nộp. Lượt vẫn
   * `in_progress` nên không có luật nào khác chặn.
   */
  const chan = await chanNeuPhienDaDong(db, lenh.workspace_id, luot.id, bay_gio);

  /*
   * **SPEC 19.3** — "Reviewer nộp lượt review bằng cách gửi bằng chứng `review`
   * cộng báo cáo. Lượt review **tự `accepted`**, không cần nghiệm thu, vì kết
   * luận đã nằm trong review."
   *
   * Nửa "bằng chứng `review`" là phần 3 (bảng `evidence` chưa có). Nửa cài được
   * ở đây là trạng thái lượt: lượt `review` nộp xong đi thẳng `accepted`, không
   * qua `submitted`, nên nó không bao giờ nằm chờ ai nghiệm thu.
   */
  const tu_accepted = luot.loai === 'review';
  const trang_thai_moi: TrangThaiLuotGiao = tu_accepted ? 'accepted' : 'submitted';

  if (chan !== null) {
    return {
      cau_lenh: chan.cau_lenh,
      loi_sau_ghi: chan.loi,
      // Lệnh gắn lượt (câu 45), kể cả khi bị từ chối — BAT-57.
      luot_tin_hieu: luot.id,
      ket_qua: {
        id: luot.id,
        ticket_id: ticket.id,
        trang_thai: luot.trang_thai,
        ket_qua,
        nop_luc: bay_gio,
        ticket_trang_thai: ticket.trang_thai,
        tu_accepted,
        phien_da_dong: true,
      },
    };
  }

  const cau_lenh = [
    db
      .prepare(
        `UPDATE luot_giao
            SET trang_thai = ?, ket_qua = ?,
                ${MUC_BAO_CAO.map((m) => `bc_${m} = ?`).join(', ')},
                nop_luc = ?, dong_luc = ?, cap_nhat_luc = ?
          WHERE id = ? AND workspace_id = ?`,
      )
      .bind(
        trang_thai_moi,
        ket_qua,
        ...MUC_BAO_CAO.map((m) => bao_cao[m]),
        bay_gio,
        // `dong_luc` = lúc lượt rời trạng thái mở sang một **kết** (0004). Nộp
        // một lượt `work` chưa phải kết: nó đang **chờ nghiệm thu** (19.1).
        tu_accepted ? bay_gio : null,
        bay_gio,
        luot.id,
        lenh.workspace_id,
      ),
  ];

  /*
   * **Bảng 19.2, ba hàng đầu**, đi qua đúng một sự kiện của module luật thuần:
   *   Nộp `done`    → kiểm cổng: đủ thì Xong, thiếu thì Chờ kiểm chứng.
   *   Nộp `partial` → giữ Đang làm.
   *   Nộp `blocked` → về Cần làm.
   * Không viết lại ba hàng này ở đây — `apDungLuat` đã có và đã có test riêng.
   */
  /*
   * "Phiên … **đóng khi nộp**" — SPEC mục 6 d.180–181. Cùng batch với `UPDATE
   * luot_giao`: một lượt `submitted` còn phiên mở là một đồng hồ ngưỡng đứng chạy
   * cho một agent đã xong việc, và nó sẽ bắn cảnh báo "phiên đứng" (d.196) 30
   * phút sau mỗi lần nộp.
   *
   * **Đứng TRƯỚC `apSuKienLenTicket`**, và thứ tự ấy là nội dung: nửa thứ hai của
   * d.181 (ticket sang Chờ kiểm chứng / Xong ⇒ đóng phiên, lý do "việc đã xong")
   * chạy trong `apSuKienLenTicket`, và cả hai câu đều có `WHERE trang_thai <>
   * 'closed'` nên **câu chạy trước quyết lý do**. Nguyên nhân thật ở đây là *nộp*,
   * nên lịch sử phiên phải ghi `LY_DO_DONG_NOP`. Câu kia vẫn có việc: nó đóng các
   * phiên **cũ khác** của cùng ticket (agent chết giữa chừng, lượt bị huỷ mà agent
   * không xác nhận `STOP`).
   */
  cau_lenh.push(...cauLenhDongPhien(db, lenh.workspace_id, luot.id, bay_gio));

  const ap = await apSuKienLenTicket(
    db,
    lenh.workspace_id,
    ticket,
    { loai: 'nop', ket_qua },
    {
      bay_gio,
      cong,
      la_chu: false,
      boi_canh_cam: await boiCanhCamSau(db, lenh.workspace_id, luot, trang_thai_moi),
    },
  );
  cau_lenh.push(...ap.cau_lenh);

  return {
    cau_lenh,
    lich_su: [lichSuLuot(luot, trang_thai_moi), ...ap.lich_su],
    danh_thuc: [
      // Người giao đang chờ việc của mình (SPEC mục 13 `--wait`).
      ...(luot.nguoi_giao_agent_id === null ? [] : [`luot:${luot.nguoi_giao_agent_id}`]),
      `luot:${luot.nguoi_nhan_agent_id}`,
      ...ap.danh_thuc,
    ],
    // Nộp gắn đúng lượt này: cửa ghi chỉ nhích phiên của lượt (BAT-57). Phiên đó
    // đóng trong cùng batch, nên trên thực tế không phiên nào khác bị nhích.
    luot_tin_hieu: luot.id,
    ket_qua: {
      id: luot.id,
      ticket_id: ticket.id,
      trang_thai: trang_thai_moi,
      ket_qua,
      nop_luc: bay_gio,
      // `ap.trang_thai`, **không** `ap.kq.trang_thai`: cờ "cần review lại" (19.3
      // d.494) có thể kéo ticket **về** Chờ kiểm chứng sau sự kiện gốc.
      ticket_trang_thai: ap.trang_thai,
      tu_accepted,
      phien_da_dong: true,
    },
  };
}

/* ================================================================== *
 * 2. Nghiệm thu — SPEC mục 5 ("Nghiệm thu"), 19.2, 19.5
 * ================================================================== */

/** Hai kết quả nghiệm thu, **mã máy của bảng SPEC mục 0.1**. */
export const KET_QUA_NGHIEM_THU = ['accepted', 'returned'] as const;
export type KetQuaNghiemThu = (typeof KET_QUA_NGHIEM_THU)[number];

export interface LenhNghiemThu extends LenhChung {
  loai: 'nghiem_thu';
  luot_giao_id: string;
  /** `accepted` (Đạt) hoặc `returned` (Trả lại) — SPEC mục 0.1, 5. */
  ket_qua: string;
  /** **Bắt buộc khi `returned`** — SPEC mục 5. */
  ly_do?: string | null;
}

export interface KetQuaLenhNghiemThu {
  id: string;
  ticket_id: string;
  trang_thai: TrangThaiLuotGiao;
  ticket_trang_thai: TrangThaiTicket;
  /** Lượt mới do trả lại sinh ra — SPEC 19.5. `null` khi `accepted`. */
  luot_moi: {
    id: string;
    so_luot: number;
    trang_thai: TrangThaiLuotGiao;
    nguoi_nhan_agent_id: string;
    han_phan_hoi_luc: number | null;
  } | null;
}

export async function handlerNghiemThu(
  lenh: LenhNghiemThu,
  { db, bay_gio, cong }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaLenhNghiemThu>> {
  if (!(KET_QUA_NGHIEM_THU as readonly string[]).includes(lenh.ket_qua)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Kết quả nghiệm thu phải là accepted hoặc returned (SPEC mục 0.1).',
    });
  }
  const ket_qua = lenh.ket_qua as KetQuaNghiemThu;

  // "`returned`: người giao trả lại, **bắt buộc có lý do**" — SPEC mục 5.
  // `kiemLyDo` ném `REASON_REQUIRED`, đúng mã của mục 13.
  const ly_do = ket_qua === 'returned' ? kiemLyDo(lenh.ly_do) : null;

  const luot = await luotBatBuoc(db, lenh.ai, lenh.workspace_id, lenh.luot_giao_id);

  batBuocLaNguoiGiao(lenh, luot, 'nghiệm thu được');

  // "Nghiệm thu: **người giao** chọn `accepted` hoặc `returned`" (mục 5) chỉ có
  // nghĩa với một lượt **đã nộp** — 19.1 gọi `submitted` là "chờ nghiệm thu".
  batBuocTrangThaiLuot(
    luot,
    ['submitted'],
    `Chỉ nghiệm thu được lượt đã nộp; lượt này đang "${luot.trang_thai}".`,
  );

  const ticket = await ticketBatBuoc(db, lenh.workspace_id, luot.ticket_id);
  batBuocKhongLuuTru(await duAnBatBuoc(db, lenh.workspace_id, ticket.project_id));

  const cau_lenh = [
    db
      .prepare(
        `UPDATE luot_giao SET trang_thai = ?, ly_do = ?, dong_luc = ?, cap_nhat_luc = ?
          WHERE id = ? AND workspace_id = ?`,
      )
      .bind(ket_qua, ly_do, bay_gio, bay_gio, luot.id, lenh.workspace_id),
  ];
  const lich_su: YeuCauGhiLichSu[] = [lichSuLuot(luot, ket_qua)];
  const danh_thuc = [`luot:${luot.nguoi_nhan_agent_id}`];

  /*
   * **SPEC 19.5 — trả lại sinh lượt mới.**
   *
   * "`returned` tạo lượt mới trạng thái `pending`, **cùng người nhận**. Người
   * nhận phải `nhan` lại… Hạn phản hồi áp lại. Brief của lượt mới = brief cũ,
   * cộng mục **Lý do trả lại** đặt ở đầu."
   *
   * Lượt mới nằm **cùng batch** với lượt bị trả: `ux_luot_giao_mo` của 0004
   * không cho hai lượt cùng loại mở một lúc, nên nếu hai câu lệnh tách ra và câu
   * đầu hỏng thì ticket có hai lượt mở, hoặc không còn lượt nào.
   */
  let luot_moi: KetQuaLenhNghiemThu['luot_moi'] = null;

  if (ket_qua === 'returned' && ly_do !== null) {
    const max = await db
      .prepare(
        // `workspace_id` trong mọi câu trên `luot_giao` — xem `quyet-dinh.md`.
        'SELECT coalesce(max(so_luot), 0) AS n FROM luot_giao WHERE workspace_id = ? AND ticket_id = ?',
      )
      .bind(lenh.workspace_id, luot.ticket_id)
      .first<{ n: number }>();
    const so_luot = (max?.n ?? 0) + 1;

    const id = crypto.randomUUID();
    const han_luc = hanPhanHoiApLai(luot, bay_gio);

    const brief: Record<string, string | null> = {};
    for (const t of TRUONG_BRIEF_LUOT) brief[t] = luot[t];
    brief['muc_tieu'] = briefCongLyDoTraLai(luot.muc_tieu, ly_do);

    cau_lenh.push(
      db
        .prepare(
          `INSERT INTO luot_giao
             (id, workspace_id, ticket_id, so_luot, loai,
              nguoi_giao_loai, nguoi_giao_agent_id, nguoi_nhan_agent_id, trang_thai,
              ${TRUONG_BRIEF_LUOT.join(', ')},
              han_phan_hoi_luc, luot_truoc_id, tao_luc, cap_nhat_luc)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending',
                   ${TRUONG_BRIEF_LUOT.map(() => '?').join(', ')}, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          lenh.workspace_id,
          luot.ticket_id,
          so_luot,
          luot.loai,
          luot.nguoi_giao_loai,
          luot.nguoi_giao_agent_id,
          // **Cùng người nhận** — SPEC 19.5.
          luot.nguoi_nhan_agent_id,
          ...TRUONG_BRIEF_LUOT.map((t) => brief[t] ?? null),
          han_luc,
          luot.id,
          bay_gio,
          bay_gio,
        ),
    );

    lich_su.push({
      ticket_id: luot.ticket_id,
      truong: `luot_giao:${luot.loai}`,
      gia_tri_cu: null,
      gia_tri_moi: luot.nguoi_nhan_agent_id,
    });

    luot_moi = {
      id,
      so_luot,
      trang_thai: 'pending',
      nguoi_nhan_agent_id: luot.nguoi_nhan_agent_id,
      han_phan_hoi_luc: han_luc,
    };
  }

  /*
   * **Bảng 19.2, hai hàng nghiệm thu:**
   *   `accepted` → ticket chưa Xong thì sang Chờ kiểm chứng, **và Baton kiểm
   *                cổng ngay**. (Mục 5: "`accepted` **không tự làm ticket
   *                Xong**"; Xong chỉ qua cổng bằng chứng.)
   *   `returned` → giữ Đang làm.
   */
  const boi_canh_cam = await boiCanhCamSau(db, lenh.workspace_id, luot, ket_qua);
  // Lượt mới của 19.5 là một lượt **mở**, nên nó cầm ticket ngay (19.1 bậc 2).
  if (luot_moi !== null) {
    const nguoi_nhan: TacGia = { loai: 'agent', agentId: luot_moi.nguoi_nhan_agent_id };
    if (luot.loai === 'review') boi_canh_cam.luot_review_mo = nguoi_nhan;
    else boi_canh_cam.luot_worker_mo = nguoi_nhan;
  }

  const ap = await apSuKienLenTicket(
    db,
    lenh.workspace_id,
    ticket,
    { loai: 'nghiem_thu', ket_qua },
    { bay_gio, cong, la_chu: lenh.ai.loai === 'chu', boi_canh_cam },
  );
  cau_lenh.push(...ap.cau_lenh);
  lich_su.push(...ap.lich_su);
  danh_thuc.push(...ap.danh_thuc);

  return {
    cau_lenh,
    lich_su,
    danh_thuc,
    ket_qua: {
      id: luot.id,
      ticket_id: ticket.id,
      trang_thai: ket_qua,
      ticket_trang_thai: ap.trang_thai,
      luot_moi,
    },
  };
}

/* ================================================================== *
 * 3. Huỷ lượt — SPEC mục 5 (`canceled`), 19.2, 19.11
 * ================================================================== */

export interface LenhHuyLuot extends LenhChung {
  loai: 'huy_luot';
  luot_giao_id: string;
  /** Tuỳ chọn: SPEC chỉ bắt buộc lý do cho `returned`, không cho `canceled`. */
  ly_do?: string | null;
}

export interface KetQuaHuyLuot {
  id: string;
  ticket_id: string;
  trang_thai: TrangThaiLuotGiao;
  ticket_trang_thai: TrangThaiTicket;
  /** Còn lượt mở nào khác trên ticket không — quyết hàng cuối bảng 19.2. */
  con_luot_mo: boolean;
  /**
   * Phiên của lượt đã sang `stopping` — SPEC 19.6 ("huỷ lượt có phiên đang chạy:
   * phiên sang `stopping`, xử lý **như bấm Dừng**"). `false` khi lượt chưa có
   * phiên nào (lượt còn `pending`), hoặc phiên đã đóng từ trước.
   */
  phien_dang_dung: boolean;
}

export async function handlerHuyLuot(
  lenh: LenhHuyLuot,
  { db, bay_gio, cong }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaHuyLuot>> {
  const ly_do = kiemChuTuyChon(lenh.ly_do, 'Lý do huỷ lượt', 2000);

  const luot = await luotBatBuoc(db, lenh.ai, lenh.workspace_id, lenh.luot_giao_id);

  // "`canceled`: **người giao huỷ, hoặc chủ huỷ**" — SPEC mục 5.
  batBuocLaNguoiGiao(lenh, luot, 'huỷ được lượt này', true);

  // Lượt đã kết (`accepted`, `returned`, `canceled`) thì không còn gì để huỷ.
  // `submitted` huỷ được: nó chưa kết, chỉ đang chờ nghiệm thu (19.1).
  batBuocTrangThaiLuot(
    luot,
    ['pending', 'in_progress', 'submitted'],
    `Lượt đã kết ở trạng thái "${luot.trang_thai}", không huỷ được nữa.`,
  );

  const ticket = await ticketBatBuoc(db, lenh.workspace_id, luot.ticket_id);
  batBuocKhongLuuTru(await duAnBatBuoc(db, lenh.workspace_id, ticket.project_id));

  /*
   * **SPEC 19.11** — "Huỷ lượt `work` khi lượt `review` đang mở: lượt review
   * **không bị huỷ theo**."
   *
   * Nên lệnh này đụng **đúng một dòng** `luot_giao`, và câu đếm dưới đây chỉ để
   * trả lời hàng cuối bảng 19.2 ("lượt bị `canceled`, **không còn lượt mở nào**
   * → ticket về Cần làm"). Thêm bất cứ câu `UPDATE` nào lên lượt khác là vi phạm
   * 19.11.
   */
  const khac = await db
    .prepare(
      `SELECT 1 AS co FROM luot_giao
        WHERE workspace_id = ? AND ticket_id = ? AND id <> ?
          AND trang_thai IN ('pending', 'in_progress')
        LIMIT 1`,
    )
    .bind(lenh.workspace_id, ticket.id, luot.id)
    .first<{ co: number }>();
  const con_luot_mo = khac !== null;

  const cau_lenh = [
    db
      .prepare(
        `UPDATE luot_giao SET trang_thai = 'canceled', ly_do = coalesce(?, ly_do),
                dong_luc = ?, cap_nhat_luc = ? WHERE id = ? AND workspace_id = ?`,
      )
      .bind(ly_do, bay_gio, bay_gio, luot.id, lenh.workspace_id),
  ];

  /*
   * **SPEC 19.6** — "**Huỷ lượt** có phiên đang chạy: phiên sang `stopping`, xử
   * lý **như bấm Dừng** (mục 6)."
   *
   * Nên **không** đóng phiên ở đây, dù mục 6 d.180 nói phiên "đóng khi nộp, **bị
   * huỷ** hoặc bị dừng": 19.6 ưu tiên hơn (mục 19 tự khai vậy) và nói rõ hơn — ở
   * đâu *cũng* đóng, nhưng đóng **sau** khi agent xác nhận `STOP`, hoặc sau 10
   * phút nó không xác nhận (d.194). Đóng thẳng bây giờ là cắt mất nửa luật d.193
   * (agent nhận `STOP` rồi phải gửi `result`/`error`), và agent sẽ chạy tiếp một
   * việc đã bị huỷ mà không ai nói cho nó biết.
   */
  /*
   * `danXuatVaGhiLai`, không `danXuat`: một phiên `stopping` **quá 10 phút** là
   * `closed` về mặt luật (d.194) nhưng DB chưa biết, và đường này phải **thu dọn**
   * cái đóng đó như `heartbeat` và `dung_phien` vẫn làm. Dùng `danXuat` thì kết
   * luận vẫn đúng ở đường đọc, nhưng dòng `phien` nằm lại ở `stopping` mãi — tức
   * một lệnh ghi đi qua phiên mà không ghi cái nó vừa biết (nợ reviewer lượt 3).
   */
  const phien_truoc = await phienCuaLuot(db, lenh.workspace_id, luot.id);
  let phien_dang_dung = false;
  if (phien_truoc !== null) {
    const sau = danXuatVaGhiLai(db, lenh.workspace_id, phien_truoc, bay_gio);
    cau_lenh.push(...sau.cau_lenh);
    phien_dang_dung = sau.trang_thai !== 'closed';
    if (phien_dang_dung) {
      cau_lenh.push(...cauLenhDungPhien(db, lenh.workspace_id, luot.id, bay_gio));
    }
  }

  const ap = await apSuKienLenTicket(
    db,
    lenh.workspace_id,
    ticket,
    { loai: 'luot_huy', con_luot_mo },
    {
      bay_gio,
      cong,
      la_chu: lenh.ai.loai === 'chu',
      boi_canh_cam: await boiCanhCamSau(db, lenh.workspace_id, luot, 'canceled'),
    },
  );
  cau_lenh.push(...ap.cau_lenh);

  return {
    cau_lenh,
    lich_su: [lichSuLuot(luot, 'canceled'), ...ap.lich_su],
    danh_thuc: [`luot:${luot.nguoi_nhan_agent_id}`, ...ap.danh_thuc],
    ket_qua: {
      id: luot.id,
      ticket_id: ticket.id,
      trang_thai: 'canceled',
      ticket_trang_thai: ap.trang_thai,
      con_luot_mo,
      phien_dang_dung,
    },
  };
}

/* ================================================================== *
 * 4. "Tạo ticket từ việc phát sinh" — SPEC mục 5
 * ================================================================== */

export interface LenhTaoTicketViecPhatSinh extends LenhChung {
  loai: 'tao_ticket_viec_phat_sinh';
  luot_giao_id: string;
  /** Để trống thì lấy **dòng đầu** của mục "Việc phát sinh" làm tiêu đề. */
  tieu_de?: string;
}

export interface KetQuaTaoTicketViecPhatSinh extends KetQuaTaoTicket {
  luot_giao_id: string;
}

/** Dòng đầu, cắt còn tối đa 200 ký tự — khớp `kiemTieuDeTicket` (SPEC mục 4). */
function tieuDeTuViecPhatSinh(viec_phat_sinh: string): string {
  const dong = viec_phat_sinh
    .split('\n')
    .map((d) => d.replace(/^[\s*\-+>#\d.)]+/, '').trim())
    .find((d) => d.length > 0);
  return (dong ?? viec_phat_sinh.trim()).slice(0, 200);
}

/**
 * "**Việc phát sinh** trong báo cáo có nút (cho **người giao**) *Tạo ticket từ
 * việc phát sinh*" — SPEC mục 5.
 *
 * Nút là phần 6; đường API là ở đây. Lệnh **dùng lại `handlerTaoTicket`**, không
 * nhân bản một luật tạo ticket nào: cấp số `MÃ-số` không tái dùng, bảng quyền
 * hàng "Tạo ticket", dự án `paused`/`archived`, người chịu trách nhiệm mặc định
 * — tất cả vẫn là mã của mục 4, chạy đúng một bản.
 *
 * Hai cửa, cả hai đều cần: **người giao của lượt** (chữ SPEC) **và** quyền "Tạo
 * ticket" trong dự án đó (bảng quyền mục 3, do `handlerTaoTicket` kiểm).
 *
 * SPEC **không nói** ticket mới có nối liên kết gì với ticket gốc không, nên
 * lệnh này **không nối gì** — xem câu hỏi SPEC gửi M-Baton. Không đoán: nối
 * `related` hai chiều là một quyết định sản phẩm nhìn thấy được trên mọi trang
 * ticket, không phải một chi tiết cài đặt.
 */
export async function handlerTaoTicketViecPhatSinh(
  lenh: LenhTaoTicketViecPhatSinh,
  boi_canh: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaTaoTicketViecPhatSinh>> {
  const { db } = boi_canh;
  const tieu_de_tay = kiemChuTuyChon(lenh.tieu_de, 'Tiêu đề ticket', 200);

  const luot = await luotBatBuoc(db, lenh.ai, lenh.workspace_id, lenh.luot_giao_id);

  batBuocLaNguoiGiao(lenh, luot, 'tạo được ticket từ việc phát sinh');

  // Chỉ có báo cáo mới có mục "Việc phát sinh", nên lượt phải **đã nộp**.
  batBuocTrangThaiLuot(
    luot,
    ['submitted', 'accepted', 'returned'],
    `Lượt chưa nộp báo cáo (đang "${luot.trang_thai}"), chưa có việc phát sinh nào.`,
  );

  const viec_phat_sinh = luot.bc_viec_phat_sinh;
  if (viec_phat_sinh === null || viec_phat_sinh.trim().length === 0) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Báo cáo của lượt này không có mục "Việc phát sinh".',
    });
  }

  const ticket_goc = await ticketBatBuoc(db, lenh.workspace_id, luot.ticket_id);

  // Không truyền `trang_thai` (BAT-63): việc phát sinh luôn ra Cần làm, mặc định của
  // mục 4 — lệnh này không mở trường trạng thái cho client.
  const ket = await handlerTaoTicket(
    {
      loai: 'tao_ticket',
      workspace_id: lenh.workspace_id,
      ai: lenh.ai,
      project_id: ticket_goc.project_id,
      tieu_de: tieu_de_tay ?? tieuDeTuViecPhatSinh(viec_phat_sinh),
      mo_ta: viec_phat_sinh,
    },
    boi_canh,
  );

  return {
    ...ket,
    ket_qua: { ...ket.ket_qua, luot_giao_id: luot.id },
  };
}
