/**
 * **Phiên và nhịp tim** — luật thuần của SPEC mục 6 (+ 19.6, mục 3 "trạng thái
 * agent", mục 0.1 bảng mã máy).
 *
 * Cùng kỷ luật với `luat-trang-thai.ts`, `nguoi-cam.ts`, `luot-giao.ts`: không
 * I/O, không `Date.now()`. Mọi hàm phụ thuộc thời gian nhận `bay_gio` **qua tham
 * số** (`quyet-dinh.md` 01/10).
 *
 * **Một máy trạng thái duy nhất.** Handler không được viết `if` trạng thái phiên
 * ở chỗ khác: luật nằm trọn ở đây, handler chỉ gọi.
 *
 * -------------------------------------------------------------------------
 * **Bảy trạng thái, không phải sáu.** Mục 6 dòng 181–187 chỉ liệt kê 6
 * (`running` · `waiting_owner` · `stalled` · `error` · `stopping` · `closed`) —
 * **thiếu `waiting_assigner`**. Nhưng bảng mã máy mục **0.1** có đủ 7, và 19.6
 * dùng `waiting_assigner` như một trạng thái thật ("agent gửi hoạt động
 * `question` thì phiên sang `waiting_assigner`").
 *
 * Theo **0.1**: nó là bảng mã máy **duy nhất** của SPEC và nói rõ áp cho "API,
 * CLI, MCP, **cơ sở dữ liệu** và log". Đây đúng cùng hình huống với
 * `cau-hoi-spec.md` #29 (0.1 `work` thắng văn xuôi 19.1 `worker`): bảng mã thắng
 * văn xuôi. Đề nghị phiên spec bổ sung `waiting_assigner` vào danh sách ở mục 6.
 * -------------------------------------------------------------------------
 */

import { BatonError } from './loi.js';
import {
  TRANG_THAI_BUOC_MAC_DINH,
  laMaHopLe,
  type LoaiHoatDong,
  type TrangThaiAgent,
  type TrangThaiBuoc,
  type TrangThaiPhien,
} from './ma-nhan.js';

/* ================================================================== *
 * 1. Ngưỡng đứng — SPEC mục 6 dòng 189
 * ================================================================== */

/** "**mặc định 30 phút**" — SPEC mục 6. */
export const NGUONG_DUNG_MAC_DINH_PHUT = 30;

/** "chỉnh theo dự án hoặc theo agent (**5–1440 phút**)" — SPEC mục 6. */
export const NGUONG_DUNG_TOI_THIEU_PHUT = 5;
export const NGUONG_DUNG_TOI_DA_PHUT = 1440;

/**
 * Ngưỡng đứng của một dự án hoặc một agent.
 * `null` = **không đặt riêng**, dùng ngưỡng của bậc rộng hơn (xem `nguongDungPhut`).
 */
export function kiemNguongDungPhut(phut: unknown): number | null {
  if (phut === undefined || phut === null) return null;
  if (typeof phut !== 'number' || !Number.isInteger(phut)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Ngưỡng đứng phải là số phút nguyên.',
    });
  }
  if (phut < NGUONG_DUNG_TOI_THIEU_PHUT || phut > NGUONG_DUNG_TOI_DA_PHUT) {
    throw new BatonError('INVALID_INPUT', {
      message: `Ngưỡng đứng phải trong khoảng ${String(NGUONG_DUNG_TOI_THIEU_PHUT)}–${String(NGUONG_DUNG_TOI_DA_PHUT)} phút (SPEC mục 6).`,
    });
  }
  return phut;
}

/**
 * Ngưỡng đứng áp cho một phiên — SPEC mục 6: "mặc định 30 phút; chỉnh **theo dự
 * án** hoặc **theo agent** (5–1440 phút)".
 *
 * **SPEC không nói bậc nào thắng khi cả hai được đặt** (xem `cau-hoi-spec.md`,
 * câu gửi M-Baton lượt này). Chốt tạm: **agent thắng dự án**, vì agent là bậc
 * **cụ thể hơn** — chủ đặt riêng cho một agent là để nói về chính agent đó, còn
 * ngưỡng của dự án là một mặc định cho mọi agent chạy trong dự án. Thứ tự:
 *
 *   agent → dự án → 30 phút
 *
 * Luật nằm đúng **một** hàm, nên đảo thứ tự nếu phiên spec chốt khác là sửa một
 * dòng.
 */
export function nguongDungPhut(nguon: {
  agent?: number | null | undefined;
  du_an?: number | null | undefined;
}): number {
  return nguon.agent ?? nguon.du_an ?? NGUONG_DUNG_MAC_DINH_PHUT;
}

export function nguongDungMs(nguon: {
  agent?: number | null | undefined;
  du_an?: number | null | undefined;
}): number {
  return nguongDungPhut(nguon) * 60_000;
}

/* ================================================================== *
 * 2. Các mốc thời gian khác của mục 6 / 19.6
 * ================================================================== */

/**
 * "Sau **10 phút** không xác nhận, phiên **tự đóng** với lý do *agent không xác
 * nhận dừng*" — SPEC mục 6 dòng 194.
 */
export const HAN_XAC_NHAN_DUNG_MS = 10 * 60_000;

/** Lý do đóng, đúng chữ SPEC mục 6 dòng 194. */
export const LY_DO_DONG_KHONG_XAC_NHAN_DUNG = 'agent không xác nhận dừng';

/** Lý do đóng khi người nhận nộp báo cáo — SPEC mục 6 dòng 180 ("đóng khi nộp"). */
export const LY_DO_DONG_NOP = 'đã nộp báo cáo';

/**
 * "`waiting_assigner` … không bị tính đứng, nhưng **quá 60 phút** thì hiện ở
 * *Cần chú ý*" — SPEC 19.6.
 */
export const HAN_CHO_NGUOI_GIAO_CAN_CHU_Y_MS = 60 * 60_000;

/** Lý do đóng khi agent xác nhận `STOP` bằng một mục `result`/`error` — d.193. */
export const LY_DO_DONG_DA_XAC_NHAN_DUNG = 'agent đã xác nhận dừng';

/**
 * **Lý do đóng khi việc đã xong** — SPEC mục 6 d.181, đúng chữ trong ngoặc kép
 * của dòng ấy: "Lý do đóng ghi vào lịch sử phiên (**"việc đã xong"**)".
 *
 * Dùng cho nửa thứ hai của d.181: ticket của lượt đó sang **Chờ kiểm chứng** hoặc
 * **Xong** — kể cả khi phiên đang `stalled` hoặc `error`. Khác
 * `LY_DO_DONG_NOP` (nửa thứ nhất: chính lượt ấy nộp báo cáo), vì hai nửa có hai
 * nguyên nhân khác nhau và lịch sử phiên phải nói ra nguyên nhân thật.
 */
export const LY_DO_DONG_VIEC_XONG = 'việc đã xong';

/**
 * **Hai trạng thái ticket đóng phiên** — SPEC mục 6 d.181 ("sang Chờ kiểm chứng
 * hoặc Xong"). Mã máy của bảng 0.1, một mảng cho cả hệ: đường ghi
 * (`lenh-trang-thai.ts`) dùng danh sách này, và chỉ đóng lúc ticket SANG một trong
 * hai trạng thái. Đường đọc (`doc-phien.ts`) cố ý KHÔNG lọc theo nó: lượt `review`
 * vẫn sống trên ticket `verifying`.
 */
export const TRANG_THAI_TICKET_DONG_PHIEN: readonly string[] = ['verifying', 'done'];

/* ================================================================== *
 * 3. Phiên "mở" và phiên "đóng"
 * ================================================================== */

/**
 * Phiên **đóng** chỉ có đúng một mã: `closed` (SPEC mục 0.1, mục 6 dòng 187).
 * Mọi mã khác là phiên còn sống — kể cả `stopping` (đang chờ agent xác nhận) và
 * `error` (agent báo lỗi nhưng chưa đóng phiên).
 */
export function laPhienMo(trang_thai: TrangThaiPhien): boolean {
  return trang_thai !== 'closed';
}

/* ================================================================== *
 * 4. Dẫn xuất trạng thái phiên — SPEC mục 6 dòng 182–195, 19.6
 * ================================================================== */

/** Một phiên, đúng những gì luật của mục 6 cần. Trạng thái **đã ghi trong DB**. */
export interface PhienLuu {
  trang_thai: TrangThaiPhien;
  /** Tín hiệu cuối = lệnh ghi gần nhất của agent trên phiên này (mục 6 d.188). */
  tin_hieu_cuoi_luc: number;
  /** Lúc chủ bấm "Dừng" (phiên vào `stopping`) — mục 6 d.193. */
  stopping_luc: number | null;
  /**
   * Lúc agent gửi hoạt động `question` (phiên vào `waiting_assigner`) — 19.6.
   *
   * **Mốc riêng, không dùng `tin_hieu_cuoi_luc`.** Đồng hồ 60 phút của 19.6 đếm
   * từ **lúc hỏi**, không từ tín hiệu cuối: agent đang chờ trả lời vẫn gửi nhịp
   * tim (nó đang sống, chỉ là bị chặn), và nhịp tim là một tín hiệu (d.188). Đếm
   * theo `tin_hieu_cuoi_luc` thì mỗi nhịp tim đẩy đồng hồ về đầu, nên luật "quá
   * 60 phút thì hiện ở Cần chú ý" **không bao giờ chạy** đúng trong ca duy nhất
   * nó cần chạy. Lỗi này do reviewer lượt 3 nêu (`cau-hoi-spec.md` #48).
   *
   * `null` chỉ còn ở dòng cũ dựng trước migration 0007; khi đó rơi về
   * `tin_hieu_cuoi_luc` để cờ vẫn có một mốc để đếm.
   */
  waiting_assigner_luc?: number | null;
  /**
   * "Đã bắn cảnh báo cho tín hiệu nào" — SPEC mục 6 d.196, `cau-hoi-spec.md` #46.
   * Xem `canhBaoDung` bên dưới.
   */
  canh_bao_tin_hieu_luc?: number | null;
  /**
   * **Lúc phiên chuyển sang `error`** — SPEC mục 6 d.196, migration 0008.
   *
   * Mốc riêng vì `error` là trạng thái **ghi trong DB**: một tín hiệu mới (nhịp
   * tim, mục `thought`) **không** đưa phiên ra khỏi `error`, nên mốc chống bắn
   * lặp của `error` không được gắn `tin_hieu_cuoi_luc` — xem `canhBaoDung`.
   *
   * `null` = chưa bao giờ vào `error` (hoặc dòng cũ trước 0008).
   */
  error_luc?: number | null;
}

export interface TrangThaiPhienDanXuat {
  /** Trạng thái **thật** của phiên lúc `bay_gio`, sau khi áp hai đồng hồ. */
  trang_thai: TrangThaiPhien;
  /** Trạng thái ghi trong DB, trước khi dẫn xuất. */
  trang_thai_luu: TrangThaiPhien;
  /** `true` khi dẫn xuất đổi trạng thái — cần ghi lại vào DB nếu đi qua cửa ghi. */
  can_ghi_lai: boolean;
  /** `closed` do hết 10 phút không xác nhận dừng (mục 6 d.194). */
  dong_vi_khong_xac_nhan_dung: boolean;
  /** Lý do đóng, khi `trang_thai === 'closed'` do dẫn xuất. */
  ly_do_dong: string | null;
  /** `waiting_assigner` quá 60 phút → hiện ở "Cần chú ý" (19.6). */
  cho_nguoi_giao_qua_han: boolean;
  /** Số ms kể từ tín hiệu cuối (Tổng quan mục 11 ý 3). */
  im_lang_ms: number;
  /** Số ms kể từ lúc gửi `question`; `null` khi phiên không `waiting_assigner`. */
  cho_nguoi_giao_ms: number | null;
}

/**
 * **Trạng thái phiên lúc `bay_gio`.**
 *
 * Hai luật của mục 6 là **đồng hồ**, không phải sự kiện — không ai gửi lệnh nào
 * lúc chúng xảy ra:
 *
 *   1. `stalled` = "**quá ngưỡng** không có tín hiệu" (d.184).
 *   2. Phiên `stopping` **tự đóng** sau 10 phút không xác nhận (d.194).
 *
 * Cả hai **dẫn xuất ở đường đọc** từ `tin_hieu_cuoi_luc` / `stopping_luc`, không
 * có cron nào ghi `stalled` vào DB. Lý do: một bộ đếm nền ghi trạng thái định kỳ
 * thì trạng thái đúng chỉ *sau* lần chạy gần nhất, nên "agent im 30 phút" của
 * nghiệm thu 17.3 phụ thuộc vào nhịp cron chứ không vào ngưỡng của SPEC. Dẫn xuất
 * thì câu trả lời đúng ở **mọi** thời điểm được hỏi.
 *
 * **Ai KHÔNG bị tính đứng** (19.6 + đọc chặt d.182/184):
 *   * `waiting_owner` — "**không bao giờ** bị tính đứng" (SPEC nói thẳng).
 *   * `waiting_assigner` — "Trạng thái này không bị tính đứng" (19.6).
 *   * `stopping`, `error`, `closed`, và chính `stalled` — chỉ `running` dẫn xuất
 *     được sang `stalled`. Căn cứ: d.182 và d.184 là **hai mặt của một luật**
 *     (`running` = "có tín hiệu trong ngưỡng", `stalled` = "quá ngưỡng không có
 *     tín hiệu"), nên ngưỡng đứng là cách phân đôi riêng trạng thái `running`.
 *     Nếu không thì `stalled` sẽ ăn mất `error` (agent báo lỗi rồi im là chuyện
 *     thường) và che mất thông tin cụ thể hơn mà chủ cần — mục 11 ý 4 xếp "phiên
 *     **đứng hoặc lỗi**" cạnh nhau chứ không gộp. Phần SPEC không viết ra; câu
 *     hỏi SPEC gửi M-Baton.
 *
 * Mốc so sánh là **`>=`**, không phải `>`: nghiệm thu 17.3 đòi "agent worker im
 * **30 phút**: Tổng quan hiện phiên đứng" — ở đúng phút thứ 30 phải là đứng. Cùng
 * cách đọc cho mốc 10 phút của d.194.
 */
export function trangThaiPhienDanXuat(
  phien: PhienLuu,
  bay_gio: number,
  nguong_ms: number,
): TrangThaiPhienDanXuat {
  const im_lang_ms = Math.max(0, bay_gio - phien.tin_hieu_cuoi_luc);

  /*
   * Đồng hồ 60 phút của 19.6 đếm từ **lúc hỏi** (`waiting_assigner_luc`), không
   * từ tín hiệu cuối — xem ghi chú ở `PhienLuu.waiting_assigner_luc`.
   */
  const cho_nguoi_giao_ms =
    phien.trang_thai === 'waiting_assigner'
      ? Math.max(0, bay_gio - (phien.waiting_assigner_luc ?? phien.tin_hieu_cuoi_luc))
      : null;

  const nen = {
    trang_thai_luu: phien.trang_thai,
    im_lang_ms,
    cho_nguoi_giao_ms,
    cho_nguoi_giao_qua_han:
      cho_nguoi_giao_ms !== null && cho_nguoi_giao_ms >= HAN_CHO_NGUOI_GIAO_CAN_CHU_Y_MS,
  };

  // 1. Dừng mà agent không xác nhận trong 10 phút → tự đóng (d.194).
  if (
    phien.trang_thai === 'stopping' &&
    phien.stopping_luc !== null &&
    bay_gio - phien.stopping_luc >= HAN_XAC_NHAN_DUNG_MS
  ) {
    return {
      ...nen,
      trang_thai: 'closed',
      can_ghi_lai: true,
      dong_vi_khong_xac_nhan_dung: true,
      ly_do_dong: LY_DO_DONG_KHONG_XAC_NHAN_DUNG,
    };
  }

  // 2. Quá ngưỡng không có tín hiệu → `stalled` (d.184). Chỉ từ `running`.
  if (phien.trang_thai === 'running' && im_lang_ms >= nguong_ms) {
    return {
      ...nen,
      trang_thai: 'stalled',
      // **Không ghi lại.** `stalled` là một kết luận về thời gian, hồi lại ngay
      // khi có tín hiệu mới (d.196 "phiên hồi lại rồi đứng lần nữa"). Ghi nó vào
      // DB là tạo một trạng thái phải có người đi xoá.
      can_ghi_lai: false,
      dong_vi_khong_xac_nhan_dung: false,
      ly_do_dong: null,
    };
  }

  return {
    ...nen,
    trang_thai: phien.trang_thai,
    can_ghi_lai: false,
    dong_vi_khong_xac_nhan_dung: false,
    ly_do_dong: null,
  };
}

/**
 * Phiên có đang bị tính **đứng** không — SPEC mục 6 d.184, 19.6.
 * Dùng cho "Cần chú ý" (mục 11 ý 4) và chỉ báo 🟡 của dự án (19.6).
 */
export function laPhienDung(phien: PhienLuu, bay_gio: number, nguong_ms: number): boolean {
  return trangThaiPhienDanXuat(phien, bay_gio, nguong_ms).trang_thai === 'stalled';
}

/* ================================================================== *
 * 5. Tín hiệu `STOP` — SPEC mục 0.1, mục 6 d.193, mục 13 (`baton heartbeat`)
 * ================================================================== */

/**
 * "Chủ bấm *Dừng* thì phiên sang `stopping`. **Lần gọi kế tiếp của agent nhận về
 * tín hiệu `STOP`**" — SPEC mục 6 d.193.
 *
 * Tín hiệu là của **trạng thái đã dẫn xuất**: phiên `stopping` quá 10 phút thì đã
 * `closed`, và một phiên đóng không gửi tín hiệu nào nữa (lệnh ghi lên nó bị từ
 * chối `SESSION_CLOSED` — d.195).
 */
export function tinHieuChoAgent(trang_thai: TrangThaiPhien): 'STOP'[] {
  return trang_thai === 'stopping' ? ['STOP'] : [];
}

/* ================================================================== *
 * 6. Trạng thái agent suy ra từ phiên — SPEC mục 3 d.98–103, mục 0.1
 * ================================================================== */

/**
 * Trạng thái phiên → trạng thái agent, cho **một** phiên.
 *
 * SPEC mục 3 cho 5 trạng thái agent và gắn 3 trong số đó với phiên:
 *   `busy` "có phiên **đang chạy**" · `waiting_owner` "có phiên **đang chờ một
 *   mục Cần Chủ**" · `stalled` "có phiên **bị đứng**" · `idle` "**không có phiên
 *   mở**" · `disabled` "chủ đã tắt agent".
 *
 * Ba trạng thái phiên còn lại (`waiting_assigner`, `stopping`, `error`) **không
 * có hàng nào** trong mục 3 — chỗ SPEC thiếu, câu hỏi gửi M-Baton. Chốt tạm:
 *   * `waiting_assigner` → `busy`: phiên vẫn sống, agent vẫn đang cầm việc, và
 *     19.6 nói thẳng nó "không bị tính đứng". `idle` thì sai hẳn ("không có phiên
 *     mở"), mà `waiting_owner` thì sai chỗ khác: nhãn của nó là "Chờ Chủ", và
 *     19.6 phân biệt rõ chờ **chủ** với chờ **người giao**.
 *   * `stopping` → `busy`: phiên còn mở, đang chờ agent gửi `result`/`error`.
 *   * `error` → `stalled` (nhãn "Đứng"): mục 11 ý 4 và 19.6 xếp "phiên **đứng
 *     hoặc lỗi**" vào **cùng một** dòng "Cần chú ý" / cùng một chỉ báo 🟡, nên
 *     gộp vào `stalled` giữ đúng ý "agent này cần người xem", trong khi `busy`
 *     ("Đang làm") sẽ nói dối chủ.
 */
const AGENT_TU_PHIEN = {
  running: 'busy',
  waiting_assigner: 'busy',
  stopping: 'busy',
  waiting_owner: 'waiting_owner',
  stalled: 'stalled',
  error: 'stalled',
  closed: null,
} as const satisfies Record<TrangThaiPhien, TrangThaiAgent | null>;

/**
 * Thứ tự ưu tiên khi agent có **nhiều** phiên mở cùng lúc — SPEC không nói, nên
 * dùng **đúng thứ tự liệt kê của mục 3** (`busy` → `waiting_owner` → `stalled` →
 * `idle`): chữ của SPEC đọc như một danh sách kiểm từ trên xuống, và `busy` trước
 * `stalled` là hướng đúng — một agent còn một phiên thật đang chạy thì nó **đang
 * làm**, dù một phiên khác đã đứng. Phiên đứng vẫn hiện riêng ở "Cần chú ý".
 */
const THU_TU_TRANG_THAI_AGENT = ['busy', 'waiting_owner', 'stalled'] as const;

/**
 * **Trạng thái agent (tự tính)** — SPEC mục 3 d.98–103.
 *
 * Vào: cờ `disabled` của agent, và trạng thái **đã dẫn xuất** của các phiên của
 * nó (dẫn xuất trước, vì một phiên `running` quá ngưỡng đã là `stalled`, và một
 * phiên `stopping` quá 10 phút đã là `closed`).
 *
 * `disabled` thắng mọi thứ: "Agent bị tắt gọi API sẽ **bị từ chối**", nên nó
 * không thể đang làm gì cả — kể cả khi còn một phiên chưa đóng trong DB.
 */
export function trangThaiAgentTuPhien(
  disabled: boolean,
  trang_thai_phien: readonly TrangThaiPhien[],
): TrangThaiAgent {
  if (disabled) return 'disabled';

  const ung_vien = new Set(
    trang_thai_phien
      .map((t): TrangThaiAgent | null => AGENT_TU_PHIEN[t])
      .filter((t) => t !== null),
  );
  for (const tt of THU_TU_TRANG_THAI_AGENT) {
    if (ung_vien.has(tt)) return tt;
  }
  // "`idle`: **không có phiên mở**" — SPEC mục 3.
  return 'idle';
}

/* ================================================================== *
 * 7. Kiểm mã
 * ================================================================== */

export function kiemTrangThaiPhien(trang_thai: unknown): TrangThaiPhien {
  if (!laMaHopLe('trang_thai_phien', trang_thai)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Trạng thái phiên không hợp lệ (SPEC mục 0.1).',
    });
  }
  return trang_thai;
}

export function kiemLoaiHoatDong(loai: unknown): LoaiHoatDong {
  if (!laMaHopLe('loai_hoat_dong', loai)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Loại hoạt động phải là thought, action, question, result hoặc error (SPEC mục 6).',
    });
  }
  return loai;
}

/* ================================================================== *
 * 8. Dòng hoạt động → trạng thái phiên — SPEC mục 6 d.190, d.193, 19.6
 * ================================================================== */

/**
 * **Phiên sau khi agent gửi một mục hoạt động.**
 *
 * Ba luật của SPEC gộp vào đúng một hàm thuần, vì cả ba đều là "loại mục nào thì
 * phiên thành gì", và để handler không có `if` trạng thái phiên nào của riêng nó:
 *
 *   1. **19.6** — "agent gửi hoạt động `question` thì phiên sang
 *      `waiting_assigner`".
 *   2. **d.190** — loại `error` là "agent **báo lỗi**", và d.185 định nghĩa
 *      `error` = "agent báo lỗi". Hai câu đó là một: gửi mục `error` là cách duy
 *      nhất agent đưa phiên vào `error`.
 *   3. **d.193** — phiên `stopping`: "agent phải ngưng việc và gửi một mục
 *      `result` hoặc `error`". Gửi xong là **xác nhận dừng**, nên phiên `closed`
 *      (d.180: phiên "đóng khi … bị **dừng**"). Không đóng ở đây thì đồng hồ 10
 *      phút của d.194 vẫn chạy và phiên đóng với lý do sai ("agent không xác nhận
 *      dừng") dù agent đã xác nhận.
 *
 * Thứ tự ưu tiên: `stopping` xét **trước**, vì d.193 nói thẳng mục `result`/
 * `error` lúc đang dừng là lời xác nhận — một mục `error` lúc đó không được đưa
 * phiên về `error` rồi treo đấy.
 *
 * Phiên `closed` không bao giờ tới được đây: `SESSION_CLOSED` (d.195) chặn trước.
 */
export interface PhienSauHoatDong {
  trang_thai: TrangThaiPhien;
  /** Khác trạng thái đang có → cần ghi. */
  doi: boolean;
  /** Đặt mốc `waiting_assigner_luc` (ms) khi vào `waiting_assigner`. */
  dat_waiting_assigner_luc: boolean;
  ly_do_dong: string | null;
}

export function phienSauHoatDong(
  trang_thai: TrangThaiPhien,
  loai: LoaiHoatDong,
): PhienSauHoatDong {
  const ra = (
    moi: TrangThaiPhien,
    them: Partial<Omit<PhienSauHoatDong, 'trang_thai' | 'doi'>> = {},
  ): PhienSauHoatDong => ({
    trang_thai: moi,
    doi: moi !== trang_thai,
    dat_waiting_assigner_luc: them.dat_waiting_assigner_luc ?? false,
    ly_do_dong: them.ly_do_dong ?? null,
  });

  // 3. `stopping` + `result`/`error` = agent xác nhận dừng (d.193).
  if (trang_thai === 'stopping' && (loai === 'result' || loai === 'error')) {
    return ra('closed', { ly_do_dong: LY_DO_DONG_DA_XAC_NHAN_DUNG });
  }

  // 1. `question` → `waiting_assigner` (19.6).
  if (loai === 'question') {
    /*
     * **`waiting_owner` thắng.** Phiên đang chờ một mục Cần Chủ (d.183) thì nó
     * "**không bao giờ** bị tính đứng" và 19.6 nói ngưỡng tính lại khi mục đó
     * được xử lý — đưa nó sang `waiting_assigner` là bỏ mất mối gắn với mục T
     * (CHECK `trang_thai <> 'waiting_owner' OR can_chu_id IS NOT NULL` của 0006
     * sẽ chặn ở DB). Phiên đang `stopping` cũng giữ nguyên: nó đang phải dừng,
     * không phải đang chờ câu trả lời để làm tiếp.
     */
    if (trang_thai === 'waiting_owner' || trang_thai === 'stopping') return ra(trang_thai);
    return ra('waiting_assigner', { dat_waiting_assigner_luc: true });
  }

  // 2. `error` → `error` (d.185 + d.190).
  if (loai === 'error') {
    if (trang_thai === 'waiting_owner') return ra(trang_thai);
    return ra('error');
  }

  /*
   * Mọi mục khác (`thought`, `action`, `result`) **không** đổi trạng thái. Riêng
   * một mục bất kỳ lúc đang `waiting_assigner`: agent vẫn đang chờ trả lời, nên
   * nó chỉ về `running` khi **có câu trả lời** (19.6: "**có câu trả lời** thì
   * phiên về `running`"), không phải khi agent tự nói thêm.
   */
  return ra(trang_thai);
}

/**
 * **Có câu trả lời thì phiên về `running`** — SPEC 19.6, 19.12 câu 2.
 *
 * Chỉ phiên đang `waiting_assigner` đổi: trả lời một câu hỏi của phiên đã sang
 * `error` hay `stopping` không xoá hai trạng thái đó — chúng nói về việc khác.
 */
export function phienSauTraLoi(trang_thai: TrangThaiPhien): {
  trang_thai: TrangThaiPhien;
  doi: boolean;
} {
  return trang_thai === 'waiting_assigner'
    ? { trang_thai: 'running', doi: true }
    : { trang_thai, doi: false };
}

/* ================================================================== *
 * 9. Kế hoạch của phiên — SPEC mục 6 d.191
 * ================================================================== */

/** Một bước trong kế hoạch của phiên. */
export interface BuocKeHoach {
  noi_dung: string;
  trang_thai: TrangThaiBuoc;
}

/** "danh sách bước" — giới hạn để một lệnh không dựng nghìn dòng. */
export const SO_BUOC_KE_HOACH_TOI_DA = 200;
export const DAI_BUOC_KE_HOACH_TOI_DA = 2000;

/**
 * Kiểm **toàn bộ** danh sách bước — SPEC mục 6 d.191: "Agent gửi lại **toàn bộ
 * danh sách** mỗi lần cập nhật."
 *
 * Nên ngữ nghĩa của lệnh là **thay cả danh sách**, không phải sửa từng bước: hàm
 * này nhận một mảng và trả một mảng, không có đường nào nhận "bước thứ 3 đổi
 * thành xong". Danh sách **rỗng được**: agent xoá kế hoạch của mình là hợp lệ.
 */
export function kiemKeHoach(ds: unknown): BuocKeHoach[] {
  if (!Array.isArray(ds)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Kế hoạch phải là một danh sách bước (SPEC mục 6).',
    });
  }
  if (ds.length > SO_BUOC_KE_HOACH_TOI_DA) {
    throw new BatonError('INVALID_INPUT', {
      message: `Kế hoạch tối đa ${String(SO_BUOC_KE_HOACH_TOI_DA)} bước.`,
    });
  }

  return ds.map((b, i): BuocKeHoach => {
    const nguon = (typeof b === 'string' ? { noi_dung: b } : b) as Record<string, unknown> | null;
    if (nguon === null || typeof nguon !== 'object') {
      throw new BatonError('INVALID_INPUT', {
        message: `Bước ${String(i + 1)} của kế hoạch phải là chữ hoặc một object.`,
      });
    }

    const noi_dung = typeof nguon['noi_dung'] === 'string' ? nguon['noi_dung'].trim() : '';
    if (noi_dung.length === 0 || noi_dung.length > DAI_BUOC_KE_HOACH_TOI_DA) {
      throw new BatonError('INVALID_INPUT', {
        message: `Bước ${String(i + 1)} phải có 1–${String(DAI_BUOC_KE_HOACH_TOI_DA)} ký tự.`,
      });
    }

    const tt = nguon['trang_thai'] ?? TRANG_THAI_BUOC_MAC_DINH;
    if (!laMaHopLe('trang_thai_buoc', tt)) {
      throw new BatonError('INVALID_INPUT', {
        message: `Bước ${String(i + 1)}: trạng thái phải là pending, in_progress, done hoặc canceled (SPEC mục 6).`,
      });
    }
    return { noi_dung, trang_thai: tt };
  });
}

/* ================================================================== *
 * 10. Cảnh báo "phiên đứng hoặc lỗi" — SPEC mục 6 d.196
 * ================================================================== */

/**
 * "Phiên chuyển sang `stalled` **hoặc** `error` thì bắn **1** thông báo (mục 12).
 * Phiên **hồi lại rồi đứng lần nữa** thì bắn **lại**." — SPEC mục 6 d.196.
 *
 * **Vì sao luật này cần một mốc, không một cờ.** `stalled` là **dẫn xuất, không
 * ghi DB** (19.12 câu 42), nên **không có sự kiện nào** để bắn tin — ai phát hiện
 * "lần chuyển" là chốt của 19.12 câu 46: một **Cron Trigger quét mỗi 5 phút**. Mà
 * một đường quét định kỳ thì cần chỗ nhớ "đã bắn chưa", và một cờ boolean không
 * đủ: "hồi lại rồi đứng **lần nữa**" không phân biệt được với "vẫn đang đứng từ
 * lần trước", nên tin sẽ **bắn lặp mỗi 5 phút** suốt thời gian phiên còn đứng.
 *
 * Mốc `canh_bao_tin_hieu_luc` = **giá trị mà tin gần nhất đã bắn cho**. Giá trị
 * đó **khác nhau theo hai lý do**, vì "lần chuyển sang" của hai lý do khác nhau:
 *
 *   * `stalled` → mốc là **`tin_hieu_cuoi_luc`**. `stalled` là dẫn xuất từ im
 *     lặng, nên một tín hiệu mới **đưa phiên ra khỏi** `stalled`: đang đứng và đã
 *     bắn thì mốc **bằng** tín hiệu cuối → không bắn nữa (đúng "1 thông báo"), dù
 *     bao nhiêu người mở Tổng quan; agent sống lại rồi im tiếp thì tín hiệu cuối
 *     đã nhích → mốc **khác** → bắn lại (đúng câu 2 của d.196). (Chữ "mở Tổng
 *     quan" ở đây là của lượt 4; 19.12 câu 46 đã chốt rằng việc phát hiện **không**
 *     dựa vào điều đó — nhưng lý lẽ của mốc không đổi, chỉ đổi người quét.)
 *   * `error` → mốc là **`error_luc`** (lúc chuyển sang `error`), **không** phải
 *     tín hiệu cuối. `error` là trạng thái **ghi trong DB**: nhịp tim hay mục
 *     `thought` nhích `tin_hieu_cuoi_luc` mà **không** đưa phiên ra khỏi `error`,
 *     nên gắn mốc vào tín hiệu cuối thì **cùng một lần lỗi** bị bắn lại mỗi lần
 *     có ai mở Tổng quan — lỗi reviewer lượt 4 nêu (`cau-hoi-spec.md` #50). Phiên
 *     ra khỏi `error` rồi vào lại → `error_luc` mới → bắn lại.
 *
 * Dòng cũ trước migration 0008 không có `error_luc`; khi đó rơi về
 * `tin_hieu_cuoi_luc` để vẫn có một mốc để so.
 *
 * **Hàm này không biết ai gọi nó.** Nó chỉ trả lời "có cần bắn không", `bay_gio`
 * vẫn qua tham số — nên nó chạy được cả ở Worker (Cron chọn dòng) và **lần hai**
 * bên trong cửa ghi (nơi quyết định thật, xem `WorkspaceGate.ghiMocCanhBao`).
 */
export interface QuyetDinhCanhBao {
  can_ban: boolean;
  /** `stalled` hay `error` — đi vào nội dung tin của mục 12. */
  ly_do: Extract<TrangThaiPhien, 'stalled' | 'error'> | null;
  /** Giá trị cần ghi vào `canh_bao_tin_hieu_luc` sau khi bắn. */
  moc_moi: number | null;
}

/**
 * Mốc của **lần chuyển sang** trạng thái đang xét — xem khối ghi chú trên.
 * `stalled`: tín hiệu cuối. `error`: lúc vào `error` (rơi về tín hiệu cuối cho
 * dòng dựng trước migration 0008).
 */
export function mocLanChuyenSang(
  phien: PhienLuu,
  ly_do: Extract<TrangThaiPhien, 'stalled' | 'error'>,
): number {
  if (ly_do === 'error') return phien.error_luc ?? phien.tin_hieu_cuoi_luc;
  return phien.tin_hieu_cuoi_luc;
}

export function canhBaoDung(phien: PhienLuu, trang_thai_dan_xuat: TrangThaiPhien): QuyetDinhCanhBao {
  if (trang_thai_dan_xuat !== 'stalled' && trang_thai_dan_xuat !== 'error') {
    return { can_ban: false, ly_do: null, moc_moi: null };
  }
  const moc = mocLanChuyenSang(phien, trang_thai_dan_xuat);
  const da_ban = phien.canh_bao_tin_hieu_luc ?? null;
  if (da_ban === moc) {
    return { can_ban: false, ly_do: trang_thai_dan_xuat, moc_moi: null };
  }
  return { can_ban: true, ly_do: trang_thai_dan_xuat, moc_moi: moc };
}
