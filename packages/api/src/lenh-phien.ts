/**
 * Lệnh ghi về **phiên** — SPEC mục 6 (+ 19.6), mục 13 (`baton heartbeat`),
 * mục 14 ("Chi tiết phiên: … nút **Dừng**").
 *
 * Hai lệnh mới:
 *   1. `heartbeat` — nhịp tim của agent; **trả về tín hiệu nếu có** (`STOP`).
 *   2. `dung_phien` — chủ bấm "Dừng"; phiên sang `stopping`.
 *
 * Cộng ba hàm dựng câu lệnh mà các handler của mục 5 gọi, để vòng đời phiên của
 * mục 6 d.180 ("mở khi agent nhận một lượt giao, đóng khi **nộp**, bị **huỷ**
 * hoặc bị **dừng**") nằm trọn một chỗ:
 *   * `cauLenhMoPhien`   ← `handlerNhanLuotGiao`
 *   * `cauLenhDongPhien` ← `handlerNopBaoCao`
 *   * `cauLenhDungPhien` ← `handlerHuyLuot` (19.6: huỷ = xử lý **như** bấm Dừng)
 *
 * **Không có máy trạng thái phiên thứ hai.** Mọi kết luận phụ thuộc thời gian
 * (`stalled`, phiên `stopping` tự đóng sau 10 phút, tín hiệu `STOP`) do hàm
 * thuần của `@baton/shared/phien` tính, `bay_gio` qua tham số.
 *
 * **Ai được gọi.** Bảng quyền SPEC mục 3 **không có hàng nào** cho nhịp tim hay
 * cho nút Dừng, và mục 6 nói theo **danh tính** ("agent", "chủ bấm Dừng"), không
 * theo vai trò. Nên hai lệnh này kiểm danh tính, **không mượn** hàng nào của bảng
 * quyền — cùng lý do đã ghi ở `cau-hoi-spec.md` #22 và #37 (mượn là âm thầm đổi
 * nghĩa hàng đó, và sẽ chặn đúng những vai trò cần dùng). Câu hỏi SPEC gửi
 * M-Baton lượt này.
 */

import {
  BatonError,
  HAN_XAC_NHAN_DUNG_MS,
  LY_DO_DONG_KHONG_XAC_NHAN_DUNG,
  LY_DO_DONG_NOP,
  LY_DO_DONG_VIEC_XONG,
  kiemChuTuyChon,
  tinHieuChoAgent,
  type TrangThaiPhien,
} from '@baton/shared';
import {
  danXuat,
  phienCuaLuot,
  phienTheoId,
  traLoiChuaTrao,
  type DongPhien,
} from './doc-phien.js';
import {
  batBuocLaChu,
  type BoiCanhLenh,
  type KetQuaHandler,
  type LenhChung,
} from './lenh-khung.js';

/* ================================================================== *
 * A. Vòng đời phiên — các câu lệnh mà handler của mục 5 gọi
 * ================================================================== */

/**
 * **Mở phiên** — SPEC mục 6 d.180: "Phiên mở khi agent **nhận một lượt giao**".
 *
 * Trạng thái đầu là `running`, và `tin_hieu_cuoi_luc = bay_gio`: chính lệnh nhận
 * là tín hiệu đầu tiên (d.188 — "mọi lệnh ghi của agent trên phiên đó"), nên
 * đồng hồ ngưỡng đứng bắt đầu đếm từ lúc nhận, không từ số 0.
 *
 * `ux_phien_mo_moi_luot` của 0006 là hàng rào cuối: một lượt không bao giờ có hai
 * phiên mở, tức không bao giờ có hai đồng hồ cho cùng một việc.
 */
export function cauLenhMoPhien(
  db: D1Database,
  nguon: {
    workspace_id: string;
    luot_giao_id: string;
    ticket_id: string;
    agent_id: string;
  },
  bay_gio: number,
): { cau_lenh: D1PreparedStatement[]; phien_id: string } {
  const phien_id = crypto.randomUUID();
  return {
    phien_id,
    cau_lenh: [
      db
        .prepare(
          `INSERT INTO phien
             (id, workspace_id, luot_giao_id, ticket_id, agent_id, trang_thai,
              tin_hieu_cuoi_luc, mo_luc, cap_nhat_luc)
           VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?)`,
        )
        .bind(
          phien_id,
          nguon.workspace_id,
          nguon.luot_giao_id,
          nguon.ticket_id,
          nguon.agent_id,
          bay_gio,
          bay_gio,
          bay_gio,
        ),
    ],
  };
}

/**
 * **Đóng phiên của một lượt** — SPEC mục 6 d.180 ("đóng khi **nộp**").
 *
 * `WHERE trang_thai <> 'closed'` nên gọi lại là không làm gì: phiên đóng là
 * vĩnh viễn (trigger `tg_phien_dong_la_vinh_vien` của 0006), và lệnh này phải
 * chạy được trong batch kể cả khi không có phiên nào (lượt giao được dựng trực
 * tiếp trong DB ở test, hoặc dữ liệu nhập của mục 16).
 */
export function cauLenhDongPhien(
  db: D1Database,
  workspace_id: string,
  luot_giao_id: string,
  bay_gio: number,
  ly_do: string = LY_DO_DONG_NOP,
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE phien
            SET trang_thai = 'closed', dong_luc = ?, ly_do_dong = ?, cap_nhat_luc = ?
          WHERE workspace_id = ? AND luot_giao_id = ? AND trang_thai <> 'closed'`,
      )
      .bind(bay_gio, ly_do, bay_gio, workspace_id, luot_giao_id),
  ];
}

/**
 * **Đưa phiên của một lượt sang `stopping`** — SPEC 19.6: "**Huỷ lượt** có phiên
 * đang chạy: phiên sang `stopping`, xử lý **như bấm Dừng** (mục 6)".
 *
 * Nên huỷ lượt **không** đóng thẳng phiên: agent còn phải nhận `STOP` ở lần gọi
 * kế tiếp và gửi một mục `result` hoặc `error` (d.193). Đóng thẳng là cắt mất
 * đúng nửa luật đó, và agent sẽ không bao giờ biết mình phải ngưng.
 *
 * `WHERE trang_thai NOT IN ('closed', 'stopping')`: phiên đã `stopping` thì giữ
 * **mốc `stopping_luc` cũ** — nếu không, mỗi lần đụng lại là đồng hồ 10 phút của
 * d.194 bị đẩy về đầu và phiên không bao giờ tự đóng.
 */
export function cauLenhDungPhien(
  db: D1Database,
  workspace_id: string,
  luot_giao_id: string,
  bay_gio: number,
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE phien
            SET trang_thai = 'stopping', stopping_luc = ?, cap_nhat_luc = ?
          WHERE workspace_id = ? AND luot_giao_id = ?
            AND trang_thai NOT IN ('closed', 'stopping')`,
      )
      .bind(bay_gio, bay_gio, workspace_id, luot_giao_id),
  ];
}

/**
 * **Đóng mọi phiên còn mở của MỘT TICKET** — SPEC mục 6 d.181, nửa thứ hai:
 * "phiên đóng … khi **ticket của lượt đó sang Chờ kiểm chứng hoặc Xong** — kể cả
 * khi phiên đang `stalled` hoặc `error`. Lý do đóng ghi vào lịch sử phiên."
 *
 * Theo **ticket**, không theo lượt giao: một ticket có thể còn phiên của một lượt
 * cũ (agent chết giữa chừng, lượt bị huỷ nhưng agent không xác nhận `STOP`), và
 * đúng những phiên ấy là thứ d.181 nói tới — chúng là các "phiên đứng" mà chủ thấy
 * ở "Cần chú ý" cho một việc đã xong.
 *
 * `WHERE trang_thai <> 'closed'` nên gọi lại là không làm gì (trigger
 * `tg_phien_dong_la_vinh_vien` của 0006), và nó chạy được trong batch kể cả khi
 * ticket không có phiên nào.
 */
export function cauLenhDongPhienTheoTicket(
  db: D1Database,
  workspace_id: string,
  ticket_id: string,
  bay_gio: number,
  ly_do: string = LY_DO_DONG_VIEC_XONG,
  /** `true` = giữ phiên của lượt `review` (ticket sang Chờ kiểm chứng: reviewer mới là người làm tiếp). */
  tru_luot_review: boolean = false,
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE phien
            SET trang_thai = 'closed', dong_luc = ?, ly_do_dong = ?, cap_nhat_luc = ?
          WHERE workspace_id = ? AND ticket_id = ? AND trang_thai <> 'closed'
            ${
              tru_luot_review
                ? "AND luot_giao_id NOT IN (SELECT id FROM luot_giao WHERE ticket_id = phien.ticket_id AND loai = 'review')"
                : ''
            }`,
      )
      .bind(bay_gio, ly_do, bay_gio, workspace_id, ticket_id),
  ];
}

/* ================================================================== *
 * B. Phiên đã đóng thì mọi lệnh ghi bị từ chối — SPEC mục 6 d.195
 * ================================================================== */

/**
 * Dẫn xuất trạng thái phiên, và **ghi lại** nếu dẫn xuất đã đổi nó.
 *
 * Một phiên `stopping` quá 10 phút là `closed` **về mặt luật** (d.194) nhưng DB
 * chưa biết — không có cron nào ghi. Mọi lệnh ghi đi qua phiên vì vậy phải: (1)
 * dẫn xuất, (2) nếu dẫn xuất nói đã đóng thì **ghi** cái đóng đó vào cùng batch,
 * rồi (3) từ chối `SESSION_CLOSED`. Thứ tự đó là lý do `KetQuaHandler` có
 * `loi_sau_ghi`: ghi xong rồi mới báo lỗi, nếu không nửa luật "phiên tự đóng"
 * không bao giờ xảy ra.
 */
export interface PhienSauDanXuat {
  phien: DongPhien;
  trang_thai: TrangThaiPhien;
  /** Câu lệnh cần thêm vào batch để DB khớp với dẫn xuất. */
  cau_lenh: D1PreparedStatement[];
}

export function danXuatVaGhiLai(
  db: D1Database,
  workspace_id: string,
  phien: DongPhien,
  bay_gio: number,
): PhienSauDanXuat {
  const dx = danXuat(phien, bay_gio);
  const cau_lenh: D1PreparedStatement[] = [];

  if (dx.can_ghi_lai && dx.trang_thai === 'closed') {
    cau_lenh.push(
      ...cauLenhDongPhien(
        db,
        workspace_id,
        phien.luot_giao_id,
        bay_gio,
        dx.ly_do_dong ?? LY_DO_DONG_KHONG_XAC_NHAN_DUNG,
      ),
    );
  }

  return { phien, trang_thai: dx.trang_thai, cau_lenh };
}

/**
 * **Luật d.195 cho một lệnh ghi gắn lượt giao**: phiên đã đóng → từ chối
 * `SESSION_CLOSED`.
 *
 * Trả `null` nghĩa là "cứ chạy tiếp". Hai ca trả `null`:
 *   * Phiên còn mở.
 *   * **Lượt chưa có phiên nào.** Không phải mọi lượt đều có phiên: lượt
 *     `pending` chưa được nhận thì chưa có phiên (mục 6 d.180), và dữ liệu nhập
 *     của mục 16 cũng không sinh phiên. "Không có phiên" **không** phải "phiên đã
 *     đóng" — d.195 nói về một phiên đã đóng, không về việc thiếu phiên.
 *
 * Trả về `cau_lenh` cộng `loi`: ca "phiên `stopping` quá 10 phút" phải **ghi**
 * cái đóng của d.194 trước khi từ chối, nên người gọi đặt `loi` vào
 * `loi_sau_ghi`, không ném.
 */
export async function chanNeuPhienDaDong(
  db: D1Database,
  workspace_id: string,
  luot_giao_id: string,
  bay_gio: number,
): Promise<{ cau_lenh: D1PreparedStatement[]; loi: { ma: 'SESSION_CLOSED'; message: string } } | null> {
  const phien = await phienCuaLuot(db, workspace_id, luot_giao_id);
  if (phien === null) return null;

  const sau = danXuatVaGhiLai(db, workspace_id, phien, bay_gio);
  if (sau.trang_thai !== 'closed') return null;

  return {
    cau_lenh: sau.cau_lenh,
    loi: loiPhienDaDong(phien.ly_do_dong ?? LY_DO_DONG_KHONG_XAC_NHAN_DUNG),
  };
}

/** Thông điệp tiếng Việt của `SESSION_CLOSED` — SPEC mục 6 d.195, mục 13. */
export function loiPhienDaDong(ly_do: string | null): { ma: 'SESSION_CLOSED'; message: string } {
  return {
    ma: 'SESSION_CLOSED',
    message:
      ly_do === null
        ? 'Phiên đã đóng, không ghi thêm được (SPEC mục 6).'
        : `Phiên đã đóng (${ly_do}), không ghi thêm được.`,
  };
}

/* ================================================================== *
 * C. `heartbeat` — SPEC mục 13 (`baton heartbeat [ghi chú]`), mục 6 d.193
 * ================================================================== */

export interface LenhHeartbeat extends LenhChung {
  loai: 'heartbeat';
  /** Nhịp tim gắn một lượt giao: phiên là phiên của lượt đó (mục 6 d.180). */
  luot_giao_id: string;
  /** `baton heartbeat [ghi chú]` — tuỳ chọn. */
  ghi_chu?: string | null;
}

export interface KetQuaHeartbeat {
  phien_id: string;
  luot_giao_id: string;
  ticket_id: string;
  /** Trạng thái phiên **sau** dẫn xuất và sau nhịp tim này. */
  trang_thai: TrangThaiPhien;
  tin_hieu_luc: number;
  /**
   * "**trả về tín hiệu nếu có** (`STOP`, kết quả Cần Chủ mới)" — SPEC mục 13.
   * `STOP` khi phiên đang `stopping` (mục 6 d.193); CLI thoát **mã 3** (mục 13).
   */
  tin_hieu: 'STOP'[];
  /**
   * **CHỖ CẮM CỦA PHẦN 4** — "kết quả Cần Chủ mới" của mục 13, trường
   * `resolved_asks` của mục 8 d.267 ("Agent không đang chờ thì nhận kết quả ở lần
   * gọi kế tiếp — `heartbeat`, `tasks` hay bất kỳ lệnh nào, trong trường
   * `resolved_asks`").
   *
   * Luôn rỗng ở lượt này: bảng `can_chu` là phần 4. Để **đúng một chỗ** có tên
   * đúng theo SPEC (thay vì không có trường nào) vì đây là hợp đồng API mà CLI và
   * MCP đọc — thêm trường về sau là đổi hợp đồng; thêm giá trị vào một trường đã
   * có thì không. Cùng khuôn với `phamViLuotGiao` của phần 1.
   */
  resolved_asks: never[];
  /**
   * **Câu trả lời của người giao** — 19.6: "Có câu trả lời thì phiên về `running`,
   * và **lần gọi kế tiếp của agent nhận được câu trả lời**." 19.12 câu 2 là chốt
   * của chủ cho lệnh `baton reply`.
   *
   * Khác `resolved_asks` (kết quả **Cần Chủ**, phần 4): đây là trả lời của **người
   * giao**, không của chủ-qua-mục-T. Trao rồi thì mốc `tra_loi_doc_luc` của phiên
   * nhích, nên lần gọi sau không trao lại — "lần gọi **kế tiếp**", một lần.
   */
  tra_loi_moi: {
    id: string;
    tra_loi_cho_id: string | null;
    noi_dung: string;
    tac_gia_loai: string;
    tac_gia_agent_id: string | null;
    gui_luc: number;
  }[];
}

/**
 * `baton heartbeat` — SPEC mục 13: "Nhịp tim; trả về tín hiệu nếu có".
 *
 * **Bản thân nhịp tim là một tín hiệu** (mục 6 d.188 kể tên nó đầu tiên), nhưng
 * handler này **không** tự nhích `tin_hieu_cuoi_luc`: cửa ghi làm việc đó cho
 * **mọi** lệnh ghi của agent, trong cùng batch (xem `workspace-gate.ts`). Nhịp
 * tim không phải một ca riêng — nó chỉ là lệnh ghi rẻ nhất. Handler chỉ **khai**
 * `luot_tin_hieu` để cửa ghi nhích đúng phiên của lượt này, không phiên khác của
 * agent (BAT-57).
 *
 * Việc duy nhất handler này tự ghi là `ghi_chu_cuoi`.
 */
export async function handlerHeartbeat(
  lenh: LenhHeartbeat,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaHeartbeat>> {
  const ghi_chu = kiemChuTuyChon(lenh.ghi_chu, 'Ghi chú nhịp tim', 2000);

  if (typeof lenh.luot_giao_id !== 'string' || lenh.luot_giao_id.length === 0) {
    throw new BatonError('INVALID_INPUT', { message: 'Thiếu mã lượt giao.' });
  }

  /*
   * Ngoài phạm vi hay không tồn tại đều `NOT_FOUND` — SPEC mục 13, 19.12 câu 15.
   * Tra **trong phạm vi đọc** của người gọi (`lenh.ai`, BAT-57): trước đó câu tra
   * cả workspace rồi mới kiểm danh tính, nên lượt thật của dự án khác ra 403 còn
   * lượt bịa ra 404. Giờ cả hai đi qua đúng dòng `throw` dưới đây. Người gọi
   * **thấy** được lượt (cùng dự án) mà không phải agent của phiên — kể cả chủ —
   * vẫn `FORBIDDEN` ở dưới (câu 44).
   */
  // `'ghi'`: agent của phiên bị gỡ khỏi dự án vẫn nhịp tim được lượt của mình
  // (sửa theo reviewer BAT-57; 19.12 câu 44 — kiểm theo danh tính).
  const phien = await phienCuaLuot(db, lenh.workspace_id, lenh.luot_giao_id, lenh.ai, 'ghi');
  if (phien === null) {
    throw new BatonError('NOT_FOUND', { message: 'Lượt giao này chưa có phiên nào.' });
  }

  /*
   * "Nhịp tim" là **lời khai của agent rằng nó đang chạy** (mục 6 d.178: "biết
   * agent **có thật đang chạy**"), nên chỉ **chính agent của phiên** gửi được —
   * kể cả chủ cũng không, đúng cùng lý do đã chốt cho lệnh "nhận"
   * (`cau-hoi-spec.md` #31). Chủ gửi hộ là tạo ra một nhịp tim giả, tức làm hỏng
   * đúng thứ mục 6 sinh ra để bảo đảm.
   */
  if (lenh.ai.loai !== 'agent' || lenh.ai.agent_id !== phien.agent_id) {
    throw new BatonError('FORBIDDEN', {
      message: 'Chỉ agent của phiên này mới gửi được nhịp tim.',
    });
  }
  if (lenh.ai.disabled) throw new BatonError('FORBIDDEN', { message: 'Agent đã bị tắt.' });

  const sau = danXuatVaGhiLai(db, lenh.workspace_id, phien, bay_gio);

  /*
   * "**Lần gọi kế tiếp** của agent nhận được câu trả lời" — 19.6. Lấy các câu trả
   * lời gửi sau mốc `tra_loi_doc_luc`, rồi nhích mốc trong **cùng batch**: trao và
   * ghi "đã trao" không bao giờ lệch nhau.
   */
  const tra_loi = await traLoiChuaTrao(db, lenh.workspace_id, phien);

  const ket_qua: KetQuaHeartbeat = {
    phien_id: phien.id,
    luot_giao_id: phien.luot_giao_id,
    ticket_id: phien.ticket_id,
    trang_thai: sau.trang_thai,
    tin_hieu_luc: bay_gio,
    tin_hieu: tinHieuChoAgent(sau.trang_thai),
    resolved_asks: [],
    tra_loi_moi: tra_loi.map((t) => ({
      id: t.id,
      tra_loi_cho_id: t.tra_loi_cho_id,
      noi_dung: t.noi_dung,
      tac_gia_loai: t.tac_gia_loai,
      tac_gia_agent_id: t.tac_gia_agent_id,
      gui_luc: t.gui_luc,
    })),
  };

  /*
   * "**Mọi lệnh ghi sau khi phiên đóng bị từ chối** (`SESSION_CLOSED`)" — mục 6
   * d.195. Lỗi đi qua `loi_sau_ghi` (sau `batch()`) vì ca "phiên `stopping` quá
   * 10 phút" phải **ghi** cái đóng của d.194 rồi mới từ chối; ném lỗi ở đây thì
   * batch không chạy và phiên treo ở `stopping` mãi mãi.
   */
  if (sau.trang_thai === 'closed') {
    return {
      cau_lenh: sau.cau_lenh,
      loi_sau_ghi: loiPhienDaDong(phien.ly_do_dong ?? LY_DO_DONG_KHONG_XAC_NHAN_DUNG),
      // Gắn lượt cả khi bị từ chối: không rơi về nhánh "lệnh chung" (BAT-57).
      luot_tin_hieu: phien.luot_giao_id,
      ket_qua,
    };
  }

  const cau_lenh = [...sau.cau_lenh];

  if (tra_loi.length > 0) {
    const moc = Math.max(...tra_loi.map((t) => t.gui_luc));
    cau_lenh.push(
      db
        .prepare(
          `UPDATE phien SET tra_loi_doc_luc = max(coalesce(tra_loi_doc_luc, 0), ?)
            WHERE id = ? AND workspace_id = ? AND trang_thai <> 'closed'`,
        )
        .bind(moc, phien.id, lenh.workspace_id),
    );
  }

  if (ghi_chu !== null) {
    cau_lenh.push(
      db
        .prepare('UPDATE phien SET ghi_chu_cuoi = ?, cap_nhat_luc = ? WHERE id = ? AND workspace_id = ?')
        .bind(ghi_chu, bay_gio, phien.id, lenh.workspace_id),
    );
  }

  return {
    cau_lenh,
    // Chủ đang xem trang phiên (mục 14) thấy nhịp tim trong ≤ 3 giây (mục 14 d.409).
    danh_thuc: [`phien:${phien.id}`, `ticket:${phien.ticket_id}`],
    // Nhịp tim gắn **một** lượt: cửa ghi chỉ nhích phiên của lượt này (BAT-57).
    luot_tin_hieu: phien.luot_giao_id,
    ket_qua,
  };
}

/* ================================================================== *
 * D. `dung_phien` — chủ bấm "Dừng" (SPEC mục 6 d.192–193, mục 14 d.400)
 * ================================================================== */

export interface LenhDungPhien extends LenhChung {
  loai: 'dung_phien';
  phien_id: string;
}

export interface KetQuaDungPhien {
  id: string;
  luot_giao_id: string;
  trang_thai: TrangThaiPhien;
  stopping_luc: number;
  /** Mốc phiên **tự đóng** nếu agent không xác nhận — mục 6 d.194 (10 phút). */
  tu_dong_luc: number;
}

/**
 * "**Chủ bấm *Dừng*** thì phiên sang `stopping`. Lần gọi kế tiếp của agent nhận
 * về tín hiệu `STOP`; agent phải ngưng việc và gửi một mục `result` hoặc `error`."
 * — SPEC mục 6 d.193. Nút nằm ở "Chi tiết phiên" (mục 14 d.400).
 *
 * **Chỉ chủ.** SPEC nói "chủ bấm Dừng" ở cả hai chỗ, và không có hàng nào trong
 * bảng quyền mục 3 cho việc này. Agent người giao muốn ngưng việc thì **huỷ
 * lượt** (mục 5), và 19.6 nói huỷ lượt đưa phiên sang `stopping` — tức SPEC đã
 * có đường riêng cho agent, nên nới lệnh này cho agent là tạo đường thứ hai làm
 * cùng một việc mà bỏ qua trạng thái của lượt.
 */
export async function handlerDungPhien(
  lenh: LenhDungPhien,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaDungPhien>> {
  batBuocLaChu(lenh.ai, 'bấm Dừng một phiên (SPEC mục 6)');

  if (typeof lenh.phien_id !== 'string' || lenh.phien_id.length === 0) {
    throw new BatonError('INVALID_INPUT', { message: 'Thiếu mã phiên.' });
  }

  const phien = await phienTheoId(db, lenh.workspace_id, lenh.phien_id);
  if (phien === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy phiên.' });

  const sau = danXuatVaGhiLai(db, lenh.workspace_id, phien, bay_gio);

  // Phiên đã đóng (kể cả vừa đóng do dẫn xuất) thì không còn gì để dừng.
  if (sau.trang_thai === 'closed') {
    const loi = loiPhienDaDong(phien.ly_do_dong ?? LY_DO_DONG_KHONG_XAC_NHAN_DUNG);
    return {
      cau_lenh: sau.cau_lenh,
      loi_sau_ghi: loi,
      ket_qua: {
        id: phien.id,
        luot_giao_id: phien.luot_giao_id,
        trang_thai: 'closed',
        stopping_luc: phien.stopping_luc ?? bay_gio,
        tu_dong_luc: bay_gio,
      },
    };
  }

  const cau_lenh = [
    ...sau.cau_lenh,
    ...cauLenhDungPhien(db, lenh.workspace_id, phien.luot_giao_id, bay_gio),
  ];

  // Phiên đã `stopping` rồi thì mốc cũ được giữ (xem `cauLenhDungPhien`).
  const stopping_luc = phien.stopping_luc ?? bay_gio;

  return {
    cau_lenh,
    // Agent đang treo trên một lệnh chờ dài phải nhận `STOP` ngay, không phải chờ
    // hết 60 giây (SPEC mục 13 "có tín hiệu mới thì trả về ngay").
    danh_thuc: [`luot:${phien.agent_id}`, `phien:${phien.id}`, `ticket:${phien.ticket_id}`],
    ket_qua: {
      id: phien.id,
      luot_giao_id: phien.luot_giao_id,
      trang_thai: 'stopping',
      stopping_luc,
      tu_dong_luc: stopping_luc + HAN_XAC_NHAN_DUNG_MS,
    },
  };
}
