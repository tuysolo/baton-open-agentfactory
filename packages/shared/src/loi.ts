/**
 * Mã lỗi, thông điệp tiếng Việt và mã HTTP — SPEC mục 13 (+ mục 19.10).
 *
 * Thân lỗi API luôn đúng dạng: `{ "error": "<CODE>", "message": "<tiếng Việt>" }`.
 *
 * Phân lớp HTTP theo SPEC mục 13:
 *   401 token sai · 403 không có quyền · 404 không tìm thấy (**cũng dùng khi đối
 *   tượng ngoài phạm vi, để không lộ sự tồn tại**) · 409 xung đột trạng thái ·
 *   422 lỗi nghiệp vụ · 429 kèm `Retry-After`.
 */

export interface DinhNghiaLoi {
  /** Mã HTTP trả về. */
  readonly http: number;
  /** Thông điệp tiếng Việt mặc định (ghi đè được khi ném lỗi). */
  readonly message: string;
}

export const BANG_LOI = {
  /* 401 — token sai */
  INVALID_TOKEN: {
    http: 401,
    message: 'Token không hợp lệ hoặc đã hết hiệu lực.',
  },

  /* 403 — không có quyền */
  FORBIDDEN: {
    http: 403,
    message: 'Không có quyền thực hiện việc này.',
  },

  /* 404 — không tìm thấy; cũng dùng khi đối tượng ngoài phạm vi */
  NOT_FOUND: {
    http: 404,
    message: 'Không tìm thấy.',
  },

  /* 409 — xung đột trạng thái */
  CHILDREN_OPEN: {
    http: 409,
    message: 'Ticket cha chưa vào Xong được: còn ticket con chưa kết.',
  },
  PROJECT_NOT_ACCEPTING: {
    http: 409,
    message: 'Dự án đang tạm dừng hoặc lưu trữ, không nhận việc mới.',
  },
  SESSION_CLOSED: {
    http: 409,
    message: 'Phiên đã đóng, không ghi thêm được.',
  },
  ALREADY_RESOLVED: {
    http: 409,
    message: 'Mục đã được xử lý. Mở lại trước khi xử lý tiếp.',
  },
  /*
   * Hai mã dưới **không có trong SPEC**. Bảng mục 13 tự ghi là "mã lỗi **tối
   * thiểu**", và SPEC mục 5 có hai luật là xung đột trạng thái thật (409) mà
   * không mã nào đang có nói đúng việc:
   *   * "Mỗi ticket tối đa 1 lượt mở" (mục 5 dòng 157, 19.1) → `ASSIGNMENT_OPEN`.
   *   * "Nhận việc": chỉ lượt `pending` nhận được → `ASSIGNMENT_NOT_PENDING`.
   * Mượn `ALREADY_RESOLVED` (của mục Cần Chủ, mục 19.10) thì thông điệp và ngữ
   * nghĩa đều sai. Xem câu hỏi SPEC gửi M-Baton (phần 2 lượt 1).
   */
  ASSIGNMENT_OPEN: {
    http: 409,
    message: 'Ticket đã có một lượt giao đang mở cùng loại.',
  },
  ASSIGNMENT_NOT_PENDING: {
    http: 409,
    message: 'Lượt giao không còn ở trạng thái chờ nhận.',
  },
  /*
   * Cùng lý do: mục 5 còn ba luật "lệnh này chỉ chạy ở trạng thái kia" mà không
   * mã nào đang có nói đúng việc — nộp báo cáo cần lượt `in_progress`, nghiệm
   * thu cần lượt `submitted`, huỷ cần lượt chưa kết. **Một** mã chung cho cả ba,
   * kèm thông điệp tiếng Việt riêng ở từng chỗ: ba mã riêng thì bảng lỗi của
   * mục 13 phình ra vì chuyện cài đặt, không vì chuyện người dùng thấy.
   */
  ASSIGNMENT_STATE_INVALID: {
    http: 409,
    message: 'Lượt giao không ở trạng thái cho phép việc này.',
  },

  /* 422 — lỗi nghiệp vụ */
  INVALID_INPUT: {
    http: 422,
    message: 'Dữ liệu nhập không hợp lệ.',
  },
  EVIDENCE_REQUIRED: {
    http: 422,
    message: 'Chưa đủ bằng chứng để vào Xong.',
  },
  REASON_REQUIRED: {
    http: 422,
    message: 'Việc này bắt buộc có lý do.',
  },
  INVALID_DUPLICATE_TARGET: {
    http: 422,
    message: 'Ticket gốc để đánh trùng không hợp lệ.',
  },
  OPTIONS_REQUIRED: {
    http: 422,
    message: 'Mục loại Quyết định bắt buộc có 2–5 phương án.',
  },
  COMMAND_REQUIRED: {
    http: 422,
    message: 'Mục loại Chủ chạy lệnh bắt buộc có lệnh hoặc script.',
  },
  REVIEWER_IS_WORKER: {
    http: 422,
    message: 'Người gửi review phải khác người làm của ticket này.',
  },

  /* 429 — quá giới hạn, kèm Retry-After */
  RATE_LIMITED: {
    http: 429,
    message: 'Quá giới hạn 600 request mỗi phút. Thử lại sau.',
  },

  /* 500 — lỗi không lường trước ------------------------------------- *
   * SPEC mục 13 **không nêu** mã này (bảng mã lỗi của SPEC chỉ là "mã lỗi tối
   * thiểu"). Vẫn phải có một mã riêng: lỗi không lường trước **không được** tái
   * dùng mã nghiệp vụ. Dùng `INVALID_INPUT`/422 thì CLI hiểu là "lỗi nghiệp vụ"
   * và thoát mã 1, trong khi đúng ra phải là mã 2 "lỗi xác thực hoặc mạng"
   * (SPEC mục 13 bảng mã thoát) — agent sẽ tưởng dữ liệu mình gửi sai và tự sửa
   * mãi, thay vì thử lại hoặc báo người. Xem `decisions.md` 01/10.
   * Thông điệp **không bao giờ** mang chi tiết lỗi gốc (SPEC mục 15). */
  INTERNAL: {
    http: 500,
    message: 'Máy chủ gặp lỗi không lường trước.',
  },
} as const satisfies Record<string, DinhNghiaLoi>;

export type MaLoi = keyof typeof BANG_LOI;

/** Thân lỗi API — SPEC mục 13. */
export interface ThanLoi {
  error: MaLoi;
  message: string;
}

export function laMaLoi(ma: unknown): ma is MaLoi {
  return typeof ma === 'string' && Object.prototype.hasOwnProperty.call(BANG_LOI, ma);
}

export function httpCuaLoi(ma: MaLoi): number {
  return BANG_LOI[ma].http;
}

export function thongDiepCuaLoi(ma: MaLoi): string {
  return BANG_LOI[ma].message;
}

export interface TuyChonBatonError {
  /** Ghi đè thông điệp tiếng Việt mặc định. */
  message?: string;
  /** Số giây cho header `Retry-After` (bắt buộc với `RATE_LIMITED`). */
  retryAfter?: number;
  /** Dữ liệu phụ cho log; **không** đưa ra thân response. */
  chiTiet?: unknown;
}

/**
 * Lỗi nghiệp vụ của Baton. Mọi tầng ném lớp này; middleware ở mục dưới biến nó
 * thành response `{ error, message }` cùng mã HTTP đúng.
 */
export class BatonError extends Error {
  readonly ma: MaLoi;
  readonly http: number;
  readonly retryAfter: number | undefined;
  readonly chiTiet: unknown;

  constructor(ma: MaLoi, tuyChon: TuyChonBatonError = {}) {
    super(tuyChon.message ?? BANG_LOI[ma].message);
    this.name = 'BatonError';
    this.ma = ma;
    this.http = BANG_LOI[ma].http;
    this.retryAfter = tuyChon.retryAfter;
    this.chiTiet = tuyChon.chiTiet;
  }

  /** Thân response đúng dạng SPEC mục 13. */
  than(): ThanLoi {
    return { error: this.ma, message: this.message };
  }

  static la(e: unknown): e is BatonError {
    return e instanceof BatonError;
  }
}

/**
 * Mã thoát của CLI — SPEC mục 13 + 19.9.
 * 0 xong · 1 lỗi nghiệp vụ · 2 lỗi xác thực hoặc mạng · 3 nhận `STOP` ·
 * 4 hết thời gian chờ.
 */
export const MA_THOAT = {
  xong: 0,
  loi_nghiep_vu: 1,
  loi_xac_thuc_hoac_mang: 2,
  nhan_stop: 3,
  het_thoi_gian_cho: 4,
} as const;
export type MaThoat = (typeof MA_THOAT)[keyof typeof MA_THOAT];

/**
 * **Mã thoát CLI của từng mã lỗi API — bảng duy nhất.**
 *
 * Mã **2** ("lỗi xác thực hoặc mạng") dùng cho những lỗi agent **không sửa được
 * bằng cách đổi dữ liệu gửi lên**: token sai (`INVALID_TOKEN`), quá giới hạn
 * (`RATE_LIMITED` — phải **chờ**, không phải sửa lệnh), và lỗi máy chủ
 * (`INTERNAL` — ra mã 1 thì agent tưởng dữ liệu mình gửi sai và đi sửa dữ liệu
 * mãi). Hai quyết định đó đã chốt ở `decisions.md` 01/10. Còn lại là mã **1**
 * "lỗi nghiệp vụ (in mã lỗi)" — SPEC mục 13 d.380.
 *
 * Viết **từng mã một** trong một `Record<MaLoi, MaThoat>` thay vì "một danh sách
 * mã 2, còn lại mặc định 1": với bảng đầy đủ, thêm một mã lỗi mới mà quên ánh xạ
 * là **lỗi biên dịch**; với danh sách + mặc định, mã mới âm thầm rơi về 1 — kể cả
 * khi nó là một lỗi hạ tầng mà agent không được phép đi sửa dữ liệu. Cùng nếp với
 * `TRUONG_CLIENT` của `api/src/index.ts`.
 */
const MA_THOAT_CUA_LOI = {
  /* 401 / 429 / 500 — không sửa được bằng cách đổi dữ liệu gửi lên. */
  INVALID_TOKEN: MA_THOAT.loi_xac_thuc_hoac_mang,
  RATE_LIMITED: MA_THOAT.loi_xac_thuc_hoac_mang,
  INTERNAL: MA_THOAT.loi_xac_thuc_hoac_mang,

  /* 403 / 404 / 409 / 422 — lỗi nghiệp vụ: agent đọc mã lỗi rồi đổi việc mình làm. */
  FORBIDDEN: MA_THOAT.loi_nghiep_vu,
  NOT_FOUND: MA_THOAT.loi_nghiep_vu,
  CHILDREN_OPEN: MA_THOAT.loi_nghiep_vu,
  PROJECT_NOT_ACCEPTING: MA_THOAT.loi_nghiep_vu,
  SESSION_CLOSED: MA_THOAT.loi_nghiep_vu,
  ALREADY_RESOLVED: MA_THOAT.loi_nghiep_vu,
  ASSIGNMENT_OPEN: MA_THOAT.loi_nghiep_vu,
  ASSIGNMENT_NOT_PENDING: MA_THOAT.loi_nghiep_vu,
  ASSIGNMENT_STATE_INVALID: MA_THOAT.loi_nghiep_vu,
  INVALID_INPUT: MA_THOAT.loi_nghiep_vu,
  EVIDENCE_REQUIRED: MA_THOAT.loi_nghiep_vu,
  REASON_REQUIRED: MA_THOAT.loi_nghiep_vu,
  INVALID_DUPLICATE_TARGET: MA_THOAT.loi_nghiep_vu,
  OPTIONS_REQUIRED: MA_THOAT.loi_nghiep_vu,
  COMMAND_REQUIRED: MA_THOAT.loi_nghiep_vu,
  REVIEWER_IS_WORKER: MA_THOAT.loi_nghiep_vu,
} as const satisfies Record<MaLoi, MaThoat>;

export function maThoatCuaLoi(ma: MaLoi): MaThoat {
  return MA_THOAT_CUA_LOI[ma];
}
