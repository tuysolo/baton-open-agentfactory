/**
 * Lệnh ghi về **lượt giao** — SPEC mục 5 (+ 19.1, 19.3, 19.5).
 *
 * Lượt này cài nửa đầu của mục 5: **tạo lượt** và **nhận việc**. Nộp báo cáo,
 * nghiệm thu, trả lại, huỷ là lượt sau.
 *
 * Luật của SPEC được cài ở đây:
 *   * "Agent `worker` **không tạo được** lượt giao" — qua hàng "Giao việc (tạo
 *     lượt giao)" của bảng quyền mục 3, **không** viết lại điều kiện vai trò.
 *   * "Không giao cho agent đang `disabled`, hoặc agent **không có quyền vào dự
 *     án đó**" → `FORBIDDEN`.
 *   * "**Không giao cho chính mình**".
 *   * "Mỗi ticket chỉ có tối đa 1 lượt giao mở, **trừ lượt review** được mở song
 *     song" (mục 5 + 19.1: tối đa 1 lượt `work` mở **và** 1 lượt `review` mở).
 *   * "Brief lấy từ ticket nếu có, **cho sửa riêng cho lượt này**".
 *   * "Có thể đặt **hạn phản hồi** (mặc định 15 phút)".
 *   * Lượt `review` do `manager` hoặc `coordinator` tạo (19.3).
 *   * "Mở một lượt giao cho ticket ở nhóm `planned` thì ticket **tự sang Đang
 *     làm**" (mục 4 dòng 134) — đi qua module luật thuần `apDungLuat`.
 *   * **Nhận việc**: chỉ người nhận gọi được; `pending` → `in_progress`. "Quá hạn
 *     phản hồi mà chưa nhận thì lượt hiện Không phản hồi … **lượt không tự huỷ**"
 *     — nên lệnh nhận **không** có bất kỳ phép so hạn nào.
 *   * **Phiên mở khi agent nhận một lượt giao** (mục 6 d.180) — qua
 *     `cauLenhMoPhien` của `lenh-phien.ts`, cùng batch với lệnh nhận.
 */

import {
  apDungLuat,
  batBuocQuyen,
  hanPhanHoiLuc,
  kiemBrief,
  kiemHanPhanHoiPhut,
  kiemLoaiLuotGiao,
  BatonError,
  type AiGoi,
  type Brief,
  type LoaiLuotGiao,
  type TrangThaiLuotGiao,
  type VaiTroAgent,
} from '@baton/shared';
import {
  batBuocKhongLuuTru,
  batBuocNhanViecMoi,
  duAnBatBuoc,
  tacGiaCua,
  type BoiCanhLenh,
  type KetQuaHandler,
  type LenhChung,
  type YeuCauGhiLichSu,
} from './lenh-khung.js';
import { cauLenhNguoiCam, ticketBatBuoc, laTicketDieuPhoi, soConChuaKet } from './lenh-ticket.js';
import { boiCanhNguoiCamCua } from './doc-luot-giao.js';
import { locPhamViAgent } from './doc-du-an.js';
import { locPhamViLuot } from './pham-vi-doc.js';
import { apCoReviewLai } from './lenh-trang-thai.js';
import { cauLenhMoPhien } from './lenh-phien.js';

/** 8 trường brief, đúng thứ tự của SPEC mục 4. */
const TRUONG_BRIEF_LUOT = [
  'muc_tieu',
  'boi_canh',
  'pham_vi',
  'file_va_nguon',
  'dieu_cam',
  'xong_la_gi',
  'cach_kiem_chung',
  'nop_lai',
] as const satisfies readonly (keyof Brief)[];

/** Vai trò được **tạo lượt `review`** — SPEC 19.3. */
export const VAI_TRO_TAO_LUOT_REVIEW = ['manager', 'coordinator'] as const;

/* ------------------------------------------------------------------ *
 * Tra người nhận — SPEC mục 5 "Luật"
 * ------------------------------------------------------------------ */

interface DongNguoiNhan {
  id: string;
  vai_tro: VaiTroAgent;
  disabled: number;
  vao_tat_ca_du_an: number;
  trong_du_an: number;
}

/**
 * Người nhận phải là một agent **trong cùng workspace**, **không `disabled`**, và
 * **được vào dự án của ticket** — SPEC mục 5.
 *
 * Hai ca sau là `FORBIDDEN` theo đúng chữ SPEC ("Không giao cho agent đang
 * `disabled`, hoặc agent không có quyền vào dự án đó (`FORBIDDEN`)"). Agent không
 * tồn tại thì `NOT_FOUND`: đó là một id sai, không phải một luật bị vi phạm.
 *
 * **Agent ngoài phạm vi người gọi = không tồn tại** (BAT-48; SPEC mục 13 d.399,
 * 19.12 câu 15; `cau-hoi-spec.md` #172). Câu tra lọc bằng **đúng** `locPhamViAgent`
 * mà `GET /v1/agent` dùng, nên agent người gọi không thấy cho `d === null` và đi
 * qua **cùng một dòng `throw`** với id không có — cùng mã, cùng thông điệp, cùng
 * 404. Trước BAT-48 câu tra cả workspace, nên id của agent ngoài phạm vi ra
 * `FORBIDDEN` (tắt / không vào dự án) còn id bịa ra `NOT_FOUND` — một máy dò.
 * Hai `FORBIDDEN` bên dưới giờ chỉ còn chạm agent người gọi **đã thấy** được.
 * Chủ và agent `vao_tat_ca_du_an` thấy mọi agent (`locPhamViAgent` trả rỗng).
 *
 * Câu `FROM agent` **không alias**: đoạn lọc viết cột trần của bảng `agent`.
 */
async function nguoiNhanBatBuoc(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  project_id: string,
  agent_id: unknown,
): Promise<DongNguoiNhan> {
  if (typeof agent_id !== 'string' || agent_id.length === 0) {
    throw new BatonError('INVALID_INPUT', { message: 'Thiếu người nhận của lượt giao.' });
  }

  const loc = locPhamViAgent(ai);
  const d = await db
    .prepare(
      `SELECT id, vai_tro, disabled, vao_tat_ca_du_an,
              (SELECT count(*) FROM agent_project ap
                WHERE ap.agent_id = agent.id AND ap.project_id = ?) AS trong_du_an
         FROM agent WHERE id = ? AND workspace_id = ?${loc.sql}`,
    )
    .bind(project_id, agent_id, workspace_id, ...loc.bind)
    .first<DongNguoiNhan>();

  if (d === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy agent người nhận.' });
  if (d.disabled === 1) {
    throw new BatonError('FORBIDDEN', { message: 'Không giao việc cho agent đã bị tắt.' });
  }
  if (d.vao_tat_ca_du_an !== 1 && d.trong_du_an === 0) {
    throw new BatonError('FORBIDDEN', {
      message: 'Người nhận không được vào dự án của ticket này.',
    });
  }
  return d;
}

/* ------------------------------------------------------------------ *
 * Tạo lượt giao — SPEC mục 5
 * ------------------------------------------------------------------ */

export interface LenhTaoLuotGiao
  extends LenhChung,
    Partial<Record<keyof Brief, string | null>> {
  loai: 'tao_luot_giao';
  ticket_id: string;
  nguoi_nhan_agent_id: string;
  /** `work` (mặc định) hoặc `review` — SPEC 0.1, 19.1. */
  loai_luot?: string;
  /** `baton assign --timeout 15`; mặc định 15 phút, `null` = không đặt hạn. */
  han_phan_hoi_phut?: number | null;
}

export interface KetQuaTaoLuotGiao {
  id: string;
  ticket_id: string;
  so_luot: number;
  loai: LoaiLuotGiao;
  trang_thai: TrangThaiLuotGiao;
  nguoi_nhan_agent_id: string;
  han_phan_hoi_luc: number | null;
  /** Trạng thái ticket sau khi mở lượt (SPEC mục 4 dòng 134). */
  ticket_trang_thai: string;
}

export async function handlerTaoLuotGiao(
  lenh: LenhTaoLuotGiao,
  { db, bay_gio, cong }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaTaoLuotGiao>> {
  // Kiểm nhập **trước** mọi thứ khác (luật chung của handler ghi, `lenh-khung.ts`).
  const loai = kiemLoaiLuotGiao(lenh.loai_luot);
  const han_phut = kiemHanPhanHoiPhut(lenh.han_phan_hoi_phut);
  const brief_ghi_de = kiemBrief(lenh);

  /*
   * Ticket tra **trong phạm vi đọc** của người gọi (BAT-57, 19.12 câu 15): ticket
   * của dự án người gọi không được vào ra `NOT_FOUND` giống hệt id bịa. Trước
   * BAT-57 nó qua được tới `batBuocQuyen('assign')` và ra `FORBIDDEN` — một máy dò
   * "ticket này có thật không".
   */
  const ticket = await ticketBatBuoc(db, lenh.workspace_id, lenh.ticket_id, false, lenh.ai);

  const nhan_agent = await nguoiNhanBatBuoc(
    db,
    lenh.ai,
    lenh.workspace_id,
    ticket.project_id,
    lenh.nguoi_nhan_agent_id,
  );

  /*
   * "**Không giao cho chính mình**" — SPEC mục 5.
   *
   * Kiểm trước bảng quyền: đây là luật đúng với mọi vai trò, kể cả một agent được
   * chủ mở rộng ô "Giao việc". Chủ không bao giờ rơi vào ca này (người nhận luôn
   * là agent).
   */
  if (lenh.ai.loai === 'agent' && lenh.ai.agent_id === nhan_agent.id) {
    throw new BatonError('FORBIDDEN', { message: 'Không giao việc cho chính mình (SPEC mục 5).' });
  }

  // Hàng "Giao việc (tạo lượt giao)" của bảng quyền SPEC mục 3. Ô của `worker` và
  // `reviewer` là "—", nên luật "agent `worker` không tạo được lượt giao" đi qua
  // đúng một chỗ, không viết lại ở đây.
  batBuocQuyen(lenh.ai, 'assign', {
    project_id: ticket.project_id,
    ticket_id: ticket.id,
    vai_tro_nguoi_nhan: nhan_agent.vai_tro,
    nguoi_nhan_trong_du_an: true, // `nguoiNhanBatBuoc` vừa kiểm, nếu không đã ném
  });

  /*
   * "Lượt `review` do `manager` hoặc `coordinator` tạo" — SPEC 19.3.
   *
   * Bảng quyền mục 3 vốn chỉ cho hai vai trò đó giao việc, nên dòng này chỉ có
   * tác dụng khi **chủ đã mở ô "Giao việc"** cho một agent vai trò khác. Giữ lại
   * vì 19.3 là một luật riêng về *loại lượt*, không phải về *quyền giao việc*.
   */
  if (
    loai === 'review' &&
    lenh.ai.loai === 'agent' &&
    !(VAI_TRO_TAO_LUOT_REVIEW as readonly string[]).includes(lenh.ai.vai_tro)
  ) {
    throw new BatonError('FORBIDDEN', {
      message: 'Lượt review chỉ manager hoặc coordinator tạo được (SPEC 19.3).',
    });
  }

  // Giao việc **là** "nhận việc mới", nên dự án `paused` không nhận (SPEC mục 2),
  // `archived` thì chỉ đọc với mọi người (mục 2). Áp cho cả chủ: chữ "agent không
  // nhận việc mới" nói về người **nhận**, mà người nhận ở đây luôn là agent.
  const du_an = await duAnBatBuoc(db, lenh.workspace_id, ticket.project_id);
  batBuocKhongLuuTru(du_an);
  batBuocNhanViecMoi(du_an);

  /*
   * **Tối đa 1 lượt mở cho mỗi (ticket, loại)** — SPEC mục 5 dòng 157 + 19.1.
   *
   * Kiểm ở đây để trả đúng `ASSIGNMENT_OPEN` kèm thông điệp tiếng Việt; index
   * `ux_luot_giao_mo` của migration 0004 là hàng rào cuối ở tầng DB. Hai tầng,
   * vì đây là luật quan trọng nhất của mục 5.
   */
  const dang_mo = await db
    .prepare(
      `SELECT id FROM luot_giao
        WHERE ticket_id = ? AND loai = ? AND trang_thai IN ('pending', 'in_progress')
        LIMIT 1`,
    )
    .bind(ticket.id, loai)
    .first<{ id: string }>();
  if (dang_mo !== null) {
    throw new BatonError('ASSIGNMENT_OPEN', {
      message:
        loai === 'review'
          ? 'Ticket đã có một lượt review đang mở.'
          : 'Ticket đã có một lượt giao đang mở (SPEC mục 5).',
    });
  }

  /*
   * **Số lượt tăng dần trong phạm vi ticket, không tái dùng** — SPEC 19.5.
   *
   * Cùng bài học với `bo_dem` của mục 4: đọc số rồi ghi phải nằm **trong cùng
   * một lượt chạy của cửa ghi** (DO đơn luồng) và câu INSERT đi **cùng batch**,
   * nếu không hai lệnh song song cấp trùng số. `ux_luot_giao_so` chặn nốt.
   * Không dùng bảng `bo_dem`: `pham_vi` của nó có CHECK `('project','workspace')`
   * và sửa CHECK đó cần dựng lại bảng (`DROP` — danh sách cấm).
   */
  const max = await db
    .prepare('SELECT coalesce(max(so_luot), 0) AS n FROM luot_giao WHERE ticket_id = ?')
    .bind(ticket.id)
    .first<{ n: number }>();
  const so_luot = (max?.n ?? 0) + 1;

  // "Brief lấy từ **ticket** nếu có, cho sửa riêng cho **lượt này**" — SPEC mục 5.
  const brief: Record<string, string | null> = {};
  for (const t of TRUONG_BRIEF_LUOT) {
    brief[t] = brief_ghi_de[t] !== undefined ? (brief_ghi_de[t] ?? null) : ticket[t];
  }

  const id = crypto.randomUUID();
  const nguoi_giao = tacGiaCua(lenh.ai);
  const han_luc = hanPhanHoiLuc(bay_gio, han_phut);

  const cau_lenh: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO luot_giao
           (id, workspace_id, ticket_id, so_luot, loai,
            nguoi_giao_loai, nguoi_giao_agent_id, nguoi_nhan_agent_id, trang_thai,
            ${TRUONG_BRIEF_LUOT.join(', ')},
            han_phan_hoi_luc, tao_luc, cap_nhat_luc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ${TRUONG_BRIEF_LUOT.map(() => '?').join(', ')}, ?, ?, ?)`,
      )
      .bind(
        id,
        lenh.workspace_id,
        ticket.id,
        so_luot,
        loai,
        nguoi_giao.loai,
        nguoi_giao.agentId ?? null,
        nhan_agent.id,
        ...TRUONG_BRIEF_LUOT.map((t) => brief[t] ?? null),
        han_luc,
        bay_gio,
        bay_gio,
      ),
  ];

  // **Mọi hành động có dấu vết ai làm** — SPEC mục 4 (Lịch sử), mục 15.
  const lich_su: YeuCauGhiLichSu[] = [
    {
      ticket_id: ticket.id,
      truong: `luot_giao:${loai}`,
      gia_tri_cu: null,
      gia_tri_moi: nhan_agent.id,
    },
  ];

  /*
   * "Mở một lượt giao cho ticket ở nhóm `planned` thì ticket **tự sang Đang
   * làm**" — SPEC mục 4 dòng 134. Dùng đúng sự kiện `mo_luot_giao` của module
   * luật thuần, không viết lại điều kiện ở đây.
   */
  const kq = apDungLuat(
    { loai: 'mo_luot_giao' },
    {
      trang_thai: ticket.trang_thai,
      la_chu: lenh.ai.loai === 'chu',
      la_dieu_phoi: await laTicketDieuPhoi(db, ticket.id),
      con_chua_ket: await soConChuaKet(db, ticket.id),
      cong: await cong(ticket.id),
    },
  );

  if (kq.trang_thai !== ticket.trang_thai) {
    cau_lenh.push(
      db
        .prepare(
          `UPDATE ticket SET trang_thai = ?, cap_nhat_luc = ?,
                  bat_dau_luc = coalesce(bat_dau_luc, ?) WHERE id = ?`,
        )
        .bind(kq.trang_thai, bay_gio, bay_gio, ticket.id),
    );
    lich_su.push({
      ticket_id: ticket.id,
      truong: 'trang_thai',
      gia_tri_cu: ticket.trang_thai,
      gia_tri_moi: kq.trang_thai,
    });
  }

  /*
   * Mốc "không ai cầm" (SPEC 19.1): ticket vừa có người cầm (bậc 2 hoặc bậc 1),
   * nên mốc phải được **xoá**. Bối cảnh tra từ DB rồi thêm lượt sắp chèn vào —
   * lượt mới chưa có trong DB lúc này (batch chạy sau).
   */
  const boi_canh = await boiCanhNguoiCamCua(db, lenh.workspace_id, ticket.id);
  const nguoi_nhan = { loai: 'agent' as const, agentId: nhan_agent.id };
  if (loai === 'review') boi_canh.luot_review_mo = nguoi_nhan;
  else boi_canh.luot_worker_mo = nguoi_nhan;

  cau_lenh.push(...cauLenhNguoiCam(db, ticket, kq.trang_thai, bay_gio, boi_canh));

  /*
   * **Cờ "cần review lại"** — SPEC 19.3. Mở lượt giao là một đường đổi trạng thái
   * ticket (`planned → Đang làm`, mục 4 dòng 134), nên nó đi theo đúng bất biến của
   * `apCoReviewLai`: mọi đường đổi trạng thái tính lại cờ.
   *
   * **Không `dieu_chinh`** (lệnh này không chạm bảng `evidence`) ⇒ chỉ bật/tắt cờ,
   * không kéo ticket về Chờ kiểm chứng — **cùng cách** `handlerChuTuLam` cư xử trên
   * đúng chuyển trạng thái này. Hai đường `planned → Đang làm` không được khác nhau.
   *
   * Và như ở `handlerChuTuLam`: hôm nay đây là một **no-op chứng minh được** (cả hai
   * đầu của chuyển trạng thái đều ngoài nhóm `closed`, và tập bằng chứng không đổi).
   * Khai thẳng, giữ lời gọi vì bất biến phải đúng ở mọi đường — và nó **rẻ**: đường
   * thoát sớm của `coReviewLaiCua` chặn nó lại ở 2 lần đọc `LIMIT 1` với một ticket
   * không có review nào, thay vì đọc cả bảng `evidence` + `luot_giao`.
   *
   * `boi_canh_cam` ở đây là **mã chết hôm nay**, cùng lý do đã ghi ở
   * `handlerDoiTrangThai`: nhánh dùng tới nó cần `dieu_chinh`.
   */
  const co = await apCoReviewLai(db, lenh.workspace_id, ticket, kq.trang_thai, {
    bay_gio,
    cong,
    boi_canh_cam: boi_canh,
  });
  cau_lenh.push(...co.cau_lenh);
  lich_su.push(...co.lich_su);

  return {
    cau_lenh,
    lich_su,
    // Người nhận đang `baton tasks --wait` thì nhận việc ngay (SPEC mục 13).
    danh_thuc: [`luot:${nhan_agent.id}`, `ticket:${ticket.id}`, `ticket:${ticket.project_id}`],
    ket_qua: {
      id,
      ticket_id: ticket.id,
      so_luot,
      loai,
      trang_thai: 'pending',
      nguoi_nhan_agent_id: nhan_agent.id,
      han_phan_hoi_luc: han_luc,
      ticket_trang_thai: kq.trang_thai,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Nhận việc — SPEC mục 5 ("Nhận việc"), mục 13 (`baton claim`)
 * ------------------------------------------------------------------ */

export interface LenhNhanLuotGiao extends LenhChung {
  loai: 'nhan_luot_giao';
  luot_giao_id: string;
}

export interface KetQuaNhanLuotGiao {
  id: string;
  ticket_id: string;
  trang_thai: TrangThaiLuotGiao;
  nhan_luc: number;
  /** Lượt đã quá hạn phản hồi lúc nhận — SPEC mục 5 (**không** chặn nhận). */
  qua_han_phan_hoi: boolean;
  /** **Phiên vừa mở** — SPEC mục 6 d.180 ("phiên mở khi agent nhận một lượt giao"). */
  phien_id: string;
}

export async function handlerNhanLuotGiao(
  lenh: LenhNhanLuotGiao,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaNhanLuotGiao>> {
  if (typeof lenh.luot_giao_id !== 'string' || lenh.luot_giao_id.length === 0) {
    throw new BatonError('INVALID_INPUT', { message: 'Thiếu mã lượt giao.' });
  }

  /*
   * Tra **trong phạm vi đọc** của người gọi (`locPhamViLuot`, BAT-57; 19.12 câu
   * 15): lượt trên ticket ngoài dự án người gọi được vào ra đúng dòng `throw
   * NOT_FOUND` dưới đây, giống hệt id bịa. Trước BAT-57 nó ra `FORBIDDEN`.
   */
  const loc = locPhamViLuot(lenh.ai);
  const luot = await db
    .prepare(
      `SELECT id, ticket_id, trang_thai, nguoi_nhan_agent_id, han_phan_hoi_luc
         FROM luot_giao WHERE id = ? AND workspace_id = ?${loc.sql}`,
    )
    .bind(lenh.luot_giao_id, lenh.workspace_id, ...loc.bind)
    .first<{
      id: string;
      ticket_id: string;
      trang_thai: TrangThaiLuotGiao;
      nguoi_nhan_agent_id: string;
      han_phan_hoi_luc: number | null;
    }>();

  // Ngoài phạm vi hay không tồn tại đều `NOT_FOUND` — SPEC mục 13.
  if (luot === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy lượt giao.' });

  /*
   * "**Người nhận** gọi lệnh nhận" — SPEC mục 5. Không phải người nhận thì
   * `FORBIDDEN`, kể cả chủ và kể cả người giao: nhận việc là việc của người sẽ
   * làm, không ai nhận hộ được (cùng tinh thần với `baton reply` ở 19.12 câu 2,
   * nơi SPEC nói thẳng "chỉ người giao của lượt đó gọi được").
   */
  if (lenh.ai.loai !== 'agent' || lenh.ai.agent_id !== luot.nguoi_nhan_agent_id) {
    throw new BatonError('FORBIDDEN', {
      message: 'Chỉ người nhận của lượt giao này mới nhận được việc.',
    });
  }
  if (lenh.ai.disabled) throw new BatonError('FORBIDDEN', { message: 'Agent đã bị tắt.' });

  if (luot.trang_thai !== 'pending') {
    throw new BatonError('ASSIGNMENT_NOT_PENDING', {
      message: `Lượt giao đang ở trạng thái "${luot.trang_thai}", không nhận lại được.`,
    });
  }

  /*
   * **Không có phép so hạn nào ở đây.** SPEC mục 5: "Quá hạn phản hồi mà chưa
   * nhận thì lượt hiện 'Không phản hồi' ở Tổng quan (**lượt không tự huỷ**)".
   * Quá hạn chỉ là một giá trị hiển thị; nhận vẫn chạy bình thường.
   */
  const qua_han = luot.han_phan_hoi_luc !== null && bay_gio > luot.han_phan_hoi_luc;

  const ticket = await ticketBatBuoc(db, lenh.workspace_id, luot.ticket_id);
  batBuocKhongLuuTru(await duAnBatBuoc(db, lenh.workspace_id, ticket.project_id));

  const cau_lenh = [
    db
      .prepare(
        `UPDATE luot_giao SET trang_thai = 'in_progress', nhan_luc = ?, cap_nhat_luc = ?
          WHERE id = ?`,
      )
      .bind(bay_gio, bay_gio, luot.id),
  ];

  // Người đang cầm không đổi (vẫn là người nhận: `pending` và `in_progress` đều
  // là lượt **mở** — SPEC 19.1), nhưng mốc "không ai cầm" vẫn tính lại cho chắc:
  // hàm trả mảng rỗng khi không có gì đổi.
  const boi_canh = await boiCanhNguoiCamCua(db, lenh.workspace_id, ticket.id);
  cau_lenh.push(...cauLenhNguoiCam(db, ticket, ticket.trang_thai, bay_gio, boi_canh));

  /*
   * **Phiên mở ở đây** — SPEC mục 6 d.180: "Phiên mở khi agent **nhận một lượt
   * giao**". Cùng batch với `UPDATE luot_giao`: lượt `in_progress` mà không có
   * phiên là một agent "đang làm" mà không có đồng hồ ngưỡng đứng nào canh — tức
   * đúng trạng thái mục 6 sinh ra để loại bỏ.
   */
  const mo = cauLenhMoPhien(
    db,
    {
      workspace_id: lenh.workspace_id,
      luot_giao_id: luot.id,
      ticket_id: ticket.id,
      agent_id: lenh.ai.agent_id,
    },
    bay_gio,
  );
  cau_lenh.push(...mo.cau_lenh);

  return {
    cau_lenh,
    lich_su: [
      {
        ticket_id: ticket.id,
        truong: `luot_giao:${luot.id}`,
        gia_tri_cu: 'pending',
        gia_tri_moi: 'in_progress',
      },
    ],
    danh_thuc: [`luot:${lenh.ai.agent_id}`, `ticket:${ticket.id}`],
    // "Nhận" gắn đúng lượt này: tín hiệu chỉ cho phiên vừa mở (BAT-57), không
    // nhích phiên khác của agent.
    luot_tin_hieu: luot.id,
    ket_qua: {
      id: luot.id,
      ticket_id: ticket.id,
      trang_thai: 'in_progress',
      nhan_luc: bay_gio,
      qua_han_phan_hoi: qua_han,
      phien_id: mo.phien_id,
    },
  };
}
